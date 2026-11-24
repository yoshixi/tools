import assert from "node:assert/strict";
import test from "node:test";
import { helpText } from "./help.js";
import { DEFAULT_HOST, DEFAULT_PORT } from "./state.js";

test("help names start and export commands and export flags", () => {
  const text = helpText();
  assert.match(text, /exo start \[options\] \[file-or-dir \.\.\.\]/);
  assert.match(text, /exo export <file\.excalidraw>/);
  assert.match(text, /^ {2}start/m);
  assert.match(text, /-o, --output/);
  assert.match(text, /--format png\|svg/);
  assert.match(text, /--scale/);
  assert.match(text, /--no-background/);
});

test("help tells agents export needs no browser", () => {
  const text = helpText();
  assert.match(text, /without a browser/i);
  assert.match(text, /no browser \/ Playwright required/i);
});

test("help documents the HTTP export endpoint for agents", () => {
  const text = helpText();
  assert.match(text, /POST \/api\/files\/:id\/export/);
  assert.match(text, /"format"/);
  assert.match(text, /outputPath/);
});

test("help describes the agent vision workflow", () => {
  const text = helpText();
  assert.match(text, /Agent workflow/i);
  assert.match(text, /exo export diagram\.excalidraw/);
  assert.match(text, /vision model/i);
});

test("help shows default port and bind address", () => {
  const text = helpText();
  assert.match(text, new RegExp(String(DEFAULT_PORT)));
  assert.match(text, new RegExp(DEFAULT_HOST.replace(/\./g, "\\.")));
});

test("help includes concrete start and export examples", () => {
  const text = helpText();
  assert.match(text, /exo\s+# this help/);
  assert.match(text, /exo start sketch\.excalidraw/);
  assert.match(text, /exo export sketch\.excalidraw\s+# → sketch\.png/);
  assert.match(text, /exo export sketch\.excalidraw -o out\.svg/);
  assert.match(text, /--scale 3 --no-background/);
});
