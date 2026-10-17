#!/usr/bin/env bash
# Fetch the on-device AI runtime (exact versions) into www/vendor. Kept out of git.
set -euo pipefail
TJS=4.3.0
ORT=1.31.0-dev.20260914-8d85527a0
tmp=$(mktemp -d)
( cd "$tmp" && npm pack "@huggingface/transformers@$TJS" --silent >/dev/null && npm pack "onnxruntime-web@$ORT" --silent >/dev/null \
  && mkdir t o && tar -xzf huggingface-transformers-$TJS.tgz -C t && tar -xzf onnxruntime-web-$ORT.tgz -C o )
mkdir -p www/vendor
cp "$tmp/t/package/dist/transformers.min.js" www/vendor/
cp "$tmp/o/package/dist/ort-wasm-simd-threaded.jsep.mjs" "$tmp/o/package/dist/ort-wasm-simd-threaded.jsep.wasm" www/vendor/
ls -la www/vendor
