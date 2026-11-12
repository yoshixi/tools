import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { emptyScene, serializeScene } from "../scene.js";

export async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
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

export function tempWorkspace(prefix = "exo-test-"): {
  dir: string;
  stateDir: string;
  drawingPath: (name: string) => string;
  writeDrawing: (name: string, elements?: unknown[]) => string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const stateDir = path.join(dir, "state");
  fs.mkdirSync(stateDir);
  return {
    dir,
    stateDir,
    drawingPath: (name) => path.join(dir, name),
    writeDrawing: (name, elements = []) => {
      const filePath = path.join(dir, name);
      const scene = emptyScene();
      scene.elements = elements;
      fs.writeFileSync(filePath, serializeScene(scene));
      return filePath;
    },
  };
}

export async function withExoStateDir<T>(
  stateDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env.EXO_STATE_DIR;
  process.env.EXO_STATE_DIR = stateDir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.EXO_STATE_DIR;
    else process.env.EXO_STATE_DIR = previous;
  }
}
