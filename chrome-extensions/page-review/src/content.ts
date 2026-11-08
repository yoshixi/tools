import css from "./ui/panel.css";
import { findAnchor, makeAnchor, type Span } from "./core/anchor.ts";
import { formatAll, formatComment } from "./core/format.ts";
import { headingPath } from "./core/headings.ts";
import { findLines } from "./core/lines.ts";
import type { Comment, PageRecord, Pointer, SourceInfo } from "./core/types.ts";
import { pageKey, storageKey, type PageKey } from "./core/url.ts";
import {
  HOST_ID,
  buildTextIndex,
  cssSelector,
  describeElement,
  elementSpan,
  findRoot,
  headingsBefore,
  rangeToSpan,
  spanToRange,
  type TextIndex,
} from "./dom.ts";
import { fetchSource } from "./mo.ts";
import { emptyRecord, loadRecord, saveRecord } from "./store.ts";

// The script may be injected twice (extension reload). Only the first one runs.
const FLAG = "__pageReviewLoaded";
const flags = window as unknown as Record<string, unknown>;
if (!flags[FLAG]) {
  flags[FLAG] = true;
  void main();
}

type Draft = { kind: "text"; range: Range } | { kind: "element"; el: Element };

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", `pr-btn ${cls}`.trim(), label);
  // Keep the page selection alive while the button is pressed.
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", onClick);
  return b;
}

async function main() {
  let key: PageKey = pageKey(location.href);
  let record: PageRecord = await loadRecord(key.key, location.href, document.title);
  let source: SourceInfo = { filePath: null, markdown: null };
  let index: TextIndex = { text: "", nodes: [] };
  const ranges = new Map<string, Range>();
  const spans = new Map<string, Span>();
  const orphans = new Set<string>();

  let active = false;
  let picking = false;
  let focusId: string | null = null;
  let editingId: string | null = null;

  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let toolbar!: HTMLElement;
  let panel!: HTMLElement;
  let overlay!: HTMLElement;
  let toastEl!: HTMLElement;
  let toastTimer = 0;

  // Highlights are drawn by the browser (CSS Custom Highlight API). The page DOM is
  // never changed, so React re-renders in mo cannot break them.
  const highlightStyle = document.createElement("style");
  highlightStyle.textContent = `
    ::highlight(page-review) { background-color: rgba(255, 196, 0, 0.35); }
    ::highlight(page-review-focus) { background-color: rgba(255, 140, 0, 0.6); }`;
  document.head.appendChild(highlightStyle);

  // ---- anchoring -------------------------------------------------------

  function reattach() {
    const root = findRoot();
    index = buildTextIndex(root);
    ranges.clear();
    spans.clear();
    orphans.clear();
    for (const c of record.comments) {
      let span = findAnchor(index.text, c.anchor);
      // The selector is only trusted for elements with no text (images). If the text
      // was edited, the same selector may now point at different content: show an orphan.
      if (!span && !c.anchor.exact && c.anchor.selector) {
        const el = safeQuery(c.anchor.selector);
        if (el && root.contains(el)) span = elementSpan(index, el);
      }
      const range = span ? spanToRange(index, fullSpan(c, span)) : null;
      if (span && range) {
        spans.set(c.id, span);
        ranges.set(c.id, range);
      } else {
        orphans.add(c.id);
      }
    }
    paintHighlights();
    renderPanel();
  }

  // Element comments cover the whole element, not just the stored head of its text.
  function fullSpan(c: Comment, span: Span): Span {
    if (c.anchor.kind !== "element") return span;
    return { start: span.start, end: Math.min(index.text.length, span.start + c.anchor.length) };
  }

  function safeQuery(sel: string): Element | null {
    try {
      return document.querySelector(sel);
    } catch {
      return null;
    }
  }

  function paintHighlights() {
    CSS.highlights.delete("page-review");
    CSS.highlights.delete("page-review-focus");
    if (record.hidden) return;
    const normal: Range[] = [];
    for (const [id, r] of ranges) if (id !== focusId) normal.push(r);
    if (normal.length) CSS.highlights.set("page-review", new Highlight(...normal));
    const focus = focusId ? ranges.get(focusId) : undefined;
    if (focus) CSS.highlights.set("page-review-focus", new Highlight(focus));
  }

  // ---- storage ---------------------------------------------------------

  async function persist() {
    record.url = location.href;
    record.title = document.title;
    await saveRecord(key.key, record);
  }

  async function switchPage() {
    key = pageKey(location.href);
    record = await loadRecord(key.key, location.href, document.title);
    source = { filePath: null, markdown: null };
    focusId = null;
    editingId = null;
    reattach();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[storageKey(key.key)];
    if (!change) return;
    const next =
      (change.newValue as PageRecord | undefined) ?? emptyRecord(location.href, document.title);
    if (JSON.stringify(next) === JSON.stringify(record)) return;
    record = next;
    reattach();
  });

  // ---- copy ------------------------------------------------------------

  async function pointerFor(c: Comment): Promise<Pointer> {
    const range = ranges.get(c.id);
    const path = range
      ? headingPath(headingsBefore(findRoot(), range.startContainer))
      : c.headingPath;
    const lines = source.markdown ? findLines(source.markdown, c.quote, path) : null;
    return { lines, headingPath: path, quote: c.quote, selector: c.anchor.selector };
  }

  // The markdown can change at any time (live reload), so read it again at copy time.
  async function refreshSource() {
    if (key.moFileId) source = await fetchSource(key);
  }

  function sorted(): Comment[] {
    const attached = record.comments
      .filter((c) => spans.has(c.id))
      .sort((a, b) => spans.get(a.id)!.start - spans.get(b.id)!.start);
    const lost = record.comments.filter((c) => !spans.has(c.id));
    return [...attached, ...lost];
  }

  async function copyOne(c: Comment) {
    await refreshSource();
    await writeClipboard(formatComment(await pointerFor(c), c.message));
    toast("Copied 1 comment");
  }

  async function copyAll() {
    if (record.comments.length === 0) return toast("No comments to copy");
    await refreshSource();
    const items = [];
    for (const c of sorted()) items.push({ pointer: await pointerFor(c), message: c.message });
    const header = { url: location.href, title: document.title, filePath: source.filePath };
    await writeClipboard(formatAll(header, items));
    toast(`Copied ${items.length} comments`);
  }

  async function writeClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  // ---- UI shell --------------------------------------------------------

  function ensureUI() {
    if (host) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    toolbar = h("div", "pr-toolbar");
    panel = h("div", "pr-panel hidden");
    overlay = h("div", "pr-overlay");
    toastEl = h("div", "pr-toast");
    shadow.append(style, toolbar, panel, overlay, toastEl);
    document.documentElement.appendChild(host);
    renderPanel();
  }

  function toast(msg: string) {
    ensureUI();
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function setPanelOpen(open: boolean) {
    panel.classList.toggle("hidden", !open);
    renderToolbar();
  }

  function setActive(on: boolean) {
    active = on;
    if (on) {
      ensureUI();
      host!.style.display = "";
      reattach();
      setPanelOpen(true);
    } else {
      picking = false;
      hideAddButton();
      clearOverlay();
      if (host) host.style.display = "none";
    }
    renderToolbar();
  }

  function renderToolbar() {
    if (!host) return;
    // The panel is full height at the right edge. Keep the toolbar clear of it.
    toolbar.classList.toggle("shifted", !panel.classList.contains("hidden"));
    toolbar.replaceChildren(
      button(picking ? "Picking… (Esc)" : "Pick element", picking ? "active" : "", () => {
        picking = !picking;
        clearOverlay();
        renderToolbar();
      }),
      button(`Comments (${record.comments.length})`, "", () =>
        setPanelOpen(panel.classList.contains("hidden")),
      ),
      button(record.hidden ? "Show highlights" : "Hide highlights", "", async () => {
        record.hidden = !record.hidden;
        paintHighlights();
        renderToolbar();
        await persist();
      }),
      button("Close", "small", () => setActive(false)),
    );
  }

  function clearOverlay() {
    overlay?.replaceChildren();
  }

  // ---- panel -----------------------------------------------------------

  function renderPanel() {
    if (!host) return;
    renderToolbar();
    const header = h("div", "pr-panel-header");
    header.append(h("strong", "", `Comments (${record.comments.length})`));
    const actions = h("div");
    actions.append(
      button("Copy all", "primary small", () => void copyAll()),
      button("×", "small", () => setPanelOpen(false)),
    );
    header.append(actions);

    const list = h("div", "pr-list");
    const all = sorted();
    const attached = all.filter((c) => !orphans.has(c.id));
    const lost = all.filter((c) => orphans.has(c.id));
    if (all.length === 0) {
      list.append(
        h("div", "pr-empty", "No comments yet. Select text on the page, then press “Comment”."),
      );
    }
    for (const c of attached) list.append(card(c));
    if (lost.length) {
      list.append(h("div", "pr-section-title", "Orphaned: text not found on the page"));
      for (const c of lost) list.append(card(c));
    }
    panel.replaceChildren(header, list);
  }

  function card(c: Comment): HTMLElement {
    const el = h(
      "div",
      `pr-card${orphans.has(c.id) ? " orphan" : ""}${c.id === focusId ? " focus" : ""}`,
    );
    el.dataset.id = c.id;
    if (c.headingPath.length) el.append(h("div", "pr-card-path", c.headingPath.join(" > ")));
    el.append(h("div", "pr-card-quote", c.quote));

    if (c.id === editingId) {
      const ta = h("textarea", "pr-edit");
      ta.value = c.message;
      el.append(ta);
      const row = h("div", "pr-card-actions");
      row.append(
        button("Save", "primary small", async () => {
          const text = ta.value.trim();
          if (!text) return;
          c.message = text;
          c.updatedAt = Date.now();
          editingId = null;
          await persist();
          renderPanel();
        }),
        button("Cancel", "small", () => {
          editingId = null;
          renderPanel();
        }),
      );
      el.append(row);
      queueMicrotask(() => ta.focus());
      return el;
    }

    el.append(h("div", "pr-card-body", c.message));
    const row = h("div", "pr-card-actions");
    row.append(
      button("Copy", "small", () => void copyOne(c)),
      button("Edit", "small", () => {
        editingId = c.id;
        renderPanel();
      }),
      button("Delete", "small danger", async () => {
        if (!confirm("Delete this comment?")) return;
        record.comments = record.comments.filter((x) => x.id !== c.id);
        await persist();
        reattach();
      }),
    );
    el.append(row);
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button, textarea")) return;
      focusComment(c.id, true);
    });
    return el;
  }

  function focusComment(id: string, scroll: boolean) {
    focusId = id;
    paintHighlights();
    const r = ranges.get(id);
    if (scroll && r) {
      r.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    renderPanel();
    shadow?.querySelector(`.pr-card[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  // ---- adding comments -------------------------------------------------

  let addBtn: HTMLElement | null = null;

  function hideAddButton() {
    addBtn?.remove();
    addBtn = null;
  }

  function inHost(node: Node | null): boolean {
    return !!host && !!node && (node === host || host.contains(node));
  }

  document.addEventListener("mouseup", () => {
    if (!active) return;
    // Wait one tick: the selection updates after mouseup.
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hideAddButton();
      const range = sel.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      if (inHost(ancestor) || !findRoot().contains(ancestor)) return hideAddButton();
      showAddButton(range.cloneRange());
    }, 0);
  });

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideAddButton();
  });

  function showAddButton(range: Range) {
    hideAddButton();
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    if (!last) return;
    addBtn = h("button", "pr-add-btn", "Comment");
    addBtn.style.top = `${Math.min(window.innerHeight - 40, last.bottom + 6)}px`;
    addBtn.style.left = `${Math.max(8, Math.min(window.innerWidth - 90, last.right - 20))}px`;
    addBtn.addEventListener("mousedown", (e) => e.preventDefault());
    addBtn.addEventListener("click", () => {
      hideAddButton();
      openComposer({ kind: "text", range }, last);
    });
    shadow!.append(addBtn);
  }

  function openComposer(draft: Draft, near: DOMRect) {
    clearOverlay();
    const quote =
      draft.kind === "text"
        ? draft.range.toString().replace(/\s+/g, " ").trim()
        : describeElement(draft.el);
    const box = h("div", "pr-composer");
    box.style.position = "fixed";
    box.style.top = `${Math.max(8, Math.min(window.innerHeight - 220, near.bottom + 8))}px`;
    box.style.left = `${Math.max(8, Math.min(window.innerWidth - 340, near.left))}px`;
    const ta = h("textarea");
    ta.placeholder = "Leave a comment (Cmd/Ctrl+Enter to save)";
    const cancel = () => box.remove();
    const save = async () => {
      const message = ta.value.trim();
      if (!message) return;
      await addComment(draft, quote, message);
      box.remove();
    };
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") cancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
    });
    const row = h("div", "pr-composer-actions");
    row.append(button("Cancel", "", cancel), button("Comment", "primary", () => void save()));
    box.append(h("div", "pr-composer-quote", quote), ta, row);
    shadow!.append(box);
    ta.focus();
  }

  async function addComment(draft: Draft, quote: string, message: string) {
    const root = findRoot();
    index = buildTextIndex(root);
    let range: Range;
    let span: Span | null;
    let startEl: Element | null;
    if (draft.kind === "text") {
      range = draft.range;
      span = rangeToSpan(index, range);
      const c = range.commonAncestorContainer;
      startEl = c.nodeType === Node.ELEMENT_NODE ? (c as Element) : c.parentElement;
    } else {
      range = document.createRange();
      range.selectNodeContents(draft.el);
      span = elementSpan(index, draft.el);
      startEl = draft.el;
    }
    const selector = startEl ? cssSelector(startEl, root) : null;
    // An element with no text (an image) has no span; it is found by selector later.
    const anchor = makeAnchor(index.text, span ?? { start: 0, end: 0 }, draft.kind, selector);
    const now = Date.now();
    record.comments.push({
      id: crypto.randomUUID(),
      message,
      quote,
      anchor,
      headingPath: headingPath(headingsBefore(root, range.startContainer)),
      createdAt: now,
      updatedAt: now,
    });
    window.getSelection()?.removeAllRanges();
    await persist();
    reattach();
    toast("Comment added");
  }

  // ---- element picking -------------------------------------------------

  function pickTarget(e: Event): Element | null {
    const t = e.target as Element | null;
    if (!t || inHost(t) || !findRoot().contains(t)) return null;
    return t;
  }

  document.addEventListener(
    "mousemove",
    (e) => {
      if (!picking) return;
      const t = pickTarget(e);
      clearOverlay();
      if (!t) return;
      const r = t.getBoundingClientRect();
      const box = h("div", "pr-pick-outline");
      Object.assign(box.style, {
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      overlay.append(box);
    },
    true,
  );

  document.addEventListener(
    "click",
    (e) => {
      if (picking) {
        const t = pickTarget(e);
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        picking = false;
        clearOverlay();
        renderToolbar();
        openComposer({ kind: "element", el: t }, t.getBoundingClientRect());
        return;
      }
      // A click on a highlighted area opens its comment.
      if (inHost(e.target as Node) || record.hidden) return;
      if (window.getSelection()?.isCollapsed === false) return;
      for (const [id, r] of ranges) {
        const hit = [...r.getClientRects()].some(
          (q) =>
            e.clientX >= q.left && e.clientX <= q.right && e.clientY >= q.top && e.clientY <= q.bottom,
        );
        if (hit) {
          if (!active) setActive(true);
          setPanelOpen(true);
          focusComment(id, false);
          return;
        }
      }
    },
    true,
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picking) {
      picking = false;
      clearOverlay();
      renderToolbar();
    }
  });

  // ---- lifecycle -------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle") setActive(!active);
  });

  let timer = 0;
  new MutationObserver((muts) => {
    if (muts.every((m) => inHost(m.target))) return;
    clearTimeout(timer);
    timer = window.setTimeout(reattach, 300);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // mo changes the URL without a reload, so watch for it.
  setInterval(() => {
    if (pageKey(location.href).key !== key.key) void switchPage();
  }, 500);

  reattach();
}
