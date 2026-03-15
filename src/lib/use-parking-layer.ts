"use client";

import { useEffect, useState, useRef } from "react";

export interface ParkingBay {
  bay_id: number;
  st_marker_id: string;
  status: string;
  lat: number;
  lon: number;
}

/**
 * Fetch parking sensor data. Refreshes every 5 minutes when enabled.
 */
export function useParkingLayer(enabled: boolean) {
  const [bays, setBays] = useState<ParkingBay[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBays([]);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const load = () => {
      setLoading(true);
      fetch("/api/parking")
        .then((res) => res.json())
        .then((data: ParkingBay[]) => {
          if (Array.isArray(data)) setBays(data);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    };

    load();
    // Refresh every 5 minutes for real-time occupancy
    intervalRef.current = setInterval(load, 5 * 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);

  return { bays, loading };
}
