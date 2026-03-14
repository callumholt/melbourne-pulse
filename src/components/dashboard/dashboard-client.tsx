"use client";

import { useCallback, useRef } from "react";
import { PRECINCTS } from "@/lib/constants";
import { PrecinctGrid } from "./precinct-grid";
import { TrafficMap, type TrafficMapHandle } from "./traffic-map";
import { useTheme } from "@/components/theme-toggle";

interface TreeStats {
  tree_count: number;
  species_count: number;
  health_score: number;
}

interface PrecinctData {
  id: string;
  name: string;
  colour: string;
  count: number;
  historicalMax: number;
  ratio: number;
  treeStats?: TreeStats | null;
}

interface SensorData {
  sensor_id: number;
  sensor_name: string;
  lat: number;
  lon: number;
  precinct_id: string;
  total_count: number;
}

interface DashboardClientProps {
  precinctData: PrecinctData[];
  sensorData: SensorData[];
  precinctNames: Record<string, { name: string; colour: string }>;
  chartDate: string;
}

export function DashboardClient({
  precinctData,
  sensorData,
  precinctNames,
  chartDate,
}: DashboardClientProps) {
  const mapRef = useRef<TrafficMapHandle>(null);
  const { theme } = useTheme();

  const handlePrecinctClick = useCallback((precinctId: string) => {
    const precinct = PRECINCTS.find((p) => p.id === precinctId);
    if (precinct) {
      // Scroll map into view first
      const mapSection = document.getElementById("sensor-map");
      if (mapSection) {
        mapSection.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // Delay flyTo slightly to allow scroll to complete
      setTimeout(() => {
        mapRef.current?.flyTo(precinct.lat, precinct.lon, 16);
      }, 400);
    }
  }, []);

  return (
    <>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Precincts</h2>
        <PrecinctGrid precincts={precinctData} onLocateClick={handlePrecinctClick} />
      </section>

      <div id="sensor-map">
        <TrafficMap
          ref={mapRef}
          initialSensors={sensorData}
          precinctNames={precinctNames}
          initialDate={chartDate}
          theme={theme}
        />
      </div>
    </>
  );
}
