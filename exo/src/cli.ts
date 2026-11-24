import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type CliArgs } from "./args.js";
import { openBrowser } from "./browser.js";
import { expandInputPaths } from "./expand.js";
import {
  defaultExportPath,
  exportExcalidrawFile,
  resolveExportFormat,
} from "./export.js";
import { helpText } from "./help.js";
import { assertInsideWorkspace } from "./paths.js";
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
import { inferWorkspace } from "./workspace.js";

const VERSION = "0.1.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
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

  if (args.command === "export") {
    await runExport(args);
    return;
  }

  if (args.serve) {
    const workspace = path.resolve(args.cwd ?? process.cwd());
    await startServer({
      host: args.host,
      port: args.port,
      version: VERSION,
      cwd: workspace,
      initialPaths: [],
      exitProcessOnStop: true,
    });
    await new Promise(() => {});
    return;
  }

  if (args.command !== "start") {
    if (args.paths.length > 0) {
      throw new Error(
        `missing command. Try:\n  exo start ${args.paths.join(" ")}\n  exo export <file.excalidraw>\n  exo --help`,
      );
    }
    console.log(helpText());
    return;
  }

  await runStart(args);
}

async function runStart(args: CliArgs): Promise<void> {
  const workspace = inferWorkspace(args.paths, process.cwd());
  const expandRoots = args.paths.length === 0 ? ["."] : args.paths;

  // Expand relative to process cwd so relative file args keep working; a single
  // directory arg is already absolute-resolved by expandInputPaths.
  const absPaths = expandInputPaths(expandRoots, {
    recursive: args.recursive,
    cwd: process.cwd(),
  });

  // Explicit directory/file args that match nothing are an error. A bare
  // `exo start` in an empty workspace is fine — create drawings from the UI.
  if (args.paths.length > 0 && absPaths.length === 0) {
    throw new Error(
      args.recursive
        ? `no .excalidraw files found under ${workspace}`
        : `no .excalidraw files found under ${workspace} (try -R to search subdirectories)`,
    );
  }

  for (const absPath of absPaths) {
    assertInsideWorkspace(absPath, workspace);
  }

  if (args.foreground) {
    await startServer({
      host: args.host,
      port: args.port,
      version: VERSION,
      cwd: workspace,
      initialPaths: absPaths,
      exitProcessOnStop: true,
    });
    const url = editorUrl(args.host, args.port, absPaths[0]);
    console.log(
      `exo: workspace ${workspace}\nexo: serving at ${baseUrl(args.host, args.port)} (pid ${process.pid})`,
    );
    if (args.open) openBrowser(url);
    await new Promise(() => {});
    return;
  }

  const existing = await findServerForWorkspace(args.host, args.port, workspace);
  let host = args.host;
  let port = args.port;
  if (existing) {
    host = existing.host;
    port = existing.port;
  } else {
    port = await allocatePort(args.host, args.port, workspace);
    await spawnDaemon(host, port, workspace);
    await waitForServer(host, port, 8000);
  }

  let fileCount = 0;
  if (absPaths.length > 0) {
    const result = await postFiles(host, port, absPaths);
    fileCount = result.files.length;
  } else {
    const status = await fetchStatus(host, port);
    fileCount = status?.files ?? 0;
  }

  const url = editorUrl(host, port, absPaths[0]);
  console.log(
    `exo: workspace ${workspace}\nexo: serving at ${baseUrl(host, port)} (${fileCount} file(s))`,
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
    console.log(formatStatusLine(live));
    return;
  }

  let any = false;
  for (const state of states) {
    const live = await fetchStatus(state.host, state.port);
    if (!live) {
      clearServerState(state.port);
      continue;
    }
    any = true;
    console.log(formatStatusLine(live));
  }
  if (!any) console.log("exo: no running servers");
}

function formatStatusLine(live: StatusPayload): string {
  const cwd = live.cwd ? ` cwd=${live.cwd}` : "";
  return `${live.url} (pid ${live.pid}, v${live.version}, ${live.files} file(s)${cwd})`;
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

type StatusPayload = {
  ok: boolean;
  pid: number;
  port: number;
  host: string;
  version: string;
  files: number;
  cwd?: string;
  url: string;
};

async function fetchStatus(
  host: string,
  port: number,
): Promise<StatusPayload | null> {
  try {
    const res = await fetch(`${baseUrl(host, port)}/api/status`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return null;
    return (await res.json()) as StatusPayload;
  } catch {
    const state = readServerState(port);
    if (state && !isPidAlive(state.pid)) clearServerState(port);
    return null;
  }
}

async function findServerForWorkspace(
  host: string,
  preferredPort: number,
  workspace: string,
): Promise<{ host: string; port: number } | null> {
  const wanted = path.resolve(workspace);

  const preferred = await fetchStatus(host, preferredPort);
  if (preferred && preferred.cwd && path.resolve(preferred.cwd) === wanted) {
    return { host, port: preferredPort };
  }

  for (const state of listServerStates()) {
    const live = await fetchStatus(state.host, state.port);
    if (!live) {
      clearServerState(state.port);
      continue;
    }
    const liveCwd = live.cwd ?? state.cwd;
    if (liveCwd && path.resolve(liveCwd) === wanted) {
      return { host: state.host, port: state.port };
    }
  }
  return null;
}

async function allocatePort(
  host: string,
  preferredPort: number,
  workspace: string,
): Promise<number> {
  const existing = await fetchStatus(host, preferredPort);
  if (!existing) return preferredPort;
  if (existing.cwd && path.resolve(existing.cwd) === path.resolve(workspace)) {
    return preferredPort;
  }
  // Preferred port belongs to another workspace — pick a free port.
  return await freePort(host);
}

async function runExport(args: CliArgs): Promise<void> {
  if (args.paths.length !== 1) {
    throw new Error("exo export requires exactly one .excalidraw file");
  }
  const input = path.resolve(args.paths[0]!);
  const format = resolveExportFormat(args.output ?? undefined, args.exportFormat ?? undefined);
  const output = path.resolve(
    args.output ?? defaultExportPath(input, format),
  );
  const result = await exportExcalidrawFile(input, output, {
    format,
    scale: args.exportScale,
    background: args.exportBackground,
  });
  console.log(`${result.format} ${result.outputPath} (${result.bytes} bytes)`);
}

function freePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("could not allocate port")));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function spawnDaemon(
  host: string,
  port: number,
  workspace: string,
): Promise<void> {
  const cliPath = path.join(__dirname, "cli.js");
  if (!fs.existsSync(cliPath)) {
    throw new Error(`missing ${cliPath} — run pnpm build`);
  }

  const child = spawn(
    process.execPath,
    [
      cliPath,
      "--serve",
      "--port",
      String(port),
      "--bind",
      host,
      "--cwd",
      workspace,
    ],
    {
      detached: true,
      stdio: "ignore",
      cwd: workspace,
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
    if (await fetchStatus(host, port)) return;
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
