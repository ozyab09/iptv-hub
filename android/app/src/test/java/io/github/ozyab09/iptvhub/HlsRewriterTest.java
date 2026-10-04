package io.github.ozyab09.iptvhub;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.net.URI;

import org.junit.Test;

/** #452: переписывание HLS для прокси приложения — чистая логика, JVM-тест. */
public class HlsRewriterTest {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final URI BASE = URI.create("http://iptv.example:8080/live/chan/index.m3u8?token=abc");

    @Test public void mediaPlaylistSegmentsGoThroughProxy() {
        String body = "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg1.ts\n#EXTINF:4,\n/root/seg2.ts?x=1\n"
                + "#EXTINF:4,\nhttps://cdn.example/seg3.ts\n#EXT-X-ENDLIST\n";
        String out = HlsRewriter.rewrite(body, BASE, ORIGIN);
        assertEquals("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n"
                + ORIGIN + "/proxy/http/iptv.example:8080/live/chan/seg1.ts\n#EXTINF:4,\n"
                + ORIGIN + "/proxy/http/iptv.example:8080/root/seg2.ts?x=1\n#EXTINF:4,\n"
                + ORIGIN + "/proxy/https/cdn.example/seg3.ts\n#EXT-X-ENDLIST\n", out);
    }

    @Test public void uriAttributesOfKeysMapsAndMediaAreRewritten() {
        String body = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\",IV=0x1\n#EXT-X-MAP:URI=\"init.mp4\"\n"
                + "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",URI=\"audio/a.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhd/index.m3u8\r\n";
        String out = HlsRewriter.rewrite(body, BASE, ORIGIN);
        assertTrue(out.contains("URI=\"" + ORIGIN + "/proxy/http/iptv.example:8080/live/chan/key.bin\",IV=0x1"));
        assertTrue(out.contains("#EXT-X-MAP:URI=\"" + ORIGIN + "/proxy/http/iptv.example:8080/live/chan/init.mp4\""));
        assertTrue(out.contains("URI=\"" + ORIGIN + "/proxy/http/iptv.example:8080/live/chan/audio/a.m3u8\""));
        // CRLF-строки сохраняют перевод строки.
        assertTrue(out.endsWith(ORIGIN + "/proxy/http/iptv.example:8080/live/chan/hd/index.m3u8\r\n"));
    }

    @Test public void nonHttpSchemesAndUnparseableLinesStayAsIs() {
        String body = "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nrtmp://x/live\n#EXTINF:4,\nbad uri with spaces\n";
        String out = HlsRewriter.rewrite(body, BASE, ORIGIN);
        assertTrue(out.contains("\nrtmp://x/live\n"));
        assertTrue(out.contains("\nbad uri with spaces\n"));
        assertNull(HlsRewriter.proxyUrl(URI.create("rtmp://x/live"), ORIGIN));
    }

    @Test public void onlyHlsPlaylistsAreRewrittenNotChannelLists() {
        assertTrue(HlsRewriter.isHlsPlaylist("#EXTM3U\n#EXT-X-VERSION:3\n"));
        assertFalse(HlsRewriter.isHlsPlaylist("#EXTM3U\n#EXTINF:-1 tvg-id=\"a\",A\nhttp://x/a.m3u8\n"));
    }
}
