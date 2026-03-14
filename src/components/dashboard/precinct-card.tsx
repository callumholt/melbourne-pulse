"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ActivityBadge } from "@/components/activity-badge";
import { MapPin, TreePine } from "lucide-react";

interface TreeStats {
  tree_count: number;
  species_count: number;
  health_score: number;
}

interface PrecinctCardProps {
  id?: string;
  name: string;
  colour: string;
  count: number;
  historicalMax: number;
  ratio: number;
  treeStats?: TreeStats | null;
  onLocateClick?: () => void;
}

export function PrecinctCard({ id, name, colour, count, historicalMax, ratio, treeStats, onLocateClick }: PrecinctCardProps) {
  const progress = Math.min((count / historicalMax) * 100, 100);

  const content = (
    <>
      <div className="h-1" style={{ backgroundColor: colour }} />
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{name}</span>
          <div className="flex items-center gap-1.5">
            {onLocateClick && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLocateClick();
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Locate on map"
              >
                <MapPin className="h-3 w-3" />
              </button>
            )}
            <ActivityBadge ratio={ratio} />
          </div>
        </div>

        <div className="text-2xl font-bold tabular-nums">
          {count.toLocaleString()}
        </div>

        <Progress value={progress} className="h-1.5" />

        {treeStats && treeStats.tree_count > 0 && (
          <div className="flex items-center gap-2 border-t border-border/30 pt-2 text-xs text-muted-foreground">
            <TreePine className={`h-3 w-3 ${treeStats.health_score >= 70 ? "text-green-400" : treeStats.health_score >= 40 ? "text-yellow-400" : "text-red-400"}`} />
            <span className="tabular-nums">{treeStats.tree_count.toLocaleString()} trees</span>
            <span className="text-border">|</span>
            <span className="tabular-nums">{treeStats.species_count} species</span>
          </div>
        )}
      </CardContent>
    </>
  );

  if (id) {
    return (
      <Link href={`/precinct/${id}`} className="block">
        <Card className="overflow-hidden border-border/40 transition-colors hover:border-border/80">
          {content}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="overflow-hidden border-border/40">
      {content}
    </Card>
  );
}
