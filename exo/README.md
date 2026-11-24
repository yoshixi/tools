# exo

Local Excalidraw editor. Opens `.excalidraw` files in the browser, saves back to disk, and watches for external changes — mo-style.

Agents changing this package: read **[AGENTS.md](./AGENTS.md)** first.

## Install

```bash
npm install -g @yoshixi/exo
# or: pnpm add -g @yoshixi/exo
```

## Setup (from source)

```bash
cd exo
pnpm install
pnpm build
pnpm link --global   # optional: put `exo` on your PATH
```

Or run without linking:

```bash
pnpm start -- sketch.excalidraw
# → node dist/cli.js start sketch.excalidraw
```

## Usage

```bash
exo                                   # help
cd exo-files && exo start             # workspace = exo-files; open drawings there
exo start exo-files/                  # same from a parent directory
exo start sketch.excalidraw           # workspace = cwd; open one file
exo start -R .                        # cwd + nested dirs
exo export sketch.excalidraw          # → sketch.png (no browser)
exo export sketch.excalidraw -o out.svg
exo --status
exo --shutdown
exo start --foreground sketch.excalidraw    # foreground (debugging)
```

Each running server is scoped to one **workspace folder**. The sidebar only
lists `.excalidraw` files inside that folder. A second workspace uses another
port so sessions do not mix.

Default URL for the first workspace: `http://127.0.0.1:6285`

In the browser sidebar, **Add file…** asks for a name and creates
`name.excalidraw` in the workspace folder. **Copy** on a file duplicates it
beside the original (`sketch copy.excalidraw`, then `sketch copy 2.excalidraw`, …).

Under **More options** (hidden by default):

- **Choose folder…** — Finder folder dialog (must stay inside the workspace)
- **Open existing…** — Finder file dialog (must stay inside the workspace)

CLI also creates missing files:

```bash
exo start sketch.excalidraw   # creates sketch.excalidraw if it does not exist
```

## Formats

- **v1:** `.excalidraw` / `.excalidraw.json` (JSON scene)
- Later: `.excalidraw.png` / `.excalidraw.svg` with embedded scene

## Headless export (agents)

Export does **not** need a browser or Playwright. It renders with
`@moona3k/excalidraw-export` (roughjs + resvg) in Node:

```bash
exo export diagram.excalidraw                 # diagram.png
exo export diagram.excalidraw -o out.svg
exo export diagram.excalidraw --scale 3
```

Or via the running server:

```http
POST /api/files/:id/export
{ "format": "png", "scale": 2 }
```

### How an agent should check a drawing

1. Edit or write the `.excalidraw` JSON (CLI / editor / API).
2. `exo export …` → PNG on disk.
3. Open that PNG with a **vision** model (or any image-read tool).

No headless browser is required for export or for checking the picture —
only the PNG (or SVG) file.

## Development

```bash
pnpm build
pnpm typecheck
pnpm test        # unit + HTTP/filesystem integration
pnpm test:e2e    # Playwright (Chromium) against a real exo server
```

Tests follow observable-behavior style (t-wada / Unit Testing principles):
literal expectations, one outcome per case, no mocks of our own code.

## Release

CI runs on changes under `exo/`. Publishing is tag-driven:

1. Bump `version` in `exo/package.json`.
2. Commit and push to `main`.
3. Tag and push: `git tag exo-v0.1.0 && git push origin exo-v0.1.0`

That runs [.github/workflows/exo-release.yml](../.github/workflows/exo-release.yml):
test → `pnpm publish` (`@yoshixi/exo`) → GitHub Release.

Needs repo secret `NPM_TOKEN` with permission to publish under `@yoshixi`.
