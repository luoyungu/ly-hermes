import crypto from "crypto";
import type http from "http";

export const SESSION_COOKIE = "hermes_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface WebSession {
  userId: string;
  username: string;
  displayName: string;
  expiresAt: number;
}

const sessions = new Map<string, WebSession>();

export function createWebSession(user: {
  id: string;
  username: string;
  displayName: string;
}): string {
  const id = crypto.randomBytes(32).toString("hex");
  sessions.set(id, {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return id;
}

export function getWebSession(req: http.IncomingMessage): WebSession | null {
  const cookie = req.headers.cookie || "";
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  if (!match) return null;
  const session = sessions.get(decodeURIComponent(match[1].trim()));
  if (!session || session.expiresAt < Date.now()) {
    if (match[1]) sessions.delete(decodeURIComponent(match[1].trim()));
    return null;
  }
  return session;
}

export function destroyWebSession(req: http.IncomingMessage): void {
  const cookie = req.headers.cookie || "";
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  if (!match) return;
  sessions.delete(decodeURIComponent(match[1].trim()));
}

export function setSessionCookie(res: http.ServerResponse, sessionId: string): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  );
}

export function clearSessionCookie(res: http.ServerResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export function hasValidWebSession(req: http.IncomingMessage): boolean {
  return getWebSession(req) !== null;
}
