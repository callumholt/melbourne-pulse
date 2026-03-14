import { getDb } from "./db";
import { PRECINCTS } from "./constants";

export interface WeeklyDigestData {
  totalCount: number;
  avgDailyCount: number;
  topPrecincts: Array<{ name: string; total: number }>;
  bottomPrecincts: Array<{ name: string; total: number }>;
  anomalyCount: number;
  significantAnomalies: Array<{
    precinct: string;
    severity: string;
    explanation: string | null;
  }>;
}

/**
 * Compile weekly stats for the digest email.
 */
export async function compileWeeklyDigest(): Promise<WeeklyDigestData> {
  const sql = getDb();

  // Total count for the week
  const [totalRow] = await sql`
    SELECT SUM(count)::BIGINT AS total, COUNT(DISTINCT counted_at::DATE)::INTEGER AS days
    FROM pedestrian_counts
    WHERE counted_at > NOW() - INTERVAL '7 days'
  `;

  const totalCount = Number(totalRow?.total ?? 0);
  const days = Number(totalRow?.days ?? 1);
  const avgDailyCount = Math.round(totalCount / days);

  // Precinct totals for the week
  const precinctRows = await sql`
    SELECT s.precinct_id, SUM(pc.count)::BIGINT AS total
    FROM pedestrian_counts pc
    JOIN sensors s ON s.sensor_id = pc.sensor_id
    WHERE pc.counted_at > NOW() - INTERVAL '7 days'
    GROUP BY s.precinct_id
    ORDER BY total DESC
  `;

  const precinctMap = new Map<string, string>(PRECINCTS.map((p) => [p.id, p.name]));
  const allPrecincts = precinctRows.map((r) => ({
    name: precinctMap.get(String(r.precinct_id)) ?? String(r.precinct_id),
    total: Number(r.total),
  }));

  const topPrecincts = allPrecincts.slice(0, 3);
  const bottomPrecincts = allPrecincts.slice(-3).reverse();

  // Anomalies from the week
  const anomalyRows = await sql`
    SELECT precinct_id, severity, explanation
    FROM anomalies
    WHERE detected_at > NOW() - INTERVAL '7 days'
    ORDER BY z_score DESC
  `;

  const anomalyCount = anomalyRows.length;
  const significantAnomalies = anomalyRows
    .filter((r) => r.severity !== "moderate")
    .slice(0, 5)
    .map((r) => ({
      precinct: precinctMap.get(String(r.precinct_id)) ?? String(r.precinct_id),
      severity: String(r.severity),
      explanation: r.explanation ? String(r.explanation) : null,
    }));

  return {
    totalCount,
    avgDailyCount,
    topPrecincts,
    bottomPrecincts,
    anomalyCount,
    significantAnomalies,
  };
}

/**
 * Format digest data as plain text email.
 */
export function formatDigestEmail(data: WeeklyDigestData): { subject: string; text: string } {
  const lines = [
    "Melbourne Pulse - Weekly Digest",
    "================================",
    "",
    `Total pedestrians this week: ${data.totalCount.toLocaleString()}`,
    `Daily average: ${data.avgDailyCount.toLocaleString()}`,
    "",
    "Top Precincts:",
    ...data.topPrecincts.map((p, i) => `  ${i + 1}. ${p.name}: ${p.total.toLocaleString()}`),
    "",
    "Quietest Precincts:",
    ...data.bottomPrecincts.map((p, i) => `  ${i + 1}. ${p.name}: ${p.total.toLocaleString()}`),
  ];

  if (data.anomalyCount > 0) {
    lines.push("", `Anomalies detected: ${data.anomalyCount}`);
    if (data.significantAnomalies.length > 0) {
      lines.push("Notable anomalies:");
      for (const a of data.significantAnomalies) {
        lines.push(`  - ${a.precinct} (${a.severity}): ${a.explanation ?? "unusual activity"}`);
      }
    }
  }

  lines.push("", "---", "View dashboard: https://melbourne-pulse.vercel.app");

  return {
    subject: `Melbourne Pulse Weekly Digest - ${data.totalCount.toLocaleString()} pedestrians`,
    text: lines.join("\n"),
  };
}
