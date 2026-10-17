// Picture checker: does this picture actually show what was searched?
//  1. Text check: search words found in the title, tags or description (never in made-up titles).
//  2. AI check (on-device, MobileCLIP-S0, ~55 MB downloaded once): compares the picture itself with the
//     search words. Zero-shot against generic "other things" prompts, so the score means
//     "how much more this looks like <query> than like something else".
// Nothing is uploaded: pictures and words stay on the device.

import { terms } from "./bulk.js";

const MODEL = "Xenova/mobileclip_s0";
const DISTRACTORS = [
  "a photo of a person", "a photo of a group of people", "a photo of a building", "a photo of a city street",
  "a photo of a landscape", "a photo of the sky", "a photo of an animal", "a photo of a plant", "a photo of food",
  "a photo of a vehicle", "a photo of an everyday object", "a photo of a room interior", "a page of text",
  "a map", "a diagram or chart", "a logo", "an abstract pattern", "a painting", "a black and white historical photo",
  "a screenshot", "a blurry photo"
];
export const STRICTNESS = { relaxed: 0.2, normal: 0.35, strict: 0.5 };

let lib = null, models = null, loading = null;
const textCache = new Map();
const status = { state: "off", loaded: 0, total: 0, error: "" }; // off | loading | ready | error
const listeners = new Set();
export const checkerStatus = () => ({ ...status });
export const onCheckerStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn({ ...status }); } catch {} });

/* ---------------- text relevance (0..1) ---------------- */
export function textMatch(it, q) {
  const want = [...new Set(terms(q))];
  if (!want.length) return 0.5;
  const fields = [[it.title, 1], [it.tags, 0.9], [it.desc, 0.4]];
  let got = 0;
  for (const w of want) {
    let best = 0;
    for (const [f, weight] of fields) {
      if (!f) continue;
      const hay = terms(f);
      if (hay.some(h => h === w || (w.length > 3 && (h.startsWith(w) || w.startsWith(h))))) best = Math.max(best, weight);
    }
    got += best;
  }
  let s = got / want.length;
  // phrase bonus: the words appear together in the title or tags
  const phrase = String(q).toLowerCase().trim();
  if (phrase.includes(" ") && [it.title, it.tags].some(f => String(f || "").toLowerCase().includes(phrase))) s = Math.min(1, s + 0.15);
  return s;
}

// Share of search words found in the title or tags (descriptions don't count here).
export function strongText(it, q) {
  const want = [...new Set(terms(q))];
  if (!want.length) return 1;
  const hay = terms([it.title, it.tags].filter(Boolean).join(" "));
  return want.filter(w => hay.some(h => h === w || (w.length > 3 && (h.startsWith(w) || w.startsWith(h))))).length / want.length;
}

/* ---------------- AI model ---------------- */
export function ensureChecker() {
  if (models) return Promise.resolve(models);
  if (loading) return loading;
  status.state = "loading"; status.error = ""; emit();
  loading = (async () => {
    lib = await import("./vendor/transformers.min.js");
    const { env, AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection } = lib;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const base = new URL("./vendor/", import.meta.url).href;
    env.backends.onnx.wasm.wasmPaths = { mjs: base + "ort-wasm-simd-threaded.jsep.mjs", wasm: base + "ort-wasm-simd-threaded.jsep.wasm" };
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    const files = {};
    const progress_callback = p => {
      if (p.status === "progress" && p.file) { files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 }; }
      else if (p.status === "done" && p.file && files[p.file]) { files[p.file].loaded = files[p.file].total; }
      const v = Object.values(files);
      status.loaded = v.reduce((a, f) => a + f.loaded, 0); status.total = v.reduce((a, f) => a + f.total, 0); emit();
    };
    const opts = { dtype: "q8", device: "wasm", progress_callback };
    const [tokenizer, processor] = await Promise.all([AutoTokenizer.from_pretrained(MODEL, { progress_callback }), AutoProcessor.from_pretrained(MODEL, { progress_callback })]);
    const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, opts);
    const text = await CLIPTextModelWithProjection.from_pretrained(MODEL, opts);
    models = { tokenizer, processor, vision, text };
    status.state = "ready"; emit();
    return models;
  })().catch(e => {
    loading = null; status.state = "error"; status.error = String(e?.message || e).slice(0, 200); emit();
    throw e;
  });
  return loading;
}

const norm = v => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; s = Math.sqrt(s) || 1; const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / s; return o; };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function textEmbeds(q) {
  const key = q.toLowerCase().trim();
  if (textCache.has(key)) return textCache.get(key);
  const m = await ensureChecker();
  const qWords = new Set(terms(q));
  const others = DISTRACTORS.filter(d => !terms(d).some(w => qWords.has(w)));
  const prompts = [`a photo of ${q}`, ...others];
  const inputs = m.tokenizer(prompts, { padding: "max_length", truncation: true });
  const { text_embeds } = await m.text(inputs);
  const dim = text_embeds.dims[1], data = text_embeds.data;
  const vecs = prompts.map((_, i) => norm(data.subarray(i * dim, (i + 1) * dim)));
  const out = { vecs, prompts };
  textCache.set(key, out);
  return out;
}

// Score one picture (data: URL or blob URL) against the search words. Returns { p, sim } or null.
export async function aiScore(q, imageUrl) {
  const m = await ensureChecker();
  const t = await textEmbeds(q);
  const image = await lib.RawImage.read(imageUrl);
  const inputs = await m.processor(image);
  const { image_embeds } = await m.vision(inputs);
  const v = norm(image_embeds.data);
  const sims = t.vecs.map(tv => dot(v, tv));
  const logits = sims.map(s => 100 * s), mx = Math.max(...logits);
  const ex = logits.map(l => Math.exp(l - mx)), sum = ex.reduce((a, b) => a + b, 0);
  return { p: ex[0] / sum, sim: sims[0] };
}

// Check a list of results. getImage(it) -> data URL (or null). onEach(it) fires as each finishes.
// Sets it.check = { text, ai, score, ok } on each item.
export async function checkItems(q, items, { getImage, useAI = true, strictness = "normal", onEach, signal, concurrency = 3 } = {}) {
  const thr = STRICTNESS[strictness] ?? STRICTNESS.normal;
  let aiReady = false;
  if (useAI) { try { await ensureChecker(); aiReady = true; } catch { aiReady = false; } }
  let i = 0;
  const work = async () => {
    while (i < items.length) {
      if (signal?.aborted) return;
      const it = items[i++];
      if (it.check && it.check.q === q && (it.check.ai != null || !aiReady)) { onEach?.(it); continue; }
      const text = textMatch(it, q);
      let ai = null;
      if (aiReady && it.thumb) {
        try { const img = await getImage(it); if (img) ai = (await aiScore(q, img)).p; } catch { ai = null; }
      }
      // With the AI: mostly what the picture shows. Without: words must clearly match.
      const score = ai != null ? 0.75 * ai + 0.25 * text : text * 0.8;
      const ok = ai != null ? (ai >= thr || (ai >= thr * 0.6 && text >= 0.99)) : strongText(it, q) >= 0.99;
      it.check = { q, text, ai, score, ok };
      onEach?.(it);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, work));
  return items;
}
