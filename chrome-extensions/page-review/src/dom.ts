import type { Heading } from "./core/headings.ts";

export const HOST_ID = "page-review-host";

export interface TextIndex {
  text: string;
  nodes: { node: Text; start: number }[];
}

// For mo, only the rendered markdown is reviewed, not the sidebar or toolbar.
export function findRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("article.markdown-body") ??
    document.querySelector<HTMLElement>("main") ??
    document.body
  );
}

export function buildTextIndex(root: HTMLElement): TextIndex {
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const parent = n.parentElement;
      if (!parent || parent.closest(`script, style, noscript, #${HOST_ID}`)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start: text.length });
    text += n.textContent ?? "";
  }
  return { text, nodes };
}

function offsetOf(index: TextIndex, container: Node, offset: number): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const hit = index.nodes.find((n) => n.node === container);
    return hit ? hit.start + offset : null;
  }
  // Range edge is an element: use the first text node at or after that child.
  const child = container.childNodes[offset];
  const probe = child ?? container;
  const after = index.nodes.find(
    (n) =>
      probe.contains(n.node) ||
      (probe.compareDocumentPosition(n.node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );
  if (!child) {
    // Edge is after the last child: end of the last text node inside the container.
    const inside = index.nodes.filter((n) => container.contains(n.node));
    const last = inside[inside.length - 1];
    return last ? last.start + (last.node.textContent?.length ?? 0) : (after?.start ?? null);
  }
  return after ? after.start : index.text.length;
}

export function rangeToSpan(index: TextIndex, range: Range) {
  const start = offsetOf(index, range.startContainer, range.startOffset);
  const end = offsetOf(index, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

export function spanToRange(index: TextIndex, span: { start: number; end: number }): Range | null {
  const locate = (offset: number, isEnd: boolean) => {
    for (const { node, start } of index.nodes) {
      const len = node.textContent?.length ?? 0;
      const inside = isEnd ? offset > start && offset <= start + len : offset >= start && offset < start + len;
      if (inside) return { node, offset: offset - start };
    }
    return null;
  };
  const a = locate(span.start, false);
  const b = locate(span.end, true);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

export function elementSpan(index: TextIndex, el: Element): { start: number; end: number } | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  return rangeToSpan(index, range);
}

// A short selector that still points at the same element. Prefers ids.
export function cssSelector(el: Element, root: Element): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur && cur !== root.parentElement; cur = cur.parentElement) {
    if (cur.id && document.querySelectorAll(`#${CSS.escape(cur.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      break;
    }
    const tag = cur.tagName.toLowerCase();
    const same = cur.parentElement
      ? [...cur.parentElement.children].filter((c) => c.tagName === cur!.tagName)
      : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
    if (cur === document.body) break;
  }
  return parts.join(" > ");
}

export function headingsBefore(root: HTMLElement, node: Node): Heading[] {
  const out: Heading[] = [];
  for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const before = h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING;
    // The heading itself counts when the node is inside it.
    if (before || h.contains(node)) {
      out.push({
        level: Number(h.tagName[1]),
        text: (h.textContent ?? "").replace(/\s+/g, " ").trim(),
      });
    }
  }
  return out;
}

export function describeElement(el: Element): string {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 300);
  const tag = el.tagName.toLowerCase();
  const alt = el.getAttribute("alt");
  return alt ? `<${tag} alt="${alt}">` : `<${tag}>`;
}
