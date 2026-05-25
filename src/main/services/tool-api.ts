import fs from "fs";
import path from "path";
import * as yaml from "../lib/yaml-simple";
import { PROFILES_DIR, getProfilePath, runHermesCli } from "../config";
import { ensureDir, safeWriteFile, yamlStringify } from "../utils";

export interface McpServerInput {
  name: string;
  transport?: string;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  timeout?: number;
  connect_timeout?: number;
  allowedProfiles?: string[];
}

export interface McpServerInfo extends McpServerInput {
  transport: string;
  envKeys: string[];
  allowedProfiles: string[];
}

const MCP_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const PROFILE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function configPath(profileName = "default"): string {
  return path.join(getProfilePath(profileName), "config.yaml");
}

function loadHermesConfig(profileName = "default"): Record<string, unknown> {
  const file = configPath(profileName);
  if (!fs.existsSync(file)) return {};
  try {
    return yaml.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveHermesConfig(config: Record<string, unknown>, profileName = "default"): void {
  ensureDir(getProfilePath(profileName));
  safeWriteFile(configPath(profileName), yamlStringify(config));
}

function getMcpServers(config = loadHermesConfig()): Record<string, Record<string, unknown>> {
  const raw = config.mcp_servers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, Record<string, unknown>>;
}

function maskSecret(value: unknown): string {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.includes("****")) return raw;
  if (raw.length <= 8) return "****";
  return `${raw.slice(0, 4)}****${raw.slice(-2)}`;
}

function maskRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    result[key] = maskSecret(value);
  }
  return result;
}

function normalizeStringRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = String(key || "").trim();
    const v = String(value || "").trim();
    if (k && v) result[k] = v;
  }
  return result;
}

function inferTransport(server: Record<string, unknown>): string {
  const explicit = String(server.transport || "").trim();
  if (explicit) return explicit;
  if (server.command) return "stdio";
  if (String(server.url || "").includes("/sse")) return "sse";
  return server.url ? "http" : "stdio";
}

function toServerInfo(
  name: string,
  server: Record<string, unknown>,
  allowedProfiles: string[] = [],
): McpServerInfo {
  const env = maskRecord(server.env);
  const headers = maskRecord(server.headers);
  const args = Array.isArray(server.args) ? server.args.map(String) : [];
  return {
    name,
    transport: inferTransport(server),
    command: String(server.command || ""),
    args,
    url: String(server.url || ""),
    headers,
    env,
    envKeys: Object.keys(env),
    timeout: Number(server.timeout || 120),
    connect_timeout: Number(server.connect_timeout || 60),
    allowedProfiles,
  };
}

function mergeMaskedRecord(
  next: Record<string, string>,
  previous: unknown,
): Record<string, string> | undefined {
  const oldValues = normalizeStringRecord(previous);
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value.includes("****") && oldValues[key]) {
      merged[key] = oldValues[key];
    } else {
      merged[key] = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function listMcpServers(): { servers: McpServerInfo[]; configPath: string } {
  const byName = new Map<string, { server: Record<string, unknown>; profiles: string[] }>();
  for (const profileName of listProfileNames()) {
    const servers = getMcpServers(loadHermesConfig(profileName));
    for (const [name, server] of Object.entries(servers)) {
      const existing = byName.get(name);
      if (existing) {
        existing.profiles.push(profileName);
      } else {
        byName.set(name, { server, profiles: [profileName] });
      }
    }
  }
  return {
    configPath: configPath(),
    servers: Array.from(byName.entries())
      .map(([name, item]) => toServerInfo(name, item.server, item.profiles))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function listProfileNames(): string[] {
  const names = new Set<string>(["default"]);
  try {
    if (fs.existsSync(PROFILES_DIR)) {
      for (const entry of fs.readdirSync(PROFILES_DIR, { withFileTypes: true })) {
        if (entry.isDirectory() && PROFILE_NAME_RE.test(entry.name)) {
          names.add(entry.name);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return Array.from(names);
}

function normalizeProfiles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  for (const value of input) {
    const name = String(value || "").trim();
    if ((name === "default" || PROFILE_NAME_RE.test(name)) && !result.includes(name)) {
      result.push(name);
    }
  }
  return result;
}

function findServerProfiles(serverName: string): string[] {
  return listProfileNames().filter((profileName) => {
    const servers = getMcpServers(loadHermesConfig(profileName));
    return !!servers[serverName];
  });
}

export function saveMcpServer(input: McpServerInput): { success: boolean; error?: string; server?: McpServerInfo } {
  const name = String(input.name || "").trim();
  if (!MCP_NAME_RE.test(name)) {
    return { success: false, error: "MCP 名称只能包含字母、数字、下划线和连字符" };
  }
  const transport = String(input.transport || "").trim() || (input.command ? "stdio" : "http");
  const command = String(input.command || "").trim();
  const url = String(input.url || "").trim();
  if (transport === "stdio" && !command) return { success: false, error: "stdio MCP 需要填写 command" };
  if (transport !== "stdio" && !url) return { success: false, error: "HTTP/SSE MCP 需要填写 URL" };
  const allowedProfiles = normalizeProfiles(input.allowedProfiles);
  if (allowedProfiles.length === 0) return { success: false, error: "请选择至少一个授权员工" };

  const previousProfile = findServerProfiles(name)[0] || allowedProfiles[0] || "default";
  const previous = getMcpServers(loadHermesConfig(previousProfile))[name] || {};
  const next: Record<string, unknown> = {};
  if (transport !== "http") next.transport = transport;
  if (transport === "stdio") {
    next.command = command;
    const args = Array.isArray(input.args) ? input.args.map(String).map(v => v.trim()).filter(Boolean) : [];
    if (args.length > 0) next.args = args;
    const env = mergeMaskedRecord(normalizeStringRecord(input.env), previous.env);
    if (env) next.env = env;
  } else {
    next.url = url;
    if (transport === "sse") next.transport = "sse";
    const headers = mergeMaskedRecord(normalizeStringRecord(input.headers), previous.headers);
    if (headers) next.headers = headers;
  }
  const timeout = Number(input.timeout || 0);
  const connectTimeout = Number(input.connect_timeout || 0);
  if (timeout > 0) next.timeout = timeout;
  if (connectTimeout > 0) next.connect_timeout = connectTimeout;

  for (const profileName of listProfileNames()) {
    const config = loadHermesConfig(profileName);
    const servers = getMcpServers(config);
    if (servers[name]) {
      delete servers[name];
      if (Object.keys(servers).length > 0) config.mcp_servers = servers;
      else delete config.mcp_servers;
      saveHermesConfig(config, profileName);
    }
  }

  for (const profileName of allowedProfiles) {
    const config = loadHermesConfig(profileName);
    const servers = getMcpServers(config);
    config.mcp_servers = { ...servers, [name]: next };
    saveHermesConfig(config, profileName);
  }

  return { success: true, server: toServerInfo(name, next, allowedProfiles) };
}

export function deleteMcpServer(name: string): { success: boolean; error?: string } {
  const serverName = String(name || "").trim();
  if (!MCP_NAME_RE.test(serverName)) return { success: false, error: "无效的 MCP 名称" };
  const profiles = findServerProfiles(serverName);
  if (profiles.length === 0) return { success: false, error: "MCP 服务不存在" };
  for (const profileName of profiles) {
    const config = loadHermesConfig(profileName);
    const servers = getMcpServers(config);
    delete servers[serverName];
    if (Object.keys(servers).length > 0) config.mcp_servers = servers;
    else delete config.mcp_servers;
    saveHermesConfig(config, profileName);
  }
  return { success: true };
}

export function testMcpServer(name: string): { success: boolean; output: string } {
  const serverName = String(name || "").trim();
  if (!MCP_NAME_RE.test(serverName)) return { success: false, output: "无效的 MCP 名称" };
  const profileName = findServerProfiles(serverName)[0] || "default";
  const output = runHermesCli(["mcp", "test", serverName], profileName, 120000);
  const failed = /(^|\b)(error|failed|failure|traceback|not found|不存在)(\b|:)/i.test(output);
  return { success: !failed, output };
}
