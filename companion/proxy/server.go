// Package proxy — локальный прокси компаньона IPTV Hub (#452, #463).
//
// Сайт на GitHub Pages обращается к http://127.0.0.1:<port>: браузер считает
// loopback безопасным адресом, поэтому http-ресурсы провайдера, загруженные
// компаньоном, не блокируются как mixed content, а CORS-заголовки ставит сам
// компаньон. Это не серверный прокси: всё работает на устройстве
// пользователя, внешних сервисов нет, ссылки никуда не отправляются и не
// логируются.
package proxy

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Protocol — версия контракта с сайтом (/health); растёт при несовместимых изменениях.
const Protocol = 1

const (
	maxPlaylistBytes = 20 << 20
	maxRedirects     = 5
)

var (
	forwardedRequest = []string{"Range", "If-Range", "User-Agent", "Accept", "Accept-Language"}
	returnedResponse = []string{"Content-Type", "Content-Range", "Accept-Ranges", "Cache-Control", "ETag", "Last-Modified"}
)

// Config — параметры сервера компаньона.
type Config struct {
	Port    int
	Token   string
	Version string
	// Origins — сайты, которым разрешено пользоваться компаньоном.
	Origins []string
	// AllowLocalTargets снимает запрет на loopback/приватные адреса назначения (только тесты).
	AllowLocalTargets bool
}

// Server обслуживает /health, /pair и /proxy/.
type Server struct {
	cfg     Config
	origins map[string]bool
	client  *http.Client
}

func New(cfg Config) *Server {
	origins := map[string]bool{}
	for _, o := range cfg.Origins {
		origins[strings.TrimRight(o, "/")] = true
	}
	transport := &http.Transport{
		Proxy:                 nil, // напрямую: системный прокси мог бы указывать в локальную сеть
		DialContext:           newDialer(cfg.AllowLocalTargets),
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConnsPerHost:   8,
	}
	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return errors.New("unsupported redirect scheme")
			}
			return nil
		},
	}
	return &Server{cfg: cfg, origins: origins, client: client}
}

// ProxyBase — префикс прокси-адресов: http://127.0.0.1:<port>/proxy/<token>.
func (s *Server) ProxyBase() string {
	return fmt.Sprintf("http://127.0.0.1:%d/proxy/%s", s.cfg.Port, s.cfg.Token)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" {
		// Чужим сайтам компаньон не отвечает вовсе: ни проверка наличия, ни прокси.
		if !s.origins[origin] {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Add("Vary", "Origin")
		h.Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
	}
	if r.Method == http.MethodOptions {
		s.preflight(w, r, origin)
		return
	}
	switch {
	case r.URL.Path == "/health":
		writeJSON(w, map[string]any{"app": "iptv-hub-companion", "version": s.cfg.Version, "protocol": Protocol})
	case r.URL.Path == "/pair":
		// Токен получает только разрешённый сайт: браузер не даёт подделать Origin.
		if origin == "" {
			http.Error(w, "origin required", http.StatusForbidden)
			return
		}
		writeJSON(w, map[string]any{"token": s.cfg.Token, "proxyBase": s.ProxyBase(), "protocol": Protocol})
	case strings.HasPrefix(r.URL.Path, "/proxy/"):
		s.proxy(w, r)
	default:
		http.NotFound(w, r)
	}
}

// preflight отвечает на CORS-preflight и запрос Private Network Access:
// сайт в интернете обращается к loopback, Chrome спрашивает разрешение явно.
func (s *Server) preflight(w http.ResponseWriter, r *http.Request, origin string) {
	if origin == "" {
		http.Error(w, "origin required", http.StatusForbidden)
		return
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Range, If-Range")
	h.Set("Access-Control-Max-Age", "600")
	if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
		h.Set("Access-Control-Allow-Private-Network", "true")
	}
	w.WriteHeader(http.StatusNoContent)
}

// upstreamFromPath разбирает /proxy/<token>/<scheme>/<authority><path>.
func upstreamFromPath(escapedPath, rawQuery string) (token string, target *url.URL, ok bool) {
	rest := strings.TrimPrefix(escapedPath, "/proxy/")
	parts := strings.SplitN(rest, "/", 4)
	if len(parts) < 3 {
		return "", nil, false
	}
	token, scheme, authority := parts[0], strings.ToLower(parts[1]), parts[2]
	if (scheme != "http" && scheme != "https") || authority == "" {
		return "", nil, false
	}
	path := "/"
	if len(parts) == 4 {
		path += parts[3]
	}
	raw := scheme + "://" + authority + path
	if rawQuery != "" {
		raw += "?" + rawQuery
	}
	target, err := url.Parse(raw)
	if err != nil || target.Host == "" {
		return "", nil, false
	}
	return token, target, true
}

func (s *Server) proxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token, target, ok := upstreamFromPath(r.URL.EscapedPath(), r.URL.RawQuery)
	if !ok {
		http.Error(w, "bad proxy path", http.StatusBadRequest)
		return
	}
	// Токен обязателен даже без Origin: <video src> и <img> чужой вкладки
	// шлют запрос без CORS, и без токена компаньон стал бы открытым relay.
	if subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.Token)) != 1 {
		http.Error(w, "bad token", http.StatusForbidden)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target.String(), nil)
	if err != nil {
		http.Error(w, "bad upstream", http.StatusBadRequest)
		return
	}
	for _, name := range forwardedRequest {
		if v := r.Header.Get(name); v != "" {
			req.Header.Set(name, v)
		}
	}
	// Байты провайдера передаём как есть: прозрачная распаковка Go могла бы
	// рассинхронизировать Content-Length (например, у .xml.gz EPG).
	req.Header.Set("Accept-Encoding", "identity")
	resp, err := s.client.Do(req)
	if err != nil {
		// Без URL: платные ссылки не должны попадать в логи.
		if errors.Is(err, ErrForbiddenTarget) {
			http.Error(w, "forbidden upstream address", http.StatusForbidden)
			return
		}
		log.Printf("proxy: upstream error: %T", err)
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	for _, name := range returnedResponse {
		if v := resp.Header.Get(name); v != "" {
			w.Header().Set(name, v)
		}
	}
	if resp.StatusCode < 400 && r.Method == http.MethodGet && looksLikePlaylist(resp.Header.Get("Content-Type"), resp.Request.URL.Path) {
		s.playlist(w, resp)
		return
	}
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (s *Server) playlist(w http.ResponseWriter, resp *http.Response) {
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxPlaylistBytes+1))
	if err != nil || len(body) > maxPlaylistBytes {
		http.Error(w, "playlist unavailable", http.StatusBadGateway)
		return
	}
	text := string(body)
	if IsHLSPlaylist(text) {
		text = RewriteHLS(text, resp.Request.URL, s.ProxyBase())
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	}
	w.Header().Set("Content-Length", fmt.Sprint(len(text)))
	w.WriteHeader(resp.StatusCode)
	_, _ = io.WriteString(w, text)
}

func looksLikePlaylist(contentType, path string) bool {
	p := strings.ToLower(path)
	return strings.Contains(strings.ToLower(contentType), "mpegurl") || strings.HasSuffix(p, ".m3u8") || strings.HasSuffix(p, ".m3u")
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}
