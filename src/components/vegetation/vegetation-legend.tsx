"use client";

import type { LayerVisibility } from "./vegetation-map";

interface LegendSection {
  layerKey: keyof LayerVisibility;
  title: string;
  items: { label: string; colour: string }[];
}

const LEGEND_SECTIONS: LegendSection[] = [
  {
    layerKey: "evc",
    title: "EVC Conservation Status",
    items: [
      { label: "Endangered", colour: "#dc2626" },
      { label: "Vulnerable", colour: "#f97316" },
      { label: "Depleted", colour: "#eab308" },
      { label: "Rare", colour: "#a855f7" },
      { label: "Least Concern", colour: "#22c55e" },
    ],
  },
  {
    layerKey: "plantation",
    title: "Plantations",
    items: [
      { label: "Hardwood", colour: "#7c3aed" },
      { label: "Softwood", colour: "#c084fc" },
    ],
  },
  {
    layerKey: "nativeForest",
    title: "Native Forest Form",
    items: [
      { label: "Tall Open Forest", colour: "#14532d" },
      { label: "Open Forest", colour: "#166534" },
      { label: "Woodland", colour: "#16a34a" },
      { label: "Low Forest / Woodland", colour: "#4ade80" },
      { label: "Scrub / Shrubland", colour: "#047857" },
    ],
  },
  {
    layerKey: "vicforests",
    title: "VicForests Allocation",
    items: [
      { label: "Ash", colour: "#b91c1c" },
      { label: "Mixed Species", colour: "#ea580c" },
    ],
  },
  {
    layerKey: "treeDensity",
    title: "Tree Density",
    items: [
      { label: "Dense", colour: "#14532d" },
      { label: "Medium", colour: "#16a34a" },
      { label: "Sparse", colour: "#86efac" },
    ],
  },
];

interface VegetationLegendProps {
  layers: LayerVisibility;
}

export function VegetationLegend({ layers }: VegetationLegendProps) {
  const activeSections = LEGEND_SECTIONS.filter((s) => layers[s.layerKey]);
  if (activeSections.length === 0) return null;

  return (
    <div className="absolute bottom-6 left-4 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-lg border border-border/40 bg-background/80 p-3 backdrop-blur-sm">
      <div className="space-y-3">
        {activeSections.map((section) => (
          <div key={section.layerKey}>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div
                    className="h-3 w-5 rounded-sm"
                    style={{ backgroundColor: item.colour, opacity: 0.7 }}
                  />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
