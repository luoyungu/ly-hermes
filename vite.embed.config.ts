import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: resolve("src/web/embed"),
  plugins: [react()],
  build: {
    outDir: resolve("dist-web/embed"),
    emptyOutDir: true,
  },
});
