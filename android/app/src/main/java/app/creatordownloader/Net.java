package app.creatordownloader;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/** Network calls made natively, so library APIs work without browser restrictions. */
final class Net {
    static final String UA = "CreatorDownloader/1.3 (Android personal app)";
    static final String BROWSER_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    private static final Set<String> API_HOSTS = new HashSet<>(Arrays.asList(
            "api.openverse.org", "commons.wikimedia.org", "images-api.nasa.gov", "images-assets.nasa.gov",
            "api.artic.edu", "openaccess-api.clevelandart.org", "api.pexels.com", "pixabay.com",
            "api.unsplash.com", "archive.org", "www.googleapis.com", "collectionapi.metmuseum.org"));

    private Net() {
    }

    static HttpURLConnection open(String url, int timeoutMs) throws Exception {
        URL u = new URL(url);
        if (!"https".equalsIgnoreCase(u.getProtocol())) throw new IllegalArgumentException("https only");
        HttpURLConnection c = (HttpURLConnection) u.openConnection();
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", UA);
        return c;
    }

    static JSONObject json(String url, JSONObject headers) {
        JSONObject out = new JSONObject();
        try {
            URL u = new URL(url);
            if (!"https".equalsIgnoreCase(u.getProtocol()) || !API_HOSTS.contains(u.getHost())) {
                out.put("ok", false).put("status", 0).put("error", "Blocked host " + u.getHost());
                return out;
            }
            HttpURLConnection c = open(url, 20000);
            c.setRequestProperty("Accept", "application/json");
            if (headers != null) {
                Iterator<String> it = headers.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    c.setRequestProperty(k, headers.optString(k));
                }
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            String text = in == null ? "" : new String(readAll(in, 8 * 1024 * 1024), "UTF-8");
            Object data = null;
            try {
                data = new JSONTokener(text).nextValue();
            } catch (Exception ignored) {
            }
            boolean ok = code >= 200 && code < 300;
            out.put("ok", ok).put("status", code).put("data", data == null ? JSONObject.NULL : data);
            if (!ok) {
                String err = "HTTP " + code;
                if (data instanceof JSONObject) {
                    JSONObject d = (JSONObject) data;
                    Object e = d.opt("error");
                    if (e instanceof JSONObject && ((JSONObject) e).has("message")) err = ((JSONObject) e).optString("message");
                    else if (e instanceof String) err = (String) e;
                    else if (d.has("message")) err = d.optString("message");
                }
                out.put("error", err);
            } else out.put("error", JSONObject.NULL);
            c.disconnect();
        } catch (java.net.SocketTimeoutException e) {
            put(out, "Timed out");
        } catch (Exception e) {
            put(out, "No connection");
        }
        return out;
    }

    private static void put(JSONObject out, String err) {
        try {
            out.put("ok", false).put("status", 0).put("error", err).put("data", JSONObject.NULL);
        } catch (Exception ignored) {
        }
    }

    static void ping(String url) {
        try {
            URL u = new URL(url);
            if (!API_HOSTS.contains(u.getHost())) return;
            HttpURLConnection c = open(url, 10000);
            c.getResponseCode();
            c.disconnect();
        } catch (Exception ignored) {
        }
    }

    /** Small image as a data: URL for picture analysis (images only, max 3 MB). */
    static String thumb(String url) {
        try {
            HttpURLConnection c = open(url, 12000);
            // Some picture servers (e.g. the Art Institute's) refuse non-browser requests.
            if (!url.contains("wikimedia.org")) c.setRequestProperty("User-Agent", BROWSER_UA);
            c.setRequestProperty("Accept", "image/avif,image/webp,image/*,*/*;q=0.8");
            int code = c.getResponseCode();
            String type = c.getContentType();
            if (code != 200 || type == null || !type.startsWith("image/") || type.contains("svg")) return null;
            byte[] b = readAll(c.getInputStream(), 3 * 1024 * 1024);
            c.disconnect();
            if (b == null) return null;
            return "data:" + type.split(";")[0] + ";base64," + Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    static byte[] readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n, total = 0;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > max) {
                in.close();
                return null;
            }
            bo.write(buf, 0, n);
        }
        in.close();
        return bo.toByteArray();
    }

    static JSONArray arr(Object... xs) {
        JSONArray a = new JSONArray();
        for (Object x : xs) a.put(x);
        return a;
    }
}
