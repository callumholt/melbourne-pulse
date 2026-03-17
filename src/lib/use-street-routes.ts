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
  addRoutes: (newRoutes: Record<string, [number, number][]>) => void;
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

// ── OSRM client-side fetch (CORS supported by router.project-osrm.org) ──

const OSRM_BASE = "https://router.project-osrm.org/route/v1/foot";
const CONCURRENCY = 6;
const FLUSH_EVERY = 10; // persist to store every N successful fetches

async function fetchOneRoute(
  from: string,
  to: string,
): Promise<[number, number][] | null> {
  try {
    const res = await fetch(
      `${OSRM_BASE}/${from};${to}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates) {
      return null;
    }
    return data.routes[0].geometry.coordinates;
  } catch {
    return null;
  }
}

let fetchInProgress = false;

async function fetchMissingRoutes(pairs: SensorPair[]) {
  if (fetchInProgress || pairs.length === 0) return;
  fetchInProgress = true;

  try {
    const store = useRouteStore.getState();
    const failedSet = new Set(store.failed);

    const missing = pairs.filter((p) => {
      const key = `${p.fromId}-${p.toId}`;
      return !(key in store.routes) && !failedSet.has(key);
    });

    if (missing.length === 0) return;

    // Fetch all missing pairs directly from OSRM with a concurrency limit.
    // Results are flushed to the Zustand store (and localStorage) every FLUSH_EVERY
    // completions so progress is saved incrementally.
    const pending = new Map(
      missing.map((p) => [`${p.fromId}-${p.toId}`, p]),
    );
    const keys = [...pending.keys()];
    let cursor = 0;

    const accumulated: Record<string, [number, number][]> = {};
    const accumulatedFailed: string[] = [];
    let accumCount = 0;

    function flush() {
      if (Object.keys(accumulated).length > 0) {
        useRouteStore.getState().addRoutes({ ...accumulated });
        for (const k of Object.keys(accumulated)) delete accumulated[k];
      }
      if (accumulatedFailed.length > 0) {
        useRouteStore.getState().addFailed([...accumulatedFailed]);
        accumulatedFailed.length = 0;
      }
      accumCount = 0;
    }

    async function worker() {
      while (cursor < keys.length) {
        const key = keys[cursor++];
        const pair = pending.get(key)!;
        const coords = await fetchOneRoute(
          `${pair.fromLon},${pair.fromLat}`,
          `${pair.toLon},${pair.toLat}`,
        );
        if (coords && coords.length >= 2) {
          accumulated[key] = coords;
        } else {
          accumulatedFailed.push(key);
        }
        accumCount++;
        if (accumCount >= FLUSH_EVERY) flush();
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, missing.length) },
      worker,
    );
    await Promise.all(workers);
    flush(); // final flush
  } finally {
    fetchInProgress = false;
  }
}

// ── Hook ──

/**
 * Returns a Map of street routes from the persistent Zustand store.
 * On first load, fetches missing routes directly from OSRM in the browser
 * (CORS supported) with a concurrency limit, persisting incrementally to
 * localStorage so they survive page reloads.
 */
export function useStreetRoutes(
  sensorPairs: SensorPair[],
  enabled: boolean,
): StreetRouteCache {
  const routes = useRouteStore((s) => s.routes);

  useEffect(() => {
    if (!enabled || sensorPairs.length === 0) return;
    fetchMissingRoutes(sensorPairs);
  }, [enabled, sensorPairs]);

  return useMemo(() => {
    const map = new Map<string, [number, number][]>();
    for (const [key, coords] of Object.entries(routes)) {
      map.set(key, coords);
    }
    return map;
  }, [routes]);
}
