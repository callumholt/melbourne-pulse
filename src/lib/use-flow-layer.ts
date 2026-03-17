"use client";

import { useMemo } from "react";
import { computeFlowTrips, type FlowTrip } from "./flow-inference";
import type { StreetRouteCache } from "./use-street-routes";

interface SensorPosition {
  sensor_id: number;
  lat: number;
  lon: number;
  precinct_id: string;
}

// Same type as traffic-map.tsx HourlyIndex
type HourlyIndex = Map<number, Float64Array>;

/**
 * Compute pedestrian flow trips from hourly sensor data.
 * Memoised so it only recalculates when the input data changes.
 */
export function useFlowLayer(
  enabled: boolean,
  sensors: SensorPosition[],
  hourlyIndex: HourlyIndex | null,
  streetRoutes?: StreetRouteCache,
): FlowTrip[] {
  return useMemo(() => {
    if (!enabled || !hourlyIndex || hourlyIndex.size === 0 || sensors.length === 0) {
      return [];
    }
    return computeFlowTrips(sensors, hourlyIndex, streetRoutes);
  }, [enabled, sensors, hourlyIndex, streetRoutes]);
}
