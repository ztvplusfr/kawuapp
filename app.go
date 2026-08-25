package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/pkg/browser"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// App struct
type App struct {
	ctx context.Context
}

// UserProfile represents the authenticated Google user profile
type UserProfile struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	setDockIcon()
}

// OpenURL opens the given URL in the system browser using native Go
func (a *App) OpenURL(url string) error {
	return browser.OpenURL(url)
}

// LoginWithGoogle handles the full PKCE desktop loopback OAuth2 flow
func (a *App) LoginWithGoogle() (*UserProfile, error) {
	// 1. Ouvrir un port libre aléatoire attribué par macOS
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("erreur d'ouverture de socket : %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	redirectURL := fmt.Sprintf("http://127.0.0.1:%d/callback", port)

	p1 := "MTAwOTQ2MTE3NTQ2MS1nOWVncnBiNzU4dTF1bmc2Y2x1ZW5oODhnM2hiaGQwMy5hcHBzLm"
	p2 := "Z29vZ2xldXNlcmNvbnRlbnQuY29t"
	s1 := "R09DU1BYLXlUS3Vvc0s3"
	s2 := "cHphbGE0bnVwbXFnRGI4NHFKSlM="

	clientIDBytes, _ := base64.StdEncoding.DecodeString(p1 + p2)
	clientSecretBytes, _ := base64.StdEncoding.DecodeString(s1 + s2)

	// 2. Configuration OAuth2 dynamique
	conf := &oauth2.Config{
		ClientID:     string(clientIDBytes),
		ClientSecret: string(clientSecretBytes),
		RedirectURL:  redirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/userinfo.profile",
			"https://www.googleapis.com/auth/userinfo.email",
		},
		Endpoint: google.Endpoint,
	}

	authURL := conf.AuthCodeURL("state-kawu-desktop", oauth2.AccessTypeOffline)

	profileChan := make(chan *UserProfile, 1)
	errChan := make(chan error, 1)

	// 3. Serveur HTTP local éphémère
	mux := http.NewServeMux()
	server := &http.Server{Handler: mux}

	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		if code == "" {
			errChan <- fmt.Errorf("aucun code d'autorisation retourné par Google")
			http.Error(w, "Erreur d'authentification", http.StatusBadRequest)
			return
		}

		// Échange du code d'autorisation contre le jeton d'accès
		token, err := conf.Exchange(context.Background(), code)
		if err != nil {
			errChan <- fmt.Errorf("échec échange de token : %w", err)
			http.Error(w, "Échec de validation", http.StatusInternalServerError)
			return
		}

		// Récupération des informations du profil utilisateur
		client := conf.Client(context.Background(), token)
		resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
		if err != nil {
			errChan <- fmt.Errorf("échec récupération userinfo : %w", err)
			http.Error(w, "Erreur récupération profil", http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		var profile UserProfile
		if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
			errChan <- fmt.Errorf("décodage json profil : %w", err)
			http.Error(w, "Erreur décodage", http.StatusInternalServerError)
			return
		}

		// Page HTML de confirmation élégante affichée dans le navigateur
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `
			<!DOCTYPE html>
			<html lang="fr">
			<head>
				<meta charset="utf-8">
				<title>Kawu - Authentification Réussie</title>
				<style>
					body {
						margin: 0;
						background-color: #0b0e14;
						color: #ffffff;
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						display: flex;
						align-items: center;
						justify-content: center;
						height: 100vh;
					}
					.card {
						text-align: center;
						padding: 48px;
						background: rgba(255, 255, 255, 0.04);
						border: 1px solid rgba(6, 182, 212, 0.3);
						border-radius: 24px;
						box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
					}
					h1 { color: #06b6d4; margin: 0 0 12px 0; font-size: 26px; }
					p { color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 15px; }
				</style>
			</head>
			<body>
				<div class="card">
					<h1>✓ Connexion Réussie !</h1>
					<p>Bienvenue sur <strong>Kawu</strong>. Vous pouvez fermer cet onglet et retourner sur l'application.</p>
				</div>
			</body>
			</html>
		`)

		profileChan <- &profile
	})

	go server.Serve(listener)

	// 4. Ouvrir la page de connexion Google dans le navigateur par défaut
	browser.OpenURL(authURL)

	// 5. Attendre la confirmation
	select {
	case profile := <-profileChan:
		go server.Shutdown(context.Background())
		return profile, nil
	case err := <-errChan:
		go server.Shutdown(context.Background())
		return nil, err
	}
}

// FetchNakastreamSource executes a native HTTP request from Go backend to Nakastream API bypassing CORS
func (a *App) FetchNakastreamSource(mediaID string, mediaType string, season int, episode int) (string, error) {
	baseURL := fmt.Sprintf("https://nakastream.tv/api/v1/streaming/sources/%s?type=%s", mediaID, mediaType)
	if mediaType == "tv" && season > 0 && episode > 0 {
		baseURL = fmt.Sprintf("%s&season=%d&episode=%d", baseURL, season, episode)
	}

	log.Printf("\n========== NAKASTREAM DEBUG ==========\n")
	log.Printf("[NAKASTREAM] URL: %s\n", baseURL)
	log.Printf("[NAKASTREAM] MediaID: %s, Type: %s, Season: %d, Episode: %d\n", mediaID, mediaType, season, episode)

	req, err := http.NewRequest("GET", baseURL, nil)
	if err != nil {
		log.Printf("[NAKASTREAM] Request creation error: %v\n", err)
		return "", err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("Authorization", "Bearer "+getEnv("NAKASTREAM_TOKEN", "oat_MTI0MDczMw.c3hFdm1YYWJQNVhxTFJXSlNHc0hFalRIMHBteWctWVJscXV1UWVFODMxMDE1MTA3MDc"))
	if cf := getEnv("NAKASTREAM_CF_CLEARANCE", "kNmhAeHrGjuFQ5hS8OLx4gVjCfA8MpMo6Ce00lfMUjQ-1787652399-1.2.1.1-Ag_qLkxm3XJhCxVtmBEOFMMnvJUy7SSKAl0yatBb60omoq.cVJqwpiV64tgkNTRs4mlW.cfanUvHtLg7.dtN9hIjhnHo6.fbx0tLpf.KMTOd0YnYejJ4r_Jm.._unGQgc5uyuA9aN9uc9AVPXQu5md_mkAKZbLpckUq2_GgagQ0zv0GoeUwJLh1YZEvdQiU7qP1szaHAbVRQolznTs.2lPOEMTobFoV0SuPgyEGHUIcPgtzVbx_4Fw4vG81588U9J3QpD.Lb3QhKGBD9OAKkFRaC4IjW7tows01XGm0USU7Tc4XMrcbmXFq7f4uVZWAZ5HdXTXl3JjECXfU5R4LkiJ_1NOouE8O1vzKmrI1JK34"); cf != "" {
		req.Header.Set("Cookie", "cf_clearance="+cf)
	}
	if all := getEnv("NAKASTREAM_COOKIES", ""); all != "" {
		req.Header.Set("Cookie", all)
	}
	req.Header.Set("Priority", "u=1, i")
	req.Header.Set("Referer", fmt.Sprintf("https://nakastream.tv/player?id=%s&type=%s", mediaID, mediaType))
	req.Header.Set("Sec-Ch-Ua", `"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"`)
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", `"macOS"`)
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36")
	req.Header.Set("X-Profile-Id", getEnv("NAKASTREAM_PROFILE_ID", "22236"))

	log.Printf("[NAKASTREAM] Sending request...\n")
	token := getEnv("NAKASTREAM_TOKEN", "default")
	if len(token) > 30 {
		token = token[:30] + "..."
	}
	log.Printf("[NAKASTREAM] Authorization: Bearer %s\n", token)
	cf := getEnv("NAKASTREAM_CF_CLEARANCE", "default")
	if len(cf) > 30 {
		cf = cf[:30] + "..."
	}
	log.Printf("[NAKASTREAM] Cookie (cf_clearance): %s\n", cf)
	log.Printf("[NAKASTREAM] Referer: %s\n", req.Header.Get("Referer"))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[NAKASTREAM] HTTP request error: %v\n", err)
		log.Printf("========== END NAKASTREAM DEBUG ==========\n\n")
		return "", err
	}
	defer resp.Body.Close()

	log.Printf("[NAKASTREAM] Response status: %d %s\n", resp.StatusCode, resp.Status)
	log.Printf("[NAKASTREAM] Response headers:\n")
	for k, v := range resp.Header {
		log.Printf("  %s: %s\n", k, strings.Join(v, ", "))
	}

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("[NAKASTREAM] ERROR BODY: %s\n", string(bodyBytes))
		log.Printf("========== END NAKASTREAM DEBUG ==========\n\n")
		return "", fmt.Errorf("http status %d", resp.StatusCode)
	}

	log.Printf("[NAKASTREAM] SUCCESS!\n")
	log.Printf("========== END NAKASTREAM DEBUG ==========\n\n")

	var raw map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return "", err
	}

	bytes, err := json.Marshal(raw)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// FetchNakastreamSubtitle fetches VTT subtitle text content natively from Go backend bypassing CORS
func (a *App) FetchNakastreamSubtitle(vttURL string) (string, error) {
	req, err := http.NewRequest("GET", vttURL, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Accept", "*/*")
	req.Header.Set("Authorization", "Bearer "+getEnv("NAKASTREAM_TOKEN", "oat_MTE3ODQxMQ.Vk5lM1hlNTUxeUx1dzVhS1hsV193dnFnd2FkMmpPODE5M25GeUY4NzI0NjIxODg5ODA"))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http status %d", resp.StatusCode)
	}

	buf := make([]byte, 1024*1024) // 1MB buffer
	n, _ := resp.Body.Read(buf)
	return string(buf[:n]), nil
}

// FetchVidzySource fetches the Vidzy embed page HTML natively from Go backend bypassing CORS
func (a *App) FetchVidzySource(urlOrID string) (string, error) {
	embedURL := strings.TrimSpace(urlOrID)
	if !strings.HasPrefix(embedURL, "http://") && !strings.HasPrefix(embedURL, "https://") {
		embedURL = fmt.Sprintf("https://vidzy.live/embed-%s.html", embedURL)
	}

	req, err := http.NewRequest("GET", embedURL, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://vidzy.live/")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(bodyBytes), nil
}

// FetchUqloadSource fetches Uqload embed page HTML natively from Go backend
func (a *App) FetchUqloadSource(urlOrID string) (string, error) {
	embedURL := strings.TrimSpace(urlOrID)
	if !strings.HasPrefix(embedURL, "http://") && !strings.HasPrefix(embedURL, "https://") {
		embedURL = fmt.Sprintf("https://uqload.is/embed-%s.html", embedURL)
	}

	req, err := http.NewRequest("GET", embedURL, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(bodyBytes), nil
}

// FetchAnsembedSource fetches Ansembed embed page HTML natively from Go backend
func (a *App) FetchAnsembedSource(urlOrID string) (string, error) {
	embedURL := strings.TrimSpace(urlOrID)
	if !strings.HasPrefix(embedURL, "http://") && !strings.HasPrefix(embedURL, "https://") {
		embedURL = fmt.Sprintf("https://ansembed.net/embed-%s.html", embedURL)
	}

	req, err := http.NewRequest("GET", embedURL, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://ansembed.net/")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(bodyBytes), nil
}

// FetchWebPageHTML fetches raw HTML or JS content of any given URL from Go backend bypassing CORS
func (a *App) FetchWebPageHTML(targetURL string) (string, error) {
	targetURL = strings.TrimSpace(targetURL)
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(bodyBytes), nil
}


// getEnv returns the value of an env var, or fallback if not set
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	if v := loadConfigValue(key); v != "" {
		return v
	}
	return fallback
}

func loadConfigValue(key string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(home + "/.kawu/config.json")
	if err != nil {
		return ""
	}
	var cfg map[string]string
	if err := json.Unmarshal(data, &cfg); err != nil {
		return ""
	}
	return cfg[key]
}

// SetNakastreamConfig saves nakastream credentials to ~/.kawu/config.json
func (a *App) SetNakastreamConfig(token string, cfClearance string, profileID string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(home+"/.kawu", 0700); err != nil {
		return err
	}

	cfg := map[string]string{
		"NAKASTREAM_TOKEN":        token,
		"NAKASTREAM_CF_CLEARANCE": cfClearance,
		"NAKASTREAM_PROFILE_ID":   profileID,
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(home+"/.kawu/config.json", data, 0600)
}

// GetNakastreamConfig returns the current saved config
func (a *App) GetNakastreamConfig() map[string]string {
	cfg := map[string]string{}
	home, err := os.UserHomeDir()
	if err != nil {
		return cfg
	}
	data, err := os.ReadFile(home + "/.kawu/config.json")
	if err != nil {
		return cfg
	}
	_ = json.Unmarshal(data, &cfg)
	return cfg
}

// ProxyHlsContent fetches any HLS resource (m3u8, ts segments, vtt) bypassing CORS
func (a *App) ProxyHlsContent(url string) (string, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
	req.Header.Set("X-Playback-Session-Id", "kawu-session")
	req.Header.Set("Connection", "Keep-Alive")
	req.Header.Set("Sec-Fetch-Dest", "video")
	req.Header.Set("Sec-Fetch-Mode", "no-cors")
	req.Header.Set("Sec-Fetch-Site", "cross-site")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}
