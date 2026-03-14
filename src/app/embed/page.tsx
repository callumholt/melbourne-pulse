import { getDb } from "@/lib/db";
import { format } from "date-fns";
import { PRECINCTS } from "@/lib/constants";
import { EmbedClient } from "./embed-client";

export const revalidate = 300;

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const sql = getDb();

  const [dateRow] = await sql`SELECT get_latest_data_date() AS latest_date`;
  const rawDate = dateRow?.latest_date;
  const chartDate = rawDate instanceof Date
    ? format(rawDate, "yyyy-MM-dd")
    : typeof rawDate === "string"
      ? rawDate.slice(0, 10)
      : format(new Date(), "yyyy-MM-dd");

  const sensorRows = await sql`SELECT * FROM get_sensor_daily_counts(${chartDate}::date)`;
  const sensorData = sensorRows as Array<{
    sensor_id: number;
    sensor_name: string;
    lat: number;
    lon: number;
    precinct_id: string;
    total_count: number;
  }>;

  // Filter to specific precinct if specified
  const precinctFilter = params.precinct;
  const filteredSensors = precinctFilter
    ? sensorData.filter((s) => s.precinct_id === precinctFilter)
    : sensorData;

  const precinctNames: Record<string, { name: string; colour: string }> = {};
  for (const p of PRECINCTS) {
    precinctNames[p.id] = { name: p.name, colour: p.colour };
  }

  return (
    <EmbedClient
      sensors={filteredSensors}
      precinctNames={precinctNames}
      chartDate={chartDate}
      layerMode={(params.layer as "columns" | "heatmap") ?? "columns"}
      showControls={params.controls !== "false"}
    />
  );
}
