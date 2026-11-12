import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "./args.js";
import { DEFAULT_HOST, DEFAULT_PORT } from "./state.js";

test("with no flags, defaults keep the browser open on the standard port", () => {
  assert.deepEqual(parseArgs(["sketch.excalidraw"]), {
    paths: ["sketch.excalidraw"],
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
  });
});

test("-R enables recursive directory expansion", () => {
  assert.equal(parseArgs(["-R", "."]).recursive, true);
});

test("combined short flags like -Rf set recursive and foreground", () => {
  const args = parseArgs(["-Rf", "."]);
  assert.equal(args.recursive, true);
  assert.equal(args.foreground, true);
});

test("--no-open disables opening the browser", () => {
  assert.equal(parseArgs(["--no-open", "a.excalidraw"]).open, false);
});

test("--port overrides the listen port", () => {
  assert.equal(parseArgs(["--port", "7001", "a.excalidraw"]).port, 7001);
});

test("an unknown flag is rejected", () => {
  assert.throws(() => parseArgs(["--wat"]), /unknown flag: --wat/);
});

test("--port without a value is rejected", () => {
  assert.throws(() => parseArgs(["--port"]), /--port requires a value/);
});
