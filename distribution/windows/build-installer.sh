#!/usr/bin/env bash
# Compile kawu.exe pour Windows, genere l'installeur NSIS puis le signe.
#
# Prerequis (macOS): brew install makensis osslsigncode
#
# Usage:
#   CERT_PFX=distribution/windows/certs/kawu-selfsigned.pfx CERT_PASSWORD='kawu' \
#     ./distribution/windows/build-installer.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

# makensis plante avec la locale "C" (LANG non definie) sur macOS.
export LANG="${LANG:-en_GB.UTF-8}"
export LC_ALL="${LC_ALL:-en_GB.UTF-8}"

wails build -platform windows/amd64 -nsis

INSTALLER=build/bin/kawu-amd64-installer.exe
if [ ! -f "$INSTALLER" ]; then
  echo "Installeur introuvable: $INSTALLER" >&2
  exit 1
fi

if [ -n "${CERT_PFX:-}" ]; then
  EXE_PATH="$INSTALLER" ./distribution/windows/sign.sh
else
  echo "CERT_PFX non defini: installeur non signe ($INSTALLER)"
fi
