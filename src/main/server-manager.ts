import { type BrowserWindow } from "electron";

type MainWindowGetter = () => BrowserWindow | null;
import type http from "http";
import { createHermesServer } from "../server";
import { loadAppConfig, saveAppConfig } from "./config";
import { webIpc } from "./ipc/web-api-ipc";
import {
  getRemoteServerConfig,
  getRemoteServerListenConfig,
  isRemoteApiEnabled,
  rotateRemoteServerApiToken,
  saveRemoteServerConfig,
  type RemoteConnection,
  type RemoteServerConfig,
  getDeploymentMode,
  setDeploymentMode,
  getRemoteConnection,
  saveRemoteConnection,
  clearRemoteConnection,
  isClientOnlyMode,
  type DeploymentMode,
} from "./deployment";
import { testRemoteConnection } from "../core/remote/remote-client";
import { logError, logInfo } from "./logger";

export interface DesktopWebServerStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  bindHost: string;
  remoteEnabled: boolean;
  apiToken?: string;
  error?: string;
}

const DEFAULT_WEB_SERVER_PORT = 8787;

let server: http.Server | null = null;
let currentPort = DEFAULT_WEB_SERVER_PORT;
let currentHost = "127.0.0.1";
let lastError = "";
let resolveMainWindow: MainWindowGetter = () => null;

export function configureDesktopWebServer(deps: { getMainWindow: MainWindowGetter }): void {
  resolveMainWindow = deps.getMainWindow;
}

function readWebServerConfig(): { autoStart: boolean; port: number } {
  const config = loadAppConfig();
  const raw = config.web_server as Record<string, unknown> | undefined;
  if (raw?.embed_token !== undefined) {
    writeWebServerConfig({
      autoStart: raw?.auto_start === true,
      port: Number(raw?.port || DEFAULT_WEB_SERVER_PORT) || DEFAULT_WEB_SERVER_PORT,
    });
  }
  const remote = getRemoteServerConfig();
  return {
    autoStart: raw?.auto_start === true,
    port: Number(raw?.port || remote.port || DEFAULT_WEB_SERVER_PORT) || DEFAULT_WEB_SERVER_PORT,
  };
}

function writeWebServerConfig(next: { autoStart: boolean; port: number }): void {
  const config = loadAppConfig();
  const current = (config.web_server as Record<string, unknown> | undefined) || {};
  delete current.embed_token;
  config.web_server = {
    ...current,
    auto_start: next.autoStart,
    port: next.port,
  };
  saveAppConfig(config);
  const remote = getRemoteServerConfig();
  remote.port = next.port;
  saveRemoteServerConfig(remote);
}

function disableServerCapabilities(): void {
  const webConfig = readWebServerConfig();
  if (webConfig.autoStart) {
    writeWebServerConfig({ autoStart: false, port: webConfig.port });
  }
  const remote = getRemoteServerConfig();
  if (remote.enabled) {
    saveRemoteServerConfig({ ...remote, enabled: false });
  }
}

export function getDesktopWebServerStatus(): DesktopWebServerStatus {
  const config = readWebServerConfig();
  const remote = getRemoteServerConfig();
  const listen = getRemoteServerListenConfig();
  const port = server ? currentPort : listen.port;
  const host = server ? currentHost : listen.host;
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    enabled: config.autoStart,
    running: !!server,
    port,
    bindHost: host,
    remoteEnabled: remote.enabled,
    apiToken: remote.enabled ? remote.api_token : undefined,
    url: `http://${displayHost}:${port}/embed`,
    error: lastError || undefined,
  };
}

export async function startDesktopWebServer(port?: number): Promise<DesktopWebServerStatus> {
  if (isClientOnlyMode()) {
    disableServerCapabilities();
    await stopDesktopWebServer();
    lastError = "远程客户端模式不提供 Web 服务";
    return getDesktopWebServerStatus();
  }
  if (server) return getDesktopWebServerStatus();
  const listen = getRemoteServerListenConfig();
  currentPort = Number(port || listen.port) || DEFAULT_WEB_SERVER_PORT;
  currentHost = listen.host;
  lastError = "";
  server = createHermesServer({ getMainWindow: resolveMainWindow });

  return new Promise((resolve) => {
    const activeServer = server!;
    const fail = (error: Error): void => {
      lastError = error.message;
      logError("server", "Desktop web server failed to start", error);
      activeServer.removeListener("listening", success);
      activeServer.removeListener("error", fail);
      try {
        activeServer.close();
      } catch {
        /* ignore */
      }
      if (server === activeServer) server = null;
      resolve(getDesktopWebServerStatus());
    };
    const success = (): void => {
      activeServer.removeListener("error", fail);
      logInfo("server", "Desktop web server started", {
        port: currentPort,
        host: currentHost,
        remoteEnabled: isRemoteApiEnabled(),
      });
      resolve(getDesktopWebServerStatus());
    };
    activeServer.once("error", fail);
    activeServer.once("listening", success);
    activeServer.listen(currentPort, currentHost);
  });
}

export async function stopDesktopWebServer(): Promise<DesktopWebServerStatus> {
  if (!server) return getDesktopWebServerStatus();
  const activeServer = server;
  server = null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (error) {
        lastError = error.message;
        logError("server", "Desktop web server failed to stop cleanly", error);
      } else {
        lastError = "";
        logInfo("server", "Desktop web server stopped");
      }
      resolve(getDesktopWebServerStatus());
    };

    const timer = setTimeout(() => {
      try {
        activeServer.closeAllConnections?.();
      } catch {
        /* ignore */
      }
      finish();
    }, 1500);

    activeServer.close((error?: Error) => {
      clearTimeout(timer);
      finish(error);
    });
    try {
      activeServer.closeIdleConnections?.();
      activeServer.closeAllConnections?.();
    } catch {
      /* ignore */
    }
  });
}

export async function applyDesktopWebServerConfig(): Promise<DesktopWebServerStatus> {
  if (isClientOnlyMode()) {
    disableServerCapabilities();
    return stopDesktopWebServer();
  }
  const config = readWebServerConfig();
  if (!config.autoStart) return stopDesktopWebServer();
  const listen = getRemoteServerListenConfig();
  if (server && (currentPort !== listen.port || currentHost !== listen.host)) {
    await stopDesktopWebServer();
  }
  return startDesktopWebServer(listen.port);
}

export function registerDesktopWebServerIpc(): void {
  webIpc("desktop-web-server:get-status", () => getDesktopWebServerStatus());
  webIpc(
    "desktop-web-server:set-config",
    async (_, config: { autoStart: boolean; port?: number }) => {
      writeWebServerConfig({
        autoStart: config.autoStart === true,
        port: Number(config.port || DEFAULT_WEB_SERVER_PORT) || DEFAULT_WEB_SERVER_PORT,
      });
      return applyDesktopWebServerConfig();
    },
  );
}

export function registerDeploymentIpc(
  getMainWindow: () => BrowserWindow | null,
): void {
  webIpc("deployment:get-mode", () => getDeploymentMode());
  webIpc("deployment:set-mode", (_, mode: DeploymentMode) => {
    setDeploymentMode(mode);
    if (mode === "client_only") {
      disableServerCapabilities();
      void stopDesktopWebServer();
    }
    return { success: true, mode };
  });

  webIpc("remote-connection:get", () => getRemoteConnection());
  webIpc("remote-connection:save", async (_, connection: RemoteConnection) => {
    setDeploymentMode("client_only");
    disableServerCapabilities();
    await stopDesktopWebServer();
    saveRemoteConnection(connection);
    const test = await testRemoteConnection(connection);
    if (test.success) {
      saveRemoteConnection({
        ...connection,
        last_seen_at: new Date().toISOString(),
      });
      const {
        startRemoteEventBridge,
        startRemoteConnectionMonitor,
        notifyRemoteConnectionChanged,
      } = await import("./ipc/remote-events");
      startRemoteEventBridge(getMainWindow);
      startRemoteConnectionMonitor(getMainWindow);
      notifyRemoteConnectionChanged(getMainWindow);
    }
    return test;
  });
  webIpc("remote-connection:test", async (_, connection?: RemoteConnection) => {
    const conn = connection || getRemoteConnection();
    const result = await testRemoteConnection(conn);
    if (result.success) {
      saveRemoteConnection({
        ...conn,
        last_seen_at: new Date().toISOString(),
      });
      const { notifyRemoteConnectionChanged } = await import("./ipc/remote-events");
      notifyRemoteConnectionChanged(getMainWindow);
    }
    return result;
  });
  webIpc("remote-connection:get-status", async () => {
    const { getRemoteConnectionStatusSnapshot } = await import("./ipc/remote-events");
    const snapshot = getRemoteConnectionStatusSnapshot();
    if (!snapshot) return null;
    return {
      ...snapshot,
      connection: getRemoteConnection(),
    };
  });
  webIpc("remote-connection:refresh-status", async () => {
    const { refreshRemoteConnectionStatus } = await import("./ipc/remote-events");
    await refreshRemoteConnectionStatus(getMainWindow);
    const { getRemoteConnectionStatusSnapshot } = await import("./ipc/remote-events");
    const snapshot = getRemoteConnectionStatusSnapshot();
    if (!snapshot) return null;
    return {
      ...snapshot,
      connection: getRemoteConnection(),
    };
  });
  webIpc("remote-connection:clear", () => {
    clearRemoteConnection();
    return { success: true };
  });

  webIpc("deployment:switch-to-local", async () => {
    clearRemoteConnection();
    setDeploymentMode("local");
    const { stopRemoteEventBridge, stopRemoteConnectionMonitor } = await import("./ipc/remote-events");
    stopRemoteEventBridge();
    stopRemoteConnectionMonitor();
    return { success: true };
  });

  webIpc("remote-server:get-config", () => {
    const config = getRemoteServerConfig();
    return {
      enabled: config.enabled,
      bind_host: config.bind_host,
      port: config.port,
      api_token: config.api_token,
    };
  });
  webIpc("remote-server:set-config", async (_, config: Partial<RemoteServerConfig>) => {
    const current = getRemoteServerConfig();
    const next: RemoteServerConfig = {
      enabled: config.enabled === true,
      bind_host: String(config.bind_host || current.bind_host || "0.0.0.0"),
      port: Number(config.port || current.port) || DEFAULT_WEB_SERVER_PORT,
      api_token: String(config.api_token || current.api_token),
    };
    saveRemoteServerConfig(next);
    writeWebServerConfig({
      autoStart: readWebServerConfig().autoStart,
      port: next.port,
    });
    return applyDesktopWebServerConfig();
  });
  webIpc("remote-server:rotate-token", async () => {
    const config = rotateRemoteServerApiToken();
    await applyDesktopWebServerConfig();
    return {
      api_token: config.api_token,
      status: getDesktopWebServerStatus(),
    };
  });
}
