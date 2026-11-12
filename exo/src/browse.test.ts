import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listBrowseDir } from "./browse.js";

test("listBrowseDir shows subfolders and Excalidraw files, not other files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-browse-"));
  fs.mkdirSync(path.join(dir, "docs"));
  fs.writeFileSync(path.join(dir, "a.excalidraw"), "{}");
  fs.writeFileSync(path.join(dir, "notes.md"), "hi");
  fs.writeFileSync(path.join(dir, ".hidden.excalidraw"), "{}");

  const result = listBrowseDir(dir);

  assert.equal(result.dir, dir);
  assert.deepEqual(
    result.entries.map((e) => [e.kind, e.name]),
    [
      ["dir", "docs"],
      ["file", "a.excalidraw"],
    ],
  );
});

test("listBrowseDir rejects a file path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-browse-"));
  const file = path.join(dir, "only.excalidraw");
  fs.writeFileSync(file, "{}");
  assert.throws(() => listBrowseDir(file), /not a directory/);
});
