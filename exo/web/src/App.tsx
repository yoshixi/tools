import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
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

function initialFileId(): string | null {
  const id = new URLSearchParams(window.location.search).get("file");
  return id && id.length > 0 ? id : null;
}

export default function App() {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialFileId);
  const [scene, setScene] = useState<Scene | null>(null);
  const [sceneKey, setSceneKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<number | null>(null);
  const applyingExternal = useRef(false);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeId) ?? null,
    [files, activeId],
  );

  const loadScene = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/files/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `failed to load ${id}`);
    }
    const data = (await res.json()) as { scene: Scene };
    applyingExternal.current = true;
    setScene(data.scene);
    setSceneKey((k) => k + 1);
    queueMicrotask(() => {
      applyingExternal.current = false;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/files");
        const data = (await res.json()) as { files: OpenFile[] };
        if (cancelled) return;
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
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadScene(activeId);
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
      const payload = JSON.parse((ev as MessageEvent).data) as { id: string };
      if (payload.id !== activeIdRef.current) return;
      // Still allow reload while a save debounce is pending: disk is source of truth
      // for external edits. Clear the pending save so it cannot overwrite the reload.
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void loadScene(payload.id).catch((err) => {
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
      setSaveState("saving");
      try {
        const body = {
          scene: {
            type: "excalidraw" as const,
            version: 2,
            source: "exo",
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              gridSize: appState.gridSize,
              theme: appState.theme,
            },
            files: binaryFiles,
          },
        };
        const res = await fetch(`/api/files/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "save failed");
        }
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
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
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void persist(id, elements, appState, binaryFiles);
      }, 400);
    },
    [persist],
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          ex<span>o</span>
        </div>
        <p className="hint">Local Excalidraw files. Edits save to disk.</p>
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
            <li key={file.id}>
              <button
                type="button"
                className={file.id === activeId ? "active" : undefined}
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
