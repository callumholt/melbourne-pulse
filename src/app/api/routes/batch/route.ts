import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PairRequest {
  key: string; // "fromId-toId"
  from: string; // "lon,lat"
  to: string; // "lon,lat"
}

// Shared server-side cache (persists across requests in the same process)
const routeCache = new Map<string, [number, number][]>();

async function fetchOneRoute(
  from: string,
  to: string,
): Promise<[number, number][] | null> {
  const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${from};${to}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(osrmUrl, {
      headers: { "User-Agent": "MelbournePulse/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (
      data.code !== "Ok" ||
      !data.routes?.[0]?.geometry?.coordinates
    ) {
      return null;
    }

    return data.routes[0].geometry.coordinates;
  } catch {
    return null;
  }
}

/**
 * POST /api/routes/batch
 *
 * Accepts { pairs: PairRequest[] } and returns { routes: Record<key, coords[]> }.
 * Fetches from OSRM sequentially server-side with 100ms delay between requests
 * to avoid rate limiting. Results are cached in-process.
 */
export async function POST(req: NextRequest) {
  let body: { pairs: PairRequest[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.pairs)) {
    return NextResponse.json({ error: "Missing pairs array" }, { status: 400 });
  }

  const results: Record<string, [number, number][]> = {};
  let fetched = 0;

  for (const pair of body.pairs) {
    // Check server cache first
    const cacheKey = `${pair.from}-${pair.to}`;
    const cached = routeCache.get(cacheKey);
    if (cached) {
      results[pair.key] = cached;
      continue;
    }

    // Fetch from OSRM
    const coords = await fetchOneRoute(pair.from, pair.to);
    if (coords && coords.length >= 2) {
      routeCache.set(cacheKey, coords);
      results[pair.key] = coords;
    }

    fetched++;
    // Throttle — 100ms between OSRM requests
    if (fetched < body.pairs.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return NextResponse.json({ routes: results });
}
