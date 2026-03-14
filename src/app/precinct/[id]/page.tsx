import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PRECINCTS } from "@/lib/constants";
import { getDb } from "@/lib/db";
import {
  getPrecinctHourlyToday,
  getPrecinctHourlyAverage,
  getPrecinctWeeklyPattern,
  getPrecinctDailyTrend,
  getPrecinctStats,
} from "@/lib/precinct-queries";
import { Navbar } from "@/components/navbar";
import { StatsCards } from "@/components/precinct-detail/stats-cards";
import { HourlyChart } from "@/components/precinct-detail/hourly-chart";
import { WeeklyHeatmap } from "@/components/precinct-detail/weekly-heatmap";
import { PrecinctTrendChart } from "@/components/precinct-detail/trend-chart";

export const revalidate = 300;

export function generateStaticParams() {
  return PRECINCTS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const precinct = PRECINCTS.find((p) => p.id === id);
  if (!precinct) return { title: "Not Found" };
  return {
    title: `${precinct.name} - Melbourne Pulse`,
    description: `Real-time pedestrian activity data for ${precinct.name}, Melbourne`,
  };
}

export default async function PrecinctDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const precinct = PRECINCTS.find((p) => p.id === id);
  if (!precinct) notFound();

  const sql = getDb();
  const [dateRow] = await sql`SELECT get_latest_data_date() AS latest_date`;
  const rawDate = dateRow?.latest_date;
  const chartDate = rawDate instanceof Date
    ? format(rawDate, "yyyy-MM-dd")
    : typeof rawDate === "string"
      ? rawDate.slice(0, 10)
      : format(new Date(), "yyyy-MM-dd");

  const [todayHourly, avgHourly, weeklyPattern, dailyTrend, stats] = await Promise.all([
    getPrecinctHourlyToday(id, chartDate),
    getPrecinctHourlyAverage(id),
    getPrecinctWeeklyPattern(id),
    getPrecinctDailyTrend(id),
    getPrecinctStats(id),
  ]);

  const lastUpdated = format(new Date(), "h:mm a");

  return (
    <>
      <Navbar />
      <main className="container mx-auto space-y-6 px-4 py-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: precinct.colour }} />
            <h1 className="text-xl font-bold">{precinct.name}</h1>
          </div>
        </div>

        <StatsCards stats={stats} />

        <div className="grid gap-6 lg:grid-cols-2">
          <HourlyChart todayData={todayHourly} averageData={avgHourly} colour={precinct.colour} />
          <WeeklyHeatmap data={weeklyPattern} colour={precinct.colour} />
        </div>

        <PrecinctTrendChart data={dailyTrend} colour={precinct.colour} />
      </main>
    </>
  );
}
