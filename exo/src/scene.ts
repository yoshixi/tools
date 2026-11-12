export type ExcalidrawScene = {
  type: "excalidraw";
  version: number;
  source: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

export function emptyScene(): ExcalidrawScene {
  return {
    type: "excalidraw",
    version: 2,
    source: "exo",
    elements: [],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
    },
    files: {},
  };
}

export function parseScene(raw: string): ExcalidrawScene {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON");
  }
  return sceneFromUnknown(data);
}

/** Normalize any JSON-ish payload into a writable .excalidraw scene. */
export function sceneFromUnknown(raw: unknown): ExcalidrawScene {
  if (!raw || typeof raw !== "object") {
    throw new Error("scene must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const elements = Array.isArray(obj.elements) ? obj.elements : [];
  const appState =
    obj.appState && typeof obj.appState === "object"
      ? (obj.appState as Record<string, unknown>)
      : { viewBackgroundColor: "#ffffff" };
  const files =
    obj.files && typeof obj.files === "object"
      ? (obj.files as Record<string, unknown>)
      : {};

  return {
    type: "excalidraw",
    version: typeof obj.version === "number" ? obj.version : 2,
    source: typeof obj.source === "string" ? obj.source : "exo",
    elements,
    appState,
    files,
  };
}

export function serializeScene(scene: ExcalidrawScene): string {
  return `${JSON.stringify(scene, null, 2)}\n`;
}
