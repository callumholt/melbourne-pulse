"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

interface ActivityChartProps {
  hourlyData: Array<{ hour: number; [precinctId: string]: number }>;
  precinctNames: Record<string, { name: string; colour: string }>;
}

export function ActivityChart({ hourlyData, precinctNames }: ActivityChartProps) {
  const [activeTab, setActiveTab] = useState("all");
  const currentHour = new Date().getHours();
  const precinctIds = Object.keys(precinctNames);

  const formatHour = (hour: number) => {
    if (hour === 0) return "12am";
    if (hour === 12) return "12pm";
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
  };

  return (
    <Card className="border-border/40">
      <CardContent className="flex flex-col gap-4 p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all">City Wide</TabsTrigger>
            {precinctIds.map((id) => (
              <TabsTrigger key={id} value={id}>
                {precinctNames[id].name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {precinctIds.map((id) => (
                  <linearGradient key={id} id={`gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={precinctNames[id].colour} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={precinctNames[id].colour} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.4}
              />

              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => value.toLocaleString()}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--popover-foreground))",
                  fontSize: "12px",
                }}
                labelFormatter={(hour) => formatHour(Number(hour))}
                formatter={(value, name) => [
                  Number(value).toLocaleString(),
                  precinctNames[String(name)]?.name ?? String(name),
                ]}
              />

              <ReferenceLine
                x={currentHour}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: "Now",
                  position: "top",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 12,
                }}
              />

              {activeTab === "all"
                ? precinctIds.map((id) => (
                    <Area
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stackId="1"
                      stroke={precinctNames[id].colour}
                      fill={`url(#gradient-${id})`}
                      strokeWidth={1.5}
                    />
                  ))
                : (
                    <Area
                      type="monotone"
                      dataKey={activeTab}
                      stroke={precinctNames[activeTab]?.colour ?? "#3b82f6"}
                      fill={`url(#gradient-${activeTab})`}
                      strokeWidth={2}
                    />
                  )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
