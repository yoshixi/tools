import { collapseWhitespace } from "./anchor.ts";

// Markdown marks that do not show up in rendered text.
const SYNTAX = "*_`~\\#>|[]";

interface Normalized {
  text: string;
  // normalized index -> index in the original string
  map: number[];
}

function normalize(s: string): Normalized {
  let stripped = "";
  const strippedMap: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (SYNTAX.includes(s[i]!)) continue;
    stripped += s[i];
    strippedMap.push(i);
  }
  const { text, map } = collapseWhitespace(stripped);
  return { text, map: map.map((i) => strippedMap[i]!) };
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}

// Heading text can contain markdown (links, code). Compare in normalized form.
function findHeadingLine(source: string, heading: string): number | null {
  const match = /^(#+)\s+(.*)$/.exec(heading);
  if (!match) return null;
  const wanted = normalize(match[2]!).text.trim();
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]!);
    if (m && m[1]!.length === match[1]!.length && normalize(m[2]!).text.trim() === wanted) {
      return i + 1;
    }
  }
  return null;
}

function occurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) out.push(at);
  return out;
}

// Find the 1-based line range of the quote in the markdown source.
// The heading path breaks ties when the quote appears more than once.
export function findLines(
  source: string,
  quote: string,
  headingPath: string[],
): { start: number; end: number } | null {
  const src = normalize(source);
  const q = normalize(quote).text.trim();
  if (!q) return null;

  const notBefore = headingPath.length
    ? (findHeadingLine(source, headingPath[headingPath.length - 1]!) ?? 0)
    : 0;

  const pickStart = (needle: string): number | null => {
    const hits = occurrences(src.text, needle);
    if (hits.length === 0) return null;
    const lineOfHit = (h: number) => lineOf(source, src.map[h]!);
    return hits.find((h) => lineOfHit(h) >= notBefore) ?? hits[0]!;
  };

  const whole = pickStart(q);
  if (whole !== null) {
    const startLine = lineOf(source, src.map[whole]!);
    const endLine = lineOf(source, src.map[whole + q.length - 1]!);
    return { start: startLine, end: endLine };
  }

  // Links and images add text to the source that is not in the rendered quote.
  // Find the start and the end separately, with shorter chunks if a link URL splits them.
  const sizes = [30, 20, 12, 8];
  let head: number | null = null;
  for (const size of sizes) {
    if (q.length < size) continue;
    head = pickStart(q.slice(0, size));
    if (head !== null) break;
  }
  if (head === null) return null;
  const startLine = lineOf(source, src.map[head]!);

  let endLine = startLine;
  for (const size of sizes) {
    if (q.length < size) continue;
    const needle = q.slice(-size);
    const hit = occurrences(src.text, needle).find((h) => h >= head);
    if (hit === undefined) continue;
    endLine = lineOf(source, src.map[hit + needle.length - 1]!);
    break;
  }
  return { start: startLine, end: Math.max(startLine, endLine) };
}
