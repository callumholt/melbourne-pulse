"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";

interface WeatherChartProps {
  hourlyData: Array<{
    hour: number;
    pedestrians: number;
    temperature: number | null;
    humidity: number | null;
  }>;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function WeatherChart({ hourlyData }: WeatherChartProps) {
  const data = hourlyData.map((d) => ({
    ...d,
    label: formatHour(d.hour),
  }));

  return (
    <Card className="border-border/40">
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Pedestrians vs Weather</h3>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="pedestrians"
                fill="#3b82f6"
                fillOpacity={0.5}
                radius={[2, 2, 0, 0]}
                name="Pedestrians"
              />
              <Line
                yAxisId="right"
                dataKey="temperature"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="Temperature (C)"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
