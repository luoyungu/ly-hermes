type Listener = (data: unknown) => void;

async function apiJson<T>(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
  }
  return data as T;
}

async function invokeLocal<T>(baseUrl: string, channel: string, args: unknown[] = []): Promise<T> {
  const data = await apiJson<{ result: T }>(baseUrl, "POST", "/api/local/invoke", { channel, args });
  return data.result;
}

function createEventHub() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on(event: string, cb: Listener): () => void {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
    emit(event: string, data: unknown): void {
      listeners.get(event)?.forEach((cb) => cb(data));
    },
  };
}

export function createWebHermesAPI(baseUrl = ""): Record<string, unknown> {
  const root = baseUrl.replace(/\/$/, "") || "";
  const hub = createEventHub();
  let eventsSource: EventSource | null = null;
  let eventsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const SSE_EVENTS = [
    "cron-session-created",
    "employee-status-changed",
    "employee-list-changed",
    "employee-idle-timeout",
    "session-updated",
  ];

  const connectEvents = (): void => {
    if (eventsReconnectTimer) {
      clearTimeout(eventsReconnectTimer);
      eventsReconnectTimer = null;
    }
    eventsSource?.close();
    eventsSource = new EventSource(`${root}/api/v1/events`, { withCredentials: true });
    for (const eventName of SSE_EVENTS) {
      eventsSource.addEventListener(eventName, (ev) => {
        try {
          hub.emit(eventName, JSON.parse((ev as MessageEvent).data));
        } catch { /* ignore */ }
      });
    }
    eventsSource.onerror = () => {
      eventsSource?.close();
      eventsSource = null;
      if (!eventsReconnectTimer) {
        eventsReconnectTimer = setTimeout(() => {
          eventsReconnectTimer = null;
          connectEvents();
        }, 5000);
      }
    };
  };

  const api = {
    authLogin: async (password: string) => {
      const result = await apiJson<{ success?: boolean; error?: string; user?: unknown }>(
        root,
        "POST",
        "/api/auth/login",
        { password },
      );
      if (result.success) connectEvents();
      return result;
    },
    authLogout: async () => {
      eventsSource?.close();
      return apiJson(root, "POST", "/api/auth/logout");
    },
    authGetCurrent: async () => {
      try {
        const data = await apiJson<{ user?: { id: string; username: string; displayName: string } }>(
          root,
          "GET",
          "/api/auth/me",
        );
        return data.user || null;
      } catch {
        return null;
      }
    },
    authChangePassword: async (oldPassword: string, newPassword: string) =>
      apiJson(root, "POST", "/api/auth/change-password", { oldPassword, newPassword }),
    authSetupPassword: async (password: string) => {
      const result = await apiJson<{ success?: boolean; error?: string }>(
        root,
        "POST",
        "/api/auth/setup-password",
        { password },
      );
      if (result.success) connectEvents();
      return result;
    },
    checkInitialized: async () => {
      const data = await apiJson<{ initialized: boolean }>(root, "GET", "/api/auth/check-initialized");
      return data.initialized;
    },

    getDeploymentMode: async () => {
      const data = await apiJson<{ mode: string }>(root, "GET", "/api/auth/mode");
      return data.mode;
    },
    setDeploymentMode: async (mode: string) => invokeLocal(root, "deployment:set-mode", [mode]),
    switchToLocalMode: async () => invokeLocal(root, "deployment:switch-to-local"),
    getRemoteConnection: async () => invokeLocal(root, "remote-connection:get"),
    saveRemoteConnection: async (connection: unknown) =>
      invokeLocal(root, "remote-connection:save", [connection]),
    testRemoteConnection: async (connection?: unknown) =>
      invokeLocal(root, "remote-connection:test", connection ? [connection] : []),
    getRemoteConnectionStatus: async () => invokeLocal(root, "remote-connection:get-status"),
    refreshRemoteConnectionStatus: async () => invokeLocal(root, "remote-connection:refresh-status"),
    onRemoteConnectionStatusChanged: () => () => undefined,
    clearRemoteConnection: async () => invokeLocal(root, "remote-connection:clear"),
    getRemoteServerConfig: async () => invokeLocal(root, "remote-server:get-config"),
    setRemoteServerConfig: async (config: unknown) => invokeLocal(root, "remote-server:set-config", [config]),
    rotateRemoteServerToken: async () => invokeLocal(root, "remote-server:rotate-token"),

    listEmployees: async () => {
      const data = await apiJson<{ employees: unknown[] }>(root, "GET", "/api/v1/employees");
      return data.employees as unknown[];
    },
    getEmployee: async (name: string) => {
      const data = await apiJson<{ employee: unknown }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}`);
      return data.employee as unknown;
    },
    createEmployee: async (name: string, options?: Record<string, unknown>) =>
      apiJson(root, "POST", "/api/v1/employees", { name, ...options }),
    updateEmployee: async (name: string, changes: Record<string, unknown>) =>
      apiJson(root, "PATCH", `/api/v1/employees/${encodeURIComponent(name)}`, changes),
    deleteEmployee: async (name: string) =>
      apiJson(root, "DELETE", `/api/v1/employees/${encodeURIComponent(name)}`),
    wakeUpEmployee: async (name: string) =>
      apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(name)}/wake-up`),
    sleepEmployee: async (name: string) =>
      apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(name)}/sleep`),
    restartEmployee: async (name: string) =>
      apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(name)}/restart`),
    getEmployeeStatus: async (name: string) => {
      const data = await apiJson<{ status: string }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/status`);
      return data.status;
    },
    resetEmployeeWebToken: async (name: string) =>
      apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(name)}/web-access/rotate-token`),
    renameEmployee: async (oldName: string, newName: string) =>
      apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(oldName)}/rename`, { newName }),
    setEmployeePet: async (name: string, petSlug: string) =>
      apiJson(root, "PATCH", `/api/v1/employees/${encodeURIComponent(name)}`, { petSlug }),

    getEmployeeSoul: async (name: string) => {
      const data = await apiJson<{ content: string }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/soul`);
      return data.content || "";
    },
    setEmployeeSoul: async (name: string, content: string) =>
      apiJson(root, "PUT", `/api/v1/employees/${encodeURIComponent(name)}/soul`, { content }),
    resetEmployeeSoul: async (name: string) =>
      apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(name)}/soul/reset`),
    generateEmployeeSoulDraft: async (input: Record<string, unknown>) =>
      apiJson(root, "POST", "/api/v1/employees/soul-draft", input),
    getEmployeeConfig: async (name: string) => {
      const data = await apiJson<{ config: Record<string, unknown> }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/config`);
      return data.config;
    },
    setEmployeeConfig: async (name: string, configObj: Record<string, unknown>) =>
      apiJson(root, "PUT", `/api/v1/employees/${encodeURIComponent(name)}/config`, configObj),
    getEmployeeEnv: async (name: string) => {
      const data = await apiJson<{ env: Record<string, string> }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/env`);
      return data.env || {};
    },
    setEmployeeEnv: async (name: string, envObj: Record<string, string>) =>
      apiJson(root, "PUT", `/api/v1/employees/${encodeURIComponent(name)}/env`, envObj),
    getEmployeeSkills: async (name: string) => {
      const data = await apiJson<{ skills: unknown[] }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/skills/dir`);
      return data.skills as unknown[];
    },
    removeSkill: async (name: string, skillName: string) =>
      apiJson(root, "DELETE", `/api/v1/employees/${encodeURIComponent(name)}/skills/${encodeURIComponent(skillName)}`),
    getEmployeeTools: async (name: string) => {
      const data = await apiJson<{ tools: string[] }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/tools`);
      return data.tools || [];
    },
    setEmployeeTools: async (name: string, tools: string[]) =>
      apiJson(root, "PUT", `/api/v1/employees/${encodeURIComponent(name)}/tools`, { tools }),
    toggleTool: async (name: string, toolKey: string, enabled: boolean) =>
      apiJson(root, "PATCH", `/api/v1/employees/${encodeURIComponent(name)}/tools/${encodeURIComponent(toolKey)}`, { enabled }),
    getEmployeeMemory: async (name: string) =>
      apiJson(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/memory`),
    addMemory: async (name: string, content: string) =>
      apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(name)}/memory`, { content }),
    deleteMemory: async (name: string, index: number) =>
      apiJson(root, "DELETE", `/api/v1/employees/${encodeURIComponent(name)}/memory/${index}`),
    getEmployeeSessions: async (name: string) => {
      const data = await apiJson<{ sessions: unknown[] }>(root, "GET", `/api/v1/employees/${encodeURIComponent(name)}/sessions`);
      return data.sessions as unknown[];
    },
    exportEmployee: async (name: string) => apiJson(root, "POST", `/api/v1/employees/${encodeURIComponent(name)}/export`),

    listInstalledSkills: async (profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      const data = await apiJson<{ skills: unknown[] }>(root, "GET", `/api/v1/skills/installed${q}`);
      return data.skills as unknown[];
    },
    listBundledSkills: async (profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      const data = await apiJson<{ skills: unknown[] }>(root, "GET", `/api/v1/skills/bundled${q}`);
      return data.skills as unknown[];
    },
    getSkillContent: async (skillPath: string) => {
      const data = await apiJson<{ content: string }>(root, "GET", `/api/v1/skills/content?path=${encodeURIComponent(skillPath)}`);
      return data.content || "";
    },
    installSkill: async (identifier: string, profile?: string) =>
      apiJson(root, "POST", "/api/v1/skills/install", { identifier, profile }),
    uninstallSkill: async (name: string, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "DELETE", `/api/v1/skills/${encodeURIComponent(name)}${q}`);
    },
    getSkillConfig: async (profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "GET", `/api/v1/skills/config${q}`);
    },
    setSkillEnabled: async (skillId: string, enabled: boolean, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "PATCH", `/api/v1/skills/${encodeURIComponent(skillId)}/enabled${q}`, { enabled });
    },
    recordSkillUsage: async (skillId: string, success: boolean, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "POST", `/api/v1/skills/${encodeURIComponent(skillId)}/usage${q}`, { success });
    },

    listMcpServers: async () => apiJson(root, "GET", "/api/v1/tools/mcp"),
    saveMcpServer: async (server: Record<string, unknown>) => apiJson(root, "PUT", "/api/v1/tools/mcp", server),
    deleteMcpServer: async (name: string) => apiJson(root, "DELETE", `/api/v1/tools/mcp/${encodeURIComponent(name)}`),
    testMcpServer: async (name: string) => apiJson(root, "POST", `/api/v1/tools/mcp/${encodeURIComponent(name)}/test`),
    parseMcpDescription: async (description: string) => apiJson(root, "POST", "/api/v1/tools/mcp/parse", { description }),

    sendMessage: async (
      profileName: string,
      message: string,
      history?: Array<{ role: string; content: string }>,
      resumeSessionId?: string,
      attachments?: unknown[],
    ) => {
      const res = await fetch(`${root}/api/v1/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profileName, message, history, resumeSessionId, attachments }),
      });
      if (!res.ok || !res.body) {
        hub.emit("chat-error", { profileName, error: `聊天失败 (${res.status})` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          let eventType = "";
          let dataLine = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine = line.slice(6);
          }
          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine) as { type?: string; data?: Record<string, unknown> };
            const type = parsed.type || eventType;
            const data = { profileName, ...(parsed.data || {}) };
            if (type === "chunk") hub.emit("chat-chunk", data);
            else if (type === "thinking") hub.emit("chat-thinking", data);
            else if (type === "tool_progress") hub.emit("chat-tool-progress", data);
            else if (type === "tool_start") hub.emit("chat-tool-start", data);
            else if (type === "tool_end") hub.emit("chat-tool-end", data);
            else if (type === "approval_request") hub.emit("chat-approval-request", data);
            else if (type === "usage") hub.emit("chat-usage", data);
            else if (type === "done") hub.emit("chat-done", data);
            else if (type === "error") hub.emit("chat-error", data);
          } catch { /* ignore */ }
        }
      }
    },
    abortChat: async (profileName: string) =>
      apiJson(root, "POST", "/api/v1/chat/abort", { profileName }),
    sendApproval: async (profileName: string, approvalId: string, approved: boolean) =>
      apiJson(root, "POST", `/api/v1/chat/approval/${encodeURIComponent(approvalId)}`, { profileName, approved }),
    healthCheck: async () => {
      try {
        await apiJson(root, "GET", "/api/v1/health");
        return { online: true };
      } catch {
        return { online: false };
      }
    },
    stageAttachment: async (sessionId: string, filename: string, base64Bytes: string) => {
      const data = await apiJson<{ path: string }>(root, "POST", "/api/v1/attachments", {
        sessionId,
        filename,
        base64: base64Bytes,
      });
      return data.path;
    },
    getPathForFile: () => "",

    getSessions: async (limit?: number, offset?: number) => {
      const data = await apiJson<{ sessions: unknown[] }>(
        root,
        "GET",
        `/api/v1/sessions?limit=${limit || 50}&offset=${offset || 0}`,
      );
      return data.sessions as unknown[];
    },
    deleteSession: async (sessionId: string, profileName?: string) => {
      const q = profileName ? `?profile=${encodeURIComponent(profileName)}` : "";
      return apiJson(root, "DELETE", `/api/v1/sessions/${encodeURIComponent(sessionId)}${q}`);
    },
    deleteSessionMessage: async (sessionId: string, messageId: number, profileName?: string) => {
      const q = profileName ? `?profile=${encodeURIComponent(profileName)}` : "";
      return apiJson(root, "DELETE", `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(String(messageId))}${q}`);
    },
    getSessionMessages: async (sessionId: string, profileName?: string) => {
      const q = profileName ? `?profile=${encodeURIComponent(profileName)}` : "";
      const data = await apiJson<{ messages: unknown[] }>(
        root,
        "GET",
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages${q}`,
      );
      return data.messages as unknown[];
    },
    searchSessions: async (query: string, profileName?: string) => {
      const params = new URLSearchParams({ q: query });
      if (profileName) params.set("profile", profileName);
      const data = await apiJson<{ sessions: unknown[] }>(root, "GET", `/api/v1/sessions/search?${params}`);
      return data.sessions as unknown[];
    },
    getUsageStats: async (days?: number) => apiJson(root, "GET", `/api/v1/stats/usage?days=${days || 30}`),
    getTokenStats: async (days?: number) => apiJson(root, "GET", `/api/v1/stats/tokens?days=${days || 30}`),

    getCronJobs: async (profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      const data = await apiJson<{ jobs: unknown[] }>(root, "GET", `/api/v1/cron/jobs${q}`);
      return data.jobs as unknown[];
    },
    createCronJob: async (job: Record<string, unknown>) => apiJson(root, "POST", "/api/v1/cron/jobs", job),
    pauseCronJob: async (jobId: string, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "POST", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}/pause${q}`);
    },
    resumeCronJob: async (jobId: string, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "POST", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}/resume${q}`);
    },
    triggerCronJob: async (jobId: string, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "POST", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}/run${q}`);
    },
    updateCronJobDeliver: async (jobId: string, deliver: string, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "PATCH", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}${q}`, { deliver });
    },
    updateCronJob: async (jobId: string, updates: Record<string, string>, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "PATCH", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}${q}`, updates);
    },
    deleteCronJob: async (jobId: string, profile?: string) => {
      const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
      return apiJson(root, "DELETE", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}${q}`);
    },
    getCronHistory: async (limit?: number, offset?: number) => {
      const data = await apiJson<{ history: unknown[] }>(
        root,
        "GET",
        `/api/v1/cron/history?limit=${limit || 50}&offset=${offset || 0}`,
      );
      return data.history as unknown[];
    },

    checkInstall: async () => invokeLocal(root, "check-install"),
    verifyInstall: async () => invokeLocal(root, "verify-install"),
    startInstall: async () => invokeLocal(root, "start-install"),
    restartAllEngines: async () =>
      apiJson<{ success: boolean; restarted: number; total: number }>(root, "POST", "/api/v1/employees/restart-all"),
    getDesktopWebServerStatus: async () => invokeLocal(root, "desktop-web-server:get-status"),
    setDesktopWebServerConfig: async (config: unknown) =>
      invokeLocal(root, "desktop-web-server:set-config", [config]),
    listSavedModels: async () => invokeLocal(root, "list-saved-models"),
    addSavedModel: async (name: string, provider: string, model: string, baseUrl: string, apiKey: string) =>
      invokeLocal(root, "add-saved-model", [name, provider, model, baseUrl, apiKey]),
    removeSavedModel: async (id: string) => invokeLocal(root, "remove-saved-model", [id]),
    updateSavedModel: async (
      id: string,
      name: string,
      provider: string,
      model: string,
      baseUrl: string,
      apiKey: string,
    ) => invokeLocal(root, "update-saved-model", [id, name, provider, model, baseUrl, apiKey]),
    applySavedModel: async (id: string, profile?: string) =>
      invokeLocal(root, "apply-saved-model", profile ? [id, profile] : [id]),
    getConfig: async () => invokeLocal(root, "get-config"),
    getEnv: async () => invokeLocal(root, "get-env"),
    getHermesHome: async () => invokeLocal(root, "get-hermes-home"),
    checkHermesInstall: async () => invokeLocal(root, "check-hermes-install"),
    getModelConfig: async () => invokeLocal(root, "get-model-config"),
    getSoulGenerationModel: async () => invokeLocal(root, "get-soul-generation-model"),
    getAvailableModels: async () => invokeLocal(root, "get-available-models"),
    setModel: async (modelName: string) => invokeLocal(root, "set-model", [modelName]),
    setModelConfig: async (modelConfig: Record<string, unknown>) =>
      invokeLocal(root, "set-model-config", [modelConfig]),
    getPlugins: async () => invokeLocal(root, "get-plugins"),
    getPluginInfo: async (pluginName: string) => invokeLocal(root, "get-plugin-info", [pluginName]),
    getThemeMode: async () => invokeLocal(root, "get-theme-mode"),
    setThemeMode: async (mode: string) => invokeLocal(root, "set-theme-mode", [mode]),
    getAccentColor: async () => invokeLocal(root, "get-accent-color"),
    setAccentColor: async (accent: string) => invokeLocal(root, "set-accent-color", [accent]),
    getUiTheme: async () => invokeLocal(root, "get-ui-theme"),
    setUiTheme: async (theme: string) => invokeLocal(root, "set-ui-theme", [theme]),
    getLanguage: async () => invokeLocal(root, "get-language"),
    setLanguage: async (language: string) => invokeLocal(root, "set-language", [language]),
    readLogs: async (logFile?: string, lines?: number) => invokeLocal(root, "read-logs", [logFile, lines]),
    clearLogs: async (logFile?: string) => invokeLocal(root, "clear-logs", [logFile ? logFile : undefined]),
    getAppConfig: async () => invokeLocal(root, "get-app-config"),
    setAppConfig: async (config: unknown) => invokeLocal(root, "set-app-config", [config]),
    getRuntimeConfig: async () => invokeLocal(root, "get-runtime-config"),
    setRuntimeConfig: async (config: unknown) => invokeLocal(root, "set-runtime-config", [config]),
    saveWallpaperFile: async (dataUrl: string) => invokeLocal(root, "save-wallpaper-file", [dataUrl]),
    getHermesVersion: async () => invokeLocal(root, "get-hermes-version"),
    refreshHermesVersion: async () => invokeLocal(root, "refresh-hermes-version"),
    runHermesDoctor: async () => invokeLocal(root, "run-hermes-doctor"),
    runHermesUpdate: async () => invokeLocal(root, "run-hermes-update"),
    checkAppUpdate: async () => ({ success: false }),
    downloadAppUpdate: async () => ({ success: false }),
    installAppUpdate: async () => undefined,
    getAppVersion: async () => {
      const data = await apiJson<{ version: string }>(root, "GET", "/api/auth/app-version");
      return data.version;
    },
    runHermesBackup: async () => invokeLocal(root, "run-hermes-backup"),
    runHermesImport: async (filePath: string) => invokeLocal(root, "run-hermes-import", [filePath]),
    listPets: async () => invokeLocal(root, "pets:list"),
    getPetSpritesheet: async (slug: string) => invokeLocal(root, "pets:get-spritesheet", [slug]),
    refreshPetManifest: async () => invokeLocal(root, "pets:refresh-manifest"),
    getAppLogs: async (options?: { level?: string; lines?: number }) =>
      invokeLocal(root, "get-app-logs", options ? [options] : []),
    clearAppLogs: async () => invokeLocal(root, "clear-app-logs"),
    getLogFilePath: async () => invokeLocal(root, "get-log-file-path"),
    windowMinimize: async () => undefined,
    windowMaximize: async () => undefined,
    windowClose: async () => undefined,
    windowIsMaximized: async () => false,

    onInstallProgress: () => () => undefined,
    onChatChunk: (cb: (data: unknown) => void) => hub.on("chat-chunk", cb as Listener),
    onChatDone: (cb: (data: unknown) => void) => hub.on("chat-done", cb as Listener),
    onChatError: (cb: (data: unknown) => void) => hub.on("chat-error", cb as Listener),
    onChatToolProgress: (cb: (data: unknown) => void) => hub.on("chat-tool-progress", cb as Listener),
    onChatToolStart: (cb: (data: unknown) => void) => hub.on("chat-tool-start", cb as Listener),
    onChatToolEnd: (cb: (data: unknown) => void) => hub.on("chat-tool-end", cb as Listener),
    onChatApprovalRequest: (cb: (data: unknown) => void) => hub.on("chat-approval-request", cb as Listener),
    onChatThinking: (cb: (data: unknown) => void) => hub.on("chat-thinking", cb as Listener),
    onChatUsage: (cb: (data: unknown) => void) => hub.on("chat-usage", cb as Listener),
    onEmployeeStatusChanged: (cb: (data: unknown) => void) => hub.on("employee-status-changed", cb as Listener),
    onEmployeeListChanged: (cb: (data: unknown) => void) => hub.on("employee-list-changed", cb as Listener),
    onEmployeeIdleTimeout: (cb: (data: unknown) => void) => hub.on("employee-idle-timeout", cb as Listener),
    onNewConversation: (cb: (data: unknown) => void) => hub.on("new-conversation", cb as Listener),
    onCronSessionCreated: (cb: (data: unknown) => void) => hub.on("cron-session-created", cb as Listener),
    onSessionUpdated: (cb: (data: unknown) => void) => hub.on("session-updated", cb as Listener),
    onUpdateStatus: () => () => undefined,

    resumeSession: async () => {
      const user = await api.authGetCurrent();
      if (user) connectEvents();
      return user;
    },
  };

  return api;
}
