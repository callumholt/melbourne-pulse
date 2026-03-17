export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Wider Melbourne region bbox — extends north to cover Tullamarine and Avalon airports
const BBOX = {
  lamin: -38.35,
  lomin: 144.4,
  lamax: -37.55,
  lomax: 145.15,
};

function buildUrl() {
  const base = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;
  return base;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const user = process.env.OPENSKY_USERNAME;
  const pass = process.env.OPENSKY_PASSWORD;
  if (user && pass) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  }
  return headers;
}

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
// 60s TTL — OpenSky anonymous updates every 10s but rate-limits harshly;
// authenticated users get 10s, anonymous users should poll less aggressively.
const CACHE_TTL = 60_000;

async function fetchAircraft(): Promise<AircraftState[]> {
  // Return cached data if fresh enough
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(), {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Timeout or network error — return stale cache or empty
    return cache?.data ?? [];
  }

  if (!res.ok) {
    // Rate limited (429) or server error — return stale cache or empty
    return cache?.data ?? [];
  }

  const json = await res.json();
  const states: AircraftState[] = [];

  if (json.states) {
    for (const s of json.states) {
      if (s[6] == null || s[5] == null) continue;

      states.push({
        icao24: s[0],
        callsign: (s[1] ?? "").trim(),
        originCountry: s[2] ?? "",
        lat: s[6],
        lon: s[5],
        altitude: s[13] ?? s[7] ?? null,
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
  const aircraft = await fetchAircraft();
  return Response.json(aircraft);
}
