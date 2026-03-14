import { getDb } from "./db";

export interface Anomaly {
  precinct_id: string;
  detected_at: string;
  hour: number;
  actual_count: number;
  expected_count: number;
  z_score: number;
  direction: "above" | "below";
  severity: "moderate" | "significant" | "extreme";
  explanation: string | null;
}

function classifySeverity(zScore: number): "moderate" | "significant" | "extreme" {
  const abs = Math.abs(zScore);
  if (abs >= 4) return "extreme";
  if (abs >= 3) return "significant";
  return "moderate";
}

/**
 * Detect anomalies by comparing current counts against the weekly pattern.
 * An anomaly is any count more than 2 standard deviations from the expected value
 * for that precinct/day-of-week/hour combination.
 */
export async function detectAnomalies(): Promise<Anomaly[]> {
  const sql = getDb();

  // Get the latest hour of data
  const [latest] = await sql`
    SELECT MAX(counted_at) AS max_time FROM pedestrian_counts
  `;
  if (!latest?.max_time) return [];

  const maxTime = new Date(latest.max_time);
  const hour = maxTime.getHours();
  const dow = maxTime.getDay();
  const dateStr = maxTime.toISOString().slice(0, 10);

  // Get current counts per precinct for this hour
  const currentRows = await sql`
    SELECT s.precinct_id, SUM(pc.count)::INTEGER AS actual_count
    FROM pedestrian_counts pc
    JOIN sensors s ON s.sensor_id = pc.sensor_id
    WHERE pc.counted_at::DATE = ${dateStr}::DATE
      AND pc.hour_of_day = ${hour}
    GROUP BY s.precinct_id
  `;

  // Get historical stats for this hour/dow per precinct
  const histRows = await sql`
    SELECT s.precinct_id,
           AVG(daily_total)::REAL AS mean_count,
           STDDEV(daily_total)::REAL AS stddev_count
    FROM (
      SELECT s.precinct_id, SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      JOIN sensors s ON s.sensor_id = pc.sensor_id
      WHERE pc.hour_of_day = ${hour}
        AND pc.day_of_week = ${dow}
        AND pc.counted_at > NOW() - INTERVAL '90 days'
        AND pc.counted_at::DATE < ${dateStr}::DATE
      GROUP BY s.precinct_id, pc.counted_at::DATE
    ) sub
    JOIN sensors s ON TRUE
    GROUP BY s.precinct_id
  `;

  const histMap = new Map<string, { mean: number; stddev: number }>();
  for (const row of histRows) {
    histMap.set(String(row.precinct_id), {
      mean: Number(row.mean_count) || 0,
      stddev: Number(row.stddev_count) || 1,
    });
  }

  const anomalies: Anomaly[] = [];

  for (const row of currentRows) {
    const precinctId = String(row.precinct_id);
    const actual = Number(row.actual_count);
    const hist = histMap.get(precinctId);
    if (!hist || hist.stddev < 1) continue;

    const zScore = (actual - hist.mean) / hist.stddev;
    if (Math.abs(zScore) < 2) continue;

    anomalies.push({
      precinct_id: precinctId,
      detected_at: maxTime.toISOString(),
      hour,
      actual_count: actual,
      expected_count: hist.mean,
      z_score: Math.round(zScore * 100) / 100,
      direction: zScore > 0 ? "above" : "below",
      severity: classifySeverity(zScore),
      explanation: explainAnomaly(actual, hist.mean, zScore),
    });
  }

  return anomalies;
}

/**
 * Generate a human-readable explanation for an anomaly.
 */
function explainAnomaly(actual: number, expected: number, zScore: number): string {
  const pct = Math.round(((actual - expected) / expected) * 100);
  const dir = zScore > 0 ? "higher" : "lower";
  const severity = classifySeverity(zScore);

  if (severity === "extreme") {
    return `${Math.abs(pct)}% ${dir} than typical - unusually ${dir === "higher" ? "busy" : "quiet"} for this time`;
  }
  if (severity === "significant") {
    return `${Math.abs(pct)}% ${dir} than typical`;
  }
  return `${Math.abs(pct)}% ${dir} than the usual pattern`;
}

/**
 * Store detected anomalies in the database.
 */
export async function storeAnomalies(anomalies: Anomaly[]): Promise<void> {
  if (anomalies.length === 0) return;
  const sql = getDb();

  for (const a of anomalies) {
    await sql`
      INSERT INTO anomalies (precinct_id, detected_at, hour, actual_count, expected_count, z_score, direction, severity, explanation)
      VALUES (${a.precinct_id}, ${a.detected_at}, ${a.hour}, ${a.actual_count}, ${a.expected_count}, ${a.z_score}, ${a.direction}, ${a.severity}, ${a.explanation})
      ON CONFLICT DO NOTHING
    `;
  }
}

/**
 * Get recent anomalies (last 24 hours).
 */
export async function getRecentAnomalies(hours = 24): Promise<Anomaly[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM anomalies
    WHERE detected_at > NOW() - INTERVAL '1 hour' * ${hours}
    ORDER BY detected_at DESC, z_score DESC
    LIMIT 50
  `;

  return rows.map((r) => ({
    precinct_id: String(r.precinct_id),
    detected_at: String(r.detected_at),
    hour: Number(r.hour),
    actual_count: Number(r.actual_count),
    expected_count: Number(r.expected_count),
    z_score: Number(r.z_score),
    direction: String(r.direction) as "above" | "below",
    severity: String(r.severity) as "moderate" | "significant" | "extreme",
    explanation: r.explanation ? String(r.explanation) : null,
  }));
}
