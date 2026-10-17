// Bulk engine: turn text / lyrics / Markdown into search lines, score candidates, pick the best images.
// Pure functions (no DOM) except analyzeImage, so the logic can be tested on its own.

const STOP = new Set(("a an the and or but if then so of to in on at by for with from up down over under into onto out off about as is are was were be been being am " +
  "i me my mine we us our you your yours he him his she her hers it its they them their this that these those there here what which who whom whose " +
  "do does did doing have has had having will would shall should can could may might must not no nor only own same too very just also than " +
  "oh ooh yeah yeh hey la na da woah whoa uh huh ah mmm gonna wanna gotta cause cuz till til let lets like get got go goes going come came " +
  "all any both each few more most other some such every again ever never always still now when where why how one two").split(/\s+/));

// Split pasted text or a .txt / .md file into meaningful lines.
export function parseLines(text, { skipRepeats = true } = {}) {
  let t = String(text || "").replace(/\r/g, "");
  t = t.replace(/```[\s\S]*?```/g, " ")                 // code blocks
       .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")          // images -> alt
       .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")           // links -> text
       .replace(/<[^>]+>/g, " ");                         // html tags
  const out = [], seen = new Set();
  for (let raw of t.split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    if (/^\s*(\[[^\]]*\]|\([^)]*\))\s*$/.test(line)) continue;            // [Chorus], (x2)
    if (/^(verse|chorus|bridge|intro|outro|hook|pre-?chorus|refrain)\b[\s\d:]*$/i.test(line)) continue;
    if (/^[-*_=]{3,}$/.test(line)) continue;                               // hr
    line = line.replace(/^#{1,6}\s+/, "").replace(/^>\s?/, "").replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "")
               .replace(/[*_`~]+/g, "").replace(/\s*\(x\d+\)\s*$/i, "").replace(/\s+/g, " ").trim();
    if (line.replace(/[^\p{L}\p{N}]/gu, "").length < 2) continue;
    const key = line.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
    if (skipRepeats && seen.has(key)) continue;
    seen.add(key); out.push(line);
  }
  return out;
}

const stem = w => w.length > 4 ? w.replace(/(ings|ing|ies|ied|es|ed|ly|s)$/, m => (m === "ies" || m === "ied") ? "y" : "") : w;

// Keep the meaningful words of a line (up to 5), as search words.
export function toQuery(line, max = 5) {
  const words = String(line).toLowerCase().replace(/[’']/g, "").match(/[\p{L}\p{N}]+/gu) || [];
  const keep = [];
  for (const w of words) if (!STOP.has(w) && w.length > 1 && !keep.includes(w)) keep.push(w);
  const chosen = (keep.length ? keep : words).slice(0, max);
  return chosen.join(" ");
}

export const terms = q => (String(q).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => !STOP.has(w)).map(stem);

// Metadata score 0..1 from title/tags match, size, shape and license.
export function metaScore(it, q, { shape = "any", lic = "all" } = {}) {
  const want = terms(q);
  const hay = new Set(terms([it.title, it.tags, it.desc].filter(Boolean).join(" ")));
  const hit = want.length ? want.filter(w => hay.has(w) || [...hay].some(h => h.startsWith(w) || w.startsWith(h))).length / want.length : 0.5;
  const px = Math.min(it.w || 0, it.h || 0);
  const size = px ? Math.min(1, Math.log2(Math.max(px, 200) / 200) / Math.log2(2400 / 200)) : 0.35;
  let shapeS = 0.7;
  if (it.w && it.h) {
    const r = it.w / it.h;
    shapeS = shape === "landscape" ? (r >= 1.3 ? 1 : r >= 1.05 ? 0.7 : 0.2)
           : shape === "portrait" ? (r <= 0.8 ? 1 : r <= 0.95 ? 0.7 : 0.2)
           : shape === "square" ? (Math.abs(1 - r) < 0.12 ? 1 : 0.3) : 0.8;
  }
  const c = it.lic;
  const licS = c === "nocredit" ? 1 : c === "credit" ? 0.75 : 0.35;
  if (lic === "nocredit" && c !== "nocredit") return -1;
  if (lic === "commercial" && c === "nc") return -1;
  return 0.5 * hit + 0.22 * size + 0.14 * shapeS + 0.14 * licS;
}

// Image quality from pixels (RGBA array of a small thumbnail). Returns { q: 0..1, hash, notes }.
export function pixelStats(data, w, h) {
  let sum = 0, sum2 = 0, sat = 0, n = 0;
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], gg = data[i + 1], b = data[i + 2];
    const y = 0.299 * r + 0.587 * gg + 0.114 * b;
    g[p] = y; sum += y; sum2 += y * y; n++;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); sat += mx ? (mx - mn) / mx : 0;
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean)), satM = sat / n;
  // sharpness: variance of a Laplacian
  let lap = 0, lap2 = 0, m = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    lap += v; lap2 += v * v; m++;
  }
  const sharp = m ? lap2 / m - (lap / m) ** 2 : 0;
  const expo = 1 - Math.min(1, Math.abs(mean - 125) / 125);     // not too dark / too bright
  const contrast = Math.min(1, sd / 64);
  const sharpS = Math.min(1, Math.log10(1 + sharp) / 3);
  const colour = Math.min(1, satM / 0.35);
  const notes = [];
  if (mean < 35) notes.push("very dark"); if (mean > 225) notes.push("washed out");
  if (sd < 18) notes.push("flat / blank"); if (sharpS < 0.35) notes.push("blurry");
  const q = 0.3 * expo + 0.3 * contrast + 0.28 * sharpS + 0.12 * colour;
  return { q, notes, hash: aHash(g, w, h) };
}

// 64-bit average hash (as 64-char string) for spotting near-duplicates.
export function aHash(g, w, h) {
  const cells = [];
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
    let s = 0, c = 0;
    for (let y = Math.floor(cy * h / 8); y < Math.floor((cy + 1) * h / 8); y++)
      for (let x = Math.floor(cx * w / 8); x < Math.floor((cx + 1) * w / 8); x++) { s += g[y * w + x]; c++; }
    cells.push(c ? s / c : 0);
  }
  const avg = cells.reduce((a, b) => a + b, 0) / 64;
  return cells.map(v => (v > avg ? "1" : "0")).join("");
}
export const hamming = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++; return d; };

// Load a thumbnail (as data URL) and measure it in the browser.
export async function analyzeImage(dataUrl) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const W = 64, H = Math.max(8, Math.round(64 * img.naturalHeight / img.naturalWidth)) || 64;
  const c = new OffscreenCanvas(W, Math.min(H, 128)); const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return pixelStats(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

// Choose the best `count` items: metadata pre-rank, pixel analysis on the top few, no near-duplicates, mixed sources.
// Choose the best `count` items. Every candidate must pass the picture checker (it.check.ok);
// then quality (size, shape, license, sharpness, exposure) decides the order. Near-duplicates are skipped
// and sources are mixed. Returns { picks, checked, rejected }.
export async function pickBest(items, q, opts, { analyze, check } = {}) {
  const ranked = items.map(it => ({ it, m: metaScore(it, q, opts) })).filter(x => x.m >= 0).sort((a, b) => b.m - a.m);
  const pool = ranked.slice(0, Math.max(opts.count * 6, 24));
  if (check) await check(pool.map(x => x.it));
  const passed = pool.filter(x => !check || x.it.check?.ok);
  await Promise.all(passed.map(async x => { try { const st = analyze ? await analyze(x.it) : null; if (st) x.st = st; } catch {} }));
  for (const x of passed) {
    const match = x.it.check ? x.it.check.score : x.m;
    const qual = x.st ? x.st.q - 0.08 * x.st.notes.length : 0.5;
    x.score = 0.6 * match + 0.2 * x.m + 0.2 * qual;
  }
  passed.sort((a, b) => b.score - a.score);
  const picks = [], perSource = {};
  for (const x of passed) {
    if (picks.length >= opts.count) break;
    if (x.st && picks.some(p => p.st && hamming(p.st.hash, x.st.hash) <= 6)) continue;   // near-duplicate
    if ((perSource[x.it.source] || 0) >= Math.ceil(opts.count / 2) && passed.length > opts.count * 2) continue; // mix sources
    perSource[x.it.source] = (perSource[x.it.source] || 0) + 1;
    picks.push(x);
  }
  for (const x of passed) { if (picks.length >= opts.count) break; if (!picks.includes(x) && !(x.st && picks.some(p => p.st && hamming(p.st.hash, x.st.hash) <= 6))) picks.push(x); }
  return { picks, checked: pool.length, rejected: pool.length - passed.length };
}
