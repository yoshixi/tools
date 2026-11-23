import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inferWorkspace } from "./workspace.js";

test("inferWorkspace uses a single directory argument as the workspace", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-ws-"));
  const drawings = path.join(root, "exo-files");
  fs.mkdirSync(drawings);
  assert.equal(inferWorkspace(["exo-files"], root), drawings);
});

test("inferWorkspace falls back to cwd for file arguments", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-ws-"));
  assert.equal(inferWorkspace(["a.excalidraw"], root), root);
});

test("inferWorkspace falls back to cwd when no paths are given", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-ws-"));
  assert.equal(inferWorkspace([], root), root);
});
