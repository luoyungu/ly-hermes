import { ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import http from "http";
import { spawn, type ChildProcess } from "child_process";
import * as yaml from "./lib/yaml-simple";
import {
  HERMES_HOME,
  DEFAULT_API_HOST,
  loadAppConfig,
  getProfilePath,
  readHermesEnv,
  getModelFromProfile,
  validateProfileName,
  DEFAULT_HERMES_BIN,
} from "./config";
import {
  getApiPortForProfile,
  getEmployeeStatus,
  wakeUpEmployee,
  listEmployees,
  resetIdleTimer,
} from "./employees";
import { showChatNotification } from "./utils";
import type { BrowserWindow } from "electron";
import type { Attachment } from "../shared/attachments";
import { escapeXmlAttr } from "../shared/attachments";
import { stageAttachment } from "./attachment-staging";

const PROVIDER_KEY_MAP: Record<string, { envKey: string; baseUrl: string }> = {
  deepseek:    { envKey: "DEEPSEEK_API_KEY",    baseUrl: "https://api.deepseek.com/v1" },
  qwen:        { envKey: "DASHSCOPE_API_KEY",    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  zhipu:       { envKey: "GLM_API_KEY",          baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  moonshot:    { envKey: "MOONSHOT_API_KEY",     baseUrl: "https://api.moonshot.cn/v1" },
  yi:          { envKey: "YI_API_KEY",           baseUrl: "https://api.lingyiwanwu.com/v1" },
  minimax:     { envKey: "MINIMAX_API_KEY",      baseUrl: "https://api.minimax.chat/v1" },
  spark:       { envKey: "SPARK_API_KEY",        baseUrl: "https://spark-api-open.xf-yun.com/v1" },
  siliconflow: { envKey: "SILICONFLOW_API_KEY",  baseUrl: "https://api.siliconflow.cn/v1" },
  ernie:       { envKey: "QIANFAN_API_KEY",      baseUrl: "https://qianfan.baidubce.com/v2" },
};

export const _currentChatReqs: Record<string, AbortController> = {};

interface PendingApproval {
  profileName: string;
  approvalId: string;
  payload: Record<string, unknown>;
  ts: number;
}

export const _pendingApprovals: Record<string, PendingApproval> = {};

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export function buildUserContent(
  text: string,
  attachments?: Attachment[],
): ChatContent {
  if (!attachments || attachments.length === 0) return text;

  const textFiles = attachments.filter((a) => a.kind === "text-file");
  const pathRefs = attachments.filter(
    (a) => a.kind === "path-ref" && typeof a.path === "string" && a.path,
  );
  const images = attachments.filter(
    (a) => a.kind === "image" && typeof a.dataUrl === "string" && a.dataUrl,
  );

  const parts: string[] = [];
  if (text.trim()) parts.push(text);
  for (const file of textFiles) {
    if (typeof file.text !== "string") continue;
    parts.push(
      `<file name="${escapeXmlAttr(file.name)}" mime="${escapeXmlAttr(file.mime || "text/plain")}">\n${file.text}\n</file>`,
    );
  }
  if (pathRefs.length > 0) {
    parts.push(pathRefs.map((file) => `[Attached file: ${file.path}]`).join("\n"));
  }

  const composedText = parts.join("\n\n");
  if (images.length === 0) return composedText;

  const imageParts = images.map((image) => ({
    type: "image_url" as const,
    image_url: { url: image.dataUrl! },
  }));
  if (!composedText) return imageParts;
  return [{ type: "text" as const, text: composedText }, ...imageParts];
}

export function sendMessageViaApi(
  profileName: string,
  message: string,
  event: IpcMainInvokeEvent,
  history: Array<{ role: string; content: string }> | undefined,
  mainWindow: BrowserWindow | null,
  resumeSessionId?: string,
  attachments?: Attachment[],
): void {
  const port = getApiPortForProfile(profileName);
  if (!port) {
    event.sender.send("chat-error", { profileName, error: "员工未配置端口" });
    return;
  }

  const model = getModelFromProfile(profileName);
  const controller = new AbortController();
  _currentChatReqs[profileName] = controller;

  resetIdleTimer(profileName, mainWindow);

  const messages: Array<{ role: string; content: ChatContent }> = [];
  if (history && history.length > 0) {
    const historyToSend = [...history];
    const lastHistoryMessage = historyToSend[historyToSend.length - 1];
    if (
      lastHistoryMessage &&
      lastHistoryMessage.role === "user" &&
      lastHistoryMessage.content === message
    ) {
      historyToSend.pop();
    }
    for (const msg of historyToSend) {
      messages.push({
        role: msg.role === "agent" ? "assistant" : msg.role,
        content: msg.content,
      });
    }
  }
  const userContent = buildUserContent(message, attachments);
  messages.push({ role: "user", content: userContent });

  const body = JSON.stringify({
    model: model || "hermes-agent",
    messages,
    stream: true,
    ...(resumeSessionId ? { session_id: resumeSessionId } : {}),
  });

  let sessionId = "";
  let hasContent = false;
  let finished = false;
  let lastError = "";

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    delete _currentChatReqs[profileName];
    event.sender.send("employee-status-changed", {
      profileName,
      status: "online",
    });
    if (error) {
      event.sender.send("chat-error", { profileName, error });
    } else {
      event.sender.send("chat-done", {
        profileName,
        sessionId: sessionId || undefined,
      });
      const emp = listEmployees().find((e) => e.name === profileName);
      const displayName = emp ? emp.displayName : profileName;
      showChatNotification(displayName, "聊天完成", mainWindow);
    }
  }

  function processSseData(data: string): boolean {
    if (data === "[DONE]") {
      if (hasContent) {
        finish();
      } else if (lastError) {
        finish(lastError);
      } else {
        probeRealError();
      }
      return true;
    }
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        lastError = parsed.error.message || JSON.stringify(parsed.error);
        return false;
      }
      const choice = parsed.choices && parsed.choices[0];
      const delta = choice && choice.delta;
      if (parsed.usage) {
        event.sender.send("chat-usage", {
          profileName,
          promptTokens: parsed.usage.prompt_tokens || 0,
          completionTokens: parsed.usage.completion_tokens || 0,
          totalTokens: parsed.usage.total_tokens || 0,
        });
      }
      if (delta && delta.content) {
        hasContent = true;
        event.sender.send("chat-chunk", {
          profileName,
          chunk: delta.content,
        });
      }
      if (delta && delta.reasoning_content) {
        event.sender.send("chat-thinking", {
          profileName,
          chunk: delta.reasoning_content,
        });
      }
    } catch {
      /* skip malformed */
    }
    return false;
  }

  function probeRealError(): void {
    const probeBody = JSON.stringify({
      model: model || "hermes-agent",
      messages: [{ role: "user", content: message }],
      stream: false,
    });
    const probeReq = http.request(
      {
        hostname: DEFAULT_API_HOST,
        port,
        path: "/v1/chat/completions",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      },
      (res) => {
        let raw = "";
        res.on("data", (d: Buffer) => {
          raw += d.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const content =
              parsed.choices &&
              parsed.choices[0] &&
              parsed.choices[0].message &&
              parsed.choices[0].message.content;
            const errMsg = parsed.error && parsed.error.message;
            finish(
              content ||
                errMsg ||
                "未收到模型响应，请检查模型配置和 API Key",
            );
          } catch {
            finish("未收到模型响应，请检查模型配置和 API Key");
          }
        });
      },
    );
    probeReq.on("error", () => {
      finish("未收到模型响应，请检查模型配置和 API Key");
    });
    probeReq.write(probeBody);
    probeReq.end();
  }

  function processSseBlock(block: string): boolean {
    let eventType = "";
    let dataLine = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLine = line.slice(6);
      }
    }
    if (!dataLine) return false;
    if (eventType === "hermes.tool.progress") {
      try {
        const payload = JSON.parse(dataLine);
        const label = payload.label || payload.tool || "";
        const emoji = payload.emoji || "";
        event.sender.send("chat-tool-progress", {
          profileName,
          tool: emoji ? emoji + " " + label : label,
          toolName: payload.tool || payload.name || label,
          args: payload.args || payload.arguments || null,
          result: payload.result || null,
          error: payload.error || null,
          status: payload.status || "running",
        });
      } catch {
        /* skip */
      }
      return false;
    }
    if (eventType === "hermes.tool.start") {
      try {
        const payload = JSON.parse(dataLine);
        event.sender.send("chat-tool-start", {
          profileName,
          toolName: payload.tool || payload.name || "",
          args: payload.args || payload.arguments || null,
        });
      } catch {
        /* skip */
      }
      return false;
    }
    if (eventType === "hermes.tool.end") {
      try {
        const payload = JSON.parse(dataLine);
        event.sender.send("chat-tool-end", {
          profileName,
          toolName: payload.tool || payload.name || "",
          result: payload.result || null,
          error: payload.error || null,
        });
      } catch {
        /* skip */
      }
      return false;
    }
    if (eventType === "hermes.approval") {
      try {
        const payload = JSON.parse(dataLine);
        const approvalId =
          payload.id || payload.approval_id || Date.now().toString();
        _pendingApprovals[profileName + ":" + approvalId] = {
          profileName,
          approvalId,
          payload,
          ts: Date.now(),
        };
        event.sender.send("chat-approval-request", {
          profileName,
          approvalId,
          tool: payload.tool || payload.name || "",
          command:
            payload.command ||
            (payload.args ? JSON.stringify(payload.args) : ""),
          risk: payload.risk || "medium",
        });
      } catch {
        /* skip */
      }
      return false;
    }
    return processSseData(dataLine);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const req = http.request(
    {
      hostname: DEFAULT_API_HOST,
      port,
      path: "/v1/chat/completions",
      method: "POST",
      headers,
      signal: controller.signal,
      timeout: 120000,
    },
    (res) => {
      const sid = res.headers["x-hermes-session-id"];
      if (sid && typeof sid === "string") {
        sessionId = sid;
      }

      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d: Buffer) => {
          errBody += d.toString();
        });
        res.on("end", () => {
          try {
            const err = JSON.parse(errBody);
            finish(
              (err.error && err.error.message) ||
                "API 错误 " + res.statusCode,
            );
          } catch {
            finish(
              "API 服务器返回 " +
                res.statusCode +
                ": " +
                errBody.slice(0, 200),
            );
          }
        });
        return;
      }

      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (processSseBlock(part)) return;
        }
      });

      res.on("end", () => {
        if (buffer.trim()) {
          for (const part of buffer.split("\n\n")) {
            if (processSseBlock(part)) return;
          }
        }
        if (!hasContent && !lastError) {
          probeRealError();
          return;
        }
        finish(hasContent ? undefined : lastError);
      });

      res.on("error", (err: Error) => finish("流错误: " + err.message));
    },
  );

  req.on("error", (err: Error) => {
    if (err.name === "AbortError") return;
    finish("API 请求失败: " + err.message);
  });
  req.on("timeout", () => {
    req.destroy();
    finish("API 请求超时");
  });

  req.write(body);
  req.end();
}

export function sendMessageViaCli(
  profileName: string,
  message: string,
  event: IpcMainInvokeEvent,
  mainWindow: BrowserWindow | null,
  attachments?: Attachment[],
): ChildProcess {
  if (attachments && attachments.length > 0) {
    const inlineParts: string[] = [];
    for (const file of attachments) {
      if (file.kind === "text-file" && typeof file.text === "string") {
        inlineParts.push(
          `<file name="${escapeXmlAttr(file.name)}" mime="${escapeXmlAttr(file.mime || "text/plain")}">\n${file.text}\n</file>`,
        );
      } else if (file.kind === "path-ref" && file.path) {
        inlineParts.push(`[Attached file: ${file.path}]`);
      }
    }
    if (inlineParts.length > 0) {
      message = message.trim()
        ? `${message}\n\n${inlineParts.join("\n\n")}`
        : inlineParts.join("\n\n");
    }
  }

  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
  const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
  const args = [
    "chat",
    "-q",
    String(message).slice(0, 5000),
    "-Q",
    "--source",
    "desktop",
  ];
  if (profileName !== "default") args.push("-p", profileName);
  const model = getModelFromProfile(profileName);
  if (model) args.push("-m", model);

  const env = Object.assign({}, process.env, {
    HOME: os.homedir(),
    HERMES_HOME: HERMES_HOME,
    PYTHONUNBUFFERED: "1",
  });

  const hermesEnv = readHermesEnv(profileName);
  for (const [key, value] of Object.entries(hermesEnv)) {
    if (value && !env[key]) env[key] = value;
  }

  try {
    const configPath = path.join(getProfilePath(profileName), "config.yaml");
    if (fs.existsSync(configPath)) {
      const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
      const m = cfg.model as Record<string, unknown> | undefined;
      const provider = (m?.provider as string) || "";
      const providerInfo = PROVIDER_KEY_MAP[provider];
      const isCustomProvider = !providerInfo && provider !== "";

      if (providerInfo) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = (m?.base_url as string) || providerInfo.baseUrl || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        delete env.HERMES_INFERENCE_PROVIDER;
      } else if (provider === "custom" || isCustomProvider) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = (m?.base_url as string) || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        const keyFromEnv = hermesEnv.OPENAI_API_KEY || "";
        if (keyFromEnv) {
          env.OPENAI_API_KEY = keyFromEnv;
          env.CUSTOM_API_KEY = keyFromEnv;
        }
        env.CUSTOM_API_BASE_URL = env.OPENAI_BASE_URL || "";
        env.HERMES_INFERENCE_PROVIDER = "custom";
      }
    }
  } catch {
    /* fall through */
  }

  const proc = spawn(hermesBin, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let hasOutput = false;
  let capturedSessionId = "";
  let outputBuffer = "";
  const NOISE_PATTERNS = [
    /^[╭╰│╮╯─┌┐└┘┤├┬┴┼]/,
    /⚕\s*Hermes/,
  ];

  function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  }

  proc.stdout.on("data", (raw: Buffer) => {
    const text = stripAnsi(raw.toString());
    outputBuffer += text;
    const sidMatch = outputBuffer.match(/session_id:\s*(\S+)/);
    if (sidMatch) capturedSessionId = sidMatch[1];
    const cleaned = text.replace(/session_id:\s*\S+\n?/g, "");
    const lines = cleaned.split("\n");
    const result: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t && NOISE_PATTERNS.some((p) => p.test(t))) continue;
      result.push(line);
    }
    const output = result.join("\n");
    if (output) {
      hasOutput = true;
      event.sender.send("chat-chunk", { profileName, chunk: output });
    }
  });

  let stderrBuffer = "";
  proc.stderr.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    if (
      !text.trim() ||
      text.includes("UserWarning") ||
      text.includes("FutureWarning")
    )
      return;
    if (
      /❌|⚠️|Error|Traceback|error|failed|denied|unauthorized|invalid/i.test(
        text,
      )
    ) {
      hasOutput = true;
      event.sender.send("chat-chunk", { profileName, chunk: text });
    } else {
      stderrBuffer += text;
    }
  });

  proc.on("close", (code: number | null) => {
    event.sender.send("employee-status-changed", {
      profileName,
      status: "online",
    });
    if (code === 0 || hasOutput) {
      event.sender.send("chat-done", {
        profileName,
        sessionId: capturedSessionId || undefined,
      });
      const emp = listEmployees().find((e) => e.name === profileName);
      showChatNotification(
        emp ? emp.displayName : profileName,
        "聊天完成",
        mainWindow,
      );
    } else {
      const detail = stderrBuffer.trim();
      event.sender.send("chat-error", {
        profileName,
        error: detail
          ? "Hermes 退出码 " + code + ": " + detail
          : "Hermes 退出码 " + code + "，请检查模型配置和 API Key",
      });
    }
  });

  proc.on("error", (err: Error) => {
    event.sender.send("chat-error", { profileName, error: err.message });
  });

  return proc;
}

export function registerChatIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    "send-message",
    async (
      event: IpcMainInvokeEvent,
      profileName: string,
      message: string,
      history: Array<{ role: string; content: string }>,
      resumeSessionId?: string,
      attachments?: Attachment[],
    ) => {
      if (!validateProfileName(profileName) && profileName !== "default") {
        event.sender.send("chat-error", {
          profileName,
          error: "无效的员工名称",
        });
        return;
      }
      let status = await getEmployeeStatus(profileName);

      if (status === "idle" || status === "error") {
        const wakeResult = await wakeUpEmployee(profileName, getMainWindow());
        if (wakeResult.success && wakeResult.status === "online") {
          status = "online";
        }
      }

      if (status === "starting") {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          status = await getEmployeeStatus(profileName);
          if (status === "online" || status === "idle") break;
        }
      }

      if (status === "online") {
        sendMessageViaApi(
          profileName,
          message,
          event,
          history,
          getMainWindow(),
          resumeSessionId,
          attachments,
        );
        return;
      }

      sendMessageViaCli(profileName, message, event, getMainWindow(), attachments);
    },
  );

  ipcMain.handle(
    "stage-attachment",
    (_, sessionId: string, filename: string, base64Bytes: string) => {
      return stageAttachment(sessionId, filename, base64Bytes);
    },
  );

  ipcMain.handle("abort-chat", async (_, profileName: string) => {
    if (profileName && _currentChatReqs[profileName]) {
      _currentChatReqs[profileName].abort();
      delete _currentChatReqs[profileName];
    }
    return { success: true };
  });

  ipcMain.handle(
    "send-approval",
    async (
      _,
      profileName: string,
      approvalId: string,
      approved: boolean,
    ) => {
      const key = profileName + ":" + approvalId;
      const pending = _pendingApprovals[key];
      if (!pending) return { error: "审批请求不存在或已过期" };
      delete _pendingApprovals[key];
      const port = getApiPortForProfile(profileName);
      if (!port) return { error: "员工未配置端口" };
      const safeApprovalId = String(approvalId).replace(
        /[^a-zA-Z0-9_-]/g,
        "",
      );
      return new Promise((resolve) => {
        const body = JSON.stringify({ approved, approval_id: approvalId });
        const req = http.request(
          {
            hostname: DEFAULT_API_HOST,
            port,
            path: "/v1/approval/" + safeApprovalId,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
          },
          (res) => {
            res.resume();
            res.on("end", () => {
              resolve({ success: true, statusCode: res.statusCode });
            });
          },
        );
        req.on("error", (err: Error) => {
          resolve({ error: err.message });
        });
        req.on("timeout", () => {
          req.destroy();
          resolve({ error: "审批请求超时" });
        });
        req.write(body);
        req.end();
      });
    },
  );

  ipcMain.handle("health-check", async (_, profileName: string) => {
    if (!validateProfileName(profileName) && profileName !== "default")
      return { online: false };
    const port = getApiPortForProfile(profileName);
    if (!port) return { online: false };
    const { isApiServerReady } = await import("./config");
    const ready = await isApiServerReady(port);
    return { online: ready };
  });
}
