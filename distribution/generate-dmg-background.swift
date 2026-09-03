import Cocoa

let width = 640
let height = 440
let size = NSSize(width: width, height: height)
let image = NSImage(size: size)

image.lockFocus()

// 1. Fond sombre moderne (dégradé très élégant bleu nuit / noir Kawu)
let gradient = NSGradient(starting: NSColor(red: 0.05, green: 0.08, blue: 0.14, alpha: 1.0),
                          ending: NSColor(red: 0.01, green: 0.02, blue: 0.04, alpha: 1.0))
gradient?.draw(in: NSRect(origin: .zero, size: size), angle: -90.0)

// 2. Lueur cyan subtile en arrière-plan sous le logo
let glowCenter = NSPoint(x: CGFloat(width) / 2.0, y: CGFloat(height) - 75)
let glowPath = NSBezierPath(ovalIn: NSRect(x: glowCenter.x - 120, y: glowCenter.y - 45, width: 240, height: 90))
let glowGradient = NSGradient(starting: NSColor(red: 0.02, green: 0.83, blue: 1.0, alpha: 0.15),
                              ending: NSColor(red: 0.02, green: 0.83, blue: 1.0, alpha: 0.0))
glowGradient?.draw(in: glowPath, relativeCenterPosition: .zero)

// 3. Logo en haut centré (appicon officiel)
let projectDir = FileManager.default.currentDirectoryPath
let logoPath = "\(projectDir)/build/appicon.png"
if let logoData = NSData(contentsOfFile: logoPath),
   let logoImg = NSImage(data: logoData as Data) {
    let logoSize: CGFloat = 84
    let logoRect = NSRect(x: (CGFloat(width) - logoSize) / 2.0, y: CGFloat(height) - 100, width: logoSize, height: logoSize)
    logoImg.draw(in: logoRect)
}

// 4. Titre de marque "KAWU" en cyan lumineux
let title = "KAWU"
let titleFont = NSFont.systemFont(ofSize: 22, weight: .black)
let titleAttrs: [NSAttributedString.Key: Any] = [
    .font: titleFont,
    .foregroundColor: NSColor(red: 0.02, green: 0.83, blue: 1.0, alpha: 1.0)
]
let titleSize = title.size(withAttributes: titleAttrs)
title.draw(at: NSPoint(x: (CGFloat(width) - titleSize.width) / 2.0, y: CGFloat(height) - 130), withAttributes: titleAttrs)

// 5. Flèche stylisée de glisser-déposer au centre (entre l'App et Applications)
let arrowStr = "➜"
let arrowFont = NSFont.systemFont(ofSize: 34, weight: .black)
let arrowAttrs: [NSAttributedString.Key: Any] = [
    .font: arrowFont,
    .foregroundColor: NSColor(red: 0.02, green: 0.83, blue: 1.0, alpha: 0.45)
]
let arrowSize = arrowStr.size(withAttributes: arrowAttrs)
arrowStr.draw(at: NSPoint(x: (CGFloat(width) - arrowSize.width) / 2.0, y: 195), withAttributes: arrowAttrs)

// 6. Petit texte d'indication en bas
let hint = "Glissez-déposez Kawu dans le dossier Applications"
let hintFont = NSFont.systemFont(ofSize: 12, weight: .semibold)
let hintAttrs: [NSAttributedString.Key: Any] = [
    .font: hintFont,
    .foregroundColor: NSColor.white.withAlphaComponent(0.45)
]
let hintSize = hint.size(withAttributes: hintAttrs)
hint.draw(at: NSPoint(x: (CGFloat(width) - hintSize.width) / 2.0, y: 40), withAttributes: hintAttrs)

image.unlockFocus()

let outPath = "\(projectDir)/distribution/dmg-background.png"
if let tiff = image.tiffRepresentation,
   let rep = NSBitmapImageRep(data: tiff),
   let png = rep.representation(using: .png, properties: [:]) {
    try? png.write(to: URL(fileURLWithPath: outPath))
    print("Background image generated: \(outPath)")
}
