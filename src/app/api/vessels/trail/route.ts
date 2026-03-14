import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mmsi = req.nextUrl.searchParams.get("mmsi");
  const hours = Number(req.nextUrl.searchParams.get("hours") ?? "1");

  if (!mmsi) {
    return NextResponse.json({ error: "mmsi parameter required" }, { status: 400 });
  }

  const clampedHours = Math.min(Math.max(hours, 0.5), 24);
  const sql = getDb();

  const rows = await sql`
    SELECT mmsi, vessel_name, lat, lon, course, speed, heading, received_at
    FROM vessel_positions
    WHERE mmsi = ${mmsi}
      AND received_at > NOW() - INTERVAL '1 hour' * ${clampedHours}
    ORDER BY received_at ASC
    LIMIT 500
  `;

  return NextResponse.json(rows);
}
