import fs from "node:fs";
import path from "node:path";
import { isExcalidrawPath, resolveExcalidrawPath } from "./paths.js";

const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  ".exo",
  "coverage",
]);

export type ExpandOptions = {
  recursive?: boolean;
  cwd?: string;
};

/**
 * Expand CLI path args: files stay files; directories become matching
 * .excalidraw / .excalidraw.json paths (optionally recursive).
 */
export function expandInputPaths(
  inputs: readonly string[],
  opts: ExpandOptions = {},
): string[] {
  const cwd = opts.cwd ?? process.cwd();
  const recursive = opts.recursive ?? false;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const resolved = path.resolve(cwd, input);
    if (!fs.existsSync(resolved)) {
      // Missing path: treat as a drawing to create, same as a direct file open.
      const file = resolveExcalidrawPath(input, cwd);
      push(file);
      continue;
    }

    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      push(resolveExcalidrawPath(resolved, cwd));
      continue;
    }
    if (stat.isDirectory()) {
      for (const file of listExcalidrawInDir(resolved, recursive)) {
        push(file);
      }
      continue;
    }
    throw new Error(`not a file or directory: ${input}`);
  }

  return out;

  function push(absPath: string): void {
    if (seen.has(absPath)) return;
    seen.add(absPath);
    out.push(absPath);
  }
}

export function listExcalidrawInDir(
  dir: string,
  recursive: boolean,
): string[] {
  const found: string[] = [];
  walk(dir, recursive, found);
  found.sort((a, b) => a.localeCompare(b));
  return found;
}

function walk(dir: string, recursive: boolean, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!recursive) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walk(full, true, out);
      continue;
    }
    if (entry.isFile() && isExcalidrawPath(full)) {
      out.push(full);
    }
  }
}
