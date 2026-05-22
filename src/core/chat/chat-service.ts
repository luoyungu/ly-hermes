import type { Attachment } from "../../shared/attachments";
import type { ChatEventSink } from "./events";

export interface ChatMessageInput {
  profileName: string;
  message: string;
  history?: Array<{ role: string; content: string }>;
  resumeSessionId?: string;
  attachments?: Attachment[];
}

export interface ChatRuntimePort {
  validateProfileName(profileName: string): boolean;
  getEmployeeStatus(profileName: string): Promise<string>;
  wakeUpEmployee(profileName: string): Promise<{ success: boolean; status?: string }>;
  sendOnline(input: ChatMessageInput, emit: ChatEventSink): void;
  sendFallback(input: ChatMessageInput, emit: ChatEventSink): void;
}

export class ChatService {
  constructor(private readonly runtime: ChatRuntimePort) {}

  async sendMessage(input: ChatMessageInput, emit: ChatEventSink): Promise<void> {
    const profileName = input.profileName || "default";
    if (!this.runtime.validateProfileName(profileName) && profileName !== "default") {
      emit({ type: "error", data: { profileName, error: "无效的员工名称" } });
      return;
    }

    let status = await this.runtime.getEmployeeStatus(profileName);
    if (status === "idle" || status === "error") {
      const wakeResult = await this.runtime.wakeUpEmployee(profileName);
      if (wakeResult.success && wakeResult.status === "online") {
        status = "online";
      }
    }

    if (status === "starting") {
      for (let i = 0; i < 30; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        status = await this.runtime.getEmployeeStatus(profileName);
        if (status === "online" || status === "idle") break;
      }
    }

    const normalizedInput = { ...input, profileName };
    if (status === "online") {
      this.runtime.sendOnline(normalizedInput, emit);
      return;
    }

    this.runtime.sendFallback(normalizedInput, emit);
  }
}
