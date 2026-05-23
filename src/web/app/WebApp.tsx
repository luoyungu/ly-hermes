import { useEffect, useMemo, useState } from "react";
import { createWebHermesAPI } from "../../shared/hermes-api/web-hermes-api";
import { HermesAPIProvider } from "@renderer/components/HermesAPIProvider";
import { ThemeProvider } from "@renderer/components/ThemeProvider";
import WebLogin from "./WebLogin";
import App from "@renderer/App";

export default function WebApp(): React.ReactElement {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const webApi = useMemo(
    () => createWebHermesAPI(window.location.origin) as unknown as typeof window.hermesAPI,
    [],
  );

  useEffect(() => {
    window.hermesAPI = webApi;
    setReady(true);
    void (webApi as { resumeSession?: () => Promise<{ id: string } | null> }).resumeSession?.().then((user) => {
      if (user) setAuthed(true);
    }).catch(() => {});
  }, [webApi]);

  if (!ready) return <div className="h-screen bg-[var(--bg-primary)]" />;

  if (!authed) {
    return (
      <ThemeProvider>
        <HermesAPIProvider api={webApi}>
          <WebLogin onSuccess={() => setAuthed(true)} />
        </HermesAPIProvider>
      </ThemeProvider>
    );
  }

  return (
    <HermesAPIProvider api={webApi}>
      <App />
    </HermesAPIProvider>
  );
}
