export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Wider Melbourne region bbox — extends north to cover Tullamarine and Avalon airports
const BBOX = {
  lamin: -38.35,
  lomin: 144.4,
  lamax: -37.55,
  lomax: 145.15,
};

const OPENSKY_URL = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;

interface CachedResponse {
  data: AircraftState[];
  timestamp: number;
}

interface AircraftState {
  icao24: string;
  callsign: string;
  originCountry: string;
  lat: number;
  lon: number;
  altitude: number | null; // metres
  onGround: boolean;
  velocity: number; // m/s
  track: number; // degrees clockwise from north
  verticalRate: number | null; // m/s
}

let cache: CachedResponse | null = null;
const CACHE_TTL = 10_000; // 10 seconds

async function fetchAircraft(): Promise<AircraftState[]> {
  // Return cached data if fresh enough
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  let res: Response;
  try {
    res = await fetch(OPENSKY_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Timeout or network error — return stale cache if available
    if (cache) return cache.data;
    throw new Error("OpenSky unreachable");
  }

  if (!res.ok) {
    // Rate limited or server error — return stale cache if available
    if (cache) return cache.data;
    throw new Error(`OpenSky returned ${res.status}`);
  }

  const json = await res.json();
  const states: AircraftState[] = [];

  if (json.states) {
    for (const s of json.states) {
      // Skip entries without position
      if (s[6] == null || s[5] == null) continue;

      states.push({
        icao24: s[0],
        callsign: (s[1] ?? "").trim(),
        originCountry: s[2] ?? "",
        lat: s[6],
        lon: s[5],
        altitude: s[13] ?? s[7] ?? null, // prefer geo_altitude, fall back to baro
        onGround: s[8] ?? false,
        velocity: s[9] ?? 0,
        track: s[10] ?? 0,
        verticalRate: s[11] ?? null,
      });
    }
  }

  cache = { data: states, timestamp: Date.now() };
  return states;
}

export async function GET() {
  try {
    const aircraft = await fetchAircraft();
    return Response.json(aircraft);
  } catch (err) {
    console.error("OpenSky fetch error:", err);
    return Response.json([], { status: 502 });
  }
}
