package com.izzy.twa;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Клиентский автообновление (TWA + PWA).
 *
 * При запуске TWA (MainActivity) создаёт UpdateCheck, который асинхронно
 * читает version.json на GitHub Pages:
 *   https://ozyab09.github.io/iptv-hub/version.json
 *
 * Сравнение: versionCode (строка) > BuildConfig.VERSION_CODE.
 * Результат сообщается MainActivity.onUpdateResult(boolean fresh).
 *
 * Если версия не свежая (APK старше текущего), выдаётся сублимитерное
 * меню: показать APK через ACTION_VIEW (Android >= 8), либо перейти в
 * настройки приложения (в web-интерфейсе).
 *
 * Конфигурация версий:
 *   - package.json "version" (0.2.5) → public/version.json и android versionName
 *   - CI (gitlab-ci.yml) → VERSION_CODE (= первый билд после релиза)
 *   - versionCode в AndroidManifest.xml — точка, куда CI не прерывается.
 *
 * Требования к версиям (SOFT):
 *   package.json  0.2.5  → manifest web  → public/version.json {0.2.5}
 *   android versionName 0.2.5  → BuildConfig.VERSION_NAME
 *   CI            0.2.6  → versionCode = 1000 (первый билд после релиза)
 *
 * Политика:
 *   - Никакой сервер, никаких сторонних библиотек. Только стандартная Java
 *     обработка URL/JSON и Dispatchers для сетевого IO.
 *   - Обновление на Android 10+ без Play Store (в режиме TWA).
 */
public class UpdateCheck {

    // URL с версией PWA (GitHub Pages). Можно переопределить через ENGINES.
    private static final String VERSION_URL = "https://ozyab09.github.io/iptv-hub/version.json";

    private final UpdateCallback mCallback;
    private final ExecutorService mExecutor = Executors.newSingleThreadExecutor();
    private final Handler mMainThread = new Handler(Looper.getMainLooper());

    public UpdateCheck(UpdateCallback callback) {
        mCallback = callback;
        check();
    }

    /** Простая версия: строка → int. 0.2.5 → 25 (используем только последние два поля). */
    static int versionCodeFromName(String versionName) {
        if (versionName == null) return 0;
        String[] parts = versionName.trim().split("\\.");
        int code = 0;
        for (String p : parts) {
            try {
                code = code * 10 + (p.isEmpty() ? 0 : Integer.parseInt(p));
            } catch (NumberFormatException ignored) {
                /* нечисловые суффиксы игнорируем */
            }
        }
        return code;
    }

    /**
     * Загружает remote version.json, сравнивает и сообщает результат через
     * колбэк на главном потоке.
     */
    void check() {
        mExecutor.execute(() -> {
            try {
                String remote = loadVersionJson(VERSION_URL);
                if (remote == null) {
                    // Сервис не доступен (не в сети, время жизни истекло) — не блокируем.
                    postResult(true, "offline");
                    return;
                }
                String[] parts = remote.split("\\.");
                if (parts.length < 2) {
                    postResult(true, "invalid");
                    return;
                }
                int remoteCode = versionCodeFromName(remote);
                int localCode = BuildConfig.VERSION_CODE;
                boolean fresh = remoteCode <= localCode;
                postResult(fresh, remoteCode > localCode ? remote : "same");
            } catch (Exception e) {
                // Сетевая ошибка — ведро не показываем.
                postResult(true, "error:" + e.getClass().getSimpleName());
            }
        });
    }

    private String loadVersionJson(String urlString) throws IOException {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        try (InputStream in = conn.getInputStream()) {
            byte[] buf = new byte[4096];
            StringBuilder sb = new StringBuilder();
            int n;
            while ((n = in.read(buf)) != -1) {
                sb.append(new String(buf, 0, n, java.nio.charset.StandardCharsets.UTF_8));
            }
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            // Преобразуем в JSON (если сначала парсим строку, затем читаем code).
            String text = sb.toString().trim();
            try {
                JSONObject json = new JSONObject(text);
                String code = json.optString("versionCode", null);
                String name = json.optString("versionName", null);
                return (code != null ? code : "") + "." + (name != null ? name : "");
            } catch (JSONException e) {
                // На всякий случай вернём сырой текст.
                return text;
            }
        } finally {
            conn.disconnect();
        }
    }

    private void postResult(boolean fresh, Object payload) {
        mMainThread.post(() -> {
            if (mCallback != null) {
                mCallback.onUpdateResult(fresh, payload);
            }
        });
    }

    /** Интерфейс для сообщений MainActivity, когда версия проверена. */
    public interface UpdateCallback {
        void onUpdateResult(boolean fresh, Object payload);
    }

    /** Запустить установку APK (ACTION_VIEW). */
    static void installApk(AppCompatActivity activity, String apkPath) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(Uri.fromFile(new java.io.File(apkPath)),
                "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // Android < 8 без способа установки — показываем уведомление.
            android.widget.Toast.makeText(
                    activity, "Установщик не найден", android.widget.Toast.LENGTH_SHORT).show();
        }
    }
}
