import { createHash } from "node:crypto";
import { displayName } from "./paths.js";

export type OpenFile = {
  id: string;
  path: string;
  name: string;
};

export function fileIdForPath(absPath: string): string {
  return createHash("sha1").update(absPath).digest("hex").slice(0, 12);
}

export function toOpenFile(absPath: string): OpenFile {
  return {
    id: fileIdForPath(absPath),
    path: absPath,
    name: displayName(absPath),
  };
}

/** Pure merge: existing entries keep order; new paths append. */
export function mergeFiles(
  existing: readonly OpenFile[],
  incomingPaths: readonly string[],
): OpenFile[] {
  const byId = new Map(existing.map((f) => [f.id, f]));
  const next = [...existing];
  for (const absPath of incomingPaths) {
    const file = toOpenFile(absPath);
    if (!byId.has(file.id)) {
      byId.set(file.id, file);
      next.push(file);
    }
  }
  return next;
}
