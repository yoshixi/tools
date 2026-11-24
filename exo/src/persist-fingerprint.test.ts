import assert from "node:assert/strict";
import test from "node:test";
import {
  persistFingerprint,
  sceneContentKey,
} from "./persist-fingerprint.js";

const baseEl = {
  id: "a",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  version: 1,
  versionNonce: 10,
  isDeleted: false,
};

const baseApp = {
  viewBackgroundColor: "#ffffff",
  gridSize: 20,
  theme: "light",
};

test("persistFingerprint stays stable when only selection would change (same elements)", () => {
  const a = persistFingerprint([baseEl], baseApp, []);
  const b = persistFingerprint([{ ...baseEl }], { ...baseApp }, []);
  assert.equal(a, b);
});

test("persistFingerprint changes when an element version bumps", () => {
  const before = persistFingerprint([baseEl], baseApp, []);
  const after = persistFingerprint(
    [{ ...baseEl, version: 2, versionNonce: 11 }],
    baseApp,
    [],
  );
  assert.notEqual(before, after);
});

test("persistFingerprint changes when background color changes", () => {
  const before = persistFingerprint([baseEl], baseApp, []);
  const after = persistFingerprint(
    [baseEl],
    { ...baseApp, viewBackgroundColor: "#000000" },
    [],
  );
  assert.notEqual(before, after);
});

test("persistFingerprint changes when a file id is added", () => {
  const before = persistFingerprint([baseEl], baseApp, []);
  const after = persistFingerprint([baseEl], baseApp, ["file-1"]);
  assert.notEqual(before, after);
});

test("sceneContentKey stays stable when only version fields churn", () => {
  const before = sceneContentKey([baseEl], baseApp, []);
  const after = sceneContentKey(
    [{ ...baseEl, version: 9, versionNonce: 99, updated: 123, seed: 7 }],
    baseApp,
    [],
  );
  assert.equal(before, after);
});

test("sceneContentKey changes when geometry changes", () => {
  const before = sceneContentKey([baseEl], baseApp, []);
  const after = sceneContentKey([{ ...baseEl, x: 99 }], baseApp, []);
  assert.notEqual(before, after);
});

test("sceneContentKey changes when an element is added", () => {
  const before = sceneContentKey([baseEl], baseApp, []);
  const after = sceneContentKey(
    [baseEl, { ...baseEl, id: "b", x: 5 }],
    baseApp,
    [],
  );
  assert.notEqual(before, after);
});
