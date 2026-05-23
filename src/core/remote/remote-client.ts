import http from "http";
import type { ChatEvent, ChatEventSink } from "../chat/events";

export interface RemoteConnectionLike {
  host: string;
  port: number;
  api_token: string;
}

function authHeaders(conn: RemoteConnectionLike): Record<string, string> {
  return {
    Authorization: `Bearer ${conn.api_token}`,
    "Content-Type": "application/json",
  };
}

export function remoteJsonRequest<T>(
  conn: RemoteConnectionLike,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null; error?: string }> {
  return new Promise((resolve) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request(
      {
        hostname: conn.host,
        port: conn.port,
        path,
        method,
        headers: {
          ...authHeaders(conn),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 30000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          try {
            const data = raw ? (JSON.parse(raw) as T) : null;
            resolve({ status: res.statusCode || 0, data });
          } catch {
            resolve({
              status: res.statusCode || 0,
              data: null,
              error: raw.slice(0, 300) || "Invalid JSON response",
            });
          }
        });
      },
    );
    req.on("error", (error: Error) => {
      resolve({ status: 0, data: null, error: error.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, data: null, error: "请求超时" });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

export async function testRemoteConnection(
  conn: RemoteConnectionLike,
): Promise<{ success: boolean; error?: string; remote_enabled?: boolean }> {
  const health = await remoteJsonRequest<{
    ok?: boolean;
    remote_enabled?: boolean;
    error?: string;
  }>(conn, "GET", "/api/v1/health");
  if (health.status === 200 && health.data?.ok) {
    return { success: true, remote_enabled: health.data.remote_enabled };
  }
  if (health.status === 401 || health.status === 403) {
    return { success: false, error: "Token 无效或远程访问未开启" };
  }
  return { success: false, error: health.error || health.data?.error || "无法连接远程服务器" };
}

function processRemoteSsePart(
  block: string,
  profileName: string,
  emit: ChatEventSink,
): boolean {
  let eventType = "";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) eventType = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  if (!dataLine) return false;
  try {
    const parsed = JSON.parse(dataLine) as ChatEvent;
    if (!parsed.type) return false;
    emit({
      type: parsed.type,
      data: { ...(parsed.data || {}), profileName },
    } as ChatEvent);
    return parsed.type === "done" || parsed.type === "error";
  } catch {
    if (eventType && dataLine) {
      try {
        const payload = JSON.parse(dataLine) as Record<string, unknown>;
        emit({
          type: eventType as ChatEvent["type"],
          data: { ...payload, profileName },
        } as ChatEvent);
        return eventType === "done" || eventType === "error";
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function remoteStreamChat(
  conn: RemoteConnectionLike,
  body: Record<string, unknown>,
  emit: ChatEventSink,
): void {
  const profileName = String(body.profileName || "default");
  const payload = JSON.stringify(body);
  const req = http.request(
    {
      hostname: conn.host,
      port: conn.port,
      path: "/api/v1/chat/stream",
      method: "POST",
      headers: {
        ...authHeaders(conn),
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 120000,
    },
    (res) => {
      if (res.statusCode !== 200) {
        let raw = "";
        res.on("data", (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          emit({
            type: "error",
            data: {
              profileName,
              error: `远程聊天失败 (${res.statusCode}): ${raw.slice(0, 200)}`,
            },
          });
        });
        return;
      }

      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (processRemoteSsePart(part, profileName, emit)) return;
        }
      });
      res.on("end", () => {
        if (buffer.trim()) {
          for (const part of buffer.split("\n\n")) {
            if (processRemoteSsePart(part, profileName, emit)) return;
          }
        }
      });
      res.on("error", (error: Error) => {
        emit({
          type: "error",
          data: { profileName, error: error.message },
        });
      });
    },
  );
  req.on("error", (error: Error) => {
    emit({
      type: "error",
      data: { profileName, error: error.message },
    });
  });
  req.on("timeout", () => {
    req.destroy();
    emit({
      type: "error",
      data: { profileName, error: "远程聊天超时" },
    });
  });
  req.write(payload);
  req.end();
}
