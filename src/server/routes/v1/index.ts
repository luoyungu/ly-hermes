import type http from "http";
import { app } from "electron";
import { isRemoteApiEnabled } from "../../../main/deployment";
import { sendJson, requireRemoteAuth } from "./shared";
import { handleV1EmployeeRoutes } from "./employees";
import { handleV1SessionRoutes } from "./sessions";
import { handleV1SkillRoutes } from "./skills";
import { handleV1ChatRoutes } from "./chat";
import { handleV1EventRoutes } from "./events";

export async function handleV1Request(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  getMainWindow: () => import("electron").BrowserWindow | null = () => null,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/v1")) return false;

  if (req.method === "GET" && url.pathname === "/api/v1/health") {
    sendJson(res, 200, { ok: true, remote_enabled: isRemoteApiEnabled() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/v1/node/info") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, {
      name: "Hermes Desktop Node",
      version: app.getVersion(),
      platform: process.platform,
      remote_enabled: isRemoteApiEnabled(),
    });
    return true;
  }

  if (await handleV1ChatRoutes(req, res, url, getMainWindow)) return true;
  if (await handleV1EmployeeRoutes(req, res, url, getMainWindow)) return true;
  if (await handleV1SessionRoutes(req, res, url)) return true;
  if (await handleV1SkillRoutes(req, res, url)) return true;
  if (await handleV1EventRoutes(req, res, url)) return true;

  sendJson(res, 404, { error: "Not found" });
  return true;
}
