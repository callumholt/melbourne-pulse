import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchPedestrianSince, fetchMicroclimateData } from "@/lib/com-api";
import { detectAnomalies, storeAnomalies } from "@/lib/anomaly-detection";
import { findNearestPrecinct } from "@/lib/constants";
import { format, subDays } from "date-fns";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// CoM backfills a day's hours over the following day or two, so re-read a
// trailing window each run rather than only today.
const INGEST_WINDOW_DAYS = 3;

type PedestrianRecord = Awaited<ReturnType<typeof fetchPedestrianSince>>[number];

/**
 * Insert any sensor present in the feed but missing from the sensors table,
 * assigning it to the nearest precinct. Returns the ids that were added.
 */
async function registerUnknownSensors(
  sql: ReturnType<typeof getDb>,
  records: PedestrianRecord[],
): Promise<number[]> {
  const seen = new Map<number, PedestrianRecord>();
  for (const r of records) {
    if (!seen.has(r.location_id)) seen.set(r.location_id, r);
  }

  const ids = [...seen.keys()];
  const known = await sql`SELECT sensor_id FROM sensors WHERE sensor_id = ANY(${ids})`;
  const knownIds = new Set(known.map((row) => Number(row.sensor_id)));
  const missing = ids.filter((id) => !knownIds.has(id));

  for (const id of missing) {
    const r = seen.get(id)!;
    const lat = r.location?.lat ?? -37.8136;
    const lon = r.location?.lon ?? 144.9631;
    await sql`
      INSERT INTO sensors (sensor_id, sensor_name, lat, lon, status, precinct_id)
      VALUES (${id}, ${r.sensor_name || `Sensor ${id}`}, ${lat}, ${lon}, 'A', ${findNearestPrecinct(lat, lon)})
      ON CONFLICT (sensor_id) DO NOTHING
    `;
  }

  return missing;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") === "true";

  if (!isVercelCron) {
    const secret = req.nextUrl.searchParams.get("secret") || authHeader?.replace("Bearer ", "");
    if (secret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  const start = Date.now();
  const sql = getDb();
  const from = format(subDays(new Date(), INGEST_WINDOW_DAYS), "yyyy-MM-dd");

  try {
    const records = await fetchPedestrianSince(from);

    if (records.length === 0) {
      await sql`
        INSERT INTO ingestion_log (dataset, records_fetched, records_inserted, records_skipped, duration_ms)
        VALUES ('pedestrian_counts', 0, 0, 0, ${Date.now() - start})
      `;
      return NextResponse.json({ message: "No records found", from });
    }

    // The counts feed occasionally introduces a sensor before it appears in our
    // sensors table. Without this, the foreign key rejects the whole batch and
    // ingestion silently stalls, so register any unknown sensor first.
    const newSensors = await registerUnknownSensors(sql, records);

    // Transform using actual CoM API fields
    const rows = records.map((r) => {
      // Build a timestamp from sensing_date + hourday
      const countedAt = `${r.sensing_date}T${String(r.hourday).padStart(2, "0")}:00:00`;
      const dt = new Date(countedAt);
      return {
        sensor_id: r.location_id,
        counted_at: countedAt,
        hour_of_day: r.hourday,
        day_of_week: dt.getDay(),
        count: r.pedestriancount,
      };
    });

    let inserted = 0;
    const batchSize = 100;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const placeholders = batch
        .map((_, idx) => {
          const base = idx * 5;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        })
        .join(", ");

      const flatParams = batch.flatMap((v) => [
        v.sensor_id,
        v.counted_at,
        v.hour_of_day,
        v.day_of_week,
        v.count,
      ]);

      // RETURNING is what makes the row count observable — without it the driver
      // hands back an empty array and every run logs 0 inserted, which hides a
      // dead ingest behind numbers that look identical to a healthy one.
      const query = `INSERT INTO pedestrian_counts (sensor_id, counted_at, hour_of_day, day_of_week, count)
         VALUES ${placeholders}
         ON CONFLICT (sensor_id, counted_at) DO NOTHING
         RETURNING 1`;
      const result = await sql.query(query, flatParams);

      inserted += result.length ?? 0;
    }

    const skipped = rows.length - inserted;
    const durationMs = Date.now() - start;

    await sql`
      INSERT INTO ingestion_log (dataset, records_fetched, records_inserted, records_skipped, duration_ms)
      VALUES ('pedestrian_counts', ${records.length}, ${inserted}, ${skipped}, ${durationMs})
    `;

    // Also ingest microclimate data
    let microInserted = 0;
    try {
      const microRecords = await fetchMicroclimateData();
      const microBatchSize = 50;

      for (let i = 0; i < microRecords.length; i += microBatchSize) {
        const batch = microRecords.slice(i, i + microBatchSize);
        const placeholders = batch
          .map((_, idx) => {
            const base = idx * 6;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
          })
          .join(", ");

        const params = batch.flatMap((r) => [
          r.site_id,
          r.site_description,
          r.type,
          r.local_time,
          r.value,
          r.units,
        ]);

        const microResult = await sql.query(
          `INSERT INTO microclimate_readings (site_id, site_description, type, recorded_at, value, units)
           VALUES ${placeholders}
           ON CONFLICT (site_id, recorded_at, type) DO NOTHING
           RETURNING 1`,
          params,
        );
        microInserted += microResult.length ?? 0;
      }
    } catch (microErr) {
      console.error("Microclimate ingestion error:", microErr);
    }

    // Run anomaly detection after ingestion. Failures here must not fail the
    // whole ingest, but they do get reported: this step silently swallowed a
    // missing-table error on every run for months while reporting 0 anomalies,
    // which is indistinguishable from a healthy run that found nothing.
    let anomalyCount = 0;
    let anomalyError: string | null = null;
    try {
      const anomalies = await detectAnomalies();
      await storeAnomalies(anomalies);
      anomalyCount = anomalies.length;
    } catch (anomalyErr) {
      anomalyError = anomalyErr instanceof Error ? anomalyErr.message : "Unknown error";
      console.error("Anomaly detection error:", anomalyErr);
    }

    return NextResponse.json({
      message: "Ingestion complete",
      from,
      fetched: records.length,
      new_sensors: newSensors,
      inserted,
      skipped,
      duration_ms: durationMs,
      microclimate_inserted: microInserted,
      anomalies_detected: anomalyCount,
      anomaly_error: anomalyError,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";

    await sql`
      INSERT INTO ingestion_log (dataset, records_fetched, records_inserted, records_skipped, duration_ms, error)
      VALUES ('pedestrian_counts', 0, 0, 0, ${Date.now() - start}, ${error})
    `.catch(() => {});

    return NextResponse.json({ error }, { status: 500 });
  }
}
