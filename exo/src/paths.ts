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

/** True when filePath is the workspace root or a path inside it. */
export function isInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedRoot = path.resolve(workspaceRoot);
  const rel = path.relative(resolvedRoot, resolvedFile);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

export function assertInsideWorkspace(
  filePath: string,
  workspaceRoot: string,
): void {
  if (!isInsideWorkspace(filePath, workspaceRoot)) {
    throw new Error(
      `file is outside the workspace (${workspaceRoot}): ${filePath}`,
    );
  }
}

function splitExcalidrawName(fileName: string): { stem: string; suffix: string } {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".excalidraw.json")) {
    return {
      stem: fileName.slice(0, -".excalidraw.json".length),
      suffix: ".excalidraw.json",
    };
  }
  if (lower.endsWith(".excalidraw")) {
    return {
      stem: fileName.slice(0, -".excalidraw".length),
      suffix: ".excalidraw",
    };
  }
  return { stem: fileName, suffix: ".excalidraw" };
}

/**
 * Next free path for a duplicate, Finder-style:
 * sketch.excalidraw → sketch copy.excalidraw → sketch copy 2.excalidraw
 */
export function nextAvailableCopyPath(
  sourcePath: string,
  existsSync: (candidate: string) => boolean,
): string {
  const dir = path.dirname(sourcePath);
  const { stem, suffix } = splitExcalidrawName(path.basename(sourcePath));
  const baseMatch = /^(.*?)(?: copy(?: (\d+))?)?$/.exec(stem);
  const base = (baseMatch?.[1] || stem).trim() || "drawing";

  for (let n = 1; n < 10_000; n++) {
    const label = n === 1 ? `${base} copy` : `${base} copy ${n}`;
    const candidate = path.join(dir, `${label}${suffix}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error("could not find a free copy name");
}
