import type { Anchor } from "./types.ts";

const CONTEXT = 40;

export interface Span {
  start: number;
  end: number;
}

export function makeAnchor(
  text: string,
  span: Span,
  kind: Anchor["kind"],
  selector: string | null,
): Anchor {
  const full = text.slice(span.start, span.end);
  // Element text can be huge. The head is enough to find it again.
  const exact = kind === "element" ? full.slice(0, 300) : full;
  return {
    kind,
    exact,
    prefix: text.slice(Math.max(0, span.start - CONTEXT), span.start),
    suffix: text.slice(span.end, span.end + CONTEXT),
    length: full.length,
    selector,
  };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

// Find the best match of the quote in the page text.
// If the same text appears many times, the surrounding text decides.
export function findAnchor(text: string, anchor: Anchor): Span | null {
  if (!anchor.exact) return null;
  const exact = findExact(text, anchor);
  if (exact) return exact;
  return findLoose(text, anchor);
}

function findExact(text: string, anchor: Anchor): Span | null {
  let best: Span | null = null;
  let bestScore = -1;
  let from = 0;
  for (;;) {
    const start = text.indexOf(anchor.exact, from);
    if (start < 0) break;
    const end = start + anchor.exact.length;
    const score =
      commonSuffix(anchor.prefix, text.slice(Math.max(0, start - CONTEXT), start)) +
      commonPrefix(anchor.suffix, text.slice(end, end + CONTEXT));
    if (score > bestScore) {
      best = { start, end };
      bestScore = score;
    }
    from = start + 1;
  }
  return best;
}

// Whitespace-insensitive fallback: edits often re-wrap lines or change spacing.
function findLoose(text: string, anchor: Anchor): Span | null {
  const { text: flat, map } = collapseWhitespace(text);
  const needle = collapseWhitespace(anchor.exact).text.trim();
  if (!needle) return null;
  const at = flat.indexOf(needle);
  if (at < 0) return null;
  const start = map[at]!;
  const end = map[at + needle.length - 1]! + 1;
  return { start, end };
}

// map[i] = index in the original string of the i-th collapsed character.
export function collapseWhitespace(s: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < s.length; i++) {
    const isSpace = /\s/.test(s[i]!);
    if (isSpace && lastSpace) continue;
    out += isSpace ? " " : s[i];
    map.push(i);
    lastSpace = isSpace;
  }
  return { text: out, map };
}
