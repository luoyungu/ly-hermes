import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, SendHorizonal, Sparkles, Wifi, WifiOff } from "lucide-react";
import logoImg from "@renderer/assets/logo.png";
import { checkHealth, fetchAgentInfo, streamChat, type EmbedAgentInfo } from "./embed-api";

type ConnectionState = "checking" | "online" | "offline";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolHint?: string;
};

const SUGGESTIONS = [
  "你能帮我做什么？",
  "介绍一下你自己",
  "帮我整理一份待办清单",
];

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
}: {
  message: Message;
  avatar: string;
  isStreaming?: boolean;
}): React.ReactElement {
  const isUser = message.role === "user";

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
        <div
          className={`rounded-[var(--radius-lg)] px-4 py-3 text-sm leading-relaxed break-words ${
            isUser
              ? "rounded-br-[4px] bg-[var(--user-bubble)] text-[var(--user-bubble-text)] shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
              : "glass-panel rounded-bl-[4px] text-[var(--text-primary)]"
          }`}
        >
          {message.thinking && !isUser && (
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const sendText = useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !token || connection !== "online") return;

    setInput("");
    setIsSending(true);
    const assistantId = `a_${Date.now()}`;
    const history = messages
      .filter((item) => item.content.trim())
      .map((item) => ({ role: item.role, content: item.content }));

    setMessages((items) => [
      ...items,
      { id: `u_${Date.now()}`, role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    await streamChat(agent, token, trimmed, history, (event) => {
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
        setMessages((items) =>
          items.map((item) => (item.id === assistantId ? { ...item, toolHint: undefined } : item)),
        );
        setIsSending(false);
      }
    }).catch((err: unknown) => {
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
  }, [agent, connection, isSending, messages, token]);

  const handleSend = (): void => {
    void sendText(input);
  };

  const composerDisabled = !token || connection !== "online" || isSending;

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
          <ConnectionBadge state={connection} error={error} />
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
                    onClick={() => void sendText(item)}
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
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </section>

      <footer className="glass-panel border-t border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="embed-composer mx-auto flex max-w-3xl items-end gap-2">
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
            disabled={composerDisabled || !input.trim()}
            onClick={handleSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: "var(--accent-gradient)" }}
            aria-label="发送"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizonal size={18} />}
          </button>
        </div>
        <div className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-[var(--text-dim)]">
          Powered by 落云 Hermes
        </div>
      </footer>
    </main>
  );
}
