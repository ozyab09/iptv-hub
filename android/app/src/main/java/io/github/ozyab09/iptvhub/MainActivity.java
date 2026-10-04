package io.github.ozyab09.iptvhub;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.net.Uri;
import android.os.Bundle;
import android.content.res.Configuration;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * IPTV Hub как самостоятельное приложение: web-сборка зашита в APK
 * (assets/www) и открывается локально, без обращения к GitHub Pages.
 *
 * <p>Раньше это была TWA: она грузила https://ozyab09.github.io/iptv-hub/ и без
 * сети показывала пустой экран. Теперь интерфейс, плейлист и настройки
 * доступны офлайн; сеть нужна только самому видеопотоку провайдера.
 *
 * <p>Origin локальный (appassets.androidplatform.net) и https — значит
 * сохраняются localStorage (плейлисты, избранное, PIN), OPFS (записи),
 * MediaRecorder, Wake Lock и PiP. Digital Asset Links для такого origin не
 * нужны, панели браузера нет по определению.
 */
public class MainActivity extends AppCompatActivity {

    /** Домен локального origin: тот же, что отдаёт WebViewAssetLoader. */
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + LOCAL_HOST + "/www/index.html";
    /** Схемы, которые отдаём внешнему видеоплееру (#372). */
    private static final Set<String> PLAYER_SCHEMES = new HashSet<>(
            Arrays.asList("http", "https", "rtmp", "rtmps", "rtsp", "rtp", "udp", "mms"));

    /** Плейлист из интента больше этого не читаем: это уже не M3U, а ошибка. */
    private static final int MAX_PLAYLIST_BYTES = 20 * 1024 * 1024;
    /** Интент «извне» уже обработан этой активностью. */
    private static final String EXTRA_HANDLED = "io.github.ozyab09.iptvhub.INCOMING_HANDLED";
    private static final Pattern URL_IN_TEXT = Pattern.compile("https?://[^\\s<>\"']+");

    private WebView webView;
    private boolean television;
    /** Файл из интента ждёт загрузки страницы: {имя, содержимое}. */
    @Nullable private String[] pendingImport;
    private boolean pageReady;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        television = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_TYPE_MASK)
                == Configuration.UI_MODE_TYPE_TELEVISION;

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        // Ассеты читаются только через WebViewAssetLoader ниже.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        final WebViewAssetLoader.AssetsPathHandler assets =
                new WebViewAssetLoader.AssetsPathHandler(this);
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                // AssetLoader strips /www/; files are stored under assets/www/.
                .addPathHandler("/www/", path -> assets.handle("www/" +
                        (path.isEmpty() ? "index.html" : path)))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public void onPageFinished(@NonNull WebView view, @NonNull String url) {
                if (television && LOCAL_HOST.equals(Uri.parse(url).getHost())) {
                    view.evaluateJavascript("document.documentElement.dataset.tv='true';" +
                            "document.dispatchEvent(new Event('iptv-tv'))", null);
                }
                pageReady = true;
                deliverPendingImport();
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(
                    @NonNull WebView view, @NonNull WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    @NonNull WebView view, @NonNull WebResourceRequest request) {
                return openExternally(request.getUrl());
            }

        });

        FrameLayout root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        applyEdgeToEdge();
        reserveNavigationInset(root);
        if (television) {
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override public void handleOnBackPressed() {
                    webView.evaluateJavascript(keyScript("Escape"), handled -> {
                        if ("true".equals(handled)) finish();
                    });
                }
            });
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "IPTVHubStatusBar",
                    Collections.singleton("https://" + LOCAL_HOST),
                    (view, message, origin, isMainFrame, reply) -> {
                        if (!isMainFrame) return;
                        String appearance = message.getData();
                        if (!"light".equals(appearance) && !"dark".equals(appearance)) return;
                        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                                .setAppearanceLightStatusBars("light".equals(appearance));
                    });
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // Поток во внешнем плеере (#372): веб-слой присылает URL канала,
            // система предлагает VLC, MX Player, mpv и т.п.
            WebViewCompat.addWebMessageListener(webView, "IPTVHubExternalPlayer",
                    Collections.singleton("https://" + LOCAL_HOST),
                    (view, message, origin, isMainFrame, reply) -> {
                        if (isMainFrame) openInExternalPlayer(message.getData());
                    });
        }
        webView.loadUrl(startUrlFor(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = startUrlFor(intent);
        // Ссылка на плейлист — перезагрузка с ?p=; файл — импорт в открытую страницу.
        if (!START_URL.equals(url)) {
            pageReady = false;
            webView.loadUrl(url);
        } else {
            deliverPendingImport();
        }
    }

    /**
     * Плейлист «извне» (#373): ссылка из «Поделиться» или VIEW становится
     * ?p= (тот же upsert, что и у ссылки-конфига), файл content:// читается
     * и ждёт загрузки страницы в pendingImport.
     */
    @NonNull
    private String startUrlFor(@Nullable Intent intent) {
        // Пересоздание активности не импортирует тот же файл повторно. Интент
        // помечаем extra-флагом, а не подменяем: ActivityScenario и система
        // узнают активность по исходному интенту (#459).
        if (intent == null || intent.getBooleanExtra(EXTRA_HANDLED, false)) return START_URL;
        intent.putExtra(EXTRA_HANDLED, true);
        String link = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            Matcher match = text == null ? null : URL_IN_TEXT.matcher(text);
            if (match != null && match.find()) link = match.group();
        } else if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Uri data = intent.getData();
            String scheme = data.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) link = data.toString();
            else if ("content".equals(scheme)) pendingImport = readPlaylist(data);
        }
        return link == null ? START_URL : START_URL + "?p=" + Uri.encode(link);
    }

    /** {имя, текст} файла из ContentResolver или null (нет доступа, слишком большой). */
    @Nullable
    private String[] readPlaylist(@NonNull Uri uri) {
        String name = uri.getLastPathSegment();
        try (Cursor cursor = getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
        } catch (RuntimeException ignored) {
            // Имя не обязательно: веб-слой подставит своё.
        }
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > MAX_PLAYLIST_BYTES) return null;
            }
            return new String[] {name == null ? "playlist.m3u" : name, out.toString(StandardCharsets.UTF_8.name())};
        } catch (IOException | SecurityException e) {
            return null;
        }
    }

    /** Передать файл веб-слою: window.iptvHubImportPlaylist(имя, текст), один раз. */
    private void deliverPendingImport() {
        if (!pageReady || pendingImport == null || webView == null) return;
        String[] file = pendingImport;
        pendingImport = null;
        webView.evaluateJavascript("window.iptvHubImportPlaylist && window.iptvHubImportPlaylist("
                + JSONObject.quote(file[0]) + "," + JSONObject.quote(file[1]) + ")", null);
    }

    /** Отдать поток видеоплееру: только сетевые медиа-схемы, тип video/*. */
    private void openInExternalPlayer(@Nullable String url) {
        if (url == null) return;
        Uri uri = Uri.parse(url.trim());
        String scheme = uri.getScheme();
        if (scheme == null || !PLAYER_SCHEMES.contains(scheme.toLowerCase(Locale.ROOT))) return;
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "video/*");
        try {
            startActivity(Intent.createChooser(intent, null));
        } catch (ActivityNotFoundException ignored) {
            // Плеера нет — веб-слой уже показал подсказку.
        }
    }

    /**
     * Всё, что не наш локальный origin, открываем в системном браузере: внутри
     * приложения нет ни адресной строки, ни внешних страниц.
     */
    private boolean openExternally(@NonNull Uri uri) {
        if (LOCAL_HOST.equals(uri.getHost())) return false;
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https"))) return true;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // Браузера нет — нажатие просто не имеет последствий.
        }
        return true;
    }

    private void applyEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        // До загрузки темы — светлые иконки; затем статус-бар задаёт web-интерфейс.
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        controller.show(WindowInsetsCompat.Type.systemBars());
    }

    private String keyScript(String key) {
        return "(document.activeElement||document.documentElement).dispatchEvent(" +
                "new KeyboardEvent('keydown',{key:'" + key + "',code:'" + key +
                "',bubbles:true,cancelable:true}))";
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (!television || webView == null) return super.dispatchKeyEvent(event);
        String key;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_LEFT: key = "ArrowLeft"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: key = "ArrowRight"; break;
            case KeyEvent.KEYCODE_DPAD_UP: key = "ArrowUp"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: key = "ArrowDown"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: key = "Enter"; break;
            default: return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            final KeyEvent copy = new KeyEvent(event);
            webView.evaluateJavascript(keyScript(key), handled -> {
                // Необработанные клавиши отдаём WebView: ввод, select и штатная клавиатура.
                if ("true".equals(handled)) {
                    MainActivity.super.dispatchKeyEvent(copy);
                    MainActivity.super.dispatchKeyEvent(KeyEvent.changeAction(copy, KeyEvent.ACTION_UP));
                }
            });
        }
        return true;
    }

    /** Сайт уже резервирует место под статус-бар; снизу паддим под навигацию. */
    private void reserveNavigationInset(@NonNull View root) {
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(0, 0, 0, bars.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
