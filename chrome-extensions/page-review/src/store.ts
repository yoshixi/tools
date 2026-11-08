import { storageKey } from "./core/url.ts";
import type { PageRecord } from "./core/types.ts";

export function emptyRecord(url: string, title: string): PageRecord {
  return { version: 1, url, title, comments: [], hidden: false };
}

export async function loadRecord(key: string, url: string, title: string): Promise<PageRecord> {
  const k = storageKey(key);
  const got = await chrome.storage.local.get(k);
  return (got[k] as PageRecord | undefined) ?? emptyRecord(url, title);
}

// An empty page is removed so storage does not fill with blank records.
export async function saveRecord(key: string, record: PageRecord): Promise<void> {
  const k = storageKey(key);
  if (record.comments.length === 0 && !record.hidden) {
    await chrome.storage.local.remove(k);
  } else {
    await chrome.storage.local.set({ [k]: record });
  }
}
