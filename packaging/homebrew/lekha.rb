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

  # The Homebrew build is unsigned, so the in-app updater (Squirrel.Mac) cannot
  # apply updates - Homebrew owns them. Leaving auto_updates at its default
  # (false) keeps `brew upgrade --cask lekha` as the real update path; a future
  # signed direct-download build would set this true and self-update instead.
  depends_on macos: ">= :big_sur"

  app "Lekha.app"

  zap trash: [
    "~/Library/Application Support/Lekha",
    "~/Library/Logs/Lekha",
    "~/Library/Preferences/com.lekha.app.plist",
    "~/Library/Saved Application State/com.lekha.app.savedState",
  ]
end
