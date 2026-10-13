package app.creatordownloader;

import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Download queue. Files go to Download/Creator Downloader/<library or bulk folders>/ through MediaStore
 * (no storage permission needed on Android 10+), with progress events back to the interface.
 */
final class Downloader {
    static final String ROOT = "Creator Downloader";
    private final MainActivity act;
    private final Bridge bridge;
    private final List<JSONObject> jobs = new ArrayList<>();
    private final Map<String, Boolean> cancelled = new ConcurrentHashMap<>();
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final File historyFile;

    Downloader(MainActivity act, Bridge bridge) {
        this.act = act;
        this.bridge = bridge;
        this.historyFile = new File(act.getFilesDir(), "downloads.json");
        load();
    }

    /* ---------------- queue ---------------- */
    synchronized JSONArray add(JSONArray items) throws Exception {
        JSONArray added = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.getJSONObject(i);
            String url = it.optString("url", "");
            if (!url.startsWith("https://")) continue;
            JSONObject job = new JSONObject(it.toString());
            job.put("id", Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 1e6), 36));
            job.put("status", "queued").put("received", 0).put("total", 0).put("createdAt", System.currentTimeMillis());
            jobs.add(0, job);
            added.put(job);
            final JSONObject j = job;
            workers.execute(() -> run(j));
        }
        save();
        return added;
    }

    synchronized JSONArray list() {
        JSONArray a = new JSONArray();
        for (JSONObject j : jobs) a.put(j);
        return a;
    }

    synchronized JSONObject find(String id) {
        for (JSONObject j : jobs) if (id.equals(j.optString("id"))) return j;
        return null;
    }

    void cancel(String id) {
        cancelled.put(id, true);
    }

    void retry(String id) {
        final JSONObject j = find(id);
        if (j == null) return;
        String st = j.optString("status");
        if (st.equals("failed") || st.equals("cancelled")) {
            cancelled.remove(id);
            set(j, "status", "queued");
            workers.execute(() -> run(j));
        }
    }

    synchronized JSONArray remove(String id) {
        cancelled.put(id, true);
        for (int i = 0; i < jobs.size(); i++) if (id.equals(jobs.get(i).optString("id"))) { jobs.remove(i); break; }
        save();
        return list();
    }

    synchronized JSONArray clearDone() {
        List<JSONObject> keep = new ArrayList<>();
        for (JSONObject j : jobs) { String s = j.optString("status"); if (s.equals("queued") || s.equals("downloading")) keep.add(j); }
        jobs.clear();
        jobs.addAll(keep);
        save();
        return list();
    }

    void open(String id) {
        JSONObject j = find(id);
        if (j == null || !j.has("uri")) return;
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(Uri.parse(j.optString("uri")), j.optString("mime", "*/*"));
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        act.runOnUiThread(() -> {
            try { act.startActivity(Intent.createChooser(i, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
        });
    }

    void openFolder() {
        act.runOnUiThread(() -> {
            try { act.startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
        });
    }

    /* ---------------- worker ---------------- */
    private void run(JSONObject job) {
        String id = job.optString("id");
        if (cancelled.containsKey(id)) { set(job, "status", "cancelled"); return; }
        set(job, "status", "downloading");
        ContentResolver cr = act.getContentResolver();
        Uri target = null;
        try {
            HttpURLConnection c = Net.open(job.optString("url"), 30000);
            int code = c.getResponseCode();
            if (code >= 400 && job.optString("fallbackUrl", "").startsWith("https://")) {
                c.disconnect();
                c = Net.open(job.optString("fallbackUrl"), 30000);
                code = c.getResponseCode();
            }
            if (code >= 400) throw new Exception("Server answered " + code);
            String mime = c.getContentType() == null ? "" : c.getContentType().split(";")[0].trim();
            long total = c.getContentLengthLong();
            String ext = extFor(c.getURL().getPath(), mime, job.optString("type"));
            if (mime.isEmpty()) mime = mimeFor(ext);
            String name = clean(job.optString("baseName", job.optString("title", "file")));
            if (name.length() > 90) name = name.substring(0, 90).trim();

            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, name + "." + ext);
            cv.put(MediaStore.Downloads.MIME_TYPE, mime);
            cv.put(MediaStore.Downloads.RELATIVE_PATH, relPath(job));
            cv.put(MediaStore.Downloads.IS_PENDING, 1);
            target = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (target == null) throw new Exception("Couldn't create the file");

            synchronized (this) { job.put("total", Math.max(total, 0)); job.put("mime", mime); }
            long got = 0, last = 0;
            try (InputStream in = c.getInputStream(); OutputStream out = cr.openOutputStream(target)) {
                if (out == null) throw new Exception("Couldn't write the file");
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelled.containsKey(id)) throw new InterruptedException();
                    out.write(buf, 0, n);
                    got += n;
                    long now = System.currentTimeMillis();
                    if (now - last > 300) { last = now; synchronized (this) { job.put("received", got); } bridge.event("dl", job); }
                }
            }
            c.disconnect();
            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            cr.update(target, done, null, null);
            synchronized (this) {
                job.put("status", "done").put("received", got).put("total", got).put("uri", target.toString())
                        .put("path", "Download/" + relPath(job).substring(Environment.DIRECTORY_DOWNLOADS.length() + 1) + name + "." + ext);
            }
            save();
            bridge.event("dl", job);
        } catch (InterruptedException e) {
            if (target != null) try { cr.delete(target, null, null); } catch (Exception ignored) { }
            set(job, "status", "cancelled");
        } catch (Exception e) {
            if (target != null) try { cr.delete(target, null, null); } catch (Exception ignored) { }
            synchronized (this) { try { job.put("status", "failed").put("error", e.getMessage() == null ? "Error" : e.getMessage()); } catch (Exception ignored) { } }
            save();
            bridge.event("dl", job);
        }
    }

    /** Write a small text file (e.g. _credits.txt) into a folder under Download/Creator Downloader. */
    void writeText(JSONArray subdir, String fileName, String text) {
        try {
            JSONObject fake = new JSONObject().put("subdir", subdir);
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            cv.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
            cv.put(MediaStore.Downloads.RELATIVE_PATH, relPath(fake));
            Uri u = act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (u == null) return;
            try (OutputStream out = act.getContentResolver().openOutputStream(u)) {
                if (out != null) out.write(text.getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
        }
    }

    /* ---------------- helpers ---------------- */
    private String relPath(JSONObject job) {
        StringBuilder sb = new StringBuilder(Environment.DIRECTORY_DOWNLOADS).append('/').append(ROOT).append('/');
        JSONArray sub = job.optJSONArray("subdir");
        if (sub != null && sub.length() > 0) {
            for (int i = 0; i < Math.min(sub.length(), 4); i++) sb.append(clean(sub.optString(i))).append('/');
        } else {
            sb.append(clean(job.optString("sourceName", "Downloads"))).append('/');
        }
        return sb.toString();
    }

    static String clean(String s) {
        String r = (s == null ? "" : s).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").replaceAll("\\s+", " ").trim();
        r = r.replaceAll("[. ]+$", "");
        if (r.length() > 80) r = r.substring(0, 80).trim();
        return r.isEmpty() ? "file" : r;
    }

    private static String extFor(String path, String mime, String type) {
        String p = path == null ? "" : path.toLowerCase();
        int dot = p.lastIndexOf('.');
        if (dot >= 0 && p.length() - dot <= 6) {
            String e = p.substring(dot + 1);
            if (e.matches("[a-z0-9]{2,5}")) return e.equals("jpeg") ? "jpg" : e;
        }
        switch (mime) {
            case "image/jpeg": return "jpg";
            case "image/png": return "png";
            case "image/webp": return "webp";
            case "image/gif": return "gif";
            case "image/tiff": return "tif";
            case "video/mp4": return "mp4";
            case "video/webm": return "webm";
            case "video/quicktime": return "mov";
            default: return "video".equals(type) ? "mp4" : "jpg";
        }
    }

    private static String mimeFor(String ext) {
        switch (ext) {
            case "png": return "image/png";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "mov": return "video/quicktime";
            default: return "image/jpeg";
        }
    }

    private void set(JSONObject job, String k, Object v) {
        synchronized (this) { try { job.put(k, v); } catch (Exception ignored) { } }
        save();
        bridge.event("dl", job);
    }

    private synchronized void load() {
        try {
            if (!historyFile.exists()) return;
            byte[] b = Net.readAll(new java.io.FileInputStream(historyFile), 8 * 1024 * 1024);
            if (b == null) return;
            JSONArray a = new JSONArray(new String(b, StandardCharsets.UTF_8));
            for (int i = 0; i < a.length(); i++) {
                JSONObject j = a.getJSONObject(i);
                String s = j.optString("status");
                if (s.equals("queued") || s.equals("downloading")) j.put("status", "failed").put("error", "Stopped (app closed)");
                jobs.add(j);
            }
        } catch (Exception ignored) {
        }
    }

    private synchronized void save() {
        try (FileOutputStream fo = new FileOutputStream(historyFile)) {
            JSONArray a = new JSONArray();
            for (int i = 0; i < Math.min(jobs.size(), 400); i++) a.put(jobs.get(i));
            fo.write(a.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
        }
    }
}
