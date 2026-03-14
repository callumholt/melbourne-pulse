"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock, Calendar, TrendingUp, BarChart3, Radio } from "lucide-react";
import type { PrecinctStats } from "@/lib/precinct-queries";

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function StatsCards({ stats }: { stats: PrecinctStats }) {
  const items = [
    { label: "Busiest Hour", value: formatHour(stats.busiestHour), icon: Clock },
    { label: "Busiest Day", value: stats.busiestDay, icon: Calendar },
    { label: "Peak Day Count", value: stats.peakCount.toLocaleString(), icon: TrendingUp },
    { label: "Avg Daily Count", value: stats.avgDailyCount.toLocaleString(), icon: BarChart3 },
    { label: "Active Sensors", value: String(stats.totalSensors), icon: Radio },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label} className="border-border/40">
          <CardContent className="flex flex-col gap-1 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </div>
            <div className="text-lg font-bold tabular-nums">{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
