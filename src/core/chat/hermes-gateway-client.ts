import http from "http";
import type { ChatEventSink } from "./events";
import { createLyHermesSessionId } from "../../shared/session-id";

type ChatContent = string | Array<{ type: "text"; text: string }>;

export interface HermesGatewayChatInput {
  profileName: string;
  message: string;
  history?: Array<{ role: string; content: string }>;
  resumeSessionId?: string;
  model?: string;
  host?: string;
  port: number;
  apiServerKey?: string;
}

function buildMessages(input: HermesGatewayChatInput): Array<{ role: string; content: ChatContent }> {
  const messages: Array<{ role: string; content: ChatContent }> = [];
  const history = input.history || [];
  if (history.length > 0) {
    const historyToSend = [...history];
    const lastHistoryMessage = historyToSend[historyToSend.length - 1];
    if (
      lastHistoryMessage &&
      lastHistoryMessage.role === "user" &&
      lastHistoryMessage.content === input.message
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
  messages.push({ role: "user", content: input.message });
  return messages;
}

export function streamHermesGatewayChat(
  input: HermesGatewayChatInput,
  emit: ChatEventSink,
): void {
  const profileName = input.profileName || "default";
  const host = input.host || "127.0.0.1";
  const body = JSON.stringify({
    model: input.model || "hermes-agent",
    messages: buildMessages(input),
    stream: true,
  });
  const headers: Record<string, string | number> = {
    "Content-Type": "application/json",
  };
  if (input.apiServerKey) {
    headers.Authorization = `Bearer ${input.apiServerKey}`;
  }
  const sessionKey = input.resumeSessionId?.trim() || createLyHermesSessionId(profileName);
  headers["X-Hermes-Session-Id"] = sessionKey;
  headers["X-Hermes-Session-Key"] = `lyhermes:${profileName}`;

  let sessionId = "";
  let hasContent = false;
  let finished = false;
  let lastError = "";

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    if (error) {
      emit({ type: "error", data: { profileName, error } });
      return;
    }
    emit({ type: "done", data: { profileName, sessionId: sessionId || undefined } });
  }

  function processSseData(data: string): boolean {
    if (data === "[DONE]") {
      finish(hasContent ? undefined : lastError || "未收到模型响应");
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
        emit({
          type: "usage",
          data: {
            profileName,
            promptTokens: parsed.usage.prompt_tokens || 0,
            completionTokens: parsed.usage.completion_tokens || 0,
            totalTokens: parsed.usage.total_tokens || 0,
          },
        });
      }
      if (delta?.content) {
        hasContent = true;
        emit({ type: "chunk", data: { profileName, chunk: delta.content } });
      }
      if (delta?.reasoning_content) {
        emit({ type: "thinking", data: { profileName, chunk: delta.reasoning_content } });
      }
    } catch {
      /* ignore malformed SSE payload */
    }
    return false;
  }

  function processSseBlock(block: string): boolean {
    let eventType = "";
    let dataLine = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7).trim();
      if (line.startsWith("data: ")) dataLine = line.slice(6);
    }
    if (!dataLine) return false;
    if (eventType === "hermes.tool.progress") {
      try {
        const payload = JSON.parse(dataLine);
        const label = payload.label || payload.tool || "";
        const emoji = payload.emoji || "";
        emit({
          type: "tool_progress",
          data: {
            profileName,
            tool: emoji ? emoji + " " + label : label,
            toolName: payload.tool || payload.name || label,
            args: payload.args || payload.arguments || null,
            result: payload.result || null,
            error: payload.error || null,
            status: payload.status || "running",
          },
        });
      } catch {
        /* ignore malformed tool payload */
      }
      return false;
    }
    return processSseData(dataLine);
  }

  const req = http.request(
    {
      hostname: host,
      port: input.port,
      path: "/v1/chat/completions",
      method: "POST",
      headers,
      timeout: 120000,
    },
    (res) => {
      const sid = res.headers["x-hermes-session-id"];
      if (sid && typeof sid === "string") sessionId = sid;
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d: Buffer) => { errBody += d.toString(); });
        res.on("end", () => {
          finish(`API 服务器返回 ${res.statusCode}: ${errBody.slice(0, 200)}`);
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
        finish(hasContent ? undefined : lastError || "未收到模型响应");
      });
      res.on("error", (error: Error) => finish("流错误: " + error.message));
    },
  );

  req.on("error", (error: Error) => finish("API 请求失败: " + error.message));
  req.on("timeout", () => {
    req.destroy();
    finish("API 请求超时");
  });
  req.write(body);
  req.end();
}
