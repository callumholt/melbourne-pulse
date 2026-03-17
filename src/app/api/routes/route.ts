import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cache routes in memory — sensor positions are fixed so routes are stable
const routeCache = new Map<string, [number, number][]>();

export async function GET(req: NextRequest) {
	const from = req.nextUrl.searchParams.get("from");
	const to = req.nextUrl.searchParams.get("to");

	if (!from || !to) {
		return NextResponse.json(
			{ error: "Missing required query params: from, to" },
			{ status: 400 },
		);
	}

	const cacheKey = `${from}-${to}`;
	const cached = routeCache.get(cacheKey);
	if (cached) {
		return NextResponse.json(cached);
	}

	const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${from};${to}?overview=full&geometries=geojson`;

	let response: Response;
	try {
		response = await fetch(osrmUrl, {
			headers: { "User-Agent": "MelbournePulse/1.0" },
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "OSRM request failed" },
			{ status: 502 },
		);
	}

	if (!response.ok) {
		return NextResponse.json(
			{ error: `OSRM returned ${response.status}` },
			{ status: 502 },
		);
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON from OSRM" }, { status: 502 });
	}

	const osrm = data as {
		code?: string;
		routes?: { geometry?: { coordinates?: [number, number][] } }[];
	};

	if (osrm.code !== "Ok" || !osrm.routes?.[0]?.geometry?.coordinates) {
		return NextResponse.json({ error: "No route found" }, { status: 502 });
	}

	const coordinates = osrm.routes[0].geometry.coordinates;
	routeCache.set(cacheKey, coordinates);

	return NextResponse.json(coordinates);
}
