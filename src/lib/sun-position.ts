import SunCalc from "suncalc";

const MELBOURNE_LAT = -37.8136;
const MELBOURNE_LON = 144.9631;

export interface SunState {
  altitude: number; // radians, negative = below horizon
  azimuth: number; // radians
  isNight: boolean;
  isTwilight: boolean; // dawn/dusk
  ambientLight: number; // 0 (dark) to 1 (full daylight)
  sunColor: [number, number, number]; // RGB
}

/**
 * Get sun position and lighting state for Melbourne at a given hour (0-23 float).
 * Uses a reference date for accurate sun calculations.
 */
export function getSunState(hour: number, date?: Date): SunState {
  const d = date ?? new Date();
  const melbourneDate = new Date(d);
  melbourneDate.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);

  const pos = SunCalc.getPosition(melbourneDate, MELBOURNE_LAT, MELBOURNE_LON);
  const altitudeDeg = (pos.altitude * 180) / Math.PI;

  // Determine lighting phase
  const isNight = altitudeDeg < -6;
  const isTwilight = altitudeDeg >= -6 && altitudeDeg < 6;

  // Ambient light: 0 at deep night, ramps through twilight, 1 at day
  let ambientLight: number;
  if (altitudeDeg < -12) {
    ambientLight = 0.05;
  } else if (altitudeDeg < -6) {
    ambientLight = 0.05 + ((altitudeDeg + 12) / 6) * 0.15;
  } else if (altitudeDeg < 0) {
    ambientLight = 0.2 + ((altitudeDeg + 6) / 6) * 0.3;
  } else if (altitudeDeg < 6) {
    ambientLight = 0.5 + (altitudeDeg / 6) * 0.3;
  } else {
    ambientLight = 0.8 + Math.min(altitudeDeg / 30, 1) * 0.2;
  }

  // Sun colour: warm at low angles, neutral at high
  let sunColor: [number, number, number];
  if (altitudeDeg < 0) {
    sunColor = [40, 40, 80]; // deep blue night
  } else if (altitudeDeg < 10) {
    // golden hour
    const t = altitudeDeg / 10;
    sunColor = [
      Math.round(255 * (0.9 + 0.1 * t)),
      Math.round(255 * (0.6 + 0.3 * t)),
      Math.round(255 * (0.3 + 0.5 * t)),
    ];
  } else {
    sunColor = [255, 245, 230]; // daylight
  }

  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth,
    isNight,
    isTwilight,
    ambientLight,
    sunColor,
  };
}

/**
 * Get map opacity for base tiles based on time of day.
 * Dims the map at night for better column visibility.
 */
export function getMapOpacity(hour: number, date?: Date): number {
  const { ambientLight } = getSunState(hour, date);
  // Map opacity: 0.3 at night, 1.0 in daylight
  return 0.3 + ambientLight * 0.7;
}
