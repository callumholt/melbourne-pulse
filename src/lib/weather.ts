import { getDb } from "./db";

export interface WeatherReading {
  type: string;
  value: number;
  units: string;
  recorded_at: string;
  site_description: string;
}

export interface CurrentWeather {
  temperature: number | null;
  humidity: number | null;
  rain: boolean;
  lastUpdated: string | null;
}

/**
 * Get the latest weather readings (most recent of each type).
 */
export async function getLatestWeather(): Promise<CurrentWeather> {
  const sql = getDb();

  const rows = await sql`
    SELECT DISTINCT ON (type) type, value, units, recorded_at, site_description
    FROM microclimate_readings
    WHERE recorded_at > NOW() - INTERVAL '3 hours'
    ORDER BY type, recorded_at DESC
  `;

  let temperature: number | null = null;
  let humidity: number | null = null;
  let lastUpdated: string | null = null;

  for (const row of rows) {
    const type = String(row.type).toLowerCase();
    if (type.includes("temperature") || type.includes("temp")) {
      temperature = Number(row.value);
      lastUpdated = String(row.recorded_at);
    }
    if (type.includes("humidity")) {
      humidity = Number(row.value);
    }
  }

  return {
    temperature,
    humidity,
    rain: false, // CoM microclimate doesn't have rain directly
    lastUpdated,
  };
}

/**
 * Get weather readings by hour for a given date, for overlay on charts.
 */
export async function getWeatherByHour(date: string): Promise<Array<{ hour: number; temperature: number | null; humidity: number | null }>> {
  const sql = getDb();

  const rows = await sql`
    SELECT
      EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'Australia/Melbourne')::INTEGER AS hour,
      type,
      AVG(value)::REAL AS avg_value
    FROM microclimate_readings
    WHERE recorded_at::DATE = ${date}::DATE
      AND (type ILIKE '%temperature%' OR type ILIKE '%humidity%')
    GROUP BY hour, type
    ORDER BY hour
  `;

  const hourMap = new Map<number, { temperature: number | null; humidity: number | null }>();
  for (let h = 0; h < 24; h++) {
    hourMap.set(h, { temperature: null, humidity: null });
  }

  for (const row of rows) {
    const h = Number(row.hour);
    const entry = hourMap.get(h)!;
    const type = String(row.type).toLowerCase();
    if (type.includes("temperature") || type.includes("temp")) {
      entry.temperature = Number(row.avg_value);
    }
    if (type.includes("humidity")) {
      entry.humidity = Number(row.avg_value);
    }
  }

  return Array.from(hourMap.entries()).map(([hour, data]) => ({
    hour,
    ...data,
  }));
}
