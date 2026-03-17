"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StreetRouteCache = Map<string, [number, number][]>;

export interface SensorPair {
  fromId: number;
  toId: number;
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
}

// ── Zustand store with localStorage persistence ──

interface RouteStoreState {
  /** Routes keyed by "fromSensorId-toSensorId" → [lon,lat][] */
  routes: Record<string, [number, number][]>;
  /** Keys that permanently failed (OSRM can't route) */
  failed: string[];
  /** Merge new routes into the store */
  addRoutes: (newRoutes: Record<string, [number, number][]>) => void;
  /** Mark keys as permanently failed */
  addFailed: (keys: string[]) => void;
}

const useRouteStore = create<RouteStoreState>()(
  persist(
    (set) => ({
      routes: {},
      failed: [],
      addRoutes: (newRoutes) =>
        set((s) => ({ routes: { ...s.routes, ...newRoutes } })),
      addFailed: (keys) =>
        set((s) => ({ failed: [...new Set([...s.failed, ...keys])] })),
    }),
    {
      name: "melbourne-pulse-routes",
      partialize: (s) => ({ routes: s.routes, failed: s.failed }),
    },
  ),
);

// ── Batch fetch logic ──

const CHUNK_SIZE = 25;
let fetchInProgress = false;

async function fetchMissingRoutes(pairs: SensorPair[]) {
  if (fetchInProgress || pairs.length === 0) return;
  fetchInProgress = true;

  try {
    const store = useRouteStore.getState();
    const failedSet = new Set(store.failed);

    // Filter to pairs not in store and not permanently failed
    const missing = pairs.filter((p) => {
      const key = `${p.fromId}-${p.toId}`;
      return !(key in store.routes) && !failedSet.has(key);
    });

    if (missing.length === 0) return;

    // Chunk into batches of CHUNK_SIZE and fetch sequentially
    // Each chunk completes quickly (parallel OSRM server-side), results stored incrementally
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE);
      const batchPairs = chunk.map((p) => ({
        key: `${p.fromId}-${p.toId}`,
        from: `${p.fromLon},${p.fromLat}`,
        to: `${p.toLon},${p.toLat}`,
      }));

      try {
        const res = await fetch("/api/routes/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairs: batchPairs }),
        });

        if (res.ok) {
          const data: { routes: Record<string, [number, number][]> } =
            await res.json();

          // Store successful routes immediately (incremental persistence)
          if (Object.keys(data.routes).length > 0) {
            useRouteStore.getState().addRoutes(data.routes);
          }

          // Mark unreturned keys as failed
          const returnedKeys = new Set(Object.keys(data.routes));
          const newFailed = batchPairs
            .map((p) => p.key)
            .filter((k) => !returnedKeys.has(k));
          if (newFailed.length > 0) {
            useRouteStore.getState().addFailed(newFailed);
          }
        }
      } catch {
        // Network error on this chunk — skip, will retry next time
      }
    }
  } finally {
    fetchInProgress = false;
  }
}

// ── Hook ──

/**
 * Returns a Map of street routes from the persistent Zustand store.
 * Triggers chunked batch fetches for any missing routes when sensor pairs change.
 * Routes are persisted to localStorage so they survive page reloads.
 */
export function useStreetRoutes(
  sensorPairs: SensorPair[],
  enabled: boolean,
): StreetRouteCache {
  const routes = useRouteStore((s) => s.routes);

  // Trigger fetch for missing routes
  useEffect(() => {
    if (!enabled || sensorPairs.length === 0) return;
    fetchMissingRoutes(sensorPairs);
  }, [enabled, sensorPairs]);

  // Convert the plain object to a Map for the flow layer
  return useMemo(() => {
    const map = new Map<string, [number, number][]>();
    for (const [key, coords] of Object.entries(routes)) {
      map.set(key, coords);
    }
    return map;
  }, [routes]);
}
