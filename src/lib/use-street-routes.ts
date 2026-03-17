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
  /** Whether a batch fetch is currently in progress */
  loading: boolean;
  /** Merge new routes into the store */
  addRoutes: (newRoutes: Record<string, [number, number][]>) => void;
  /** Mark keys as permanently failed */
  addFailed: (keys: string[]) => void;
  /** Set loading state */
  setLoading: (v: boolean) => void;
}

const useRouteStore = create<RouteStoreState>()(
  persist(
    (set) => ({
      routes: {},
      failed: [],
      loading: false,
      addRoutes: (newRoutes) =>
        set((s) => ({ routes: { ...s.routes, ...newRoutes } })),
      addFailed: (keys) =>
        set((s) => ({ failed: [...new Set([...s.failed, ...keys])] })),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: "melbourne-pulse-routes",
      // Only persist routes and failed, not loading state
      partialize: (s) => ({ routes: s.routes, failed: s.failed }),
    },
  ),
);

// ── Batch fetch logic ──

let fetchInProgress = false;

async function fetchMissingRoutes(pairs: SensorPair[]) {
  if (fetchInProgress || pairs.length === 0) return;
  fetchInProgress = true;

  const store = useRouteStore.getState();
  store.setLoading(true);

  const failedSet = new Set(store.failed);

  // Filter to pairs not in store and not permanently failed
  const missing = pairs.filter((p) => {
    const key = `${p.fromId}-${p.toId}`;
    return !(key in store.routes) && !failedSet.has(key);
  });

  if (missing.length === 0) {
    store.setLoading(false);
    fetchInProgress = false;
    return;
  }

  // Build batch request
  const batchPairs = missing.map((p) => ({
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

      // Add successful routes
      if (Object.keys(data.routes).length > 0) {
        store.addRoutes(data.routes);
      }

      // Mark missing keys that weren't returned as failed
      const returnedKeys = new Set(Object.keys(data.routes));
      const newFailed = batchPairs
        .map((p) => p.key)
        .filter((k) => !returnedKeys.has(k));
      if (newFailed.length > 0) {
        store.addFailed(newFailed);
      }
    }
  } catch {
    // Network error — don't mark as failed, will retry next time
  }

  store.setLoading(false);
  fetchInProgress = false;
}

// ── Hook ──

/**
 * Returns a Map of street routes from the persistent Zustand store.
 * Triggers a batch fetch for any missing routes when sensor pairs change.
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
