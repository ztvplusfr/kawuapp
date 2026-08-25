cask "kawu" do
  version "1.0"
  sha256 "c8984637ca388abc37e9e79665c12f46d6c55807aa68debded7a5645ce0ebfa0"

  url "https://github.com/ztvplusfr/kawuapp/releases/download/v#{version}/kawu-mac.zip"
  name "Kawu"
  desc "Application de streaming pour regarder des films, séries et animés gratuit sans pub"
  homepage "https://github.com/ztvplusfr/kawuapp"

  app "kawu.app"

  zap trash: [
    "~/Library/Application Support/kawu",
    "~/Library/Preferences/com.wails.kawu.plist",
    "~/Library/Saved Application State/com.wails.kawu.savedState",
  ]
end
