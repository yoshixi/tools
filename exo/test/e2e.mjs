/**
 * Large (browser) tests for exo.
 * Spec style: one observable user outcome per step; expectations written as literals.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cli = path.join(root, "dist", "cli.js");

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("could not allocate port")));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function emptyScene() {
  return {
    type: "excalidraw",
    version: 2,
    source: "exo",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  };
}

async function waitForStatus(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/status`, {
        signal: AbortSignal.timeout(300),
      });
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server not ready: ${url}`);
}

function startDaemon({ port, stateDir, drawing }) {
  const child = spawn(
    process.execPath,
    [
      cli,
      "--serve",
      "--port",
      String(port),
      "--bind",
      "127.0.0.1",
    ],
    {
      cwd: root,
      env: { ...process.env, EXO_STATE_DIR: stateDir },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return child;
}

async function addFile(url, filePath) {
  const res = await fetch(`${url}/api/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: [filePath] }),
  });
  assert.equal(res.status, 200);
  return await res.json();
}

async function step(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "exo-e2e-"));
const stateDir = path.join(workspace, "state");
fs.mkdirSync(stateDir);
const drawing = path.join(workspace, "demo.excalidraw");
fs.writeFileSync(drawing, `${JSON.stringify(emptyScene(), null, 2)}\n`);

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const daemon = startDaemon({ port, stateDir, drawing });

let browser;
try {
  await waitForStatus(url);
  const added = await addFile(url, drawing);
  const fileId = added.files[0].id;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR", err.message);
  });

  await step("the editor page shows the open file in the sidebar", async () => {
    // SSE keeps a long-lived request open, so networkidle never settles.
    await page.goto(`${url}/?file=${fileId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    const label = await page.locator(".file-list .file-name").first().textContent();
    assert.equal(label?.trim(), "demo.excalidraw");
  });

  await step("drawing a rectangle persists elements to the .excalidraw file", async () => {
    const before = JSON.parse(fs.readFileSync(drawing, "utf8"));
    const beforeCount = (before.elements ?? []).filter((el) => !el.isDeleted).length;

    // The radio input is covered by the icon SVG; force-click the control.
    await page.getByRole("radio", { name: "Rectangle" }).click({ force: true });

    const drawSurface = page.locator("canvas.excalidraw__canvas.interactive");
    await drawSurface.waitFor({ state: "visible" });
    const box = await drawSurface.boundingBox();
    assert.ok(box, "interactive canvas should have a bounding box");

    const x1 = box.x + box.width * 0.35;
    const y1 = box.y + box.height * 0.35;
    const x2 = box.x + box.width * 0.6;
    const y2 = box.y + box.height * 0.6;

    await drawSurface.hover({ position: { x: box.width * 0.35, y: box.height * 0.35 } });
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 12 });
    await page.mouse.up();

    const start = Date.now();
    let elements = [];
    while (Date.now() - start < 10000) {
      const scene = JSON.parse(fs.readFileSync(drawing, "utf8"));
      elements = scene.elements ?? [];
      const live = elements.filter((el) => !el.isDeleted);
      if (
        live.length > beforeCount &&
        live.some((el) => el.type === "rectangle")
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const live = elements.filter((el) => !el.isDeleted);
    assert.equal(live.some((el) => el.type === "rectangle"), true);
    assert.ok(live.length > beforeCount);
  });

  await step("an external edit reloads into the open canvas", async () => {
    const previousKey = await page
      .locator(".canvas-wrap")
      .getAttribute("data-scene-key");

    const stamped = {
      type: "excalidraw",
      version: 2,
      source: "exo-e2e",
      elements: [
        {
          id: "external-rect-1",
          type: "rectangle",
          x: 40,
          y: 40,
          width: 180,
          height: 90,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#ffec99",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          index: "a0",
          roundness: null,
          seed: 2,
          version: 1,
          versionNonce: 2,
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };
    fs.writeFileSync(drawing, `${JSON.stringify(stamped, null, 2)}\n`);

    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector(".canvas-wrap");
        return (
          !!el &&
          el.getAttribute("data-scene-key") !== prev &&
          el.getAttribute("data-element-count") === "1"
        );
      },
      previousKey,
      { timeout: 10000 },
    );
  });

  console.log(`\n${3} e2e steps passed`);
} catch (err) {
  console.error("\nnot ok - e2e failed");
  console.error(err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  try {
    await fetch(`${url}/api/shutdown`, { method: "POST" });
  } catch {
    // ignore
  }
  daemon.kill("SIGTERM");
  // best-effort cleanup
  try {
    fs.rmSync(workspace, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
