import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const revalidate = 300;

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM get_city_pulse()`;
    return NextResponse.json(rows[0] ?? { total_current: 0, sensor_count: 0, historical_avg: 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
