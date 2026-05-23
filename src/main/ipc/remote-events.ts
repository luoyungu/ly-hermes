import http from "http";
import type { BrowserWindow } from "electron";
import {
  getRemoteConnection,
  isClientOnlyMode,
  saveRemoteConnection,
  type RemoteConnection,
} from "../deployment";

let activeReq: http.ClientRequest | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let monitorGetMainWindow: (() => BrowserWindow | null) | null = null;

export interface RemoteConnectionStatusSnapshot {
  connected: boolean;
  error?: string;
  last_seen_at?: string;
}

let cachedStatus: RemoteConnectionStatusSnapshot | null = null;

const FORWARD_EVENTS = new Set([
  "employee-status-changed",
  "employee-list-changed",
  "employee-idle-timeout",
  "cron-session-created",
  "session-updated",
]);

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

function scheduleReconnect(getMainWindow: () => BrowserWindow | null): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (isClientOnlyMode()) startRemoteEventBridge(getMainWindow);
  }, 5000);
}

function broadcastConnectionStatus(getMainWindow: () => BrowserWindow | null): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed() || !cachedStatus) return;
  const connection = getRemoteConnection();
  win.webContents.send("remote-connection-status-changed", {
    ...cachedStatus,
    connection,
  });
}

async function runConnectionPoll(getMainWindow: () => BrowserWindow | null): Promise<void> {
  if (!isClientOnlyMode()) {
    stopRemoteConnectionMonitor();
    return;
  }

  const conn = getRemoteConnection();
  if (!conn.host || !conn.port) {
    const next = { connected: false, error: "未配置远程连接" };
    const changed =
      !cachedStatus ||
      cachedStatus.connected !== next.connected ||
      cachedStatus.error !== next.error;
    cachedStatus = next;
    if (changed) broadcastConnectionStatus(getMainWindow);
    return;
  }

  const { testRemoteConnection } = await import("../../core/remote/remote-client");
  const result = await testRemoteConnection(conn);
  let lastSeen = conn.last_seen_at;
  if (result.success) {
    lastSeen = new Date().toISOString();
    saveRemoteConnection({ ...conn, last_seen_at: lastSeen });
  }

  const next: RemoteConnectionStatusSnapshot = {
    connected: result.success,
    error: result.success ? undefined : result.error || "连接失败",
    last_seen_at: result.success ? lastSeen : conn.last_seen_at,
  };

  const changed =
    !cachedStatus ||
    cachedStatus.connected !== next.connected ||
    cachedStatus.error !== next.error ||
    cachedStatus.last_seen_at !== next.last_seen_at;

  cachedStatus = next;
  if (changed) broadcastConnectionStatus(getMainWindow);
}

export function getRemoteConnectionStatusSnapshot(): RemoteConnectionStatusSnapshot | null {
  return cachedStatus;
}

export function refreshRemoteConnectionStatus(
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  return runConnectionPoll(getMainWindow);
}

export function stopRemoteEventBridge(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeReq) {
    activeReq.destroy();
    activeReq = null;
  }
}

export function stopRemoteConnectionMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  monitorGetMainWindow = null;
  cachedStatus = null;
}

export function startRemoteConnectionMonitor(
  getMainWindow: () => BrowserWindow | null,
): void {
  stopRemoteConnectionMonitor();
  if (!isClientOnlyMode()) return;

  monitorGetMainWindow = getMainWindow;
  void runConnectionPoll(getMainWindow);
  monitorInterval = setInterval(() => {
    if (monitorGetMainWindow) void runConnectionPoll(monitorGetMainWindow);
  }, 30000);
}

export function startRemoteEventBridge(
  getMainWindow: () => BrowserWindow | null,
): void {
  stopRemoteEventBridge();
  if (!isClientOnlyMode()) return;

  const conn = getRemoteConnection();
  if (!conn.host || !conn.port || !conn.api_token) return;

  activeReq = http.request(
    {
      hostname: conn.host,
      port: conn.port,
      path: `/api/v1/events?token=${encodeURIComponent(conn.api_token)}`,
      method: "GET",
      headers: { Authorization: `Bearer ${conn.api_token}` },
      timeout: 0,
    },
    (res) => {
      if ((res.statusCode || 0) >= 400) {
        scheduleReconnect(getMainWindow);
        return;
      }

      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const parsed = parseSseBlock(block.trim());
          if (!parsed || parsed.event === "ping" || parsed.event === "connected") continue;
          if (!FORWARD_EVENTS.has(parsed.event)) continue;
          try {
            const data = JSON.parse(parsed.data) as Record<string, unknown>;
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send(parsed.event, data);
            }
          } catch {
            /* ignore malformed payload */
          }
        }
      });

      res.on("end", () => scheduleReconnect(getMainWindow));
      res.on("error", () => scheduleReconnect(getMainWindow));
    },
  );

  activeReq.on("error", () => scheduleReconnect(getMainWindow));
  activeReq.end();
}

export function notifyRemoteConnectionChanged(
  getMainWindow: () => BrowserWindow | null,
  connection?: RemoteConnection,
): void {
  if (connection) {
    saveRemoteConnection(connection);
  }
  void runConnectionPoll(getMainWindow);
}
