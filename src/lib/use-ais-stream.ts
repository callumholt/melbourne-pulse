"use client";

import { useEffect, useRef, useCallback, useState } from "react";

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

// Port Phillip Bay bounding box
const PORT_PHILLIP_BBOX: [[number, number], [number, number]] = [
  [-38.35, 144.4],  // SW corner
  [-37.75, 145.15], // NE corner
];

const WS_URL = "wss://stream.aisstream.io/v0/stream";
const RECONNECT_DELAY = 5000;
const STALE_TIMEOUT = 300_000; // remove vessels not seen in 5 min

export function useAisStream(apiKey: string | undefined) {
  const [vessels, setVessels] = useState<Map<number, Vessel>>(new Map());
  const [connected, setConnected] = useState(false);
  const [vesselCount, setVesselCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vesselsRef = useRef<Map<number, Vessel>>(new Map());

  const connect = useCallback(() => {
    if (!apiKey) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send subscription within 3 seconds
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [PORT_PHILLIP_BBOX],
        FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"],
      }));
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const meta = data.MetaData;
        if (!meta) return;

        const mmsi = meta.MMSI;
        const existing = vesselsRef.current.get(mmsi);

        if (data.MessageType === "ShipStaticData") {
          // Update ship name from static data message
          if (existing) {
            existing.name = meta.ShipName?.trim() || existing.name;
          }
          return;
        }

        // Position report
        const msg = data.Message?.PositionReport
          ?? data.Message?.StandardClassBPositionReport;
        if (!msg) return;

        const vessel: Vessel = {
          mmsi,
          name: meta.ShipName?.trim() || existing?.name || `MMSI ${mmsi}`,
          lat: meta.latitude ?? msg.Latitude,
          lon: meta.longitude ?? msg.Longitude,
          sog: msg.Sog ?? 0,
          cog: msg.Cog ?? 0,
          heading: msg.TrueHeading ?? msg.Cog ?? 0,
          lastUpdate: Date.now(),
        };

        vesselsRef.current.set(mmsi, vessel);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Auto-reconnect
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [apiKey]);

  // Connect on mount
  useEffect(() => {
    if (!apiKey) return;

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [apiKey, connect]);

  // Periodically flush vessel state to React + prune stale vessels
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const current = vesselsRef.current;

      // Prune stale
      for (const [mmsi, v] of current) {
        if (now - v.lastUpdate > STALE_TIMEOUT) {
          current.delete(mmsi);
        }
      }

      setVessels(new Map(current));
      setVesselCount(current.size);
    }, 2000); // update React state every 2s to avoid thrashing

    return () => clearInterval(interval);
  }, []);

  return { vessels, connected, vesselCount };
}
