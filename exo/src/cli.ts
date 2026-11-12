import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.js";
import { openBrowser } from "./browser.js";
import { expandInputPaths } from "./expand.js";
import { fileIdForPath } from "./registry.js";
import { startServer } from "./server.js";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  baseUrl,
  clearServerState,
  listServerStates,
  readServerState,
} from "./state.js";

const VERSION = "0.1.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function printHelp(): void {
  console.log(`exo — local Excalidraw editor

Usage:
  exo [options] [file-or-dir ...]

Options:
  -p, --port <n>       Port (default ${DEFAULT_PORT})
  -b, --bind <addr>    Bind address (default ${DEFAULT_HOST})
  -f, --foreground     Run server in the foreground
  -R, --recursive      Recurse into subdirectories when a directory is given
      --status         Show running exo servers
      --shutdown       Shut down the server on the given port
      --open / --no-open  Open browser (default: open)
  -h, --help           Show help
  -v, --version        Show version

Examples:
  exo sketch.excalidraw
  exo .                      # all .excalidraw files in the current directory
  exo -R .                   # also include nested directories
  exo docs/ sketches/
  exo --status
  exo --shutdown
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.version) {
    console.log(VERSION);
    return;
  }

  if (args.status) {
    await printStatus(args.port);
    return;
  }

  if (args.shutdown) {
    await shutdownServer(args.host, args.port);
    return;
  }

  if (args.serve) {
    await startServer({
      host: args.host,
      port: args.port,
      version: VERSION,
      initialPaths: [],
      exitProcessOnStop: true,
    });
    await new Promise(() => {});
    return;
  }

  const absPaths = expandInputPaths(args.paths, {
    recursive: args.recursive,
  });
  if (args.paths.length > 0 && absPaths.length === 0) {
    throw new Error(
      args.recursive
        ? "no .excalidraw files found in the given directories"
        : "no .excalidraw files found (try -R to search subdirectories)",
    );
  }

  if (args.foreground) {
    await startServer({
      host: args.host,
      port: args.port,
      version: VERSION,
      initialPaths: absPaths,
      exitProcessOnStop: true,
    });
    const url = editorUrl(args.host, args.port, absPaths[0]);
    console.log(
      `exo: serving at ${baseUrl(args.host, args.port)} (pid ${process.pid})`,
    );
    if (args.open) openBrowser(url);
    await new Promise(() => {});
    return;
  }

  const running = await isServerRunning(args.host, args.port);
  if (!running) {
    await spawnDaemon(args.host, args.port);
    await waitForServer(args.host, args.port, 8000);
  }

  let fileCount = 0;
  if (absPaths.length > 0) {
    const result = await postFiles(args.host, args.port, absPaths);
    fileCount = result.files.length;
  } else {
    const status = await fetchStatus(args.host, args.port);
    fileCount = status?.files ?? 0;
  }

  const url = editorUrl(args.host, args.port, absPaths[0]);
  console.log(
    `exo: serving at ${baseUrl(args.host, args.port)} (${fileCount} file(s))`,
  );
  if (args.open) openBrowser(url);
}

function editorUrl(host: string, port: number, firstPath?: string): string {
  const base = baseUrl(host, port);
  if (!firstPath) return base;
  return `${base}/?file=${fileIdForPath(firstPath)}`;
}

async function printStatus(preferredPort: number): Promise<void> {
  const states = listServerStates();
  if (states.length === 0) {
    const live = await fetchStatus(DEFAULT_HOST, preferredPort);
    if (!live) {
      console.log("exo: no running servers");
      return;
    }
    console.log(
      `${live.url} (pid ${live.pid}, v${live.version}, ${live.files} file(s))`,
    );
    return;
  }

  for (const state of states) {
    const live = await fetchStatus(state.host, state.port);
    if (!live) {
      clearServerState(state.port);
      continue;
    }
    console.log(
      `${live.url} (pid ${live.pid}, v${live.version}, ${live.files} file(s))`,
    );
  }
}

async function shutdownServer(host: string, port: number): Promise<void> {
  const live = await fetchStatus(host, port);
  if (!live) {
    clearServerState(port);
    console.log(`exo: no server on port ${port}`);
    return;
  }
  try {
    await fetch(`${baseUrl(host, port)}/api/shutdown`, { method: "POST" });
  } catch {
    // server may close before response completes
  }
  clearServerState(port);
  console.log(`exo: shut down server on port ${port}`);
}

async function isServerRunning(host: string, port: number): Promise<boolean> {
  return (await fetchStatus(host, port)) !== null;
}

async function fetchStatus(
  host: string,
  port: number,
): Promise<{
  ok: boolean;
  pid: number;
  port: number;
  host: string;
  version: string;
  files: number;
  url: string;
} | null> {
  try {
    const res = await fetch(`${baseUrl(host, port)}/api/status`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      ok: boolean;
      pid: number;
      port: number;
      host: string;
      version: string;
      files: number;
      url: string;
    };
  } catch {
    const state = readServerState(port);
    if (state && !isPidAlive(state.pid)) clearServerState(port);
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function spawnDaemon(host: string, port: number): Promise<void> {
  const cliPath = path.join(__dirname, "cli.js");
  if (!fs.existsSync(cliPath)) {
    throw new Error(`missing ${cliPath} — run pnpm build`);
  }

  const child = spawn(
    process.execPath,
    [cliPath, "--serve", "--port", String(port), "--bind", host],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    },
  );
  child.unref();
}

async function waitForServer(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning(host, port)) return;
    await delay(100);
  }
  throw new Error(`exo server did not start on ${baseUrl(host, port)}`);
}

async function postFiles(
  host: string,
  port: number,
  paths: string[],
): Promise<{ files: { id: string; path: string; name: string }[] }> {
  const res = await fetch(`${baseUrl(host, port)}/api/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`failed to add files: ${text}`);
  }
  return (await res.json()) as {
    files: { id: string; path: string; name: string }[];
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(`exo: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
