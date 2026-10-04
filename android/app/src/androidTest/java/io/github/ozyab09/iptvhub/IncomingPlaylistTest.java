package io.github.ozyab09.iptvhub;

import android.content.Intent;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;

/** «Поделиться → IPTV Hub» (#373): ссылка из текста становится ?p= локальной страницы. */
@RunWith(AndroidJUnit4.class)
public class IncomingPlaylistTest {
    private static WebView webView(MainActivity main) {
        ViewGroup content = main.findViewById(android.R.id.content);
        return (WebView) ((ViewGroup) content.getChildAt(0)).getChildAt(0);
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(main -> webView(main).evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        done.await(2, TimeUnit.SECONDS);
        return result.get();
    }

    @Test public void sharedLinkBecomesPlaylistParameter() throws InterruptedException {
        Intent intent = new Intent(ApplicationProvider.getApplicationContext(), MainActivity.class)
                .setAction(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, "Плейлист: https://example.com/list.m3u");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
            String expected = "\"https://example.com/list.m3u\"";
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            String actual;
            do {
                actual = evaluate(scenario, "new URLSearchParams(location.search).get('p')");
                if (expected.equals(actual)) return;
                Thread.sleep(100);
            } while (System.nanoTime() < deadline);
            assertEquals(expected, actual);
        }
    }
}
