<div align="center">

<img src="build/appicon.png" alt="Kawu Logo" width="120" height="120" style="border-radius: 28px; box-shadow: 0 12px 35px rgba(6, 182, 212, 0.4);" />

# Kawu Desktop 🍿

### Votre plateforme de streaming cinéma, séries et animés native sur macOS & Windows.
**Fluide · Design Noir Glass · Multi-sources · Sans aucune publicité**

[![Version](https://img.shields.io/badge/version-1.0.2-06b6d4.svg?style=for-the-badge)](https://github.com/ztvplusfr/kawuapp/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-10b981.svg?style=for-the-badge)](#-installation)
[![Wails](https://img.shields.io/badge/built%20with-Wails%20v2%20%2B%20Vue%203-8b5cf6.svg?style=for-the-badge)](https://wails.io)
[![Discord](https://img.shields.io/badge/Discord-Rejoindre%20la%20communauté-5865F2.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/GKH8APBxFN)

<br/>

[🍏 Télécharger pour macOS (DMG)](https://github.com/ztvplusfr/kawuapp/releases/download/v1.0.2/Kawu-1.0.2.dmg) • [🪟 Télécharger pour Windows](https://github.com/ztvplusfr/kawuapp/releases) • [💬 Serveur Discord](https://discord.gg/GKH8APBxFN)

</div>

---

## ✨ Points forts & Fonctionnalités

* 🎬 **Catalogue exhaustif** : Films récents, séries intégrales et animés en haute définition.
* 🇫🇷 **VF & VOSTFR** : Choix instantané de la langue et des sous-titres avec sélecteur de sources intelligent.
* 💎 **Interface Ultra-Moderne « Noir Glass »** : Expérience visuelle immersive pensée spécialement pour grand écran et écrans Retina.
* 📱 **Télécommande Mobile intégrée** : Scannez un QR Code avec votre smartphone et pilotez la lecture, le volume et les menus depuis votre lit via le Wi-Fi local.
* 🔄 **Synchronisation Cloud (Supabase)** : Reprise de lecture exacte au seconde près (*Watch Progress*), historique et Watchlist partagés.
* 📺 **Mode Navigation TV (Zero-Mouse)** : Navigation fluide au clavier ou à la télécommande calquée sur l'expérience Netflix / Apple TV.
* ⚡ **Performance Native Wails** : Consommation de mémoire ultra-légère par rapport à Electron grâce au moteur natif WebKit macOS / WebView2 Windows et binaire Go ultra-rapide.

---

## 🚀 Installation

### 🍏 Sur macOS

#### Option 1 : Téléchargement direct (Recommandé)
1. Téléchargez la dernière version : **[Kawu-1.0.2.dmg](https://github.com/ztvplusfr/kawuapp/releases/download/v1.0.2/Kawu-1.0.2.dmg)**
2. Ouvrez le fichier `.dmg` et glissez **Kawu** dans le dossier **Applications**.
3. Lancez Kawu depuis votre Launchpad ou Spotlight.

> **Note au 1er lancement** : Si macOS affiche le message de sécurité standard *« Impossible d’ouvrir car le développeur ne peut pas être vérifié »* :
> Faites un **Clic Droit** (ou *Ctrl + Clic*) sur **Kawu.app** dans `/Applications` > Cliquez sur **Ouvrir**.

#### Option 2 : En 1 ligne dans votre Terminal
```bash
curl -fsSL https://raw.githubusercontent.com/ztvplusfr/kawuapp/main/install.sh | bash
```

#### Option 3 : Via Homebrew Cask
```bash
brew tap ztvplusfr/tap
brew install --cask kawu
```
*Pour mettre à jour ultérieurement : `brew upgrade --cask kawu`.*

---

### 🪟 Sur Windows

#### En 1 ligne dans PowerShell (Exécuter en tant qu'administrateur recommandé) :
```powershell
irm https://raw.githubusercontent.com/ztvplusfr/kawuapp/main/install.ps1 | iex
```

---

## ⌨️ Raccourcis Clavier

| Raccourci | Action |
| :--- | :--- |
| <kbd>Espace</kbd> ou <kbd>K</kbd> | Lecture / Pause |
| <kbd>→</kbd> / <kbd>←</kbd> | Avancer / Reculer de 10 secondes |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Augmenter / Baisser le volume |
| <kbd>F</kbd> | Activer / Quitter le plein écran |
| <kbd>M</kbd> | Couper / Réactiver le son (Mute) |
| <kbd>C</kbd> | Activer / Désactiver les sous-titres |
| <kbd>Échap</kbd> | Quitter le lecteur / Retour en arrière |

---

## 🛠️ Stack Technique

* **Backend Desktop** : [Go](https://golang.org) (v1.23+) + [Wails v2](https://wails.io)
* **Frontend** : [Vue 3](https://vuejs.org) (Composition API, `<script setup>`), [Vite](https://vitejs.dev), [Tailwind CSS v4](https://tailwindcss.com)
* **Composants & Icônes** : [Lucide](https://lucide.dev) & [Tabler Icons](https://tabler.io/icons)
* **Base de données & Auth** : [Supabase](https://supabase.com) (PostgreSQL, Row-Level Security, Google OAuth PKCE)
* **Streaming Engine** : [Hls.js](https://github.com/video-dev/hls.js/) haute performance avec résolveurs de flux intégrés

---

## 💻 Développement local & Contribution

### Prérequis
* [Go](https://golang.org/dl/) (>= 1.22)
* [Bun](https://bun.sh) (ou Node.js 18+)
* [Wails CLI v2](https://wails.io/docs/gettingstarted/installation) (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

### Lancer l'application en développement
```bash
# Cloner le dépôt
git clone https://github.com/ztvplusfr/kawuapp.git
cd kawuapp

# Lancer le mode dev avec hot-reload instantané
wails dev
```

### Compiler pour la production
```bash
# 1. Compilation du binaire de production
wails build

# 2. Générer l'image disque macOS DMG
bash distribution/build-dmg.sh
```

---

## 💬 Rejoindre la communauté

Une question, un bug à signaler ou envie de suggérer un film / série ?  
Rejoignez-nous sur le serveur Discord officiel :  
👉 **[discord.gg/GKH8APBxFN](https://discord.gg/GKH8APBxFN)**

---

<div align="center">
  <sub>Fait avec ❤️ par la communauté Kawu. © 2026 Kawu. Tous droits réservés.</sub>
</div>
