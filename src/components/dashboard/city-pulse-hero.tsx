"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, isToday, parseISO } from "date-fns";

interface CityPulseHeroProps {
  totalCurrent: number;
  historicalAvg: number;
  sensorCount: number;
  dataDate: string | null;
}

export function CityPulseHero({ totalCurrent, historicalAvg, sensorCount, dataDate }: CityPulseHeroProps) {
  const diff = historicalAvg > 0 ? ((totalCurrent - historicalAvg) / historicalAvg) * 100 : 0;
  const isAbove = diff >= 0;

  const parsedDate = dataDate ? new Date(dataDate + "T00:00:00") : null;
  const isLive = parsedDate ? isToday(parsedDate) : false;

  const refDate = parsedDate ?? new Date();
  const dayName = format(refDate, "EEEE");

  return (
    <Card className="border-border/40 bg-gradient-to-br from-blue-500/10 via-background to-background">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        {isLive ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
            </span>
            <span className="text-sm font-medium text-green-500">Live</span>
          </div>
        ) : parsedDate ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
            </span>
            <span className="text-sm font-medium text-amber-500">
              {format(parsedDate, "EEE d MMM").toLowerCase()}
            </span>
          </div>
        ) : null}

        <div className="text-6xl font-bold tracking-tighter tabular-nums md:text-7xl">
          {totalCurrent.toLocaleString()}
        </div>

        <p className="text-lg text-muted-foreground">
          {isLive
            ? "people walked through Melbourne CBD today"
            : "people walked through Melbourne CBD"}
        </p>

        <div className="flex items-center gap-3">
          {historicalAvg > 0 && (
            <Badge
              variant="outline"
              className="border-transparent font-medium"
              style={{
                backgroundColor: isAbove ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                color: isAbove ? "#22c55e" : "#f59e0b",
              }}
            >
              {isAbove ? "+" : ""}{diff.toFixed(0)}% vs typical {dayName}
            </Badge>
          )}

          <span className="text-sm text-muted-foreground">
            {sensorCount} sensors active
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
