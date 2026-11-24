import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { persistFingerprint } from "@exo/persist-fingerprint";
import AddFilePanel from "./AddFilePanel";

type OpenFile = {
  id: string;
  path: string;
  name: string;
};

type Scene = {
  type: "excalidraw";
  version: number;
  source: string;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 700;

function initialFileId(): string | null {
  const id = new URLSearchParams(window.location.search).get("file");
  return id && id.length > 0 ? id : null;
}

function durableAppState(appState: Partial<AppState> | AppState) {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    theme: appState.theme,
  };
}

function fingerprintScene(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState> | AppState,
  files: BinaryFiles,
): string {
  return persistFingerprint(
    elements,
    durableAppState(appState),
    Object.keys(files),
  );
}

export default function App() {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialFileId);
  const [scene, setScene] = useState<Scene | null>(null);
  const [sceneKey, setSceneKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [workspace, setWorkspace] = useState<string | null>(null);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<number | null>(null);
  const applyingExternal = useRef(false);
  const revisionRef = useRef<number | null>(null);
  const lastPersistedFp = useRef<string | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeId) ?? null,
    [files, activeId],
  );

  const applyScene = useCallback((next: Scene, opts: { remount: boolean }) => {
    applyingExternal.current = true;
    lastPersistedFp.current = fingerprintScene(
      next.elements,
      next.appState,
      next.files,
    );
    setScene(next);

    const api = apiRef.current;
    if (!opts.remount && api) {
      // Soft update — keep camera/selection; avoids full canvas flash.
      api.updateScene({
        elements: next.elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      if (next.files && Object.keys(next.files).length > 0) {
        api.addFiles(Object.values(next.files));
      }
    } else {
      setSceneKey((k) => k + 1);
    }

    queueMicrotask(() => {
      applyingExternal.current = false;
    });
  }, []);

  const loadScene = useCallback(
    async (id: string, opts: { remount: boolean }) => {
      setError(null);
      const res = await fetch(`/api/files/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `failed to load ${id}`);
      }
      const data = (await res.json()) as { scene: Scene; revision: number };
      revisionRef.current = data.revision;
      applyScene(data.scene, opts);
    },
    [applyScene],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [filesRes, statusRes] = await Promise.all([
          fetch("/api/files"),
          fetch("/api/status"),
        ]);
        const data = (await filesRes.json()) as { files: OpenFile[] };
        const status = (await statusRes.json()) as { cwd?: string };
        if (cancelled) return;
        setWorkspace(status.cwd ?? null);
        setFiles(data.files);
        setActiveId((current) => {
          if (current && data.files.some((f) => f.id === current)) return current;
          return data.files[0]?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeId) {
      setScene(null);
      lastPersistedFp.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Switching files needs a remount; live remote edits do not.
        await loadScene(activeId, { remount: true });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, loadScene]);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("files", (ev) => {
      const next = JSON.parse((ev as MessageEvent).data) as OpenFile[];
      setFiles(next);
      setActiveId((current) => {
        if (current && next.some((f) => f.id === current)) return current;
        return next[0]?.id ?? null;
      });
    });
    es.addEventListener("file-changed", (ev) => {
      const payload = JSON.parse((ev as MessageEvent).data) as {
        id: string;
        revision?: number;
      };
      if (payload.id !== activeIdRef.current) return;
      // Our own PUT already updated revisionRef — skip the echo.
      if (
        payload.revision != null &&
        payload.revision === revisionRef.current
      ) {
        return;
      }
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void loadScene(payload.id, { remount: false }).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    });
    es.onerror = () => {
      // browser will retry; surface lightly
    };
    return () => es.close();
  }, [loadScene]);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const persist = useCallback(
    async (
      id: string,
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      binaryFiles: BinaryFiles,
    ) => {
      const fp = fingerprintScene(elements, appState, binaryFiles);
      if (fp === lastPersistedFp.current) {
        return;
      }

      setSaveState("saving");
      try {
        const body = {
          baseRevision: revisionRef.current,
          scene: {
            type: "excalidraw" as const,
            version: 2,
            source: "exo",
            elements,
            appState: durableAppState(appState),
            files: binaryFiles,
          },
        };
        const res = await fetch(`/api/files/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.status === 409) {
          await loadScene(id, { remount: false });
          setSaveState("idle");
          setError("Reloaded — another tab had a newer version");
          return;
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "save failed");
        }
        const data = (await res.json()) as { revision: number };
        revisionRef.current = data.revision;
        lastPersistedFp.current = fp;
        setError(null);
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadScene],
  );

  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      binaryFiles: BinaryFiles,
    ) => {
      if (applyingExternal.current) return;
      const id = activeIdRef.current;
      if (!id) return;

      const fp = fingerprintScene(elements, appState, binaryFiles);
      if (fp === lastPersistedFp.current) {
        // Selection / pan / zoom only — do not schedule a save.
        return;
      }

      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void persist(id, elements, appState, binaryFiles);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          ex<span>o</span>
        </div>
        <p className="hint" title={workspace ?? undefined}>
          {workspace
            ? `Workspace: ${workspace}`
            : "Local Excalidraw files. Edits save to disk."}
        </p>
        <button
          type="button"
          className="add-file-btn"
          onClick={() => setAddOpen(true)}
        >
          Add file…
        </button>
        <AddFilePanel
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onOpened={(fileId) => {
            setActiveId(fileId);
            const url = new URL(window.location.href);
            url.searchParams.set("file", fileId);
            window.history.replaceState({}, "", url);
          }}
        />
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id} className="file-row">
              <button
                type="button"
                className={`file-open ${file.id === activeId ? "active" : ""}`}
                onClick={() => {
                  setActiveId(file.id);
                  const url = new URL(window.location.href);
                  url.searchParams.set("file", file.id);
                  window.history.replaceState({}, "", url);
                }}
                title={file.path}
              >
                <span className="file-name">{file.name}</span>
                <span className="file-path">{file.path}</span>
              </button>
              <button
                type="button"
                className="file-copy-btn"
                title={`Copy ${file.name}`}
                onClick={() => {
                  void (async () => {
                    try {
                      setError(null);
                      const res = await fetch(
                        `/api/files/${encodeURIComponent(file.id)}/copy`,
                        { method: "POST" },
                      );
                      const body = (await res.json()) as {
                        opened?: { id: string };
                        error?: string;
                      };
                      if (!res.ok || !body.opened) {
                        throw new Error(body.error ?? "copy failed");
                      }
                      setActiveId(body.opened.id);
                      const url = new URL(window.location.href);
                      url.searchParams.set("file", body.opened.id);
                      window.history.replaceState({}, "", url);
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
                    }
                  })();
                }}
              >
                Copy
              </button>
            </li>
          ))}
        </ul>
        <div
          className={`status ${saveState === "saving" ? "saving" : ""} ${saveState === "error" || error ? "error" : ""}`}
        >
          {error
            ? error
            : saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? activeFile
                  ? `Saved ${activeFile.name}`
                  : "Saved"
                : activeFile
                  ? activeFile.name
                  : "No file open"}
        </div>
      </aside>
      <main
        className="canvas-wrap"
        data-file-id={activeFile?.id ?? ""}
        data-scene-key={String(sceneKey)}
        data-element-count={String(scene?.elements?.length ?? 0)}
      >
        {!activeFile || !scene ? (
          <div className="empty">
            <div>
              <strong>No drawing open</strong>
              Use <em>Add file…</em> or run{" "}
              <code>exo sketch.excalidraw</code>.
            </div>
          </div>
        ) : (
          <Excalidraw
            key={`${activeFile.id}:${sceneKey}`}
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={{
              elements: scene.elements,
              appState: {
                ...scene.appState,
                collaborators: new Map(),
              },
              files: scene.files,
              scrollToContent: true,
            }}
            onChange={onChange}
            name={activeFile.name}
          />
        )}
      </main>
    </div>
  );
}
