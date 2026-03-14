"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ActivityBadge } from "@/components/activity-badge";

interface PrecinctCardProps {
  name: string;
  colour: string;
  count: number;
  historicalMax: number;
  ratio: number;
}

export function PrecinctCard({ name, colour, count, historicalMax, ratio }: PrecinctCardProps) {
  const progress = Math.min((count / historicalMax) * 100, 100);

  return (
    <Card className="overflow-hidden border-border/40">
      <div className="h-1" style={{ backgroundColor: colour }} />
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{name}</span>
          <ActivityBadge ratio={ratio} />
        </div>

        <div className="text-2xl font-bold tabular-nums">
          {count.toLocaleString()}
        </div>

        <Progress value={progress} className="h-1.5" />
      </CardContent>
    </Card>
  );
}
