import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve("web"),
  plugins: [react()],
  base: "/",
  build: {
    outDir: path.resolve("dist/client"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:6285",
    },
  },
});
