import assert from "node:assert/strict";
import test from "node:test";
import { fileIdForPath, mergeFiles, toOpenFile } from "./registry.js";

test("the same absolute path always maps to the same file id", () => {
  assert.equal(
    fileIdForPath("/tmp/a.excalidraw"),
    fileIdForPath("/tmp/a.excalidraw"),
  );
});

test("different paths map to different file ids", () => {
  assert.notEqual(
    fileIdForPath("/tmp/a.excalidraw"),
    fileIdForPath("/tmp/b.excalidraw"),
  );
});

test("toOpenFile exposes the basename as the display name", () => {
  assert.deepEqual(toOpenFile("/drawings/box.excalidraw"), {
    id: fileIdForPath("/drawings/box.excalidraw"),
    path: "/drawings/box.excalidraw",
    name: "box.excalidraw",
  });
});

test("mergeFiles keeps existing order and appends only new paths", () => {
  const existing = [toOpenFile("/tmp/a.excalidraw")];

  const merged = mergeFiles(existing, [
    "/tmp/a.excalidraw",
    "/tmp/b.excalidraw",
    "/tmp/a.excalidraw",
  ]);

  assert.deepEqual(
    merged.map((f) => f.path),
    ["/tmp/a.excalidraw", "/tmp/b.excalidraw"],
  );
});
