import http from "http";
import { AuthService } from "../core/auth";
import { createRequestContext } from "../core/context/request-context";
import { serverAuthStore } from "./auth-file-store";
import { writeChatEvent, writeSseHeaders } from "./sse";

const authService = new AuthService(serverAuthStore);

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) as Record<string, unknown> : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const ctx = createRequestContext("server", { source: "http" });

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, requestId: ctx.requestId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/check-initialized") {
    sendJson(res, 200, { initialized: authService.checkInitialized(), requestId: ctx.requestId });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/setup-password") {
    const body = await readJsonBody(req);
    sendJson(res, 200, { ...authService.setupPassword(String(body.password || "")), requestId: ctx.requestId });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    sendJson(res, 200, { ...authService.login(String(body.password || "")), requestId: ctx.requestId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/chat/demo-stream") {
    writeSseHeaders(res);
    writeChatEvent(res, {
      type: "chunk",
      data: { profileName: "default", chunk: "Hermes Web SSE bridge is ready." },
    });
    writeChatEvent(res, {
      type: "done",
      data: { profileName: "default", sessionId: ctx.requestId },
    });
    res.end();
    return;
  }

  sendJson(res, 404, { error: "Not found", requestId: ctx.requestId });
}

export function createHermesServer(): http.Server {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((error: unknown) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal server error" });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createHermesServer().listen(port, () => {
    console.log(`Hermes server listening on http://127.0.0.1:${port}`);
  });
}
