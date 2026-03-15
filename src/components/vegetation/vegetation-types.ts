export type LayerKey =
  | "evc"
  | "plantation"
  | "nativeForest"
  | "vicforests"
  | "treeDensity"
  | "fireHistory"
  | "landCover"
  | "deaLandCover"
  | "sentinel2";

export type Basemap = "streets" | "satellite";

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
  vintage?: { period: string; note: string };
  pmtilesLayer?: string;
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
    pmtilesLayer: "evc",
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
    pmtilesLayer: "plantation",
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
    vintage: {
      period: "1990s-2000s",
      note: "Aerial photo interpretation",
    },
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
    vintage: {
      period: "April 2019",
      note: "VicForests allocation snapshot",
    },
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
  {
    key: "fireHistory",
    label: "Fire History",
    wfsTypeName: "open-data-platform:fire_history",
    sourceId: "fire-history-source",
    fillLayerId: "fire-history-fill",
    outlineLayerId: "fire-history-outline",
    minZoom: 9,
    maxFeatures: 3000,
    fillPaint: {
      "fill-color": [
        "interpolate", ["linear"], ["to-number", ["get", "season"], 2000],
        1950, "#fef9c3",
        1970, "#fde047",
        1990, "#f97316",
        2010, "#dc2626",
        2025, "#7f1d1d",
      ],
      "fill-opacity": 0.5,
    },
    outlinePaint: { "line-color": "rgba(239,68,68,0.4)", "line-width": 0.5 },
  },
];

export const LAND_COVER_CLASSES = [
  { id: 1, label: "Native Woody Vegetation", colour: "#14532d", category: "Native" },
  { id: 2, label: "Native Scattered Trees", colour: "#16a34a", category: "Native" },
  { id: 3, label: "Native Herbaceous", colour: "#86efac", category: "Native" },
  { id: 4, label: "Native Wetland Vegetation", colour: "#065f46", category: "Native" },
  { id: 5, label: "Hardwood Plantation", colour: "#7c3aed", category: "Plantation" },
  { id: 6, label: "Softwood Plantation", colour: "#c084fc", category: "Plantation" },
  { id: 7, label: "Horticulture (Perennial)", colour: "#ca8a04", category: "Agriculture" },
  { id: 8, label: "Horticulture (Annual)", colour: "#eab308", category: "Agriculture" },
  { id: 9, label: "Improved Pasture", colour: "#fde047", category: "Agriculture" },
  { id: 10, label: "Cropping", colour: "#fef9c3", category: "Agriculture" },
  { id: 11, label: "Grazing - Native", colour: "#a3e635", category: "Agriculture" },
  { id: 12, label: "Irrigated Pasture", colour: "#bef264", category: "Agriculture" },
  { id: 13, label: "Irrigated Cropping", colour: "#d9f99d", category: "Agriculture" },
  { id: 14, label: "Built-up", colour: "#6b7280", category: "Urban" },
  { id: 15, label: "Water Bodies", colour: "#3b82f6", category: "Water" },
  { id: 16, label: "Wetlands", colour: "#06b6d4", category: "Water" },
  { id: 17, label: "Ocean / Estuarine", colour: "#1e3a5f", category: "Water" },
  { id: 18, label: "Bare / Minimal Vegetation", colour: "#d4d4d4", category: "Other" },
  { id: 19, label: "Unclassified", colour: "#a1a1aa", category: "Other" },
];

// DEA Land Cover Level 3 classes (Geoscience Australia, 30m, 1988-2024)
export const DEA_LAND_COVER_CLASSES = [
  { code: 111, label: "Cultivated Vegetation", colour: "#f59e0b" },
  { code: 112, label: "Natural Vegetation", colour: "#16a34a" },
  { code: 124, label: "Natural Aquatic Vegetation", colour: "#0d9488" },
  { code: 215, label: "Artificial Surface", colour: "#6b7280" },
  { code: 216, label: "Natural Bare Surface", colour: "#a8a29e" },
  { code: 220, label: "Water", colour: "#3b82f6" },
];
