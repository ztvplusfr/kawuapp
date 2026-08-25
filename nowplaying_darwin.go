//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Foundation -framework MediaPlayer -framework AppKit

#include <stdlib.h>

extern void UpdateNowPlaying(const char* title, const char* subtitle, const char* artist, const char* album, double duration, double position, double rate);
extern void ClearNowPlaying();
*/
import "C"

import "unsafe"

// SetNowPlayingInfo updates the macOS Now Playing info used by AirPlay / Control Center / Lock Screen
func (a *App) SetNowPlayingInfo(title string, subtitle string, artist string, album string, duration float64, position float64, rate float64) {
	cTitle := C.CString(title)
	defer C.free(unsafe.Pointer(cTitle))
	cSubtitle := C.CString(subtitle)
	defer C.free(unsafe.Pointer(cSubtitle))
	cArtist := C.CString(artist)
	defer C.free(unsafe.Pointer(cArtist))
	cAlbum := C.CString(album)
	defer C.free(unsafe.Pointer(cAlbum))

	C.UpdateNowPlaying(cTitle, cSubtitle, cArtist, cAlbum, C.double(duration), C.double(position), C.double(rate))
}

// ClearNowPlayingInfo clears the macOS Now Playing info
func (a *App) ClearNowPlayingInfo() {
	C.ClearNowPlaying()
}
