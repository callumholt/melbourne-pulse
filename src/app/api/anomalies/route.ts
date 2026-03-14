import { NextRequest, NextResponse } from "next/server";
import { getRecentAnomalies } from "@/lib/anomaly-detection";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hours = Number(req.nextUrl.searchParams.get("hours") ?? "24");
  const clampedHours = Math.min(Math.max(hours, 1), 168); // max 7 days

  const anomalies = await getRecentAnomalies(clampedHours);
  return NextResponse.json(anomalies);
}
