import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates) {
      return null;
    }

    return data.routes[0].geometry.coordinates;
  } catch {
    return null;
  }
}

/**
 * Run an array of async tasks with a maximum concurrency limit.
 */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * POST /api/routes/batch
 *
 * Accepts { pairs: PairRequest[] } and returns { routes: Record<key, coords[]> }.
 * Fetches from OSRM in parallel (up to 8 concurrent) with server-side in-process
 * cache. Client should chunk large pair lists into batches of ~25.
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
  const toFetch: PairRequest[] = [];

  // Return cached pairs immediately
  for (const pair of body.pairs) {
    const cacheKey = `${pair.from}-${pair.to}`;
    const cached = routeCache.get(cacheKey);
    if (cached) {
      results[pair.key] = cached;
    } else {
      toFetch.push(pair);
    }
  }

  // Fetch uncached pairs in parallel (concurrency 8)
  const tasks = toFetch.map((pair) => async () => {
    const coords = await fetchOneRoute(pair.from, pair.to);
    if (coords && coords.length >= 2) {
      routeCache.set(`${pair.from}-${pair.to}`, coords);
      results[pair.key] = coords;
    }
  });

  await withConcurrency(tasks, 8);

  return NextResponse.json({ routes: results });
}
