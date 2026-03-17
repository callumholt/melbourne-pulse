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

const BATCH_SIZE = 5;

async function fetchRoute(pair: SensorPair): Promise<[string, [number, number][]] | null> {
	const from = `${pair.fromLon},${pair.fromLat}`;
	const to = `${pair.toLon},${pair.toLat}`;
	const key = `${pair.fromId}-${pair.toId}`;

	try {
		const res = await fetch(
			`/api/routes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
		);
		if (!res.ok) return null;
		const coords: [number, number][] = await res.json();
		return [key, coords];
	} catch {
		return null;
	}
}

/**
 * Fetch and cache street routes for pedestrian flow sensor pairs.
 *
 * Routes are fetched in batches of up to 5 concurrent requests to avoid
 * overwhelming the OSRM demo server. The internal cache is a persistent
 * Map stored in a ref; only a snapshot of that Map is exposed as React
 * state so the component re-renders when new routes arrive.
 */
export function useStreetRoutes(
	sensorPairs: SensorPair[],
	enabled: boolean,
): StreetRouteCache {
	// Persistent accumulator — mutated in the async effect, never during render
	const persistentCache = useRef<StreetRouteCache | null>(null);
	if (persistentCache.current === null) {
		persistentCache.current = new Map();
	}

	const [cache, setCache] = useState<StreetRouteCache>(() => new Map());

	useEffect(() => {
		if (!enabled || sensorPairs.length === 0) return;

		const inner = persistentCache.current!;

		// Identify pairs not yet in cache
		const missing = sensorPairs.filter(
			(p) => !inner.has(`${p.fromId}-${p.toId}`),
		);

		if (missing.length === 0) return;

		let cancelled = false;

		async function fetchInBatches() {
			for (let i = 0; i < missing.length; i += BATCH_SIZE) {
				if (cancelled) break;

				const batch = missing.slice(i, i + BATCH_SIZE);
				const results = await Promise.all(batch.map(fetchRoute));

				if (cancelled) break;

				let updated = false;
				for (const result of results) {
					if (result) {
						const [key, coords] = result;
						inner.set(key, coords);
						updated = true;
					}
				}

				if (updated) {
					// Publish a new Map snapshot so consumers see the updated entries
					setCache(new Map(inner));
				}
			}
		}

		fetchInBatches();

		return () => {
			cancelled = true;
		};
	}, [enabled, sensorPairs]);

	return cache;
}
