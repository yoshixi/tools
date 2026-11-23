declare module "@moona3k/excalidraw-export" {
  export type ExportDiagramOptions = {
    format?: "png" | "svg";
    scale?: number;
    background?: boolean;
  };

  export type ExportDiagramResult = {
    format: "png" | "svg";
    path: string;
    size: number;
    width?: number;
    height?: number;
  };

  export function exportDiagram(
    inputPath: string,
    outputPath: string,
    options?: ExportDiagramOptions,
  ): ExportDiagramResult;

  export function renderToSvg(
    doc: unknown,
    options?: { background?: boolean },
  ): string;
}
