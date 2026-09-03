#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'frontend', 'package.json');
const wailsPath = path.join(rootDir, 'wails.json');
const caskPath = path.join(rootDir, 'distribution', 'homebrew-tap', 'Casks', 'kawu.rb');
const nshPath = path.join(rootDir, 'build', 'windows', 'installer', 'wails_tools.nsh');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

if (!version) {
  console.error('Erreur : Version introuvable dans frontend/package.json');
  process.exit(1);
}

console.log(`Synchronisation de la version du projet vers: v${version}`);

// 1. wails.json
if (fs.existsSync(wailsPath)) {
  const wails = JSON.parse(fs.readFileSync(wailsPath, 'utf8'));
  if (wails.info) {
    wails.info.productVersion = version;
    fs.writeFileSync(wailsPath, JSON.stringify(wails, null, 2) + '\n');
    console.log(`✓ wails.json mis à jour -> ${version}`);
  }
}

// 2. distribution/homebrew-tap/Casks/kawu.rb
if (fs.existsSync(caskPath)) {
  let cask = fs.readFileSync(caskPath, 'utf8');
  cask = cask.replace(/version\s+"[^"]+"/, `version "${version}"`);
  fs.writeFileSync(caskPath, cask);
  console.log(`✓ kawu.rb mis à jour -> ${version}`);
}

// 3. build/windows/installer/wails_tools.nsh
if (fs.existsSync(nshPath)) {
  let nsh = fs.readFileSync(nshPath, 'utf8');
  nsh = nsh.replace(/!define INFO_PRODUCTVERSION\s+"[^"]+"/, `!define INFO_PRODUCTVERSION "${version}"`);
  fs.writeFileSync(nshPath, nsh);
  console.log(`✓ wails_tools.nsh mis à jour -> ${version}`);
}

console.log('✓ Synchronisation terminée avec succès !');
