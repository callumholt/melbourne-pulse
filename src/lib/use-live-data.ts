"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PrecinctUpdate {
  id: string;
  count: number;
}

interface LiveData {
  connected: boolean;
  precincts: Map<string, number>;
  lastUpdate: Date | null;
}

/**
 * Connect to the /api/live SSE endpoint for real-time precinct count updates.
 * Automatically reconnects on disconnect.
 */
export function useLiveData(enabled: boolean): LiveData {
  const [connected, setConnected] = useState(false);
  const [precincts, setPrecincts] = useState<Map<string, number>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/live", { signal });
      if (!res.ok || !res.body) throw new Error(`Status ${res.status}`);

      setConnected(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "update" && Array.isArray(event.precincts)) {
              const newMap = new Map<string, number>();
              for (const p of event.precincts as PrecinctUpdate[]) {
                newMap.set(p.id, p.count);
              }
              setPrecincts(newMap);
              setLastUpdate(new Date(event.timestamp));
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }

    setConnected(false);

    // Reconnect after 5s
    if (!signal.aborted) {
      retryRef.current = setTimeout(() => connect(signal), 5000);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    connect(controller.signal);

    return () => {
      controller.abort();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [enabled, connect]);

  return { connected, precincts, lastUpdate };
}
