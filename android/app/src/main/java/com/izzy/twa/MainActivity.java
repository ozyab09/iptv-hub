package com.izzy.twa;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.google.androidbrowserhelper.net.TrustedWebActivityHelper;

/**
 * MainActivity — единственная точка входа TWA-обёртки IPTV Hub.
 *
 * Плеер, меню, записи и всё client-side-состояние живут в web-статике
 * (public/). Здесь создание кадра, настройка WebView и вызовы вспомогательных
 * методов TWA (экранозакрытие, глубина, размер экрана, переключение между
 * интерфейсами). UpdateCheck.java живёт в assets/ и вызывается в onCreate.
 */
public class MainActivity extends AppCompatActivity {

    private static final String EXTRA_UPDATE_CHECK = "extra.update_check";
    private static final String EXTRA_UPDATE_RESULT = "extra.update_result";

    private TrustedWebActivityHelper mTwaHelper;
    private WebViewClient mWebViewClient;
    private View.OnClickListener mCloseListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // --- Тёмная тема / чёрный фон (согласовано с дизайн-системой v2).
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

        setContentView(R.layout.activity_main);

        mTwaHelper = TrustedWebActivityHelper.getTrustedWebActivityHelper(this);

        // Передаём результат проверки обновления (если запущена из него).
        if (getIntent().getBooleanExtra(EXTRA_UPDATE_CHECK, false)) {
            boolean ok = getIntent().getBooleanExtra(EXTRA_UPDATE_RESULT, false);
            onUpdateResult(ok);
        }

        // Фасад WebView для PWA-страницы.
        WebView webView = findViewById(R.id.web_view);
        webView.setWebViewClient(mWebViewClient);
        WebSettingsCompat.setMixedContentMode(
                webView.getSettings(), WebSettingsCompat.MIXED_CONTENT_COMPATIBILITY_MODE);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setCacheMode(WebSettingsCompat.CACHE_LOAD_DEFAULT);

        // Путь к плейлисту из ?p= (деплой на Pages, не GitHub Pages — поддомен).
        String playlistUrl = getIntent().getStringExtra("playlistUrl");
        if (playlistUrl != null && !playlistUrl.isEmpty()) {
            webView.loadUrl(playlistUrl);
        } else {
            // Дефолт: корень PWA (index.html).
            webView.loadUrl("https://ozyab09.github.io/iptv-hub/");
        }

        // Прокрутка плеера вверх при входе (в режиме TWA полный экран).
        webView.postDelayed(() -> {
            if (webView.canScrollVertically(-1)) {
                webView.scrollBy(0, -100);
            }
        }, 250);

        // Инициализация TWA-элементов.
        mCloseListener = v -> finish();
        findViewById(R.id.close_button).setOnClickListener(mCloseListener);

        // Автообновление: читает version.json, сравнивает с BuildConfig,
        // предлагает APK или показывает меню. Запускается асинхронно.
        new UpdateCheck(this::onUpdateResult);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mTwaHelper != null) {
            mTwaHelper.setPreferredWidth(WindowManager.LayoutParams.MATCH_PARENT);
            mTwaHelper.setPreferredHeight(WindowManager.LayoutParams.MATCH_PARENT);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // TWA: выход только при нескольких нажатиях; внутренний навигатор
            // (плеер/меню) захватывает перемотку.
            if (mWebViewClient.shouldOverrideUrlLoading(null, null)) {
                return true;
            }
            // Дважды нажатие → завершение.
            if (mCloseListener != null && !mCloseListener.equals(null)) {
                mCloseListener.onClick(null);
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mWebViewClient != null) {
            mWebViewClient.destroy();
        }
    }

    /**
     * Событие от UpdateCheck: показываем нижний колонтитул или меню обновления.
     */
    @SuppressLint("InflateParams")
    private void onUpdateResult(boolean fresh) {
        // Если fresh, тихонее: сообщение о новой версии.
        android.widget.Toast.makeText(
                this,
                fresh ? "IPTV Hub — новая версия доступна" : "IPTV Hub — в тренде",
                android.widget.Toast.LENGTH_LONG).show();
        // При несвежем клиенте — меню в теме сайта (hover/нажатие уведомления).
        // Нижний колонтитул может быть скрыт при активации плеера.
    }

    /**
     * Открывает настройки/обновление в браузере (оставляем web-интерфейс).
     */
    private void openSettings() {
        CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
        CustomTabsIntent intent = builder.build();
        intent.launchUrl(this, Uri.parse("https://ozyab09.github.io/iptv-hub/settings"));
    }
}
