"use client";

import { Thermometer, Droplets } from "lucide-react";

interface WeatherBadgeProps {
  temperature: number | null;
  humidity: number | null;
}

export function WeatherBadge({ temperature, humidity }: WeatherBadgeProps) {
  if (temperature == null && humidity == null) return null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border/40 bg-card px-3 py-1.5 text-sm">
      {temperature != null && (
        <div className="flex items-center gap-1">
          <Thermometer className="h-3.5 w-3.5 text-orange-400" />
          <span className="font-medium tabular-nums">{Math.round(temperature)}&deg;C</span>
        </div>
      )}
      {humidity != null && (
        <div className="flex items-center gap-1">
          <Droplets className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-medium tabular-nums">{Math.round(humidity)}%</span>
        </div>
      )}
    </div>
  );
}
