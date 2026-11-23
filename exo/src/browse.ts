import fs from "node:fs";
import path from "node:path";
import { isExcalidrawPath } from "./paths.js";

export type BrowseEntry = {
  name: string;
  path: string;
  kind: "dir" | "file";
};

export type BrowseResult = {
  dir: string;
  parent: string | null;
  entries: BrowseEntry[];
};

/** List one directory: subfolders + .excalidraw files only. */
export function listBrowseDir(dirInput: string): BrowseResult {
  const dir = path.resolve(dirInput);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`not a directory: ${dir}`);
  }

  const parentDir = path.dirname(dir);
  const parent = parentDir !== dir ? parentDir : null;

  const names = fs.readdirSync(dir);
  const entries: BrowseEntry[] = [];

  for (const name of names) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      entries.push({ name, path: full, kind: "dir" });
    } else if (stat.isFile() && isExcalidrawPath(full)) {
      entries.push({ name, path: full, kind: "file" });
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { dir, parent, entries };
}
