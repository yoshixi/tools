/** Fields we actually write on PUT — ignore selection, scroll, zoom, etc. */
export type PersistAppState = {
  viewBackgroundColor?: string;
  gridSize?: number | null;
  theme?: string;
};

export type PersistElement = {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  [key: string]: unknown;
};

/**
 * Fingerprint of the durable scene payload.
 * Excalidraw onChange fires on hover/selection/pan; those must not trigger saves.
 */
export function persistFingerprint(
  elements: readonly PersistElement[],
  appState: PersistAppState,
  fileIds: readonly string[],
): string {
  const el = elements
    .map(
      (e) =>
        `${e.id}:${e.version}:${e.versionNonce}:${e.isDeleted ? 1 : 0}`,
    )
    .join("|");
  const app = [
    appState.viewBackgroundColor ?? "",
    appState.gridSize ?? "",
    appState.theme ?? "",
  ].join("|");
  const files = [...fileIds].sort().join(",");
  return `${el}\n${app}\n${files}`;
}

/** Geometry / style fields that mean a real edit when they change. */
const CONTENT_ELEMENT_KEYS = [
  "id",
  "type",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "isDeleted",
  "text",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "roundness",
  "locked",
  "link",
  "fileId",
] as const;

/**
 * Content identity ignoring Excalidraw version churn.
 * Same key + different persistFingerprint ⇒ normalize after load (adopt, no PUT).
 * Different key ⇒ real edit (schedule PUT).
 */
export function sceneContentKey(
  elements: readonly PersistElement[],
  appState: PersistAppState,
  fileIds: readonly string[],
): string {
  const el = elements
    .map((raw) => {
      const durable: Record<string, unknown> = {};
      for (const key of CONTENT_ELEMENT_KEYS) {
        if (key in raw) durable[key] = raw[key];
      }
      return durable;
    })
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return JSON.stringify({
    el,
    app: {
      viewBackgroundColor: appState.viewBackgroundColor ?? "",
      gridSize: appState.gridSize ?? "",
      theme: appState.theme ?? "",
    },
    files: [...fileIds].sort(),
  });
}
