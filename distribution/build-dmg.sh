#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

APP_SRC=""
if [ -d "build/bin/Kawu.app" ]; then
  APP_SRC="build/bin/Kawu.app"
elif [ -d "build/bin/kawu.app" ]; then
  APP_SRC="build/bin/kawu.app"
else
  echo "Erreur: application buildée introuvable dans build/bin/" >&2
  exit 1
fi

VERSION=$(grep '"productVersion"' wails.json | head -1 | sed 's/[^0-9.]*//g')
[ -z "$VERSION" ] && VERSION="1.0.0"

DMG_NAME="Kawu-${VERSION}.dmg"
DMG_OUTPUT="build/bin/${DMG_NAME}"
DMG_TEMP_DIR="$(mktemp -d -t kawu_dmg_staging)"
trap 'rm -rf "$DMG_TEMP_DIR"' EXIT

echo "==> Préparation du dossier d'installation pour Kawu v${VERSION}..."
cp -R "$APP_SRC" "$DMG_TEMP_DIR/Kawu.app"

# Lien symbolique vers /Applications pour glisser-déposer
ln -s /Applications "$DMG_TEMP_DIR/Applications"

# Fichier explicatif d'installation et Gatekeeper
cat << 'TXT' > "$DMG_TEMP_DIR/⚠️ LISEZ-MOI avant d'ouvrir.txt"
==================================================
              INSTALLATION DE KAWU
==================================================

1. Glissez-déposez "Kawu.app" dans le dossier "Applications".
2. Lancez Kawu depuis votre dossier Applications.

⚠️ SI macOS AFFICHE UN MESSAGE DE SÉCURITÉ :
"Impossible d’ouvrir l’application car le développeur ne peut pas être vérifié"

Solution simple :
- Faites un CLIC DROIT (ou Ctrl + Clic) sur Kawu.app dans votre dossier Applications
- Choisissez "Ouvrir" dans le menu contextuel
- Cliquez sur "Ouvrir" sur la boîte de dialogue.
(Cette étape n'est nécessaire qu'au premier lancement).

Toutes vos données (compte Google, historique, reprise de lecture, watchlist)
sont conservées intactes à chaque mise à jour.
==================================================
TXT

rm -f "$DMG_OUTPUT"

echo "==> Génération du fichier DMG d'installation..."
hdiutil create \
  -volname "Kawu" \
  -srcfolder "$DMG_TEMP_DIR" \
  -ov \
  -format UDZO \
  "$DMG_OUTPUT"

chmod 644 "$DMG_OUTPUT"

# Intégration du Disclaimer / Accord d'utilisation obligatoire à l'ouverture du DMG
if [ -f "distribution/sla.plist" ]; then
  echo "==> Intégration de l'avertissement / disclaimer légal obligatoire..."
  hdiutil udifrez "$DMG_OUTPUT" -xml "distribution/sla.plist" 2>/dev/null || true
fi

echo "==> DMG d'installation créé avec succès : $DMG_OUTPUT"
