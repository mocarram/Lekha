# Releasing Lekha

Releases are cut by pushing a `vX.Y.Z` tag. The `.github/workflows/release.yml`
workflow builds on macOS, (conditionally) signs + notarizes, and publishes the
artifacts to a GitHub Release. The published `latest-mac.yml` feeds the in-app
auto-updater.

## Required GitHub repo secrets (for signed releases)

Add under **Settings > Secrets and variables > Actions**. Until these exist, the
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

Trigger the workflow manually (**Actions > Release > Run workflow**); a
`workflow_dispatch` run builds without publishing, so you can validate the
pipeline before tagging.

## Local unsigned build

`npm run dist:mac` - produces unsigned `.dmg`/`.zip` in `release/` for local
testing (never signs, regardless of keychain certs).
