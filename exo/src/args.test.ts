import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "./args.js";
import { DEFAULT_HOST, DEFAULT_PORT } from "./state.js";

test("with no flags, defaults keep the browser open on the standard port", () => {
  assert.deepEqual(parseArgs(["sketch.excalidraw"]), {
    command: "open",
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
    cwd: null,
    output: null,
    exportFormat: null,
    exportScale: 2,
    exportBackground: true,
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

test("-h and --help set the help flag", () => {
  assert.equal(parseArgs(["-h"]).help, true);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["export", "--help"]).help, true);
});

test("export subcommand parses output format and scale", () => {
  const args = parseArgs([
    "export",
    "sketch.excalidraw",
    "-o",
    "out.png",
    "--format",
    "png",
    "--scale",
    "3",
    "--no-background",
  ]);
  assert.equal(args.command, "export");
  assert.deepEqual(args.paths, ["sketch.excalidraw"]);
  assert.equal(args.output, "out.png");
  assert.equal(args.exportFormat, "png");
  assert.equal(args.exportScale, 3);
  assert.equal(args.exportBackground, false);
});

test("export alone keeps default scale and opaque background", () => {
  const args = parseArgs(["export", "a.excalidraw"]);
  assert.equal(args.command, "export");
  assert.equal(args.output, null);
  assert.equal(args.exportFormat, null);
  assert.equal(args.exportScale, 2);
  assert.equal(args.exportBackground, true);
});

test("--output is accepted as a long form of -o", () => {
  assert.equal(
    parseArgs(["export", "a.excalidraw", "--output", "x.svg"]).output,
    "x.svg",
  );
});

test("-o without a value is rejected", () => {
  assert.throws(
    () => parseArgs(["export", "a.excalidraw", "-o"]),
    /-o requires a value/,
  );
});

test("--format rejects values other than png or svg", () => {
  assert.throws(
    () => parseArgs(["export", "a.excalidraw", "--format", "pdf"]),
    /--format must be png or svg/,
  );
  assert.throws(
    () => parseArgs(["export", "a.excalidraw", "--format"]),
    /--format must be png or svg/,
  );
});

test("--scale rejects zero, negative, and missing values", () => {
  assert.throws(
    () => parseArgs(["export", "a.excalidraw", "--scale", "0"]),
    /invalid --scale/,
  );
  assert.throws(
    () => parseArgs(["export", "a.excalidraw", "--scale", "-1"]),
    /invalid --scale/,
  );
  assert.throws(
    () => parseArgs(["export", "a.excalidraw", "--scale"]),
    /--scale requires a value/,
  );
});
