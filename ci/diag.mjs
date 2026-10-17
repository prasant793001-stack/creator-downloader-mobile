// Diagnose the picture checker: compare models/precisions and inspect preprocessing.
import { env, AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
import fs from "node:fs";
const out = []; const log = (...a) => { const s = a.join(" "); out.push(s); console.log(s); };
const TOPICS = ["red apple", "lighthouse", "cat", "sports car", "sunflower", "waterfall"];
const words = s => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2);
async function getJSON(u) { const r = await fetch(u, { headers: { "User-Agent": "cd-diag/1.0" } }); if (!r.ok) throw new Error(r.status); return r.json(); }
const imgs = [];
for (const t of TOPICS) {
  const d = await getJSON("https://api.openverse.org/v1/images/?page_size=14&mature=false&q=" + encodeURIComponent(t));
  for (const r of d.results) imgs.push({ topic: t, title: r.title || "", tags: (r.tags || []).map(x => x.name).join(" "), thumb: r.thumbnail });
}
const raws = [];
for (const it of imgs) { try { it.img = await RawImage.read(it.thumb); raws.push(it); } catch {} }
log("images", raws.length);
const norm = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Float32Array.from(v, x => x / s); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
async function run(model, dtype, opts = {}) {
  const tok = await AutoTokenizer.from_pretrained(model);
  const proc = await AutoProcessor.from_pretrained(model);
  const tm = await CLIPTextModelWithProjection.from_pretrained(model, { dtype, ...opts });
  const vm = await CLIPVisionModelWithProjection.from_pretrained(model, { dtype, ...opts });
  const prompts = TOPICS.map(t => `a photo of ${t}`);
  const ti = tok(prompts, { padding: "max_length", truncation: true });
  const { text_embeds } = await tm(ti);
  const d = text_embeds.dims[1];
  const T = prompts.map((_, i) => norm(text_embeds.data.slice(i * d, (i + 1) * d)));
  let correct = 0, pos = [], neg = [], first = null;
  for (const it of raws) {
    const pi = await proc(it.img);
    if (!first) { const pv = pi.pixel_values; const a = pv.data; let mn = 1e9, mx = -1e9, s = 0; for (const x of a) { mn = Math.min(mn, x); mx = Math.max(mx, x); s += x; } first = `pixel_values dims ${pv.dims} min ${mn.toFixed(3)} max ${mx.toFixed(3)} mean ${(s / a.length).toFixed(3)}`; }
    const { image_embeds } = await vm(pi);
    const v = norm(image_embeds.data);
    const sims = T.map(t => dot(v, t));
    const best = sims.indexOf(Math.max(...sims));
    if (TOPICS[best] === it.topic) correct++;
    TOPICS.forEach((t, k) => (t === it.topic ? pos : neg).push(sims[k]));
  }
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(4);
  log(`${model} ${dtype} ${JSON.stringify(opts)}: top-1 topic accuracy ${(100 * correct / raws.length).toFixed(0)}% | mean sim own ${avg(pos)} other ${avg(neg)} | ${first} | input_ids ${ti.input_ids.dims}`);
}
for (const [m, dt, o] of [["Xenova/mobileclip_s0", "q8", {}], ["Xenova/mobileclip_s0", "fp32", {}], ["Xenova/mobileclip_s0", "fp16", {}], ["Xenova/clip-vit-base-patch32", "q8", {}], ["Xenova/clip-vit-base-patch16", "q8", {}]]) {
  try { await run(m, dt, o); } catch (e) { log(m, dt, "FAILED", e.message.slice(0, 300)); }
}
fs.mkdirSync("out", { recursive: true }); fs.writeFileSync("out/diag.txt", out.join("\n"));
