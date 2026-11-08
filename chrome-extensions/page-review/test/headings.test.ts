import { test } from "node:test";
import assert from "node:assert/strict";
import { headingPath } from "../src/core/headings.ts";

test("nested headings make a path", () => {
  const path = headingPath([
    { level: 1, text: "Report" },
    { level: 2, text: "Findings" },
    { level: 3, text: "1. Null check" },
  ]);
  assert.deepEqual(path, ["# Report", "## Findings", "### 1. Null check"]);
});

test("a sibling heading replaces the previous one", () => {
  const path = headingPath([
    { level: 2, text: "A" },
    { level: 3, text: "A1" },
    { level: 2, text: "B" },
    { level: 3, text: "B1" },
  ]);
  assert.deepEqual(path, ["## B", "### B1"]);
});

test("no headings gives an empty path", () => {
  assert.deepEqual(headingPath([]), []);
});
