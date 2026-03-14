import { getDb } from "./db";

export interface HourlyCount {
  hour: number;
  count: number;
}

export interface WeeklyPattern {
  dow: number; // 0=Sun, 6=Sat
  hour: number;
  avg_count: number;
}

export interface DailyTotal {
  date: string;
  total: number;
}

export interface PrecinctStats {
  busiestHour: number;
  busiestDay: string;
  peakCount: number;
  avgDailyCount: number;
  totalSensors: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Get today's hourly counts for a precinct.
 */
export async function getPrecinctHourlyToday(precinctId: string, date: string): Promise<HourlyCount[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT pc.hour_of_day AS hour, SUM(pc.count)::INTEGER AS count
    FROM pedestrian_counts pc
    JOIN sensors s ON s.sensor_id = pc.sensor_id
    WHERE s.precinct_id = ${precinctId}
      AND pc.counted_at::DATE = ${date}::DATE
    GROUP BY pc.hour_of_day
    ORDER BY pc.hour_of_day
  `;

  const hourMap = new Map<number, number>();
  for (const r of rows) {
    hourMap.set(Number(r.hour), Number(r.count));
  }
  const result: HourlyCount[] = [];
  for (let h = 0; h < 24; h++) {
    result.push({ hour: h, count: hourMap.get(h) ?? 0 });
  }
  return result;
}

/**
 * Get the historical average hourly pattern for this precinct (90 days).
 */
export async function getPrecinctHourlyAverage(precinctId: string): Promise<HourlyCount[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT pc.hour_of_day AS hour, AVG(daily_total)::INTEGER AS count
    FROM (
      SELECT pc.hour_of_day, pc.counted_at::DATE AS day, SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      JOIN sensors s ON s.sensor_id = pc.sensor_id
      WHERE s.precinct_id = ${precinctId}
        AND pc.counted_at > NOW() - INTERVAL '90 days'
      GROUP BY pc.hour_of_day, pc.counted_at::DATE
    ) pc
    GROUP BY pc.hour_of_day
    ORDER BY pc.hour_of_day
  `;

  const hourMap = new Map<number, number>();
  for (const r of rows) {
    hourMap.set(Number(r.hour), Number(r.count));
  }
  const result: HourlyCount[] = [];
  for (let h = 0; h < 24; h++) {
    result.push({ hour: h, count: hourMap.get(h) ?? 0 });
  }
  return result;
}

/**
 * Get 7x24 weekly pattern for the heatmap.
 */
export async function getPrecinctWeeklyPattern(precinctId: string): Promise<WeeklyPattern[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      pc.day_of_week AS dow,
      pc.hour_of_day AS hour,
      AVG(daily_total)::REAL AS avg_count
    FROM (
      SELECT pc.day_of_week, pc.hour_of_day, pc.counted_at::DATE AS day, SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      JOIN sensors s ON s.sensor_id = pc.sensor_id
      WHERE s.precinct_id = ${precinctId}
        AND pc.counted_at > NOW() - INTERVAL '90 days'
      GROUP BY pc.day_of_week, pc.hour_of_day, pc.counted_at::DATE
    ) pc
    GROUP BY pc.day_of_week, pc.hour_of_day
    ORDER BY pc.day_of_week, pc.hour_of_day
  `;

  return rows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    avg_count: Number(r.avg_count),
  }));
}

/**
 * Get 90-day daily totals for trend chart.
 */
export async function getPrecinctDailyTrend(precinctId: string): Promise<DailyTotal[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT pc.counted_at::DATE AS date, SUM(pc.count)::INTEGER AS total
    FROM pedestrian_counts pc
    JOIN sensors s ON s.sensor_id = pc.sensor_id
    WHERE s.precinct_id = ${precinctId}
      AND pc.counted_at > NOW() - INTERVAL '90 days'
    GROUP BY pc.counted_at::DATE
    ORDER BY date
  `;

  return rows.map((r) => ({
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    total: Number(r.total),
  }));
}

/**
 * Get summary stats for a precinct.
 */
export async function getPrecinctStats(precinctId: string): Promise<PrecinctStats> {
  const sql = getDb();

  const [hourlyRow] = await sql`
    SELECT pc.hour_of_day AS hour, AVG(daily_total)::INTEGER AS avg_total
    FROM (
      SELECT pc.hour_of_day, pc.counted_at::DATE AS day, SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      JOIN sensors s ON s.sensor_id = pc.sensor_id
      WHERE s.precinct_id = ${precinctId}
        AND pc.counted_at > NOW() - INTERVAL '90 days'
      GROUP BY pc.hour_of_day, pc.counted_at::DATE
    ) pc
    GROUP BY pc.hour_of_day
    ORDER BY avg_total DESC
    LIMIT 1
  `;

  const [dayRow] = await sql`
    SELECT pc.day_of_week AS dow, AVG(daily_total)::INTEGER AS avg_total
    FROM (
      SELECT pc.day_of_week, pc.counted_at::DATE AS day, SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      JOIN sensors s ON s.sensor_id = pc.sensor_id
      WHERE s.precinct_id = ${precinctId}
        AND pc.counted_at > NOW() - INTERVAL '90 days'
      GROUP BY pc.day_of_week, pc.counted_at::DATE
    ) pc
    GROUP BY pc.day_of_week
    ORDER BY avg_total DESC
    LIMIT 1
  `;

  const [peakRow] = await sql`
    SELECT MAX(daily_total)::INTEGER AS peak
    FROM (
      SELECT pc.counted_at::DATE AS day, SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      JOIN sensors s ON s.sensor_id = pc.sensor_id
      WHERE s.precinct_id = ${precinctId}
        AND pc.counted_at > NOW() - INTERVAL '90 days'
      GROUP BY pc.counted_at::DATE
    ) pc
  `;

  const [avgRow] = await sql`
    SELECT AVG(daily_total)::INTEGER AS avg_daily
    FROM (
      SELECT pc.counted_at::DATE AS day, SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      JOIN sensors s ON s.sensor_id = pc.sensor_id
      WHERE s.precinct_id = ${precinctId}
        AND pc.counted_at > NOW() - INTERVAL '90 days'
      GROUP BY pc.counted_at::DATE
    ) pc
  `;

  const [sensorRow] = await sql`
    SELECT COUNT(*)::INTEGER AS cnt
    FROM sensors
    WHERE precinct_id = ${precinctId} AND status = 'A'
  `;

  return {
    busiestHour: Number(hourlyRow?.hour ?? 12),
    busiestDay: DAY_NAMES[Number(dayRow?.dow ?? 5)],
    peakCount: Number(peakRow?.peak ?? 0),
    avgDailyCount: Number(avgRow?.avg_daily ?? 0),
    totalSensors: Number(sensorRow?.cnt ?? 0),
  };
}
