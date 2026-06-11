# Lekha App Icon and README Banner - Design Spec

Date: 2026-06-12
Status: approved concept, pending implementation

## Goal

Replace Lekha's flat placeholder icon with a macOS-glass-style app icon, and add a
README banner lockup. No AI-art pipeline: every asset is hand-authored SVG checked
into the repo, rendered to bitmaps by a reproducible script.

## Locked visual concept

Chosen through three rounds of visual selection (direction, composition, palette):

- **Direction D - page + mark**: a document page as the central object.
- **Composition D1 - bold hash**: one strong `#` glyph on the page; no heading
  lines, no pen. A single glyph stays legible at 16px.
- **Palette P1 - navy glass**: dark navy glass squircle, cream paper, ink-colored
  hash, one small purple accent.

Concretely, the 1024px master is:

1. **Tile**: macOS squircle (corner radius ~22.4% of side, i.e. the standard
   Big-Sur-and-later icon grid shape). Vertical glass gradient navy
   `#232c42 -> #171e30 -> #10141f`, a 1px inner border at `rgba(255,255,255,0.22)`,
   and a soft top sheen (white fading to transparent over the upper ~40%).
2. **Paper**: a cream page (`#fdfbf5 -> #e3ded0` vertical gradient) centered on
   the tile, occupying roughly 40% of tile width and 63% of tile height,
   slightly rounded corners, with a folded top-right corner (fold face in
   `#c2bcab`). The page carries a soft drop shadow onto the glass so it reads
   as floating - the "liquid glass layering" cue.
3. **Hash**: a bold `#` drawn as four rounded-cap strokes (two near-vertical
   strokes with a slight italic lean, two horizontals) in ink `#454050`,
   centered on the page. Stroke weight ~9% of tile width.
4. **Accent**: a short purple underline bar (`#6e5ef0`, matching the app's
   `--color-accent`) under the hash, the only color note on the paper.

Tone words: clean, quiet, professional. Not allowed: emboss/bevel effects,
photorealistic textures, AI-style gradients-everywhere, mascots.

## Deliverables

1. **App icon**
   - `assets/icon/icon-master.svg` - the 1024px master (single source of truth).
   - `assets/icon/icon-small.svg` - simplified variant used for 16px and 32px
     renders: no fold detail, no sheen, thicker hash (4 strokes only on plain
     paper) so the mark survives tiny sizes. Same palette.
   - `build/icon.icns` - assembled from rendered PNGs (replaces current).
   - `build/icon.png` - 1024px render (electron-builder Linux/fallback icon).
2. **README banner**
   - `assets/banner/banner.svg` - wide lockup: the icon mark at the left,
     "Lekha" wordmark (system-ui/Inter-style, 500 weight, cream on transparent)
     plus the tagline "A clean markdown editor for macOS" in muted gray.
     Designed on a transparent background so it works on GitHub light AND dark
     themes (text uses GitHub-safe mid-tones, or the banner ships as a PNG pair
     via `<picture>` if contrast testing fails).
   - README.md updated to show the banner at the top.

## Production pipeline

`scripts/build-icon.mjs` (node, no new dependencies):

1. Launch Playwright Chromium (already a devDependency).
2. Load each SVG in a `data:` URL page and screenshot at exact pixel sizes with
   a transparent background:
   - From `icon-master.svg`: 1024, 512, 256, 128, 64 (covers @2x pairs).
   - From `icon-small.svg`: 32, 16.
3. Write the `icon.iconset/` folder with Apple's required names
   (`icon_16x16.png`, `icon_16x16@2x.png`, ... `icon_512x512@2x.png`).
4. Run `iconutil -c icns icon.iconset -o build/icon.icns` (macOS built-in).
5. Copy the 1024px render to `build/icon.png`.

The script is rerunnable and CI-safe on macOS runners; SVGs are the only
hand-edited artifacts.

## Multi-agent refinement step

Before finalizing `icon-master.svg`, fan out 3 parallel subagents, each drafting
one refinement of the locked concept with a distinct brief:

- Agent 1 "light": tune the glass lighting (sheen shape, inner border, page
  shadow) for depth without gloss.
- Agent 2 "geometry": tune proportions (page size on tile, hash weight and
  lean, fold size, accent bar) against the macOS icon grid.
- Agent 3 "small-size": design the 16/32px simplified variant and verify
  legibility at actual size.

Their outputs are rendered side by side (Playwright screenshots at 1024, 128,
32, 16) and the user picks/merges the winner before the pipeline runs.

## Acceptance criteria

- `iconutil` produces a valid `.icns`; `npm run dist:mac` packages with it and
  the Dock/Finder show the new icon (manual smoke test).
- The 16px render is recognizably "page + hash" when viewed at actual size.
- The README banner renders legibly on both GitHub light and dark backgrounds.
- No binary asset exists without its SVG source in `assets/`.
- `scripts/build-icon.mjs` regenerates byte-stable-enough output (same sizes,
  same names) from a clean checkout on macOS.

## Out of scope

- In-app welcome/about logo (can reuse the mark later; not in this pass).
- DMG installer background artwork.
- App Store marketing assets.
