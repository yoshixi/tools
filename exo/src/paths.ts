import path from "node:path";

const EXCALIDRAW_SUFFIXES = [".excalidraw", ".excalidraw.json"] as const;

export function isExcalidrawPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return EXCALIDRAW_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function resolveExcalidrawPath(input: string, cwd = process.cwd()): string {
  const resolved = path.resolve(cwd, input);
  if (!isExcalidrawPath(resolved)) {
    throw new Error(
      `not an Excalidraw file (expected .excalidraw or .excalidraw.json): ${input}`,
    );
  }
  return resolved;
}

/** Turn a bare name or relative path into a .excalidraw path under dir. */
export function resolveNewDrawingPath(
  nameOrPath: string,
  dir: string,
): string {
  const trimmed = nameOrPath.trim();
  if (!trimmed) throw new Error("file name required");
  const base = path.basename(trimmed);
  if (base !== trimmed) {
    throw new Error("use a file name only (no directories); pick the folder above");
  }
  if (base === "." || base === "..") {
    throw new Error("invalid file name");
  }
  const withExt = isExcalidrawPath(base) ? base : `${base}.excalidraw`;
  return path.resolve(dir, withExt);
}

export function displayName(absPath: string): string {
  return path.basename(absPath);
}
