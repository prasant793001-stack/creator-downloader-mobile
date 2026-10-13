package app.creatordownloader;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pinterest inside the app. You sign in on Pinterest's own page (email + password; Google blocks
 * sign-in inside apps). Long-press any picture to save it; saves go to the current folder.
 * Nothing is saved unless you pick it.
 */
public class PinterestActivity extends Activity {
    private static final Pattern PIN_HOSTS = Pattern.compile("(^|\\.)(pinterest\\.[a-z.]+|pinimg\\.com)$", Pattern.CASE_INSENSITIVE);
    private WebView web;
    private TextView label;
    private ProgressBar bar;
    private int need, count;
    private JSONArray subdir;
    private String lineLabel;
    private boolean advanced;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        String query = getIntent().getStringExtra("query");
        lineLabel = getIntent().getStringExtra("label");
        need = getIntent().getIntExtra("need", 0);
        try {
            String s = getIntent().getStringExtra("subdir");
            subdir = s != null ? new JSONArray(s) : null;
        } catch (Exception e) {
            subdir = null;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0E0A1F);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(12), dp(10), dp(8), dp(10));
        top.setBackgroundColor(0xFFE60023);

        label = new TextView(this);
        label.setTextColor(Color.WHITE);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        label.setMaxLines(2);
        top.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button done = new Button(this);
        done.setText(need > 0 ? "Next line" : "Done");
        done.setAllCaps(false);
        done.setOnClickListener(v -> finishWith(need > 0));
        top.addView(done);
        root.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setIndeterminate(true);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4)));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString().replace("; wv)", ")"));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String h = u.getHost() == null ? "" : u.getHost();
                if (PIN_HOSTS.matcher(h).find()) return false;
                if (MainActivity.instance != null) MainActivity.instance.openExternal(u.toString());
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                bar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                bar.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }
        });

        // Long-press a picture → save it
        web.setOnLongClickListener(v -> {
            WebView.HitTestResult r = web.getHitTestResult();
            int t = r.getType();
            if ((t == WebView.HitTestResult.IMAGE_TYPE || t == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) && r.getExtra() != null) {
                final String src = r.getExtra();
                new AlertDialog.Builder(this)
                        .setTitle("Save this picture?")
                        .setMessage(need > 0 ? "It goes into the folder for " + lineLabel + "." : "It goes into Download / Creator Downloader / Pinterest.")
                        .setPositiveButton("Save", (d, w) -> save(src, web.getUrl(), web.getTitle()))
                        .setNegativeButton("Cancel", null)
                        .show();
                return true;
            }
            return false;
        });

        // Pinterest's own download button
        web.setDownloadListener((url, ua, disposition, mime, length) -> {
            if (url.startsWith("https://")) save(url, web.getUrl(), null);
            else if (url.startsWith("data:image/")) saveData(url);
            else Toast.makeText(this, "Long-press the picture to save it.", Toast.LENGTH_LONG).show();
        });

        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        updateLabel();
        String url = (query == null || query.isEmpty()) ? "https://www.pinterest.com/"
                : "https://www.pinterest.com/search/pins/?q=" + Uri.encode(query);
        web.loadUrl(url);
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
            Bridge br = MainActivity.instance != null ? MainActivity.instance.bridge : null;
            if (br == null) { Toast.makeText(this, "Open Creator Downloader first.", Toast.LENGTH_LONG).show(); return; }
            br.downloader.add(new JSONArray().put(job));
            picked();
        } catch (Exception e) {
            Toast.makeText(this, "Couldn't save that picture.", Toast.LENGTH_SHORT).show();
        }
    }

    private void saveData(String dataUrl) {
        try {
            int comma = dataUrl.indexOf(',');
            String mime = dataUrl.substring(5, dataUrl.indexOf(';'));
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            android.content.ContentValues cv = new android.content.ContentValues();
            cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, "Pinterest " + System.currentTimeMillis() + (mime.contains("png") ? ".png" : ".jpg"));
            cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, mime);
            StringBuilder rel = new StringBuilder(android.os.Environment.DIRECTORY_DOWNLOADS).append("/").append(Downloader.ROOT).append("/");
            if (subdir != null) for (int i = 0; i < subdir.length(); i++) rel.append(Downloader.clean(subdir.optString(i))).append("/");
            else rel.append("Pinterest/");
            cv.put(android.provider.MediaStore.Downloads.RELATIVE_PATH, rel.toString());
            Uri u = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (u != null) try (java.io.OutputStream o = getContentResolver().openOutputStream(u)) { if (o != null) o.write(bytes); }
            picked();
        } catch (Exception e) {
            Toast.makeText(this, "Couldn't save that picture.", Toast.LENGTH_SHORT).show();
        }
    }

    private void picked() {
        count++;
        updateLabel();
        Toast.makeText(this, "Saved ✓", Toast.LENGTH_SHORT).show();
        sendEvent(false, false);
        if (need > 0 && count >= need) web.postDelayed(() -> finishWith(true), 600);
    }

    private void updateLabel() {
        String head = need > 0 ? lineLabel + "\n" + count + " of " + need + " picked · long-press a picture"
                : "Long-press a picture to save it" + (count > 0 ? " · " + count + " saved" : "");
        label.setText(head);
    }

    private void finishWith(boolean next) {
        if (advanced) return;
        advanced = true;
        sendEvent(true, next);
        finish();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else finishWith(false);
    }

    @Override
    protected void onDestroy() {
        if (!advanced) sendEvent(true, false);
        web.destroy();
        super.onDestroy();
    }

    private void sendEvent(boolean closed, boolean next) {
        try {
            Bridge br = MainActivity.instance != null ? MainActivity.instance.bridge : null;
            if (br != null) br.event("pin", new JSONObject().put("count", count).put("closed", closed).put("next", next));
        } catch (Exception ignored) {
        }
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

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
