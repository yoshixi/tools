# Chrome extensions

Each folder is one extension with its own `package.json`.

## Build and load

You need Node 20 or newer.

```sh
cd page-review          # or another extension folder
npm install
npm run build           # writes the extension to dist/
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the extension's `dist/` folder.

After a code change, run `npm run build` again and click the reload icon on the extension card.

Each extension's README explains how to use it and how to run its tests.
