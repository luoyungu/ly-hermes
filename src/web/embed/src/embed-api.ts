export interface HealthResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

export interface EmbedAgentInfo {
  name: string;
  displayName: string;
  role: string;
  avatar: string;
  color: string;
}

export type EmbedChatEvent =
  | { type: "chunk"; data: { profileName: string; chunk: string } }
  | { type: "thinking"; data: { profileName: string; chunk: string } }
  | { type: "tool_progress"; data: { profileName: string; tool: string; status?: string } }
  | { type: "done"; data: { profileName: string; sessionId?: string } }
  | { type: "error"; data: { profileName: string; error: string } };

export type EmbedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};

function embedStorageKey(agent: string, token: string): string {
  return `lyhermes:embed:${agent}:${token}`;
}

export function loadEmbedSessionId(agent: string, token: string): string | null {
  if (!token) return null;
  try {
    return localStorage.getItem(`${embedStorageKey(agent, token)}:sessionId`);
  } catch {
    return null;
  }
}

export function saveEmbedSessionId(agent: string, token: string, sessionId: string): void {
  if (!token || !sessionId) return;
  try {
    localStorage.setItem(`${embedStorageKey(agent, token)}:sessionId`, sessionId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function parseEmbedHistoryMessages(
  raw: Array<Record<string, unknown>>,
): EmbedMessage[] {
  const messages: EmbedMessage[] = [];
  for (const item of raw) {
    if (item.role !== "user" && item.role !== "assistant") continue;
    const content = String(item.content || "").trim();
    const thinking = item.reasoning_content ? String(item.reasoning_content).trim() : "";
    if (!content && !thinking) continue;
    messages.push({
      id: `history-${item.id ?? messages.length}`,
      role: item.role as "user" | "assistant",
      content,
      thinking: thinking || undefined,
    });
  }
  return messages;
}

export async function fetchSessionMessages(
  agent: string,
  token: string,
  sessionId: string,
): Promise<EmbedMessage[]> {
  try {
    const params = new URLSearchParams({ agent, token, sessionId });
    const response = await fetch(`/api/embed/messages?${params}`);
    if (!response.ok) return [];
    const payload = await response.json() as { messages?: Array<Record<string, unknown>> };
    return parseEmbedHistoryMessages(payload.messages || []);
  } catch {
    return [];
  }
}

export async function checkHealth(): Promise<HealthResult> {
  try {
    const response = await fetch("/api/health", { credentials: "include" });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return await response.json() as HealthResult;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function fetchAgentInfo(agent: string, token: string): Promise<EmbedAgentInfo | null> {
  try {
    const params = new URLSearchParams({ agent, token });
    const response = await fetch(`/api/embed/info?${params}`);
    if (!response.ok) return null;
    return await response.json() as EmbedAgentInfo;
  } catch {
    return null;
  }
}

function parseSseBlock(block: string): EmbedChatEvent | null {
  let type = "";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) type = line.slice(7).trim();
    if (line.startsWith("data: ")) data = line.slice(6);
  }
  if (!type || !data) return null;
  try {
    return { type, data: JSON.parse(data) } as EmbedChatEvent;
  } catch {
    return null;
  }
}

export async function streamChat(
  agent: string,
  token: string,
  message: string,
  history: Array<{ role: string; content: string }>,
  resumeSessionId: string,
  onEvent: (event: EmbedChatEvent) => void,
): Promise<void> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent, token, message, history, resumeSessionId }),
  });
  if (!response.ok || !response.body) {
    onEvent({
      type: "error",
      data: { profileName: agent, error: `HTTP ${response.status}` },
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const event = parseSseBlock(part);
      if (event) onEvent(event);
    }
  }
  if (buffer.trim()) {
    const event = parseSseBlock(buffer);
    if (event) onEvent(event);
  }
}
