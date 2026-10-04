package io.github.ozyab09.iptvhub;

import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertTrue;

/**
 * #452: прокси приложения на реальном WebView. Тестовый HTTP-сервер на
 * loopback отдаёт HLS, список каналов и сегмент с byte-range; страница
 * приложения берёт их через /proxy/ того же origin.
 */
@RunWith(AndroidJUnit4.class)
public class AppProxyTest {
    @Rule public ActivityScenarioRule<MainActivity> activity = new ActivityScenarioRule<>(MainActivity.class);

    private ServerSocket server;
    private Thread serverThread;

    @Before public void startServer() throws IOException {
        server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        serverThread = new Thread(() -> {
            while (!server.isClosed()) {
                try (Socket socket = server.accept()) {
                    serve(socket);
                } catch (IOException ignored) {
                    // сервер закрыт или клиент отвалился
                }
            }
        });
        serverThread.start();
    }

    @After public void stopServer() throws IOException, InterruptedException {
        server.close();
        serverThread.join(2000);
    }

    private void serve(Socket socket) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
        String requestLine = in.readLine();
        if (requestLine == null) return;
        String path = requestLine.split(" ")[1];
        String range = null;
        for (String line = in.readLine(); line != null && !line.isEmpty(); line = in.readLine()) {
            if (line.toLowerCase().startsWith("range:")) range = line.substring(6).trim();
        }
        OutputStream out = socket.getOutputStream();
        if (path.startsWith("/live/index.m3u8")) {
            write(out, "200 OK", "application/vnd.apple.mpegurl", null,
                    "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg.ts\n#EXTINF:4,\n/abs/seg2.ts\n#EXT-X-ENDLIST\n");
        } else if (path.equals("/list.m3u")) {
            write(out, "200 OK", "audio/x-mpegurl", null, "#EXTM3U\n#EXTINF:-1,A\nhttp://iptv.example/a.m3u8\n");
        } else if (path.equals("/live/seg.ts")) {
            if ("bytes=0-3".equals(range)) write(out, "206 Partial Content", "video/mp2t", "Content-Range: bytes 0-3/10\r\n", "0123");
            else write(out, "200 OK", "video/mp2t", null, "0123456789");
        } else if (path.equals("/redirect")) {
            write(out, "302 Found", "text/plain", "Location: /list.m3u\r\n", "");
        } else {
            write(out, "404 Not Found", "text/plain", null, "missing");
        }
    }

    private static void write(OutputStream out, String status, String type, String extra, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + bytes.length
                + "\r\nConnection: close\r\n" + (extra == null ? "" : extra) + "\r\n";
        out.write(head.getBytes(StandardCharsets.US_ASCII));
        out.write(bytes);
        out.flush();
    }

    private WebView webView(MainActivity main) {
        ViewGroup content = main.findViewById(android.R.id.content);
        return (WebView) ((ViewGroup) content.getChildAt(0)).getChildAt(0);
    }

    private String evaluate(String script) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.getScenario().onActivity(main -> webView(main).evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        done.await(2, TimeUnit.SECONDS);
        return result.get();
    }

    /** Выполнить fetch на странице и дождаться JSON-ответа {status, text}. */
    private String fetchThroughProxy(String path, String headersJs) throws InterruptedException {
        String key = "__proxy" + System.nanoTime();
        long ready = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (!"true".equals(evaluate("!!document.querySelector('#side-nav')")) && System.nanoTime() < ready) Thread.sleep(100);
        evaluate("fetch('/proxy/http/127.0.0.1:" + server.getLocalPort() + path + "', {headers: " + headersJs + "})"
                + ".then(r => r.text().then(t => window." + key + " = JSON.stringify({status: r.status, text: t})))"
                + ".catch(e => window." + key + " = JSON.stringify({status: -1, text: String(e)}))");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        String value;
        do {
            value = evaluate("window." + key + " || null");
            if (value != null && !"null".equals(value)) return value;
            Thread.sleep(100);
        } while (System.nanoTime() < deadline);
        return value;
    }

    @Test public void hlsPlaylistIsRewrittenThroughProxy() throws InterruptedException {
        String result = fetchThroughProxy("/live/index.m3u8?token=1", "{}");
        String prefix = "https://appassets.androidplatform.net/proxy/http/127.0.0.1:" + server.getLocalPort();
        assertTrue(result, result.contains("\\\"status\\\":200"));
        assertTrue(result, result.contains(prefix + "/live/seg.ts"));
        assertTrue(result, result.contains(prefix + "/abs/seg2.ts"));
    }

    @Test public void channelListIsNotRewrittenAndRedirectsAreFollowed() throws InterruptedException {
        String result = fetchThroughProxy("/redirect", "{}");
        assertTrue(result, result.contains("\\\"status\\\":200"));
        assertTrue(result, result.contains("http://iptv.example/a.m3u8"));
    }

    @Test public void byteRangeAndProviderErrorsPassThrough() throws InterruptedException {
        String partial = fetchThroughProxy("/live/seg.ts", "{Range: 'bytes=0-3'}");
        assertTrue(partial, partial.contains("\\\"status\\\":206"));
        assertTrue(partial, partial.contains("\\\"text\\\":\\\"0123\\\""));
        String missing = fetchThroughProxy("/nope", "{}");
        assertTrue(missing, missing.contains("\\\"status\\\":404"));
    }
}
