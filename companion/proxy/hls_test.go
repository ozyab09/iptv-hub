package proxy

import (
	"net/url"
	"strings"
	"testing"
)

const base = "http://127.0.0.1:47800/proxy/tok"

func TestRewriteHLSResolvesAllReferenceKinds(t *testing.T) {
	playlist, _ := url.Parse("http://iptv.example:8080/live/chan/index.m3u8?token=abc")
	body := "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\",IV=0x1\n#EXT-X-MAP:URI=\"init.mp4\"\n" +
		"#EXTINF:4,\nseg1.ts\n#EXTINF:4,\n/root/seg2.ts?x=1\n#EXTINF:4,\nhttps://cdn.example/seg3.ts\n#EXTINF:4,\nrtmp://x/live\r\n"
	out := RewriteHLS(body, playlist, base)
	for _, want := range []string{
		`URI="` + base + `/http/iptv.example:8080/live/chan/key.bin",IV=0x1`,
		`#EXT-X-MAP:URI="` + base + `/http/iptv.example:8080/live/chan/init.mp4"`,
		"\n" + base + "/http/iptv.example:8080/live/chan/seg1.ts\n",
		"\n" + base + "/http/iptv.example:8080/root/seg2.ts?x=1\n",
		"\n" + base + "/https/cdn.example/seg3.ts\n",
		"\nrtmp://x/live\r\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in\n%s", want, out)
		}
	}
}

func TestOnlyHLSIsRewritten(t *testing.T) {
	if !IsHLSPlaylist("#EXTM3U\n#EXT-X-VERSION:3\n") || IsHLSPlaylist("#EXTM3U\n#EXTINF:-1,A\nhttp://x/a.m3u8\n") {
		t.Fatal("HLS detection")
	}
}
