import type http from "http";
import {
  deleteMcpServer,
  listMcpServers,
  saveMcpServer,
  testMcpServer,
} from "../../../main/services/tool-api";
import { parseMcpDescription } from "../../../main/config";
import { readJsonBody, requireRemoteAuth, sendJson } from "./shared";

export async function handleV1ToolRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/v1/tools/mcp") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, listMcpServers());
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/v1/tools/mcp") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, saveMcpServer(body as never));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/tools/mcp/parse") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, await parseMcpDescription({ description: String(body.description || "") }));
    return true;
  }

  const match = url.pathname.match(/^\/api\/v1\/tools\/mcp\/([^/]+)(\/test)?$/);
  if (!match) return false;

  if (!requireRemoteAuth(req, res)) return true;
  const name = decodeURIComponent(match[1]);
  const action = match[2];

  if (req.method === "POST" && action === "/test") {
    sendJson(res, 200, testMcpServer(name));
    return true;
  }

  if (req.method === "DELETE" && !action) {
    sendJson(res, 200, deleteMcpServer(name));
    return true;
  }

  return false;
}
