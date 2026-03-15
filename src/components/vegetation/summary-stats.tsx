"use client";

import { useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import type { LayerKey } from "./vegetation-types";

export interface LayerStats {
  layerKey: LayerKey;
  label: string;
  featureCount: number;
  totalHectares: number;
  groups: Record<string, { count: number; hectares: number }>;
}

interface SummaryStatsProps {
  stats: LayerStats[];
}

export function SummaryStats({ stats }: SummaryStatsProps) {
  const [expanded, setExpanded] = useState(false);

  if (stats.length === 0) return null;

  const totalFeatures = stats.reduce((sum, s) => sum + s.featureCount, 0);
  const totalHectares = stats.reduce((sum, s) => sum + s.totalHectares, 0);

  return (
    <div className="absolute bottom-6 right-4 z-10 max-h-[calc(100dvh-12rem)] w-64 overflow-y-auto rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm md:left-72 md:right-auto">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>
            {stats.length} layer{stats.length !== 1 ? "s" : ""}, {totalFeatures.toLocaleString()} feature{totalFeatures !== 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-3 px-3 pb-3">
          {totalHectares > 0 && (
            <div className="text-xs text-muted-foreground">
              Total: {totalHectares.toLocaleString(undefined, { maximumFractionDigits: 0 })} ha
            </div>
          )}

          {stats.map((s) => (
            <div key={s.layerKey}>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className="text-xs text-muted-foreground/70">
                {s.featureCount.toLocaleString()} features
                {s.totalHectares > 0 && (
                  <> / {s.totalHectares.toLocaleString(undefined, { maximumFractionDigits: 0 })} ha</>
                )}
              </div>
              {Object.keys(s.groups).length > 1 && (
                <div className="mt-1 space-y-0.5">
                  {Object.entries(s.groups)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 5)
                    .map(([group, data]) => (
                      <div key={group} className="flex items-center justify-between text-[10px] text-muted-foreground/60">
                        <span className="truncate pr-2">{group}</span>
                        <span className="shrink-0 tabular-nums">
                          {data.count}
                          {data.hectares > 0 && (
                            <> / {data.hectares.toLocaleString(undefined, { maximumFractionDigits: 0 })} ha</>
                          )}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
