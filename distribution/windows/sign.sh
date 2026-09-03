#!/usr/bin/env bash
# Signe build/bin/kawu.exe avec un certificat de code-signing (.pfx/.p12) via osslsigncode.
#
# Usage:
#   CERT_PFX=/chemin/vers/cert.pfx CERT_PASSWORD='motdepasse' ./distribution/windows/sign.sh
#
# Variables optionnelles:
#   TIMESTAMP_URL   URL du serveur d'horodatage RFC3161 (defaut: DigiCert)
#   EXE_PATH        Chemin de l'exe a signer (defaut: build/bin/kawu.exe)

set -euo pipefail

: "${CERT_PFX:?Definir CERT_PFX=/chemin/vers/certificat.pfx}"
: "${CERT_PASSWORD:?Definir CERT_PASSWORD='mot de passe du certificat'}"

TIMESTAMP_URL="${TIMESTAMP_URL:-http://timestamp.digicert.com}"
EXE_PATH="${EXE_PATH:-build/bin/kawu.exe}"
OUT_PATH="${EXE_PATH%.exe}-signed.exe"

if [ ! -f "$CERT_PFX" ]; then
  echo "Certificat introuvable: $CERT_PFX" >&2
  exit 1
fi

if [ ! -f "$EXE_PATH" ]; then
  echo "Exe introuvable: $EXE_PATH (lance d'abord: wails build -platform windows/amd64)" >&2
  exit 1
fi

osslsigncode sign \
  -pkcs12 "$CERT_PFX" \
  -pass "$CERT_PASSWORD" \
  -n "Kawu" \
  -i "https://github.com/ztvplusfr/kawuapp" \
  -t "$TIMESTAMP_URL" \
  -in "$EXE_PATH" \
  -out "$OUT_PATH"

mv -f "$OUT_PATH" "$EXE_PATH"
echo "Signe: $EXE_PATH"

# Avec un certificat auto-signe, la verification doit se faire contre ce cert
# lui-meme (pas de CA racine publique derriere), sinon osslsigncode la rejette.
CERT_CRT_GUESS="${CERT_PFX%.pfx}.crt"
if [ -f "$CERT_CRT_GUESS" ]; then
  osslsigncode verify -in "$EXE_PATH" -CAfile "$CERT_CRT_GUESS"
else
  osslsigncode verify -in "$EXE_PATH" || true
fi
