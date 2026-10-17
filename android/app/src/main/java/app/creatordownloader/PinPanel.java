package app.creatordownloader;

import android.net.Uri;
import android.os.Vibrator;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pinterest shown inside the app's own screens: a WebView laid over the rectangle the interface
 * reserves for it (below the app header and bar, above the tab bar). You sign in on Pinterest's own
 * page and long-press the pictures you want; each pick is saved into the current folder.
 * Nothing is saved unless you pick it.
 */
final class PinPanel {
    private static final Pattern PIN_HOSTS = Pattern.compile("(^|\\.)(pinterest\\.[a-z.]+|pinimg\\.com)$", Pattern.CASE_INSENSITIVE);
    private final MainActivity act;
    private final FrameLayout root;
    private WebView web;
    private String query = null, subdirKey = "", label = "";
    private JSONArray subdir = null;
    private int need = 0, count = 0;

    PinPanel(MainActivity act, FrameLayout root) {
        this.act = act;
        this.root = root;
    }

    private void ensureWeb() {
        if (web != null) return;
        web = new WebView(act);
        web.setBackgroundColor(0xFFFFFFFF);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // Look like regular Chrome so Pinterest serves its normal mobile site.
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+\\.\\d+ ", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        s.setSupportMultipleWindows(true);            // sign-in pop-ups open inside the panel too
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        web.setWebViewClient(client());
        web.setWebChromeClient(chrome());
        web.setOnLongClickListener(v -> {
            WebView.HitTestResult r = web.getHitTestResult();
            int t = r.getType();
            if ((t == WebView.HitTestResult.IMAGE_TYPE || t == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) && r.getExtra() != null) {
                String src = r.getExtra();
                if (src.startsWith("https://")) save(src, web.getUrl(), web.getTitle());
                return true;
            }
            return false;
        });
        web.setDownloadListener((url, ua, disposition, mime, length) -> {
            if (url.startsWith("https://")) save(url, web.getUrl(), null);
            else toast("Long-press the picture to save it.");
        });
        web.setVisibility(View.GONE);
        root.addView(web, new FrameLayout.LayoutParams(1, 1));
    }

    private WebView popup;

    /** Everything stays inside the panel: Pinterest, its sign-in pages and any site a pin links to.
     *  Nothing is handed to Chrome or to other apps. */
    private WebViewClient client() {
        return new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                if (scheme.equals("http") || scheme.equals("https")) return false;
                if (scheme.equals("intent")) {  // "open in app" links: use their web address instead
                    try {
                        String fb = android.content.Intent.parseUri(u.toString(), android.content.Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url");
                        if (fb != null && fb.startsWith("https://")) view.loadUrl(fb);
                    } catch (Exception ignored) { }
                }
                return true; // never leave the app
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
            }
        };
    }

    private android.webkit.WebChromeClient chrome() {
        return new android.webkit.WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                closePopup();
                popup = new WebView(act);
                popup.setBackgroundColor(0xFFFFFFFF);
                WebSettings ps = popup.getSettings();
                ps.setJavaScriptEnabled(true);
                ps.setDomStorageEnabled(true);
                ps.setSupportMultipleWindows(true);
                ps.setJavaScriptCanOpenWindowsAutomatically(true);
                ps.setUserAgentString(web.getSettings().getUserAgentString());
                CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);
                popup.setWebViewClient(client());
                popup.setWebChromeClient(this);
                root.addView(popup, web.getLayoutParams());
                popup.bringToFront();
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView w) {
                closePopup();
            }
        };
    }

    private void closePopup() {
        if (popup == null) return;
        root.removeView(popup);
        popup.destroy();
        popup = null;
    }

    /** o = { query, rect:{x,y,w,h} (CSS px), subdir:[..]|null, need, label } */
    void show(JSONObject o) {
        ensureWeb();
        layout(o.optJSONObject("rect"));
        JSONArray sd = o.optJSONArray("subdir");
        String key = sd == null ? "" : sd.toString();
        if (!key.equals(subdirKey)) { subdirKey = key; count = 0; }
        subdir = sd;
        need = o.optInt("need", 0);
        label = o.optString("label", "");
        String q = o.optString("query", "");
        if (query == null || !q.equals(query) || o.optBoolean("reload", false)) {
            query = q;
            web.loadUrl(q.isEmpty() ? "https://www.pinterest.com/" : "https://www.pinterest.com/search/pins/?q=" + Uri.encode(q));
        }
        web.setVisibility(View.VISIBLE);
        web.bringToFront();
        web.requestFocus();
    }


    private static final String COLLECT_JS = "(function(){var o=[],s={};document.querySelectorAll('img').forEach(function(i){"
            + "var u=i.currentSrc||i.src||'';if(u.indexOf('pinimg.com')<0)return;if(/\\/(30x30|60x60|75x75|140x140|150x150)/.test(u))return;"
            + "var r=i.getBoundingClientRect();if(r.width<80||r.height<60)return;var k=u.replace(/^https:\\/\\/[^\\/]+\\/[^\\/]+\\//,'');if(s[k])return;s[k]=1;"
            + "var a=i.closest('a');o.push({u:u,t:(i.alt||'').slice(0,200),p:a?a.href:''});});"
            + "var login=!!document.querySelector('[data-test-id=\"login-button\"],[data-test-id=\"simple-login-button\"],input[type=\"password\"]');"
            + "return JSON.stringify({n:o.length,login:login,url:location.href,items:o.slice(0,80)});})()";

    private String evalSync(String js, long timeoutMs) throws InterruptedException {
        final String[] out = {null};
        final java.util.concurrent.CountDownLatch l = new java.util.concurrent.CountDownLatch(1);
        act.runOnUiThread(() -> {
            if (web == null) { l.countDown(); return; }
            web.evaluateJavascript(js, v -> { out[0] = v; l.countDown(); });
        });
        l.await(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS);
        return out[0];
    }

    /** Automatic Pinterest step: open the search for o.query in the panel (visible, your own
     *  signed-in Pinterest), scroll a little and list the pictures shown. Runs on a worker thread.
     *  Returns { items:[{u,t,p}], login, url }. The app then checks them and saves the best. */
    JSONObject scan(JSONObject o) throws Exception {
        final JSONObject show = new JSONObject(o.toString()).put("reload", true);
        act.runOnUiThread(() -> show(show));
        int want = o.optInt("want", 24);
        JSONObject best = new JSONObject().put("items", new JSONArray()).put("login", false);
        Thread.sleep(3500);
        for (int round = 0; round < 6; round++) {
            String raw = evalSync(COLLECT_JS, 5000);
            try {
                Object v = raw == null ? null : new org.json.JSONTokener(raw).nextValue();
                if (v instanceof String) {
                    JSONObject r = new JSONObject((String) v);
                    if (r.optJSONArray("items") != null && r.getJSONArray("items").length() >= best.getJSONArray("items").length()) best = r;
                    if (r.optInt("n") >= want) break;
                    if (r.optBoolean("login") && r.optInt("n") == 0 && round >= 3) break;
                }
            } catch (Exception ignored) { }
            evalSync("window.scrollBy(0, Math.round(window.innerHeight*1.2)); 1", 3000);
            Thread.sleep(2200);
        }
        evalSync("window.scrollTo(0,0); 1", 3000);
        return best;
    }

    void layout(JSONObject r) {
        if (web == null || r == null) return;
        float d = act.getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                Math.max(1, Math.round((float) r.optDouble("w", 1) * d)), Math.max(1, Math.round((float) r.optDouble("h", 1) * d)));
        lp.leftMargin = Math.round((float) r.optDouble("x", 0) * d);
        lp.topMargin = Math.round((float) r.optDouble("y", 0) * d);
        web.setLayoutParams(lp);
        if (popup != null) popup.setLayoutParams(new FrameLayout.LayoutParams(lp));
    }

    void hide() {
        closePopup();
        if (web != null) web.setVisibility(View.GONE);
    }

    boolean shown() {
        return web != null && web.getVisibility() == View.VISIBLE;
    }

    void nav(String a) {
        if (web == null) return;
        if ("back".equals(a) && popup != null) { if (popup.canGoBack()) popup.goBack(); else closePopup(); }
        else if ("back".equals(a) && web.canGoBack()) web.goBack();
        else if ("forward".equals(a) && web.canGoForward()) web.goForward();
        else if ("reload".equals(a)) web.reload();
        else if ("home".equals(a)) { query = null; web.loadUrl("https://www.pinterest.com/"); }
    }

    /** Android back button: go back inside Pinterest, else close the panel. */
    boolean back() {
        if (!shown()) return false;
        if (popup != null) { if (popup.canGoBack()) popup.goBack(); else closePopup(); return true; }
        if (web.canGoBack()) { web.goBack(); return true; }
        hide();
        event(new JSONObject(), "closed");
        return true;
    }

    private void save(String imgUrl, String pageUrl, String title) {
        try {
            String[] urls = original(imgUrl);
            String base = (title != null && !title.trim().isEmpty() && !title.toLowerCase().contains("pinterest")) ? title.trim() : "Pinterest " + lastSegment(urls[0]);
            JSONObject job = new JSONObject()
                    .put("url", urls[0]).put("baseName", "Pinterest - " + base).put("title", base)
                    .put("type", "image").put("thumb", imgUrl).put("page", pageUrl == null ? "" : pageUrl)
                    .put("source", "pinterest").put("sourceName", "Pinterest").put("quality", "Original")
                    .put("license", "Pinterest: check the original creator's rights");
            if (urls[1] != null) job.put("fallbackUrl", urls[1]);
            if (subdir != null) job.put("subdir", subdir);
            act.bridge.downloader.add(new JSONArray().put(job));
            count++;
            try { ((Vibrator) act.getSystemService(android.content.Context.VIBRATOR_SERVICE)).vibrate(30); } catch (Exception ignored) { }
            toast(need > 0 ? "Saved ✓  " + count + " of " + need : "Saved ✓");
            event(new JSONObject().put("count", count).put("need", need), "saved");
        } catch (Exception e) {
            toast("Couldn't save that picture.");
        }
    }

    private void event(JSONObject o, String kind) {
        try { act.bridge.event("pin", o.put(kind, true)); } catch (Exception ignored) { }
    }

    private void toast(String m) {
        act.runOnUiThread(() -> Toast.makeText(act, m, Toast.LENGTH_SHORT).show());
    }

    /** Pinterest serves sized copies (236x, 474x, 736x): try the original first, fall back to 736x. */
    static String[] original(String u) {
        try {
            Uri x = Uri.parse(u);
            String host = x.getHost(), path = x.getPath();
            if (host == null || path == null || !host.endsWith("pinimg.com")) return new String[]{u, null};
            Matcher m = Pattern.compile("^/(\\d+x|\\d+x\\d+_[A-Z]+)/").matcher(path);
            if (!m.find()) return new String[]{u, null};
            String rest = path.substring(m.end());
            return new String[]{"https://" + host + "/originals/" + rest, "https://" + host + "/736x/" + rest};
        } catch (Exception e) {
            return new String[]{u, null};
        }
    }

    private static String lastSegment(String u) {
        String s = Uri.parse(u).getLastPathSegment();
        return s == null ? "image" : s.replaceAll("\\.[a-zA-Z0-9]+$", "");
    }
}
