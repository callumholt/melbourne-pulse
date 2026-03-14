import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

const DATABASE_URL = process.env.DATABASE_URL!;
const COM_API_BASE = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";

const PRECINCTS = [
  { id: "cbd-core", name: "CBD Core", colour: "#3b82f6", lat: -37.8136, lon: 144.9631, display_order: 1 },
  { id: "southbank", name: "Southbank", colour: "#22c55e", lat: -37.8226, lon: 144.9644, display_order: 2 },
  { id: "docklands", name: "Docklands", colour: "#a855f7", lat: -37.8145, lon: 144.9460, display_order: 3 },
  { id: "fed-square", name: "Fed Square", colour: "#f59e0b", lat: -37.8180, lon: 144.9691, display_order: 4 },
  { id: "carlton", name: "Carlton", colour: "#ef4444", lat: -37.7963, lon: 144.9668, display_order: 5 },
  { id: "chinatown", name: "Chinatown", colour: "#ec4899", lat: -37.8117, lon: 144.9688, display_order: 6 },
  { id: "qvm", name: "Queen Vic Market", colour: "#14b8a6", lat: -37.8076, lon: 144.9568, display_order: 7 },
  { id: "flagstaff", name: "Flagstaff", colour: "#f97316", lat: -37.8118, lon: 144.9548, display_order: 8 },
  { id: "parliament", name: "Parliament", colour: "#06b6d4", lat: -37.8112, lon: 144.9738, display_order: 9 },
  { id: "st-kilda-rd", name: "St Kilda Rd", colour: "#84cc16", lat: -37.8300, lon: 144.9680, display_order: 10 },
];

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestPrecinct(lat: number, lon: number): string {
  let minDist = Infinity;
  let nearest = "cbd-core";
  for (const p of PRECINCTS) {
    const dist = haversineDistance(lat, lon, p.lat, p.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = p.id;
    }
  }
  return nearest;
}

async function main() {
  if (!DATABASE_URL) {
    console.error("Missing DATABASE_URL env var");
    console.error("Run with: npx dotenv-cli -e .env.local -- npx tsx scripts/seed-sensors.ts");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  // 1. Seed precincts
  console.log("Seeding precincts...");
  for (const p of PRECINCTS) {
    await sql`
      INSERT INTO precincts (id, name, colour, display_order)
      VALUES (${p.id}, ${p.name}, ${p.colour}, ${p.display_order})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, colour = EXCLUDED.colour, display_order = EXCLUDED.display_order
    `;
  }
  console.log(`Seeded ${PRECINCTS.length} precincts`);

  // 2. Fetch sensor locations from CoM API
  console.log("Fetching sensor locations from City of Melbourne...");
  const res = await fetch(
    `${COM_API_BASE}/pedestrian-counting-system-sensor-locations/records?limit=100&offset=0`
  );
  const page1 = await res.json();
  let sensors = page1.results;

  if (page1.total_count > 100) {
    const res2 = await fetch(
      `${COM_API_BASE}/pedestrian-counting-system-sensor-locations/records?limit=100&offset=100`
    );
    const page2 = await res2.json();
    sensors = [...sensors, ...page2.results];
  }

  console.log(`Fetched ${sensors.length} sensors`);

  // 3. Assign to precincts and build mapping
  const mapping: Record<string, string> = {};
  const sensorRows = sensors.map((s: any) => {
    const lat = s.latitude ?? s.location?.lat ?? -37.8136;
    const lon = s.longitude ?? s.location?.lon ?? 144.9631;
    const precinctId = findNearestPrecinct(lat, lon);
    const sensorId = s.location_id ?? s.sensor_id;
    mapping[String(sensorId)] = precinctId;

    return {
      sensor_id: sensorId,
      sensor_name: s.sensor_description || s.sensor_name || `Sensor ${sensorId}`,
      lat,
      lon,
      status: s.status || "A",
      precinct_id: precinctId,
    };
  });

  // 4. Upsert sensors
  console.log("Upserting sensors...");
  for (const s of sensorRows) {
    await sql`
      INSERT INTO sensors (sensor_id, sensor_name, lat, lon, status, precinct_id)
      VALUES (${s.sensor_id}, ${s.sensor_name}, ${s.lat}, ${s.lon}, ${s.status}, ${s.precinct_id})
      ON CONFLICT (sensor_id) DO UPDATE SET
        sensor_name = EXCLUDED.sensor_name,
        lat = EXCLUDED.lat,
        lon = EXCLUDED.lon,
        status = EXCLUDED.status,
        precinct_id = EXCLUDED.precinct_id
    `;
  }
  console.log(`Upserted ${sensorRows.length} sensors`);

  // 5. Output mapping file
  const mapPath = path.join(__dirname, "..", "data", "precinct-sensor-map.json");
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2));
  console.log(`Wrote mapping to ${mapPath}`);

  // Print summary
  const counts: Record<string, number> = {};
  for (const pid of Object.values(mapping)) {
    counts[pid] = (counts[pid] || 0) + 1;
  }
  console.log("\nSensors per precinct:");
  for (const p of PRECINCTS) {
    console.log(`  ${p.name}: ${counts[p.id] || 0}`);
  }
}

main().catch(console.error);
