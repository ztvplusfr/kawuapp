package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const RemoteServerPort = 8765

type RemoteCommandRequest struct {
	Action    string `json:"action"`
	Timestamp int64  `json:"timestamp,omitempty"`
	Source    string `json:"source,omitempty"`
}

var (
	sseClientsMu sync.Mutex
	sseClients   = make(map[chan string]bool)
)

func broadcastRemoteAction(action string) {
	sseClientsMu.Lock()
	defer sseClientsMu.Unlock()
	for ch := range sseClients {
		select {
		case ch <- action:
		default:
		}
	}
}

// adjustMacSystemVolume adjusts native macOS output volume using AppleScript
func adjustMacSystemVolume(action string) (string, error) {
	if runtime.GOOS != "darwin" {
		return "", nil
	}

	switch action {
	case "volume_up":
		exec.Command("osascript", "-e", "set volume output volume (((output volume of (get volume settings)) + 6))").Run()
	case "volume_down":
		exec.Command("osascript", "-e", "set volume output volume (((output volume of (get volume settings)) - 6))").Run()
	case "volume_mute":
		exec.Command("osascript", "-e", "set volume output muted (not (output muted of (get volume settings)))").Run()
	}

	// Check if muted
	mutedOut, err := exec.Command("osascript", "-e", "output muted of (get volume settings)").Output()
	if err == nil && strings.TrimSpace(string(mutedOut)) == "true" {
		return "mute", nil
	}

	// Get current volume
	volOut, err := exec.Command("osascript", "-e", "output volume of (get volume settings)").Output()
	if err == nil {
		return strings.TrimSpace(string(volOut)), nil
	}

	return "", err
}

// getOutboundIP returns the preferred local IPv4 of this Mac
func getOutboundIP() string {
	conn, err := net.DialTimeout("udp", "8.8.8.8:80", 1*time.Second)
	if err == nil {
		defer conn.Close()
		localAddr := conn.LocalAddr().(*net.UDPAddr)
		return localAddr.IP.String()
	}

	// Fallback to searching network interfaces
	addrs, err := net.InterfaceAddrs()
	if err == nil {
		for _, address := range addrs {
			if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipnet.IP.To4() != nil && !strings.HasPrefix(ipnet.IP.String(), "169.254") {
					return ipnet.IP.String()
				}
			}
		}
	}

	return "127.0.0.1"
}

// withCORS adds cross-origin resource sharing headers to all remote API requests
func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// startRemoteServer initializes the HTTP server on port 8765
func (a *App) startRemoteServer() {
	mux := http.NewServeMux()

	// 1. Health & Ping endpoint
	mux.HandleFunc("/api/ping", withCORS(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "ok",
			"app":     "kawu",
			"version": "1.0",
		})
	}))

	// 2. Info endpoint
	mux.HandleFunc("/api/info", withCORS(func(w http.ResponseWriter, r *http.Request) {
		ip := getOutboundIP()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "ok",
			"ip":     ip,
			"port":   RemoteServerPort,
			"app":    "kawu",
		})
	}))

	// 3. Real-time Server-Sent Events (SSE) stream for frontend listener
	mux.HandleFunc("/api/remote/events", withCORS(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		clientChan := make(chan string, 16)
		sseClientsMu.Lock()
		sseClients[clientChan] = true
		sseClientsMu.Unlock()

		defer func() {
			sseClientsMu.Lock()
			delete(sseClients, clientChan)
			sseClientsMu.Unlock()
			close(clientChan)
		}()

		// Send initial keepalive
		fmt.Fprintf(w, "event: connected\ndata: ok\n\n")
		flusher.Flush()

		notify := r.Context().Done()
		for {
			select {
			case <-notify:
				return
			case action, ok := <-clientChan:
				if !ok {
					return
				}
				fmt.Fprintf(w, "data: %s\n\n", action)
				flusher.Flush()
			}
		}
	}))

	// 4. Command dispatcher endpoint
	mux.HandleFunc("/api/remote/command", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var cmd RemoteCommandRequest
		if err := json.NewDecoder(r.Body).Decode(&cmd); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}

		action := strings.TrimSpace(cmd.Action)
		if action == "" {
			http.Error(w, "Missing action", http.StatusBadRequest)
			return
		}

		// If native Mac volume action, adjust hardware macOS master volume
		if action == "volume_up" || action == "volume_down" || action == "volume_mute" {
			newVol, err := adjustMacSystemVolume(action)
			if err == nil && newVol != "" {
				action = fmt.Sprintf("mac_volume:%s", newVol)
			}
		}

		log.Printf("[Kawu Remote] Dispatching action: %s\n", action)

		// Dispatch action to Wails frontend runtime if running inside Wails window
		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "remote:action", action)
		}

		// Also broadcast to any connected frontend via SSE
		broadcastRemoteAction(action)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"action":  action,
		})
	}))

	server := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", RemoteServerPort),
		Handler: mux,
	}

	go func() {
		log.Printf("[Kawu Remote] Listening for mobile controllers on 0.0.0.0:%d\n", RemoteServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[Kawu Remote] Server error: %v\n", err)
		}
	}()
}

// GetRemoteServerInfo returns the Mac IP, port, and pairing string for QR generation
func (a *App) GetRemoteServerInfo() map[string]interface{} {
	ip := getOutboundIP()
	qrPayload := fmt.Sprintf(`{"ip":"%s","port":"%d","app":"kawu"}`, ip, RemoteServerPort)

	return map[string]interface{}{
		"ip":         ip,
		"port":       RemoteServerPort,
		"qrPayload":  qrPayload,
		"connectUrl": fmt.Sprintf("kawu://connect?ip=%s&port=%d", ip, RemoteServerPort),
	}
}
