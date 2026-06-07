import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, FileText, Loader2, Paperclip, Plus, SendHorizonal, Sparkles, Square, Wifi, WifiOff, X } from "lucide-react";
import logoImg from "@renderer/assets/logo.png";
import { createLyHermesSessionId } from "../../../shared/session-id";
import {
  abortEmbedChat,
  checkHealth,
  clearEmbedSessionId,
  fetchAgentInfo,
  fetchSessionMessages,
  loadEmbedSessionId,
  saveEmbedSessionId,
  stageEmbedAttachment,
  streamChat,
  type EmbedAttachment,
  type EmbedAgentInfo,
} from "./embed-api";

type ConnectionState = "checking" | "online" | "offline";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolHint?: string;
  attachments?: EmbedAttachment[];
};

const MAX_ATTACHMENTS_PER_MESSAGE = 10;
const MAX_TEXT_ATTACHMENT_BYTES = 256 * 1024;
const MAX_PATH_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(["txt", "doc", "docx", "xls", "xlsx"]);
const EMBED_ATTACHMENT_ACCEPT = ".txt,.doc,.docx,.xls,.xlsx";

const SUGGESTIONS = [
  "你能帮我做什么？",
  "介绍一下你自己",
  "帮我整理一份待办清单",
];

function attachmentId(): string {
  return `att_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file, "utf-8");
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取失败"));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() || "" : result);
    };
    reader.readAsDataURL(file);
  });
}

function ConnectionBadge({ state, error }: { state: ConnectionState; error: string }): React.ReactElement {
  if (state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-dim)]">
        <Loader2 size={12} className="animate-spin" />
        连接中
      </span>
    );
  }
  if (state === "online") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(46,125,50,0.25)] bg-[rgba(46,125,50,0.1)] px-2.5 py-1 text-xs text-[var(--success)]">
        <Wifi size={12} />
        在线
      </span>
    );
  }
  return (
    <span
      className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full border border-[rgba(229,57,53,0.25)] bg-[rgba(229,57,53,0.08)] px-2.5 py-1 text-xs text-[var(--danger)]"
      title={error}
    >
      <WifiOff size={12} />
      离线
    </span>
  );
}

function MessageBubble({
  message,
  avatar,
  isStreaming,
  showThinking,
}: {
  message: Message;
  avatar: string;
  isStreaming?: boolean;
  showThinking: boolean;
}): React.ReactElement {
  const isUser = message.role === "user";
  const hasAttachments = !!message.attachments && message.attachments.length > 0;

  return (
    <div className={`flex gap-3 max-w-[92%] animate-fade-in ${isUser ? "self-end flex-row-reverse" : "self-start"}`}>
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base ${
          isUser
            ? "border border-[var(--border)] bg-[var(--bg-surface)]"
            : "border border-[rgba(124,106,239,0.2)] bg-[var(--accent-glow)]"
        }`}
      >
        {isUser ? "👤" : avatar}
      </div>
      <div className="min-w-0 flex-1">
        {message.toolHint && !isUser && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            <Loader2 size={11} className="animate-spin" />
            {message.toolHint}
          </div>
        )}
        {hasAttachments && (
          <div className={`mb-2 flex flex-wrap gap-1.5 ${isUser ? "justify-end" : ""}`}>
            {message.attachments!.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                title={`${attachment.name} (${formatBytes(attachment.size)})`}
              >
                <FileText size={12} />
                <span className="truncate">{attachment.name}</span>
              </span>
            ))}
          </div>
        )}
        <div
          className={`rounded-[var(--radius-lg)] px-4 py-3 text-sm leading-relaxed break-words ${
            isUser
              ? "rounded-br-[4px] bg-[var(--user-bubble)] text-[var(--user-bubble-text)] shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
              : "glass-panel rounded-bl-[4px] text-[var(--text-primary)]"
          }`}
        >
          {showThinking && message.thinking && !isUser && (
            <div className="mb-2 rounded-[var(--radius)] border border-[rgba(249,168,37,0.2)] bg-[rgba(249,168,37,0.06)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
              💭 {message.thinking}
            </div>
          )}
          {message.content ? (
            <div className={isUser ? "whitespace-pre-wrap" : "agent-markdown"}>
              {isUser ? message.content : <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-blink bg-[var(--accent)] align-text-bottom" />
              )}
            </div>
          ) : isStreaming ? (
            <span className="inline-block h-[1em] w-[2px] animate-blink bg-[var(--accent)] align-text-bottom" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EmbedChat(): React.ReactElement {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const agent = params.get("agent") || "default";
  const token = params.get("token") || "";

  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [error, setError] = useState("");
  const [agentInfo, setAgentInfo] = useState<EmbedAgentInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showThinking, setShowThinking] = useState(false);
  const [attachments, setAttachments] = useState<EmbedAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isPreparingAttachment, setIsPreparingAttachment] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const storedSessionId = token ? loadEmbedSessionId(agent, token) : null;
  const sessionIdRef = useRef<string>(storedSessionId || createLyHermesSessionId(agent));

  const displayName = agentInfo?.displayName || agent;
  const avatar = agentInfo?.avatar || "🧑‍💼";
  const role = agentInfo?.role || "AI 助手";
  const accentColor = agentInfo?.color || "#7c6aef";

  useEffect(() => {
    document.title = `${displayName} · Hermes`;
  }, [displayName]);

  useEffect(() => {
    if (!token) return;
    fetchAgentInfo(agent, token).then(setAgentInfo).catch(() => {});
  }, [agent, token]);

  useEffect(() => {
    if (!token) {
      setHistoryLoading(false);
      return;
    }
    const sessionId = loadEmbedSessionId(agent, token);
    if (!sessionId) {
      setHistoryLoading(false);
      return;
    }
    sessionIdRef.current = sessionId;
    fetchSessionMessages(agent, token, sessionId)
      .then((items) => {
        if (items.length > 0) setMessages(items);
      })
      .finally(() => setHistoryLoading(false));
  }, [agent, token]);

  useEffect(() => {
    checkHealth().then((result) => {
      if (result.ok) {
        setConnection("online");
        setError("");
      } else {
        setConnection("offline");
        setError(result.error || "服务不可用");
      }
    });
  }, []);

  useLayoutEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const handleFiles = useCallback(async (fileList: FileList | null): Promise<void> => {
    if (!fileList || !token || historyLoading) return;
    setAttachmentError("");
    setIsPreparingAttachment(true);
    const selected = Array.from(fileList);
    const next: EmbedAttachment[] = [];
    for (const file of selected) {
      const name = file.name || "untitled";
      const ext = getFileExtension(name);
      if (attachments.length + next.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        setAttachmentError(`最多上传 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件。`);
        break;
      }
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
        setAttachmentError("仅支持 Word、Excel、txt 文件。");
        continue;
      }
      try {
        if (ext === "txt") {
          if (file.size > MAX_TEXT_ATTACHMENT_BYTES) {
            setAttachmentError(`${name} 超过 ${formatBytes(MAX_TEXT_ATTACHMENT_BYTES)}。`);
            continue;
          }
          next.push({
            id: attachmentId(),
            kind: "text-file",
            name,
            mime: file.type || "text/plain",
            size: file.size,
            text: await readFileAsText(file),
          });
          continue;
        }
        if (file.size > MAX_PATH_ATTACHMENT_BYTES) {
          setAttachmentError(`${name} 超过 ${formatBytes(MAX_PATH_ATTACHMENT_BYTES)}。`);
          continue;
        }
        const base64 = await readFileAsBase64(file);
        const result = await stageEmbedAttachment(agent, token, sessionIdRef.current, name, base64);
        if (!result.path) {
          setAttachmentError(result.error || `${name} 上传失败。`);
          continue;
        }
        next.push({
          id: attachmentId(),
          kind: "path-ref",
          name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          path: result.path,
        });
      } catch {
        setAttachmentError(`${name} 读取失败。`);
      }
    }
    if (next.length > 0) {
      setAttachments((items) => [...items, ...next]);
    }
    setIsPreparingAttachment(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [agent, attachments.length, historyLoading, token]);

  const removeAttachment = useCallback((id: string): void => {
    setAttachments((items) => items.filter((item) => item.id !== id));
  }, []);

  const sendText = useCallback(async (text: string, attachmentsForSend: EmbedAttachment[] = []): Promise<void> => {
    const trimmed = text.trim();
    if ((!trimmed && attachmentsForSend.length === 0) || isSending || !token || connection !== "online") return;

    setInput("");
    setAttachments([]);
    setIsSending(true);
    saveEmbedSessionId(agent, token, sessionIdRef.current);
    const assistantId = `a_${Date.now()}`;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const history = messages
      .filter((item) => item.content.trim())
      .map((item) => ({ role: item.role, content: item.content }));

    setMessages((items) => [
      ...items,
      { id: `u_${Date.now()}`, role: "user", content: trimmed, attachments: attachmentsForSend },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    await streamChat(agent, token, trimmed, history, sessionIdRef.current, attachmentsForSend, (event) => {
      if (event.type === "chunk") {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: item.content + event.data.chunk, toolHint: undefined }
              : item,
          ),
        );
      }
      if (event.type === "thinking") {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, thinking: `${item.thinking || ""}${event.data.chunk}` }
              : item,
          ),
        );
      }
      if (event.type === "tool_progress") {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, toolHint: `正在使用 ${event.data.tool}...` }
              : item,
          ),
        );
      }
      if (event.type === "error") {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: event.data.error, toolHint: undefined }
              : item,
          ),
        );
        setIsSending(false);
      }
      if (event.type === "done") {
        if (event.data.sessionId) {
          sessionIdRef.current = event.data.sessionId;
          saveEmbedSessionId(agent, token, event.data.sessionId);
        } else {
          saveEmbedSessionId(agent, token, sessionIdRef.current);
        }
        setMessages((items) =>
          items.map((item) => (item.id === assistantId ? { ...item, toolHint: undefined } : item)),
        );
        setIsSending(false);
      }
    }, controller.signal).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setMessages((items) =>
        items.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: err instanceof Error ? err.message : "发送失败",
                toolHint: undefined,
              }
            : item,
        ),
      );
      setIsSending(false);
    });
    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null;
    }
  }, [agent, connection, isSending, messages, token]);

  const handleSend = (): void => {
    void sendText(input, attachments);
  };

  const handleStop = useCallback(async (): Promise<void> => {
    if (!isSending) return;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsSending(false);
    setMessages((items) => {
      const next = [...items];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = {
          ...last,
          content: last.content || "已停止。",
          toolHint: undefined,
        };
      }
      return next;
    });
    await abortEmbedChat(agent, token);
  }, [agent, isSending, token]);

  const handleNewSession = useCallback(async (): Promise<void> => {
    if (isSending) await handleStop();
    sessionIdRef.current = createLyHermesSessionId(agent);
    clearEmbedSessionId(agent, token);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setAttachmentError("");
    inputRef.current?.focus();
  }, [agent, handleStop, isSending, token]);

  const composerDisabled = !token || connection !== "online" || isSending || historyLoading || isPreparingAttachment;
  const canSend = !!input.trim() || attachments.length > 0;

  return (
    <main className="embed-bg flex h-full min-h-screen flex-col">
      <header className="glass-panel sticky top-0 z-10 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]"
              style={{ boxShadow: `0 0 0 1px ${accentColor}22, 0 8px 24px ${accentColor}18` }}
            >
              <img src={logoImg} alt="" className="h-8 w-8 rounded-xl object-cover" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{displayName}</div>
              <div className="truncate text-xs text-[var(--text-secondary)]">{role}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-pressed={showThinking}
              title={showThinking ? "隐藏思考模式" : "显示思考模式"}
              onClick={() => setShowThinking((value) => !value)}
              className={`flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 text-xs transition-colors ${
                showThinking
                  ? "border-[rgba(249,168,37,0.35)] bg-[rgba(249,168,37,0.12)] text-[var(--warning)]"
                  : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Brain size={14} />
              <span className="hidden sm:inline">思考</span>
            </button>
            <button
              type="button"
              title="新建会话"
              disabled={!token || historyLoading}
              onClick={() => void handleNewSession()}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="新建会话"
            >
              <Plus size={16} />
            </button>
            <ConnectionBadge state={connection} error={error} />
          </div>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {!token ? (
            <div className="mx-auto mt-[12vh] max-w-md animate-fade-in text-center">
              <div className="glass-panel rounded-[var(--radius-lg)] p-8">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(229,57,53,0.1)] text-2xl">
                  🔒
                </div>
                <h1 className="text-lg font-semibold text-[var(--text-primary)]">无法访问</h1>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  链接缺少有效 token，请从 Hermes 员工管理页重新复制 Web 访问地址。
                </p>
              </div>
            </div>
          ) : historyLoading ? (
            <div className="mx-auto mt-[12vh] flex justify-center animate-fade-in">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Loader2 size={16} className="animate-spin" />
                正在恢复对话...
              </span>
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto mt-[8vh] w-full max-w-lg animate-fade-in text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] text-3xl"
                style={{ background: `linear-gradient(135deg, ${accentColor}22, transparent)` }}
              >
                {avatar}
              </div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">你好，我是 {displayName}</h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                有什么我可以帮你的？可以直接提问，或试试下面的快捷问题。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={composerDisabled}
                    onClick={() => void sendText(item, [])}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-glass)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  avatar={avatar}
                  isStreaming={isSending && index === messages.length - 1 && message.role === "assistant"}
                  showThinking={showThinking}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </section>

      <footer className="glass-panel border-t border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="mx-auto max-w-3xl">
          {(attachments.length > 0 || attachmentError) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                  title={`${attachment.name} (${formatBytes(attachment.size)})`}
                >
                  <FileText size={12} />
                  <span className="max-w-[180px] truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="ml-0.5 text-[var(--text-dim)] transition-colors hover:text-[var(--danger)]"
                    aria-label={`移除 ${attachment.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {attachmentError && <span className="text-xs text-[var(--danger)]">{attachmentError}</span>}
            </div>
          )}
        </div>
        <div className="embed-composer mx-auto flex max-w-3xl items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={EMBED_ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <button
            type="button"
            disabled={composerDisabled}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="上传附件"
            title="上传附件"
          >
            {isPreparingAttachment ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
          </button>
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              disabled={composerDisabled}
              placeholder={connection === "online" ? `向 ${displayName} 提问...` : connection === "checking" ? "正在连接服务..." : "服务未连接"}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              className="w-full resize-none rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 pr-11 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55"
            />
            <Sparkles size={14} className="pointer-events-none absolute right-3.5 top-3.5 text-[var(--text-dim)]" />
          </div>
          <button
            type="button"
            disabled={!isSending && (composerDisabled || !canSend)}
            onClick={isSending ? () => void handleStop() : handleSend}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 ${
              isSending ? "bg-[var(--danger)]" : ""
            }`}
            style={isSending ? undefined : { background: "var(--accent-gradient)" }}
            aria-label={isSending ? "停止" : "发送"}
            title={isSending ? "停止工作" : "发送"}
          >
            {isSending ? <Square size={16} /> : <SendHorizonal size={18} />}
          </button>
        </div>
        <div className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-[var(--text-dim)]">
          Powered by 落云 Hermes
        </div>
      </footer>
    </main>
  );
}
