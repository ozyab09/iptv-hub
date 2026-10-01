# TWA/Bubblewrap ProGuard rules for IPTV Hub Android wrapper.
# TWA (androidbrowserhelper) не требует особых правил; сохраняем
# дефолтные настройки и отключаем лишние предупреждения.

-keep class com.google.androidbrowserhelper.** { *; }
-keep class android.webkit.WebChromeClient { *; }
-keep class android.webkit.WebViewClient { *; }

# Защита от удаления JSON-ключей во время minifyEnabled true.
-keepattributes *Annotation*

# Защита классов TWA-обёртки.
-keep class com.izzy.twa.** { *; }

# Защита BuildConfig.
-keep class com.izzy.twa.BuildConfig { *; }

# Разрешить доступ к Reflection (если потребуется).
-keepclassmembers,allowobfuscation class * {
    @android.webkit.JavascriptInterface <methods>;
}
