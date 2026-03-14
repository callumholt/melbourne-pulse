"use client";

import { TreePine } from "lucide-react";

interface CanopyBadgeProps {
  treeCount: number;
  healthScore: number;
}

export function CanopyBadge({ treeCount, healthScore }: CanopyBadgeProps) {
  if (treeCount === 0) return null;

  const colour = healthScore >= 70 ? "text-green-400" : healthScore >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-sm" title={`${treeCount.toLocaleString()} trees, ${healthScore}% canopy health`}>
      <TreePine className={`h-3.5 w-3.5 ${colour}`} />
      <span className="font-medium tabular-nums">{(treeCount / 1000).toFixed(1)}k</span>
      <span className="text-xs text-muted-foreground">{healthScore}%</span>
    </div>
  );
}
