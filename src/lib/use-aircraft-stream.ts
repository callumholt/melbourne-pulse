"use client";

import { useEffect, useRef, useState } from "react";

export interface Aircraft {
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
  lastUpdate: number; // timestamp ms
}

/**
 * What the feed is actually doing, so the UI never shows a healthy "0 aircraft"
 * when the truth is that OpenSky refused us.
 */
export type AircraftFeedState =
  | "connecting"
  | "live"
  | "stale"
  | "rate_limited"
  | "unauthorised"
  | "error";

interface AircraftPayload {
  aircraft: Omit<Aircraft, "lastUpdate">[];
  status: "ok" | "rate_limited" | "unauthorised" | "error";
  stale: boolean;
  ageMs: number | null;
  authenticated: boolean;
}

const POLL_INTERVAL = 30_000; // 30 seconds — anonymous OpenSky is rate-limited

export function useAircraftStream(enabled: boolean) {
  const [aircraft, setAircraft] = useState<Map<string, Aircraft>>(new Map());
  const [state, setState] = useState<AircraftFeedState>("connecting");
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/aircraft");
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }

        const payload: AircraftPayload = await res.json();
        if (cancelled) return;

        const now = Date.now();
        const map = new Map<string, Aircraft>();
        for (const s of payload.aircraft) {
          map.set(s.icao24, { ...s, lastUpdate: now });
        }

        setAircraft(map);
        setCount(map.size);

        if (payload.status === "rate_limited") setState("rate_limited");
        else if (payload.status === "unauthorised") setState("unauthorised");
        else if (payload.status === "error") setState("error");
        else if (payload.stale) setState("stale");
        else setState("live");
      } catch {
        if (!cancelled) setState("error");
      }
    };

    // Fetch immediately, then poll
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_INTERVAL);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);

  return { aircraft, state, connected: state === "live", count };
}
