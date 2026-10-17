#!/usr/bin/env bash
# Runs on the GitHub Android emulator: installs the APK, starts the built-in self-test, and collects
# logs, screenshots and the list of downloaded files (saved often, so a timeout still leaves results).
set -x
OUT=ci-out; mkdir -p "$OUT"
echo "emulator ready at $(date +%T) (job started $JOB_START)" > "$OUT/timeline.txt"
adb shell getprop ro.build.version.release >> "$OUT/timeline.txt"
adb shell dumpsys package com.google.android.webview | grep -m2 versionName >> "$OUT/timeline.txt"
adb install -r CreatorDownloader.apk >> "$OUT/timeline.txt" 2>&1 || exit 1
adb logcat -c
sleep 20  # let the emulator settle after boot
# Full log streamed to a file from the start, so a freeze still leaves the lead-up on disk.
(adb logcat -v time > "$OUT/stream.log" 2>&1 &)
(for i in $(seq 1 40); do echo "== $(date +%T)"; timeout 8 adb shell top -b -n 1 -m 8 2>&1 | head -16; sleep 4; done > "$OUT/top.txt" 2>&1 &)
# 1) plain start, no self-test: does the app alone run fine?
adb shell am start -W -n app.creatordownloader.mobile/app.creatordownloader.MainActivity >> "$OUT/timeline.txt" 2>&1
sleep 25; timeout 20 adb exec-out screencap -p > "$OUT/plain-start.png"; echo "$(date +%T) plain start shot" >> "$OUT/timeline.txt"
adb shell am force-stop app.creatordownloader.mobile; sleep 3
# 2) the self-test
adb shell am start -W -n app.creatordownloader.mobile/app.creatordownloader.MainActivity --es selftest native >> "$OUT/timeline.txt" 2>&1
end=$((SECONDS + 1800)); shots=" "; tick=0
while [ $SECONDS -lt $end ]; do
  timeout 20 adb logcat -d -s CDApp:V > "$OUT/logcat.new" 2>/dev/null && [ -s "$OUT/logcat.new" ] && mv "$OUT/logcat.new" "$OUT/logcat.txt"
  for s in $(grep -oE "ST SHOT [a-z0-9-]+" "$OUT/logcat.txt" | awk '{print $NF}'); do
    case "$shots" in *" $s "*) ;; *) shots="$shots$s "; timeout 20 adb exec-out screencap -p > "$OUT/$s.png";; esac
  done
  tick=$((tick + 1))
  if [ $((tick % 30)) -eq 1 ]; then
    timeout 20 adb exec-out screencap -p > "$OUT/progress-$tick.png"
    timeout 20 adb logcat -d -t 600 > "$OUT/logcat-tail.txt" 2>/dev/null
    echo "$(date +%T) tick $tick lines $(wc -l < "$OUT/logcat.txt") top: $(timeout 15 adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity')" >> "$OUT/timeline.txt"
  fi
  grep -q "ST done" "$OUT/logcat.txt" && break
  sleep 2
done
timeout 20 adb exec-out screencap -p > "$OUT/final.png"
timeout 30 adb shell 'ls -lR "/sdcard/Download/Creator Downloader"' > "$OUT/files.txt" 2>&1
timeout 30 adb logcat -d > "$OUT/logcat-full.txt"
tail -400 "$OUT/stream.log" > "$OUT/stream-tail.txt"
grep -E "ST " "$OUT/logcat.txt" | sed 's/^.*CDApp *: //' > "$OUT/selftest.txt"
cat "$OUT/timeline.txt"; cat "$OUT/selftest.txt"
exit 0
