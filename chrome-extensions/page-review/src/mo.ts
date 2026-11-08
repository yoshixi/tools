import type { PageKey } from "./core/url.ts";
import type { SourceInfo } from "./core/types.ts";

interface GroupsResponse {
  name: string;
  files: { id: string; path: string }[];
}

// mo serves the markdown source and the file path over a small local API.
// Any failure means "not a mo page": copy then falls back to heading path + quote.
export async function fetchSource(key: PageKey): Promise<SourceInfo> {
  const none: SourceInfo = { filePath: null, markdown: null };
  if (!key.moFileId || !key.moGroup) return none;
  try {
    const groups = (await (await fetch("/_/api/groups")).json()) as GroupsResponse[];
    const file = groups.find((g) => g.name === key.moGroup)?.files.find((f) => f.id === key.moFileId);
    if (!file) return none;
    const res = await fetch(
      `/_/api/groups/${encodeURIComponent(key.moGroup)}/files/${encodeURIComponent(key.moFileId)}/content`,
    );
    const body = (await res.json()) as { content?: string };
    return { filePath: file.path, markdown: body.content ?? null };
  } catch {
    return none;
  }
}
