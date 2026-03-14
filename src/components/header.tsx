import { Activity } from "lucide-react";

export function Header({ lastUpdated }: { lastUpdated?: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-blue-500" />
          <span className="text-lg font-semibold tracking-tight">Melbourne Pulse</span>
        </div>
        {lastUpdated && (
          <span className="text-sm text-muted-foreground">
            Updated {lastUpdated}
          </span>
        )}
      </div>
    </header>
  );
}
