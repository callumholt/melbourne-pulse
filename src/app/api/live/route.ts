export const dynamic = "force-dynamic";
export const runtime = "edge";

import { neon } from "@neondatabase/serverless";

const POLL_INTERVAL = 10_000; // 10 seconds

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastTimestamp = "";

      const poll = async () => {
        try {
          const sql = neon(process.env.DATABASE_URL!);

          // Get latest precinct activity
          const rows = await sql`
            SELECT
              s.precinct_id,
              COALESCE(SUM(pc.count), 0)::INTEGER AS total_count,
              MAX(pc.counted_at)::TEXT AS latest_time
            FROM sensors s
            LEFT JOIN pedestrian_counts pc ON pc.sensor_id = s.sensor_id
              AND pc.counted_at > NOW() - INTERVAL '2 hours'
            WHERE s.status = 'A'
            GROUP BY s.precinct_id
          `;

          // Check if data has changed
          const newTimestamp = rows.map((r) => r.latest_time).sort().join(",");
          if (newTimestamp !== lastTimestamp) {
            lastTimestamp = newTimestamp;

            const data = {
              type: "update",
              timestamp: new Date().toISOString(),
              precincts: rows.map((r) => ({
                id: r.precinct_id,
                count: Number(r.total_count),
              })),
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } else {
            // Send heartbeat
            controller.enqueue(encoder.encode(`:heartbeat\n\n`));
          }
        } catch {
          // Silently continue on error
          controller.enqueue(encoder.encode(`:error\n\n`));
        }
      };

      // Initial data push
      await poll();

      // Poll every 10 seconds
      const interval = setInterval(poll, POLL_INTERVAL);

      // Clean up when client disconnects
      const cleanup = () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Edge runtime doesn't support AbortSignal on ReadableStream,
      // so we rely on the framework to cancel the stream
      controller.enqueue(encoder.encode(`:connected\n\n`));

      // Keep connection alive for max 5 minutes, then let client reconnect
      setTimeout(cleanup, 5 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
