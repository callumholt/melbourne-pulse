"use client";

import { Layers, X } from "lucide-react";
import { LAYER_DEFS, type LayerVisibility, type LayerKey } from "./vegetation-types";

interface VegetationLayerControlsProps {
  layers: LayerVisibility;
  onToggle: (layers: LayerVisibility) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const LAYER_GROUPS: { title: string; items: LayerKey[] }[] = [
  {
    title: "Native Vegetation",
    items: ["evc", "nativeForest", "treeDensity"],
  },
  {
    title: "Forestry & Plantations",
    items: ["plantation", "vicforests"],
  },
  {
    title: "Hazards",
    items: ["fireHistory"],
  },
  {
    title: "Land Cover",
    items: ["landCover"],
  },
];

export function VegetationLayerControls({ layers, onToggle, mobileOpen, onMobileClose }: VegetationLayerControlsProps) {
  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <div
        className={`
          absolute right-4 top-4 z-40 w-64 rounded-lg border border-border/40 bg-background/80 p-3 backdrop-blur-sm
          transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
          md:translate-x-0
        `}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Layers className="h-4 w-4" />
            Layers
          </div>
          <button
            onClick={onMobileClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          {LAYER_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground/60">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((key) => {
                  // Land cover is a raster, not in LAYER_DEFS
                  if (key === "landCover") {
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={layers.landCover}
                          onChange={(e) => onToggle({ ...layers, landCover: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border accent-primary"
                        />
                        <span className="text-muted-foreground">Victorian Land Cover (2021-22)</span>
                      </label>
                    );
                  }
                  const def = LAYER_DEFS.find((d) => d.key === key);
                  if (!def) return null;
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={layers[key]}
                        onChange={(e) => onToggle({ ...layers, [key]: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      <span className="text-muted-foreground">{def.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
