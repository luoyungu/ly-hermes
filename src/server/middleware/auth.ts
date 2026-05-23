import type http from "http";
import { getRemoteServerConfig, isRemoteApiEnabled } from "../../main/deployment";
import { hasValidWebSession } from "../web-session";

export function getBearerToken(req: http.IncomingMessage): string | null {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) return match[1].trim();
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const queryToken = url.searchParams.get("token");
    if (queryToken) return queryToken.trim();
  } catch {
    /* ignore */
  }
  return null;
}

export function isAuthorizedRemoteRequest(req: http.IncomingMessage): boolean {
  if (!isRemoteApiEnabled()) return false;
  const token = getBearerToken(req);
  const expected = getRemoteServerConfig().api_token;
  return !!token && !!expected && token === expected;
}

export function isAuthorizedApiRequest(req: http.IncomingMessage): boolean {
  if (hasValidWebSession(req)) return true;
  return isAuthorizedRemoteRequest(req);
}

export function remoteApiDisabledBody(): Record<string, unknown> {
  return { error: "远程访问未开启", code: "REMOTE_DISABLED" };
}

export function unauthorizedBody(): Record<string, unknown> {
  return { error: "Unauthorized", code: "UNAUTHORIZED" };
}
