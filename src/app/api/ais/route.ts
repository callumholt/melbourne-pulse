import WebSocket from "ws";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Port Phillip Bay bounding box
const PORT_PHILLIP_BBOX = [
  [-38.35, 144.4],
  [-37.75, 145.15],
];

const AIS_WS_URL = "wss://stream.aisstream.io/v0/stream";

export async function GET() {
  const apiKey = process.env.AIS_API_KEY;
  if (!apiKey) {
    return new Response("AIS_API_KEY not configured", { status: 503 });
  }

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
            const event = {
              type: "static",
              mmsi: meta.MMSI,
              name: meta.ShipName?.trim() || "",
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
            return;
          }

          if (!msg) return;

          const event = {
            type: "position",
            mmsi: meta.MMSI,
            name: meta.ShipName?.trim() || "",
            lat: meta.latitude ?? msg.Latitude,
            lon: meta.longitude ?? msg.Longitude,
            sog: msg.Sog ?? 0,
            cog: msg.Cog ?? 0,
            heading: msg.TrueHeading ?? msg.Cog ?? 0,
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
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
