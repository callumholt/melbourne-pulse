import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchPedestrianData } from "@/lib/com-api";
import { format } from "date-fns";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
  const today = format(new Date(), "yyyy-MM-dd");

  try {
    const records = await fetchPedestrianData(today);

    if (records.length === 0) {
      await sql`
        INSERT INTO ingestion_log (dataset, records_fetched, records_inserted, records_skipped, duration_ms)
        VALUES ('pedestrian_counts', 0, 0, 0, ${Date.now() - start})
      `;
      return NextResponse.json({ message: "No records found for today", date: today });
    }

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

      const query = `INSERT INTO pedestrian_counts (sensor_id, counted_at, hour_of_day, day_of_week, count)
         VALUES ${placeholders}
         ON CONFLICT (sensor_id, counted_at) DO NOTHING`;
      const result = await sql.query(query, flatParams);

      inserted += result.length ?? 0;
    }

    const skipped = rows.length - inserted;
    const durationMs = Date.now() - start;

    await sql`
      INSERT INTO ingestion_log (dataset, records_fetched, records_inserted, records_skipped, duration_ms)
      VALUES ('pedestrian_counts', ${records.length}, ${inserted}, ${skipped}, ${durationMs})
    `;

    return NextResponse.json({
      message: "Ingestion complete",
      date: today,
      fetched: records.length,
      inserted,
      skipped,
      duration_ms: durationMs,
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
