package proxy

import (
	"net/url"
	"regexp"
	"strings"
)

var uriAttribute = regexp.MustCompile(`URI="([^"]*)"`)

// IsHLSPlaylist отличает HLS (теги EXT-X-) от списка каналов M3U:
// URL каналов — их идентичность на сайте, их не переписываем.
func IsHLSPlaylist(body string) bool {
	return strings.Contains(body, "#EXT-X-")
}

// ProxyURL — прокси-адрес для абсолютного http(s)-URL или "" для прочих схем.
// Формат: {base}/{scheme}/{authority}{path}?{query}, base = .../proxy/<token>.
func ProxyURL(target *url.URL, base string) string {
	scheme := strings.ToLower(target.Scheme)
	if (scheme != "http" && scheme != "https") || target.Host == "" {
		return ""
	}
	path := target.EscapedPath()
	if path == "" {
		path = "/"
	}
	query := ""
	if target.RawQuery != "" {
		query = "?" + target.RawQuery
	}
	return base + "/" + scheme + "/" + target.Host + path + query
}

// RewriteHLS направляет через прокси URI сегментов, вариантов и атрибутов
// URI="…" (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA), разрешая их относительно
// настоящего адреса плейлиста. Та же логика, что у HlsRewriter в APK (#452).
func RewriteHLS(body string, playlist *url.URL, base string) string {
	lines := strings.Split(body, "\n")
	for i, line := range lines {
		cr := strings.HasSuffix(line, "\r")
		content := strings.TrimSuffix(line, "\r")
		trimmed := strings.TrimSpace(content)
		switch {
		case trimmed == "":
		case strings.HasPrefix(trimmed, "#"):
			content = uriAttribute.ReplaceAllStringFunc(content, func(attr string) string {
				ref := uriAttribute.FindStringSubmatch(attr)[1]
				return `URI="` + proxied(ref, playlist, base) + `"`
			})
		default:
			content = proxied(trimmed, playlist, base)
		}
		if cr {
			content += "\r"
		}
		lines[i] = content
	}
	return strings.Join(lines, "\n")
}

func proxied(ref string, playlist *url.URL, base string) string {
	parsed, err := url.Parse(strings.TrimSpace(ref))
	if err != nil {
		return ref // нестандартная ссылка — оставляем как есть
	}
	if p := ProxyURL(playlist.ResolveReference(parsed), base); p != "" {
		return p
	}
	return ref
}
