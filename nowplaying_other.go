//go:build !darwin

package main

// SetNowPlayingInfo is a no-op on non-macOS platforms
func (a *App) SetNowPlayingInfo(title string, subtitle string, artist string, album string, duration float64, position float64, rate float64) {}

// ClearNowPlayingInfo is a no-op on non-macOS platforms
func (a *App) ClearNowPlayingInfo() {}
