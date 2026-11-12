import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { expandInputPaths, listExcalidrawInDir } from "./expand.js";

function makeTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-expand-"));
  fs.writeFileSync(path.join(root, "a.excalidraw"), "{}");
  fs.writeFileSync(path.join(root, "notes.md"), "x");
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", "b.excalidraw"), "{}");
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "node_modules", "pkg", "skip.excalidraw"),
    "{}",
  );
  return root;
}

test("listExcalidrawInDir without recursive only sees the top level", () => {
  const root = makeTree();
  assert.deepEqual(listExcalidrawInDir(root, false), [
    path.join(root, "a.excalidraw"),
  ]);
});

test("listExcalidrawInDir with recursive includes nested files and skips node_modules", () => {
  const root = makeTree();
  assert.deepEqual(listExcalidrawInDir(root, true), [
    path.join(root, "a.excalidraw"),
    path.join(root, "nested", "b.excalidraw"),
  ]);
});

test("expandInputPaths opens every drawing in the current directory with .", () => {
  const root = makeTree();
  assert.deepEqual(expandInputPaths(["."], { cwd: root, recursive: false }), [
    path.join(root, "a.excalidraw"),
  ]);
});

test("expandInputPaths -R . includes nested drawings", () => {
  const root = makeTree();
  assert.deepEqual(expandInputPaths(["."], { cwd: root, recursive: true }), [
    path.join(root, "a.excalidraw"),
    path.join(root, "nested", "b.excalidraw"),
  ]);
});

test("expandInputPaths still accepts a single file path", () => {
  const root = makeTree();
  assert.deepEqual(
    expandInputPaths(["nested/b.excalidraw"], { cwd: root }),
    [path.join(root, "nested", "b.excalidraw")],
  );
});
