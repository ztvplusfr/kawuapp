cask "kawu" do
  version "1.0.2"
  sha256 :no_check

  url "https://github.com/ztvplusfr/kawuapp/releases/download/v#{version}/Kawu-#{version}.dmg"
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
