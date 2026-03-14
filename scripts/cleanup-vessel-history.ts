import "dotenv/config";
import { neon } from "@neondatabase/serverless";

/**
 * Prune vessel_positions older than 30 days.
 * Run via: npx tsx scripts/cleanup-vessel-history.ts
 */
async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const result = await sql`
    DELETE FROM vessel_positions
    WHERE received_at < NOW() - INTERVAL '30 days'
  `;

  console.log(`Deleted ${result.length ?? 0} old vessel position records`);
}

main().catch(console.error);
