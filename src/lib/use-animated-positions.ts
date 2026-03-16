"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Entity with a known position, speed, and course that can be dead-reckoned.
 */
export interface Trackable {
  lat: number;
  lon: number;
  speed: number; // metres per second
  course: number; // degrees clockwise from north
  lastUpdate: number; // timestamp ms
}

const METRES_PER_DEGREE_LAT = 111_320;

/**
 * Dead-reckon a position forward by `dtSeconds` using speed and course.
 */
function deadReckon(
  lat: number,
  lon: number,
  speedMs: number,
  courseDeg: number,
  dtSeconds: number,
): [number, number] {
  if (speedMs < 0.1 || dtSeconds <= 0) return [lat, lon];

  // Cap extrapolation to 60 seconds to prevent runaway drift
  const dt = Math.min(dtSeconds, 60);
  const courseRad = (courseDeg * Math.PI) / 180;
  const dLat = (speedMs * Math.cos(courseRad) * dt) / METRES_PER_DEGREE_LAT;
  const dLon =
    (speedMs * Math.sin(courseRad) * dt) /
    (METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));

  return [lat + dLat, lon + dLon];
}

/**
 * Animate a map of trackable entities at ~60fps using dead reckoning.
 * Returns a Map of [lat, lon] pairs keyed by the same key as the input.
 */
export function useAnimatedPositions<K>(
  entities: Map<K, Trackable>,
  enabled: boolean,
): Map<K, [number, number]> {
  const [positions, setPositions] = useState<Map<K, [number, number]>>(
    new Map(),
  );
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  useEffect(() => {
    if (!enabled) return;

    let raf: number;

    const tick = () => {
      const now = Date.now();
      const next = new Map<K, [number, number]>();

      for (const [key, entity] of entitiesRef.current) {
        if (entity.lat === 0 && entity.lon === 0) continue;
        const dtSeconds = (now - entity.lastUpdate) / 1000;
        next.set(
          key,
          deadReckon(entity.lat, entity.lon, entity.speed, entity.course, dtSeconds),
        );
      }

      setPositions(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return positions;
}
