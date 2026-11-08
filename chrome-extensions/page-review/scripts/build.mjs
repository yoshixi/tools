import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await build({
  entryPoints: { content: "src/content.ts", background: "src/background.ts" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  loader: { ".css": "text" },
  logLevel: "info",
});

await cp("manifest.json", "dist/manifest.json");
