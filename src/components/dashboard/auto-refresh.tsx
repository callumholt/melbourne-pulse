"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveData } from "@/lib/use-live-data";

const REFRESH_INTERVAL = 5 * 60; // 5 minutes in seconds

export function AutoRefresh() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const { connected, lastUpdate } = useLiveData(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.refresh();
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  // Refresh the page when live data updates
  useEffect(() => {
    if (lastUpdate) {
      router.refresh();
      setCountdown(REFRESH_INTERVAL);
    }
  }, [lastUpdate, router]);

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="flex items-center gap-2">
      {connected && (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-xs text-green-400">Live</span>
        </div>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        Refreshes in {minutes}:{seconds.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
