export const PRECINCTS = [
  { id: "cbd-core", name: "CBD Core", colour: "#3b82f6", lat: -37.8136, lon: 144.9631, display_order: 1 },
  { id: "southbank", name: "Southbank", colour: "#22c55e", lat: -37.8226, lon: 144.9644, display_order: 2 },
  { id: "docklands", name: "Docklands", colour: "#a855f7", lat: -37.8145, lon: 144.9460, display_order: 3 },
  { id: "fed-square", name: "Fed Square", colour: "#f59e0b", lat: -37.8180, lon: 144.9691, display_order: 4 },
  { id: "carlton", name: "Carlton", colour: "#ef4444", lat: -37.7963, lon: 144.9668, display_order: 5 },
  { id: "chinatown", name: "Chinatown", colour: "#ec4899", lat: -37.8117, lon: 144.9688, display_order: 6 },
  { id: "qvm", name: "Queen Vic Market", colour: "#14b8a6", lat: -37.8076, lon: 144.9568, display_order: 7 },
  { id: "flagstaff", name: "Flagstaff", colour: "#f97316", lat: -37.8118, lon: 144.9548, display_order: 8 },
  { id: "parliament", name: "Parliament", colour: "#06b6d4", lat: -37.8112, lon: 144.9738, display_order: 9 },
  { id: "st-kilda-rd", name: "St Kilda Rd", colour: "#84cc16", lat: -37.8300, lon: 144.9680, display_order: 10 },
] as const;

export type PrecinctId = (typeof PRECINCTS)[number]["id"];

export const ACTIVITY_THRESHOLDS = {
  quiet: 0.3,
  moderate: 0.7,
  busy: 1.0,
} as const;

export function getActivityLevel(ratio: number): "quiet" | "moderate" | "busy" | "very-busy" {
  if (ratio < ACTIVITY_THRESHOLDS.quiet) return "quiet";
  if (ratio < ACTIVITY_THRESHOLDS.moderate) return "moderate";
  if (ratio < ACTIVITY_THRESHOLDS.busy) return "busy";
  return "very-busy";
}

export function getActivityColour(level: ReturnType<typeof getActivityLevel>): string {
  switch (level) {
    case "quiet": return "#6b7280";
    case "moderate": return "#f59e0b";
    case "busy": return "#22c55e";
    case "very-busy": return "#ef4444";
  }
}
