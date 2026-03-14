"use client";

import { AlertTriangle } from "lucide-react";

interface AnomalyBadgeProps {
  severity: "moderate" | "significant" | "extreme";
  direction: "above" | "below";
  explanation?: string | null;
}

const SEVERITY_STYLES = {
  moderate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  significant: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  extreme: "bg-red-500/20 text-red-400 border-red-500/30",
} as const;

export function AnomalyBadge({ severity, direction, explanation }: AnomalyBadgeProps) {
  return (
    <div
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_STYLES[severity]}`}
      title={explanation ?? `Unusually ${direction === "above" ? "busy" : "quiet"}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {severity !== "moderate" && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            severity === "extreme" ? "bg-red-400" : "bg-orange-400"
          }`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
          severity === "extreme" ? "bg-red-400" : severity === "significant" ? "bg-orange-400" : "bg-yellow-400"
        }`} />
      </span>
      <AlertTriangle className="h-2.5 w-2.5" />
      <span className="capitalize">{severity}</span>
    </div>
  );
}
