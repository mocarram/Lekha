# Release & Publishing Pipeline - Design

**Date:** 2026-06-09
**Branch:** `feat/release-publishing`
**Status:** Approved

## Summary

Set up the code/config side of publishing Lekha for macOS so end users can
download and install it easily and the app keeps itself up to date. The
pipeline must work **today** (unsigned, for test releases) and upgrade to
**signed + notarized** the moment the maintainer adds Apple credentials - with
**no workflow rewrite** in between.

Scope is **macOS only** (matching the current electron-builder targets).
Windows/Linux are explicitly out of scope for this iteration.

## Current state (already in place)

- `electron-updater` dependency + `src/main/updater.ts` (auto-update wired).
- `electron-builder.yml` with `publish: { provider: github, owner: mocarram, repo: Lekha }`.
- macOS targets: `dmg` + `zip` for `arm64` and `x64`.
- `package.json`: `"version": "0.1.0"`, `"license": "MIT"`.
- App icon at `build/icon.icns`.

## Gaps this design closes

1. Build is **unsigned** (`identity: null`, `hardenedRuntime: false`) → Gatekeeper
   blocks it on other Macs and the auto-updater cannot apply updates.
2. **No CI** (`.github/workflows` is empty) → releases are manual/local.
3. **No `LICENSE` file** (declared MIT but absent).
4. **No Homebrew** distribution.

## Decisions (locked)

- **Signing posture:** conditional - sign + notarize when Apple secrets are
  present, build unsigned otherwise.
- **Homebrew:** self-hosted tap (`mocarram/homebrew-tap`), scaffolded here.
- **Platforms:** macOS only.

## Components

### A. electron-builder signing config (conditional)

Edit `electron-builder.yml` `mac:` block:
- **Remove `identity: null`** (it currently hard-disables signing even when a
  cert is available).
- Set **`hardenedRuntime: true`** (required for notarization; ignored on unsigned
  builds since no signing occurs).
- Add **`entitlements: build/entitlements.mac.plist`** and
  **`entitlementsInherit: build/entitlements.mac.plist`**.

Conditionality is electron-builder's native behavior: with **no `CSC_LINK`** env
var (and no keychain identity) it logs "skipped macOS code signing" and produces
an unsigned build; with **`CSC_LINK` + `CSC_KEY_PASSWORD`** set it signs.

Update the local `dist:mac` npm script to prefix **`CSC_IDENTITY_AUTO_DISCOVERY=false`**
so local builds stay unsigned regardless of what's in the developer's keychain.
(`CSC_LINK`, when set in CI, takes precedence over this flag, so CI still signs.)

New file **`build/entitlements.mac.plist`** with the standard Electron hardened-
runtime entitlements:
- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.allow-unsigned-executable-memory`
- `com.apple.security.cs.disable-library-validation`

### B. Notarization hook (conditional)

New file **`build/notarize.cjs`**, referenced as the `afterSign` hook in
`electron-builder.yml`. Add **`@electron/notarize`** as a devDependency.

Logic: read `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` from env.
- If **any are missing** → log "Skipping notarization (no Apple credentials)"
  and return. (Covers local + unsigned-CI builds.)
- If **all present** → call `notarize()` from `@electron/notarize` for the built
  `.app`, then electron-builder staples the ticket.

This hook-based approach guarantees notarization is optional regardless of
electron-builder version nuances. The hook runs after the (possibly skipped)
signing step, so an unsigned build simply skips it.

### C. GitHub Actions release workflow

New file **`.github/workflows/release.yml`**:
- **Triggers:** `push` of tags matching `v*`, plus `workflow_dispatch` (manual
  dry-run).
- **Runner:** `macos-14`.
- **Steps:** checkout → `actions/setup-node@v4` (Node 20, npm cache) → `npm ci`
  → `npm run typecheck && npm run lint && npm test` (gate) →
  `npx electron-builder --mac --publish always`.
- **Env (from `secrets`):** `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and
  `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Unset secrets interpolate to empty
  strings → unsigned build that still publishes. The **same workflow** signs
  once the secrets exist - no edit needed.
- **Result:** electron-builder creates/updates the GitHub Release for the tag
  and uploads `.dmg`, `.zip`, `.blockmap`, and `latest-mac.yml`. The published
  `latest-mac.yml` is what `electron-updater` reads for auto-update (which only
  *applies* updates once builds are signed).

Notes: `e2e` is excluded from the CI gate (it needs a built app + display and is
slow); typecheck + lint + unit are the pre-publish gate. The build step itself
exercises the production bundle.

### D. Homebrew (self-tap)

The cask must ultimately live in a separate `mocarram/homebrew-tap` repo
(Homebrew tap naming convention `homebrew-<name>`). This repo holds the source
of truth + tooling:

- **`packaging/homebrew/lekha.rb`** - the cask: `version`, `arch arm:/intel:`,
  per-arch `sha256` + `url` (the GitHub release `.dmg`), `name`, `desc`,
  `homepage`, `app "Lekha.app"`, and a `zap` stanza for clean uninstall.
- **`scripts/update-cask.sh`** - given a version, downloads both release `.dmg`s,
  computes their `sha256`, and rewrites `version` + the two hashes in
  `packaging/homebrew/lekha.rb`.
- **`docs/publishing/homebrew.md`** - how to create the `mocarram/homebrew-tap`
  repo, copy the cask in, and the user-facing
  `brew tap mocarram/tap && brew install --cask lekha` instructions. Notes that
  the cask installs cleanly only once the app is notarized (Gatekeeper applies
  to `/Applications`).

Cask version bumps are manual (via `scripts/update-cask.sh`) for this iteration.

### E. Housekeeping

- **`LICENSE`** - MIT license text, copyright "2026 Mohammad Mocarram Hossain"
  (matches `package.json` `license: MIT`; exact holder name confirmed at write
  time).
- **README "Install / Download" section** - direct `.dmg` links (per arch), the
  `brew` command, and a one-line Gatekeeper note for the unsigned interim.
- **`docs/publishing/releasing.md`** - the release ritual: bump `version` in
  `package.json` → commit → `git tag vX.Y.Z` → `git push --tags` → workflow
  builds + publishes → run `scripts/update-cask.sh` + push the tap.

## What the maintainer does (out of scope - credentials/accounts)

These cannot be done in code and are documented, not automated:
1. Enrol in the **Apple Developer Program** (~$99/yr).
2. Create a **Developer ID Application** certificate; export `.p12`.
3. Create an **app-specific password** for the Apple ID; note the **Team ID**.
4. Add GitHub repo **secrets**: `CSC_LINK` (base64 of the `.p12`),
   `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
5. Create the **`mocarram/homebrew-tap`** repo and add the cask.

## Testing / validation

- **Workflow YAML:** validate with `actionlint` if available; the
  `workflow_dispatch` trigger lets the maintainer dry-run the build in CI.
- **Cask:** validate with `brew audit --cask` / `brew style` if `brew` is present
  (skip with a logged note otherwise).
- **Local unsigned build:** confirm `npm run dist:mac` still produces unsigned
  `.dmg`/`.zip` after the config changes (no regression).
- **notarize hook:** unit-confirm it returns early when env vars are absent
  (a small Node assertion / dry call), since that is the path exercised until
  secrets exist.
- Full signed + notarized + auto-update end-to-end is only verifiable once the
  maintainer has added secrets; documented as a manual post-enrollment check.

## Risks

- **electron-builder notarize semantics** vary by version → mitigated by the
  explicit `afterSign` hook rather than relying on built-in `notarize` config.
- **Removing `identity: null`** could cause unexpected signing on a dev machine
  that has a Developer ID in its keychain → mitigated by
  `CSC_IDENTITY_AUTO_DISCOVERY=false` in the local `dist:mac` script.
- **Homebrew on unsigned builds** → Gatekeeper still blocks; documented that the
  cask experience is smooth only after notarization.
