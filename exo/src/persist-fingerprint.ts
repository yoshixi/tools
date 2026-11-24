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
