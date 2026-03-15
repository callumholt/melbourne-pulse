import { NextResponse } from "next/server";
import { fetchBuildingFootprints } from "@/lib/com-api";

export const revalidate = 86400; // Cache for 24 hours (static data)

export async function GET() {
  try {
    // Fetch buildings in the Melbourne CBD area
    const geojson = await fetchBuildingFootprints({
      minLat: -37.83,
      minLon: 144.94,
      maxLat: -37.80,
      maxLon: 144.98,
    });

    return NextResponse.json(geojson);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
