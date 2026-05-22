import { useEffect, useState } from "react";
import { checkHealth, streamChat } from "./embed-api";

type ConnectionState = "checking" | "online" | "offline";
type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

export default function EmbedChat(): React.ReactElement {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

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

  const handleSend = async (): Promise<void> => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    setIsSending(true);
    const assistantId = `a_${Date.now()}`;
    setMessages((items) => [
      ...items,
      { id: `u_${Date.now()}`, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    await streamChat(text, (event) => {
      if (event.type === "chunk" || event.type === "thinking") {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: item.content + event.data.chunk }
              : item,
          ),
        );
      }
      if (event.type === "tool_progress") {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: `${item.content}\n\n[${event.data.tool}]` }
              : item,
          ),
        );
      }
      if (event.type === "error") {
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: event.data.error }
              : item,
          ),
        );
        setIsSending(false);
      }
      if (event.type === "done") setIsSending(false);
    }).catch((err: unknown) => {
      setMessages((items) =>
        items.map((item) =>
          item.id === assistantId
            ? { ...item, content: err instanceof Error ? err.message : "发送失败" }
            : item,
        ),
      );
      setIsSending(false);
    });
  };

  return (
    <main className="embed-shell">
      <header className="embed-header">
        <div>
          <div className="embed-title">Hermes Assistant</div>
          <div className="embed-subtitle">
            {connection === "checking" ? "正在连接服务..." : connection === "online" ? "已连接" : error}
          </div>
        </div>
      </header>
      <section className="embed-body">
        {messages.length === 0 ? (
          <div className="empty-state">输入问题后，助手会通过服务器端 Hermes gateway 流式回复。</div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <div key={message.id} className={`message message-${message.role}`}>
                {message.content || (message.role === "assistant" ? "..." : "")}
              </div>
            ))}
          </div>
        )}
      </section>
      <footer className="embed-composer">
        <input
          value={input}
          disabled={connection !== "online" || isSending}
          placeholder={connection === "online" ? "询问智能体..." : "服务未连接"}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSend().catch(() => {});
          }}
        />
        <button disabled={connection !== "online" || isSending || !input.trim()} onClick={() => handleSend()}>
          发送
        </button>
      </footer>
    </main>
  );
}
