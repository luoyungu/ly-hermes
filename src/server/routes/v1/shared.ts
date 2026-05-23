import type http from "http";
import { isRemoteApiEnabled } from "../../../main/deployment";
import {
  isAuthorizedApiRequest,
  isAuthorizedRemoteRequest,
  remoteApiDisabledBody,
  unauthorizedBody,
} from "../../middleware/auth";

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > 10 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export function requireRemoteAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  if (isAuthorizedApiRequest(req)) return true;
  if (!isRemoteApiEnabled()) {
    sendJson(res, 403, remoteApiDisabledBody());
    return false;
  }
  if (!isAuthorizedRemoteRequest(req)) {
    sendJson(res, 401, unauthorizedBody());
    return false;
  }
  return true;
}

export function profileFromQuery(url: URL): string {
  return String(url.searchParams.get("profile") || "default").trim() || "default";
}
