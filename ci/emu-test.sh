#!/usr/bin/env bash
# Runs on the GitHub Android emulator: installs the APK, starts the built-in self-test, and collects
# logs, screenshots and the list of downloaded files (saved often, so a timeout still leaves results).
set -x
OUT=ci-out; mkdir -p "$OUT"
echo "emulator ready at $(date +%T)" > "$OUT/timeline.txt"
adb shell getprop ro.build.version.release >> "$OUT/timeline.txt"
adb shell dumpsys package com.google.android.webview | grep -m2 versionName >> "$OUT/timeline.txt"
adb install -r CreatorDownloader.apk >> "$OUT/timeline.txt" 2>&1 || exit 1
adb logcat -c
adb shell am start -W -n app.creatordownloader.mobile/app.creatordownloader.MainActivity --es selftest full >> "$OUT/timeline.txt" 2>&1
end=$((SECONDS + 1500)); shots=" "; tick=0
while [ $SECONDS -lt $end ]; do
  adb logcat -d -s CDApp:V > "$OUT/logcat.txt" 2>/dev/null
  for s in $(grep -oE "ST SHOT [a-z0-9-]+" "$OUT/logcat.txt" | awk '{print $NF}'); do
    case "$shots" in *" $s "*) ;; *) shots="$shots$s "; adb exec-out screencap -p > "$OUT/$s.png";; esac
  done
  tick=$((tick + 1))
  if [ $((tick % 45)) -eq 1 ]; then
    adb exec-out screencap -p > "$OUT/progress-$tick.png"
    adb logcat -d -t 400 > "$OUT/logcat-tail.txt" 2>/dev/null
    echo "$(date +%T) tick $tick lines $(wc -l < "$OUT/logcat.txt") top: $(adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity')" >> "$OUT/timeline.txt"
  fi
  grep -q "ST done" "$OUT/logcat.txt" && break
  sleep 2
done
adb exec-out screencap -p > "$OUT/final.png"
adb shell 'ls -lR "/sdcard/Download/Creator Downloader"' > "$OUT/files.txt" 2>&1
adb logcat -d > "$OUT/logcat-full.txt"
grep -E "ST " "$OUT/logcat.txt" | sed 's/^.*CDApp *: //' > "$OUT/selftest.txt"
cat "$OUT/timeline.txt"; cat "$OUT/selftest.txt"
exit 0
