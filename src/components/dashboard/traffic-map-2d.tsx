"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Map as MapLibre, Marker, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface SensorData {
  sensor_id: number;
  sensor_name: string;
  lat: number;
  lon: number;
  precinct_id: string;
  total_count: number;
}

export interface Map2DHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
}

interface TrafficMap2DProps {
  sensors: SensorData[];
  precinctNames: Record<string, { name: string; colour: string }>;
  theme?: "dark" | "light";
}

const MELBOURNE_CENTER: [number, number] = [144.9631, -37.8136];

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(107, 114, 128, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

const TrafficMap2D = forwardRef<Map2DHandle, TrafficMap2DProps>(function TrafficMap2D(
  { sensors, precinctNames, theme = "dark" },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lon: number, zoom = 16) => {
      mapRef.current?.flyTo({ center: [lon, lat], zoom, duration: 1500 });
    },
  }));

  // Initialise map
  useEffect(() => {
    if (!containerRef.current) return;

    const tileVariant = theme === "dark" ? "dark_all" : "light_all";
    const map = new MapLibre({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-tiles": {
            type: "raster",
            tiles: [`https://a.basemaps.cartocdn.com/${tileVariant}/{z}/{x}/{y}@2x.png`],
            tileSize: 256,
          },
        },
        layers: [
          { id: "carto-layer", type: "raster", source: "carto-tiles", minzoom: 0, maxzoom: 20 },
        ],
      },
      center: MELBOURNE_CENTER,
      zoom: 13.5,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when sensor data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    for (const m of markersRef.current) {
      m.remove();
    }
    markersRef.current = [];

    const maxCount = Math.max(...sensors.map((s) => Number(s.total_count)), 1);

    for (const sensor of sensors) {
      const count = Number(sensor.total_count);
      if (count === 0) continue;

      const ratio = count / maxCount;
      const colour = precinctNames[sensor.precinct_id]?.colour ?? "#6b7280";
      const size = 8 + ratio * 24;

      const el = document.createElement("div");
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = "50%";
      el.style.backgroundColor = hexToRgba(colour, 0.7);
      el.style.border = `2px solid ${colour}`;
      el.style.cursor = "pointer";

      const popup = new Popup({ offset: 10, closeButton: false }).setHTML(
        `<div style="font-family: sans-serif; font-size: 12px;">
          <strong>${sensor.sensor_name}</strong><br/>
          <span style="color: ${colour}">${precinctNames[sensor.precinct_id]?.name ?? sensor.precinct_id}</span><br/>
          <strong>${count.toLocaleString()}</strong> pedestrians
        </div>`
      );

      const marker = new Marker({ element: el })
        .setLngLat([sensor.lon, sensor.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [sensors, precinctNames]);

  return <div ref={containerRef} className="h-full w-full" />;
});

export default TrafficMap2D;
