package io.github.ozyab09.iptvhub;

import android.view.ViewGroup;
import android.webkit.WebView;
import android.content.Intent;
import android.content.res.Configuration;
import android.view.KeyEvent;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.core.view.WindowCompat;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

/** Real WebView: bundled HTML, JS and CSS must resolve without network loads. */
@RunWith(AndroidJUnit4.class)
public class LocalLaunchTest {
    @Rule public ActivityScenarioRule<MainActivity> activity =
            new ActivityScenarioRule<>(MainActivity.class);

    private WebView webView(MainActivity main) {
        ViewGroup content = main.findViewById(android.R.id.content);
        return (WebView) ((ViewGroup) content.getChildAt(0)).getChildAt(0);
    }

    private String evaluate(String script) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.getScenario().onActivity(main -> webView(main).evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        // Navigation may discard a callback from the previous document; poll again.
        done.await(2, TimeUnit.SECONDS);
        return result.get();
    }

    private void expectInterface(String path) throws InterruptedException {
        String script = "location.pathname + location.search === '" + path + "' && " +
                "!!document.querySelector('#side-nav button') && document.styleSheets.length > 0";
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        do {
            if ("true".equals(evaluate(script))) return;
            Thread.sleep(100);
        } while (System.nanoTime() < deadline);
        assertEquals("App shell failed: " + evaluate("document.body.innerText"), "true", evaluate(script));
    }

    @Test public void indexLoadsWithNetworkBlocked() throws InterruptedException {
        activity.getScenario().onActivity(main -> {
            WebView view = webView(main);
            view.getSettings().setBlockNetworkLoads(true);
            view.loadUrl("https://appassets.androidplatform.net/www/index.html?offline-test=1");
        });
        expectInterface("/www/index.html?offline-test=1");
        assertEquals("\"?offline-test=1\"", evaluate("location.search"));
    }

    @Test public void homeLinkLoadsDirectoryIndex() throws InterruptedException {
        expectInterface("/www/index.html");
        activity.getScenario().onActivity(main -> webView(main).evaluateJavascript(
                "document.querySelector('.brand').click()", null));
        expectInterface("/www/");
    }

    private void expectStatusBar(boolean lightBackground) throws InterruptedException {
        AtomicReference<Boolean> actual = new AtomicReference<>();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        do {
            activity.getScenario().onActivity(main -> actual.set(WindowCompat.getInsetsController(
                    main.getWindow(), main.getWindow().getDecorView()).isAppearanceLightStatusBars()));
            if (Boolean.valueOf(lightBackground).equals(actual.get())) return;
            Thread.sleep(100);
        } while (System.nanoTime() < deadline);
        assertEquals("Status-bar appearance", Boolean.valueOf(lightBackground), actual.get());
    }

    @Test public void statusBarFollowsThemeOffline() throws InterruptedException {
        expectInterface("/www/index.html");
        activity.getScenario().onActivity(main -> webView(main).getSettings().setBlockNetworkLoads(true));
        evaluate("document.querySelector('[data-theme-choice=light]').click()");
        expectStatusBar(true);
        evaluate("document.querySelector('[data-theme-choice=dark]').click()");
        expectStatusBar(false);
        evaluate("document.querySelector('[data-theme-choice=light]').click()");
        expectStatusBar(true);
        evaluate("location.reload()");
        expectInterface("/www/index.html");
        expectStatusBar(true);
    }

    @Test public void televisionLauncherAndDpad() throws InterruptedException {
        AtomicReference<Boolean> television = new AtomicReference<>();
        activity.getScenario().onActivity(main -> television.set(
                (main.getResources().getConfiguration().uiMode & Configuration.UI_MODE_TYPE_MASK)
                        == Configuration.UI_MODE_TYPE_TELEVISION));
        assumeTrue(television.get());
        activity.getScenario().onActivity(main -> {
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
                    .setPackage(main.getPackageName());
            assertTrue(!main.getPackageManager().queryIntentActivities(launcher, 0).isEmpty());
            assertTrue(main.getApplicationInfo().banner != 0);
        });
        expectInterface("/www/index.html");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (!"true".equals(evaluate("document.documentElement.dataset.tv === 'true'")) && System.nanoTime() < deadline) Thread.sleep(100);
        assertEquals("true", evaluate("document.documentElement.dataset.tv === 'true'"));
        evaluate("document.querySelector('#btn-theme').focus()");
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_LEFT);
        assertEquals("\"notif-bell\"", evaluate("document.activeElement.id"));
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_CENTER);
        deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!"true".equals(evaluate("!document.querySelector('#notif-panel').hidden")) && System.nanoTime() < deadline) Thread.sleep(100);
        assertEquals("true", evaluate("!document.querySelector('#notif-panel').hidden"));
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!"true".equals(evaluate("document.querySelector('#notif-panel').hidden")) && System.nanoTime() < deadline) Thread.sleep(100);
        assertEquals("true", evaluate("document.querySelector('#notif-panel').hidden"));
        assertEquals("\"notif-bell\"", evaluate("document.activeElement.id"));
    }
}
