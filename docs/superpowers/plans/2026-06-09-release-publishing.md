# Release & Publishing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the code/config to ship Lekha for macOS as a signed-or-unsigned GitHub Release that auto-updates and is `brew install`-able, working today (unsigned) and upgrading to signed the moment Apple secrets are added - with no workflow rewrite.

**Architecture:** electron-builder already targets mac `dmg`+`zip` (arm64/x64) and has `publish: github` + an `electron-updater` integration (`src/main/updater.ts`). We make signing conditional (electron-builder skips signing without `CSC_LINK`; a conditional `afterSign` notarize hook skips without Apple creds), add a tag-triggered GitHub Actions workflow that publishes to GitHub Releases, scaffold a Homebrew self-tap cask + bump script, and add the missing `LICENSE` + docs.

**Tech Stack:** electron-builder ^26.8.1, @electron/notarize (new devDep), GitHub Actions (macos-14 runner), Homebrew Cask, Vitest (for the hook unit test). macOS-only; bash scripting is mac-targeted (`sed -i ''`).

---

## Background facts (already true; do not re-implement)

- `electron-builder.yml` `mac:` block currently has `identity: null`, `hardenedRuntime: false`, `gatekeeperAssess: false`, `icon: build/icon.icns`, and `dmg`+`zip` targets for `arm64`+`x64`. `dmg.artifactName: ${productName}-${version}-${arch}.dmg` → `Lekha-<ver>-arm64.dmg` / `Lekha-<ver>-x64.dmg`.
- `electron-builder.yml` already has `publish: { provider: github, owner: mocarram, repo: Lekha }`.
- `package.json`: `"version": "0.1.0"`, `"license": "MIT"`, `"electron-builder": "^26.8.1"`. Scripts: `build` = `npm run typecheck && electron-vite build`; `dist:mac` = `npm run build && electron-builder --mac`; `dist:dir` = `npm run build && electron-builder --dir`. Unit test script: `test` = `vitest run`.
- `src/main/updater.ts` exists (electron-updater wired). No change needed.
- App id is `com.lekha.app`. Git author: `Mocarram Hossain`.
- No `LICENSE` file, no `.github/workflows`, no Homebrew files, no `@electron/notarize`.
- Unit tests live in `tests/unit/**/*.test.{ts,tsx}` (Vitest).

## File structure (created / modified)

- **Create** `LICENSE` - MIT text.
- **Create** `build/entitlements.mac.plist` - hardened-runtime entitlements.
- **Create** `build/notarize.cjs` - conditional `afterSign` notarize hook (exports `shouldNotarize` + default).
- **Create** `tests/unit/build/notarize.test.ts` - unit test for `shouldNotarize`.
- **Modify** `electron-builder.yml` - mac signing config + `afterSign`.
- **Modify** `package.json` - add `@electron/notarize` devDep; keep local `dist:mac` unsigned.
- **Create** `.github/workflows/release.yml` - tag-triggered build/sign/notarize/publish.
- **Create** `packaging/homebrew/lekha.rb` - the cask (placeholder sha256 until a release exists).
- **Create** `scripts/update-cask.sh` - recompute version + sha256 from a release.
- **Create** `docs/publishing/homebrew.md` - tap setup + user install instructions.
- **Create** `docs/publishing/releasing.md` - the release ritual + required secrets.
- **Modify** `README.md` - add an Install / Download section.

---

## Task 1: LICENSE file

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create the MIT license**

Create `LICENSE` with exactly:

```
MIT License

Copyright (c) 2026 Mocarram Hossain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Verify it's a valid MIT license file**

Run: `head -1 LICENSE && grep -c "MIT License" LICENSE`
Expected: prints `MIT License` and `1`.

- [ ] **Step 3: Commit**

```bash
git add LICENSE
git commit -m "docs: add MIT LICENSE file"
```

---

## Task 2: macOS signing config + entitlements

**Files:**
- Create: `build/entitlements.mac.plist`
- Modify: `electron-builder.yml` (mac block)
- Modify: `package.json` (`dist:mac` script)

- [ ] **Step 1: Create the entitlements plist**

Create `build/entitlements.mac.plist` with exactly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

- [ ] **Step 2: Update the `mac:` block in `electron-builder.yml`**

Replace this existing block:

```yaml
mac:
  category: public.app-category.productivity
  # identity: null disables ad-hoc/Developer ID code signing for local builds.
  # To sign for release, set CSC_LINK + CSC_KEY_PASSWORD env vars.
  identity: null
  hardenedRuntime: false
  gatekeeperAssess: false
```

with:

```yaml
mac:
  category: public.app-category.productivity
  # Signing is conditional: with no CSC_LINK env (and CSC_IDENTITY_AUTO_DISCOVERY
  # off for local builds) electron-builder skips signing and produces an unsigned
  # build; in CI, CSC_LINK + CSC_KEY_PASSWORD make it sign with the Developer ID.
  # hardenedRuntime + entitlements are required for notarization (ignored on
  # unsigned builds since no signing occurs).
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  gatekeeperAssess: false
```

(Removes `identity: null`; sets `hardenedRuntime: true`; adds the two entitlements keys. Leave `icon` and `target` below unchanged.)

- [ ] **Step 3: Keep local `dist:mac` builds unsigned**

In `package.json`, change the `dist:mac` script from:

```json
    "dist:mac": "npm run build && electron-builder --mac",
```

to:

```json
    "dist:mac": "npm run build && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac",
```

(Local builds stay unsigned regardless of keychain certs. In CI, `CSC_LINK` takes precedence over this flag, so CI still signs.)

- [ ] **Step 4: Verify the plist is well-formed**

Run: `plutil -lint build/entitlements.mac.plist`
Expected: `build/entitlements.mac.plist: OK`

- [ ] **Step 5: Verify the YAML still parses**

Run: `node -e "require('js-yaml')" 2>/dev/null && node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('electron-builder.yml','utf8'));console.log('yaml ok')" || python3 -c "import yaml,sys; yaml.safe_load(open('electron-builder.yml')); print('yaml ok')"`
Expected: `yaml ok` (full build validation happens in Task 7).

- [ ] **Step 6: Commit**

```bash
git add build/entitlements.mac.plist electron-builder.yml package.json
git commit -m "build(mac): enable conditional signing + hardened runtime entitlements"
```

---

## Task 3: Conditional notarization hook (TDD)

**Files:**
- Create: `tests/unit/build/notarize.test.ts`
- Create: `build/notarize.cjs`
- Modify: `package.json` (add `@electron/notarize` devDep)
- Modify: `electron-builder.yml` (add `afterSign`)

- [ ] **Step 1: Add the `@electron/notarize` devDependency**

Run: `npm install --save-dev @electron/notarize`
Expected: installs (adds to `devDependencies` in `package.json` + lockfile).

- [ ] **Step 2: Write the failing test**

Create `tests/unit/build/notarize.test.ts`:

```ts
/**
 * The afterSign notarization hook must be conditional: it notarizes only when
 * ALL three Apple credential env vars are present, and silently skips otherwise
 * (local builds, unsigned CI). This tests the pure gating function.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldNotarize } = require('../../../build/notarize.cjs') as {
  shouldNotarize: (env: Record<string, string | undefined>) => boolean
}

describe('notarize hook gating (shouldNotarize)', () => {
  it('returns false when no credentials are set', () => {
    expect(shouldNotarize({})).toBe(false)
  })

  it('returns false when only some credentials are set', () => {
    expect(shouldNotarize({ APPLE_ID: 'a@b.c' })).toBe(false)
    expect(shouldNotarize({ APPLE_ID: 'a@b.c', APPLE_TEAM_ID: 'TEAM' })).toBe(false)
  })

  it('returns true only when all three credentials are present', () => {
    expect(
      shouldNotarize({
        APPLE_ID: 'a@b.c',
        APPLE_APP_SPECIFIC_PASSWORD: 'pw',
        APPLE_TEAM_ID: 'TEAM',
      }),
    ).toBe(true)
  })

  it('treats empty strings as missing', () => {
    expect(
      shouldNotarize({ APPLE_ID: '', APPLE_APP_SPECIFIC_PASSWORD: '', APPLE_TEAM_ID: '' }),
    ).toBe(false)
  })
})
```

- [ ] **Step 3: Run the test to confirm it FAILS**

Run: `npm test -- notarize`
Expected: FAIL - cannot find module `../../../build/notarize.cjs`.

- [ ] **Step 4: Create the hook**

Create `build/notarize.cjs`:

```js
/*
 * electron-builder `afterSign` hook - conditional macOS notarization.
 *
 * Notarizes the signed .app only when ALL of APPLE_ID,
 * APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID are set. Otherwise it logs and
 * returns, so local builds and unsigned CI builds proceed untouched. The
 * @electron/notarize dependency is required lazily so this module is cheap to
 * load in unit tests (which only exercise shouldNotarize).
 */

/** True only when all three Apple credential env vars are non-empty. */
function shouldNotarize(env) {
  return Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)
}

exports.shouldNotarize = shouldNotarize

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  if (!shouldNotarize(process.env)) {
    console.log('[notarize] Skipping - Apple credentials not set (unsigned build).')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const { notarize } = require('@electron/notarize')
  console.log(`[notarize] Notarizing ${appName}.app ...`)
  await notarize({
    appBundleId: 'com.lekha.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
  console.log(`[notarize] Done: ${appName}.app`)
}
```

- [ ] **Step 5: Run the test to confirm it PASSES**

Run: `npm test -- notarize`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire the hook into electron-builder**

In `electron-builder.yml`, add this top-level key (place it right after the `npmRebuild: false` line so it sits with the other top-level options):

```yaml
# Conditional notarization (see build/notarize.cjs): notarizes only when Apple
# credentials are present in the environment, otherwise no-ops.
afterSign: build/notarize.cjs
```

- [ ] **Step 7: Commit**

```bash
git add build/notarize.cjs tests/unit/build/notarize.test.ts electron-builder.yml package.json package-lock.json
git commit -m "build(mac): add conditional afterSign notarization hook"
```

---

## Task 4: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  release:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck, lint, unit tests
        run: |
          npm run typecheck
          npm run lint
          npm test

      - name: Build renderer + main
        run: npm run build

      # Publishes on a tag push; a manual workflow_dispatch run only builds
      # (dry run), so you can validate the pipeline without cutting a release.
      - name: Package, (conditionally) sign + notarize, publish
        run: npx electron-builder --mac --publish ${{ github.event_name == 'push' && 'always' || 'never' }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Signing: empty when the secret is unset -> electron-builder builds
          # unsigned. Set these to flip to signed (no workflow change needed).
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          # Notarization (read by build/notarize.cjs): empty -> skipped.
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `command -v actionlint >/dev/null && actionlint .github/workflows/release.yml && echo "actionlint ok" || (python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml ok (actionlint not installed)')")`
Expected: `actionlint ok` or `yaml ok (actionlint not installed)`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered macOS release workflow (conditional signing)"
```

---

## Task 5: Homebrew self-tap cask + bump script

**Files:**
- Create: `packaging/homebrew/lekha.rb`
- Create: `scripts/update-cask.sh`
- Create: `docs/publishing/homebrew.md`

- [ ] **Step 1: Create the cask**

Create `packaging/homebrew/lekha.rb` (the `sha256` values are placeholders until
a real release exists; `scripts/update-cask.sh` fills them):

```ruby
cask "lekha" do
  arch arm: "arm64", intel: "x64"

  version "0.1.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/mocarram/Lekha/releases/download/v#{version}/Lekha-#{version}-#{arch}.dmg",
      verified: "github.com/mocarram/Lekha/"
  name "Lekha"
  desc "Clean, distraction-free WYSIWYG Markdown editor"
  homepage "https://github.com/mocarram/Lekha"

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "Lekha.app"

  zap trash: [
    "~/Library/Application Support/Lekha",
    "~/Library/Logs/Lekha",
    "~/Library/Preferences/com.lekha.app.plist",
    "~/Library/Saved Application State/com.lekha.app.savedState",
  ]
end
```

- [ ] **Step 2: Create the bump script**

Create `scripts/update-cask.sh`:

```bash
#!/usr/bin/env bash
# Update packaging/homebrew/lekha.rb to a published release: rewrites the version
# and both per-arch sha256 values by downloading the release DMGs and hashing
# them. macOS only (BSD sed). Usage: scripts/update-cask.sh <version>  e.g. 0.1.1
set -euo pipefail

VERSION="${1:?usage: scripts/update-cask.sh <version, e.g. 0.1.1>}"
CASK="packaging/homebrew/lekha.rb"
BASE="https://github.com/mocarram/Lekha/releases/download/v${VERSION}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading DMGs for v${VERSION} ..."
curl -fsSL -o "$TMP/arm64.dmg" "$BASE/Lekha-${VERSION}-arm64.dmg"
curl -fsSL -o "$TMP/x64.dmg"   "$BASE/Lekha-${VERSION}-x64.dmg"

ARM_SHA="$(shasum -a 256 "$TMP/arm64.dmg" | awk '{print $1}')"
X64_SHA="$(shasum -a 256 "$TMP/x64.dmg"   | awk '{print $1}')"

# Anchored, unambiguous replacements:
#   version line:    ^  version "..."
#   arm sha line:    ^  sha256 arm:   "..."   (the `arch arm:` line starts with `arch`)
#   intel sha line:  ^         intel: "..."   (the `arch ...` line starts with `arch`)
sed -i '' -E "s|^( *version )\"[^\"]*\"|\1\"${VERSION}\"|" "$CASK"
sed -i '' -E "s|^( *sha256 arm: *)\"[^\"]*\"|\1\"${ARM_SHA}\"|" "$CASK"
sed -i '' -E "s|^( *intel: *)\"[^\"]*\"|\1\"${X64_SHA}\"|" "$CASK"

echo "Updated $CASK -> v${VERSION}"
echo "  arm64: $ARM_SHA"
echo "  x64:   $X64_SHA"
echo "Copy this file into your mocarram/homebrew-tap repo (Casks/lekha.rb) and push."
```

- [ ] **Step 3: Make the script executable**

Run: `chmod +x scripts/update-cask.sh`
Expected: no output (success).

- [ ] **Step 4: Verify the bump script's sed targeting (no real download)**

Run:
```bash
cp packaging/homebrew/lekha.rb /tmp/cask-test.rb
# Apply only the sed lines against the copy with dummy values:
sed -i '' -E 's|^( *version )"[^"]*"|\1"9.9.9"|' /tmp/cask-test.rb
sed -i '' -E 's|^( *sha256 arm: *)"[^"]*"|\1"aaaa"|' /tmp/cask-test.rb
sed -i '' -E 's|^( *intel: *)"[^"]*"|\1"bbbb"|' /tmp/cask-test.rb
grep -E 'version "9.9.9"|arm:   "aaaa"|intel: "bbbb"|arch arm: "arm64"' /tmp/cask-test.rb
rm -f /tmp/cask-test.rb
```
Expected: shows `version "9.9.9"`, `sha256 arm:   "aaaa"`, `intel: "bbbb"`, AND the untouched `arch arm: "arm64", intel: "x64"` line - confirming the `arch` line is NOT clobbered.

- [ ] **Step 5: Validate the cask (if Homebrew present)**

Run: `command -v brew >/dev/null && brew style --cask packaging/homebrew/lekha.rb || echo "brew not installed - skipping cask style (validate after creating the tap)"`
Expected: passes, or the skip message. (A real `brew audit` needs the cask inside a tap + a real release; deferred to post-release.)

- [ ] **Step 6: Create the Homebrew docs**

Create `docs/publishing/homebrew.md`:

```markdown
# Homebrew distribution (self-tap)

Lekha is distributed via a personal Homebrew **tap** so users can install it with
`brew`. The cask lives in a separate repo named `homebrew-tap` (Homebrew maps the
`homebrew-` prefix automatically).

## One-time setup (maintainer)

1. Create a public GitHub repo named **`mocarram/homebrew-tap`**.
2. Add a `Casks/` directory and copy `packaging/homebrew/lekha.rb` into it as
   `Casks/lekha.rb`.
3. Commit + push.

## On every release (maintainer)

1. Cut the GitHub release first (see `releasing.md`) so the DMGs exist.
2. From this repo, run: `scripts/update-cask.sh <version>` (e.g. `0.1.1`). It
   downloads both DMGs, computes their `sha256`, and rewrites
   `packaging/homebrew/lekha.rb`.
3. Copy the updated `packaging/homebrew/lekha.rb` into the tap repo's
   `Casks/lekha.rb`, commit, and push.

## User install

```sh
brew tap mocarram/tap
brew install --cask lekha
```

To upgrade: `brew upgrade --cask lekha` (or rely on the app's built-in
auto-update once builds are signed).

## Note on signing

Homebrew installs the app into `/Applications`, where macOS Gatekeeper applies.
Until the app is **signed + notarized** (see `releasing.md`), users will hit a
Gatekeeper warning on first launch. A notarized build installs and launches
cleanly. Submitting to the official `homebrew-cask` (so `brew install --cask
lekha` works without the tap) is a later step that requires a notarized app and
meets Homebrew's notability bar.
```

- [ ] **Step 7: Commit**

```bash
git add packaging/homebrew/lekha.rb scripts/update-cask.sh docs/publishing/homebrew.md
git commit -m "packaging: add Homebrew cask, bump script, and tap docs"
```

---

## Task 6: README install section + release docs

**Files:**
- Modify: `README.md`
- Create: `docs/publishing/releasing.md`

- [ ] **Step 1: Add an Install section to the README**

Open `README.md`. Insert the following section immediately after the project's
title/intro paragraph (before any "Development"/"Build" section). If the README
has no clear intro, add it near the top after the first heading:

```markdown
## Install / Download

**Download the latest `.dmg`** from the [Releases page](https://github.com/mocarram/Lekha/releases/latest):

- Apple Silicon: `Lekha-<version>-arm64.dmg`
- Intel: `Lekha-<version>-x64.dmg`

**Or via Homebrew:**

```sh
brew tap mocarram/tap
brew install --cask lekha
```

> Builds are currently unsigned during early releases - on first launch macOS may
> say the app "cannot be opened". Right-click the app → **Open** (or run
> `xattr -dr com.apple.quarantine /Applications/Lekha.app`). Signed + notarized
> builds (no warning) land once code-signing is enabled.
```

- [ ] **Step 2: Verify the README edit applied**

Run: `grep -c "Install / Download" README.md && grep -c "brew install --cask lekha" README.md`
Expected: `1` and `1`.

- [ ] **Step 3: Create the releasing doc**

Create `docs/publishing/releasing.md`:

```markdown
# Releasing Lekha

Releases are cut by pushing a `vX.Y.Z` tag. The `.github/workflows/release.yml`
workflow builds on macOS, (conditionally) signs + notarizes, and publishes the
artifacts to a GitHub Release. The published `latest-mac.yml` feeds the in-app
auto-updater.

## Required GitHub repo secrets (for signed releases)

Add under **Settings → Secrets and variables → Actions**. Until these exist, the
workflow still runs and publishes an **unsigned** build.

| Secret | What it is |
|---|---|
| `CSC_LINK` | base64 of your exported `Developer ID Application` `.p12` |
| `CSC_KEY_PASSWORD` | the password protecting that `.p12` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | your 10-char Apple Developer Team ID |

Generate `CSC_LINK`: `base64 -i Certificates.p12 | pbcopy`, then paste as the
secret value.

## Cutting a release

1. Bump the version: `npm version patch` (or `minor`/`major`) - updates
   `package.json` and creates a `vX.Y.Z` git tag/commit.
2. Push commit + tag: `git push && git push --tags`.
3. The workflow builds + publishes the GitHub Release.
4. Update Homebrew: run `scripts/update-cask.sh <version>` and push the updated
   cask to the `mocarram/homebrew-tap` repo (see `homebrew.md`).

## Dry run (no release)

Trigger the workflow manually (**Actions → Release → Run workflow**); a
`workflow_dispatch` run builds without publishing, so you can validate the
pipeline before tagging.

## Local unsigned build

`npm run dist:mac` - produces unsigned `.dmg`/`.zip` in `release/` for local
testing (never signs, regardless of keychain certs).
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/publishing/releasing.md
git commit -m "docs: README install section + release/secrets guide"
```

---

## Task 7: Integration validation

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate (includes the new notarize test)**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass; the notarize suite (4 tests) is included.

- [ ] **Step 2: Confirm a local UNSIGNED build still works with the new config**

Run: `npm run dist:mac 2>&1 | tee /tmp/dist-verify.log | tail -20`
Expected: build succeeds; log contains `skipped macOS code signing` and the
notarize hook logs `[notarize] Skipping - Apple credentials not set`. Artifacts
appear in `release/` (`Lekha-0.1.0-arm64.dmg`, `Lekha-0.1.0-x64.dmg`, zips).

- [ ] **Step 3: Confirm the afterSign hook ran and skipped (not errored)**

Run: `grep -c "\[notarize\] Skipping" /tmp/dist-verify.log`
Expected: `>= 1` (the hook executed and cleanly skipped). If `0`, the hook may
not be wired - re-check `afterSign` in `electron-builder.yml`.

- [ ] **Step 4: No commit** (verification only). If a step fails, fix in the relevant task's files and re-run.

---

## Self-review notes (for the implementer)

- The cask `sha256` placeholders are intentional initial content (no release exists yet); `scripts/update-cask.sh` populates them after the first release. This is the only "placeholder" and it is data, not an unfinished instruction.
- `shouldNotarize` is the single name used by both the hook and its test.
- The workflow uses `npm run build` (not `dist:mac`) so CI is NOT forced unsigned by the local `CSC_IDENTITY_AUTO_DISCOVERY=false`; CI signs whenever `CSC_LINK` is set.
- `afterSign` runs for `--mac` packaging builds; the local `dist:mac` verification in Task 7 is what confirms the hook's skip path end-to-end.
- Apple enrollment, cert export, app-specific password, adding the 5 secrets, and creating the `mocarram/homebrew-tap` repo are the maintainer's manual steps (documented in `releasing.md` / `homebrew.md`), not code.
