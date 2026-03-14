"use client";

import { useEffect, useRef, useState } from "react";
import type { Vessel } from "./use-ais-stream";

export interface VesselTrail {
  mmsi: number;
  path: [number, number][]; // [lon, lat][]
  color: [number, number, number, number]; // RGBA
}

interface TrailPoint {
  lon: number;
  lat: number;
  timestamp: number;
}

const TRAIL_DURATION = 30 * 60 * 1000; // 30 minutes
const UPDATE_INTERVAL = 3000; // flush to React every 3s

/**
 * Accumulate vessel positions from the AIS stream into trails.
 * Each trail is a polyline of the vessel's recent path (last 30 minutes).
 */
export function useVesselTrails(vessels: Map<number, Vessel>, enabled: boolean) {
  const trailsRef = useRef<Map<number, TrailPoint[]>>(new Map());
  const [trails, setTrails] = useState<VesselTrail[]>([]);

  // Record vessel positions
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const trailMap = trailsRef.current;

      // Add current positions to trails
      for (const [mmsi, vessel] of vessels) {
        if (vessel.lat === 0 && vessel.lon === 0) continue;

        if (!trailMap.has(mmsi)) {
          trailMap.set(mmsi, []);
        }

        const points = trailMap.get(mmsi)!;
        const lastPoint = points[points.length - 1];

        // Only add if position has changed (avoid duplicate stationary points)
        if (
          !lastPoint ||
          Math.abs(lastPoint.lon - vessel.lon) > 0.00001 ||
          Math.abs(lastPoint.lat - vessel.lat) > 0.00001
        ) {
          points.push({ lon: vessel.lon, lat: vessel.lat, timestamp: now });
        }

        // Prune old points
        while (points.length > 0 && now - points[0].timestamp > TRAIL_DURATION) {
          points.shift();
        }
      }

      // Remove stale vessel trails
      for (const [mmsi, points] of trailMap) {
        if (points.length === 0 || now - points[points.length - 1].timestamp > TRAIL_DURATION) {
          trailMap.delete(mmsi);
        }
      }

      // Build trail data for rendering
      const trailData: VesselTrail[] = [];
      for (const [mmsi, points] of trailMap) {
        if (points.length < 2) continue;

        const vessel = vessels.get(mmsi);
        // Colour matching vessel layer: cyan for moving vessels
        const color: [number, number, number, number] = vessel && vessel.sog > 1
          ? [6, 182, 212, 140]
          : [245, 158, 11, 100];

        trailData.push({
          mmsi,
          path: points.map((p) => [p.lon, p.lat]),
          color,
        });
      }

      setTrails(trailData);
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [vessels, enabled]);

  return trails;
}
