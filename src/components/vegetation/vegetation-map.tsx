"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Map as MapLibre, type MapMouseEvent, addProtocol, removeProtocol } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Protocol as ProtocolType } from "pmtiles";
import { Layers } from "lucide-react";
import { VegetationLegend } from "./vegetation-legend";
import { VegetationLayerControls } from "./vegetation-layer-controls";
import { VegetationInfoPanel } from "./vegetation-info-panel";
import { AddressSearch } from "./address-search";
import { SummaryStats, type LayerStats } from "./summary-stats";
import { LAYER_DEFS, type LayerVisibility, type FeatureInfo, type LayerDef, type Basemap } from "./vegetation-types";

const VIC_WFS_BASE = "https://opendata.maps.vic.gov.au/geoserver/wfs";

const BLOB_BASE = process.env.NEXT_PUBLIC_BLOB_URL ?? "";
const USE_PMTILES = process.env.NEXT_PUBLIC_USE_PMTILES === "true";

const DEA_WMS_URL = "https://ows.dea.ga.gov.au/?service=WMS&version=1.3.0&request=GetMap&layers=ga_ls_landcover&styles=level3&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png";

const DEA_SENTINEL2_WMS_URL = "https://ows.dea.ga.gov.au/?service=WMS&version=1.3.0&request=GetMap&layers=ga_s2_gm&styles=simple_rgb&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png";

const ESRI_SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const DEFAULT_LAYERS: LayerVisibility = {
  evc: true,
  plantation: true,
  nativeForest: false,
  vicforests: false,
  treeDensity: false,
  fireHistory: false,
  landCover: false,
  deaLandCover: false,
  sentinel2: false,
};

const VICTORIA_CENTER = { longitude: 145.5, latitude: -37.0 };
const INITIAL_VIEW = { ...VICTORIA_CENTER, zoom: 7, pitch: 0, bearing: 0 };

function makeStyle(theme: "dark" | "light", basemap: Basemap = "streets") {
  const sourceId = basemap === "satellite" ? "basemap-tiles" : "basemap-tiles";
  const tiles = basemap === "satellite"
    ? [ESRI_SATELLITE_TILES]
    : [`https://a.basemaps.cartocdn.com/${theme === "dark" ? "dark_all" : "light_all"}/{z}/{x}/{y}@2x.png`];
  const attribution = basemap === "satellite"
    ? '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

  return {
    version: 8 as const,
    sources: {
      [sourceId]: {
        type: "raster" as const,
        tiles,
        tileSize: 256,
        attribution,
        maxzoom: basemap === "satellite" ? 19 : 20,
      },
    },
    layers: [{ id: "basemap-layer", type: "raster" as const, source: sourceId, minzoom: 0, maxzoom: 20 }],
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

function addWfsLayerToMap(map: MapLibre, def: LayerDef) {
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

function addPmtilesLayerToMap(map: MapLibre, def: LayerDef) {
  if (!BLOB_BASE || !def.pmtilesLayer) return;
  const sourceId = `${def.sourceId}-pmtiles`;
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "vector",
      url: `pmtiles://${BLOB_BASE}/${def.pmtilesLayer}.pmtiles`,
    });
  }
  if (!map.getLayer(def.fillLayerId)) {
    map.addLayer({
      id: def.fillLayerId,
      type: "fill",
      source: sourceId,
      "source-layer": def.pmtilesLayer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paint: def.fillPaint as any,
    });
  }
  if (!map.getLayer(def.outlineLayerId)) {
    map.addLayer({
      id: def.outlineLayerId,
      type: "line",
      source: sourceId,
      "source-layer": def.pmtilesLayer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paint: def.outlinePaint as any,
    });
  }
}

function addLandCoverToMap(map: MapLibre) {
  if (!BLOB_BASE) return;
  const sourceId = "land-cover-source";
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      url: `pmtiles://${BLOB_BASE}/land-cover.pmtiles`,
      tileSize: 256,
    });
  }
  if (!map.getLayer("land-cover-raster")) {
    map.addLayer(
      { id: "land-cover-raster", type: "raster", source: sourceId, paint: { "raster-opacity": 0.6 } },
    );
  }
}

function addDeaLandCoverToMap(map: MapLibre) {
  const sourceId = "dea-land-cover-source";
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      tiles: [DEA_WMS_URL],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.ga.gov.au/scientific-topics/dea">Geoscience Australia DEA</a>',
    });
  }
  if (!map.getLayer("dea-land-cover-raster")) {
    map.addLayer(
      { id: "dea-land-cover-raster", type: "raster", source: sourceId, paint: { "raster-opacity": 0.7 } },
    );
  }
}

function addSentinel2ToMap(map: MapLibre) {
  const sourceId = "sentinel2-source";
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      tiles: [DEA_SENTINEL2_WMS_URL],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.ga.gov.au/scientific-topics/dea">Geoscience Australia DEA</a> (Sentinel-2)',
    });
  }
  if (!map.getLayer("sentinel2-raster")) {
    map.addLayer(
      { id: "sentinel2-raster", type: "raster", source: sourceId, paint: { "raster-opacity": 0.85 } },
    );
  }
}

function addLayerToMap(map: MapLibre, def: LayerDef) {
  if (USE_PMTILES && def.pmtilesLayer && BLOB_BASE) {
    addPmtilesLayerToMap(map, def);
  } else {
    addWfsLayerToMap(map, def);
  }
}

function getMinActiveZoom(layers: LayerVisibility): number {
  let min = Infinity;
  for (const def of LAYER_DEFS) {
    if (layers[def.key]) min = Math.min(min, def.minZoom);
  }
  return min === Infinity ? 10 : min;
}

function computeStats(map: MapLibre, layers: LayerVisibility): LayerStats[] {
  const stats: LayerStats[] = [];
  for (const def of LAYER_DEFS) {
    if (!layers[def.key]) continue;
    if (!map.getLayer(def.fillLayerId)) continue;

    const features = map.queryRenderedFeatures(undefined, { layers: [def.fillLayerId] });
    if (features.length === 0) continue;

    let totalHectares = 0;
    const groups: Record<string, { count: number; hectares: number }> = {};

    for (const f of features) {
      const ha = Number(f.properties?.hectares ?? f.properties?.area_ha ?? 0);
      totalHectares += ha;

      let groupKey = "Other";
      if (def.key === "evc") groupKey = String(f.properties?.evc_bcs_desc ?? "Other");
      else if (def.key === "plantation") groupKey = String(f.properties?.plantation_type ?? "Other");
      else if (def.key === "nativeForest") groupKey = String(f.properties?.x_vegform ?? "Other");
      else if (def.key === "vicforests") groupKey = String(f.properties?.forest_stands ?? "Other");
      else if (def.key === "treeDensity") groupKey = String(f.properties?.tree_density ?? "Other");
      else if (def.key === "fireHistory") groupKey = String(f.properties?.firetype ?? "Other");

      if (!groups[groupKey]) groups[groupKey] = { count: 0, hectares: 0 };
      groups[groupKey].count++;
      groups[groupKey].hectares += ha;
    }

    stats.push({
      layerKey: def.key,
      label: def.label,
      featureCount: features.length,
      totalHectares,
      groups,
    });
  }
  return stats;
}

export function VegetationMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [featureInfo, setFeatureInfo] = useState<FeatureInfo | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [basemap, setBasemap] = useState<Basemap>("streets");
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [stats, setStats] = useState<LayerStats[]>([]);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Register PMTiles protocol once (dynamic import to avoid SSR issues)
  const pmtilesReady = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let protocol: ProtocolType | null = null;
    pmtilesReady.current = import("pmtiles").then(({ Protocol }) => {
      protocol = new Protocol();
      addProtocol("pmtiles", protocol.tile);
    });
    return () => {
      if (protocol) removeProtocol("pmtiles");
    };
  }, []);

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
    // PMTiles layers don't need WFS fetching
    if (USE_PMTILES && def.pmtilesLayer && BLOB_BASE) return;
    // Land cover is raster, no WFS
    if (def.key === "landCover") return;

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

  const updateStats = useCallback((map: MapLibre) => {
    const currentLayers = layersRef.current;
    const newStats = computeStats(map, currentLayers);
    setStats(newStats);
  }, []);

  const loadAllVisibleLayers = useCallback(async (map: MapLibre) => {
    const currentLayers = layersRef.current;
    const activeDefs = LAYER_DEFS.filter((d) => currentLayers[d.key]);
    if (activeDefs.length === 0) {
      setStats([]);
      return;
    }

    setLoading(true);
    try {
      await Promise.allSettled(activeDefs.map((def) => loadLayerData(map, def)));
    } finally {
      setLoading(false);
      updateStats(map);
    }
  }, [loadLayerData, updateStats]);

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

    map.on("load", async () => {
      // Ensure PMTiles protocol is registered before adding sources
      if (pmtilesReady.current) await pmtilesReady.current;

      // Add raster layers (below vector layers)
      if (BLOB_BASE) {
        addLandCoverToMap(map);
        const lcVis = layersRef.current.landCover ? "visible" : "none";
        if (map.getLayer("land-cover-raster")) {
          map.setLayoutProperty("land-cover-raster", "visibility", lcVis);
        }
      }

      addDeaLandCoverToMap(map);
      const deaVis = layersRef.current.deaLandCover ? "visible" : "none";
      if (map.getLayer("dea-land-cover-raster")) {
        map.setLayoutProperty("dea-land-cover-raster", "visibility", deaVis);
      }

      addSentinel2ToMap(map);
      const s2Vis = layersRef.current.sentinel2 ? "visible" : "none";
      if (map.getLayer("sentinel2-raster")) {
        map.setLayoutProperty("sentinel2-raster", "visibility", s2Vis);
      }

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

    // Reload data on move end + update stats
    let moveTimeout: ReturnType<typeof setTimeout>;
    let statsTimeout: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => loadAllVisibleLayers(map), 300);
      clearTimeout(statsTimeout);
      statsTimeout = setTimeout(() => updateStats(map), 500);
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
      clearTimeout(statsTimeout);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update style when theme changes (skip initial render)
  const themeInitRef = useRef(true);
  useEffect(() => {
    if (themeInitRef.current) {
      themeInitRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(makeStyle(theme, basemap));
    map.once("styledata", async () => {
      if (pmtilesReady.current) await pmtilesReady.current;
      if (BLOB_BASE) {
        addLandCoverToMap(map);
        const lcVis = layersRef.current.landCover ? "visible" : "none";
        if (map.getLayer("land-cover-raster")) {
          map.setLayoutProperty("land-cover-raster", "visibility", lcVis);
        }
      }
      addDeaLandCoverToMap(map);
      const deaVis = layersRef.current.deaLandCover ? "visible" : "none";
      if (map.getLayer("dea-land-cover-raster")) {
        map.setLayoutProperty("dea-land-cover-raster", "visibility", deaVis);
      }
      addSentinel2ToMap(map);
      const s2Vis = layersRef.current.sentinel2 ? "visible" : "none";
      if (map.getLayer("sentinel2-raster")) {
        map.setLayoutProperty("sentinel2-raster", "visibility", s2Vis);
      }
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
  }, [theme, basemap, loadAllVisibleLayers]);

  // Toggle layer visibility and reload data when layer is enabled
  const handleLayerToggle = useCallback((newLayers: LayerVisibility) => {
    const map = mapRef.current;
    setLayers(newLayers);

    if (!map || !map.isStyleLoaded()) return;

    // Handle raster layers separately
    if (map.getLayer("land-cover-raster")) {
      map.setLayoutProperty("land-cover-raster", "visibility", newLayers.landCover ? "visible" : "none");
    }
    if (map.getLayer("dea-land-cover-raster")) {
      map.setLayoutProperty("dea-land-cover-raster", "visibility", newLayers.deaLandCover ? "visible" : "none");
    }
    if (map.getLayer("sentinel2-raster")) {
      map.setLayoutProperty("sentinel2-raster", "visibility", newLayers.sentinel2 ? "visible" : "none");
    }

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

    // Update stats after toggle
    setTimeout(() => updateStats(map), 200);
  }, [layers, loadLayerData, updateStats]);

  const handleBasemapChange = useCallback((newBasemap: Basemap) => {
    setBasemap(newBasemap);
  }, []);

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
        <div className="absolute left-4 top-16 rounded-md bg-background/80 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-sm md:left-4 md:top-16">
          Loading vegetation data...
        </div>
      )}

      <ZoomHint mapRef={mapRef} minZoom={minZoom} />

      {/* Mobile layer toggle button */}
      <button
        onClick={() => setMobileControlsOpen(!mobileControlsOpen)}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm md:hidden"
        aria-label="Toggle layers"
      >
        <Layers className="h-5 w-5" />
      </button>

      <VegetationLayerControls
        layers={layers}
        onToggle={handleLayerToggle}
        basemap={basemap}
        onBasemapChange={handleBasemapChange}
        mobileOpen={mobileControlsOpen}
        onMobileClose={() => setMobileControlsOpen(false)}
      />

      <VegetationLegend layers={layers} />

      <SummaryStats stats={stats} />

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
