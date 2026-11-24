import { DEFAULT_HOST, DEFAULT_PORT } from "./state.js";

export type CliCommand = "start" | "export" | null;

export type ExportFormatArg = "png" | "svg";

export type CliArgs = {
  command: CliCommand;
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
  /** Internal: workspace root for --serve */
  cwd: string | null;
  /** exo export -o */
  output: string | null;
  exportFormat: ExportFormatArg | null;
  exportScale: number;
  exportBackground: boolean;
};

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    command: null,
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
    cwd: null,
    output: null,
    exportFormat: null,
    exportScale: 2,
    exportBackground: true,
  };

  let i = 0;
  if (argv[0] === "export" || argv[0] === "start") {
    args.command = argv[0];
    i = 1;
  }

  for (; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--version" || a === "-v") args.version = true;
    else if (a === "--foreground" || a === "-f") args.foreground = true;
    else if (a === "--status") args.status = true;
    else if (a === "--shutdown") args.shutdown = true;
    else if (a === "--serve") args.serve = true;
    else if (a === "--recursive" || a === "-R") args.recursive = true;
    else if (a === "--cwd") {
      const value = argv[++i];
      if (!value) throw new Error("--cwd requires a value");
      args.cwd = value;
    } else if (a === "--no-open") args.open = false;
    else if (a === "--open") args.open = true;
    else if (a === "-o" || a === "--output") {
      const value = argv[++i];
      if (!value) throw new Error(`${a} requires a value`);
      args.output = value;
    } else if (a === "--format") {
      const value = argv[++i];
      if (value !== "png" && value !== "svg") {
        throw new Error(`--format must be png or svg (got ${value ?? "nothing"})`);
      }
      args.exportFormat = value;
    } else if (a === "--scale") {
      const value = argv[++i];
      if (!value) throw new Error("--scale requires a value");
      args.exportScale = Number(value);
      if (!Number.isFinite(args.exportScale) || args.exportScale <= 0) {
        throw new Error(`invalid --scale: ${value}`);
      }
    } else if (a === "--no-background") args.exportBackground = false;
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
    else if (ch === "o") {
      throw new Error("-o cannot be combined in a short cluster (needs a value)");
    } else if (ch === "p" || ch === "b") {
      throw new Error(`-${ch} cannot be combined in a short cluster (needs a value)`);
    } else {
      throw new Error(`unknown flag: -${ch}`);
    }
  }
}
