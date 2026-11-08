import type { Pointer } from "./types.ts";

const MAX_QUOTE = 140;

function shortQuote(quote: string): string {
  const flat = quote.replace(/\s+/g, " ").trim();
  const clipped = flat.length > MAX_QUOTE ? `${flat.slice(0, MAX_QUOTE)}…` : flat;
  return `"${clipped}"`;
}

function lineLabel(lines: { start: number; end: number }): string {
  return lines.start === lines.end ? `L${lines.start}` : `L${lines.start}-${lines.end}`;
}

// One line, parts split by " | ": source lines, heading path, quoted text.
// A CSS selector is added only when there are no source lines: the agent has no other way in.
export function formatPointer(p: Pointer): string {
  const parts: string[] = [];
  if (p.lines) parts.push(lineLabel(p.lines));
  if (p.headingPath.length) parts.push(p.headingPath.join(" > "));
  if (p.quote) parts.push(shortQuote(p.quote));
  if (!p.lines && p.selector) parts.push(`selector: ${p.selector}`);
  return parts.join(" | ");
}

export function formatComment(pointer: Pointer, message: string): string {
  return `${formatPointer(pointer)}\n${message.trim()}`;
}

export interface PageHeader {
  url: string;
  title: string;
  filePath: string | null;
}

export function formatHeader(h: PageHeader): string {
  const lines = [`Page: ${h.url}`];
  if (h.filePath) lines.push(`File: ${h.filePath}`);
  if (h.title) lines.push(`Title: ${h.title}`);
  return lines.join("\n");
}

export function formatAll(
  header: PageHeader,
  items: { pointer: Pointer; message: string }[],
): string {
  const blocks = items.map((i) => formatComment(i.pointer, i.message));
  return [formatHeader(header), ...blocks].join("\n\n");
}
