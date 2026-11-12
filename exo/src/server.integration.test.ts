import assert from "node:assert/strict";
import fs from "node:fs";
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
      initialPaths: [target],
    });
    try {
      const res = await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      assert.equal(res.status, 200);

      const saved = JSON.parse(fs.readFileSync(target, "utf8")) as {
        elements: { id: string }[];
      };
      assert.equal(saved.elements[0]?.id, "rect-1");
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
      initialPaths: [target],
    });
    try {
      const changed = waitForSseEvent<{ id: string; path: string }>(
        `${server.url}/api/events`,
        "file-changed",
        5000,
      );

      await fetch(`${server.url}/api/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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

      assert.deepEqual(await changed, { id, path: target });
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
      initialPaths: [target],
    });
    try {
      const changed = waitForSseEvent<{ id: string; path: string }>(
        `${server.url}/api/events`,
        "file-changed",
        5000,
      );

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

      assert.deepEqual(await changed, { id, path: target });
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
          await reader.cancel();
          return JSON.parse(line.slice("data:".length).trim()) as T;
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
