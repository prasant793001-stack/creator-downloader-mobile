// Fast Pinterest picking, shared by the Android and Windows apps.
// Pinterest's own search already ranks well, so pictures are checked in Pinterest's order, a few at a
// time, with small 236px previews, and checking stops as soon as enough good ones are found.
// mode "quick" = AI check with early stop (default) · "off" = no check, take Pinterest's top results.

import { checkItems } from "./checker.js";
import { hamming } from "./bulk.js";

export function pinOriginal(u) {
  const m = String(u).match(/^https:\/\/([^/]*pinimg\.com)\/(\d+x|\d+x\d+_[A-Z]+)\/(.+)$/);
  return m ? { url: `https://${m[1]}/originals/${m[3]}`, fallback: `https://${m[1]}/736x/${m[3]}`, thumb: `https://${m[1]}/236x/${m[3]}`, show: `https://${m[1]}/474x/${m[3]}` }
           : { url: u, fallback: null, thumb: u, show: u };
}

// found: [{u, t, p}] from the Pinterest page. Returns { chosen, checked }.
export async function pickPinterest(found, q, need, { checkOpts, analyze, mode = "quick", onProgress, maxCheck = 40 } = {}) {
  const seen = new Set();
  const items = [];
  for (const x of found) {
    const o = pinOriginal(x.u);
    if (seen.has(o.url)) continue; seen.add(o.url);
    items.push({ uid: "pin-" + o.url, source: "pinterest", type: "image", title: (x.t || "").replace(/\s+/g, " ").trim() || "Pinterest image",
      tags: "", desc: "", thumb: o.thumb, show: o.show, orig: o, page: x.p || "" });
  }
  const chosen = [];
  const addIfNew = async it => {
    let st = null;
    try { st = analyze ? await analyze(it) : null; } catch {}
    if (st && st.notes.includes("flat / blank")) return;
    if (st && chosen.some(c => c.st && hamming(c.st.hash, st.hash) <= 6)) return; // same picture twice
    it.st = st; chosen.push(it);
  };
  if (mode === "off" || checkOpts?.useAI === false) {
    for (const it of items) { if (chosen.length >= need) break; await addIfNew(it); }
    return { chosen, checked: 0 };
  }
  let idx = 0, checked = 0;
  const cap = Math.min(items.length, Math.max(maxCheck, need * 3));
  while (chosen.length < need && idx < cap) {
    const batch = items.slice(idx, idx + Math.max(4, (need - chosen.length) * 2));
    idx += batch.length;
    await checkItems(q, batch, { ...checkOpts, concurrency: 4, onEach: () => { checked++; onProgress?.(checked, cap, chosen.length); } });
    if (!batch.some(it => it.check?.ai != null)) {
      // The AI couldn't run: fall back to Pinterest's own order.
      for (const it of items) { if (chosen.length >= need) break; if (!chosen.includes(it)) await addIfNew(it); }
      break;
    }
    const good = batch.filter(it => it.check?.ok).sort((a, b) => b.check.score - a.check.score);
    for (const it of good) { if (chosen.length >= need) break; await addIfNew(it); }
    onProgress?.(checked, cap, chosen.length);
  }
  return { chosen, checked };
}
