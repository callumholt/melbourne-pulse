import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface NominatimResponse {
	display_name: string;
	address?: {
		road?: string;
		suburb?: string;
		city_district?: string;
		neighbourhood?: string;
	};
}

interface GeocodeResult {
	address: string;
	road: string | null;
	suburb: string | null;
}

// Module-level cache keyed by "lat,lon" rounded to 5 decimal places
const cache = new Map<string, GeocodeResult>();

function roundCoord(value: number): number {
	return Math.round(value * 100000) / 100000;
}

export async function GET(req: NextRequest) {
	const lat = req.nextUrl.searchParams.get("lat");
	const lon = req.nextUrl.searchParams.get("lon");

	if (!lat || !lon) {
		return NextResponse.json({ error: "Missing lat or lon parameters" }, { status: 400 });
	}

	const latNum = parseFloat(lat);
	const lonNum = parseFloat(lon);

	if (isNaN(latNum) || isNaN(lonNum)) {
		return NextResponse.json({ error: "Invalid lat or lon values" }, { status: 400 });
	}

	const cacheKey = `${roundCoord(latNum)},${roundCoord(lonNum)}`;

	const cached = cache.get(cacheKey);
	if (cached) {
		return NextResponse.json(cached);
	}

	try {
		const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latNum}&lon=${lonNum}&zoom=18&addressdetails=1`;
		const res = await fetch(url, {
			headers: {
				"User-Agent": "MelbournePulse/1.0",
			},
		});

		if (!res.ok) {
			return NextResponse.json(
				{ error: `Nominatim returned status ${res.status}` },
				{ status: 502 },
			);
		}

		const data: NominatimResponse = await res.json();

		const result: GeocodeResult = {
			address: data.display_name,
			road: data.address?.road ?? null,
			suburb: data.address?.suburb ?? data.address?.city_district ?? data.address?.neighbourhood ?? null,
		};

		cache.set(cacheKey, result);

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
