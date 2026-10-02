package io.github.ozyab09.iptvhub;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

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

    private WebView webView;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
        webView.loadUrl(START_URL);
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
        // Иконки баров всегда светлые: кадр плеера тёмный в любой теме.
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        controller.show(WindowInsetsCompat.Type.systemBars());
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
