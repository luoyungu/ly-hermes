import type { WebContents } from "electron";
import type { ChatEvent } from "../../core/chat";

export function sendChatEventToWebContents(sender: WebContents, event: ChatEvent): void {
  switch (event.type) {
    case "employee_status":
      sender.send("employee-status-changed", event.data);
      return;
    case "chunk":
      sender.send("chat-chunk", event.data);
      return;
    case "thinking":
      sender.send("chat-thinking", event.data);
      return;
    case "tool_start":
      sender.send("chat-tool-start", event.data);
      return;
    case "tool_end":
      sender.send("chat-tool-end", event.data);
      return;
    case "tool_progress":
      sender.send("chat-tool-progress", event.data);
      return;
    case "approval_request":
      sender.send("chat-approval-request", event.data);
      return;
    case "usage":
      sender.send("chat-usage", event.data);
      return;
    case "done":
      sender.send("chat-done", event.data);
      return;
    case "error":
      sender.send("chat-error", event.data);
      return;
  }
}
