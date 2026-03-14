"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Map as MapLibre, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { VegetationLegend } from "./vegetation-legend";
import { VegetationLayerControls } from "./vegetation-layer-controls";
import { VegetationInfoPanel } from "./vegetation-info-panel";
import { AddressSearch } from "./address-search";

const VIC_WFS_BASE = "https://opendata.maps.vic.gov.au/geoserver/wfs";

export type LayerKey = "evc" | "plantation" | "nativeForest" | "vicforests" | "treeDensity";

export type LayerVisibility = Record<LayerKey, boolean>;

export interface FeatureInfo {
  type: LayerKey;
  properties: Record<string, string | number | null>;
  lngLat: { lng: number; lat: number };
}

export interface LayerDef {
  key: LayerKey;
  label: string;
  wfsTypeName: string;
  sourceId: string;
  fillLayerId: string;
  outlineLayerId: string;
  minZoom: number;
  maxFeatures: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fillPaint: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outlinePaint: Record<string, any>;
}

export const LAYER_DEFS: LayerDef[] = [
  {
    key: "evc",
    label: "Ecological Vegetation Classes",
    wfsTypeName: "open-data-platform:nv2005_evcbcs",
    sourceId: "evc-source",
    fillLayerId: "evc-fill",
    outlineLayerId: "evc-outline",
    minZoom: 10,
    maxFeatures: 2000,
    fillPaint: {
      "fill-color": [
        "match", ["get", "evc_bcs_desc"],
        "Endangered", "#dc2626",
        "Vulnerable", "#f97316",
        "Depleted", "#eab308",
        "Rare", "#a855f7",
        "Least Concern", "#22c55e",
        "#6b7280",
      ],
      "fill-opacity": 0.45,
    },
    outlinePaint: { "line-color": "rgba(255,255,255,0.25)", "line-width": 0.5 },
  },
  {
    key: "plantation",
    label: "Plantations (Hardwood / Softwood)",
    wfsTypeName: "open-data-platform:plantation",
    sourceId: "plantation-source",
    fillLayerId: "plantation-fill",
    outlineLayerId: "plantation-outline",
    minZoom: 9,
    maxFeatures: 3000,
    fillPaint: {
      "fill-color": [
        "match", ["get", "plantation_type"],
        "HARDWOOD", "#7c3aed",
        "SOFTWOOD", "#c084fc",
        "#9333ea",
      ],
      "fill-opacity": 0.5,
    },
    outlinePaint: { "line-color": "rgba(192,132,252,0.5)", "line-width": 1 },
  },
  {
    key: "nativeForest",
    label: "Private Native Forest Stands",
    wfsTypeName: "open-data-platform:sveg100",
    sourceId: "native-forest-source",
    fillLayerId: "native-forest-fill",
    outlineLayerId: "native-forest-outline",
    minZoom: 10,
    maxFeatures: 2000,
    fillPaint: {
      "fill-color": [
        "match", ["get", "x_vegform"],
        "TALL OPEN FOREST", "#14532d",
        "OPEN FOREST", "#166534",
        "TALL WOODLAND", "#15803d",
        "WOODLAND(OU)", "#16a34a",
        "WOODLAND(GL)", "#22c55e",
        "LOW OPEN FOREST", "#4ade80",
        "LOW WOODLAND(OU)", "#86efac",
        "LOW WOODLAND(GL)", "#bbf7d0",
        "CLOSED SCRUB", "#064e3b",
        "OPEN SCRUB", "#047857",
        "SHRUBLAND", "#059669",
        "#15803d",
      ],
      "fill-opacity": 0.5,
    },
    outlinePaint: { "line-color": "rgba(34,197,94,0.4)", "line-width": 0.5 },
  },
  {
    key: "vicforests",
    label: "VicForests Timber Allocation",
    wfsTypeName: "open-data-platform:vicforests_allocation_apr2019",
    sourceId: "vicforests-source",
    fillLayerId: "vicforests-fill",
    outlineLayerId: "vicforests-outline",
    minZoom: 9,
    maxFeatures: 3000,
    fillPaint: {
      "fill-color": [
        "match", ["get", "forest_stands"],
        "Ash", "#b91c1c",
        "Mixed Species", "#ea580c",
        "#dc2626",
      ],
      "fill-opacity": 0.4,
    },
    outlinePaint: { "line-color": "rgba(239,68,68,0.6)", "line-width": 1 },
  },
  {
    key: "treeDensity",
    label: "Tree Density (Vicmap)",
    wfsTypeName: "open-data-platform:tree_density",
    sourceId: "tree-density-source",
    fillLayerId: "tree-density-fill",
    outlineLayerId: "tree-density-outline",
    minZoom: 11,
    maxFeatures: 2000,
    fillPaint: {
      "fill-color": [
        "match", ["get", "tree_density"],
        "dense", "#14532d",
        "medium", "#16a34a",
        "sparse", "#86efac",
        "#22c55e",
      ],
      "fill-opacity": 0.35,
    },
    outlinePaint: { "line-color": "rgba(134,239,172,0.3)", "line-width": 0.3 },
  },
];

const DEFAULT_LAYERS: LayerVisibility = {
  evc: true,
  plantation: true,
  nativeForest: false,
  vicforests: false,
  treeDensity: false,
};

const VICTORIA_CENTER = { longitude: 145.5, latitude: -37.0 };
const INITIAL_VIEW = { ...VICTORIA_CENTER, zoom: 7, pitch: 0, bearing: 0 };

function makeStyle(theme: "dark" | "light") {
  const tileVariant = theme === "dark" ? "dark_all" : "light_all";
  return {
    version: 8 as const,
    sources: {
      "carto-tiles": {
        type: "raster" as const,
        tiles: [`https://a.basemaps.cartocdn.com/${tileVariant}/{z}/{x}/{y}@2x.png`],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      },
    },
    layers: [{ id: "carto-layer", type: "raster" as const, source: "carto-tiles", minzoom: 0, maxzoom: 20 }],
  };
}

function buildWfsUrl(typeName: string, bbox: [number, number, number, number], count: number): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: String(count),
    bbox: `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`,
  });
  return `${VIC_WFS_BASE}?${params.toString()}`;
}

function addLayerToMap(map: MapLibre, def: LayerDef) {
  if (!map.getSource(def.sourceId)) {
    map.addSource(def.sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (!map.getLayer(def.fillLayerId)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addLayer({ id: def.fillLayerId, type: "fill", source: def.sourceId, paint: def.fillPaint as any });
  }
  if (!map.getLayer(def.outlineLayerId)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addLayer({ id: def.outlineLayerId, type: "line", source: def.sourceId, paint: def.outlinePaint as any });
  }
}

function getMinActiveZoom(layers: LayerVisibility): number {
  let min = Infinity;
  for (const def of LAYER_DEFS) {
    if (layers[def.key]) min = Math.min(min, def.minZoom);
  }
  return min === Infinity ? 10 : min;
}

export function VegetationMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [featureInfo, setFeatureInfo] = useState<FeatureInfo | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Detect theme
  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.classList.contains("dark") ? "dark" : "light");
    const observer = new MutationObserver(() => {
      setTheme(root.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const loadLayerData = useCallback(async (map: MapLibre, def: LayerDef) => {
    const zoom = map.getZoom();
    if (zoom < def.minZoom) return;

    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
    ];
    const url = buildWfsUrl(def.wfsTypeName, bbox, def.maxFeatures);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`WFS error ${res.status} for ${def.key}`);
    const geojson = await res.json();

    const source = map.getSource(def.sourceId);
    if (source && "setData" in source) {
      (source as { setData: (data: unknown) => void }).setData(geojson);
    }
  }, []);

  const loadAllVisibleLayers = useCallback(async (map: MapLibre) => {
    const currentLayers = layersRef.current;
    const activeDefs = LAYER_DEFS.filter((d) => currentLayers[d.key]);
    if (activeDefs.length === 0) return;

    setLoading(true);
    try {
      await Promise.allSettled(activeDefs.map((def) => loadLayerData(map, def)));
    } finally {
      setLoading(false);
    }
  }, [loadLayerData]);

  // Initialise map
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

    map.on("load", () => {
      for (const def of LAYER_DEFS) {
        addLayerToMap(map, def);
        // Set initial visibility
        const vis = layersRef.current[def.key] ? "visible" : "none";
        map.setLayoutProperty(def.fillLayerId, "visibility", vis);
        map.setLayoutProperty(def.outlineLayerId, "visibility", vis);
      }
      loadAllVisibleLayers(map);
    });

    // Reload data on move end
    let moveTimeout: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => loadAllVisibleLayers(map), 300);
    });

    // Click handler for all fill layers
    const clickableLayers = LAYER_DEFS.map((d) => d.fillLayerId);
    map.on("click", (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
      if (features.length > 0) {
        const feature = features[0];
        const def = LAYER_DEFS.find((d) => d.fillLayerId === feature.layer.id);
        if (def) {
          setFeatureInfo({
            type: def.key,
            properties: feature.properties as Record<string, string | number | null>,
            lngLat: e.lngLat,
          });
        }
      }
    });

    // Cursor change on hover over any fill layer
    map.on("mousemove", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    });

    mapRef.current = map;

    return () => {
      clearTimeout(moveTimeout);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update style when theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(makeStyle(theme));
    map.once("styledata", () => {
      for (const def of LAYER_DEFS) {
        addLayerToMap(map, def);
        const vis = layersRef.current[def.key] ? "visible" : "none";
        if (map.getLayer(def.fillLayerId)) {
          map.setLayoutProperty(def.fillLayerId, "visibility", vis);
          map.setLayoutProperty(def.outlineLayerId, "visibility", vis);
        }
      }
      loadAllVisibleLayers(map);
    });
  }, [theme, loadAllVisibleLayers]);

  // Toggle layer visibility and reload data when layer is enabled
  const handleLayerToggle = useCallback((newLayers: LayerVisibility) => {
    const map = mapRef.current;
    setLayers(newLayers);

    if (!map || !map.isStyleLoaded()) return;

    for (const def of LAYER_DEFS) {
      const vis = newLayers[def.key] ? "visible" : "none";
      if (map.getLayer(def.fillLayerId)) {
        map.setLayoutProperty(def.fillLayerId, "visibility", vis);
        map.setLayoutProperty(def.outlineLayerId, "visibility", vis);
      }
      // Load data for newly enabled layers
      if (newLayers[def.key] && !layers[def.key]) {
        loadLayerData(map, def).catch(console.error);
      }
    }
  }, [layers, loadLayerData]);

  const minZoom = getMinActiveZoom(layers);

  const handleAddressSelect = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom: 13, duration: 1500 });
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <AddressSearch onSelect={handleAddressSelect} />

      {loading && (
        <div className="absolute left-4 top-16 rounded-md bg-background/80 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
          Loading vegetation data...
        </div>
      )}

      <ZoomHint mapRef={mapRef} minZoom={minZoom} />

      <VegetationLayerControls layers={layers} onToggle={handleLayerToggle} />

      <VegetationLegend layers={layers} />

      {featureInfo && (
        <VegetationInfoPanel info={featureInfo} onClose={() => setFeatureInfo(null)} />
      )}
    </div>
  );
}

function ZoomHint({ mapRef, minZoom }: { mapRef: React.RefObject<MapLibre | null>; minZoom: number }) {
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => setZoom(map.getZoom());
    map.on("zoom", handler);
    return () => { map.off("zoom", handler); };
  }, [mapRef]);

  if (zoom >= minZoom) return null;

  return (
    <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-background/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
      Zoom in to view vegetation layers
    </div>
  );
}
