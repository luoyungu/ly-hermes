import crypto from "crypto";
import { getSetting, setSetting } from "./db";

export type DeploymentMode = "local" | "client_only";

export interface RemoteConnection {
  name: string;
  host: string;
  port: number;
  api_token: string;
  last_seen_at?: string;
}

export interface RemoteServerConfig {
  enabled: boolean;
  bind_host: string;
  port: number;
  api_token: string;
}

const DEFAULT_REMOTE_SERVER: RemoteServerConfig = {
  enabled: false,
  bind_host: "0.0.0.0",
  port: 8787,
  api_token: "",
};

const DEFAULT_REMOTE_CONNECTION: RemoteConnection = {
  name: "",
  host: "",
  port: 8787,
  api_token: "",
};

export function generateApiToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getDeploymentMode(): DeploymentMode | null {
  const mode = getSetting<string | null>("app", "deployment_mode", null);
  if (mode === "local" || mode === "client_only") return mode;
  return null;
}

export function setDeploymentMode(mode: DeploymentMode): void {
  setSetting("app", "deployment_mode", mode);
}

export function isClientOnlyMode(): boolean {
  return getDeploymentMode() === "client_only";
}

export function isLocalMode(): boolean {
  return getDeploymentMode() === "local";
}

export function getRemoteConnection(): RemoteConnection {
  return {
    ...DEFAULT_REMOTE_CONNECTION,
    ...getSetting<Partial<RemoteConnection>>("remote", "connection", {}),
  };
}

export function saveRemoteConnection(connection: RemoteConnection): void {
  setSetting("remote", "connection", connection);
}

export function clearRemoteConnection(): void {
  setSetting("remote", "connection", DEFAULT_REMOTE_CONNECTION);
}

export function getRemoteServerConfig(): RemoteServerConfig {
  const stored = getSetting<Partial<RemoteServerConfig>>("remote_server", "config", {});
  const config: RemoteServerConfig = {
    ...DEFAULT_REMOTE_SERVER,
    ...stored,
    port: Number(stored.port || DEFAULT_REMOTE_SERVER.port) || DEFAULT_REMOTE_SERVER.port,
  };
  if (!config.api_token) {
    config.api_token = generateApiToken();
    saveRemoteServerConfig(config);
  }
  return config;
}

export function saveRemoteServerConfig(config: RemoteServerConfig): void {
  setSetting("remote_server", "config", config);
}

export function rotateRemoteServerApiToken(): RemoteServerConfig {
  const config = getRemoteServerConfig();
  config.api_token = generateApiToken();
  saveRemoteServerConfig(config);
  return config;
}

export function getRemoteServerListenConfig(): { host: string; port: number } {
  const config = getRemoteServerConfig();
  const webPort = getSetting<number>("web_server", "port", config.port);
  const port = Number(webPort || config.port) || 8787;
  if (!config.enabled) {
    return { host: "127.0.0.1", port };
  }
  return { host: config.bind_host || "0.0.0.0", port };
}

export function isRemoteApiEnabled(): boolean {
  return getRemoteServerConfig().enabled;
}

export function getRemoteConnectionBaseUrl(connection?: RemoteConnection): string | null {
  const conn = connection || getRemoteConnection();
  const host = String(conn.host || "").trim();
  const port = Number(conn.port || 0);
  if (!host || !port) return null;
  return `http://${host}:${port}`;
}
