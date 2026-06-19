cask "lekha" do
  arch arm: "arm64", intel: "x64"

  version "0.2.0"
  sha256 arm:   "3be7808b824204282f20699457e6fe62dda2324c6ae1a20611b3b2827c80d101",
         intel: "fabfc9fcce3c162fc542b57f9e1149ed5fff1427c6df5366e02cf99e276ddd73"

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
