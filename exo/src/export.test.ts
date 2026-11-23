import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  defaultExportPath,
  exportExcalidrawFile,
  resolveExportFormat,
} from "./export.js";
import { emptyScene, serializeScene } from "./scene.js";

function writeBoxDrawing(dir: string, name = "box.excalidraw"): string {
  const input = path.join(dir, name);
  const scene = emptyScene();
  scene.elements = [
    {
      id: "r1",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      angle: 0,
      strokeColor: "#000000",
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: 1,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    },
  ];
  fs.writeFileSync(input, serializeScene(scene));
  return input;
}

test("defaultExportPath turns sketch.excalidraw into sketch.png", () => {
  assert.equal(
    defaultExportPath("/work/sketch.excalidraw", "png"),
    "/work/sketch.png",
  );
});

test("defaultExportPath strips .excalidraw.json to a short basename", () => {
  assert.equal(
    defaultExportPath("/work/sketch.excalidraw.json", "svg"),
    "/work/sketch.svg",
  );
});

test("resolveExportFormat prefers an explicit format over the output extension", () => {
  assert.equal(resolveExportFormat("out.svg", "png"), "png");
});

test("resolveExportFormat uses .svg extension when format is omitted", () => {
  assert.equal(resolveExportFormat("out.svg"), "svg");
});

test("resolveExportFormat defaults to png", () => {
  assert.equal(resolveExportFormat(undefined), "png");
  assert.equal(resolveExportFormat("out.png"), "png");
});

test("exportExcalidrawFile writes a real PNG without a browser", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-export-"));
  const input = writeBoxDrawing(dir);
  const output = path.join(dir, "box.png");

  const result = await exportExcalidrawFile(input, output, { scale: 1 });

  assert.equal(result.format, "png");
  assert.equal(result.outputPath, output);
  assert.ok(result.bytes > 0);
  const magic = fs.readFileSync(output).subarray(0, 8);
  assert.deepEqual(
    [...magic],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
});

test("exportExcalidrawFile writes SVG markup", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-export-"));
  const input = writeBoxDrawing(dir);
  const output = path.join(dir, "box.svg");

  const result = await exportExcalidrawFile(input, output, { format: "svg" });
  const text = fs.readFileSync(output, "utf8");

  assert.equal(result.format, "svg");
  assert.match(text, /^<svg[\s>]/);
});

test("exportExcalidrawFile infers SVG from the output path extension", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-export-"));
  const input = writeBoxDrawing(dir);
  const output = path.join(dir, "inferred.svg");

  const result = await exportExcalidrawFile(input, output);

  assert.equal(result.format, "svg");
  assert.match(fs.readFileSync(output, "utf8"), /^<svg[\s>]/);
});

test("exportExcalidrawFile creates missing parent directories", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-export-"));
  const input = writeBoxDrawing(dir);
  const output = path.join(dir, "nested", "out", "box.png");

  await exportExcalidrawFile(input, output, { scale: 1 });

  assert.equal(fs.existsSync(output), true);
});

test("exportExcalidrawFile rejects a missing input file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-export-"));
  await assert.rejects(
    () =>
      exportExcalidrawFile(
        path.join(dir, "missing.excalidraw"),
        path.join(dir, "out.png"),
      ),
    /file not found/,
  );
});
