const NOISE_PARAMS = /^(utm_.*|fbclid|gclid|msclkid|mc_cid|mc_eid|ref|ref_src|_ga|_gl)$/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface PageKey {
  key: string;
  // Set when the page looks like a mo page.
  moFileId: string | null;
  // First path segment: the mo group. "default" when the path is "/".
  moGroup: string | null;
}

// Pages are identified by a normalized URL: no hash, no tracking params, sorted params.
// mo pages (localhost + ?file=) ignore the port, so a restarted mo keeps its comments.
export function pageKey(rawUrl: string): PageKey {
  const url = new URL(rawUrl);
  const file = url.searchParams.get("file");

  if (LOCAL_HOSTS.has(url.hostname) && file) {
    const group = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "") || "default";
    return { key: `mo:${group}:${file}`, moFileId: file, moGroup: group };
  }

  const params = [...url.searchParams.entries()]
    .filter(([name]) => !NOISE_PARAMS.test(name))
    .sort(([a], [b]) => a.localeCompare(b));
  const search = new URLSearchParams(params).toString();
  const key = `${url.origin}${url.pathname}${search ? `?${search}` : ""}`;
  return { key, moFileId: null, moGroup: null };
}

export function storageKey(key: string): string {
  return `pr:v1:${key}`;
}
