import type http from "http";
import { requireRemoteAuth } from "./shared";
import { writeSseHeaders } from "../../sse";

const eventClients = new Set<http.ServerResponse>();

export function broadcastV1Event(event: string, data: Record<string, unknown>): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of eventClients) {
    try {
      client.write(payload);
    } catch {
      eventClients.delete(client);
    }
  }
}

export async function handleV1EventRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/v1/events") {
    if (!requireRemoteAuth(req, res)) return true;
    writeSseHeaders(res);
    eventClients.add(res);
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
        eventClients.delete(res);
      }
    }, 30000);
    req.on("close", () => {
      clearInterval(heartbeat);
      eventClients.delete(res);
    });
    return true;
  }
  return false;
}
