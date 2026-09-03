//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// setDockIcon sets the Windows AppUserModelID so the taskbar icon displays correctly
func setDockIcon() {
	shell32 := syscall.NewLazyDLL("shell32.dll")
	setAppID := shell32.NewProc("SetCurrentProcessExplicitAppUserModelID")
	if setAppID.Find() == nil {
		appID, err := syscall.UTF16PtrFromString("ztvplusfr.kawu.app.1.0")
		if err == nil {
			_, _, _ = setAppID.Call(uintptr(unsafe.Pointer(appID)))
		}
	}
}
