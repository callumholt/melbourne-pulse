"use client";

import { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays } from "date-fns";
import { Columns3, Flame, TreePine, Ship, Users, Filter, Maximize2, Minimize2, ParkingSquare, UtensilsCrossed, Building2 } from "lucide-react";
import { useAisStream } from "@/lib/use-ais-stream";
import { useVesselTrails } from "@/lib/use-vessel-trails";
import { useDeviceType } from "@/lib/use-device-type";
import { useTreeLayer } from "@/lib/use-tree-layer";
import { useParkingLayer } from "@/lib/use-parking-layer";
import { useHospitalityLayer } from "@/lib/use-hospitality-layer";
import { useBuildingLayer } from "@/lib/use-building-layer";
import { PRECINCTS } from "@/lib/constants";
import type { MapInnerHandle, LayerMode } from "./traffic-map-inner";
import type { Map2DHandle } from "./traffic-map-2d";

interface SensorData {
  sensor_id: number;
  sensor_name: string;
  lat: number;
  lon: number;
  precinct_id: string;
  total_count: number;
}

interface HourlySensorRow {
  sensor_id: number;
  sensor_name: string;
  lat: number;
  lon: number;
  precinct_id: string;
  hour_of_day: number;
  count: number;
}

// Pre-indexed hourly data: sensorId -> hour -> count
type HourlyIndex = Map<number, Float64Array>;

interface TrafficMapProps {
  initialSensors: SensorData[];
  precinctNames: Record<string, { name: string; colour: string }>;
  initialDate: string;
  theme?: "dark" | "light";
}

const MapInner = dynamic(() => import("./traffic-map-inner"), { ssr: false });
const MapInner2D = dynamic(() => import("./traffic-map-2d"), { ssr: false });

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h < 12 ? "am" : "pm";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${displayH}${period}` : `${displayH}:${m.toString().padStart(2, "0")}${period}`;
}

function buildHourlyIndex(rows: HourlySensorRow[]): HourlyIndex {
  const index: HourlyIndex = new Map();
  for (const row of rows) {
    if (!index.has(row.sensor_id)) {
      index.set(row.sensor_id, new Float64Array(24));
    }
    index.get(row.sensor_id)![Number(row.hour_of_day)] = Number(row.count);
  }
  return index;
}

function interpolateSensors(
  baseSensors: SensorData[],
  hourlyIndex: HourlyIndex,
  time: number,
): SensorData[] {
  const hourA = Math.floor(time);
  const hourB = Math.min(hourA + 1, 23);
  const frac = time - hourA;

  return baseSensors.map((sensor) => {
    const hours = hourlyIndex.get(sensor.sensor_id);
    if (!hours) return { ...sensor, total_count: 0 };
    const countA = hours[hourA] ?? 0;
    const countB = hours[hourB] ?? 0;
    const interpolated = countA + (countB - countA) * frac;
    return { ...sensor, total_count: Math.round(interpolated) };
  });
}

export interface TrafficMapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
}

export const TrafficMap = forwardRef<TrafficMapHandle, TrafficMapProps>(function TrafficMap({ initialSensors, precinctNames, initialDate, theme = "dark" }, outerRef) {
  // Device detection for 2D fallback
  const { isMobile } = useDeviceType();

  // AIS ship tracking (disable on mobile to save resources)
  const { vessels, connected: aisConnected, vesselCount } = useAisStream(!isMobile);
  const vesselTrails = useVesselTrails(vessels, !isMobile);

  // Map refs for flyTo
  const mapRef = useRef<MapInnerHandle>(null);
  const map2DRef = useRef<Map2DHandle>(null);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dailySensors, setDailySensors] = useState(initialSensors);
  const [hourlyIndex, setHourlyIndex] = useState<HourlyIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [layerMode, setLayerMode] = useState<LayerMode>("columns");
  const [visibleLayers, setVisibleLayers] = useState({ sensors: true, vessels: true, trees: false, parking: false, hospitality: false, buildings: false });
  const [precinctFilter, setPrecinctFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Tree layer data (loaded on demand)
  const { trees } = useTreeLayer(visibleLayers.trees, precinctFilter ?? undefined);

  // Parking layer (real-time occupancy, refreshes every 5 min)
  const { bays: parkingBays } = useParkingLayer(visibleLayers.parking);

  // Hospitality layer (cafes, restaurants, bars)
  const { venues: hospitalityVenues } = useHospitalityLayer(visibleLayers.hospitality);

  // Building footprints (3D extruded buildings)
  const { geojson: buildingGeojson } = useBuildingLayer(visibleLayers.buildings);

  const toggleLayer = (layer: keyof typeof visibleLayers) => {
    setVisibleLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Playback state
  const [mode, setMode] = useState<"daily" | "hourly">("daily");
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const dateOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < 90; i++) {
      const d = subDays(new Date(), i);
      const value = format(d, "yyyy-MM-dd");
      const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : format(d, "EEE d MMM");
      opts.push({ value, label });
    }
    return opts;
  }, []);

  // Fetch daily totals when date changes
  useEffect(() => {
    if (selectedDate === initialDate) {
      setDailySensors(initialSensors);
    } else {
      setLoading(true);
      fetch(`/api/sensors?date=${selectedDate}`)
        .then((res) => res.json())
        .then((data: SensorData[]) => setDailySensors(data))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
    setHourlyIndex(null);
    setMode("daily");
    setPlaying(false);
    setCurrentTime(0);
  }, [selectedDate, initialDate, initialSensors]);

  // Fetch hourly data when entering hourly mode
  const loadHourlyData = useCallback(() => {
    if (hourlyIndex) {
      setMode("hourly");
      setCurrentTime(0);
      setPlaying(true);
      return;
    }
    setLoading(true);
    fetch(`/api/sensors/hourly?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data: HourlySensorRow[]) => {
        setHourlyIndex(buildHourlyIndex(data));
        setMode("hourly");
        setCurrentTime(0);
        setPlaying(true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDate, hourlyIndex]);

  // requestAnimationFrame playback loop
  useEffect(() => {
    if (!playing || mode !== "hourly") return;

    lastFrameRef.current = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      setCurrentTime((t) => {
        const next = t + delta * playSpeed;
        if (next >= 23) {
          setPlaying(false);
          return 23;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, mode, playSpeed]);

  // Build interpolated sensor data
  const displaySensors = useMemo((): SensorData[] => {
    if (mode === "daily" || !hourlyIndex) return dailySensors;
    return interpolateSensors(dailySensors, hourlyIndex, currentTime);
  }, [mode, hourlyIndex, dailySensors, currentTime]);

  const togglePlay = () => {
    if (mode === "daily") {
      loadHourlyData();
      return;
    }
    if (currentTime >= 23 && !playing) {
      setCurrentTime(0);
      setPlaying(true);
    } else {
      setPlaying(!playing);
    }
  };

  // Expose flyTo for precinct card clicks (works with both 2D and 3D)
  useImperativeHandle(outerRef, () => ({
    flyTo: (lat: number, lon: number, zoom?: number) => {
      mapRef.current?.flyTo(lat, lon, zoom);
      map2DRef.current?.flyTo(lat, lon, zoom);
    },
  }));

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sensor Map</h2>
        <div className="flex items-center gap-2">
          {/* Layer mode toggle */}
          <div className="flex rounded-md border border-border/40">
            <button
              onClick={() => setLayerMode("columns")}
              className={`flex items-center gap-1 rounded-l-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                layerMode === "columns"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title="3D columns"
            >
              <Columns3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">3D</span>
            </button>
            <button
              onClick={() => setLayerMode("heatmap")}
              className={`flex items-center gap-1 rounded-r-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                layerMode === "heatmap"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title="Heatmap"
            >
              <Flame className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Heat</span>
            </button>
          </div>

          {/* Filters toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 rounded-md border border-border/40 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              showFilters ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            title="Filters"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </button>

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded-md border border-border/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={expanded ? "Collapse map" : "Expand map"}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          <Select value={selectedDate} onValueChange={(v) => v && setSelectedDate(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dateOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Filter panel */}
        {showFilters && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-card p-3">
            {/* Layer toggles */}
            <span className="text-xs font-medium text-muted-foreground">Layers:</span>
            <button
              onClick={() => toggleLayer("sensors")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                visibleLayers.sensors ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3 w-3" />
              Pedestrians
            </button>
            <button
              onClick={() => toggleLayer("vessels")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                visibleLayers.vessels ? "bg-cyan-500/20 text-cyan-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Ship className="h-3 w-3" />
              Vessels
            </button>
            <button
              onClick={() => toggleLayer("trees")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                visibleLayers.trees ? "bg-green-500/20 text-green-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TreePine className="h-3 w-3" />
              Trees
            </button>
            <button
              onClick={() => toggleLayer("parking")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                visibleLayers.parking ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ParkingSquare className="h-3 w-3" />
              Parking
            </button>
            <button
              onClick={() => toggleLayer("hospitality")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                visibleLayers.hospitality ? "bg-orange-500/20 text-orange-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UtensilsCrossed className="h-3 w-3" />
              Cafes & Bars
            </button>
            <button
              onClick={() => toggleLayer("buildings")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                visibleLayers.buildings ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="h-3 w-3" />
              Buildings
            </button>

            <span className="mx-1 text-border">|</span>

            {/* Precinct filter */}
            <span className="text-xs font-medium text-muted-foreground">Precinct:</span>
            <select
              value={precinctFilter ?? ""}
              onChange={(e) => setPrecinctFilter(e.target.value || null)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            >
              <option value="">All</option>
              {PRECINCTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <Card className="border-border/40">
        <CardContent className="p-0">
          <div className={`relative w-full overflow-hidden rounded-lg transition-[height] duration-300 ${expanded ? "h-[80vh]" : "h-[400px] sm:h-[500px]"} ${loading ? "opacity-50 transition-opacity" : ""}`}>
            {isMobile ? (
              <MapInner2D
                ref={map2DRef}
                sensors={displaySensors}
                precinctNames={precinctNames}
                theme={theme}
              />
            ) : (
              <MapInner
                ref={mapRef}
                sensors={displaySensors}
                precinctNames={precinctNames}
                vessels={vessels}
                vesselTrails={vesselTrails}
                trees={trees}
                parkingBays={parkingBays}
                hospitalityVenues={hospitalityVenues}
                buildingGeojson={buildingGeojson}
                layerMode={layerMode}
                currentHour={mode === "hourly" ? currentTime : null}
                theme={theme}
                visibleLayers={visibleLayers}
                precinctFilter={precinctFilter}
              />
            )}

            {/* Vessel tracking indicator */}
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md bg-black/60 px-2.5 py-1.5 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  {aisConnected ? (
                    <>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                    </>
                  ) : (
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-500" />
                  )}
                </span>
                <span className="text-xs text-white/70">
                  {aisConnected
                    ? `${vesselCount} vessel${vesselCount !== 1 ? "s" : ""} in Port Phillip Bay`
                    : "Connecting to AIS..."}
                </span>
              </div>

            {/* Playback controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
              <div className="flex items-center gap-3">
                {/* Play/pause button */}
                <button
                  onClick={togglePlay}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                  title={mode === "daily" ? "Play hourly timelapse" : playing ? "Pause" : "Play"}
                >
                  {playing ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="2" y="1" width="4" height="12" rx="1" />
                      <rect x="8" y="1" width="4" height="12" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <path d="M3 1.5v11l9-5.5L3 1.5z" />
                    </svg>
                  )}
                </button>

                {/* Timeline */}
                <div className="flex flex-1 flex-col gap-1">
                  {mode === "hourly" ? (
                    <>
                      <input
                        type="range"
                        min={0}
                        max={23}
                        step={0.01}
                        value={currentTime}
                        onChange={(e) => {
                          setCurrentTime(Number(e.target.value));
                          setPlaying(false);
                        }}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-blue-500 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                      />
                      <div className="flex justify-between text-[10px] text-white/50">
                        <span>12am</span>
                        <span>6am</span>
                        <span>12pm</span>
                        <span>6pm</span>
                        <span>11pm</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-[26px] items-center">
                      <span className="text-xs text-white/60">
                        Press play to see hourly timelapse
                      </span>
                    </div>
                  )}
                </div>

                {/* Current time label */}
                {mode === "hourly" && (
                  <div className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 backdrop-blur-sm">
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {formatHour(currentTime)}
                    </span>
                  </div>
                )}

                {/* Speed control */}
                {mode === "hourly" && (
                  <button
                    onClick={() => setPlaySpeed((s) => s === 1 ? 2 : s === 2 ? 4 : 1)}
                    className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
                    title="Change playback speed"
                  >
                    {playSpeed === 1 ? "1x" : playSpeed === 2 ? "2x" : "4x"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
});
