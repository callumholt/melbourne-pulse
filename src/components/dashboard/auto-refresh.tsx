"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL = 5 * 60; // 5 minutes in seconds

export function AutoRefresh() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

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

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      Refreshes in {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
