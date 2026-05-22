import http from "http";
import fs from "fs";
import path from "path";
import { AuthService } from "../core/auth";
import { streamHermesGatewayChat } from "../core/chat";
import { createRequestContext } from "../core/context/request-context";
import { getApiPortForProfile, getEmployeeWebAccess } from "../main/employees";
import { serverAuthStore } from "./auth-file-store";
import { writeChatEvent, writeSseHeaders } from "./sse";

const authService = new AuthService(serverAuthStore);
const EMBED_DIST_DIR = path.resolve(__dirname, "../../dist-web/embed");

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

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

function sendStaticFile(res: http.ServerResponse, filePath: string): boolean {
  const root = path.resolve(EMBED_DIST_DIR);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return false;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
  const ext = path.extname(resolved).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

function handleEmbedStatic(url: URL, res: http.ServerResponse): boolean {
  if (url.pathname !== "/" && url.pathname !== "/embed" && !url.pathname.startsWith("/assets/")) {
    return false;
  }
  const relativePath =
    url.pathname === "/" || url.pathname === "/embed"
      ? "index.html"
      : url.pathname.slice(1);
  return sendStaticFile(res, path.join(EMBED_DIST_DIR, relativePath));
}

function isAuthorizedEmbedRequest(profileName: string, token: unknown): boolean {
  const access = getEmployeeWebAccess(profileName);
  return !!access?.enabled && !!access.token && typeof token === "string" && token === access.token;
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

  if (req.method === "POST" && url.pathname === "/api/chat/stream") {
    const body = await readJsonBody(req);
    const profileName = String(body.agent || body.profileName || "default").trim() || "default";
    if (!isAuthorizedEmbedRequest(profileName, body.token)) {
      sendJson(res, 401, { error: "Unauthorized", requestId: ctx.requestId });
      return;
    }
    const gatewayPort = Number(process.env.HERMES_API_PORT || getApiPortForProfile(profileName) || 0);
    if (!gatewayPort) {
      sendJson(res, 400, { error: "Agent gateway port is not configured", requestId: ctx.requestId });
      return;
    }
    writeSseHeaders(res);
    streamHermesGatewayChat(
      {
        profileName,
        message: String(body.message || ""),
        history: Array.isArray(body.history)
          ? body.history as Array<{ role: string; content: string }>
          : [],
        resumeSessionId: typeof body.resumeSessionId === "string" ? body.resumeSessionId : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
        host: process.env.HERMES_API_HOST || "127.0.0.1",
        port: gatewayPort,
      },
      (event) => {
        writeChatEvent(res, event);
        if (event.type === "done" || event.type === "error") res.end();
      },
    );
    return;
  }

  if (req.method === "GET" && handleEmbedStatic(url, res)) {
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
