import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyScene,
  parseScene,
  sceneFromUnknown,
  serializeScene,
} from "./scene.js";

test("emptyScene is a version-2 Excalidraw document with no elements", () => {
  assert.deepEqual(emptyScene(), {
    type: "excalidraw",
    version: 2,
    source: "exo",
    elements: [],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
    },
    files: {},
  });
});

test("parseScene reads a minimal saved .excalidraw document", () => {
  const raw = `{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [{ "id": "r1", "type": "rectangle" }],
  "appState": { "viewBackgroundColor": "#abcdef" },
  "files": {}
}`;

  assert.deepEqual(parseScene(raw), {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: [{ id: "r1", type: "rectangle" }],
    appState: { viewBackgroundColor: "#abcdef" },
    files: {},
  });
});

test("parseScene rejects broken JSON", () => {
  assert.throws(() => parseScene("{"), /invalid JSON/);
});

test("sceneFromUnknown fills missing fields with safe defaults", () => {
  assert.deepEqual(sceneFromUnknown({ elements: [{ id: "a" }] }), {
    type: "excalidraw",
    version: 2,
    source: "exo",
    elements: [{ id: "a" }],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  });
});

test("serializeScene round-trips through parseScene", () => {
  const scene = emptyScene();
  scene.elements = [{ id: "line-1", type: "line" }];

  assert.deepEqual(parseScene(serializeScene(scene)), scene);
});
