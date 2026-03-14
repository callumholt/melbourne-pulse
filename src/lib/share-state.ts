import type { LayerMode } from "@/components/dashboard/traffic-map-inner";

export interface MapState {
  date?: string;
  hour?: number;
  layer?: LayerMode;
  precinct?: string;
}

/**
 * Encode map state into URL search params.
 */
export function encodeMapState(state: MapState): string {
  const params = new URLSearchParams();
  if (state.date) params.set("date", state.date);
  if (state.hour != null) params.set("hour", String(Math.round(state.hour * 100) / 100));
  if (state.layer && state.layer !== "columns") params.set("layer", state.layer);
  if (state.precinct) params.set("precinct", state.precinct);
  return params.toString();
}

/**
 * Decode map state from URL search params.
 */
export function decodeMapState(searchParams: URLSearchParams): MapState {
  const state: MapState = {};

  const date = searchParams.get("date");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    state.date = date;
  }

  const hour = searchParams.get("hour");
  if (hour != null) {
    const h = parseFloat(hour);
    if (!isNaN(h) && h >= 0 && h <= 23) {
      state.hour = h;
    }
  }

  const layer = searchParams.get("layer");
  if (layer === "heatmap" || layer === "columns") {
    state.layer = layer;
  }

  const precinct = searchParams.get("precinct");
  if (precinct) {
    state.precinct = precinct;
  }

  return state;
}

/**
 * Build a shareable permalink for the current map state.
 */
export function buildShareUrl(state: MapState): string {
  const params = encodeMapState(state);
  const base = typeof window !== "undefined" ? window.location.origin : "https://melbourne-pulse.vercel.app";
  return params ? `${base}/?${params}` : base;
}
