export type ChatEvent =
  | { type: "employee_status"; data: { profileName: string; status: string } }
  | { type: "chunk"; data: { profileName: string; chunk: string } }
  | { type: "thinking"; data: { profileName: string; chunk: string } }
  | { type: "tool_start"; data: { profileName: string; toolName: string; args?: unknown | null } }
  | { type: "tool_end"; data: { profileName: string; toolName: string; result?: unknown | null; error?: unknown | null } }
  | { type: "tool_progress"; data: { profileName: string; tool: string; toolName?: string; args?: unknown | null; status?: string; result?: unknown | null; error?: unknown | null } }
  | { type: "approval_request"; data: { profileName: string; approvalId: string; tool: string; command: string; risk: string } }
  | { type: "usage"; data: { profileName: string; promptTokens: number; completionTokens: number; totalTokens: number; cost?: number } }
  | { type: "done"; data: { profileName: string; sessionId?: string } }
  | { type: "error"; data: { profileName: string; error: string } };

export type ChatEventSink = (event: ChatEvent) => void;
