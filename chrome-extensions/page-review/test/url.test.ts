import { test } from "node:test";
import assert from "node:assert/strict";
import { pageKey, storageKey } from "../src/core/url.ts";

test("mo page: key uses the file id and ignores the port", () => {
  const a = pageKey("http://localhost:6275/?file=c29b2e32");
  const b = pageKey("http://localhost:7000/?file=c29b2e32");
  assert.equal(a.key, "mo:default:c29b2e32");
  assert.equal(a.key, b.key);
  assert.equal(a.moFileId, "c29b2e32");
});

test("mo page: the group comes from the first path segment", () => {
  const k = pageKey("http://127.0.0.1:6275/design?file=abc");
  assert.equal(k.key, "mo:design:abc");
  assert.equal(k.moGroup, "design");
});

test("mo page: noise in the URL is ignored", () => {
  const k = pageKey("http://localhost:6275/?file=abc&theme=dark#heading-2");
  assert.equal(k.key, "mo:default:abc");
});

test("normal page: hash and tracking params are dropped", () => {
  const k = pageKey("https://example.com/docs/a?utm_source=x&b=2&a=1&fbclid=z#top");
  assert.equal(k.key, "https://example.com/docs/a?a=1&b=2");
  assert.equal(k.moFileId, null);
});

test("normal page: ?file= on a remote host is not treated as mo", () => {
  const k = pageKey("https://example.com/download?file=report.pdf");
  assert.equal(k.moFileId, null);
  assert.equal(k.key, "https://example.com/download?file=report.pdf");
});

test("storage key is prefixed and versioned", () => {
  assert.equal(storageKey("mo:default:abc"), "pr:v1:mo:default:abc");
});
