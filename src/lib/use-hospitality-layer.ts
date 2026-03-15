"use client";

import { useEffect, useState } from "react";

export interface HospitalityVenue {
  id: string;
  name: string;
  address: string;
  area: string;
  type: "cafe" | "bar";
  industry: string;
  capacity: number;
  lat: number;
  lon: number;
}

/**
 * Fetch cafes, restaurants, and bars for the map layer.
 */
export function useHospitalityLayer(enabled: boolean) {
  const [venues, setVenues] = useState<HospitalityVenue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVenues([]);
      return;
    }

    setLoading(true);
    fetch("/api/hospitality")
      .then((res) => res.json())
      .then((data: HospitalityVenue[]) => {
        if (Array.isArray(data)) setVenues(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enabled]);

  return { venues, loading };
}
