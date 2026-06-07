import http from "http";
import fs from "fs";
import path from "path";
import { app } from "electron";
import { desktopAuthService } from "../main/core/auth-store";
import { streamHermesGatewayChat } from "../core/chat";
import { createRequestContext } from "../core/context/request-context";
import {
  ensureEmployeeGatewayOnline,
  getApiPortForProfile,
  getEmployeeWebAccess,
  listEmployees,
} from "../main/employees";
import { getApiServerKeyForProfile } from "../main/config";
import { createLyHermesSessionId, isLyHermesSessionForProfile } from "../shared/session-id";
import { validateSessionId } from "../main/sessions";
import { getDeploymentMode } from "../main/deployment";
import { handleV1Request } from "./routes/v1/index";
import { writeChatEvent, writeSseHeaders } from "./sse";
import { stageAttachment } from "../main/attachment-staging";
import type { Attachment } from "../shared/attachments";
import {
  clearSessionCookie,
  createWebSession,
  destroyWebSession,
  getWebSession,
  setSessionCookie,
} from "./web-session";
import { invokeWebApiChannel, hasWebApiChannel } from "./web-api-registry";
const EMBED_DIST_DIR = path.resolve(__dirname, "../../dist-web/embed");
const APP_DIST_DIR = path.resolve(__dirname, "../../dist-web/app");
const embedChatControllers: Record<string, AbortController> = {};
const embedStagedAttachmentPaths: Record<string, Set<string>> = {};
const EMBED_ALLOWED_ATTACHMENT_EXTENSIONS = new Set(["txt", "doc", "docx", "xls", "xlsx"]);
const EMBED_MAX_TEXT_ATTACHMENT_BYTES = 256 * 1024;
const EMBED_MAX_PATH_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const WEB_LOCAL_INVOKE_DENYLIST = new Set([
  "check-install",
  "verify-install",
  "start-install",
  "get-hermes-version",
  "refresh-hermes-version",
  "run-hermes-doctor",
  "run-hermes-update",
  "run-hermes-backup",
  "run-hermes-import",
  "get-app-logs",
  "clear-app-logs",
  "get-log-file-path",
  "read-logs",
  "clear-logs",
]);

function isWebLocalInvokeAllowed(channel: string): boolean {
  return !WEB_LOCAL_INVOKE_DENYLIST.has(channel);
}

function embedAttachmentKey(profileName: string, sessionId: string): string {
  return `${profileName}:${sessionId}`;
}

function getAttachmentExtension(filename: string): string {
  return path.extname(filename || "").replace(/^\./, "").toLowerCase();
}

function estimateBase64Bytes(base64: string): number {
  const clean = base64.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function sanitizeEmbedAttachments(
  profileName: string,
  sessionId: string,
  raw: unknown,
): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const staged = embedStagedAttachmentPaths[embedAttachmentKey(profileName, sessionId)];
  const attachments: Attachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || attachments.length >= 10) continue;
    const entry = item as Record<string, unknown>;
    const name = String(entry.name || "file");
    const ext = getAttachmentExtension(name);
    if (!EMBED_ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) continue;
    const size = Number(entry.size || 0);
    if (entry.kind === "text-file" && ext === "txt" && typeof entry.text === "string") {
      if (size > EMBED_MAX_TEXT_ATTACHMENT_BYTES || Buffer.byteLength(entry.text, "utf-8") > EMBED_MAX_TEXT_ATTACHMENT_BYTES) {
        continue;
      }
      attachments.push({
        id: String(entry.id || `embed-text-${attachments.length}`),
        kind: "text-file",
        name,
        mime: String(entry.mime || "text/plain"),
        size,
        text: entry.text,
      });
    } else if (entry.kind === "path-ref" && typeof entry.path === "string" && staged?.has(entry.path)) {
      if (size > EMBED_MAX_PATH_ATTACHMENT_BYTES) continue;
      attachments.push({
        id: String(entry.id || `embed-file-${attachments.length}`),
        kind: "path-ref",
        name,
        mime: String(entry.mime || "application/octet-stream"),
        size,
        path: entry.path,
      });
    }
  }
  return attachments;
}

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

function handleAppStatic(url: URL, res: http.ServerResponse): boolean {
  if (!url.pathname.startsWith("/app")) return false;
  const relativePath =
    url.pathname === "/app" || url.pathname === "/app/"
      ? "index.html"
      : url.pathname.replace(/^\/app\/?/, "");
  return sendStaticFile(res, path.join(APP_DIST_DIR, relativePath), APP_DIST_DIR);
}

function sendStaticFile(
  res: http.ServerResponse,
  filePath: string,
  rootDir: string = EMBED_DIST_DIR,
): boolean {
  const root = path.resolve(rootDir);
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
  return sendStaticFile(res, path.join(EMBED_DIST_DIR, relativePath), EMBED_DIST_DIR);
}

function isAuthorizedEmbedRequest(profileName: string, token: unknown): boolean {
  const access = getEmployeeWebAccess(profileName);
  return !!access?.enabled && !!access.token && typeof token === "string" && token === access.token;
}

type MainWindowGetter = () => import("electron").BrowserWindow | null;

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  getMainWindow: MainWindowGetter,
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const ctx = createRequestContext("server", { source: "http" });

  if (await handleV1Request(req, res, url, getMainWindow)) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, requestId: ctx.requestId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/check-initialized") {
    sendJson(res, 200, { initialized: desktopAuthService.checkInitialized(), requestId: ctx.requestId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const session = getWebSession(req);
    if (!session) {
      sendJson(res, 401, { error: "未登录", requestId: ctx.requestId });
      return;
    }
    sendJson(res, 200, {
      user: {
        id: session.userId,
        username: session.username,
        displayName: session.displayName,
      },
      requestId: ctx.requestId,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/mode") {
    sendJson(res, 200, {
      mode: getDeploymentMode(),
      initialized: desktopAuthService.checkInitialized(),
      requestId: ctx.requestId,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/setup-password") {
    if (desktopAuthService.checkInitialized()) {
      sendJson(res, 409, { error: "已初始化，请使用修改密码功能", requestId: ctx.requestId });
      return;
    }
    const body = await readJsonBody(req);
    const result = desktopAuthService.setupPassword(String(body.password || ""));
    if (result.success && result.user) {
      setSessionCookie(res, createWebSession(result.user));
    }
    sendJson(res, 200, { ...result, requestId: ctx.requestId });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    const result = desktopAuthService.login(String(body.password || ""));
    if (result.success && result.user) {
      setSessionCookie(res, createWebSession(result.user));
    }
    sendJson(res, 200, { ...result, requestId: ctx.requestId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/app-version") {
    sendJson(res, 200, { version: app.getVersion(), requestId: ctx.requestId });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    const session = getWebSession(req);
    if (!session) {
      sendJson(res, 401, { error: "未登录", requestId: ctx.requestId });
      return;
    }
    const body = await readJsonBody(req);
    sendJson(res, 200, {
      ...desktopAuthService.changePassword(
        String(body.oldPassword || ""),
        String(body.newPassword || ""),
      ),
      requestId: ctx.requestId,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    destroyWebSession(req);
    desktopAuthService.logout();
    clearSessionCookie(res);
    sendJson(res, 200, { success: true, requestId: ctx.requestId });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/local/invoke") {
    const session = getWebSession(req);
    if (!session) {
      sendJson(res, 401, { error: "未登录", requestId: ctx.requestId });
      return;
    }
    const body = await readJsonBody(req);
    const channel = String(body.channel || "").trim();
    const args = Array.isArray(body.args) ? body.args : [];
    if (!channel || !hasWebApiChannel(channel)) {
      sendJson(res, 404, { error: `未支持的接口: ${channel}`, requestId: ctx.requestId });
      return;
    }
    if (!isWebLocalInvokeAllowed(channel)) {
      sendJson(res, 403, { error: `Web 端不允许调用: ${channel}`, requestId: ctx.requestId });
      return;
    }
    try {
      const result = await invokeWebApiChannel(channel, args);
      sendJson(res, 200, { result, requestId: ctx.requestId });
    } catch (error: unknown) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "调用失败",
        requestId: ctx.requestId,
      });
    }
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

  if (req.method === "GET" && url.pathname === "/api/embed/info") {
    const agent = String(url.searchParams.get("agent") || "default").trim() || "default";
    const token = String(url.searchParams.get("token") || "");
    if (!isAuthorizedEmbedRequest(agent, token)) {
      sendJson(res, 401, { error: "Unauthorized", requestId: ctx.requestId });
      return;
    }
    const employee = listEmployees().find((item) => item.name === agent);
    sendJson(res, 200, {
      name: agent,
      displayName: employee?.displayName || agent,
      role: employee?.role || "",
      avatar: employee?.avatar || "🧑‍💼",
      color: employee?.color || "#7c6aef",
      requestId: ctx.requestId,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/embed/messages") {
    const agent = String(url.searchParams.get("agent") || "default").trim() || "default";
    const token = String(url.searchParams.get("token") || "");
    const sessionId = String(url.searchParams.get("sessionId") || "").trim();
    if (!isAuthorizedEmbedRequest(agent, token)) {
      sendJson(res, 401, { error: "Unauthorized", requestId: ctx.requestId });
      return;
    }
    if (!sessionId || !validateSessionId(sessionId) || !isLyHermesSessionForProfile(sessionId, agent)) {
      sendJson(res, 400, { error: "Invalid session", requestId: ctx.requestId });
      return;
    }
    const { getSessionMessages } = await import("../main/sessions");
    sendJson(res, 200, {
      messages: getSessionMessages(sessionId, agent),
      requestId: ctx.requestId,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat/stream") {
    const body = await readJsonBody(req);
    const profileName = String(body.agent || body.profileName || "default").trim() || "default";
    if (!isAuthorizedEmbedRequest(profileName, body.token)) {
      sendJson(res, 401, { error: "Unauthorized", requestId: ctx.requestId });
      return;
    }
    const ready = await ensureEmployeeGatewayOnline(profileName, getMainWindow());
    if (!ready.success) {
      writeSseHeaders(res);
      writeChatEvent(res, {
        type: "error",
        data: { profileName, error: ready.error || "员工 Gateway 未就绪" },
      });
      res.end();
      return;
    }
    const gatewayPort = Number(process.env.HERMES_API_PORT || getApiPortForProfile(profileName) || 0);
    if (!gatewayPort) {
      sendJson(res, 400, { error: "Agent gateway port is not configured", requestId: ctx.requestId });
      return;
    }
    writeSseHeaders(res);
    const resumeSessionId =
      typeof body.resumeSessionId === "string" && body.resumeSessionId.trim()
        ? body.resumeSessionId.trim()
        : createLyHermesSessionId(profileName);
    const controller = new AbortController();
    embedChatControllers[profileName] = controller;
    res.on("close", () => {
      if (!res.writableEnded && embedChatControllers[profileName] === controller) {
        controller.abort();
        delete embedChatControllers[profileName];
      }
    });
    streamHermesGatewayChat(
      {
        profileName,
        message: String(body.message || ""),
        history: Array.isArray(body.history)
          ? body.history as Array<{ role: string; content: string }>
          : [],
        resumeSessionId,
        attachments: sanitizeEmbedAttachments(profileName, resumeSessionId, body.attachments),
        model: typeof body.model === "string" ? body.model : undefined,
        host: process.env.HERMES_API_HOST || "127.0.0.1",
        port: gatewayPort,
        apiServerKey: getApiServerKeyForProfile(profileName),
        signal: controller.signal,
      },
      (event) => {
        if (
          (event.type === "done" || event.type === "error") &&
          embedChatControllers[profileName] === controller
        ) {
          delete embedChatControllers[profileName];
        }
        writeChatEvent(res, event);
        if (event.type === "done" || event.type === "error") res.end();
      },
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/embed/attachments") {
    const body = await readJsonBody(req);
    const profileName = String(body.agent || body.profileName || "default").trim() || "default";
    const sessionId = String(body.sessionId || "").trim();
    if (!isAuthorizedEmbedRequest(profileName, body.token)) {
      sendJson(res, 401, { error: "Unauthorized", requestId: ctx.requestId });
      return;
    }
    if (!sessionId || !validateSessionId(sessionId) || !isLyHermesSessionForProfile(sessionId, profileName)) {
      sendJson(res, 400, { error: "Invalid session", requestId: ctx.requestId });
      return;
    }
    const filename = String(body.filename || "file");
    const ext = getAttachmentExtension(filename);
    const base64 = String(body.base64 || body.base64Bytes || "");
    if (!EMBED_ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
      sendJson(res, 400, { error: "Unsupported attachment type", requestId: ctx.requestId });
      return;
    }
    if (estimateBase64Bytes(base64) > EMBED_MAX_PATH_ATTACHMENT_BYTES) {
      sendJson(res, 413, { error: "Attachment too large", requestId: ctx.requestId });
      return;
    }
    const staged = stageAttachment(
      sessionId,
      filename,
      base64,
    );
    const key = embedAttachmentKey(profileName, sessionId);
    if (!embedStagedAttachmentPaths[key]) embedStagedAttachmentPaths[key] = new Set<string>();
    embedStagedAttachmentPaths[key].add(staged);
    sendJson(res, 200, { path: staged, requestId: ctx.requestId });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat/abort") {
    const body = await readJsonBody(req);
    const profileName = String(body.agent || body.profileName || "default").trim() || "default";
    if (!isAuthorizedEmbedRequest(profileName, body.token)) {
      sendJson(res, 401, { error: "Unauthorized", requestId: ctx.requestId });
      return;
    }
    if (embedChatControllers[profileName]) {
      embedChatControllers[profileName].abort();
      delete embedChatControllers[profileName];
    }
    sendJson(res, 200, { success: true, requestId: ctx.requestId });
    return;
  }

  if (req.method === "GET" && handleEmbedStatic(url, res)) {
    return;
  }

  if (req.method === "GET" && handleAppStatic(url, res)) {
    return;
  }

  sendJson(res, 404, { error: "Not found", requestId: ctx.requestId });
}

export function createHermesServer(options?: {
  getMainWindow?: MainWindowGetter;
}): http.Server {
  const getMainWindow = options?.getMainWindow || (() => null);
  return http.createServer((req, res) => {
    handleRequest(req, res, getMainWindow).catch((error: unknown) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal server error" });
    });
  });
}

if (process.env.HERMES_SERVER_STANDALONE === "1" && require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createHermesServer().listen(port, () => {
    console.log(`Hermes server listening on http://127.0.0.1:${port}`);
  });
}
