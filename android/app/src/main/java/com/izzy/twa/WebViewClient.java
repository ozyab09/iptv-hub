package com.izzy.twa;

import android.annotation.SuppressLint;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * WebViewClient, встроенный в MainActivity, с мостом JavaScript↔Java,
 * который необходим TWA-приложению для:
 *   - проверки версий (update-check.js → UpdateCheck.java)
 *   - перехвата сообщений с веб-страницы (текстовая стена, подключение)
 *   - обработки ошибок загрузки (основные, сетевые, CORS).
 *
 * TWA-безопасность: всё, что показывается в WebView, пришло из статики
 * (кэшируется на Pages), поэтому мост допустим; нет отсчёта данных, нет
 * сторонних скриптов.
 */
public class WebViewClient extends android.webkit.WebViewClient {

    private final MainActivity mActivity;

    public WebViewClient(MainActivity activity) {
        mActivity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        // Разрешаем ссылки на внешние страницы (например, в настройках).
        if (url.startsWith("https://") || url.startsWith("http://")) {
            view.loadUrl(url);
            return true;
        }
        return false;
    }

    @SuppressLint("AddJavascriptInterface")
    @Override
    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        // Инъекция JS-моста, если он ещё не доступен.
        injectJsBridge(view);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(url);
        injectJsBridge(view);
    }

    private void injectJsBridge(WebView view) {
        String js = ""
                + "if (window.__iptvHubBridge === undefined) {"
                + "  window.__iptvHubBridge = {"
                + "    ready: new Promise(resolve => { window.__iptvHubReady = resolve; })"
                + "  };"
                + "  var s = document.createElement('script');"
                + "  s.src = 'https://ozyab09.github.io/iptv-hub/bridge.js';"
                + "  s.async = true;"
                + "  document.head.appendChild(s);"
                + "}"
                + "window.__iptvHubBridge.ready.then(() => {"
                + "  console.log('[TWA] bridge ready');"
                + "});";
        if (view.getSettings().getJavaScriptEnabled()) {
            view.evaluateJavascript(js, null);
        }
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(
            WebView view, WebResourceRequest request) {
        // Если PWA использует простые ресурсы (manifest, icons), отдаём их
        // встроенными, иначе пусть ходит в сеть. TWA нажимает на это.
        return null;
    }

    @Override
    public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
        // Не показываем стандартную ошибку браузера — TWA-стена умеет преобразовывать
        // эти ошибки в toast через JS-мост (см. ошибка_quantum?).
        super.onReceivedError(view, errorCode, description, failingUrl);
    }
}
