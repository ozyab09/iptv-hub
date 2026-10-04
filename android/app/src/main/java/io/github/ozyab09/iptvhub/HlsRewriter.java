package io.github.ozyab09.iptvhub;

import androidx.annotation.NonNull;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Переписывание HLS-плейлиста для прокси приложения (#452): все URI сегментов,
 * вариантов и атрибутов URI="…" (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, …)
 * разрешаются относительно настоящего адреса плейлиста и направляются через
 * /proxy/. Так относительные, абсолютные и «от корня» ссылки продолжают
 * работать, а сегменты с https-CDN без CORS тоже идут через приложение.
 * Чистый класс без Android API — покрыт JVM-тестом.
 */
final class HlsRewriter {
    private static final Pattern URI_ATTRIBUTE = Pattern.compile("URI=\"([^\"]*)\"");

    private HlsRewriter() {}

    /** HLS-плейлист (а не список каналов M3U): есть теги EXT-X-. */
    static boolean isHlsPlaylist(@NonNull String body) {
        return body.contains("#EXT-X-");
    }

    /**
     * Прокси-адрес для абсолютного http(s)-URI или null для прочих схем.
     * Формат: {origin}/proxy/{scheme}/{authority}{path}?{query}.
     */
    static String proxyUrl(@NonNull URI target, @NonNull String proxyOrigin) {
        String scheme = target.getScheme();
        if (scheme == null || target.getRawAuthority() == null) return null;
        scheme = scheme.toLowerCase(java.util.Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) return null;
        String path = target.getRawPath() == null || target.getRawPath().isEmpty() ? "/" : target.getRawPath();
        String query = target.getRawQuery() == null ? "" : "?" + target.getRawQuery();
        return proxyOrigin + "/proxy/" + scheme + "/" + target.getRawAuthority() + path + query;
    }

    @NonNull
    static String rewrite(@NonNull String body, @NonNull URI base, @NonNull String proxyOrigin) {
        String[] lines = body.split("\n", -1);
        StringBuilder out = new StringBuilder(body.length() + 256);
        for (int i = 0; i < lines.length; i++) {
            if (i > 0) out.append('\n');
            out.append(rewriteLine(lines[i], base, proxyOrigin));
        }
        return out.toString();
    }

    private static String rewriteLine(String line, URI base, String proxyOrigin) {
        boolean carriageReturn = line.endsWith("\r");
        String content = carriageReturn ? line.substring(0, line.length() - 1) : line;
        String trimmed = content.trim();
        String result;
        if (trimmed.isEmpty()) {
            result = content;
        } else if (trimmed.startsWith("#")) {
            Matcher m = URI_ATTRIBUTE.matcher(content);
            StringBuffer sb = new StringBuffer();
            while (m.find()) {
                m.appendReplacement(sb, Matcher.quoteReplacement("URI=\"" + proxied(m.group(1), base, proxyOrigin) + "\""));
            }
            m.appendTail(sb);
            result = sb.toString();
        } else {
            result = proxied(trimmed, base, proxyOrigin);
        }
        return carriageReturn ? result + "\r" : result;
    }

    private static String proxied(String reference, URI base, String proxyOrigin) {
        try {
            URI absolute = base.resolve(reference.trim());
            String proxy = proxyUrl(absolute, proxyOrigin);
            return proxy != null ? proxy : reference;
        } catch (IllegalArgumentException e) {
            return reference; // нестандартная ссылка — оставляем как есть
        }
    }
}
