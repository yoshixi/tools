import { test } from "node:test";
import assert from "node:assert/strict";
import { findLines } from "../src/core/lines.ts";

const md = [
  "# Review report", // 1
  "", // 2
  "## Findings", // 3
  "", // 4
  "### 1. Missing null check", // 5
  "", // 6
  "The function `load()` returns **null** when the cache is empty.", // 7
  "", // 8
  "### 2. Slow loop", // 9
  "", // 10
  "The loop is slow.", // 11
  "Use a [map](https://example.com/map) instead.", // 12
  "", // 13
  "## Summary", // 14
  "", // 15
  "The loop is slow.", // 16
].join("\n");

test("finds a single line even when the source has inline markdown", () => {
  const lines = findLines(md, "The function load() returns null when the cache is empty.", []);
  assert.deepEqual(lines, { start: 7, end: 7 });
});

test("finds a range across lines", () => {
  const lines = findLines(md, "The loop is slow. Use a map instead.", []);
  assert.deepEqual(lines, { start: 11, end: 12 });
});

test("repeated text: the heading path picks the section", () => {
  const inSummary = findLines(md, "The loop is slow.", ["## Summary"]);
  assert.deepEqual(inSummary, { start: 16, end: 16 });
  const inFindings = findLines(md, "The loop is slow.", ["## Findings", "### 2. Slow loop"]);
  assert.deepEqual(inFindings, { start: 11, end: 11 });
});

test("a heading can be the quote", () => {
  assert.deepEqual(findLines(md, "2. Slow loop", []), { start: 9, end: 9 });
});

test("text that is not in the source gives null", () => {
  assert.equal(findLines(md, "nothing like this", []), null);
});
