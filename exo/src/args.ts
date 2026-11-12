import { DEFAULT_HOST, DEFAULT_PORT } from "./state.js";

export type CliArgs = {
  paths: string[];
  port: number;
  host: string;
  foreground: boolean;
  open: boolean;
  status: boolean;
  shutdown: boolean;
  help: boolean;
  version: boolean;
  serve: boolean;
  recursive: boolean;
};

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    paths: [],
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    foreground: false,
    open: true,
    status: false,
    shutdown: false,
    help: false,
    version: false,
    serve: false,
    recursive: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--version" || a === "-v") args.version = true;
    else if (a === "--foreground" || a === "-f") args.foreground = true;
    else if (a === "--status") args.status = true;
    else if (a === "--shutdown") args.shutdown = true;
    else if (a === "--serve") args.serve = true;
    else if (a === "--recursive" || a === "-R") args.recursive = true;
    else if (a === "--no-open") args.open = false;
    else if (a === "--open") args.open = true;
    else if (a === "--port" || a === "-p") {
      const value = argv[++i];
      if (!value) throw new Error("--port requires a value");
      args.port = Number(value);
      if (!Number.isInteger(args.port) || args.port <= 0) {
        throw new Error(`invalid port: ${value}`);
      }
    } else if (a === "--bind" || a === "-b") {
      const value = argv[++i];
      if (!value) throw new Error("--bind requires a value");
      args.host = value;
    } else if (a.startsWith("-") && a !== "-" && !a.startsWith("--")) {
      // mo-style combined shorts: -Rf, -fR, …
      applyShortCluster(a.slice(1), args);
    } else if (a.startsWith("-")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      args.paths.push(a);
    }
  }
  return args;
}

function applyShortCluster(cluster: string, args: CliArgs): void {
  for (let i = 0; i < cluster.length; i++) {
    const ch = cluster[i]!;
    if (ch === "h") args.help = true;
    else if (ch === "v") args.version = true;
    else if (ch === "f") args.foreground = true;
    else if (ch === "R") args.recursive = true;
    else if (ch === "p" || ch === "b") {
      throw new Error(`-${ch} cannot be combined in a short cluster (needs a value)`);
    } else {
      throw new Error(`unknown flag: -${ch}`);
    }
  }
}
