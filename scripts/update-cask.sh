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
