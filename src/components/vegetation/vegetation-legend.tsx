"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LAND_COVER_CLASSES, DEA_LAND_COVER_CLASSES, type LayerVisibility } from "./vegetation-types";

interface LegendSection {
  layerKey: keyof LayerVisibility;
  title: string;
  items: { label: string; colour: string }[];
  gradient?: boolean;
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
  {
    layerKey: "fireHistory",
    title: "Fire History",
    items: [
      { label: "1950s", colour: "#fef9c3" },
      { label: "1970s", colour: "#fde047" },
      { label: "1990s", colour: "#f97316" },
      { label: "2010s", colour: "#dc2626" },
      { label: "2020s", colour: "#7f1d1d" },
    ],
    gradient: true,
  },
];

// Group land cover classes by category
const LAND_COVER_GROUPS = (() => {
  const groups: Record<string, { label: string; colour: string }[]> = {};
  for (const cls of LAND_COVER_CLASSES) {
    if (!groups[cls.category]) groups[cls.category] = [];
    groups[cls.category].push({ label: cls.label, colour: cls.colour });
  }
  return groups;
})();

interface VegetationLegendProps {
  layers: LayerVisibility;
}

export function VegetationLegend({ layers }: VegetationLegendProps) {
  const [expanded, setExpanded] = useState(true);
  const activeSections = LEGEND_SECTIONS.filter((s) => layers[s.layerKey]);
  const showLandCover = layers.landCover;
  const showDeaLandCover = layers.deaLandCover;

  if (activeSections.length === 0 && !showLandCover && !showDeaLandCover) return null;

  return (
    <div className="absolute bottom-6 left-4 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm">
      {/* Collapsed bar on mobile, always visible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:hidden"
      >
        <span>Legend</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div className={`space-y-3 ${expanded ? "p-3 pt-0 md:pt-3" : "hidden md:block md:p-3"}`}>
        {activeSections.map((section) => (
          <div key={section.layerKey}>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.title}
            </div>
            {section.gradient ? (
              <div>
                <div
                  className="mb-1 h-3 w-full rounded-sm"
                  style={{
                    background: `linear-gradient(to right, ${section.items.map((i) => i.colour).join(", ")})`,
                    opacity: 0.7,
                  }}
                />
                <div className="flex justify-between">
                  {section.items.map((item) => (
                    <span key={item.label} className="text-[10px] text-muted-foreground">{item.label}</span>
                  ))}
                </div>
              </div>
            ) : (
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
            )}
          </div>
        ))}

        {showLandCover && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Land Cover (2021-22)
            </div>
            {Object.entries(LAND_COVER_GROUPS).map(([category, items]) => (
              <div key={category} className="mb-1.5">
                <div className="text-[10px] text-muted-foreground/60">{category}</div>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div
                        className="h-3 w-5 rounded-sm"
                        style={{ backgroundColor: item.colour, opacity: 0.7 }}
                      />
                      <span className="text-[10px] text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {showDeaLandCover && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              DEA Land Cover (2024)
            </div>
            <div className="space-y-0.5">
              {DEA_LAND_COVER_CLASSES.map((cls) => (
                <div key={cls.code} className="flex items-center gap-2">
                  <div
                    className="h-3 w-5 rounded-sm"
                    style={{ backgroundColor: cls.colour, opacity: 0.7 }}
                  />
                  <span className="text-[10px] text-muted-foreground">{cls.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
