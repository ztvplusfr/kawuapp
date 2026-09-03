# Install script for Kawu on Windows
$ErrorActionPreference = "Stop"

Write-Host "🍿 Installation de Kawu pour Windows..." -ForegroundColor Cyan

$InstallDir = "$env:LOCALAPPDATA\Programs\Kawu"
$ZipFile = "$env:TEMP\kawu-windows-x64.zip"

Write-Host "⬇️  Téléchargement de la dernière version..." -ForegroundColor Yellow

try {
    Invoke-WebRequest -Uri "https://github.com/ztvplusfr/kawuapp/releases/latest/download/kawu-windows-x64.zip" -OutFile $ZipFile -UseBasicParsing
} catch {
    Invoke-WebRequest -Uri "https://github.com/ztvplusfr/kawuapp/releases/download/v1.0/kawu-windows-x64.zip" -OutFile $ZipFile -UseBasicParsing
}

Write-Host "📦 Extraction dans $InstallDir..." -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Expand-Archive -Path $ZipFile -DestinationPath $InstallDir -Force
Remove-Item -Path $ZipFile -Force

# Create Desktop Shortcut
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $DesktopShortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Kawu.lnk")
    $DesktopShortcut.TargetPath = "$InstallDir\kawu.exe"
    $DesktopShortcut.WorkingDirectory = "$InstallDir"
    $DesktopShortcut.IconLocation = "$InstallDir\kawu.exe,0"
    $DesktopShortcut.Description = "Kawu - Streaming gratuit sans pub"
    $DesktopShortcut.Save()

    # Create Start Menu Shortcut
    $StartMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Kawu"
    New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
    $StartMenuShortcut = $WshShell.CreateShortcut("$StartMenuDir\Kawu.lnk")
    $StartMenuShortcut.TargetPath = "$InstallDir\kawu.exe"
    $StartMenuShortcut.WorkingDirectory = "$InstallDir"
    $StartMenuShortcut.IconLocation = "$InstallDir\kawu.exe,0"
    $StartMenuShortcut.Description = "Kawu - Streaming gratuit sans pub"
    $StartMenuShortcut.Save()
} catch {
    Write-Host "⚠️ Impossible de créer les raccourcis automatiquement." -ForegroundColor Yellow
}

Write-Host "✨ Kawu a été installé avec succès !" -ForegroundColor Green
Write-Host "🚀 Lancement automatique de l'application..." -ForegroundColor Cyan

Start-Process "$InstallDir\kawu.exe"
