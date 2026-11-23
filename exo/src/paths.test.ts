import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  isExcalidrawPath,
  isInsideWorkspace,
  nextAvailableCopyPath,
  resolveExcalidrawPath,
  resolveNewDrawingPath,
} from "./paths.js";

test(".excalidraw is treated as an Excalidraw document path", () => {
  assert.equal(isExcalidrawPath("sketch.excalidraw"), true);
});

test(".excalidraw.json is treated as an Excalidraw document path", () => {
  assert.equal(isExcalidrawPath("sketch.excalidraw.json"), true);
});

test("a PNG path is not an Excalidraw document path", () => {
  assert.equal(isExcalidrawPath("sketch.png"), false);
});

test("resolveExcalidrawPath returns an absolute path under cwd", () => {
  const resolved = resolveExcalidrawPath("notes.excalidraw", "/work");
  assert.equal(resolved, path.join("/work", "notes.excalidraw"));
});

test("resolveExcalidrawPath rejects a markdown path with a clear error", () => {
  assert.throws(
    () => resolveExcalidrawPath("notes.md"),
    /not an Excalidraw file/,
  );
});

test("resolveNewDrawingPath adds .excalidraw when the name has no extension", () => {
  assert.equal(
    resolveNewDrawingPath("sketch", "/work"),
    path.join("/work", "sketch.excalidraw"),
  );
});

test("resolveNewDrawingPath keeps an explicit .excalidraw suffix", () => {
  assert.equal(
    resolveNewDrawingPath("box.excalidraw", "/work"),
    path.join("/work", "box.excalidraw"),
  );
});

test("isInsideWorkspace accepts files under the workspace root", () => {
  assert.equal(
    isInsideWorkspace("/work/exo-files/a.excalidraw", "/work/exo-files"),
    true,
  );
});

test("isInsideWorkspace rejects files outside the workspace root", () => {
  assert.equal(
    isInsideWorkspace("/work/other/a.excalidraw", "/work/exo-files"),
    false,
  );
});

test("nextAvailableCopyPath uses Finder-style copy names", () => {
  const existing = new Set([
    "/work/sketch.excalidraw",
    "/work/sketch copy.excalidraw",
  ]);
  assert.equal(
    nextAvailableCopyPath("/work/sketch.excalidraw", (p) => existing.has(p)),
    "/work/sketch copy 2.excalidraw",
  );
});
