import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAll, formatComment, formatPointer } from "../src/core/format.ts";

const moPointer = {
  lines: { start: 11, end: 12 },
  headingPath: ["## Findings", "### 2. Slow loop"],
  quote: "The loop is slow.",
  selector: "article > p:nth-of-type(4)",
};

test("pointer with lines: lines, headings and quote; no selector", () => {
  assert.equal(
    formatPointer(moPointer),
    'L11-12 | ## Findings > ### 2. Slow loop | "The loop is slow."',
  );
});

test("a one-line range is written as a single line number", () => {
  assert.equal(formatPointer({ ...moPointer, lines: { start: 7, end: 7 } }).startsWith("L7 |"), true);
});

test("pointer without lines includes the selector", () => {
  const p = { ...moPointer, lines: null, headingPath: [] };
  assert.equal(
    formatPointer(p),
    '"The loop is slow." | selector: article > p:nth-of-type(4)',
  );
});

test("long quotes are cut and whitespace is flattened", () => {
  const p = { ...moPointer, lines: null, selector: null, headingPath: [], quote: "a\n b ".repeat(100) };
  const out = formatPointer(p);
  assert.equal(out.endsWith('…"'), true);
  assert.equal(out.includes("\n"), false);
});

test("one comment is pointer, newline, message", () => {
  assert.equal(
    formatComment(moPointer, "  Use a hash map.  "),
    'L11-12 | ## Findings > ### 2. Slow loop | "The loop is slow."\nUse a hash map.',
  );
});

test("bulk copy: header once, then blocks split by a blank line", () => {
  const out = formatAll(
    { url: "http://localhost:6275/?file=c29b2e32", title: "Review report", filePath: "/p/report.md" },
    [
      { pointer: moPointer, message: "First." },
      { pointer: { ...moPointer, lines: { start: 16, end: 16 } }, message: "Second.\nMore." },
    ],
  );
  assert.equal(
    out,
    [
      "Page: http://localhost:6275/?file=c29b2e32",
      "File: /p/report.md",
      "Title: Review report",
      "",
      'L11-12 | ## Findings > ### 2. Slow loop | "The loop is slow."',
      "First.",
      "",
      'L16 | ## Findings > ### 2. Slow loop | "The loop is slow."',
      "Second.\nMore.",
    ].join("\n"),
  );
});
