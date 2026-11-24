import { DEFAULT_HOST, DEFAULT_PORT } from "./state.js";

/** Text printed by bare `exo`, `exo -h`, and `exo --help`. */
export function helpText(): string {
  return `exo — local Excalidraw editor

Usage:
  exo                         Show this help
  exo start [options] [file-or-dir ...]
  exo export <file.excalidraw> [export-options]
  exo --status | --shutdown | -h | -v

Start a local server (or reuse one for this workspace) and open drawings in
the browser, or export them to PNG/SVG without a browser. Each server is
scoped to one workspace folder (the directory you start in, or a single
directory argument like exo-files/). The sidebar only shows drawings inside
that folder.

Commands:
  start                Start or reuse a local server and open files
  export               Render a .excalidraw file to PNG or SVG (headless)

Start options:
  -p, --port <n>       Port (default ${DEFAULT_PORT}; other workspaces get a free port)
  -b, --bind <addr>    Bind address (default ${DEFAULT_HOST})
  -f, --foreground     Run server in the foreground
  -R, --recursive      Recurse into subdirectories when a directory is given
      --open / --no-open  Open browser (default: open)

Other:
      --status         Show running exo servers
      --shutdown       Shut down the server on the given port
  -h, --help           Show this help
  -v, --version        Show version

Export options (with \`exo export\`):
  -o, --output <path>  Output file (default: <input-basename>.png)
      --format png|svg Format (default: from -o extension, else png)
      --scale <n>      PNG scale factor (default 2)
      --no-background  Transparent background

HTTP (while a server is running):
  POST /api/files/:id/export
    Body JSON: { "format"?: "png"|"svg", "output"?: "<path>",
                 "scale"?: number, "background"?: boolean }
    Writes the image under the workspace and returns
    { format, outputPath, bytes }.

Agent workflow (check a drawing visually):
  1. Edit or write the .excalidraw JSON (editor, CLI, or PUT /api/files/:id).
  2. Run:  exo export diagram.excalidraw
     → diagram.png on disk (no browser / Playwright required).
  3. Open that PNG with a vision model or image-read tool.

Examples:
  exo                              # this help
  cd exo-files && exo start        # workspace = exo-files; open drawings there
  exo start exo-files/             # same from a parent directory
  exo start sketch.excalidraw
  exo start --no-open --port 6290
  exo export sketch.excalidraw                 # → sketch.png
  exo export sketch.excalidraw -o out.svg
  exo export sketch.excalidraw --scale 3 --no-background
  exo start -R .
  exo --status
  exo --shutdown
`;
}
