import type http from "http";
import {
  listInstalledSkills,
  listBundledSkills,
  getSkillContent,
  installSkill,
  uninstallSkill,
  getSkillConfig,
  setSkillEnabled,
  recordSkillUsage,
} from "../../../main/skills";
import { profileFromQuery, readJsonBody, requireRemoteAuth, sendJson } from "./shared";

export async function handleV1SkillRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/v1/skills/installed") {
    if (!requireRemoteAuth(req, res)) return true;
    const profile = url.searchParams.get("profile") || undefined;
    sendJson(res, 200, { skills: await listInstalledSkills(profile) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/v1/skills/bundled") {
    if (!requireRemoteAuth(req, res)) return true;
    const profile = url.searchParams.get("profile") || undefined;
    sendJson(res, 200, { skills: await listBundledSkills(profile) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/v1/skills/content") {
    if (!requireRemoteAuth(req, res)) return true;
    const skillPath = String(url.searchParams.get("path") || "");
    sendJson(res, 200, { content: await getSkillContent(skillPath) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/skills/install") {
    if (!requireRemoteAuth(req, res)) return true;
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await installSkill(String(body.identifier || ""), body.profile as string | undefined),
    );
    return true;
  }

  const skillMatch = url.pathname.match(/^\/api\/v1\/skills\/([^/]+)(\/enabled|\/usage)?$/);
  if (skillMatch) {
    if (!requireRemoteAuth(req, res)) return true;
    const skillId = decodeURIComponent(skillMatch[1]);
    const action = skillMatch[2];
    const profile = profileFromQuery(url);

    if (req.method === "DELETE" && !action) {
      sendJson(res, 200, await uninstallSkill(skillId, profile === "default" ? undefined : profile));
      return true;
    }

    if (req.method === "PATCH" && action === "/enabled") {
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        await setSkillEnabled(skillId, body.enabled === true, profile === "default" ? undefined : profile),
      );
      return true;
    }

    if (req.method === "POST" && action === "/usage") {
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        await recordSkillUsage(skillId, body.success === true, profile === "default" ? undefined : profile),
      );
      return true;
    }
  }

  if (req.method === "GET" && url.pathname === "/api/v1/skills/config") {
    if (!requireRemoteAuth(req, res)) return true;
    const profile = url.searchParams.get("profile") || undefined;
    sendJson(res, 200, await getSkillConfig(profile));
    return true;
  }

  return false;
}
