import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onOpened: (fileId: string) => void;
};

export default function AddFilePanel({ open, onClose, onOpened }: Props) {
  const [name, setName] = useState("");
  const [serverCwd, setServerCwd] = useState<string | null>(null);
  const [createDir, setCreateDir] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setMoreOpen(false);
    setCreateDir(null);
    setName("");
    void (async () => {
      try {
        const res = await fetch("/api/status");
        const body = (await res.json()) as { cwd?: string };
        setServerCwd(body.cwd ?? null);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [open]);

  if (!open) return null;

  const targetDir = createDir ?? serverCwd;

  async function createNamedFile() {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(createDir ? { dir: createDir } : {}),
        }),
      });
      const body = (await res.json()) as {
        opened?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.opened) {
        throw new Error(body.error ?? "failed to create file");
      }
      onOpened(body.opened.id);
      onClose();
      setName("");
      setCreateDir(null);
      setMoreOpen(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openExistingFromFinder() {
    setBusy(true);
    setLocalError(null);
    try {
      const picked = await fetch("/api/dialog/open-file", { method: "POST" });
      const pickedBody = (await picked.json()) as {
        path?: string;
        cancelled?: boolean;
        error?: string;
      };
      if (pickedBody.cancelled) return;
      if (!picked.ok || !pickedBody.path) {
        throw new Error(pickedBody.error ?? "could not open Finder");
      }

      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [pickedBody.path] }),
      });
      const body = (await res.json()) as {
        files?: { id: string; path: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "failed to open file");
      const opened =
        body.files?.find((f) => f.path === pickedBody.path) ??
        body.files?.[body.files.length - 1];
      if (!opened) throw new Error("file was not added");
      onOpened(opened.id);
      onClose();
      setName("");
      setCreateDir(null);
      setMoreOpen(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function chooseFolderFromFinder() {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/dialog/choose-folder", { method: "POST" });
      const body = (await res.json()) as {
        path?: string;
        cancelled?: boolean;
        error?: string;
      };
      if (body.cancelled) return;
      if (!res.ok || !body.path) {
        throw new Error(body.error ?? "could not open Finder");
      }
      setCreateDir(body.path);
      setMoreOpen(true);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="add-panel" role="dialog" aria-label="Add Excalidraw file">
      <div className="add-panel-head">
        <strong>Add file</strong>
        <button type="button" className="linkish" onClick={onClose}>
          Close
        </button>
      </div>

      <form
        className="add-path-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void createNamedFile();
        }}
      >
        <label className="add-label" htmlFor="exo-new">
          Name
        </label>
        <div className="add-path-row">
          <input
            id="exo-new"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder="sketch"
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />
          <button type="submit" disabled={busy || !name.trim()}>
            Create
          </button>
        </div>
        <p className="add-hint" title={targetDir ?? undefined}>
          {createDir ? "Creates in chosen folder" : "Creates in server folder"}
          {targetDir ? ` · ${targetDir}` : ""}
        </p>
      </form>

      <details
        className="add-more"
        open={moreOpen}
        onToggle={(ev) => setMoreOpen((ev.target as HTMLDetailsElement).open)}
      >
        <summary>More options</summary>
        <div className="add-more-body">
          <button
            type="button"
            className="add-secondary-btn"
            disabled={busy}
            onClick={() => void chooseFolderFromFinder()}
          >
            Choose folder…
          </button>
          <button
            type="button"
            className="add-secondary-btn"
            disabled={busy}
            onClick={() => void openExistingFromFinder()}
          >
            Open existing…
          </button>
          {createDir ? (
            <button
              type="button"
              className="linkish"
              disabled={busy}
              onClick={() => setCreateDir(null)}
            >
              Reset to server folder
            </button>
          ) : null}
        </div>
      </details>

      {localError ? <p className="add-error">{localError}</p> : null}
    </div>
  );
}
