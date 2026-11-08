// End-to-end test: loads dist/ in Chromium and drives a real mo server.
// Needs the mo binary: MO_BIN=/path/to/mo npm run test:e2e
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const MO_BIN = process.env.MO_BIN || "mo";
// A fresh port each run: mo restores the saved session of a port.
const PORT = 6300 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), "page-review-e2e-"));
const mdPath = join(dir, "report.md");
const MD = `# Review report

Intro paragraph here.

## Findings

### 1. Missing null check

The function \`load()\` returns **null** when the cache is empty. Callers do not check it.

### 2. Slow loop

The loop in the worker is O(n^2). Use a [map](https://example.com/map) instead.

## Summary

Done.
`;
writeFileSync(mdPath, MD);

const out = execFileSync(MO_BIN, [mdPath, "--port", String(PORT), "--no-open"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const fileId = /\?file=([0-9a-f]+)/.exec(out)?.[1];
assert.ok(fileId, `could not read the mo file id from: ${out}`);
const url = `http://localhost:${PORT}/?file=${fileId}`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pr-profile-")), {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${resolve("dist")}`, `--load-extension=${resolve("dist")}`],
  permissions: ["clipboard-read", "clipboard-write"],
});
let worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));

let passed = 0;
async function step(name, fn) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

const toggle = () =>
  worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
  });
const highlightCount = () =>
  page.evaluate(() => CSS.highlights.get("page-review")?.size ?? 0);
const selectText = (text) =>
  page.evaluate((t) => {
    const walker = document.createTreeWalker(document.querySelector("article"), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.indexOf(t);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + t.length);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
        document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        return true;
      }
    }
    return false;
  }, text);
const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());
// The copy is async, so wait until the clipboard matches what the step expects.
async function clipboardWhere(test) {
  for (let i = 0; i < 40; i++) {
    const text = await readClipboard();
    if (test(text)) return text;
    await page.waitForTimeout(100);
  }
  return readClipboard();
}

try {
  await page.goto(url);
  await page.waitForSelector("article.markdown-body h1");

  await step("comment mode opens the panel", async () => {
    await toggle();
    await page.locator(".pr-panel:not(.hidden)").waitFor();
  });

  await step("select text, add a comment, highlight appears", async () => {
    assert.ok(await selectText("The loop in the worker is O(n^2)."));
    await page.locator(".pr-add-btn").click();
    await page.locator(".pr-composer textarea").fill("Use a hash map here.");
    await page.locator(".pr-composer .pr-btn.primary").click();
    await page.locator(".pr-card").waitFor();
    assert.equal(await highlightCount(), 1);
  });

  await step("pick an element (the h3) and comment on it", async () => {
    await page.getByRole("button", { name: "Pick element" }).click();
    await page.locator("article h3", { hasText: "Missing null check" }).click();
    await page.locator(".pr-composer textarea").fill("Rename this finding.");
    await page.locator(".pr-composer .pr-btn.primary").click();
    await page.locator(".pr-card").nth(1).waitFor();
    assert.equal(await highlightCount(), 2);
  });

  await step("comments survive a reload and are highlighted again", async () => {
    await page.reload();
    await page.waitForSelector("article.markdown-body h1");
    await page.waitForFunction(() => (CSS.highlights.get("page-review")?.size ?? 0) === 2);
  });

  await step("a React-style re-render keeps the highlights", async () => {
    await page.evaluate(() => {
      const a = document.querySelector("article");
      a.innerHTML = a.innerHTML;
    });
    await page.waitForFunction(() => (CSS.highlights.get("page-review")?.size ?? 0) === 2);
  });

  await step("copy all: header, file path, line numbers, heading path", async () => {
    await toggle();
    await page.getByRole("button", { name: "Copy all" }).click();
    await page.locator(".pr-toast.show").waitFor();
    const text = await readClipboard();
    console.log("--- copied ---\n" + text + "\n--------------");
    assert.ok(text.startsWith(`Page: ${url}`));
    assert.ok(text.includes(`File: ${mdPath}`) || text.includes("/report.md"));
    // line 7 is "### 1. Missing null check", line 13 is the loop sentence
    assert.match(text, /L7 \| # Review report > ## Findings > ### 1\. Missing null check/);
    assert.match(text, /L13 \| # Review report > ## Findings > ### 2\. Slow loop \| "The loop in the worker is O\(n\^2\)\./);
    assert.ok(text.indexOf("Rename this finding.") < text.indexOf("Use a hash map here."));
  });

  await step("copy one comment", async () => {
    await page.locator(".pr-card", { hasText: "hash map" }).getByRole("button", { name: "Copy" }).click();
    const text = await clipboardWhere((t) => !t.startsWith("Page:"));
    assert.ok(!text.startsWith("Page:"));
    assert.match(text, /^L13 \|/);
    assert.ok(text.endsWith("\nUse a hash map here."));
  });

  await step("hide and show highlights", async () => {
    await page.getByRole("button", { name: "Hide highlights" }).click();
    assert.equal(await highlightCount(), 0);
    await page.getByRole("button", { name: "Show highlights" }).click();
    assert.equal(await highlightCount(), 2);
  });

  await step("edit a comment", async () => {
    const card = page.locator(".pr-card", { hasText: "hash map" });
    await card.getByRole("button", { name: "Edit" }).click();
    await page.locator(".pr-edit").fill("Use a Set instead.");
    await page.getByRole("button", { name: "Save" }).click();
    await page.locator(".pr-card", { hasText: "Use a Set instead." }).waitFor();
  });

  await step("edited markdown: moved text is re-anchored, deleted text becomes orphaned", async () => {
    const edited = MD.replace("## Findings", "## Findings\n\nA new paragraph was added above.")
      .replace("### 1. Missing null check", "### 1. Something else entirely");
    writeFileSync(mdPath, edited);
    await page.locator(".pr-section-title").waitFor({ timeout: 10000 });
    assert.equal(await page.locator(".pr-card.orphan").count(), 1);
    assert.equal(await highlightCount(), 1);
    await toggle();
    await toggle();
    await page.getByRole("button", { name: "Copy all" }).click();
    const text = await clipboardWhere((t) => /L15 \|/.test(t));
    assert.match(text, /L15 \|/, "line number follows the moved text");
  });

  await step("delete a comment", async () => {
    page.once("dialog", (d) => d.accept());
    await page.locator(".pr-card", { hasText: "Use a Set instead." }).getByRole("button", { name: "Delete" }).click();
    await page.waitForFunction(() => (CSS.highlights.get("page-review")?.size ?? 0) === 0);
  });

  // ---- a normal (non-mo) page: no line numbers, so the selector is copied ----
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(readFileSync("test/fixtures/mo-like.html"));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const plain = `http://127.0.0.1:${server.address().port}/page.html?utm_source=x#top`;

  await step("plain page: comment on text, copy gives heading path + quote + selector", async () => {
    await page.goto(plain);
    await page.waitForSelector("article h1");
    await toggle();
    await page.locator(".pr-panel:not(.hidden)").waitFor();
    assert.ok(await selectText("Callers do not check it."));
    await page.locator(".pr-add-btn").click();
    await page.locator(".pr-composer textarea").fill("Add a nil check.");
    await page.locator(".pr-composer .pr-btn.primary").click();
    await page.locator(".pr-card").waitFor();
    await page.getByRole("button", { name: "Copy all" }).click();
    await page.locator(".pr-toast.show").waitFor();
    const text = await readClipboard();
    console.log("--- copied (plain page) ---\n" + text + "\n---------------------------");
    assert.ok(text.startsWith("Page: http://127.0.0.1"));
    assert.ok(!text.includes("File:"));
    assert.match(text, /# Review report > ## Findings > ### 1\. Missing null check \| "Callers do not check it\." \| selector: /);
    assert.ok(text.endsWith("\nAdd a nil check."));
  });

  await step("plain page: the URL key ignores utm params and the hash", async () => {
    await page.goto(plain.replace("utm_source=x#top", "utm_medium=y"));
    await page.waitForFunction(() => (CSS.highlights.get("page-review")?.size ?? 0) === 1);
  });

  await step("plain page: the re-render helper keeps the highlight", async () => {
    await page.evaluate(() => window.__rerender());
    await page.waitForFunction(() => (CSS.highlights.get("page-review")?.size ?? 0) === 1);
  });
  server.close();

  console.log(`\n${passed} e2e steps passed`);
} catch (err) {
  console.error("E2E FAILED:", err);
  await page.screenshot({ path: join(dir, "failure.png") });
  console.error("screenshot:", join(dir, "failure.png"));
  process.exitCode = 1;
} finally {
  await ctx.close();
  try { execFileSync(MO_BIN, ["--shutdown", "--port", String(PORT)], { stdio: "ignore" }); } catch {}
}
