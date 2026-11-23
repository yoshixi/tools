import fs from "node:fs";
import path from "node:path";
import { exportDiagram, renderToSvg } from "@moona3k/excalidraw-export";
import { parseScene, type ExcalidrawScene } from "./scene.js";

export type ExportFormat = "png" | "svg";

export type ExportOptions = {
  format?: ExportFormat;
  /** PNG scale factor (default 2). Ignored for SVG. */
  scale?: number;
  /** When false, PNG/SVG use a transparent background. Default true. */
  background?: boolean;
};

export type ExportResult = {
  format: ExportFormat;
  outputPath: string;
  bytes: number;
};

export function defaultExportPath(
  inputPath: string,
  format: ExportFormat,
): string {
  const parsed = path.parse(inputPath);
  // sketch.excalidraw → sketch.png (not sketch.excalidraw.png)
  const base =
    parsed.ext.toLowerCase() === ".json" &&
    parsed.name.toLowerCase().endsWith(".excalidraw")
      ? parsed.name.slice(0, -".excalidraw".length)
      : parsed.name.replace(/\.excalidraw$/i, "") || parsed.name;
  return path.join(parsed.dir, `${base}.${format}`);
}

export function resolveExportFormat(
  outputPath: string | undefined,
  explicit?: ExportFormat,
): ExportFormat {
  if (explicit) return explicit;
  if (outputPath?.toLowerCase().endsWith(".svg")) return "svg";
  return "png";
}

/** Headless export — no browser. PNG via roughjs + resvg; SVG as markup. */
export async function exportExcalidrawFile(
  inputPath: string,
  outputPath: string,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  const format = resolveExportFormat(outputPath, opts.format);
  const absIn = path.resolve(inputPath);
  const absOut = path.resolve(outputPath);
  if (!fs.existsSync(absIn)) {
    throw new Error(`file not found: ${absIn}`);
  }

  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  const background = opts.background ?? true;

  if (format === "svg") {
    const scene = parseScene(fs.readFileSync(absIn, "utf8"));
    const svg = renderSceneToSvg(scene, background);
    fs.writeFileSync(absOut, svg, "utf8");
  } else {
    exportDiagram(absIn, absOut, {
      scale: opts.scale ?? 2,
      background,
    });
  }

  const bytes = fs.statSync(absOut).size;
  return { format, outputPath: absOut, bytes };
}

export function renderSceneToSvg(
  scene: ExcalidrawScene,
  background = true,
): string {
  // Library accepts the .excalidraw document shape.
  return renderToSvg(scene, { background });
}
