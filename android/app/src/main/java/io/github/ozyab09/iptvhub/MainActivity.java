package io.github.ozyab09.iptvhub;

import android.view.View;

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
 * выглядело веб-страницей: системные бары.
 *
 * <ul>
 *   <li>edge-to-edge: контент уходит под системные бары, как в нативных
 *       плеерах (сайт учитывает вырезы через viewport-fit=cover и
 *       env(safe-area-inset-*));</li>
 *   <li>иконки баров всегда светлые: кадр видео чёрный в любой теме;</li>
 *   <li>нижний отступ навигации добавляется как padding контейнера — иначе
 *       панель вкладок сайта оказалась бы под кнопками системы;</li>
 *   <li>оформление переприменяется в onResume: система сбрасывает его после
 *       возврата из фона.</li>
 * </ul>
 */
public class MainActivity extends LauncherActivity {

    private void applyEdgeToEdge() {
        View decor = getWindow().getDecorView();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), decor);
        controller.setSystemBarsAppearance(
                0,
                WindowInsetsControllerCompat.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsControllerCompat.APPEARANCE_LIGHT_NAVIGATION_BARS);
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
