package main

import (
	"embed"
	"encoding/json"
	"fmt"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed wails.json
var wailsJSON []byte

func getAppVersion() string {
	var cfg struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(wailsJSON, &cfg); err == nil && cfg.Info.ProductVersion != "" {
		return cfg.Info.ProductVersion
	}
	return "1.0.2"
}

func createApplicationMenu(app *App) *menu.Menu {
	appMenu := menu.NewMenu()

	// 1. Menu Kawu
	kawuSub := appMenu.AddSubmenu("Kawu")
	// Le rôle AppMenuRole intègre automatiquement "À propos de Kawu" (relié à mac.About),
	// Masquer Kawu, Masquer les autres et Quitter Kawu
	kawuSub.Append(menu.AppMenu())

	// 2. Menu Édition (Undo, Redo, Couper, Copier, Coller, Tout sélectionner)
	editSub := appMenu.AddSubmenu("Édition")
	editSub.AddText("Annuler", keys.CmdOrCtrl("z"), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "menu:undo")
		}
	})
	editSub.AddText("Rétablir", keys.Combo("z", keys.CmdOrCtrlKey, keys.ShiftKey), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "menu:redo")
		}
	})
	editSub.AddSeparator()
	editSub.AddText("Couper", keys.CmdOrCtrl("x"), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "menu:cut")
		}
	})
	editSub.AddText("Copier", keys.CmdOrCtrl("c"), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "menu:copy")
		}
	})
	editSub.AddText("Coller", keys.CmdOrCtrl("v"), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "menu:paste")
		}
	})
	editSub.AddText("Tout sélectionner", keys.CmdOrCtrl("a"), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "menu:selectAll")
		}
	})

	// 3. Menu Fenêtre (Réduire, Zoom, Plein écran)
	windowSub := appMenu.AddSubmenu("Fenêtre")
	windowSub.AddText("Réduire", keys.CmdOrCtrl("m"), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.WindowMinimise(app.ctx)
		}
	})
	windowSub.AddText("Zoom", nil, func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsRuntime.WindowToggleMaximise(app.ctx)
		}
	})
	windowSub.AddSeparator()
	windowSub.AddText("Activer le plein écran", keys.Combo("f", keys.CmdOrCtrlKey, keys.ControlKey), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			if wailsRuntime.WindowIsFullscreen(app.ctx) {
				wailsRuntime.WindowUnfullscreen(app.ctx)
			} else {
				wailsRuntime.WindowFullscreen(app.ctx)
			}
		}
	})

	return appMenu
}

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Kawu",
		Width:     1080,
		Height:    720,
		MinWidth:  900,
		MinHeight: 600,
		Menu:      createApplicationMenu(app),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 255},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title:   "Kawu",
				Message: fmt.Sprintf("Kawu Desktop\nVotre plateforme de streaming cinéma & séries.\nVersion %s\n© 2026 Kawu.", getAppVersion()),
				Icon:    appIconBytes,
			},
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
