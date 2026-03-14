"use client";

import { Layers } from "lucide-react";
import { LAYER_DEFS, type LayerVisibility } from "./vegetation-map";

interface VegetationLayerControlsProps {
  layers: LayerVisibility;
  onToggle: (layers: LayerVisibility) => void;
}

const LAYER_GROUPS = [
  {
    title: "Native Vegetation",
    items: ["evc", "nativeForest", "treeDensity"] as const,
  },
  {
    title: "Forestry & Plantations",
    items: ["plantation", "vicforests"] as const,
  },
];

export function VegetationLayerControls({ layers, onToggle }: VegetationLayerControlsProps) {
  return (
    <div className="absolute right-4 top-4 w-64 rounded-lg border border-border/40 bg-background/80 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Layers className="h-4 w-4" />
        Layers
      </div>
      <div className="space-y-3">
        {LAYER_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground/60">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.items.map((key) => {
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
  );
}
