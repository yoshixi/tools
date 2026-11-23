import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { emptyScene, serializeScene } from "./scene.js";

const cliJs = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "cli.js",
);

function runCli(
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliJs, ...args], {
      cwd,
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("`exo --help` prints agent export and vision instructions", async () => {
  const { code, stdout } = await runCli(["--help"], process.cwd());
  assert.equal(code, 0);
  assert.match(stdout, /exo export/);
  assert.match(stdout, /POST \/api\/files\/:id\/export/);
  assert.match(stdout, /vision model/i);
  assert.match(stdout, /no browser \/ Playwright required/i);
});

test("`exo -h` prints the same help as --help", async () => {
  const long = await runCli(["--help"], process.cwd());
  const short = await runCli(["-h"], process.cwd());
  assert.equal(short.code, 0);
  assert.equal(short.stdout, long.stdout);
});

test("`exo export` writes a PNG next to the drawing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-cli-export-"));
  const input = path.join(dir, "sketch.excalidraw");
  fs.writeFileSync(input, serializeScene(emptyScene()));
  const expected = path.join(dir, "sketch.png");

  const { code, stdout, stderr } = await runCli(["export", input], dir);

  assert.equal(code, 0, stderr);
  assert.equal(fs.existsSync(expected), true);
  assert.match(stdout, /png /);
  assert.match(stdout, /sketch\.png/);
});

test("`exo export -o` writes SVG when the output ends with .svg", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-cli-export-"));
  const input = path.join(dir, "sketch.excalidraw");
  fs.writeFileSync(input, serializeScene(emptyScene()));
  const output = path.join(dir, "out.svg");

  const { code, stderr } = await runCli(
    ["export", input, "-o", output],
    dir,
  );

  assert.equal(code, 0, stderr);
  assert.match(fs.readFileSync(output, "utf8"), /^<svg[\s>]/);
});

test("`exo export` with no file exits non-zero", async () => {
  const { code, stderr } = await runCli(["export"], process.cwd());
  assert.notEqual(code, 0);
  assert.match(stderr, /exactly one/);
});
