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
  // Static data (populated when ShipStaticData message received)
  imo: number | null;
  callSign: string | null;
  destination: string | null;
  shipType: number | null;
  length: number | null;
  width: number | null;
  draught: number | null;
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
                const existing = vesselsRef.current.get(event.mmsi);
                const vessel: Vessel = {
                  mmsi: event.mmsi,
                  name: event.name || existing?.name || `MMSI ${event.mmsi}`,
                  lat: event.lat,
                  lon: event.lon,
                  sog: event.sog,
                  cog: event.cog,
                  heading: event.heading,
                  lastUpdate: Date.now(),
                  // Preserve static data from previous messages
                  imo: existing?.imo ?? null,
                  callSign: existing?.callSign ?? null,
                  destination: existing?.destination ?? null,
                  shipType: existing?.shipType ?? null,
                  length: existing?.length ?? null,
                  width: existing?.width ?? null,
                  draught: existing?.draught ?? null,
                };
                vesselsRef.current.set(event.mmsi, vessel);
              } else if (event.type === "static") {
                const existing = vesselsRef.current.get(event.mmsi);
                if (existing) {
                  if (event.name) existing.name = event.name;
                  if (event.imo) existing.imo = event.imo;
                  if (event.callSign) existing.callSign = event.callSign;
                  if (event.destination) existing.destination = event.destination;
                  if (event.shipType != null) existing.shipType = event.shipType;
                  if (event.length) existing.length = event.length;
                  if (event.width) existing.width = event.width;
                  if (event.draught) existing.draught = event.draught;
                } else {
                  // Create a placeholder vessel from static data
                  vesselsRef.current.set(event.mmsi, {
                    mmsi: event.mmsi,
                    name: event.name || `MMSI ${event.mmsi}`,
                    lat: 0, lon: 0, sog: 0, cog: 0, heading: 0,
                    lastUpdate: Date.now(),
                    imo: event.imo ?? null,
                    callSign: event.callSign ?? null,
                    destination: event.destination ?? null,
                    shipType: event.shipType ?? null,
                    length: event.length ?? null,
                    width: event.width ?? null,
                    draught: event.draught ?? null,
                  });
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
