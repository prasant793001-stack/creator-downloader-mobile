#!/usr/bin/env bash
# Runs on the GitHub Android emulator: installs the APK, starts the built-in self-test, and collects
# logs, screenshots and the list of downloaded files.
set -x
OUT=ci-out; mkdir -p "$OUT"
adb install -r CreatorDownloader.apk || exit 1
adb logcat -c
adb shell am start -n app.creatordownloader.mobile/app.creatordownloader.MainActivity --es selftest full
end=$((SECONDS + 1700)); shots=" "
while [ $SECONDS -lt $end ]; do
  adb logcat -d -s CDApp:I > "$OUT/logcat.txt" 2>/dev/null
  for s in $(grep -oE "ST SHOT [a-z0-9-]+" "$OUT/logcat.txt" | awk '{print $NF}'); do
    case "$shots" in *" $s "*) ;; *) shots="$shots$s "; adb exec-out screencap -p > "$OUT/$s.png";; esac
  done
  grep -q "ST done" "$OUT/logcat.txt" && break
  sleep 2
done
adb exec-out screencap -p > "$OUT/final.png"
adb shell 'ls -lR "/sdcard/Download/Creator Downloader"' > "$OUT/files.txt" 2>&1
adb logcat -d > "$OUT/logcat-full.txt"
grep -E "ST " "$OUT/logcat.txt" | sed 's/^.*CDApp *: //' > "$OUT/selftest.txt"
cat "$OUT/selftest.txt"
exit 0
