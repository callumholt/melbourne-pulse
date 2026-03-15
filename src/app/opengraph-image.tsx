import { ImageResponse } from "next/og";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "Melbourne Pulse - Real-time city activity dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

export default async function OGImage() {
  const sql = getDb();

  // Get current pulse data
  const pulseRows = await sql`SELECT * FROM get_city_pulse()`;
  const pulse = pulseRows[0] ?? { total_current: 0, historical_avg: 0 };
  const totalCurrent = Number(pulse.total_current);
  const historicalAvg = Number(pulse.historical_avg);
  const pctVsAvg = historicalAvg > 0
    ? Math.round(((totalCurrent - historicalAvg) / historicalAvg) * 100)
    : 0;

  // Get 24h hourly data for sparkline
  let hourlyData: number[] = [];
  try {
    const [dateRow] = await sql`SELECT get_latest_data_date() AS d`;
    const date = dateRow?.d instanceof Date
      ? dateRow.d.toISOString().slice(0, 10)
      : typeof dateRow?.d === "string"
        ? dateRow.d.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const rows = await sql`
      SELECT hour_of_day, SUM(total_count)::INTEGER AS total
      FROM get_precinct_today_hourly(${date}::date)
      GROUP BY hour_of_day
      ORDER BY hour_of_day
    `;

    const hourMap = new Map<number, number>();
    for (const r of rows) {
      hourMap.set(Number(r.hour_of_day), Number(r.total));
    }
    for (let h = 0; h < 24; h++) {
      hourlyData.push(hourMap.get(h) ?? 0);
    }
  } catch {
    hourlyData = Array(24).fill(0);
  }

  // Build sparkline SVG path
  const maxVal = Math.max(...hourlyData, 1);
  const sparkW = 400;
  const sparkH = 120;
  const points = hourlyData.map((v, i) => {
    const x = (i / 23) * sparkW;
    const y = sparkH - (v / maxVal) * sparkH;
    return `${x},${y}`;
  });
  const sparklinePath = `M${points.join(" L")}`;
  const areaPath = `${sparklinePath} L${sparkW},${sparkH} L0,${sparkH} Z`;

  const pctColor = pctVsAvg >= 0 ? "#22c55e" : "#f59e0b";
  const pctText = `${pctVsAvg >= 0 ? "+" : ""}${pctVsAvg}% vs typical`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              background: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              color: "white",
            }}
          >
            M
          </div>
          <div style={{ display: "flex", fontSize: "28px", color: "#94a3b8", fontWeight: 500 }}>
            Melbourne Pulse
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "96px", fontWeight: 800, color: "white", lineHeight: 1, marginBottom: "8px" }}>
          {totalCurrent.toLocaleString()}
        </div>

        <div style={{ display: "flex", fontSize: "22px", color: "#94a3b8", marginBottom: "4px" }}>
          pedestrians right now
        </div>

        <div style={{ display: "flex", fontSize: "18px", color: pctColor, marginBottom: "32px" }}>
          {pctText}
        </div>

        <svg width={sparkW} height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`}>
          <path d={areaPath} fill="#3b82f6" fillOpacity="0.3" />
          <path d={sparklinePath} fill="none" stroke="#3b82f6" strokeWidth="3" />
        </svg>

        <div style={{ display: "flex", fontSize: "14px", color: "#475569", marginTop: "24px" }}>
          melbourne-pulse.vercel.app
        </div>
      </div>
    ),
    { ...size },
  );
}
