import { neon } from "@neondatabase/serverless";
import { format, subDays } from "date-fns";

const DATABASE_URL = process.env.DATABASE_URL!;
const COM_API_BASE = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";

async function fetchPedestrianDay(date: string): Promise<any[]> {
  const results: any[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({
      where: `sensing_date = date'${date}'`,
      order_by: "hourday ASC",
      limit: String(limit),
      offset: String(offset),
    });

    const res = await fetch(
      `${COM_API_BASE}/pedestrian-counting-system-monthly-counts-per-hour/records?${params}`
    );

    if (!res.ok) {
      console.error(`API error for ${date}: ${res.status}`);
      break;
    }

    const data = await res.json();
    results.push(...data.results);

    if (data.results.length < limit) break;
    offset += limit;
  }

  return results;
}

async function main() {
  if (!DATABASE_URL) {
    console.error("Missing DATABASE_URL env var");
    console.error("Run with: npx dotenv-cli -e .env.local -- npx tsx scripts/backfill.ts");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  const daysBack = parseInt(process.argv[2] || "90", 10);
  const startDay = parseInt(process.argv[3] || "0", 10);

  console.log(`Backfilling ${daysBack} days, starting from day ${startDay}`);

  for (let i = startDay; i < daysBack; i++) {
    const date = format(subDays(new Date(), i), "yyyy-MM-dd");
    console.log(`[${i + 1}/${daysBack}] Fetching ${date}...`);

    try {
      const records = await fetchPedestrianDay(date);

      if (records.length === 0) {
        console.log(`  No records for ${date}`);
        continue;
      }

      const rows = records.map((r: any) => {
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

      // Batch insert in chunks of 100 (Neon serverless has param limits)
      for (let j = 0; j < rows.length; j += 100) {
        const chunk = rows.slice(j, j + 100);
        const placeholders = chunk
          .map((_, idx) => {
            const base = idx * 5;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
          })
          .join(", ");

        const flatParams = chunk.flatMap((v) => [
          v.sensor_id,
          v.counted_at,
          v.hour_of_day,
          v.day_of_week,
          v.count,
        ]);

        const query = `INSERT INTO pedestrian_counts (sensor_id, counted_at, hour_of_day, day_of_week, count)
           VALUES ${placeholders}
           ON CONFLICT (sensor_id, counted_at) DO NOTHING`;
        await sql.query(query, flatParams);
      }

      console.log(`  Inserted ${records.length} records`);

      // Delay to stay under API limits
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`  Error for ${date}:`, err);
    }
  }

  console.log("Backfill complete!");
}

main().catch(console.error);
