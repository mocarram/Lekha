cask "lekha" do
  arch arm: "arm64", intel: "x64"

  version "0.1.1"
  sha256 arm:   "52bbae08e1265ecbe73f35325671d1091247b371d47b2563b5f83ebc67dabbd6",
         intel: "68fa38073680f269692a20eaebe7d4adb67811dd905b118a2c1aef2805c9b1f6"

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
