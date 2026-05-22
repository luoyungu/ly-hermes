import type http from "http";
import type { ChatEvent } from "../core/chat";

export function writeSseHeaders(res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

export function writeSseEvent(res: http.ServerResponse, name: string, data: unknown): void {
  res.write(`event: ${name}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function writeChatEvent(res: http.ServerResponse, event: ChatEvent): void {
  writeSseEvent(res, event.type, event.data);
}
