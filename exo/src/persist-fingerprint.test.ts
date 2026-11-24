import assert from "node:assert/strict";
import test from "node:test";
import { persistFingerprint } from "./persist-fingerprint.js";

const baseEl = {
  id: "a",
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
