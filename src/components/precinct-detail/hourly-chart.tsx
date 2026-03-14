"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from "recharts";
import type { HourlyCount } from "@/lib/precinct-queries";

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

interface HourlyChartProps {
  todayData: HourlyCount[];
  averageData: HourlyCount[];
  colour: string;
}

export function HourlyChart({ todayData, averageData, colour }: HourlyChartProps) {
  const data = todayData.map((d, i) => ({
    hour: formatHour(d.hour),
    today: d.count,
    average: averageData[i]?.count ?? 0,
  }));

  return (
    <Card className="border-border/40">
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Today vs Average</h3>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <XAxis dataKey="hour" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="average"
                stroke="#6b7280"
                fill="#6b7280"
                fillOpacity={0.15}
                strokeDasharray="4 4"
                name="90-day avg"
              />
              <Area
                type="monotone"
                dataKey="today"
                stroke={colour}
                fill={colour}
                fillOpacity={0.3}
                name="Today"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
