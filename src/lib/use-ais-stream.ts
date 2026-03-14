"use client";

import { useEffect, useRef, useState } from "react";

export interface Vessel {
  mmsi: number;
  name: string;
  lat: number;
  lon: number;
  sog: number; // speed over ground (knots)
  cog: number; // course over ground (degrees)
  heading: number;
  lastUpdate: number; // timestamp ms
}

const STALE_TIMEOUT = 300_000; // remove vessels not seen in 5 min

export function useAisStream(enabled: boolean) {
  const [vessels, setVessels] = useState<Map<number, Vessel>>(new Map());
  const [connected, setConnected] = useState(false);
  const [vesselCount, setVesselCount] = useState(0);
  const vesselsRef = useRef<Map<number, Vessel>>(new Map());
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let abortController: AbortController | null = null;

    const connect = async () => {
      abortController = new AbortController();

      try {
        const res = await fetch("/api/ais", { signal: abortController.signal });
        if (!res.ok || !res.body) {
          throw new Error(`AIS endpoint returned ${res.status}`);
        }

        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            const dataLine = block.trim();
            if (!dataLine.startsWith("data: ")) continue;

            try {
              const event = JSON.parse(dataLine.slice(6));

              if (event.type === "position") {
                const vessel: Vessel = {
                  mmsi: event.mmsi,
                  name: event.name || `MMSI ${event.mmsi}`,
                  lat: event.lat,
                  lon: event.lon,
                  sog: event.sog,
                  cog: event.cog,
                  heading: event.heading,
                  lastUpdate: Date.now(),
                };
                vesselsRef.current.set(event.mmsi, vessel);
              } else if (event.type === "static") {
                const existing = vesselsRef.current.get(event.mmsi);
                if (existing && event.name) {
                  existing.name = event.name;
                }
              }
            } catch {
              // skip malformed
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("AIS stream error:", err);
      }

      setConnected(false);

      // Auto-reconnect after 5s
      retryRef.current = setTimeout(connect, 5000);
    };

    connect();

    return () => {
      if (abortController) abortController.abort();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [enabled]);

  // Periodically flush vessel state to React + prune stale vessels
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const current = vesselsRef.current;

      for (const [mmsi, v] of current) {
        if (now - v.lastUpdate > STALE_TIMEOUT) {
          current.delete(mmsi);
        }
      }

      setVessels(new Map(current));
      setVesselCount(current.size);
    }, 2000);

    return () => clearInterval(interval);
  }, [enabled]);

  return { vessels, connected, vesselCount };
}
