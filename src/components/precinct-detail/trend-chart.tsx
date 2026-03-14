"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyTotal } from "@/lib/precinct-queries";

interface TrendChartProps {
  data: DailyTotal[];
  colour: string;
}

export function PrecinctTrendChart({ data, colour }: TrendChartProps) {
  const chartData = data.map((d) => ({
    date: d.date,
    label: format(parseISO(d.date), "d MMM"),
    total: d.total,
  }));

  return (
    <Card className="border-border/40">
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">90-Day Trend</h3>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <XAxis
                dataKey="label"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                interval={Math.floor(chartData.length / 8)}
              />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload;
                  return item?.date ? format(parseISO(item.date), "EEE d MMM yyyy") : "";
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke={colour}
                fill={colour}
                fillOpacity={0.2}
                name="Daily Total"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
