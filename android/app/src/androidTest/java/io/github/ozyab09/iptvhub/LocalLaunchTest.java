package io.github.ozyab09.iptvhub;

import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;

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
}
