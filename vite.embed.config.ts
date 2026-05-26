import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: resolve("src/web/embed"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
    },
  },
  build: {
    outDir: resolve("dist-web/embed"),
    emptyOutDir: true,
  },
});
