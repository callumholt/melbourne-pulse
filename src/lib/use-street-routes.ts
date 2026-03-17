"use client";

import { useRef, useState, useEffect } from "react";

export type StreetRouteCache = Map<string, [number, number][]>;

export interface SensorPair {
  fromId: number;
  toId: number;
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
}

// Fetch one route at a time (sequential) with retry
async function fetchRouteWithRetry(
  pair: SensorPair,
  retries = 2,
): Promise<[string, [number, number][]] | null> {
  const from = `${pair.fromLon},${pair.fromLat}`;
  const to = `${pair.toLon},${pair.toLat}`;
  const key = `${pair.fromId}-${pair.toId}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `/api/routes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) {
        // Rate limited or server error — wait longer before retry
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return null;
      }
      const coords: [number, number][] = await res.json();
      if (coords.length >= 2) return [key, coords];
      return null;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Fetch and cache street routes for pedestrian flow sensor pairs.
 *
 * Routes are fetched sequentially with a 200ms delay between requests
 * to respect the OSRM demo server rate limits. Failed routes are retried
 * up to 2 times with exponential backoff. Permanently failed routes are
 * tracked so they aren't re-attempted on subsequent renders.
 */
export function useStreetRoutes(
  sensorPairs: SensorPair[],
  enabled: boolean,
): StreetRouteCache {
  const persistentCache = useRef<StreetRouteCache>(new Map());
  const failedKeys = useRef<Set<string>>(new Set());
  const [cache, setCache] = useState<StreetRouteCache>(() => new Map());

  useEffect(() => {
    if (!enabled || sensorPairs.length === 0) return;

    const inner = persistentCache.current;

    // Identify pairs not yet in cache and not permanently failed
    const missing = sensorPairs.filter((p) => {
      const key = `${p.fromId}-${p.toId}`;
      return !inner.has(key) && !failedKeys.current.has(key);
    });

    if (missing.length === 0) return;

    let cancelled = false;

    async function fetchSequentially() {
      let newCount = 0;

      for (const pair of missing) {
        if (cancelled) break;

        const result = await fetchRouteWithRetry(pair);

        if (cancelled) break;

        if (result) {
          const [key, coords] = result;
          inner.set(key, coords);
          newCount++;
          // Publish updates every 5 successful routes so flow lines update progressively
          if (newCount % 5 === 0) {
            setCache(new Map(inner));
          }
        } else {
          failedKeys.current.add(`${pair.fromId}-${pair.toId}`);
        }

        // Small delay between requests to avoid rate limiting
        if (!cancelled) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // Final publish for any remaining routes
      if (newCount > 0 && !cancelled) {
        setCache(new Map(inner));
      }
    }

    fetchSequentially();

    return () => {
      cancelled = true;
    };
  }, [enabled, sensorPairs]);

  return cache;
}
