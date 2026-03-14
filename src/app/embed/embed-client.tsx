"use client";

import dynamic from "next/dynamic";
import type { LayerMode } from "@/components/dashboard/traffic-map-inner";

const MapInner = dynamic(() => import("@/components/dashboard/traffic-map-inner"), { ssr: false });

interface SensorData {
  sensor_id: number;
  sensor_name: string;
  lat: number;
  lon: number;
  precinct_id: string;
  total_count: number;
}

interface EmbedClientProps {
  sensors: SensorData[];
  precinctNames: Record<string, { name: string; colour: string }>;
  chartDate: string;
  layerMode: LayerMode;
  showControls: boolean;
}

export function EmbedClient({ sensors, precinctNames, layerMode, showControls }: EmbedClientProps) {
  return (
    <div className="h-screen w-screen">
      <MapInner
        sensors={sensors}
        precinctNames={precinctNames}
        layerMode={layerMode}
        theme="dark"
      />
      {showControls && (
        <div className="absolute bottom-3 right-3 z-10 rounded-md bg-black/60 px-2.5 py-1.5 backdrop-blur-sm">
          <a
            href="https://melbourne-pulse.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/70 hover:text-white"
          >
            Melbourne Pulse
          </a>
        </div>
      )}
    </div>
  );
}
