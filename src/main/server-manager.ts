import type http from "http";
import crypto from "crypto";
import { ipcMain } from "electron";
import { createHermesServer } from "../server";
import { loadAppConfig, saveAppConfig } from "./config";
import { logError, logInfo } from "./logger";

export interface DesktopWebServerStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  token: string;
  error?: string;
}

const DEFAULT_WEB_SERVER_PORT = 8787;

let server: http.Server | null = null;
let currentPort = DEFAULT_WEB_SERVER_PORT;
let lastError = "";

function createEmbedToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function readWebServerConfig(): { autoStart: boolean; port: number; token: string } {
  const config = loadAppConfig();
  const raw = config.web_server as Record<string, unknown> | undefined;
  const token = typeof raw?.embed_token === "string" && raw.embed_token
    ? raw.embed_token
    : createEmbedToken();
  if (!raw?.embed_token) {
    writeWebServerConfig({
      autoStart: raw?.auto_start === true,
      port: Number(raw?.port || DEFAULT_WEB_SERVER_PORT) || DEFAULT_WEB_SERVER_PORT,
      token,
    });
  }
  return {
    autoStart: raw?.auto_start === true,
    port: Number(raw?.port || DEFAULT_WEB_SERVER_PORT) || DEFAULT_WEB_SERVER_PORT,
    token,
  };
}

function writeWebServerConfig(next: { autoStart: boolean; port: number; token?: string }): void {
  const config = loadAppConfig();
  const current = (config.web_server as Record<string, unknown> | undefined) || {};
  config.web_server = {
    ...current,
    auto_start: next.autoStart,
    port: next.port,
    embed_token: next.token || current.embed_token || createEmbedToken(),
  };
  saveAppConfig(config);
}

export function getDesktopWebServerStatus(): DesktopWebServerStatus {
  const config = readWebServerConfig();
  const port = server ? currentPort : config.port;
  return {
    enabled: config.autoStart,
    running: !!server,
    port,
    token: config.token,
    url: `http://127.0.0.1:${port}/embed?agent=default&token=${encodeURIComponent(config.token)}`,
    error: lastError || undefined,
  };
}

export async function startDesktopWebServer(port?: number): Promise<DesktopWebServerStatus> {
  if (server) return getDesktopWebServerStatus();
  const config = readWebServerConfig();
  currentPort = Number(port || config.port || DEFAULT_WEB_SERVER_PORT) || DEFAULT_WEB_SERVER_PORT;
  lastError = "";
  server = createHermesServer();

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
      logInfo("server", "Desktop web server started", { port: currentPort });
      resolve(getDesktopWebServerStatus());
    };
    activeServer.once("error", fail);
    activeServer.once("listening", success);
    activeServer.listen(currentPort, "127.0.0.1");
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
  const config = readWebServerConfig();
  if (!config.autoStart) return stopDesktopWebServer();
  if (server && currentPort !== config.port) {
    await stopDesktopWebServer();
  }
  return startDesktopWebServer(config.port);
}

export function registerDesktopWebServerIpc(): void {
  ipcMain.handle("desktop-web-server:get-status", () => getDesktopWebServerStatus());
  ipcMain.handle(
    "desktop-web-server:set-config",
    async (_, config: { autoStart: boolean; port?: number }) => {
      writeWebServerConfig({
        autoStart: config.autoStart === true,
        port: Number(config.port || DEFAULT_WEB_SERVER_PORT) || DEFAULT_WEB_SERVER_PORT,
      });
      return applyDesktopWebServerConfig();
    },
  );
  ipcMain.handle("desktop-web-server:reset-token", async () => {
    const config = readWebServerConfig();
    writeWebServerConfig({
      autoStart: config.autoStart,
      port: config.port,
      token: createEmbedToken(),
    });
    return getDesktopWebServerStatus();
  });
}
