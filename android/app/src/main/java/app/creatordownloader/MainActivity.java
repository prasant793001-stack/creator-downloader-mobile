package app.creatordownloader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;

/**
 * Hosts the app interface (assets/www) in a WebView served from https://app.local/,
 * and exposes the native bridge as window.AndroidCD.
 */
public class MainActivity extends Activity {
    static final String HOST = "app.local";
    static final int PICK_FILE = 41;

    static MainActivity instance;
    WebView web;
    Bridge bridge;
    PinPanel pin;
    android.widget.FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0E0A1F);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                if (path.contains("..")) return notFound();
                try {
                    InputStream in = getAssets().open("www" + path);
                    WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", in);
                    java.util.Map<String, String> h = new java.util.HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (IOException e) {
                    return notFound();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                android.util.Log.i("CDApp", m.messageLevel() + " " + m.message() + (m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR ? " @" + m.sourceId() + ":" + m.lineNumber() : ""));
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/plain", "text/markdown", "text/x-markdown", "application/octet-stream"});
                try {
                    startActivityForResult(Intent.createChooser(i, "Choose a text file"), PICK_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        bridge = new Bridge(this, web);
        web.addJavascriptInterface(bridge, "AndroidCD");
        root = new android.widget.FrameLayout(this);
        root.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        pin = new PinPanel(this, root);
        String test = getIntent() != null ? getIntent().getStringExtra("selftest") : null;
        web.loadUrl("https://" + HOST + "/index.html" + (test != null ? "?selftest=" + Uri.encode(test) : ""));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = (resultCode == RESULT_OK && data != null && data.getData() != null) ? new Uri[]{data.getData()} : null;
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (pin != null && pin.back()) return;
        // Let the interface close an open sheet first; otherwise leave the app.
        web.evaluateJavascript("(function(){var s=document.getElementById('sheet');if(s&&!s.hidden){s.hidden=true;return 'closed';}return 'none';})()", value -> {
            if (value == null || !value.contains("closed")) superBack();
        });
    }

    private void superBack() {
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        android.webkit.CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    void openExternal(String url) {
        if (url == null || !url.startsWith("https://")) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
        }
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }
}
