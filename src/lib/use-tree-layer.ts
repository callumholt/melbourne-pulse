"use client";

import { useEffect, useState } from "react";

export interface TreeMapPoint {
  com_id: string;
  lat: number;
  lon: number;
  common_name: string;
  scientific_name: string;
  age_description: string;
  useful_life_value: number | null;
  precinct_id: string | null;
}

/**
 * Fetch tree data for the map layer.
 */
export function useTreeLayer(enabled: boolean, precinctFilter?: string) {
  const [trees, setTrees] = useState<TreeMapPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setTrees([]);
      return;
    }

    setLoading(true);
    const params = precinctFilter ? `?precinct=${precinctFilter}` : "";
    fetch(`/api/trees${params}`)
      .then((res) => res.json())
      .then((data: TreeMapPoint[]) => {
        if (Array.isArray(data)) {
          setTrees(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enabled, precinctFilter]);

  return { trees, loading };
}
