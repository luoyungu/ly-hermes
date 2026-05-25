import type http from "http";
import {
  listSessions,
  deleteSessionRecord,
  deleteSessionMessageRecord,
  searchSessionsQuery,
  getUsageStatsData,
  getTokenStatsData,
  getCronJobsList,
  createCronJobRecord,
  pauseCronJobRecord,
  resumeCronJobRecord,
  triggerCronJobRecord,
  updateCronJobDeliverRecord,
  updateCronJobRecord,
  deleteCronJobRecord,
  getCronHistoryList,
  getSessionMessages,
  getEmployeeSessions,
} from "../../../main/services/session-api";
import { profileFromQuery, readJsonBody, requireRemoteAuth, sendJson } from "./shared";

export async function handleV1SessionRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/v1/sessions") {
    if (!requireRemoteAuth(req, res)) return true;
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);
    sendJson(res, 200, { sessions: listSessions(limit, offset) });
    return true;
  }

  const messagesMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/messages$/);
  if (req.method === "GET" && messagesMatch) {
    if (!requireRemoteAuth(req, res)) return true;
    const sessionId = decodeURIComponent(messagesMatch[1]);
    const profile = profileFromQuery(url);
    sendJson(res, 200, { messages: getSessionMessages(sessionId, profile) });
    return true;
  }

  const messageMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/messages\/([^/]+)$/);
  if (req.method === "DELETE" && messageMatch) {
    if (!requireRemoteAuth(req, res)) return true;
    const sessionId = decodeURIComponent(messageMatch[1]);
    const messageId = decodeURIComponent(messageMatch[2]);
    sendJson(res, 200, deleteSessionMessageRecord(sessionId, messageId, profileFromQuery(url)));
    return true;
  }

  const sessionMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (req.method === "DELETE" && sessionMatch) {
    if (!requireRemoteAuth(req, res)) return true;
    const sessionId = decodeURIComponent(sessionMatch[1]);
    sendJson(res, 200, deleteSessionRecord(sessionId, profileFromQuery(url)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/v1/sessions/search") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, {
      sessions: searchSessionsQuery(String(url.searchParams.get("q") || ""), profileFromQuery(url)),
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/v1/stats/usage") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, getUsageStatsData(Number(url.searchParams.get("days") || 30)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/v1/stats/tokens") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, getTokenStatsData(Number(url.searchParams.get("days") || 30)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/v1/cron/jobs") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, { jobs: getCronJobsList(profileFromQuery(url)) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/cron/jobs") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, createCronJobRecord(body));
    return true;
  }

  const cronJobMatch = url.pathname.match(/^\/api\/v1\/cron\/jobs\/([^/]+)(\/pause|\/resume|\/run)?$/);
  if (cronJobMatch) {
    if (!requireRemoteAuth(req, res)) return true;
    const jobId = decodeURIComponent(cronJobMatch[1]);
    const action = cronJobMatch[2];
    const profile = profileFromQuery(url);
    if (req.method === "POST" && action === "/pause") {
      sendJson(res, 200, pauseCronJobRecord(jobId, profile));
      return true;
    }
    if (req.method === "POST" && action === "/resume") {
      sendJson(res, 200, resumeCronJobRecord(jobId, profile));
      return true;
    }
    if (req.method === "POST" && action === "/run") {
      sendJson(res, 200, triggerCronJobRecord(jobId, profile));
      return true;
    }
    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      if (body.deliver !== undefined && Object.keys(body).length === 1) {
        sendJson(res, 200, updateCronJobDeliverRecord(jobId, String(body.deliver), profile));
      } else {
        sendJson(res, 200, updateCronJobRecord(jobId, body as Record<string, string>, profile));
      }
      return true;
    }
    if (req.method === "DELETE" && !action) {
      sendJson(res, 200, deleteCronJobRecord(jobId, profile));
      return true;
    }
  }

  if (req.method === "GET" && url.pathname === "/api/v1/cron/history") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, {
      history: getCronHistoryList(
        Number(url.searchParams.get("limit") || 50),
        Number(url.searchParams.get("offset") || 0),
      ),
    });
    return true;
  }

  const empSessionsMatch = url.pathname.match(/^\/api\/v1\/employees\/([^/]+)\/sessions$/);
  if (req.method === "GET" && empSessionsMatch) {
    if (!requireRemoteAuth(req, res)) return true;
    const name = decodeURIComponent(empSessionsMatch[1]);
    sendJson(res, 200, { sessions: getEmployeeSessions(name, 20) });
    return true;
  }

  return false;
}
