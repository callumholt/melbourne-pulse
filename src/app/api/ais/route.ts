import WebSocket from "ws";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Port Phillip Bay bounding box
const PORT_PHILLIP_BBOX = [
  [-38.35, 144.4],
  [-37.75, 145.15],
];

const AIS_WS_URL = "wss://stream.aisstream.io/v0/stream";

// Batch buffer for vessel position inserts
interface PositionRecord {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  course: number;
  speed: number;
  heading: number;
}

const positionBuffer: PositionRecord[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function flushPositions() {
  if (positionBuffer.length === 0) return;

  const batch = positionBuffer.splice(0, positionBuffer.length);

  try {
    const sql = getDb();
    // Build batch insert
    const placeholders = batch
      .map((_, i) => {
        const base = i * 7;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
      })
      .join(", ");

    const params = batch.flatMap((p) => [
      p.mmsi,
      p.name || null,
      p.lat,
      p.lon,
      p.course,
      p.speed,
      p.heading,
    ]);

    await sql.query(
      `INSERT INTO vessel_positions (mmsi, vessel_name, lat, lon, course, speed, heading)
       VALUES ${placeholders}`,
      params,
    );
  } catch {
    // Silently fail - vessel history is non-critical
  }
}

// Start flush timer if not already running
function ensureFlushTimer() {
  if (!flushTimer) {
    flushTimer = setInterval(flushPositions, 5000);
  }
}

export async function GET(req: Request) {
  const apiKey = process.env.AIS_API_KEY;
  if (!apiKey) {
    return new Response("AIS_API_KEY not configured", { status: 503 });
  }

  ensureFlushTimer();

  const encoder = new TextEncoder();
  let ws: WebSocket | null = null;

  const stream = new ReadableStream({
    start(controller) {
      ws = new WebSocket(AIS_WS_URL);

      ws.on("open", () => {
        ws!.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [PORT_PHILLIP_BBOX],
            FilterMessageTypes: [
              "PositionReport",
              "StandardClassBPositionReport",
              "ShipStaticData",
            ],
          }),
        );

        // Send a keep-alive comment every 30s
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(":keepalive\n\n"));
          } catch {
            clearInterval(keepAlive);
          }
        }, 30_000);

        ws!.on("close", () => clearInterval(keepAlive));
      });

      ws.on("message", (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          const meta = data.MetaData;
          if (!meta) return;

          const msg =
            data.Message?.PositionReport ??
            data.Message?.StandardClassBPositionReport;

          if (data.MessageType === "ShipStaticData") {
            const s = data.Message.ShipStaticData;
            const dim = s.Dimension ?? {};
            const lengthM = (dim.A ?? 0) + (dim.B ?? 0);
            const widthM = (dim.C ?? 0) + (dim.D ?? 0);
            const event = {
              type: "static",
              mmsi: meta.MMSI,
              name: (s.Name ?? meta.ShipName ?? "").trim(),
              imo: s.ImoNumber || null,
              callSign: (s.CallSign ?? "").trim() || null,
              destination: (s.Destination ?? "").trim() || null,
              shipType: s.Type ?? null,
              length: lengthM || null,
              width: widthM || null,
              draught: s.MaximumStaticDraught || null,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
            return;
          }

          if (!msg) return;

          const lat = meta.latitude ?? msg.Latitude;
          const lon = meta.longitude ?? msg.Longitude;
          const sog = msg.Sog ?? 0;
          const cog = msg.Cog ?? 0;
          const heading = msg.TrueHeading ?? msg.Cog ?? 0;
          const name = meta.ShipName?.trim() || "";

          const event = {
            type: "position",
            mmsi: meta.MMSI,
            name,
            lat,
            lon,
            sog,
            cog,
            heading,
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );

          // Buffer position for batch insert
          positionBuffer.push({
            mmsi: String(meta.MMSI),
            name,
            lat,
            lon,
            course: cog,
            speed: sog,
            heading,
          });
        } catch {
          // skip malformed
        }
      });

      ws.on("error", () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      ws.on("close", () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
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
