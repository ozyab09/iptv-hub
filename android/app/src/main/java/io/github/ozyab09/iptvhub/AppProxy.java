package io.github.ozyab09.iptvhub;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Прокси внутри приложения (#452). Страница запрашивает
 * https://appassets.androidplatform.net/proxy/{scheme}/{authority}{path}?{query};
 * MainActivity отдаёт такой запрос сюда, и приложение само загружает исходный
 * http(s)-ресурс. Для страницы это тот же origin: нет mixed content и CORS.
 *
 * Это не серверный прокси: всё происходит на устройстве, внешних сервисов
 * нет. Платные URL не логируются. Наружу уходят только http/https.
 */
final class AppProxy {
    static final String PATH_PREFIX = "/proxy/";
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_PLAYLIST_BYTES = 20 * 1024 * 1024;
    /** Заголовки запроса страницы, которые имеет смысл передать провайдеру. */
    private static final String[] FORWARDED = {"Range", "User-Agent", "Accept", "Accept-Language", "If-Range"};
    /** Заголовки ответа провайдера, нужные плееру (byte-range, кэш). */
    private static final String[] RETURNED = {"Content-Range", "Accept-Ranges", "Cache-Control", "Last-Modified", "ETag"};

    private AppProxy() {}

    static boolean handles(@NonNull Uri uri, @NonNull String localHost) {
        String path = uri.getPath();
        return localHost.equals(uri.getHost()) && path != null && path.startsWith(PATH_PREFIX);
    }

    /** Исходный адрес из прокси-пути или null, если путь битый или схема не http(s). */
    @Nullable
    static String upstreamUrl(@NonNull Uri uri) {
        String path = uri.getEncodedPath();
        if (path == null || !path.startsWith(PATH_PREFIX)) return null;
        String rest = path.substring(PATH_PREFIX.length());
        int schemeEnd = rest.indexOf('/');
        if (schemeEnd <= 0) return null;
        String scheme = rest.substring(0, schemeEnd).toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) return null;
        String afterScheme = rest.substring(schemeEnd + 1);
        int authorityEnd = afterScheme.indexOf('/');
        String authority = authorityEnd < 0 ? afterScheme : afterScheme.substring(0, authorityEnd);
        if (authority.isEmpty()) return null;
        String target = authorityEnd < 0 ? "/" : afterScheme.substring(authorityEnd);
        String query = uri.getEncodedQuery();
        return scheme + "://" + authority + target + (query == null ? "" : "?" + query);
    }

    @NonNull
    static WebResourceResponse handle(@NonNull WebResourceRequest request, @NonNull String proxyOrigin) {
        String upstream = upstreamUrl(request.getUrl());
        if (upstream == null) return error(400, "Bad Request");
        try {
            return fetch(upstream, request, proxyOrigin);
        } catch (IOException | URISyntaxException e) {
            // Причину без URL: платные ссылки не должны попадать в логи.
            return error(502, "Bad Gateway");
        }
    }

    private static WebResourceResponse fetch(String upstream, WebResourceRequest request, String proxyOrigin)
            throws IOException, URISyntaxException {
        URL url = new URL(upstream);
        HttpURLConnection connection = null;
        for (int redirects = 0; ; redirects++) {
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(30_000);
            connection.setRequestMethod("HEAD".equalsIgnoreCase(request.getMethod()) ? "HEAD" : "GET");
            for (String name : FORWARDED) {
                String value = header(request.getRequestHeaders(), name);
                if (value != null) connection.setRequestProperty(name, value);
            }
            int status = connection.getResponseCode();
            String location = connection.getHeaderField("Location");
            // HttpURLConnection не переходит http↔https сам — редиректы ведём вручную.
            if (status >= 300 && status < 400 && location != null && redirects < MAX_REDIRECTS) {
                URL next = new URL(url, location);
                String protocol = next.getProtocol();
                if (!protocol.equals("http") && !protocol.equals("https")) return error(502, "Bad Gateway");
                connection.disconnect();
                url = next;
                continue;
            }
            break;
        }
        int status = connection.getResponseCode();
        if (status >= 300 && status < 400) return error(502, "Bad Gateway");
        InputStream body = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (body == null) body = new ByteArrayInputStream(new byte[0]);
        String contentType = connection.getContentType();
        String mime = mimeOf(contentType);
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        for (String name : RETURNED) {
            String value = connection.getHeaderField(name);
            if (value != null) headers.put(name, value);
        }
        String reason = connection.getResponseMessage();
        if (reason == null || reason.trim().isEmpty()) reason = status < 400 ? "OK" : "Error";

        if (status < 400 && looksLikePlaylist(mime, url.getPath())) {
            byte[] bytes = readLimited(body);
            String text = new String(bytes, StandardCharsets.UTF_8);
            if (HlsRewriter.isHlsPlaylist(text)) {
                // Сегменты и варианты — через тот же прокси, относительно настоящего адреса.
                text = HlsRewriter.rewrite(text, url.toURI(), proxyOrigin);
                return new WebResourceResponse("application/vnd.apple.mpegurl", "utf-8", status, reason, headers,
                        new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
            }
            // Список каналов M3U не переписываем: URL каналов — их идентичность.
            headers.put("Content-Length", String.valueOf(bytes.length));
            return new WebResourceResponse(mime, charsetOf(contentType), status, reason, headers, new ByteArrayInputStream(bytes));
        }
        String length = connection.getHeaderField("Content-Length");
        if (length != null) headers.put("Content-Length", length);
        return new WebResourceResponse(mime, charsetOf(contentType), status, reason, headers, body);
    }

    private static boolean looksLikePlaylist(String mime, String path) {
        String lowerPath = path == null ? "" : path.toLowerCase(Locale.ROOT);
        return mime.contains("mpegurl") || lowerPath.endsWith(".m3u8") || lowerPath.endsWith(".m3u");
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        try (InputStream input = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > MAX_PLAYLIST_BYTES) throw new IOException("playlist too large");
            }
            return out.toByteArray();
        }
    }

    @Nullable
    private static String header(@Nullable Map<String, String> headers, String name) {
        if (headers == null) return null;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (name.equalsIgnoreCase(entry.getKey())) return entry.getValue();
        }
        return null;
    }

    private static String mimeOf(@Nullable String contentType) {
        if (contentType == null || contentType.isEmpty()) return "application/octet-stream";
        int semicolon = contentType.indexOf(';');
        return (semicolon < 0 ? contentType : contentType.substring(0, semicolon)).trim().toLowerCase(Locale.ROOT);
    }

    @Nullable
    private static String charsetOf(@Nullable String contentType) {
        if (contentType == null) return null;
        for (String part : contentType.split(";")) {
            String p = part.trim();
            if (p.toLowerCase(Locale.ROOT).startsWith("charset=")) return p.substring(8).trim();
        }
        return null;
    }

    private static WebResourceResponse error(int status, String reason) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "utf-8", status, reason, headers, new ByteArrayInputStream(new byte[0]));
    }
}
