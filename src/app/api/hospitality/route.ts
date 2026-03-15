import { NextResponse } from "next/server";
import { fetchCafesAndRestaurants, fetchBarsAndPubs } from "@/lib/com-api";

export const revalidate = 86400; // Cache for 24 hours (census data, rarely changes)

export interface HospitalityVenue {
  id: string;
  name: string;
  address: string;
  area: string;
  type: "cafe" | "bar";
  industry: string;
  capacity: number;
  lat: number;
  lon: number;
}

export async function GET() {
  try {
    const [cafes, bars] = await Promise.all([
      fetchCafesAndRestaurants(),
      fetchBarsAndPubs(),
    ]);

    const venues: HospitalityVenue[] = [];
    const seen = new Set<string>();

    // Deduplicate by name+address, keep most recent census year
    for (const c of cafes) {
      if (!c.latitude || !c.longitude) continue;
      const key = `${c.trading_name}|${c.street_address}`;
      if (seen.has(key)) continue;
      seen.add(key);

      venues.push({
        id: `cafe-${key}`,
        name: c.trading_name,
        address: c.street_address,
        area: c.clue_small_area,
        type: "cafe",
        industry: c.industry_description,
        capacity: c.number_of_seats || 0,
        lat: c.latitude,
        lon: c.longitude,
      });
    }

    for (const b of bars) {
      if (!b.latitude || !b.longitude) continue;
      const key = `${b.trading_name}|${b.street_address}`;
      if (seen.has(key)) continue;
      seen.add(key);

      venues.push({
        id: `bar-${key}`,
        name: b.trading_name,
        address: b.street_address,
        area: b.clue_small_area,
        type: "bar",
        industry: b.industry_description,
        capacity: b.number_of_patrons || 0,
        lat: b.latitude,
        lon: b.longitude,
      });
    }

    return NextResponse.json(venues);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
