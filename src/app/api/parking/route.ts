import { NextResponse } from "next/server";
import { fetchParkingSensors } from "@/lib/com-api";

export const revalidate = 300; // Cache for 5 minutes (real-time data)

export async function GET() {
  try {
    const raw = await fetchParkingSensors();

    const sensors = raw
      .filter((r) => (r.lat && r.lon) || r.location)
      .map((r) => ({
        bay_id: r.bay_id,
        st_marker_id: r.st_marker_id,
        status: r.status,
        lat: r.lat || r.location?.lat || 0,
        lon: r.lon || r.location?.lon || 0,
      }));

    return NextResponse.json(sensors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
