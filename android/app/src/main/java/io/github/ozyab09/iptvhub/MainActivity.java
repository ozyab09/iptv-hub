package io.github.ozyab09.iptvhub;

import android.os.Bundle;
import android.util.Log;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * TWA-активити IPTV Hub.
 *
 * <p>Библиотека androidbrowserhelper сама проверяет Digital Asset Links и
 * открывает сайт без панели Chrome. Здесь добавлено то, из-за чего окно
 * выглядело веб-страницей: системные бары и защита от падения на quality
 * enforcement.
 *
 * <ul>
 *   <li>edge-to-edge: контент уходит под системные бары, как в нативных
 *       плеерах (сайт учитывает вырезы через viewport-fit=cover и
 *       env(safe-area-inset-*));</li>
 *   <li>иконки баров всегда светлые: кадр видео чёрный в любой теме;</li>
 *   <li>нижний отступ навигации добавляется как padding контейнера — иначе
 *       панель вкладок сайта оказалась бы под кнопками системы;</li>
 *   <li>оформление переприменяется в onResume: система сбрасывает его после
 *       возврата из фона;</li>
 *   <li>quality enforcement логируется, а не роняет приложение: сообщение
 *       quality_enforcement.crash приходит, если Digital Asset Links не
 *       подтвердились или главный документ отдал 404/5xx. Штатный
 *       QualityEnforcer бросает RuntimeException, и приложение падало бы на
 *       запуске; полный экран всё равно зависит от публикации
 *       assetlinks.json в корне origin.</li>
 * </ul>
 */
public class MainActivity extends LauncherActivity {

    private static final String TAG = "IptvHubTwa";

    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        return new CustomTabsCallback() {
            @Override
            public void extraCallback(@NonNull String callbackName, @Nullable Bundle args) {
                if (callbackName.startsWith("quality_enforcement")) {
                    String reason = args == null ? "" : String.valueOf(args.get("crash_reason"));
                    Log.w(TAG, "quality enforcement: " + callbackName + " " + reason);
                    return;
                }
                Log.d(TAG, "extraCallback: " + callbackName);
            }
        };
    }

    private void applyEdgeToEdge() {
        View decor = getWindow().getDecorView();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Иконки баров всегда светлые: кадр плеера чёрный в любой теме
        // приложения. Сеттеры помечены deprecated в новых core, но в 1.13.1
        // это единственный переносимый способ и он полностью поддерживается.
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), decor);
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        controller.show(WindowInsetsCompat.Type.systemBars());
    }

    /**
     * Контент TWA живёт внутри {@code android.R.id.content}. Паддим его
     * снизу на высоту навигации: сайт уже резервирует место под статус-бар
     * своей вёрсткой, но у навигационной панели нет соответствующего
     * CSS-отступа в ландшафте.
     */
    private void reserveNavigationInset() {
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(0, 0, 0, bars.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyEdgeToEdge();
        reserveNavigationInset();
    }
}
