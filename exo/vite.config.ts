import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve("web"),
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      // Shared pure helpers live under src/ (also covered by node tests).
      "@exo": path.resolve("src"),
    },
  },
  build: {
    outDir: path.resolve("dist/client"),
    emptyOutDir: true,
  },
  server: {
    fs: { allow: [path.resolve("."), path.resolve("src")] },
    proxy: {
      "/api": "http://127.0.0.1:6285",
    },
  },
});

