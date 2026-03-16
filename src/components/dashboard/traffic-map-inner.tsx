"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo } from "react";
import { Map as MapLibre, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Deck } from "@deck.gl/core";
import { ColumnLayer, ScatterplotLayer, PathLayer, GeoJsonLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { LightingEffect, AmbientLight, DirectionalLight } from "@deck.gl/core";
import { getSunState } from "@/lib/sun-position";
import type { Vessel } from "@/lib/use-ais-stream";
import type { Aircraft } from "@/lib/use-aircraft-stream";
import type { VesselTrail } from "@/lib/use-vessel-trails";
import type { TreeMapPoint } from "@/lib/use-tree-layer";
import type { ParkingBay } from "@/lib/use-parking-layer";
import type { HospitalityVenue } from "@/lib/use-hospitality-layer";
import type { FlowTrip } from "@/lib/flow-inference";

export interface SensorData {
  sensor_id: number;
  sensor_name: string;
  lat: number;
  lon: number;
  precinct_id: string;
  total_count: number;
}

export type LayerMode = "columns" | "heatmap";

export interface MapInnerHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
}

interface MapInnerProps {
  sensors: SensorData[];
  precinctNames: Record<string, { name: string; colour: string }>;
  vessels?: Map<number, Vessel>;
  vesselTrails?: VesselTrail[];
  aircraft?: Map<string, Aircraft>;
  animatedVesselPositions?: Map<number, [number, number]>;
  animatedAircraftPositions?: Map<string, [number, number]>;
  trees?: TreeMapPoint[];
  parkingBays?: ParkingBay[];
  hospitalityVenues?: HospitalityVenue[];
  buildingGeojson?: GeoJSON.FeatureCollection | null;
  flowTrips?: FlowTrip[];
  layerMode?: LayerMode;
  currentHour?: number | null;
  theme?: "dark" | "light";
  visibleLayers?: { sensors: boolean; vessels: boolean; trees: boolean; parking: boolean; hospitality: boolean; buildings: boolean; flow: boolean; aircraft: boolean };
  precinctFilter?: string | null;
}

const MELBOURNE_CENTER = { longitude: 144.9631, latitude: -37.8136 };
const INITIAL_VIEW = {
  ...MELBOURNE_CENTER,
  zoom: 14.5,
  pitch: 55,
  bearing: -20,
};

function makeStyle(theme: "dark" | "light") {
  // dark_all: dark basemap; voyager: high-contrast light basemap with coloured roads/labels
  const tileVariant = theme === "dark" ? "dark_all" : "voyager";
  return {
    version: 8 as const,
    sources: {
      "carto-tiles": {
        type: "raster" as const,
        tiles: [`https://a.basemaps.cartocdn.com/${tileVariant}/{z}/{x}/{y}@2x.png`],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      },
    },
    layers: [
      {
        id: "carto-layer",
        type: "raster" as const,
        source: "carto-tiles",
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

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
  | { type: "vessel"; x: number; y: number; vessel: Vessel }
  | { type: "aircraft"; x: number; y: number; aircraft: Aircraft }
  | { type: "tree"; x: number; y: number; tree: TreeMapPoint }
  | { type: "parking"; x: number; y: number; bay: ParkingBay }
  | { type: "hospitality"; x: number; y: number; venue: HospitalityVenue }
  | { type: "building"; x: number; y: number; properties: Record<string, unknown> };

const DEFAULT_VISIBLE = { sensors: true, vessels: true, trees: false, parking: false, hospitality: false, buildings: false, flow: false, aircraft: true };

const MapInner = forwardRef<MapInnerHandle, MapInnerProps>(function MapInner(
  { sensors, precinctNames, vessels, vesselTrails, aircraft, animatedVesselPositions, animatedAircraftPositions, trees, parkingBays, hospitalityVenues, buildingGeojson, flowTrips, layerMode = "columns", currentHour, theme = "dark", visibleLayers = DEFAULT_VISIBLE, precinctFilter },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const currentThemeRef = useRef(theme);

  // Expose flyTo via ref
  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lon: number, zoom = 16) => {
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [lon, lat],
          zoom,
          pitch: 55,
          bearing: -20,
          duration: 1500,
        });
      }
    },
  }));

  // Compute lighting effect based on current hour
  const lightingEffect = useMemo(() => {
    if (currentHour == null) {
      // Default daytime lighting
      const ambient = new AmbientLight({ color: [255, 255, 255], intensity: 1.0 });
      const dir = new DirectionalLight({
        color: [255, 245, 230],
        intensity: 1.2,
        direction: [-1, -3, -1],
      });
      return new LightingEffect({ ambient, directional: dir });
    }

    const sun = getSunState(currentHour);
    const ambient = new AmbientLight({
      color: [255, 255, 255],
      intensity: 0.3 + sun.ambientLight * 0.5,
    });

    // Convert sun azimuth/altitude to directional vector
    const az = sun.azimuth;
    const alt = Math.max(sun.altitude, 0.05);
    const dir = new DirectionalLight({
      color: sun.sunColor,
      intensity: 0.5 + sun.ambientLight * 1.5,
      direction: [
        -Math.sin(az) * Math.cos(alt),
        -Math.cos(az) * Math.cos(alt),
        -Math.sin(alt),
      ],
    });

    return new LightingEffect({ ambient, directional: dir });
  }, [currentHour]);

  // Initialise map and deck
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibre({
      container: containerRef.current,
      style: makeStyle(theme),
      center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
      zoom: INITIAL_VIEW.zoom,
      pitch: INITIAL_VIEW.pitch,
      bearing: INITIAL_VIEW.bearing,
    });

    map.addControl(
      new NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }),
      "top-right",
    );

    const deck = new Deck({
      parent: containerRef.current,
      style: { position: "absolute", zIndex: "1", pointerEvents: "none" },
      initialViewState: INITIAL_VIEW,
      controller: false,
      layers: [],
      effects: [lightingEffect],
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map style when theme changes
  useEffect(() => {
    if (!mapRef.current || theme === currentThemeRef.current) return;
    currentThemeRef.current = theme;
    mapRef.current.setStyle(makeStyle(theme));
  }, [theme]);

  // Update base map opacity based on time of day
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentHour == null) return;

    const sun = getSunState(currentHour);
    const opacity = 0.3 + sun.ambientLight * 0.7;

    const setOpacity = () => {
      if (map.getLayer("carto-layer")) {
        map.setPaintProperty("carto-layer", "raster-opacity", opacity);
      }
    };

    if (map.isStyleLoaded()) {
      setOpacity();
    } else {
      map.once("styledata", setOpacity);
    }
  }, [currentHour]);

  // Update lighting effect
  useEffect(() => {
    if (deckRef.current) {
      deckRef.current.setProps({ effects: [lightingEffect] });
    }
  }, [lightingEffect]);

  // Update layers when data changes
  useEffect(() => {
    if (!deckRef.current) return;

    // Apply precinct filter to sensors
    const filteredSensors = precinctFilter
      ? sensors.filter((s) => s.precinct_id === precinctFilter)
      : sensors;

    const maxCount = Math.max(...filteredSensors.map((s) => Number(s.total_count)), 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any[] = [];

    if (visibleLayers.sensors && layerMode === "columns") {
      const sensorLayer = new ColumnLayer<SensorData>({
        id: "sensor-columns",
        data: filteredSensors,
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
      layers.push(sensorLayer);
    } else if (visibleLayers.sensors) {
      // Heatmap layer
      const heatmapLayer = new HeatmapLayer<SensorData>({
        id: "sensor-heatmap",
        data: filteredSensors.filter((s) => Number(s.total_count) > 0),
        getPosition: (d) => [d.lon, d.lat],
        getWeight: (d) => Number(d.total_count),
        radiusPixels: 60,
        intensity: 1,
        threshold: 0.05,
        colorRange: [
          [1, 152, 189],
          [73, 227, 206],
          [216, 254, 181],
          [254, 237, 177],
          [254, 173, 84],
          [209, 55, 78],
        ],
      });
      layers.push(heatmapLayer);
    }

    // Tree layer
    if (visibleLayers.trees && trees && trees.length > 0) {
      const treeLayer = new ScatterplotLayer<TreeMapPoint>({
        id: "tree-markers",
        data: precinctFilter ? trees.filter((t) => t.precinct_id === precinctFilter) : trees,
        pickable: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 30,
        getFillColor: (d) => {
          // Colour by health/useful life
          const life = d.useful_life_value ?? 15;
          if (life > 20) return [34, 197, 94, 180] as [number, number, number, number]; // healthy green
          if (life > 10) return [250, 204, 21, 160] as [number, number, number, number]; // ageing yellow
          return [239, 68, 68, 160] as [number, number, number, number]; // declining red
        },
        onHover: (info) => {
          if (info.object) {
            setTooltip({ type: "tree", x: info.x, y: info.y, tree: info.object });
          } else {
            setTooltip((prev) => prev?.type === "tree" ? null : prev);
          }
        },
        updateTriggers: {
          getFillColor: [trees],
        },
      });
      layers.push(treeLayer);
    }

    // Vessel trail lines
    if (visibleLayers.vessels && vesselTrails && vesselTrails.length > 0) {
      const trailLayer = new PathLayer<VesselTrail>({
        id: "vessel-trails",
        data: vesselTrails,
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        getWidth: 2,
        widthMinPixels: 1,
        widthMaxPixels: 4,
        capRounded: true,
        jointRounded: true,
        opacity: 0.6,
      });
      layers.push(trailLayer);
    }

    // Vessel markers (animated)
    if (visibleLayers.vessels && vessels && vessels.size > 0) {
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
        getPosition: (d) => {
          const anim = animatedVesselPositions?.get(d.mmsi);
          return anim ? [anim[1], anim[0]] : [d.lon, d.lat];
        },
        getRadius: (d) => {
          return d.sog > 1 ? 80 : 50;
        },
        getFillColor: (d) => {
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
          getPosition: [animatedVesselPositions],
          getFillColor: [vessels],
          getRadius: [vessels],
        },
      });

      layers.push(vesselLayer);
    }

    // Aircraft markers (animated)
    if (visibleLayers.aircraft && aircraft && aircraft.size > 0) {
      const aircraftArray = Array.from(aircraft.values());

      const isDark = theme === "dark";

      const aircraftLayer = new ScatterplotLayer<Aircraft>({
        id: "aircraft-markers",
        data: aircraftArray,
        pickable: true,
        stroked: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 6,
        radiusMaxPixels: 16,
        lineWidthMinPixels: 2,
        getPosition: (d) => {
          // Use altitude as Z coordinate so aircraft render at their actual height
          const alt = d.onGround ? 0 : (d.altitude ?? 0);
          if (!d.onGround) {
            const anim = animatedAircraftPositions?.get(d.icao24);
            if (anim) return [anim[1], anim[0], alt];
          }
          return [d.lon, d.lat, alt];
        },
        getRadius: (d) => {
          if (d.onGround) return 60;
          return d.velocity > 100 ? 120 : 80;
        },
        getFillColor: (d) => {
          // Ground aircraft: orange on dark, dark orange on light
          if (d.onGround) return isDark
            ? [245, 158, 11, 180] as [number, number, number, number]
            : [217, 119, 6, 220] as [number, number, number, number];
          // Airborne: colour by altitude with strong contrast for both themes
          const alt = d.altitude ?? 0;
          if (alt < 1000) return [220, 38, 38, 230] as [number, number, number, number];   // red — low
          if (alt < 5000) return [168, 34, 220, 240] as [number, number, number, number];   // purple — mid
          return isDark
            ? [232, 121, 249, 240] as [number, number, number, number]   // bright magenta — high (dark)
            : [126, 34, 206, 240] as [number, number, number, number];   // deep violet — high (light)
        },
        getLineColor: isDark ? [255, 255, 255, 140] : [0, 0, 0, 100],
        getLineWidth: 1.5,
        onHover: (info) => {
          if (info.object) {
            setTooltip({ type: "aircraft", x: info.x, y: info.y, aircraft: info.object });
          } else {
            setTooltip((prev) => prev?.type === "aircraft" ? null : prev);
          }
        },
        updateTriggers: {
          getPosition: [animatedAircraftPositions],
          getFillColor: [aircraft, theme],
          getRadius: [aircraft],
          getLineColor: [theme],
        },
      });

      layers.push(aircraftLayer);

      // Altitude stems — vertical lines from ground to airborne aircraft
      const airborne = aircraftArray.filter((a) => !a.onGround && (a.altitude ?? 0) > 50);
      if (airborne.length > 0) {
        const stemLayer = new PathLayer<Aircraft>({
          id: "aircraft-altitude-stems",
          data: airborne,
          getPath: (d) => {
            const alt = d.altitude ?? 0;
            const anim = animatedAircraftPositions?.get(d.icao24);
            const lon = anim ? anim[1] : d.lon;
            const lat = anim ? anim[0] : d.lat;
            return [[lon, lat, 0], [lon, lat, alt]];
          },
          getColor: isDark ? [255, 255, 255, 40] : [0, 0, 0, 30],
          getWidth: 1,
          widthMinPixels: 1,
          widthMaxPixels: 1,
          updateTriggers: {
            getPath: [animatedAircraftPositions],
          },
        });
        layers.push(stemLayer);

        // Ground shadow — small dot at ground level below each aircraft
        const shadowLayer = new ScatterplotLayer<Aircraft>({
          id: "aircraft-shadows",
          data: airborne,
          filled: true,
          stroked: false,
          radiusMinPixels: 3,
          radiusMaxPixels: 8,
          getPosition: (d) => {
            const anim = animatedAircraftPositions?.get(d.icao24);
            const lon = anim ? anim[1] : d.lon;
            const lat = anim ? anim[0] : d.lat;
            return [lon, lat, 0];
          },
          getRadius: 40,
          getFillColor: isDark ? [255, 255, 255, 30] : [0, 0, 0, 20],
          updateTriggers: {
            getPosition: [animatedAircraftPositions],
          },
        });
        layers.push(shadowLayer);
      }
    }

    // Parking bay layer
    if (visibleLayers.parking && parkingBays && parkingBays.length > 0) {
      const parkingLayer = new ScatterplotLayer<ParkingBay>({
        id: "parking-bays",
        data: parkingBays,
        pickable: true,
        filled: true,
        stroked: true,
        radiusScale: 1,
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
        lineWidthMinPixels: 0.5,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 15,
        getFillColor: (d) => {
          return d.status === "Unoccupied"
            ? [34, 197, 94, 200] as [number, number, number, number]   // green = available
            : [239, 68, 68, 180] as [number, number, number, number];  // red = occupied
        },
        getLineColor: [255, 255, 255, 60],
        getLineWidth: 0.5,
        onHover: (info) => {
          if (info.object) {
            setTooltip({ type: "parking", x: info.x, y: info.y, bay: info.object });
          } else {
            setTooltip((prev) => prev?.type === "parking" ? null : prev);
          }
        },
        updateTriggers: {
          getFillColor: [parkingBays],
        },
      });
      layers.push(parkingLayer);
    }

    // Hospitality venues layer
    if (visibleLayers.hospitality && hospitalityVenues && hospitalityVenues.length > 0) {
      const maxCapacity = Math.max(...hospitalityVenues.map((v) => v.capacity), 1);
      const hospitalityLayer = new ScatterplotLayer<HospitalityVenue>({
        id: "hospitality-venues",
        data: hospitalityVenues,
        pickable: true,
        filled: true,
        stroked: true,
        radiusScale: 1,
        radiusMinPixels: 3,
        radiusMaxPixels: 14,
        lineWidthMinPixels: 0.5,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => {
          const ratio = d.capacity / maxCapacity;
          return 20 + ratio * 80;
        },
        getFillColor: (d) => {
          return d.type === "cafe"
            ? [251, 146, 60, 190] as [number, number, number, number]   // orange for cafes
            : [168, 85, 247, 190] as [number, number, number, number];  // purple for bars
        },
        getLineColor: [255, 255, 255, 80],
        getLineWidth: 0.5,
        onHover: (info) => {
          if (info.object) {
            setTooltip({ type: "hospitality", x: info.x, y: info.y, venue: info.object });
          } else {
            setTooltip((prev) => prev?.type === "hospitality" ? null : prev);
          }
        },
        updateTriggers: {
          getFillColor: [hospitalityVenues],
          getRadius: [hospitalityVenues],
        },
      });
      layers.push(hospitalityLayer);
    }

    // Building footprints (3D extruded)
    if (visibleLayers.buildings && buildingGeojson) {
      const buildingLayer = new GeoJsonLayer({
        id: "building-footprints",
        data: buildingGeojson,
        pickable: true,
        filled: true,
        extruded: true,
        wireframe: true,
        getElevation: (f: GeoJSON.Feature) => {
          // Use building height if available, otherwise estimate from floors
          const props = f.properties || {};
          const height = props.height || props.bld_hgt || props.estimated_height;
          if (height) return Number(height);
          const floors = props.floors || props.storeys || props.bld_floors;
          if (floors) return Number(floors) * 3.5;
          return 15; // default 15m (~4 floors)
        },
        getFillColor: [160, 160, 180, 120],
        getLineColor: [200, 200, 220, 80],
        lineWidthMinPixels: 1,
        material: {
          ambient: 0.35,
          diffuse: 0.6,
          shininess: 32,
        },
        onHover: (info) => {
          if (info.object) {
            setTooltip({ type: "building", x: info.x, y: info.y, properties: info.object.properties || {} });
          } else {
            setTooltip((prev) => prev?.type === "building" ? null : prev);
          }
        },
      });
      // Insert buildings before other layers so they render behind
      layers.unshift(buildingLayer);
    }

    // Pedestrian flow layer (animated trails between sensors)
    if (visibleLayers.flow && flowTrips && flowTrips.length > 0 && currentHour != null) {
      const flowLayer = new TripsLayer<FlowTrip>({
        id: "pedestrian-flow",
        data: flowTrips,
        getPath: (d) => d.path,
        getTimestamps: (d) => d.timestamps,
        getColor: (d) => [...d.color, Math.round(140 + d.magnitude * 115)] as [number, number, number, number],
        getWidth: (d) => 2 + d.magnitude * 6,
        widthMinPixels: 1.5,
        widthMaxPixels: 10,
        capRounded: true,
        jointRounded: true,
        trailLength: 0.6,  // trail fades over 0.6 hours (~36 min)
        currentTime: currentHour,
        opacity: 0.85,
        updateTriggers: {
          getColor: [flowTrips],
          getWidth: [flowTrips],
        },
      });
      layers.push(flowLayer);
    }

    deckRef.current.setProps({ layers });
  }, [sensors, precinctNames, vessels, vesselTrails, aircraft, animatedVesselPositions, animatedAircraftPositions, trees, parkingBays, hospitalityVenues, buildingGeojson, flowTrips, currentHour, layerMode, visibleLayers, precinctFilter]);

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
      {tooltip?.type === "aircraft" && (() => {
        const a = tooltip.aircraft;
        const altStr = a.altitude != null ? `${Math.round(a.altitude).toLocaleString()}m` : "N/A";
        const speedKts = Math.round(a.velocity * 1.94384); // m/s to knots
        const vertStr = a.verticalRate != null
          ? a.verticalRate > 0.5 ? "Climbing" : a.verticalRate < -0.5 ? "Descending" : "Level"
          : null;
        return (
          <div
            className="pointer-events-none absolute z-50 min-w-[180px] rounded-lg border border-border/40 bg-popover px-3 py-2.5 text-sm text-popover-foreground shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
          >
            <div className="font-semibold">{a.callsign || a.icao24}</div>
            <div className="text-xs text-muted-foreground">
              {a.originCountry}
              {a.callsign && <span className="ml-2 text-fuchsia-400">{a.icao24}</span>}
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">Altitude</span>
              <span className="font-medium tabular-nums">{altStr}</span>

              <span className="text-muted-foreground">Speed</span>
              <span className="font-medium tabular-nums">{speedKts} kn</span>

              <span className="text-muted-foreground">Track</span>
              <span className="font-medium tabular-nums">{Math.round(a.track)}&deg;</span>

              {vertStr && (
                <>
                  <span className="text-muted-foreground">Vertical</span>
                  <span className="font-medium">{vertStr}</span>
                </>
              )}
            </div>
          </div>
        );
      })()}
      {tooltip?.type === "tree" && (() => {
        const t = tooltip.tree;
        const life = t.useful_life_value ?? 0;
        const healthColour = life > 20 ? "text-green-400" : life > 10 ? "text-yellow-400" : "text-red-400";
        return (
          <div
            className="pointer-events-none absolute z-50 rounded-lg border border-border/40 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
          >
            <div className="font-semibold">{t.common_name}</div>
            <div className="text-xs italic text-muted-foreground">{t.scientific_name}</div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t.age_description}</span>
              {t.useful_life_value != null && (
                <span className={`font-medium ${healthColour}`}>
                  {t.useful_life_value}yr lifespan
                </span>
              )}
            </div>
          </div>
        );
      })()}
      {tooltip?.type === "parking" && (() => {
        const b = tooltip.bay;
        const isAvailable = b.status === "Unoccupied";
        return (
          <div
            className="pointer-events-none absolute z-50 rounded-lg border border-border/40 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
          >
            <div className="font-semibold">Bay {b.st_marker_id}</div>
            <div className={`mt-0.5 text-xs font-medium ${isAvailable ? "text-green-400" : "text-red-400"}`}>
              {isAvailable ? "Available" : "Occupied"}
            </div>
          </div>
        );
      })()}
      {tooltip?.type === "hospitality" && (() => {
        const v = tooltip.venue;
        return (
          <div
            className="pointer-events-none absolute z-50 rounded-lg border border-border/40 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
          >
            <div className="font-semibold">{v.name}</div>
            <div className="text-xs text-muted-foreground">{v.address}</div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={v.type === "cafe" ? "text-orange-400" : "text-purple-400"}>
                {v.industry}
              </span>
            </div>
            {v.capacity > 0 && (
              <div className="mt-0.5 text-xs font-medium">
                {v.capacity} {v.type === "cafe" ? "seats" : "patrons"}
              </div>
            )}
          </div>
        );
      })()}
      {tooltip?.type === "building" && (() => {
        const p = tooltip.properties;
        const name = (p.bld_name || p.name || p.address || null) as string | null;
        const height = (p.height || p.bld_hgt || p.estimated_height || null) as number | null;
        const floors = (p.floors || p.storeys || p.bld_floors || null) as number | null;
        return (
          <div
            className="pointer-events-none absolute z-50 rounded-lg border border-border/40 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
          >
            {name && <div className="font-semibold">{String(name)}</div>}
            <div className="flex items-center gap-3 text-xs">
              {height && <span>Height: {Number(height).toFixed(0)}m</span>}
              {floors && <span>{String(floors)} floors</span>}
              {!name && !height && !floors && <span className="text-muted-foreground">Building</span>}
            </div>
          </div>
        );
      })()}
    </div>
  );
});

export default MapInner;
