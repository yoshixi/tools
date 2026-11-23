import { execFile } from "node:child_process";
import { platform } from "node:os";

export function openBrowser(url: string): void {
  const plat = platform();
  if (plat === "darwin") {
    execFile("open", [url], () => {});
    return;
  }
  if (plat === "win32") {
    execFile("cmd", ["/c", "start", "", url], () => {});
    return;
  }
  execFile("xdg-open", [url], () => {});
}
