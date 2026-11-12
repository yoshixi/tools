import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { watch } from "chokidar";
import { listBrowseDir } from "./browse.js";
import {
  DialogCancelledError,
  chooseExcalidrawFile,
  chooseFolder,
} from "./native-dialog.js";
import { resolveExcalidrawPath, resolveNewDrawingPath } from "./paths.js";
import {
  mergeFiles,
  type OpenFile,
  toOpenFile,
} from "./registry.js";
import {
  emptyScene,
  parseScene,
  sceneFromUnknown,
  serializeScene,
  type ExcalidrawScene,
} from "./scene.js";
import {
  baseUrl,
  clearServerState,
  writeServerState,
  type ServerState,
} from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "client");

type SseClient = {
  id: number;
  res: http.ServerResponse;
};

export type ServerOptions = {
  host: string;
  port: number;
  version: string;
  initialPaths?: string[];
  /** Directory where the server was started (defaults to process.cwd()). */
  cwd?: string;
  /** When true (CLI daemon), /api/shutdown and signals exit the process. */
  exitProcessOnStop?: boolean;
};

export type RunningServer = {
  url: string;
  port: number;
  host: string;
  close: () => Promise<void>;
};

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const cwd = opts.cwd ?? process.cwd();
  let files: OpenFile[] = mergeFiles([], opts.initialPaths ?? []);
  const watchers = new Map<string, ReturnType<typeof watch>>();
  const sseClients = new Map<number, SseClient>();
  let sseSeq = 0;
  // Skip echo of our own writes back into the SPA, unless disk content differs.
  const ignoreWatchUntil = new Map<string, number>();
  const lastWritePayload = new Map<string, string>();
  let closing = false;

  function broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients.values()) {
      client.res.write(payload);
    }
  }

  function ensureWatch(absPath: string): void {
    if (watchers.has(absPath)) return;
    const w = watch(absPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });
    w.on("change", () => {
      const until = ignoreWatchUntil.get(absPath) ?? 0;
      if (Date.now() < until) {
        try {
          const current = fs.readFileSync(absPath, "utf8");
          if (current === lastWritePayload.get(absPath)) return;
        } catch {
          return;
        }
      }
      const file = toOpenFile(absPath);
      broadcast("file-changed", { id: file.id, path: file.path });
    });
    watchers.set(absPath, w);
  }

  function addPaths(absPaths: string[]): OpenFile[] {
    const before = new Set(files.map((f) => f.id));
    files = mergeFiles(files, absPaths);
    for (const file of files) {
      if (!before.has(file.id)) {
        ensureFileExists(file.path);
        ensureWatch(file.path);
      }
    }
    broadcast("files", files);
    return files;
  }

  for (const file of files) {
    ensureFileExists(file.path);
    ensureWatch(file.path);
  }

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: message });
    }
  });

  async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const hostHeader = req.headers.host ?? `${opts.host}:${opts.port}`;
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);
    const { pathname } = url;

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/api/status") {
      json(res, 200, {
        ok: true,
        pid: process.pid,
        port: opts.port,
        host: opts.host,
        version: opts.version,
        files: files.length,
        cwd,
        url: baseUrl(opts.host, opts.port),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/files") {
      json(res, 200, { files });
      return;
    }

    if (req.method === "POST" && pathname === "/api/files") {
      const body = await readJson(req);
      const rawPaths = Array.isArray(body.paths)
        ? body.paths.filter((p): p is string => typeof p === "string")
        : [];
      const paths = rawPaths.map((p) => resolveExcalidrawPath(p, cwd));
      const updated = addPaths(paths);
      json(res, 200, { files: updated });
      return;
    }

    if (req.method === "POST" && pathname === "/api/files/create") {
      const body = await readJson(req);
      const name = typeof body.name === "string" ? body.name : "";
      const dir =
        typeof body.dir === "string" && body.dir.trim()
          ? body.dir.trim()
          : cwd;
      const full = resolveNewDrawingPath(name, dir);
      const updated = addPaths([full]);
      const opened = updated.find((f) => f.path === full) ?? updated.at(-1);
      json(res, 200, { files: updated, opened });
      return;
    }

    if (req.method === "POST" && pathname === "/api/dialog/open-file") {
      try {
        const selected = await chooseExcalidrawFile();
        json(res, 200, { path: selected });
      } catch (err) {
        if (err instanceof DialogCancelledError) {
          json(res, 200, { cancelled: true });
          return;
        }
        throw err;
      }
      return;
    }

    if (req.method === "POST" && pathname === "/api/dialog/choose-folder") {
      try {
        const selected = await chooseFolder();
        json(res, 200, { path: selected });
      } catch (err) {
        if (err instanceof DialogCancelledError) {
          json(res, 200, { cancelled: true });
          return;
        }
        throw err;
      }
      return;
    }

    if (req.method === "GET" && pathname === "/api/browse") {
      const dir = url.searchParams.get("dir") || cwd;
      json(res, 200, listBrowseDir(dir));
      return;
    }

    if (req.method === "POST" && pathname === "/api/shutdown") {
      json(res, 200, { ok: true });
      setTimeout(() => {
        void close().then(() => {
          if (opts.exitProcessOnStop) process.exit(0);
        });
      }, 50);
      return;
    }

    const fileMatch = pathname.match(/^\/api\/files\/([^/]+)$/);
    if (fileMatch) {
      const id = decodeURIComponent(fileMatch[1]!);
      const file = files.find((f) => f.id === id);
      if (!file) {
        json(res, 404, { error: "file not open" });
        return;
      }

      if (req.method === "GET") {
        const scene = readScene(file.path);
        json(res, 200, { file, scene });
        return;
      }

      if (req.method === "PUT") {
        const body = await readJson(req);
        const raw = body.scene ?? body;
        const scene =
          typeof raw === "string" ? parseScene(raw) : sceneFromUnknown(raw);
        const serialized = serializeScene(scene);
        lastWritePayload.set(file.path, serialized);
        ignoreWatchUntil.set(file.path, Date.now() + 750);
        fs.writeFileSync(file.path, serialized, "utf8");
        json(res, 200, { ok: true });
        return;
      }
    }

    if (req.method === "GET" && pathname === "/api/events") {
      const id = ++sseSeq;
      res.writeHead(200, {
        ...corsHeaders(),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: files\ndata: ${JSON.stringify(files)}\n\n`);
      sseClients.set(id, { id, res });
      req.on("close", () => {
        sseClients.delete(id);
      });
      return;
    }

    await serveStatic(pathname, res);
  }

  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    for (const w of watchers.values()) await w.close();
    for (const client of sseClients.values()) client.res.end();
    sseClients.clear();
    clearServerState(opts.port);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve());
  });

  const state: ServerState = {
    pid: process.pid,
    port: opts.port,
    host: opts.host,
    startedAt: new Date().toISOString(),
    version: opts.version,
  };
  writeServerState(state);

  const onSignal = () => {
    void close().then(() => {
      if (opts.exitProcessOnStop) process.exit(0);
    });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const originalClose = close;
  return {
    url: baseUrl(opts.host, opts.port),
    port: opts.port,
    host: opts.host,
    close: async () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      await originalClose();
    },
  };
}

function ensureFileExists(absPath: string): void {
  if (fs.existsSync(absPath)) return;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, serializeScene(emptyScene()), "utf8");
}

function readScene(absPath: string): ExcalidrawScene {
  if (!fs.existsSync(absPath)) {
    const scene = emptyScene();
    fs.writeFileSync(absPath, serializeScene(scene), "utf8");
    return scene;
  }
  const raw = fs.readFileSync(absPath, "utf8");
  if (!raw.trim()) return emptyScene();
  return parseScene(raw);
}

async function serveStatic(
  pathname: string,
  res: http.ServerResponse,
): Promise<void> {
  if (!fs.existsSync(CLIENT_DIR)) {
    json(res, 503, {
      error: "web UI not built — run `pnpm build` in the exo package",
    });
    return;
  }

  const rel = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.join(CLIENT_DIR, rel);
  if (!filePath.startsWith(CLIENT_DIR)) {
    json(res, 403, { error: "forbidden" });
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(CLIENT_DIR, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".js"
        ? "text/javascript; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".svg"
            ? "image/svg+xml"
            : ext === ".json"
              ? "application/json"
              : "application/octet-stream";

  res.writeHead(200, { "Content-Type": type, ...corsHeaders() });
  fs.createReadStream(filePath).pipe(res);
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const data = `${JSON.stringify(body)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(data);
}

async function readJson(
  req: http.IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as Record<string, unknown>;
}
