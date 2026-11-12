import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PORT = 6285;
export const DEFAULT_HOST = "127.0.0.1";

export type ServerState = {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
  version: string;
};

/** Override with EXO_STATE_DIR in tests so runs stay independent. */
export function stateDir(): string {
  return process.env.EXO_STATE_DIR ?? path.join(os.homedir(), ".exo");
}

export function statePath(port: number): string {
  return path.join(stateDir(), `server-${port}.json`);
}

export function writeServerState(state: ServerState): void {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(statePath(state.port), `${JSON.stringify(state, null, 2)}\n`);
}

export function readServerState(port: number): ServerState | null {
  const file = statePath(port);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ServerState;
  } catch {
    return null;
  }
}

export function clearServerState(port: number): void {
  const file = statePath(port);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function listServerStates(): ServerState[] {
  const dir = stateDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("server-") && name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(dir, name), "utf8"),
        ) as ServerState;
      } catch {
        return null;
      }
    })
    .filter((s): s is ServerState => s !== null);
}

export function baseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}
