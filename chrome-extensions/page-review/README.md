# Page Review

Review any web page like a GitHub pull request.
Select text (or pick an element), leave a comment, then copy all comments as a prompt for an AI agent.

It works on every page. It is tuned for review reports rendered by [k1LoW/mo](https://github.com/k1LoW/mo), for example `http://localhost:6275/?file=c29b2e32`.

## Install

You need Node 20 or newer.

```sh
npm install
npm run build        # writes the extension to dist/
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist/` folder.

After you change code, run `npm run build` again and click the reload icon on the extension card.

## Use

1. Open a page. Press **Alt+Shift+C** or click the toolbar icon. The comment panel opens on the right.
   (You can change the shortcut at `chrome://extensions/shortcuts`.)
2. **Comment on text:** select text. A small **Comment** button appears. Click it, write a message, press **Cmd/Ctrl+Enter**.
3. **Comment on an element** (a table, an image, a code block): click **Pick element**, hover to see the outline, click it.
4. In the panel, each comment has **Copy**, **Edit** and **Delete**. **Copy all** copies every comment.
5. **Hide highlights / Show highlights** turns the yellow marks off and on. Your choice is remembered for the page.
6. Click a yellow mark on the page to jump to its comment. Click a comment to scroll to its text.

Comments are saved in `chrome.storage.local`, in your browser only. Nothing is sent anywhere.
They stay when you reload, and they appear again when you come back to the same page.

## Copy format

One comment:

```
L13 | # Review report > ## Findings > ### 2. Slow loop | "The loop in the worker is O(n^2)."
Use a hash map here.
```

Copy all (the header is written once, then one block per comment, in page order):

```
Page: http://localhost:6275/?file=c29b2e32
File: /Users/me/project/report.md
Title: Review report - report.md | mo

L7 | # Review report > ## Findings > ### 1. Missing null check | "1. Missing null check"
Rename this finding.

L13 | # Review report > ## Findings > ### 2. Slow loop | "The loop in the worker is O(n^2)."
Use a hash map here.
```

On a normal web page there is no source file, so there are no line numbers. A CSS selector is added instead:

```
Page: https://example.com/docs/setup
Title: Setup guide

# Setup > ## Install > "Run the installer as root." | selector: main > article > p:nth-of-type(4)
This is unsafe. Suggest a user install.
```

## Design choices

### The pointer to the area

The pointer is one line. Its parts are separated by ` | `:

| Part | Why |
| --- | --- |
| `L13` or `L13-15` | Line numbers in the markdown source. The agent can open the file at that line. Only on mo pages. |
| `# A > ## B > ### C` | The heading path above the text. Easy to match in markdown. Works on any page that has headings. |
| `"quoted text"` | The selected text (cut at 140 characters). The agent can search for it. |
| `selector: ...` | A CSS selector. Only added when there are no line numbers. |

**Line numbers on mo pages.** mo does not put line numbers in its HTML. But mo has a small local API.
The extension asks it for the file path and the markdown source, then finds the quote in the source
(ignoring markdown marks like `**`, `` ` `` and link URLs). If the same sentence appears twice, the heading path decides which one.
The source is read again at every copy, so line numbers are right even after you edit the file.
If anything fails, the copy falls back to heading path and quote.

**The file path** comes from the same API and is written once in the bulk header (`File:`).

### How a comment finds its text again (anchoring)

Each comment stores a *text quote anchor*: the exact text plus about 40 characters before and after it.
It also stores a CSS selector for the element.

- On load, after the page changes, and when mo reloads, the extension searches the page text for the quote.
- If the text appears many times, the text around it picks the best match.
- If spaces or line breaks changed, a whitespace-tolerant search is tried.
- A selector is used only for elements with no text (like an image). It is not used when text was edited, because it might now point at different content.
- If nothing matches, the comment is **orphaned**. It stays in the panel under "Orphaned", with its quote and message, and still copies. It is never deleted.

Highlights use the browser's CSS Custom Highlight API. The page's DOM is never changed,
so mo's React re-renders cannot break or remove the highlights.

### Page key (which comments belong to which page)

- **mo pages** (`localhost`, `127.0.0.1` or `[::1]` with `?file=`): key is `mo:<group>:<file id>`.
  Other URL parts, such as the port and the hash, are ignored. The group is the first path segment (`default` for `/`).
- **Other pages**: origin + path + query. The hash and tracking params (`utm_*`, `fbclid`, `gclid`, ...) are dropped, and params are sorted.

mo changes the URL without reloading the page when you switch files. The extension notices and loads the comments of the new file.

### Other choices

- **Manifest V3**, plain TypeScript, one build tool (esbuild). No UI framework.
- **Shadow DOM** for all extension UI, so page styles do not leak in and ours do not leak out.
- The content script runs on all pages (`<all_urls>`) so highlights come back automatically.
  To limit it, change `matches` in `manifest.json`, for example to `["http://localhost/*"]`.
- For mo pages only the rendered markdown (`article.markdown-body`) is reviewed, not the sidebar.
- Pure logic lives in `src/core/` (no browser, no I/O) and has unit tests. DOM and storage code is a thin layer around it.

## Known limits

- An element with no text (an image) cannot be painted yellow, because the highlight API only paints text. It is listed in the panel and is found again by its selector.
- Text inside iframes and other shadow roots is not reachable.
- Line numbers are a best guess when the quote crosses links or images. They point at the start and end of the quote in the source.
- On pages that rewrite their text every second, highlights are re-attached about 300 ms after each change.
- Chrome pages (`chrome://`) and the Web Store do not allow extensions.

## Develop and test

```sh
npm test                 # unit tests (anchoring, copy format, storage keys, lines)
npm run typecheck
MO_BIN=/path/to/mo npm run test:e2e   # loads dist/ in Chromium and drives a real mo server
```

The e2e test needs `npm run build` first and a Playwright Chromium (`npx playwright install chromium`).
It starts its own mo on a random port, with a temporary markdown file.

```
src/core/     pure logic: url keys, anchoring, heading paths, line lookup, copy format
src/dom.ts    text index, ranges, selectors (DOM helpers)
src/mo.ts     reads path and markdown from mo's local API
src/store.ts  chrome.storage.local
src/content.ts  UI, highlights, copy
src/ui/panel.css
```
