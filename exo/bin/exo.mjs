#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

if (!existsSync(cli)) {
  console.error(
    "exo: dist/cli.js missing — run `pnpm build` in the exo package first",
  );
  process.exit(1);
}

await import(pathToFileURL(cli).href);
