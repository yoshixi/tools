import fs from "node:fs";
import path from "node:path";

/**
 * Workspace root for a CLI invocation:
 * - a single directory argument becomes the workspace
 * - otherwise the process cwd is the workspace
 */
export function inferWorkspace(
  pathArgs: readonly string[],
  cwd = process.cwd(),
): string {
  if (pathArgs.length === 1) {
    const only = path.resolve(cwd, pathArgs[0]!);
    if (fs.existsSync(only) && fs.statSync(only).isDirectory()) {
      return only;
    }
  }
  return path.resolve(cwd);
}
