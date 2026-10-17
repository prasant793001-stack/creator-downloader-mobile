// Calibrates the picture checker on real search results.
// For each topic, pictures found for that topic whose title/tags name it = positives;
// the same pictures scored against the other (unrelated) topics = negatives.
// Prints how well each scoring method separates them and the best threshold.
import { env, AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
import fs from "node:fs";

const MODEL = "Xenova/mobileclip_s0";
const TOPICS = ["red apple", "lighthouse", "cat", "snowy mountain", "sunflower", "sports car", "beach sunset", "bicycle", "coffee cup", "waterfall", "elephant", "bridge"];
const BROAD = ["a photo of a person", "a photo of a group of people", "a photo of a building", "a photo of a city street", "a photo of a landscape", "a photo of the sky", "a photo of an animal", "a photo of a plant", "a photo of food", "a photo of a vehicle", "a photo of an everyday object", "a photo of a room interior", "a page of text", "a map", "a diagram or chart", "a logo", "an abstract pattern", "a painting", "a black and white historical photo", "a screenshot", "a blurry photo"];
const NARROW = ["a page of text", "a screenshot", "a logo", "a diagram or chart", "a map", "an abstract pattern", "a blurry photo", "a photo of a person", "a photo of a group of people"];
const words = s => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !["the", "and", "with", "photo"].includes(w));
const out = [];
const log = (...a) => { const s = a.join(" "); out.push(s); console.log(s); };

async function getJSON(u) { const r = await fetch(u, { headers: { "User-Agent": "CreatorDownloader-calibration/1.0" } }); if (!r.ok) throw new Error(r.status + " " + u); return r.json(); }
async function results(q) {
  const items = [];
  try {
    const d = await getJSON("https://api.openverse.org/v1/images/?page_size=20&mature=false&q=" + encodeURIComponent(q));
    for (const r of d.results) items.push({ src: "ov", title: r.title || "", tags: (r.tags || []).map(t => t.name).join(" "), thumb: r.thumbnail });
  } catch (e) { log("openverse fail", q, e.message); }
  try {
    const d = await getJSON("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&gsrsearch=" + encodeURIComponent(q + " filetype:bitmap"));
    for (const p of Object.values(d.query?.pages || {})) { const i = p.imageinfo?.[0]; if (i?.thumburl) items.push({ src: "wm", title: p.title.replace(/^File:/, ""), tags: (i.extmetadata?.Categories?.value || "").replace(/\|/g, " "), thumb: i.thumburl }); }
  } catch (e) { log("wikimedia fail", q, e.message); }
  return items;
}

const norm = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Float32Array.from(v, x => x / s); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const softmax0 = sims => { const l = sims.map(s => 100 * s), m = Math.max(...l), e = l.map(x => Math.exp(x - m)); return e[0] / e.reduce((a, b) => a + b, 0); };

const tok = await AutoTokenizer.from_pretrained(MODEL);
const proc = await AutoProcessor.from_pretrained(MODEL);
const tm = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
const vm = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "fp16" });
async function embedTexts(arr) { const { text_embeds } = await tm(tok(arr, { padding: "max_length", truncation: true })); const d = text_embeds.dims[1]; return arr.map((_, i) => norm(text_embeds.data.slice(i * d, (i + 1) * d))); }
const prompt = q => `a photo of ${q}`;
const allTexts = [...TOPICS.map(prompt), "a photo", ...BROAD];
const E = Object.fromEntries((await embedTexts(allTexts)).map((v, i) => [allTexts[i], v]));
const filt = (list, q) => { const qw = new Set(words(q)); return list.filter(d => !words(d).some(w => qw.has(w))); };

const rows = []; // {topic, other, label, raw, diff, broad, narrow}
for (const topic of TOPICS) {
  const items = await results(topic);
  let n = 0;
  for (const it of items) {
    let img; try { img = await RawImage.read(it.thumb); } catch { continue; }
    const { image_embeds } = await vm(await proc(img));
    const v = norm(image_embeds.data);
    const named = words(topic).every(w => words(it.title + " " + it.tags).some(h => h.startsWith(w.slice(0, 4))));
    for (const q of TOPICS) {
      const label = q === topic ? (named ? 1 : -1) : 0; // 1 = positive, 0 = negative, -1 = unsure (skip)
      if (label < 0) continue;
      const s = dot(v, E[prompt(q)]);
      rows.push({ topic, q, label, title: it.title.slice(0, 60),
        raw: s, diff: s - dot(v, E["a photo"]),
        broad: softmax0([s, ...filt(BROAD, q).map(d => dot(v, E[d]))]),
        narrow: softmax0([s, ...filt(NARROW, q).map(d => dot(v, E[d]))]),
        rank: 0 });
    }
    // rank of the true topic among all topics for this image (1 = best)
    n++;
  }
  log(`topic "${topic}": ${n} pictures scored`);
}
// relative score: softmax over the true prompt vs the 'a photo' null prompt only
function auc(feat) {
  const pos = rows.filter(r => r.label === 1).map(r => r[feat]), neg = rows.filter(r => r.label === 0).map(r => r[feat]);
  let c = 0; for (const p of pos) for (const n of neg) c += p > n ? 1 : p === n ? 0.5 : 0;
  return c / (pos.length * neg.length);
}
function best(feat) {
  const vals = [...new Set(rows.map(r => r[feat]))].sort((a, b) => a - b);
  let top = { acc: 0 };
  const P = rows.filter(r => r.label === 1).length, N = rows.filter(r => r.label === 0).length;
  for (let i = 0; i < vals.length; i += Math.max(1, Math.floor(vals.length / 400))) {
    const t = vals[i];
    const tp = rows.filter(r => r.label === 1 && r[feat] >= t).length, tn = rows.filter(r => r.label === 0 && r[feat] < t).length;
    const bal = (tp / P + tn / N) / 2;
    if (bal > top.acc) top = { acc: bal, t, keepPos: tp / P, rejectNeg: tn / N };
  }
  return top;
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
log(`positives ${rows.filter(r => r.label === 1).length}, negatives ${rows.filter(r => r.label === 0).length}`);
for (const f of ["raw", "diff", "broad", "narrow"]) {
  const b = best(f);
  const P = rows.filter(r => r.label === 1).map(r => r[f]), N = rows.filter(r => r.label === 0).map(r => r[f]);
  log(`${f.padEnd(7)} AUC ${auc(f).toFixed(3)} | best threshold ${b.t?.toFixed(4)} keeps ${(100 * b.keepPos).toFixed(0)}% of matches, rejects ${(100 * b.rejectNeg).toFixed(0)}% of wrong | pos p10/p50/p90 ${[0.1, 0.5, 0.9].map(p => pct(P, p).toFixed(4)).join("/")} | neg p50/p90/p99 ${[0.5, 0.9, 0.99].map(p => pct(N, p).toFixed(4)).join("/")}`);
}
// per-topic positives under the diff score, to spot topics that score low
for (const topic of TOPICS) {
  const P = rows.filter(r => r.label === 1 && r.topic === topic).map(r => r.diff);
  if (P.length) log(`  ${topic.padEnd(15)} matches diff p10/p50 ${pct(P, 0.1).toFixed(4)}/${pct(P, 0.5).toFixed(4)} (n=${P.length})`);
}
fs.mkdirSync("ci-out-cal", { recursive: true });
fs.writeFileSync("ci-out-cal/calibration.txt", out.join("\n"));
fs.writeFileSync("ci-out-cal/rows.json", JSON.stringify(rows));
