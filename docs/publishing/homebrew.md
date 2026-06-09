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

    brew tap mocarram/tap
    brew install --cask lekha

To upgrade: `brew upgrade --cask lekha` (or rely on the app's built-in
auto-update once builds are signed).

## Note on signing

Homebrew installs the app into `/Applications`, where macOS Gatekeeper applies.
Until the app is **signed + notarized** (see `releasing.md`), users will hit a
Gatekeeper warning on first launch. A notarized build installs and launches
cleanly. Submitting to the official `homebrew-cask` (so `brew install --cask
lekha` works without the tap) is a later step that requires a notarized app and
meets Homebrew's notability bar.
