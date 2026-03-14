import { getDb } from "@/lib/db";
import { format } from "date-fns";
import { PRECINCTS } from "@/lib/constants";
import { Navbar } from "@/components/navbar";
import { WeatherBadge } from "@/components/dashboard/weather-badge";
import { CityPulseHero } from "@/components/dashboard/city-pulse-hero";
import { getLatestWeather } from "@/lib/weather";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ActivitySection } from "@/components/dashboard/activity-section";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { getPrecinctTreeStats } from "@/lib/tree-queries";

export const revalidate = 300;

export default async function DashboardPage() {
  const sql = getDb();

  // Get latest date with data
  const [dateRow] = await sql`SELECT get_latest_data_date() AS latest_date`;
  const rawDate = dateRow?.latest_date;
  const chartDate = rawDate instanceof Date
    ? format(rawDate, "yyyy-MM-dd")
    : typeof rawDate === "string"
      ? rawDate.slice(0, 10)
      : format(new Date(), "yyyy-MM-dd");

  // Fetch weather (non-critical, catch errors)
  const weather = await getLatestWeather().catch(() => ({ temperature: null, humidity: null, rain: false, lastUpdated: null }));

  const [pulseRows, activityRows, hourlyRows, dailyRows, sensorRows] = await Promise.all([
    sql`SELECT * FROM get_city_pulse()`,
    sql`SELECT * FROM precinct_current_activity ORDER BY total_count DESC`,
    sql`SELECT * FROM get_precinct_today_hourly(${chartDate}::date)`,
    sql`SELECT * FROM get_daily_totals(90)`,
    sql`SELECT * FROM get_sensor_daily_counts(${chartDate}::date)`,
  ]);

  const pulse = pulseRows[0] ?? { total_current: 0, sensor_count: 0, historical_avg: 0, data_date: null };
  const activity = activityRows as Array<{
    precinct_id: string;
    precinct_name: string;
    colour: string;
    total_count: number;
    sensor_count: number;
  }>;
  const hourlyRaw = hourlyRows as Array<{
    precinct_id: string;
    hour_of_day: number;
    total_count: number;
  }>;
  const dailyRaw = dailyRows as Array<{
    day: string;
    precinct_id: string;
    total_count: number;
  }>;
  const sensorData = sensorRows as Array<{
    sensor_id: number;
    sensor_name: string;
    lat: number;
    lon: number;
    precinct_id: string;
    total_count: number;
  }>;

  // Fetch tree stats (non-critical)
  const treeStats = await getPrecinctTreeStats().catch(() => []);
  const treeStatsMap = new Map(treeStats.map((t) => [t.precinct_id, t]));

  const overallMax = Math.max(...activity.map((a) => Number(a.total_count) || 0), 1);

  const precinctData = activity.map((a) => {
    const precinct = PRECINCTS.find((p) => p.id === a.precinct_id);
    const count = Number(a.total_count) || 0;
    const trees = treeStatsMap.get(a.precinct_id);
    return {
      id: a.precinct_id,
      name: precinct?.name ?? a.precinct_name ?? a.precinct_id,
      colour: precinct?.colour ?? a.colour ?? "#6b7280",
      count,
      historicalMax: overallMax,
      ratio: Number(pulse.historical_avg) > 0
        ? count / (Number(pulse.historical_avg) / (activity.length || 1))
        : 0,
      treeStats: trees ? {
        tree_count: trees.tree_count,
        species_count: trees.species_count,
        health_score: trees.health_score,
      } : null,
    };
  });

  // Build hourly chart data
  const hourlyMap = new Map<number, Record<string, number>>();
  for (let h = 0; h < 24; h++) {
    hourlyMap.set(h, { hour: h });
  }
  for (const row of hourlyRaw) {
    const entry = hourlyMap.get(Number(row.hour_of_day))!;
    entry[row.precinct_id] = Number(row.total_count);
  }
  const hourlyData = Array.from(hourlyMap.values()) as Array<{ hour: number; [precinctId: string]: number }>;

  // Build daily trend data
  const dailyMap = new Map<string, Record<string, number | string>>();
  for (const row of dailyRaw) {
    const dayStr = (row.day as unknown) instanceof Date
      ? format(row.day as unknown as Date, "yyyy-MM-dd")
      : String(row.day).slice(0, 10);
    if (!dailyMap.has(dayStr)) {
      dailyMap.set(dayStr, { date: dayStr });
    }
    dailyMap.get(dayStr)![row.precinct_id] = Number(row.total_count);
  }
  const dailyData = Array.from(dailyMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  ) as Array<{ date: string; [precinctId: string]: number | string }>;

  // Precinct name/colour map for charts
  const precinctNames: Record<string, { name: string; colour: string }> = {};
  for (const p of PRECINCTS) {
    precinctNames[p.id] = { name: p.name, colour: p.colour };
  }

  const lastUpdated = format(new Date(), "h:mm a");

  return (
    <>
      <Navbar rightContent={
        <>
          <WeatherBadge temperature={weather.temperature ?? null} humidity={weather.humidity ?? null} />
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Updated {lastUpdated}
          </span>
        </>
      } />
      <main className="container mx-auto space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="sr-only">Melbourne Pulse Dashboard</h1>
          <AutoRefresh />
        </div>

        <CityPulseHero
          totalCurrent={Number(pulse.total_current)}
          historicalAvg={Number(pulse.historical_avg)}
          sensorCount={Number(pulse.sensor_count)}
          dataDate={pulse.data_date
            ? (pulse.data_date instanceof Date
              ? format(pulse.data_date, "yyyy-MM-dd")
              : String(pulse.data_date).slice(0, 10))
            : null}
        />

        <DashboardClient
          precinctData={precinctData}
          sensorData={sensorData}
          precinctNames={precinctNames}
          chartDate={chartDate}
        />

        <ActivitySection
          initialHourlyData={hourlyData}
          precinctNames={precinctNames}
          initialDate={chartDate}
        />

        <section>
          <h2 className="mb-4 text-lg font-semibold">90-Day Trend</h2>
          <TrendChart dailyData={dailyData} precinctNames={precinctNames} />
        </section>
      </main>
    </>
  );
}
