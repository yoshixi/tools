import { test } from "node:test";
import assert from "node:assert/strict";
import { findAnchor, makeAnchor } from "../src/core/anchor.ts";

const text = "Intro. The loop is slow. Middle part. The loop is slow. End of the report.";

test("finds the quote it was made from", () => {
  const start = text.indexOf("End of");
  const anchor = makeAnchor(text, { start, end: start + 6 }, "text", null);
  assert.deepEqual(findAnchor(text, anchor), { start, end: start + 6 });
});

test("repeated text: the surrounding text picks the right one", () => {
  const second = text.lastIndexOf("The loop is slow.");
  const anchor = makeAnchor(text, { start: second, end: second + 17 }, "text", null);
  assert.deepEqual(findAnchor(text, anchor), { start: second, end: second + 17 });
  const first = text.indexOf("The loop is slow.");
  const anchor1 = makeAnchor(text, { start: first, end: first + 17 }, "text", null);
  assert.deepEqual(findAnchor(text, anchor1), { start: first, end: first + 17 });
});

test("still found after text is added before it", () => {
  const start = text.indexOf("End of");
  const anchor = makeAnchor(text, { start, end: start + 6 }, "text", null);
  const edited = "NEW PARAGRAPH. " + text;
  const found = findAnchor(edited, anchor)!;
  assert.equal(edited.slice(found.start, found.end), "End of");
});

test("still found when whitespace changes", () => {
  const anchor = makeAnchor("a\nfoo bar baz\nb", { start: 2, end: 13 }, "text", null);
  const edited = "a\nfoo   bar\n  baz\nb";
  const found = findAnchor(edited, anchor)!;
  assert.equal(edited.slice(found.start, found.end), "foo   bar\n  baz");
});

test("orphan: deleted text gives null", () => {
  const anchor = makeAnchor(text, { start: 0, end: 6 }, "text", null);
  assert.equal(findAnchor("Completely different page.", anchor), null);
});

test("empty quote gives null", () => {
  const anchor = makeAnchor(text, { start: 3, end: 3 }, "element", "img");
  assert.equal(findAnchor(text, anchor), null);
});

test("element anchors keep only the head of long text but remember the length", () => {
  const long = "x".repeat(1000);
  const anchor = makeAnchor(long, { start: 0, end: 1000 }, "element", "table");
  assert.equal(anchor.exact.length, 300);
  assert.equal(anchor.length, 1000);
});
