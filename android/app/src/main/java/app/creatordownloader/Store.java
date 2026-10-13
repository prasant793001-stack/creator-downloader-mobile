package app.creatordownloader;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;

import org.json.JSONObject;

import java.util.Iterator;

/** Settings and API keys, kept in the app's private storage on this phone. */
final class Store {
    private final SharedPreferences prefs;

    Store(Context ctx) {
        prefs = ctx.getSharedPreferences("creator_downloader", Context.MODE_PRIVATE);
    }

    synchronized JSONObject getAll(Context ctx) throws Exception {
        String version = "";
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            version = pi.versionName;
        } catch (Exception ignored) {
        }
        return new JSONObject()
                .put("settings", read("settings"))
                .put("keys", read("keys"))
                .put("version", version);
    }

    synchronized void set(JSONObject patch, JSONObject keys) throws Exception {
        if (patch != null) {
            JSONObject s = read("settings");
            merge(s, patch);
            prefs.edit().putString("settings", s.toString()).apply();
        }
        if (keys != null) {
            JSONObject k = read("keys");
            Iterator<String> it = keys.keys();
            while (it.hasNext()) {
                String name = it.next();
                String v = keys.optString(name, "").trim();
                if (v.isEmpty()) k.remove(name);
                else k.put(name, v);
            }
            prefs.edit().putString("keys", k.toString()).apply();
        }
    }

    private JSONObject read(String key) {
        try {
            return new JSONObject(prefs.getString(key, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void merge(JSONObject base, JSONObject add) throws Exception {
        Iterator<String> it = add.keys();
        while (it.hasNext()) {
            String k = it.next();
            Object v = add.get(k);
            Object cur = base.opt(k);
            if (v instanceof JSONObject && cur instanceof JSONObject) merge((JSONObject) cur, (JSONObject) v);
            else base.put(k, v);
        }
    }
}
