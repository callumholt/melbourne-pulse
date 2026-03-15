"use client";

import { useEffect, useState } from "react";

/**
 * Fetch building footprints GeoJSON for the 3D buildings layer.
 */
export function useBuildingLayer(enabled: boolean) {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setGeojson(null);
      return;
    }

    setLoading(true);
    fetch("/api/buildings")
      .then((res) => res.json())
      .then((data: GeoJSON.FeatureCollection) => {
        if (data && data.type === "FeatureCollection") {
          setGeojson(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enabled]);

  return { geojson, loading };
}
