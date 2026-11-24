import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileIdForPath } from "./registry.js";
import { startServer } from "./server.js";
import { freePort, tempWorkspace, withExoStateDir } from "./test/helpers.js";

test("opening a missing .excalidraw path creates an empty document on disk", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = ws.drawingPath("new.excalidraw");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [target],
    });
    try {
      assert.equal(fs.existsSync(target), true);
      const saved = JSON.parse(fs.readFileSync(target, "utf8")) as {
        elements: unknown[];
      };
      assert.deepEqual(saved.elements, []);
    } finally {
      await server.close();
    }
  });
});

test("PUT /api/files/:id writes the scene JSON back to the real file", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = ws.writeDrawing("box.excalidraw");
  const id = fileIdForPath(target);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [target],
    });
    try {
      const loaded = await fetch(`${server.url}/api/files/${id}`);
      const before = (await loaded.json()) as { revision: number };
      assert.equal(before.revision, 1);

      const res = await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: before.revision,
          scene: {
            type: "excalidraw",
            version: 2,
            source: "exo",
            elements: [{ id: "rect-1", type: "rectangle", x: 1, y: 2 }],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          },
        }),
      });
      const body = (await res.json()) as { ok: boolean; revision: number };
      assert.equal(res.status, 200);
      assert.equal(body.revision, 2);

      const saved = JSON.parse(fs.readFileSync(target, "utf8")) as {
        elements: { id: string }[];
      };
      assert.equal(saved.elements[0]?.id, "rect-1");
    } finally {
      await server.close();
    }
  });
});

test("PUT /api/files/:id rejects a stale baseRevision with 409", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = ws.writeDrawing("box.excalidraw");
  const id = fileIdForPath(target);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [target],
    });
    try {
      const first = await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: 1,
          scene: {
            type: "excalidraw",
            version: 2,
            source: "exo",
            elements: [{ id: "from-tab-a", type: "rectangle" }],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          },
        }),
      });
      assert.equal(first.status, 200);

      const stale = await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: 1,
          scene: {
            type: "excalidraw",
            version: 2,
            source: "exo",
            elements: [{ id: "from-tab-b-stale", type: "ellipse" }],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          },
        }),
      });
      const body = (await stale.json()) as {
        error: string;
        revision: number;
        scene: { elements: { id: string }[] };
      };
      assert.equal(stale.status, 409);
      assert.equal(body.error, "conflict");
      assert.equal(body.revision, 2);
      assert.equal(body.scene.elements[0]?.id, "from-tab-a");

      const onDisk = JSON.parse(fs.readFileSync(target, "utf8")) as {
        elements: { id: string }[];
      };
      assert.equal(onDisk.elements[0]?.id, "from-tab-a");
    } finally {
      await server.close();
    }
  });
});

test("PUT /api/files/:id announces file-changed so other tabs can reload", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = ws.writeDrawing("shared.excalidraw");
  const id = fileIdForPath(target);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [target],
    });
    try {
      const changed = waitForSseEvent<{
        id: string;
        path: string;
        revision: number;
      }>(`${server.url}/api/events`, "file-changed", 5000);

      const res = await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: 1,
          scene: {
            type: "excalidraw",
            version: 2,
            source: "exo",
            elements: [{ id: "from-tab-a", type: "rectangle" }],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          },
        }),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await changed, { id, path: target, revision: 2 });
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files adds another drawing to the open session", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const first = ws.writeDrawing("a.excalidraw");
  const second = ws.writeDrawing("b.excalidraw");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [first],
    });
    try {
      const res = await fetch(`${server.url}/api/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [second] }),
      });
      const body = (await res.json()) as { files: { name: string }[] };

      assert.deepEqual(
        body.files.map((f) => f.name),
        ["a.excalidraw", "b.excalidraw"],
      );
    } finally {
      await server.close();
    }
  });
});

test("GET /api/browse defaults to the server start cwd", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  ws.writeDrawing("here.excalidraw");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
    });
    try {
      const status = (await (await fetch(`${server.url}/api/status`)).json()) as {
        cwd: string;
      };
      assert.equal(status.cwd, ws.dir);

      const browse = (await (await fetch(`${server.url}/api/browse`)).json()) as {
        dir: string;
        entries: { name: string }[];
      };
      assert.equal(browse.dir, ws.dir);
      assert.equal(
        browse.entries.some((e) => e.name === "here.excalidraw"),
        true,
      );
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files rejects drawings outside the workspace", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const outside = path.join(os.tmpdir(), `exo-outside-${port}.excalidraw`);
  fs.writeFileSync(outside, "{}");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
    });
    try {
      const res = await fetch(`${server.url}/api/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [outside] }),
      });
      assert.equal(res.status, 500);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /outside the workspace/);
    } finally {
      await server.close();
      fs.rmSync(outside, { force: true });
    }
  });
});

test("POST /api/files/:id/copy duplicates a drawing beside the original", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const source = ws.writeDrawing("sketch.excalidraw", [
    { id: "r1", type: "rectangle" },
  ]);
  const id = fileIdForPath(source);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [source],
    });
    try {
      const res = await fetch(
        `${server.url}/api/files/${encodeURIComponent(id)}/copy`,
        { method: "POST" },
      );
      const body = (await res.json()) as {
        opened: { path: string; name: string };
      };
      assert.equal(res.status, 200);
      assert.equal(body.opened.name, "sketch copy.excalidraw");
      assert.equal(fs.existsSync(body.opened.path), true);
      const copied = JSON.parse(fs.readFileSync(body.opened.path, "utf8")) as {
        elements: { id: string }[];
      };
      assert.equal(copied.elements[0]?.id, "r1");
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files/:id/export writes a PNG beside the drawing", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const source = ws.writeDrawing("box.excalidraw", [
    { id: "r1", type: "rectangle", x: 0, y: 0, width: 40, height: 20 },
  ]);
  const id = fileIdForPath(source);
  const expectedPng = path.join(ws.dir, "box.png");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [source],
    });
    try {
      const res = await fetch(
        `${server.url}/api/files/${encodeURIComponent(id)}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "png", scale: 1 }),
        },
      );
      const body = (await res.json()) as {
        format: string;
        outputPath: string;
        bytes: number;
      };
      assert.equal(res.status, 200);
      assert.equal(body.format, "png");
      assert.equal(body.outputPath, expectedPng);
      assert.ok(body.bytes > 0);
      const magic = fs.readFileSync(expectedPng).subarray(0, 8);
      assert.deepEqual(
        [...magic],
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files/:id/export writes SVG when format is svg", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const source = ws.writeDrawing("box.excalidraw");
  const id = fileIdForPath(source);
  const expectedSvg = path.join(ws.dir, "box.svg");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [source],
    });
    try {
      const res = await fetch(
        `${server.url}/api/files/${encodeURIComponent(id)}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "svg" }),
        },
      );
      const body = (await res.json()) as { format: string; outputPath: string };
      assert.equal(res.status, 200);
      assert.equal(body.format, "svg");
      assert.equal(body.outputPath, expectedSvg);
      assert.match(fs.readFileSync(expectedSvg, "utf8"), /^<svg[\s>]/);
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files/:id/export honors a custom output path inside the workspace", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const source = ws.writeDrawing("box.excalidraw");
  const id = fileIdForPath(source);
  const customOut = path.join(ws.dir, "exports", "custom.png");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [source],
    });
    try {
      const res = await fetch(
        `${server.url}/api/files/${encodeURIComponent(id)}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ output: customOut, scale: 1 }),
        },
      );
      const body = (await res.json()) as { outputPath: string; format: string };
      assert.equal(res.status, 200);
      assert.equal(body.format, "png");
      assert.equal(body.outputPath, customOut);
      assert.equal(fs.existsSync(customOut), true);
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files/:id/export rejects an output path outside the workspace", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const source = ws.writeDrawing("box.excalidraw");
  const id = fileIdForPath(source);
  const outside = path.join(os.tmpdir(), `exo-export-outside-${Date.now()}.png`);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [source],
    });
    try {
      const res = await fetch(
        `${server.url}/api/files/${encodeURIComponent(id)}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ output: outside }),
        },
      );
      assert.equal(res.status, 500);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /outside the workspace|workspace/i);
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files/:id/export returns 404 when the file is not open", async () => {
  const ws = tempWorkspace();
  const port = await freePort();

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
    });
    try {
      const res = await fetch(
        `${server.url}/api/files/${encodeURIComponent("missing-id")}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "png" }),
        },
      );
      assert.equal(res.status, 404);
    } finally {
      await server.close();
    }
  });
});

test("POST /api/files/create makes a named drawing in the server cwd", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = path.join(ws.dir, "brand-new.excalidraw");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
    });
    try {
      assert.equal(fs.existsSync(target), false);
      const res = await fetch(`${server.url}/api/files/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "brand-new" }),
      });
      const body = (await res.json()) as {
        opened: { path: string; name: string };
      };
      assert.equal(res.status, 200);
      assert.equal(body.opened.path, target);
      assert.equal(fs.existsSync(target), true);
    } finally {
      await server.close();
    }
  });
});

test("GET /api/browse lists folders and Excalidraw files in a directory", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  fs.mkdirSync(path.join(ws.dir, "nested"));
  ws.writeDrawing("pick-me.excalidraw");
  fs.writeFileSync(path.join(ws.dir, "ignore.md"), "# no");

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
    });
    try {
      const res = await fetch(
        `${server.url}/api/browse?dir=${encodeURIComponent(ws.dir)}`,
      );
      const body = (await res.json()) as {
        entries: { kind: string; name: string }[];
      };
      assert.equal(res.status, 200);
      assert.deepEqual(
        body.entries.map((e) => [e.kind, e.name]),
        [
          ["dir", "nested"],
          ["dir", "state"],
          ["file", "pick-me.excalidraw"],
        ],
      );
    } finally {
      await server.close();
    }
  });
});

test("GET / serves the built web UI", async () => {
  const ws = tempWorkspace();
  const port = await freePort();

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
    });
    try {
      const res = await fetch(`${server.url}/`);
      const html = await res.text();
      assert.equal(res.status, 200);
      assert.match(html, /<div id="root"><\/div>/);
    } finally {
      await server.close();
    }
  });
});

test("rewriting the same bytes after a PUT does not announce again", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = ws.writeDrawing("echo.excalidraw");
  const id = fileIdForPath(target);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [target],
    });
    try {
      const announced: { revision: number }[] = [];
      const controller = new AbortController();
      void (async () => {
        const res = await fetch(`${server.url}/api/events`, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n");
          buffer = chunks.pop() ?? "";
          for (const line of chunks) {
            if (line.startsWith("event:")) {
              currentEvent = line.slice("event:".length).trim();
            } else if (
              line.startsWith("data:") &&
              currentEvent === "file-changed"
            ) {
              announced.push(
                JSON.parse(line.slice("data:".length).trim()) as {
                  revision: number;
                },
              );
            } else if (line === "") {
              currentEvent = "message";
            }
          }
        }
      })().catch(() => {});

      const put = await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: 1,
          scene: {
            type: "excalidraw",
            version: 2,
            source: "exo",
            elements: [{ id: "echo", type: "rectangle" }],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          },
        }),
      });
      assert.equal(put.status, 200);

      // Wait for the PUT announce, then past the ignore window.
      await new Promise((r) => setTimeout(r, 200));
      assert.ok(announced.some((e) => e.revision === 2));

      const sameBytes = fs.readFileSync(target, "utf8");
      await new Promise((r) => setTimeout(r, 900));
      fs.writeFileSync(target, sameBytes);
      await new Promise((r) => setTimeout(r, 600));

      assert.equal(
        announced.filter((e) => e.revision >= 3).length,
        0,
        "identical rewrite must not bump revision",
      );
      controller.abort();
    } finally {
      await server.close();
    }
  });
});

test("an external rewrite is announced even inside the post-save ignore window", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = ws.writeDrawing("race.excalidraw");
  const id = fileIdForPath(target);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [target],
    });
    try {
      // Skip the PUT's own announce; wait for the later disk rewrite.
      const changed = waitForSseEventMatching<{
        id: string;
        path: string;
        revision: number;
      }>(
        `${server.url}/api/events`,
        "file-changed",
        (payload) => payload.revision >= 3,
        5000,
      );

      await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: 1,
          scene: {
            type: "excalidraw",
            version: 2,
            source: "exo",
            elements: [{ id: "from-api", type: "rectangle" }],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          },
        }),
      });

      // Overwrite immediately: content differs from the PUT payload, so watchers
      // must still notify clients even though the ignore window is active.
      fs.writeFileSync(
        target,
        JSON.stringify({
          type: "excalidraw",
          version: 2,
          source: "exo",
          elements: [{ id: "from-disk", type: "ellipse" }],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
        }),
      );

      assert.deepEqual(await changed, { id, path: target, revision: 3 });
    } finally {
      await server.close();
    }
  });
});

test("an external file change is announced on the events stream", async () => {
  const ws = tempWorkspace();
  const port = await freePort();
  const target = ws.writeDrawing("watched.excalidraw");
  const id = fileIdForPath(target);

  await withExoStateDir(ws.stateDir, async () => {
    const server = await startServer({
      host: "127.0.0.1",
      port,
      version: "test",
      cwd: ws.dir,
      initialPaths: [target],
    });
    try {
      const changed = waitForSseEvent<{
        id: string;
        path: string;
        revision: number;
      }>(`${server.url}/api/events`, "file-changed", 5000);

      // Give the watcher a moment to attach, then rewrite the file.
      await new Promise((r) => setTimeout(r, 300));
      fs.writeFileSync(
        target,
        JSON.stringify({
          type: "excalidraw",
          version: 2,
          source: "exo",
          elements: [{ id: "from-disk", type: "ellipse" }],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
        }),
      );

      assert.deepEqual(await changed, { id, path: target, revision: 2 });
    } finally {
      await server.close();
    }
  });
});

async function waitForSseEvent<T>(
  url: string,
  eventName: string,
  timeoutMs: number,
): Promise<T> {
  return waitForSseEventMatching(url, eventName, () => true, timeoutMs);
}

async function waitForSseEventMatching<T>(
  url: string,
  eventName: string,
  match: (payload: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    assert.equal(res.ok, true);
    assert.ok(res.body);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n");
      buffer = chunks.pop() ?? "";
      for (const line of chunks) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice("event:".length).trim();
        } else if (line.startsWith("data:") && currentEvent === eventName) {
          const payload = JSON.parse(line.slice("data:".length).trim()) as T;
          if (match(payload)) {
            await reader.cancel();
            return payload;
          }
        } else if (line === "") {
          currentEvent = "message";
        }
      }
    }
    throw new Error(`stream ended before ${eventName}`);
  } finally {
    clearTimeout(timer);
  }
}
