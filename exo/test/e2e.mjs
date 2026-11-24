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

function startDaemon({ port, stateDir, workspaceDir }) {
  const child = spawn(
    process.execPath,
    [
      cli,
      "--serve",
      "--port",
      String(port),
      "--bind",
      "127.0.0.1",
      "--cwd",
      workspaceDir,
    ],
    {
      cwd: workspaceDir,
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
const daemon = startDaemon({ port, stateDir, workspaceDir: workspace });

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

  await step(
    "a stroke drawn right after load still reaches disk",
    async () => {
      // Regression: settle/adopt logic used to mark early strokes as already
      // persisted, so they never reached disk (looked like a flaky reload loss).
      const earlyPath = path.join(workspace, "early.excalidraw");
      fs.writeFileSync(earlyPath, `${JSON.stringify(emptyScene(), null, 2)}\n`);
      const addedEarly = await addFile(url, earlyPath);
      const earlyId = addedEarly.files.find((f) => f.id !== fileId)?.id;
      assert.ok(earlyId, "expected a new file id for early.excalidraw");

      let putCount = 0;
      const onReq = (req) => {
        if (req.method() === "PUT" && req.url().includes(`/api/files/${earlyId}`)) {
          putCount += 1;
        }
      };
      page.on("request", onReq);

      await page.goto(`${url}/?file=${earlyId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector(".excalidraw", { timeout: 30000 });
      const drawSurface = page.locator("canvas.excalidraw__canvas.interactive");
      await drawSurface.waitFor({ state: "visible" });
      await page.getByRole("radio", { name: "Rectangle" }).click({ force: true });
      const box = await drawSurface.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.55,
        box.y + box.height * 0.55,
        { steps: 10 },
      );
      await page.mouse.up();

      const start = Date.now();
      let live = [];
      while (Date.now() - start < 10000) {
        const scene = JSON.parse(fs.readFileSync(earlyPath, "utf8"));
        live = (scene.elements ?? []).filter((el) => !el.isDeleted);
        if (live.length > 0) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      page.off("request", onReq);
      assert.ok(
        live.length > 0,
        `expected early stroke to persist (elements=${live.length}, puts=${putCount})`,
      );
    },
  );

  await step(
    "reload before debounce still keeps the last stroke on disk",
    async () => {
      const flushPath = path.join(workspace, "flush.excalidraw");
      fs.writeFileSync(flushPath, `${JSON.stringify(emptyScene(), null, 2)}\n`);
      const addedFlush = await addFile(url, flushPath);
      const flushId = addedFlush.files.find(
        (f) => f.name === "flush.excalidraw",
      )?.id;
      assert.ok(flushId);

      await page.goto(`${url}/?file=${flushId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector(".excalidraw", { timeout: 30000 });
      // Let the post-load settle window end so this step isolates pagehide flush.
      await page.waitForTimeout(1200);

      await page.getByRole("radio", { name: "Rectangle" }).click({ force: true });
      const drawSurface = page.locator("canvas.excalidraw__canvas.interactive");
      const box = await drawSurface.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.6,
        box.y + box.height * 0.6,
        { steps: 10 },
      );
      await page.mouse.up();
      // Beat the 700ms debounce — pagehide must flush the pending PUT.
      await page.waitForTimeout(150);
      await page.goto(`${url}/?file=${flushId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector(".excalidraw", { timeout: 30000 });

      const start = Date.now();
      let live = [];
      while (Date.now() - start < 8000) {
        const scene = JSON.parse(fs.readFileSync(flushPath, "utf8"));
        live = (scene.elements ?? []).filter((el) => !el.isDeleted);
        if (live.length > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(
        live.length > 0,
        "expected pagehide flush to persist stroke before reload",
      );
    },
  );

  await step(
    "idle interaction does not keep GETting /api/files/:id",
    async () => {
      let sceneGets = 0;
      const onRequest = (req) => {
        if (req.method() !== "GET") return;
        let pathname;
        try {
          pathname = new URL(req.url()).pathname;
        } catch {
          return;
        }
        // /api/files/<id> only — not /api/files or /api/files/<id>/export
        if (/^\/api\/files\/[^/]+$/.test(pathname)) sceneGets += 1;
      };
      page.on("request", onRequest);

      await page.goto(`${url}/?file=${fileId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector(".excalidraw", { timeout: 30000 });
      // Allow the initial load + soft settle.
      await page.waitForTimeout(1500);
      const afterLoad = sceneGets;

      const drawSurface = page.locator("canvas.excalidraw__canvas.interactive");
      await drawSurface.click({
        position: { x: 40, y: 40 },
        force: true,
      });
      await page.waitForTimeout(2500);

      page.off("request", onRequest);
      assert.equal(
        sceneGets,
        afterLoad,
        `expected no extra scene GETs after idle/click (had ${sceneGets - afterLoad})`,
      );
    },
  );

  await step("an external edit shows up on the open canvas", async () => {
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

    // Soft update keeps scene-key stable; element count is the observable signal.
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".canvas-wrap");
        return !!el && el.getAttribute("data-element-count") === "1";
      },
      undefined,
      { timeout: 10000 },
    );
  });

  console.log(`\n${6} e2e steps passed`);
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
