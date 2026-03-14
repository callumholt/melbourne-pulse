"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { WeeklyPattern } from "@/lib/precinct-queries";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = ["12a", "", "", "3a", "", "", "6a", "", "", "9a", "", "", "12p", "", "", "3p", "", "", "6p", "", "", "9p", "", ""];

interface WeeklyHeatmapProps {
  data: WeeklyPattern[];
  colour: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [107, 114, 128];
}

export function WeeklyHeatmap({ data, colour }: WeeklyHeatmapProps) {
  const maxCount = Math.max(...data.map((d) => d.avg_count), 1);
  const rgb = hexToRgb(colour);

  // Build a lookup: [dow][hour] -> avg_count
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const d of data) {
    grid[d.dow][d.hour] = d.avg_count;
  }

  const cellSize = 20;
  const labelW = 32;
  const labelH = 20;
  const svgW = labelW + 24 * cellSize;
  const svgH = labelH + 7 * cellSize;

  return (
    <Card className="border-border/40">
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Weekly Pattern</h3>
        <div className="overflow-x-auto">
          <svg width={svgW} height={svgH} className="text-xs">
            {/* Hour labels */}
            {HOUR_LABELS.map((label, h) => (
              label && (
                <text
                  key={`h-${h}`}
                  x={labelW + h * cellSize + cellSize / 2}
                  y={labelH - 4}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="9"
                >
                  {label}
                </text>
              )
            ))}

            {/* Day labels + cells */}
            {DAY_LABELS.map((day, dow) => (
              <g key={day}>
                <text
                  x={labelW - 4}
                  y={labelH + dow * cellSize + cellSize / 2 + 3}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize="10"
                >
                  {day}
                </text>
                {Array.from({ length: 24 }, (_, hour) => {
                  const intensity = grid[dow][hour] / maxCount;
                  const alpha = Math.floor(intensity * 220 + 20);
                  return (
                    <rect
                      key={`${dow}-${hour}`}
                      x={labelW + hour * cellSize}
                      y={labelH + dow * cellSize}
                      width={cellSize - 1}
                      height={cellSize - 1}
                      rx={2}
                      fill={`rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha / 255})`}
                    >
                      <title>{`${DAY_LABELS[dow]} ${hour}:00 - avg ${Math.round(grid[dow][hour]).toLocaleString()}`}</title>
                    </rect>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
