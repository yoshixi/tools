import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { isExcalidrawPath } from "./paths.js";

const execFileAsync = promisify(execFile);

export class DialogCancelledError extends Error {
  constructor() {
    super("dialog cancelled");
    this.name = "DialogCancelledError";
  }
}

export async function chooseExcalidrawFile(): Promise<string> {
  const chosen = await pickPath("file");
  if (!isExcalidrawPath(chosen)) {
    throw new Error(
      "please choose a .excalidraw or .excalidraw.json file",
    );
  }
  return chosen;
}

export async function chooseFolder(): Promise<string> {
  return await pickPath("folder");
}

async function pickPath(kind: "file" | "folder"): Promise<string> {
  const plat = platform();
  if (plat === "darwin") return macChoose(kind);
  if (plat === "win32") return windowsChoose(kind);
  return linuxChoose(kind);
}

async function macChoose(kind: "file" | "folder"): Promise<string> {
  const choose =
    kind === "file"
      ? 'choose file with prompt "Open Excalidraw drawing"'
      : 'choose folder with prompt "Choose folder for new drawing"';
  const script = `
try
  POSIX path of (${choose})
on error number -128
  error "cancelled"
end try
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
    });
    const path = stdout.trim().replace(/\/$/, "");
    if (!path) throw new DialogCancelledError();
    return path;
  } catch (err) {
    if (isCancelledExec(err)) throw new DialogCancelledError();
    throw err;
  }
}

async function windowsChoose(kind: "file" | "folder"): Promise<string> {
  const script =
    kind === "file"
      ? `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Filter = 'Excalidraw|*.excalidraw;*.excalidraw.json|All|*.*'
$d.Title = 'Open Excalidraw drawing'
if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
$d.FileName
`
      : `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Choose folder for new drawing'
if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
$d.SelectedPath
`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { timeout: 300_000, maxBuffer: 1024 * 1024 },
    );
    const path = stdout.trim();
    if (!path) throw new DialogCancelledError();
    return path;
  } catch (err) {
    if (isCancelledExec(err)) throw new DialogCancelledError();
    throw err;
  }
}

async function linuxChoose(kind: "file" | "folder"): Promise<string> {
  const args =
    kind === "file"
      ? [
          "--file-selection",
          "--title=Open Excalidraw drawing",
          "--file-filter=Excalidraw | *.excalidraw *.excalidraw.json",
        ]
      : ["--file-selection", "--directory", "--title=Choose folder for new drawing"];
  try {
    const { stdout } = await execFileAsync("zenity", args, {
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
    });
    const path = stdout.trim();
    if (!path) throw new DialogCancelledError();
    return path;
  } catch (err) {
    if (isCancelledExec(err)) throw new DialogCancelledError();
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `native folder dialog unavailable (${message}). Install zenity or create via CLI.`,
    );
  }
}

function isCancelledExec(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const anyErr = err as Error & {
    code?: number | string;
    stderr?: string;
    stdout?: string;
  };
  const text =
    `${anyErr.message}\n${anyErr.stderr ?? ""}\n${anyErr.stdout ?? ""}`.toLowerCase();
  if (text.includes("cancelled") || text.includes("user canceled")) return true;
  // zenity cancel is usually exit 1 with empty output; powershell uses 2
  return anyErr.code === 2 || anyErr.code === "2";
}
