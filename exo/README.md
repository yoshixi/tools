# exo

Local Excalidraw editor. Opens `.excalidraw` files in the browser, saves back to disk, and watches for external changes — mo-style.

## Setup

```bash
cd exo
pnpm install
pnpm build
pnpm link --global   # optional: put `exo` on your PATH
```

Or run without linking:

```bash
pnpm start -- sketch.excalidraw
# → node dist/cli.js sketch.excalidraw
```

## Usage

```bash
exo sketch.excalidraw                 # start/reuse server, open browser
exo other.excalidraw                  # add another file to the same session
exo .                                 # all .excalidraw files in the current directory
exo -R .                              # current directory + nested dirs (mo-style)
exo docs/                             # all drawings directly under docs/
exo --status
exo --shutdown
exo --foreground sketch.excalidraw    # foreground (debugging)
```

Default URL: `http://127.0.0.1:6285`

In the browser sidebar, **Add file…** asks for a name and creates
`name.excalidraw` in the directory where the server was started.

Under **More options** (hidden by default):

- **Choose folder…** — Finder/folder dialog for where Create should write
- **Open existing…** — Finder file dialog to open a drawing already on disk

CLI also creates missing files:

```bash
exo sketch.excalidraw   # creates sketch.excalidraw if it does not exist
```

## Formats

- **v1:** `.excalidraw` / `.excalidraw.json` (JSON scene)
- Later: `.excalidraw.png` / `.excalidraw.svg` with embedded scene

## Development

```bash
pnpm build
pnpm typecheck
pnpm test        # unit + HTTP/filesystem integration
pnpm test:e2e    # Playwright (Chromium) against a real exo server
```

Tests follow observable-behavior style (t-wada / Unit Testing principles):
literal expectations, one outcome per case, no mocks of our own code.
