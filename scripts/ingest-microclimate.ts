import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { fetchMicroclimateData } from "../src/lib/com-api";

/**
 * Ingest microclimate (weather) data from City of Melbourne API.
 * Run via: npx tsx scripts/ingest-microclimate.ts
 * Or triggered from the ingest API route.
 */
async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Fetching microclimate data from CoM API...");
  const records = await fetchMicroclimateData();
  console.log(`Fetched ${records.length} records`);

  if (records.length === 0) {
    console.log("No records to insert");
    return;
  }

  let inserted = 0;
  const batchSize = 50;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
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

    const result = await sql.query(
      `INSERT INTO microclimate_readings (site_id, site_description, type, recorded_at, value, units)
       VALUES ${placeholders}
       ON CONFLICT (site_id, recorded_at, type) DO NOTHING`,
      params,
    );
    inserted += result.length ?? 0;
  }

  console.log(`Inserted ${inserted} microclimate records (${records.length - inserted} skipped)`);
}

main().catch(console.error);
