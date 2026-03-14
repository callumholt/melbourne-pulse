import { Activity } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { WeatherBadge } from "@/components/dashboard/weather-badge";

interface HeaderProps {
  lastUpdated?: string;
  temperature?: number | null;
  humidity?: number | null;
}

export function Header({ lastUpdated, temperature, humidity }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-blue-500" />
          <span className="text-lg font-semibold tracking-tight">Melbourne Pulse</span>
        </div>
        <div className="flex items-center gap-3">
          <WeatherBadge temperature={temperature ?? null} humidity={humidity ?? null} />
          {lastUpdated && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Updated {lastUpdated}
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
