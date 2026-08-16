export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Wider Melbourne region bbox — extends north to cover Tullamarine and Avalon airports
const BBOX = {
  lamin: -38.35,
  lomin: 144.4,
  lamax: -37.55,
  lomax: 145.15,
};

const STATES_URL = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;

// OpenSky retired basic auth — the REST API now only accepts OAuth2 client
// credentials. Tokens last 30 minutes; we refresh a minute early.
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const TOKEN_TTL = 29 * 60_000;

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

/** Why the payload looks the way it does, so the client can say so out loud. */
type AircraftStatus = "ok" | "rate_limited" | "unauthorised" | "error";

interface AircraftPayload {
  aircraft: AircraftState[];
  status: AircraftStatus;
  /** True when `aircraft` came from cache because the live fetch failed. */
  stale: boolean;
  /** Age of the returned data in ms, or null when there is no data at all. */
  ageMs: number | null;
  authenticated: boolean;
}

let token: { value: string; expiresAt: number } | null = null;
let cache: { data: AircraftState[]; timestamp: number } | null = null;

// 60s TTL. Anonymous OpenSky updates every 10s but only allows 400 credits per
// day per IP, and on serverless this cache only survives a warm instance.
const CACHE_TTL = 60_000;

function credentials() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Returns a bearer token, or null when unconfigured or the exchange fails. */
async function getToken(): Promise<string | null> {
  const creds = credentials();
  if (!creds) return null;

  if (token && Date.now() < token.expiresAt) return token.value;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      token = null;
      return null;
    }

    const json = await res.json();
    if (!json.access_token) {
      token = null;
      return null;
    }

    const ttl = json.expires_in ? json.expires_in * 1000 : TOKEN_TTL;
    token = {
      value: json.access_token,
      expiresAt: Date.now() + Math.min(ttl, TOKEN_TTL),
    };
    return token.value;
  } catch {
    token = null;
    return null;
  }
}

function parseStates(json: unknown): AircraftState[] {
  const rows = (json as { states?: unknown[][] } | null)?.states;
  if (!Array.isArray(rows)) return [];

  const states: AircraftState[] = [];
  for (const s of rows) {
    if (s[6] == null || s[5] == null) continue;

    states.push({
      icao24: s[0] as string,
      callsign: ((s[1] as string) ?? "").trim(),
      originCountry: (s[2] as string) ?? "",
      lat: s[6] as number,
      lon: s[5] as number,
      altitude: (s[13] as number) ?? (s[7] as number) ?? null,
      onGround: (s[8] as boolean) ?? false,
      velocity: (s[9] as number) ?? 0,
      track: (s[10] as number) ?? 0,
      verticalRate: (s[11] as number) ?? null,
    });
  }
  return states;
}

/** Serve whatever we last saw, labelled with why the live fetch failed. */
function fallback(status: AircraftStatus, authenticated: boolean): AircraftPayload {
  return {
    aircraft: cache?.data ?? [],
    status,
    stale: cache != null,
    ageMs: cache ? Date.now() - cache.timestamp : null,
    authenticated,
  };
}

async function fetchAircraft(): Promise<AircraftPayload> {
  const bearer = await getToken();
  const authenticated = bearer != null;

  // Credentials are set but the token exchange failed — say so rather than
  // silently degrading to the 400/day anonymous tier.
  if (credentials() && !bearer) {
    return fallback("unauthorised", false);
  }

  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return {
      aircraft: cache.data,
      status: "ok",
      stale: false,
      ageMs: Date.now() - cache.timestamp,
      authenticated,
    };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

  let res: Response;
  try {
    res = await fetch(STATES_URL, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return fallback("error", authenticated);
  }

  if (res.status === 429) return fallback("rate_limited", authenticated);
  if (res.status === 401 || res.status === 403) {
    // A rejected token is worth retrying from scratch next call.
    token = null;
    return fallback("unauthorised", authenticated);
  }
  if (!res.ok) return fallback("error", authenticated);

  let states: AircraftState[];
  try {
    states = parseStates(await res.json());
  } catch {
    return fallback("error", authenticated);
  }

  cache = { data: states, timestamp: Date.now() };
  return { aircraft: states, status: "ok", stale: false, ageMs: 0, authenticated };
}

export async function GET() {
  const payload = await fetchAircraft();
  return Response.json(payload, {
    // A degraded payload must not be cached anywhere as if it were live data.
    headers: { "Cache-Control": "no-store" },
  });
}
