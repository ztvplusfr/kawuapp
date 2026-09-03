#!/usr/bin/env bash
set -e

echo "🍿 Installation de Kawu pour macOS..."

APP_NAME="Kawu"
TMP_DIR=$(mktemp -d)
DMG_FILE="$TMP_DIR/Kawu.dmg"

echo "⬇️  Téléchargement de la dernière version..."
DOWNLOAD_URL="https://github.com/ztvplusfr/kawuapp/releases/latest/download/Kawu-1.0.2.dmg"

if ! curl -fsSL -L -o "$DMG_FILE" "$DOWNLOAD_URL"; then
  echo "Tentative avec URL de secours..."
  curl -fsSL -L -o "$DMG_FILE" "https://github.com/ztvplusfr/kawuapp/releases/download/v1.0.2/Kawu-1.0.2.dmg" || \
  curl -fsSL -L -o "$DMG_FILE" "https://github.com/ztvplusfr/kawuapp/releases/latest/download/kawu-mac.zip"
fi

if [[ "$DMG_FILE" == *.dmg ]] && hdiutil imageinfo "$DMG_FILE" >/dev/null 2>&1; then
  echo "📦 Montage du DMG..."
  MOUNT_DIR=$(mktemp -d)
  hdiutil attach "$DMG_FILE" -mountpoint "$MOUNT_DIR" -nobrowse -quiet
  
  echo "📂 Copie vers /Applications/Kawu.app..."
  rm -rf "/Applications/Kawu.app" "/Applications/kawu.app"
  if [ -d "$MOUNT_DIR/Kawu.app" ]; then
    cp -R "$MOUNT_DIR/Kawu.app" "/Applications/Kawu.app"
  elif [ -d "$MOUNT_DIR/kawu.app" ]; then
    cp -R "$MOUNT_DIR/kawu.app" "/Applications/Kawu.app"
  fi
  
  hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
  rm -rf "$MOUNT_DIR"
else
  echo "📦 Décompression de l'archive..."
  unzip -q "$DMG_FILE" -d "$TMP_DIR"
  rm -rf "/Applications/Kawu.app" "/Applications/kawu.app"
  if [ -d "$TMP_DIR/Kawu.app" ]; then
    cp -R "$TMP_DIR/Kawu.app" "/Applications/Kawu.app"
  elif [ -d "$TMP_DIR/kawu.app" ]; then
    cp -R "$TMP_DIR/kawu.app" "/Applications/Kawu.app"
  fi
fi

echo "🛡️  Suppression des restrictions de sécurité macOS (quarantaine Gatekeeper)..."
xattr -cr "/Applications/Kawu.app" 2>/dev/null || true

rm -rf "$TMP_DIR"

echo "✨ Kawu a été installé avec succès dans /Applications !"
echo "🚀 Vous pouvez maintenant lancer Kawu depuis le Launchpad ou Spotlight."
