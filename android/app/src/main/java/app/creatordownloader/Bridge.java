package app.creatordownloader;

import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebStorage;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * window.AndroidCD: the interface calls call(id, method, argsJson); results come back through
 * window.__cd.resolve(id, json), and progress events through window.__cd.event(name, json).
 */
public class Bridge {
    final MainActivity act;
    final WebView web;
    final Store store;
    final Downloader downloader;
    private final ExecutorService pool = Executors.newFixedThreadPool(6);

    Bridge(MainActivity act, WebView web) {
        this.act = act;
        this.web = web;
        this.store = new Store(act);
        this.downloader = new Downloader(act, this);
    }

    @JavascriptInterface
    public void call(final int id, final String method, final String argsJson) {
        pool.execute(() -> {
            Object result;
            try {
                result = dispatch(method, new JSONArray(argsJson == null ? "[]" : argsJson));
            } catch (Throwable e) {
                result = null;
            }
            resolve(id, result);
        });
    }

    private Object dispatch(String m, JSONArray a) throws Exception {
        switch (m) {
            case "json":
                return Net.json(a.getString(0), a.optJSONObject(1));
            case "ping":
                Net.ping(a.getString(0));
                return Boolean.TRUE;
            case "thumb":
                return Net.thumb(a.getString(0));
            case "download":
                return downloader.add(a.getJSONArray(0));
            case "downloads":
                return downloader.list();
            case "cancel":
                downloader.cancel(a.getString(0));
                return Boolean.TRUE;
            case "retry":
                downloader.retry(a.getString(0));
                return Boolean.TRUE;
            case "remove":
                return downloader.remove(a.getString(0));
            case "clearDone":
                return downloader.clearDone();
            case "open":
                downloader.open(a.getString(0));
                return Boolean.TRUE;
            case "openFolder":
                downloader.openFolder();
                return Boolean.TRUE;
            case "getSettings":
                return store.getAll(act);
            case "setSettings":
                store.set(a.optJSONObject(0), a.optJSONObject(1));
                return store.getAll(act);
            case "external":
                final String url = a.getString(0);
                act.runOnUiThread(() -> act.openExternal(url));
                return Boolean.TRUE;
            case "pinShow": {
                final JSONObject o = a.getJSONObject(0);
                act.runOnUiThread(() -> act.pin.show(o));
                return Boolean.TRUE;
            }
            case "pinLayout": {
                final JSONObject r = a.optJSONObject(0);
                act.runOnUiThread(() -> act.pin.layout(r));
                return Boolean.TRUE;
            }
            case "pinHide":
                act.runOnUiThread(() -> act.pin.hide());
                return Boolean.TRUE;
            case "pinNav": {
                final String what = a.optString(0, "");
                act.runOnUiThread(() -> act.pin.nav(what));
                return Boolean.TRUE;
            }
            case "pinSignOut":
                act.runOnUiThread(() -> {
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();
                });
                return Boolean.TRUE;
            case "bulkCredits":
                downloader.writeText(a.getJSONArray(0), "_credits.txt", a.getString(1));
                return Boolean.TRUE;
            default:
                return null;
        }
    }

    void resolve(int id, Object result) {
        final String js = "window.__cd&&window.__cd.resolve(" + id + "," + JSONObject.quote(toJson(result)) + ")";
        act.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    void event(String name, Object data) {
        final String js = "window.__cd&&window.__cd.event(" + JSONObject.quote(name) + "," + JSONObject.quote(toJson(data)) + ")";
        act.runOnUiThread(() -> {
            try {
                web.evaluateJavascript(js, null);
            } catch (Exception ignored) {
            }
        });
    }

    static String toJson(Object o) {
        if (o == null || o == JSONObject.NULL) return "null";
        if (o instanceof String) return JSONObject.quote((String) o);
        return o.toString();
    }
}
