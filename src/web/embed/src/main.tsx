import React from "react";
import { createRoot } from "react-dom/client";
import EmbedChat from "./EmbedChat";
import "./style.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <EmbedChat />
  </React.StrictMode>,
);
