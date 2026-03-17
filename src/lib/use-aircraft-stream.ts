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

const POLL_INTERVAL = 30_000; // 30 seconds — anonymous OpenSky is rate-limited

export function useAircraftStream(enabled: boolean) {
  const [aircraft, setAircraft] = useState<Map<string, Aircraft>>(new Map());
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/aircraft");
        if (!res.ok) {
          setConnected(false);
          return;
        }

        const states: Omit<Aircraft, "lastUpdate">[] = await res.json();
        const now = Date.now();
        const map = new Map<string, Aircraft>();

        for (const s of states) {
          map.set(s.icao24, { ...s, lastUpdate: now });
        }

        setAircraft(map);
        setCount(map.size);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    // Fetch immediately, then poll
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);

  return { aircraft, connected, count };
}
