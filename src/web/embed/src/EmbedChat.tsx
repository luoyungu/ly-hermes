import { useEffect, useState } from "react";
import { checkHealth } from "./embed-api";

type ConnectionState = "checking" | "online" | "offline";

export default function EmbedChat(): React.ReactElement {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [error, setError] = useState("");

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
        <div className="empty-state">智能体对话入口已就绪，下一步接入 chat API 和 SSE 事件流。</div>
      </section>
      <footer className="embed-composer">
        <input disabled placeholder="消息输入将在 chat-service 接入后启用" />
        <button disabled>发送</button>
      </footer>
    </main>
  );
}
