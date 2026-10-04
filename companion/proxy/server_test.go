package proxy

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

const (
	pages = "https://ozyab09.github.io"
	token = "t0k3n"
)

// upstream — тестовый провайдер: HLS, список каналов, сегмент с Range, редирект, ошибка.
func upstream(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/live/index.m3u8":
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			io.WriteString(w, "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg.ts\n#EXTINF:4,\n/abs/seg2.ts\n#EXT-X-ENDLIST\n")
		case "/list.m3u":
			w.Header().Set("Content-Type", "audio/x-mpegurl")
			io.WriteString(w, "#EXTM3U\n#EXTINF:-1,A\nhttp://iptv.example/a.m3u8\n")
		case "/live/seg.ts":
			w.Header().Set("Content-Type", "video/mp2t")
			if r.Header.Get("Range") == "bytes=0-3" {
				w.Header().Set("Content-Range", "bytes 0-3/10")
				w.WriteHeader(http.StatusPartialContent)
				io.WriteString(w, "0123")
				return
			}
			io.WriteString(w, "0123456789")
		case "/redirect":
			http.Redirect(w, r, "/list.m3u", http.StatusFound)
		case "/loop":
			http.Redirect(w, r, "/loop", http.StatusFound)
		default:
			http.Error(w, "missing", http.StatusNotFound)
		}
	}))
}

func newTestServer(allowLocal bool) *Server {
	return New(Config{Port: 47800, Token: token, Version: "test", Origins: []string{pages}, AllowLocalTargets: allowLocal})
}

func do(s *Server, method, path, origin string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	return rec
}

func proxyPath(up *httptest.Server, path string) string {
	u, _ := url.Parse(up.URL)
	return "/proxy/" + token + "/http/" + u.Host + path
}

func TestHealthAndPairOnlyForAllowedOrigin(t *testing.T) {
	s := newTestServer(true)
	rec := do(s, "GET", "/health", pages, nil)
	if rec.Code != 200 || rec.Header().Get("Access-Control-Allow-Origin") != pages {
		t.Fatalf("health: %d %q", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
	}
	var health map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &health)
	if health["app"] != "iptv-hub-companion" || health["protocol"] != float64(Protocol) {
		t.Fatalf("health body: %v", health)
	}
	if rec := do(s, "GET", "/health", "https://evil.example", nil); rec.Code != 403 {
		t.Fatalf("foreign origin health: %d", rec.Code)
	}
	rec = do(s, "GET", "/pair", pages, nil)
	var pair map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &pair)
	if rec.Code != 200 || pair["token"] != token || pair["proxyBase"] != "http://127.0.0.1:47800/proxy/"+token {
		t.Fatalf("pair: %d %v", rec.Code, pair)
	}
	if rec := do(s, "GET", "/pair", "", nil); rec.Code != 403 {
		t.Fatalf("pair without origin must be refused: %d", rec.Code)
	}
	if rec := do(s, "GET", "/pair", "https://evil.example", nil); rec.Code != 403 {
		t.Fatalf("pair for foreign origin: %d", rec.Code)
	}
}

func TestPreflightAllowsPrivateNetworkAccess(t *testing.T) {
	s := newTestServer(true)
	rec := do(s, "OPTIONS", "/health", pages, map[string]string{"Access-Control-Request-Private-Network": "true"})
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Private-Network") != "true" || !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "Range") {
		t.Fatalf("preflight: %d %v", rec.Code, rec.Header())
	}
}

func TestHLSIsRewrittenAndChannelListsAreNot(t *testing.T) {
	up := upstream(t)
	defer up.Close()
	s := newTestServer(true)
	rec := do(s, "GET", proxyPath(up, "/live/index.m3u8"), pages, nil)
	host := strings.TrimPrefix(up.URL, "http://")
	body := rec.Body.String()
	if rec.Code != 200 || !strings.Contains(body, s.ProxyBase()+"/http/"+host+"/live/seg.ts") || !strings.Contains(body, s.ProxyBase()+"/http/"+host+"/abs/seg2.ts") {
		t.Fatalf("hls: %d\n%s", rec.Code, body)
	}
	rec = do(s, "GET", proxyPath(up, "/redirect"), pages, nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "http://iptv.example/a.m3u8") {
		t.Fatalf("channel list after redirect: %d %s", rec.Code, rec.Body.String())
	}
}

func TestGzipBodyPassesThroughUnchanged(t *testing.T) {
	var gz bytes.Buffer
	zw := gzip.NewWriter(&gz)
	io.WriteString(zw, "<tv/>")
	zw.Close()
	payload := gz.Bytes()
	seenEncoding := ""
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenEncoding = r.Header.Get("Accept-Encoding")
		w.Header().Set("Content-Type", "application/gzip")
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		w.Write(payload)
	}))
	defer up.Close()
	s := newTestServer(true)
	// Браузер просит gzip, но компаньон провайдеру передаёт identity и отдаёт
	// байты как есть: магия 1f 8b у сайта остаётся, Content-Length совпадает.
	rec := do(s, "GET", proxyPath(up, "/epg.xml.gz"), pages, map[string]string{"Accept-Encoding": "gzip"})
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), payload) {
		t.Fatalf("gzip body changed: %d %q", rec.Code, rec.Body.Bytes())
	}
	if seenEncoding != "identity" {
		t.Fatalf("upstream Accept-Encoding: %q", seenEncoding)
	}
	if rec.Header().Get("Content-Length") != strconv.Itoa(len(payload)) || rec.Header().Get("Content-Type") != "application/gzip" {
		t.Fatalf("headers: %v", rec.Header())
	}
}

func TestRangeErrorsAndRedirectLoop(t *testing.T) {
	up := upstream(t)
	defer up.Close()
	s := newTestServer(true)
	rec := do(s, "GET", proxyPath(up, "/live/seg.ts"), pages, map[string]string{"Range": "bytes=0-3"})
	if rec.Code != 206 || rec.Body.String() != "0123" || rec.Header().Get("Content-Range") != "bytes 0-3/10" {
		t.Fatalf("range: %d %q %v", rec.Code, rec.Body.String(), rec.Header())
	}
	if rec := do(s, "GET", proxyPath(up, "/nope"), pages, nil); rec.Code != 404 {
		t.Fatalf("provider status must pass through: %d", rec.Code)
	}
	if rec := do(s, "GET", proxyPath(up, "/loop"), pages, nil); rec.Code != 502 {
		t.Fatalf("redirect loop: %d", rec.Code)
	}
}

func TestTokenAndSchemeAreRequired(t *testing.T) {
	up := upstream(t)
	defer up.Close()
	s := newTestServer(true)
	bad := strings.Replace(proxyPath(up, "/list.m3u"), token, "wrong", 1)
	if rec := do(s, "GET", bad, "", nil); rec.Code != 403 {
		t.Fatalf("missing/wrong token without origin (no-cors media): %d", rec.Code)
	}
	if rec := do(s, "GET", "/proxy/"+token+"/ftp/x/y", pages, nil); rec.Code != 400 {
		t.Fatalf("ftp scheme: %d", rec.Code)
	}
	if rec := do(s, "POST", proxyPath(up, "/list.m3u"), pages, nil); rec.Code != 405 {
		t.Fatalf("post: %d", rec.Code)
	}
	if rec := do(s, "GET", proxyPath(up, "/list.m3u"), "https://evil.example", nil); rec.Code != 403 {
		t.Fatalf("foreign origin proxy: %d", rec.Code)
	}
}

func TestLocalAndPrivateUpstreamsAreForbidden(t *testing.T) {
	up := upstream(t)
	defer up.Close()
	s := newTestServer(false)
	if rec := do(s, "GET", proxyPath(up, "/list.m3u"), pages, nil); rec.Code != 403 {
		t.Fatalf("loopback upstream must be refused (SSRF): %d %s", rec.Code, rec.Body.String())
	}
	for _, addr := range []string{"127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fe80::1", "100.64.0.1", "0.0.0.0"} {
		if !forbidden(netip.MustParseAddr(addr)) {
			t.Errorf("%s must be forbidden", addr)
		}
	}
	for _, addr := range []string{"8.8.8.8", "93.184.216.34", "2606:4700::1111"} {
		if forbidden(netip.MustParseAddr(addr)) {
			t.Errorf("%s must be allowed", addr)
		}
	}
}
