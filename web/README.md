# Lekha Web

The browser build of Lekha. It runs the **exact same editor** as the desktop
app — the ProseMirror/CodeMirror core, all plugins, node views, themes, math,
Mermaid, and HTML/PDF export — in a tab, with no install.

Open any Markdown from a URL, a paste, a dropped file, a local file/folder, or a
GitHub link.

## How it reuses the desktop editor

The desktop renderer only ever talks to `window.lekha` (the `LekhaAPI` interface
in `src/preload/api.d.ts`). On the desktop that object is an Electron IPC bridge
to the OS. The web app installs a **browser implementation** of the same
interface before the renderer boots, so the whole editor runs unchanged:

| Interface use            | Web implementation                                        |
| ------------------------ | --------------------------------------------------------- |
| Open / save / read files | File System Access API (`fsa:` handles) + `<input>`/download fallback |
| Open folder / file tree  | `showDirectoryPicker` (`fsdir:` paths); Chromium only     |
| Remote documents         | `fetch` (`http(s)://` paths), with GitHub `blob` → `raw` rewriting |
| Settings / recent / backups | IndexedDB                                              |
| Export HTML / PDF        | Blob download / print dialog                              |
| Clipboard / open link    | `navigator.clipboard` / `window.open`                     |
| Menu commands            | Keyboard bridge (`web/src/keymap.ts`) → command bus       |

Capabilities the browser has no equivalent for (folder watching, Pandoc export,
always-on-top) degrade to a no-op or a clear message rather than pretending.

The adapter lives entirely under `web/`; **no desktop code changed**.

## URL forms

| You open                                                          | Result                             |
| ----------------------------------------------------------------- | ---------------------------------- |
| `/`                                                               | Blank welcome document             |
| `/?src=<raw-markdown-url>`                                         | Any raw Markdown URL               |
| `/gh/{owner}/{repo}/{ref}/{path}`                                 | A GitHub file (short form)         |
| `/https://github.com/{owner}/{repo}/blob/{ref}/{path}`            | A GitHub file (prefix form)        |

Public files fetch straight from the browser (`raw.githubusercontent.com` sends
permissive CORS). Private repos and rate-limit relief need the serverless proxy
planned as a later phase.

## Develop

```bash
npm install
npm run dev:web        # Vite dev server (reuses ../src/renderer in place)
```

## Build & check

```bash
npm run build:web      # typecheck:webapp + vite build -> web/dist
npm run preview:web    # serve the production build locally
npm run typecheck:webapp
```

## Deploy (Vercel)

`vercel.json` at the repo root drives the deploy — keep the Vercel project's
**Root Directory** at the repository root (not `web/`):

- Install: `HUSKY=0 npm install`
- Build: `npm run build:web`
- Output: `web/dist`
- SPA rewrite: every non-asset path serves `index.html` so the URL forms above
  resolve client-side.

Import the repo into Vercel and it picks these up automatically; the default
`*.vercel.app` domain works out of the box, and a custom domain can be added
later.
