# Creator Downloader for Android

Find free images and videos across 10 libraries and save them straight to your phone.

## Install the app
1. On your phone, open **Releases → Creator Downloader for Android** in this repository (or the direct link `releases/latest/download/CreatorDownloader.apk`).
2. Tap **CreatorDownloader.apk** to download it, then open it.
3. If Android asks, allow your browser to **install unknown apps**, then tap **Install**.
4. Android 10 or newer is required.

Every push to `main` rebuilds the APK automatically (see the **Actions** tab).

## What's inside
- **Search**: Openverse, Wikimedia Commons, NASA, Art Institute of Chicago, Cleveland Museum of Art, Internet Archive (no key), plus Pexels, Pixabay, Unsplash and YouTube CC with free keys (Profile → Connectors).
- **Downloads** go to `Download/Creator Downloader/<library>/` on your phone.
- **Bulk**: paste lyrics or text, or load a .txt / .md file. Each line becomes a search; the app scores results (word match, size, shape, license, and a picture-quality check that skips blank, dark or blurry images) and saves the best ones into `Download/Creator Downloader/Bulk/<project>/<NN - line>/` with a `_credits.txt`.
- **Pinterest**: opens inside the app. Sign in with your Pinterest email and password (Google sign-in is blocked inside apps by Google). Long-press any picture → **Save**. In Bulk, the app walks you through each line and files your picks into that line's folder.

## Web version
The same app also runs in a phone browser (GitHub Pages, if enabled under Settings → Pages → Source: GitHub Actions). In the browser, Pinterest opens in a new tab and files go to the browser's downloads.

## Project layout
- `www/` – the app interface (shared by the APK and the web version)
- `android/` – the native Android shell (WebView, downloads via MediaStore, Pinterest screen)
- `.github/workflows/build.yml` – builds and publishes the APK

The signing key in `android/app/release.keystore` is for this personal app only; keep the same key so updates install over the old version.
