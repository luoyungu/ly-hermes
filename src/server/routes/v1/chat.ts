import type http from "http";
import { getApiPortForProfile } from "../../../main/employees";
import { sendMessageViaApi, _currentChatReqs } from "../../../main/chat";
import { stageAttachment } from "../../../main/attachment-staging";
import { getApiServerKeyForProfile } from "../../../main/config";
import { createLyHermesSessionId } from "../../../shared/session-id";
import { readJsonBody, requireRemoteAuth, sendJson } from "./shared";
import { writeChatEvent, writeSseHeaders } from "../../sse";
import type { Attachment } from "../../../shared/attachments";

export async function handleV1ChatRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  getMainWindow: () => import("electron").BrowserWindow | null,
): Promise<boolean> {
  if (req.method === "POST" && url.pathname === "/api/v1/chat/stream") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    const profileName = String(body.profileName || body.agent || "default").trim() || "default";
    const { ensureEmployeeGatewayOnline } = await import("../../../main/employees");
    const ready = await ensureEmployeeGatewayOnline(profileName, getMainWindow());
    if (!ready.success) {
      sendJson(res, 503, { error: ready.error || "员工 Gateway 未就绪" });
      return true;
    }
    writeSseHeaders(res);
    const resumeSessionId =
      typeof body.resumeSessionId === "string" && body.resumeSessionId.trim()
        ? body.resumeSessionId.trim()
        : createLyHermesSessionId(profileName);
    sendMessageViaApi(
      profileName,
      String(body.message || ""),
      (event) => {
        writeChatEvent(res, event);
        if (event.type === "done" || event.type === "error") res.end();
      },
      Array.isArray(body.history)
        ? (body.history as Array<{ role: string; content: string }>)
        : undefined,
      getMainWindow(),
      resumeSessionId,
      Array.isArray(body.attachments) ? (body.attachments as Attachment[]) : undefined,
    );
    return true;
  }

  const approvalMatch = url.pathname.match(/^\/api\/v1\/chat\/approval\/([^/]+)$/);
  if (req.method === "POST" && approvalMatch) {
    if (!requireRemoteAuth(req, res)) return true;
    const approvalId = decodeURIComponent(approvalMatch[1]);
    const body = await readJsonBody(req);
    const profileName = String(body.profileName || "default");
    const port = getApiPortForProfile(profileName);
    if (!port) {
      sendJson(res, 400, { error: "员工未配置端口" });
      return true;
    }
    const nodeHttp = await import("http");
    const payload = JSON.stringify({ approved: body.approved === true, approval_id: approvalId });
    await new Promise<void>((resolve) => {
      const reqApproval = nodeHttp.request(
        {
          hostname: "127.0.0.1",
          port,
          path: `/v1/approval/${approvalId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getApiServerKeyForProfile(profileName)}`,
          },
          timeout: 10000,
        },
        (gatewayRes) => {
          gatewayRes.resume();
          gatewayRes.on("end", () => {
            sendJson(res, 200, { success: true, statusCode: gatewayRes.statusCode });
            resolve();
          });
        },
      );
      reqApproval.on("error", (error: Error) => {
        sendJson(res, 500, { error: error.message });
        resolve();
      });
      reqApproval.write(payload);
      reqApproval.end();
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/chat/abort") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    const profileName = String(body.profileName || "");
    if (profileName && _currentChatReqs[profileName]) {
      _currentChatReqs[profileName].abort();
      delete _currentChatReqs[profileName];
    }
    sendJson(res, 200, { success: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/attachments") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    const staged = stageAttachment(
      String(body.sessionId || "default"),
      String(body.filename || "file"),
      String(body.base64 || body.base64Bytes || ""),
    );
    sendJson(res, 200, { path: staged });
    return true;
  }

  return false;
}
