"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Deck } from "@deck.gl/core";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Vessel } from "@/lib/use-ais-stream";

interface SensorData {
  sensor_id: number;
  sensor_name: string;
  lat: number;
  lon: number;
  precinct_id: string;
  total_count: number;
}

interface MapInnerProps {
  sensors: SensorData[];
  precinctNames: Record<string, { name: string; colour: string }>;
  vessels?: Map<number, Vessel>;
}

const MELBOURNE_CENTER = { longitude: 144.9631, latitude: -37.8136 };
const INITIAL_VIEW = {
  ...MELBOURNE_CENTER,
  zoom: 14.5,
  pitch: 55,
  bearing: -20,
};

const DARK_STYLE = {
  version: 8 as const,
  sources: {
    "carto-dark": {
      type: "raster" as const,
      tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto-dark-layer",
      type: "raster" as const,
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

// AIS ship type codes -> human-readable categories
function getShipTypeName(type: number | null): string | null {
  if (type == null) return null;
  if (type >= 20 && type <= 29) return "Wing in Ground";
  if (type === 30) return "Fishing";
  if (type === 31 || type === 32) return "Towing";
  if (type === 33) return "Dredging";
  if (type === 34) return "Diving Ops";
  if (type === 35) return "Military";
  if (type === 36) return "Sailing";
  if (type === 37) return "Pleasure Craft";
  if (type >= 40 && type <= 49) return "High Speed Craft";
  if (type === 50) return "Pilot Vessel";
  if (type === 51) return "Search & Rescue";
  if (type === 52) return "Tug";
  if (type === 53) return "Port Tender";
  if (type === 55) return "Law Enforcement";
  if (type >= 60 && type <= 69) return "Passenger";
  if (type >= 70 && type <= 79) return "Cargo";
  if (type >= 80 && type <= 89) return "Tanker";
  return "Other";
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [107, 114, 128];
}

type TooltipData =
  | { type: "sensor"; x: number; y: number; sensor: SensorData }
  | { type: "vessel"; x: number; y: number; vessel: Vessel };

export default function MapInner({ sensors, precinctNames, vessels }: MapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Initialise map and deck
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibre({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
      zoom: INITIAL_VIEW.zoom,
      pitch: INITIAL_VIEW.pitch,
      bearing: INITIAL_VIEW.bearing,
    });

    const deck = new Deck({
      parent: containerRef.current,
      style: { position: "absolute", zIndex: "1", pointerEvents: "none" },
      initialViewState: INITIAL_VIEW,
      controller: false,
      layers: [],
      getTooltip: () => null,
    });

    map.on("move", () => {
      const center = map.getCenter();
      deck.setProps({
        initialViewState: {
          longitude: center.lng,
          latitude: center.lat,
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
          transitionDuration: 0,
        },
      });
    });

    mapRef.current = map;
    deckRef.current = deck;

    return () => {
      deck.finalize();
      map.remove();
      mapRef.current = null;
      deckRef.current = null;
    };
  }, []);

  // Update layers when data changes
  useEffect(() => {
    if (!deckRef.current) return;

    const maxCount = Math.max(...sensors.map((s) => Number(s.total_count)), 1);

    const sensorLayer = new ColumnLayer<SensorData>({
      id: "sensor-columns",
      data: sensors,
      diskResolution: 12,
      radius: 25,
      extruded: true,
      pickable: true,
      elevationScale: 1,
      getPosition: (d) => [d.lon, d.lat],
      getFillColor: (d) => {
        const count = Number(d.total_count);
        if (count === 0) return [107, 114, 128, 40] as [number, number, number, number];
        const colour = precinctNames[d.precinct_id]?.colour ?? "#6b7280";
        const rgb = hexToRgb(colour);
        const ratio = count / maxCount;
        const alpha = Math.floor(140 + ratio * 115);
        return [...rgb, alpha] as [number, number, number, number];
      },
      getElevation: (d) => {
        const ratio = Number(d.total_count) / maxCount;
        return Math.max(ratio * 800, 2);
      },
      onHover: (info) => {
        if (info.object) {
          setTooltip({ type: "sensor", x: info.x, y: info.y, sensor: info.object });
        } else {
          setTooltip((prev) => prev?.type === "sensor" ? null : prev);
        }
      },
      updateTriggers: {
        getFillColor: [sensors],
        getElevation: [sensors],
      },
    });

    const layers = [sensorLayer];

    // Vessel layer
    if (vessels && vessels.size > 0) {
      const vesselArray = Array.from(vessels.values());

      const vesselLayer = new ScatterplotLayer<Vessel>({
        id: "vessel-markers",
        data: vesselArray,
        pickable: true,
        stroked: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 4,
        radiusMaxPixels: 12,
        lineWidthMinPixels: 1,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => {
          // Larger for moving vessels
          return d.sog > 1 ? 80 : 50;
        },
        getFillColor: (d) => {
          // Colour by speed: stationary=amber, slow=cyan, fast=green
          if (d.sog < 0.5) return [245, 158, 11, 200] as [number, number, number, number];
          if (d.sog < 5) return [6, 182, 212, 220] as [number, number, number, number];
          return [34, 197, 94, 230] as [number, number, number, number];
        },
        getLineColor: [255, 255, 255, 120],
        getLineWidth: 1,
        onHover: (info) => {
          if (info.object) {
            setTooltip({ type: "vessel", x: info.x, y: info.y, vessel: info.object });
          } else {
            setTooltip((prev) => prev?.type === "vessel" ? null : prev);
          }
        },
        updateTriggers: {
          getPosition: [vessels],
          getFillColor: [vessels],
          getRadius: [vessels],
        },
      });

      layers.push(vesselLayer as unknown as typeof sensorLayer);
    }

    deckRef.current.setProps({ layers });
  }, [sensors, precinctNames, vessels]);

  // Enable pointer events on deck canvas for hover
  useEffect(() => {
    if (!containerRef.current) return;
    const deckCanvas = containerRef.current.querySelector("canvas:last-of-type");
    if (deckCanvas) {
      (deckCanvas as HTMLElement).style.pointerEvents = "auto";
    }
  });

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {tooltip?.type === "sensor" && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-border/40 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
        >
          <div className="font-semibold">{tooltip.sensor.sensor_name}</div>
          <div
            className="text-xs"
            style={{ color: precinctNames[tooltip.sensor.precinct_id]?.colour }}
          >
            {precinctNames[tooltip.sensor.precinct_id]?.name ?? tooltip.sensor.precinct_id}
          </div>
          <div className="mt-1 text-base font-bold tabular-nums">
            {Number(tooltip.sensor.total_count).toLocaleString()} pedestrians
          </div>
        </div>
      )}
      {tooltip?.type === "vessel" && (() => {
        const v = tooltip.vessel;
        const typeName = getShipTypeName(v.shipType);
        return (
          <div
            className="pointer-events-none absolute z-50 min-w-[200px] rounded-lg border border-border/40 bg-popover px-3 py-2.5 text-sm text-popover-foreground shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
          >
            <div className="font-semibold">{v.name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {typeName && <span className="text-cyan-400">{typeName}</span>}
              {v.callSign && <span>{v.callSign}</span>}
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">Speed</span>
              <span className="font-medium tabular-nums">{v.sog.toFixed(1)} kn</span>

              <span className="text-muted-foreground">Course</span>
              <span className="font-medium tabular-nums">{Math.round(v.cog)}&deg;</span>

              {v.destination && (
                <>
                  <span className="text-muted-foreground">Destination</span>
                  <span className="font-medium">{v.destination}</span>
                </>
              )}

              {v.length && v.width ? (
                <>
                  <span className="text-muted-foreground">Size</span>
                  <span className="font-medium tabular-nums">{v.length}m x {v.width}m</span>
                </>
              ) : null}

              {v.draught ? (
                <>
                  <span className="text-muted-foreground">Draught</span>
                  <span className="font-medium tabular-nums">{v.draught}m</span>
                </>
              ) : null}

              {v.imo ? (
                <>
                  <span className="text-muted-foreground">IMO</span>
                  <span className="font-medium tabular-nums">{v.imo}</span>
                </>
              ) : null}
            </div>

            <div className="mt-1.5 text-[10px] text-muted-foreground/60">
              MMSI {v.mmsi}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
