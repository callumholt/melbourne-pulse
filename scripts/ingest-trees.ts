import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { fetchAllTrees } from "../src/lib/com-api";

/**
 * Ingest urban forest tree data from City of Melbourne API.
 * This is a one-off/periodic script (trees don't change frequently).
 * Run via: npx tsx scripts/ingest-trees.ts
 */

// Map CoM precinct names to our precinct IDs
const PRECINCT_MAP: Record<string, string> = {
  "CBD - Loss": "cbd-core",
  "CBD - North": "cbd-core",
  "CBD - South": "cbd-core",
  "CBD - East": "cbd-core",
  "CBD - West": "cbd-core",
  "CBD": "cbd-core",
  "Southbank": "southbank",
  "Docklands": "docklands",
  "Carlton": "carlton",
  "Carlton North": "carlton",
  "Chinatown": "chinatown",
  "Flagstaff": "flagstaff",
  "Parliament": "parliament",
  "St Kilda Road": "st-kilda-rd",
  "South Yarra": "st-kilda-rd",
  "Queen Victoria Market": "qvm",
};

function mapPrecinctId(precinctName: string): string | null {
  // Try exact match first
  if (PRECINCT_MAP[precinctName]) return PRECINCT_MAP[precinctName];

  // Try partial match
  const lower = precinctName.toLowerCase();
  if (lower.includes("cbd") || lower.includes("central")) return "cbd-core";
  if (lower.includes("southbank")) return "southbank";
  if (lower.includes("dockland")) return "docklands";
  if (lower.includes("carlton")) return "carlton";
  if (lower.includes("chinatown")) return "chinatown";
  if (lower.includes("flagstaff")) return "flagstaff";
  if (lower.includes("parliament")) return "parliament";
  if (lower.includes("st kilda") || lower.includes("south yarra")) return "st-kilda-rd";
  if (lower.includes("queen vic") || lower.includes("qvm")) return "qvm";
  if (lower.includes("federation") || lower.includes("fed sq")) return "fed-square";

  return null;
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Fetching tree data from CoM API (this may take a while)...");
  const trees = await fetchAllTrees();
  console.log(`Fetched ${trees.length} trees`);

  let inserted = 0;
  let mapped = 0;
  const batchSize = 100;

  for (let i = 0; i < trees.length; i += batchSize) {
    const batch = trees.slice(i, i + batchSize);

    for (const t of batch) {
      if (!t.latitude || !t.longitude) continue;

      const precinctId = mapPrecinctId(t.precinct ?? "");
      if (precinctId) mapped++;

      await sql`
        INSERT INTO trees (com_id, common_name, scientific_name, genus, family,
          diameter_breast_height, year_planted, age_description, useful_life,
          useful_life_value, precinct, precinct_id, located_in, lat, lon)
        VALUES (${t.com_id}, ${t.common_name}, ${t.scientific_name}, ${t.genus},
          ${t.family}, ${t.diameter_breast_height}, ${t.year_planted},
          ${t.age_description}, ${t.useful_life_expectency},
          ${t.useful_life_expectency_value ?? null}, ${t.precinct}, ${precinctId},
          ${t.located_in}, ${t.latitude}, ${t.longitude})
        ON CONFLICT (com_id) DO UPDATE SET
          common_name = EXCLUDED.common_name,
          useful_life = EXCLUDED.useful_life,
          useful_life_value = EXCLUDED.useful_life_value,
          age_description = EXCLUDED.age_description,
          precinct_id = EXCLUDED.precinct_id,
          updated_at = NOW()
      `;
      inserted++;
    }

    if (i % 1000 === 0) {
      console.log(`  Processed ${i + batch.length}/${trees.length}...`);
    }
  }

  console.log(`Done. Inserted/updated ${inserted} trees (${mapped} mapped to precincts)`);
}

main().catch(console.error);
