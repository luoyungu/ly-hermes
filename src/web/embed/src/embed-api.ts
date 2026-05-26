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
  onEvent: (event: EmbedChatEvent) => void,
): Promise<void> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent, token, message, history }),
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
