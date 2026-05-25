import type http from "http";
import type { BrowserWindow } from "electron";
import {
  listEmployees,
  getEmployeeStatus,
  wakeUpEmployee,
  putEmployeeToSleep,
  resetEmployeeWebAccessToken,
  restartAllEngines,
  type EmployeeInfo,
} from "../../../main/employees";
import {
  createEmployeeProfile,
  updateEmployeeProfile,
  deleteEmployeeProfile,
  getEmployeeSoulContent,
  setEmployeeSoulContent,
  resetEmployeeSoulContent,
  getEmployeeConfigYaml,
  setEmployeeConfigYaml,
  getEmployeeEnvMasked,
  setEmployeeEnvVars,
  getEmployeeToolsList,
  setEmployeeToolsList,
  toggleEmployeeTool,
  getEmployeeMemoryData,
  addEmployeeMemoryEntry,
  deleteEmployeeMemoryEntry,
  getEmployeeSkillsDirList,
  removeEmployeeSkillDir,
  renameEmployeeProfile,
  exportEmployeeProfile,
} from "../../../main/services/employee-api";
import { generateEmployeeSoulDraft } from "../../../main/config";
import { readJsonBody, requireRemoteAuth, sendJson } from "./shared";

export async function handleV1EmployeeRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  getMainWindow: () => BrowserWindow | null,
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/v1/employees") {
    if (!requireRemoteAuth(req, res)) return true;
    const employees = listEmployees();
    const result: Array<EmployeeInfo & { status: string }> = [];
    for (const emp of employees) {
      const status = await getEmployeeStatus(emp.name);
      result.push({ ...emp, status });
    }
    sendJson(res, 200, { employees: result });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/employees") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, await createEmployeeProfile(body, getMainWindow));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/employees/restart-all") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, await restartAllEngines(getMainWindow));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/employees/soul-draft") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, await generateEmployeeSoulDraft(body));
    return true;
  }

  const empMatch = url.pathname.match(/^\/api\/v1\/employees\/([^/]+)(\/.*)?$/);
  if (!empMatch) return false;
  const profileName = decodeURIComponent(empMatch[1]);
  const subPath = empMatch[2] || "";

  if (req.method === "GET" && !subPath) {
    if (!requireRemoteAuth(req, res)) return true;
    const employees = listEmployees();
    const emp = employees.find((e) => e.name === profileName);
    if (!emp) {
      sendJson(res, 404, { error: "员工不存在" });
      return true;
    }
    const status = await getEmployeeStatus(profileName);
    sendJson(res, 200, { employee: { ...emp, status } });
    return true;
  }

  if (req.method === "PATCH" && !subPath) {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, updateEmployeeProfile(profileName, body, getMainWindow));
    return true;
  }

  if (req.method === "DELETE" && !subPath) {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, await deleteEmployeeProfile(profileName, getMainWindow));
    return true;
  }

  if (subPath === "/wake-up" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, await wakeUpEmployee(profileName, getMainWindow()));
    return true;
  }

  if (subPath === "/sleep" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, await putEmployeeToSleep(profileName, getMainWindow()));
    return true;
  }

  if (subPath === "/restart" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    await putEmployeeToSleep(profileName, getMainWindow());
    await new Promise((r) => setTimeout(r, 2000));
    sendJson(res, 200, await wakeUpEmployee(profileName, getMainWindow()));
    return true;
  }

  if (subPath === "/status" && req.method === "GET") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, { profileName, status: await getEmployeeStatus(profileName) });
    return true;
  }

  if (subPath === "/web-access/rotate-token" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, resetEmployeeWebAccessToken(profileName));
    return true;
  }

  if (subPath === "/rename" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, renameEmployeeProfile(profileName, String(body.newName || ""), getMainWindow));
    return true;
  }

  if (subPath === "/export" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, exportEmployeeProfile(profileName));
    return true;
  }

  if (subPath === "/soul" && req.method === "GET") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, { content: getEmployeeSoulContent(profileName) });
    return true;
  }

  if (subPath === "/soul" && req.method === "PUT") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, setEmployeeSoulContent(profileName, String(body.content || "")));
    return true;
  }

  if (subPath === "/soul/reset" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, resetEmployeeSoulContent(profileName));
    return true;
  }

  if (subPath === "/config" && req.method === "GET") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, { config: getEmployeeConfigYaml(profileName) });
    return true;
  }

  if (subPath === "/config" && req.method === "PUT") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, setEmployeeConfigYaml(profileName, body));
    return true;
  }

  if (subPath === "/env" && req.method === "GET") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, { env: getEmployeeEnvMasked(profileName) });
    return true;
  }

  if (subPath === "/env" && req.method === "PUT") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, setEmployeeEnvVars(profileName, body as Record<string, string>));
    return true;
  }

  if (subPath === "/tools" && req.method === "GET") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, { tools: getEmployeeToolsList(profileName) });
    return true;
  }

  if (subPath === "/tools" && req.method === "PUT") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, setEmployeeToolsList(profileName, (body.tools as string[]) || []));
    return true;
  }

  const toolMatch = subPath.match(/^\/tools\/([^/]+)$/);
  if (toolMatch && req.method === "PATCH") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      toggleEmployeeTool(profileName, decodeURIComponent(toolMatch[1]), body.enabled === true),
    );
    return true;
  }

  if (subPath === "/memory" && req.method === "GET") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, getEmployeeMemoryData(profileName));
    return true;
  }

  if (subPath === "/memory" && req.method === "POST") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(res, 200, addEmployeeMemoryEntry(profileName, String(body.content || "")));
    return true;
  }

  const memoryMatch = subPath.match(/^\/memory\/(\d+)$/);
  if (memoryMatch && req.method === "DELETE") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, deleteEmployeeMemoryEntry(profileName, Number(memoryMatch[1])));
    return true;
  }

  if (subPath === "/skills/dir" && req.method === "GET") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, { skills: getEmployeeSkillsDirList(profileName) });
    return true;
  }

  const skillMatch = subPath.match(/^\/skills\/([^/]+)$/);
  if (skillMatch && req.method === "DELETE") {
    if (!requireRemoteAuth(req, res)) return true;
    sendJson(res, 200, removeEmployeeSkillDir(profileName, decodeURIComponent(skillMatch[1])));
    return true;
  }

  return false;
}
