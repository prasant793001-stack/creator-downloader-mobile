// Creator Downloader for Android (and installable web app). v1.3
import { SOURCES, META, DIRECTORY, keys, licClass, LIC_LABEL, pick, ext } from "./sources.js";
import { LOGO_MARK, HEROES, SFX } from "./art.js";
import { parseLines, toQuery, pickBest, analyzeImage } from "./bulk.js";
import { checkItems, ensureChecker, checkerStatus, onCheckerStatus, STRICTNESS } from "./checker.js";
import { cd, isNative } from "./bridge.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const https = u => (u ? String(u).replace(/^http:\/\//, "https://") : u);
const fmtBytes = n => !n ? "0 B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";
const DL_ICON = '<svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';
const pad2 = n => String(n).padStart(2, "0");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- settings ---------------- */
let cfg, version = "";
async function loadSettings() { const r = await cd.getSettings(); cfg = r.settings; version = r.version; Object.assign(keys, { pexels: "", pixabay: "", unsplash: "", youtube: "" }, r.keys || {}); }
async function saveSettings(patch, k) { const r = await cd.setSettings(patch, k); cfg = r.settings; Object.assign(keys, { pexels: "", pixabay: "", unsplash: "", youtube: "" }, r.keys || {}); }
const enabledSet = () => new Set(cfg.enabled || Object.keys(SOURCES));
const keyOK = id => !SOURCES[id].key || !!keys[SOURCES[id].key];

/* ---------------- views ---------------- */
let view = "home";
function show(v) {
  if (pin.open) pinClose();
  view = v;
  for (const id of ["home", "search", "bulk", "downloads", "profile"]) $("#v-" + id).hidden = id !== v;
  $$("#tabbar button").forEach(b => b.toggleAttribute("aria-current", b.dataset.v === v));
  $$("#tabbar [aria-current]").forEach(b => b.setAttribute("aria-current", "page"));
  if (v === "downloads") renderDownloads();
  if (v === "profile") openProfile(page);
  if (v === "search" && srcTab === "pin") requestAnimationFrame(() => pinOpenSearch());
  scrollTo({ top: 0 });
}
$("#tabbar").onclick = e => { const b = e.target.closest("[data-v]"); if (b) show(b.dataset.v); };
$("#goHome").onclick = () => show("home");

/* ---------------- picture cache for checks ---------------- */
const imgCache = new Map();
// The picture as a data URL, for the checker. First through the app (no browser limits); if a site
// refuses that, load it like a normal web picture and copy its pixels.
function viaImg(url) {
  return new Promise(res => {
    const img = new Image(); img.crossOrigin = "anonymous"; img.referrerPolicy = "no-referrer";
    const t = setTimeout(() => res(null), 15000);
    img.onload = () => { clearTimeout(t); try { const W = Math.min(400, img.naturalWidth || 400), H = Math.max(1, Math.round(W * (img.naturalHeight || 1) / (img.naturalWidth || 1))); const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(img, 0, 0, W, H); res(c.toDataURL("image/jpeg", 0.9)); } catch { res(null); } };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = url;
  });
}
async function getImage(it) {
  if (imgCache.has(it.uid)) return imgCache.get(it.uid);
  const url = https(it.thumb);
  const p = cd.thumb(url).catch(() => null).then(d => d || viaImg(url));
  imgCache.set(it.uid, p);
  return p;
}
const checkOpts = () => ({ getImage, useAI: cfg.check.ai !== false, strictness: cfg.check.strict || "normal" });

/* ---------------- search ---------------- */
const state = { q: "", type: "all", lic: "all", pref: "large", page: 1, items: [], seen: new Set(), status: {}, busy: false, token: 0, checking: false, checkDone: false, showWeak: false };
const jobs = new Map(); const queued = new Map();
let lastAuto = null;
const active = () => { const en = enabledSet(); return Object.keys(SOURCES).filter(id => en.has(id) && keyOK(id) && (state.type === "all" || SOURCES[id].types.includes(state.type))); };
function licOK(it) { const c = it.lic || (it.lic = licClass(it.license)); return state.lic === "all" || (state.lic === "commercial" ? c !== "nc" : c === "nocredit"); }
function badge(it) {
  const c = it.check;
  if (!c || c.q !== state.q) return state.checking && !it.watchOnly ? '<span class="mbadge wait">…</span>' : "";
  const pct = Math.round(100 * (c.ai != null ? c.ai : c.text));
  if (c.unchecked) return '<span class="mbadge bad">✗ not checked</span>';
  return `<span class="mbadge ${c.ok ? "ok" : "bad"}">${c.ok ? "✓" : "✗"} ${it.junk ? "logo/text" : pct + "%"}${c.ai == null ? " words" : ""}</span>`;
}
function cardHTML(it, i, pre = "") {
  const j = jobs.get(queued.get(it.uid)); const done = j?.status === "done";
  const weak = it.check && it.check.q === state.q && !it.check.ok;
  return `<article class="card${weak ? " weak" : ""}" data-uid="${esc(it.uid)}"><button class="thumb" type="button" data-${pre}open="${i}" aria-label="${esc(it.title)}">
    <img src="${esc(it.thumb)}" alt="" loading="lazy" data-onfail="card">
    <span class="tags"><span class="tag">${esc(SOURCES[it.source].name.split(" ")[0])}</span>${it.type === "video" ? '<span class="tag v">Video</span>' : ""}</span>${pre ? "" : badge(it)}</button>
    <div class="meta"><div class="t"><div class="ctitle">${esc(it.title)}</div><span class="lic ${it.lic}">${LIC_LABEL[it.lic]}</span></div>
    ${it.watchOnly ? `<a class="watch" href="${esc(it.page)}" target="_blank" rel="noopener">Watch</a>`
      : `<button class="dl${done ? " done" : ""}" type="button" data-${pre}dl="${i}" aria-label="Download">${done ? CHECK : DL_ICON}</button>`}</div></article>`;
}
const skeletons = n => Array.from({ length: n }, () => '<div class="skel"></div>').join("");
function visibleItems() {
  const hide = cfg.check.hideWeak !== false && !state.showWeak;
  return state.items.map((it, i) => [it, i]).filter(([it]) => licOK(it) && !(hide && it.check && it.check.q === state.q && !it.check.ok));
}
function renderGrid() {
  const vis = visibleItems();
  const sts = Object.values(state.status);
  if (!vis.length && !state.busy) {
    const allFail = sts.length && sts.every(s => s.err);
    const hidden = state.items.filter(it => it.check && !it.check.ok).length;
    $("#grid").innerHTML = `<div class="empty">${HEROES.kitsu.svg}<div class="big">${!state.q ? "What are we hunting?" : allFail ? "Can't reach the libraries" : hidden ? "No good matches" : state.items.length ? "Filters hid everything" : "Nothing found"}</div>
      <p>${!state.q ? "Type a search above." : allFail ? esc(Object.entries(state.status).map(([id, s]) => SOURCES[id].name + ": " + s.err).slice(0, 3).join(" · ")) : hidden ? "The checker hid every result as a weak match. Try simpler words, or tap “Show weak matches” below." : state.items.length ? "Set License to “All free”." : "Try other words, or switch on more libraries in Profile → Websites."}</p></div>`;
  } else $("#grid").innerHTML = vis.map(([it, i]) => cardHTML(it, i)).join("") + (state.busy ? skeletons(6) : "");
  const okN = state.items.filter(it => it.check?.q === state.q && it.check.ok).length;
  const weakN = state.items.filter(it => it.check?.q === state.q && !it.check.ok).length;
  $("#summary").textContent = state.items.length ? (state.checkDone ? `${okN} good matches · ${active().length} libraries` : `${vis.length} shown · ${active().length} libraries`) : "";
  $("#moreBtn").hidden = state.busy || !state.items.length || !sts.some(s => s.more);
  const wt = $("#weakToggle"); wt.hidden = !weakN || cfg.check.hideWeak === false;
  wt.textContent = state.showWeak ? `Hide ${weakN} weak matches` : `Show ${weakN} weak matches`;
}
function updateCard(it) {
  if (view !== "search") return;
  const el = document.querySelector(`#grid .card[data-uid="${CSS.escape(it.uid)}"]`);
  const idx = state.items.indexOf(it);
  if (!el || idx < 0) return;
  const t = document.createElement("div"); t.innerHTML = cardHTML(it, idx); el.replaceWith(t.firstElementChild);
}
$("#weakToggle").onclick = () => { state.showWeak = !state.showWeak; renderGrid(); };
const interleave = lists => { const out = []; let i = 0; while (lists.some(l => i < l.length)) { for (const l of lists) if (i < l.length) out.push(l[i]); i++; } return out; };
let checkAbort = null;
async function runSearch(append = false) {
  const q = state.q.trim(); if (!q) return renderGrid();
  const token = ++state.token;
  if (!append) { state.page = 1; state.items = []; state.seen = new Set(); state.status = {}; state.checkDone = false; state.showWeak = false; $("#autoStrip").hidden = true; lastAuto = null; }
  checkAbort?.abort();
  $("#heading").textContent = `“${q}”`;
  const ids = active().filter(id => !append || state.status[id]?.more);
  state.busy = true; renderGrid();
  const res = await Promise.all(ids.map(async id => {
    try { const items = (await SOURCES[id].search(q, state.type, state.page)).filter(it => it.thumb && (state.type === "all" || it.type === state.type)); return [id, { n: items.length, more: items.length >= 8 }, items]; }
    catch (e) { return [id, { err: e.message, more: false }, []]; }
  }));
  if (token !== state.token) return;
  res.forEach(([id, st]) => state.status[id] = st);
  const fresh = interleave(res.map(r => r[2])).filter(it => !state.seen.has(it.uid) && state.seen.add(it.uid));
  fresh.forEach(licOK);
  state.items.push(...fresh);
  state.busy = false; renderGrid();
  await runChecks(fresh, token, !append);
}
async function runChecks(list, token, allowAuto) {
  const todo = list.filter(it => !it.watchOnly);
  if (!todo.length) { state.checkDone = true; renderGrid(); return; }
  const ctl = new AbortController(); checkAbort = ctl;
  state.checking = true; state.checkDone = false; renderGrid();
  let n = 0;
  const bar = $("#checkBar"); bar.hidden = false;
  const paint = () => {
    const st = checkerStatus();
    const model = st.state === "loading" && st.total ? ` · AI checker downloading ${fmtBytes(st.loaded)} of ${fmtBytes(st.total)} (first time only)` : st.state === "loading" ? " · starting AI checker…" : st.state === "error" ? " · AI checker unavailable, checking words only" : "";
    bar.querySelector("i").style.width = (100 * n / todo.length) + "%";
    bar.querySelector("span").textContent = `Checking pictures ${n} of ${todo.length}${model}`;
  };
  const off = onCheckerStatus(paint); paint();
  await checkItems(state.q, todo, { ...checkOpts(), signal: ctl.signal, onEach: it => { n++; paint(); updateCard(it); } });
  off();
  if (token !== state.token || ctl.signal.aborted) return;
  state.checking = false; state.checkDone = true; bar.hidden = true;
  // best matches first
  state.items.sort((a, b) => (b.check?.ok ? 1 : 0) - (a.check?.ok ? 1 : 0) || (b.check?.score ?? 0) - (a.check?.score ?? 0));
  renderGrid();
  if (allowAuto && cfg.auto.on) await autoDownload(token);
}
async function autoDownload(token) {
  const want = cfg.auto.count || 5;
  const types = state.type === "video" ? ["video"] : state.type === "image" ? ["image"] : cfg.auto.videos ? ["image", "video"] : ["image"];
  const good = state.items.filter(it => it.check?.q === state.q && it.check.ok && types.includes(it.type) && !it.watchOnly && licOK(it));
  const chosen = good.slice(0, want);
  const strip = $("#autoStrip"); strip.hidden = false;
  if (!chosen.length) { strip.className = "autostrip none"; strip.innerHTML = `<b>No good matches to auto-download</b><span class="note">Try simpler words or a Relaxed check in Profile → Downloader.</span>`; lastAuto = { q: state.q, n: 0 }; return; }
  const pairs = [];
  for (const it of chosen) { try { const v = pick(await ensureVariants(it), state.pref); if (v) pairs.push([it, v]); } catch {} }
  if (token !== state.token) return;
  const q = state.q;
  const added = await enqueue(pairs, () => ({ subdir: ["Search", q] }));
  lastAuto = { q, n: added.length, ids: added.map(j => j.id) };
  strip.className = "autostrip";
  strip.innerHTML = `<b>⚡ Auto-downloading ${added.length} best match${added.length === 1 ? "" : "es"}</b><div class="thumbs">${pairs.map(([it]) => `<img src="${esc(it.thumb)}" alt="" data-onfail="hide">`).join("")}</div>`;
  renderGrid();
}
function startSearch(q) { q = String(q || "").trim(); if (!q) return; state.q = q; $("#tq").value = q; if (srcTab === "pin") { if (view === "search") pinOpenSearch(); else show("search"); return; } show("search"); runSearch(); }
$("#topSearch").onsubmit = e => { e.preventDefault(); $("#tq").blur(); startSearch($("#tq").value); };
$("#moreBtn").onclick = () => { state.page++; runSearch(true); };
$("#typeSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; state.type = b.dataset.v; $$("#typeSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); runSearch(); };
$("#lic").onchange = e => { state.lic = e.target.value; renderGrid(); };
$("#pref").onchange = e => { state.pref = e.target.value; };
$("#autoChip").onclick = async () => { await saveSettings({ auto: { on: !cfg.auto.on } }); paintAutoChip(); toast(cfg.auto.on ? `Auto-download on: best ${cfg.auto.count} per search` : "Auto-download off"); if (cfg.auto.on && state.checkDone && state.q && !lastAuto) autoDownload(state.token); };
function paintAutoChip() { const c = $("#autoChip"); c.setAttribute("aria-pressed", !!cfg.auto.on); c.textContent = cfg.auto.on ? `⚡ Auto ${cfg.auto.count}` : "⚡ Auto"; }
$("#grid").onclick = e => {
  const o = e.target.closest("[data-open]"); if (o) return openDetail(state.items[+o.dataset.open]);
  const d = e.target.closest("[data-dl]"); if (d) quickDownload(state.items[+d.dataset.dl]);
};
document.addEventListener("error", e => { const im = e.target; if (im instanceof HTMLImageElement && im.dataset.onfail === "card") im.closest(".card")?.remove(); else if (im instanceof HTMLImageElement && im.dataset.onfail === "hide") im.style.visibility = "hidden"; }, true);

/* ---------------- Pinterest panel ---------------- */
// Android app: Pinterest is shown inside this screen (a native view over #pinSlot). You sign in on
// Pinterest's own page and long-press pictures to save them. Web version: opens a new tab.
let srcTab = "libs";
const pin = { open: false, mode: null, saved: 0 };
function setSrcTab(t) {
  srcTab = t;
  $$("#srcTabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  if (t === "pin") pinOpenSearch(); else if (pin.open) pinClose();
}
$("#srcTabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (b) setSrcTab(b.dataset.tab); };
function pinRect() { const r = $("#pinSlot").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function pinPlace() { const top = $(".top").getBoundingClientRect().bottom; $("#pinArea").style.top = Math.max(0, top) + "px"; }
function pinOpen(mode, query, extra = {}) {
  pin.open = true; pin.mode = mode;
  document.body.classList.add("pin-open"); $("#pinArea").hidden = false; pinPlace();
  if (!isNative) {
    $("#pinSlot").innerHTML = `<div class="webonly"><p>Pinterest can't show inside the web version. Open it in a new tab, or install the Android app to use it here.</p><button class="cta" id="pinTabBtn" type="button">Open Pinterest</button></div>`;
    $("#pinTabBtn").onclick = () => cd.pinOpenTab(query);
    return;
  }
  $("#pinSlot").innerHTML = "<p>Loading Pinterest…</p>";
  requestAnimationFrame(() => cd.pinShow({ query, rect: pinRect(), subdir: extra.subdir || null, need: extra.need || 0, label: extra.label || "" }));
}
function pinClose(fromNative) {
  if (!pin.open) return;
  pin.open = false; pin.mode = null;
  document.body.classList.remove("pin-open"); $("#pinArea").hidden = true;
  if (!fromNative) cd.pinHide();
  if (srcTab === "pin" && view === "search" && fromNative) { srcTab = "libs"; $$("#srcTabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === "libs")); }
}
function pinOpenSearch() {
  pin.saved = 0;
  $("#pinBar").innerHTML = `<div class="lbl">${state.q ? `Pinterest: “${esc(state.q)}”` : "Pinterest"}<small>Long-press a picture to save it · <span id="pinSaved">0</span> saved</small></div>
    <button type="button" data-pn="back">←</button><button type="button" data-pn="close">Close</button>`;
  pinOpen("search", state.q);
}
$("#pinBar").addEventListener("click", e => {
  const b = e.target.closest("[data-pn]"); if (!b) return;
  const a = b.dataset.pn;
  if (a === "back") cd.pinNav("back");
  else if (a === "close") { if (pin.mode === "bulk") bulkPinFinish(); else setSrcTab("libs"); }
  else if (a === "next") bulkPinGo(bulk.pinIdx + 1);
  else if (a === "prev") bulkPinGo(bulk.pinIdx - 1);
});
addEventListener("resize", () => { if (pin.open && isNative) { pinPlace(); requestAnimationFrame(() => cd.pinLayout(pinRect())); } });
cd.onPinSaved(d => {
  if (d.closed) { if (pin.mode === "bulk") bulkPinFinish(true); else pinClose(true); return; }
  if (!d.saved) return;
  if (pin.mode === "search") { pin.saved++; const s = $("#pinSaved"); if (s) s.textContent = pin.saved; updateBadge(); }
  if (pin.mode === "bulk") {
    const r = bulk.pinRows[bulk.pinIdx]; if (!r) return;
    r.pinCount = d.count; renderBulk(); bulkPinBar();
    if (d.count >= bulk.pinNeed) setTimeout(() => { if (bulk.pinRows[bulk.pinIdx] === r) bulkPinGo(bulk.pinIdx + 1); }, 700);
  }
});

/* ---------------- downloads ---------------- */
async function ensureVariants(it) { if (!it.variants && it.loadVariants) it.variants = await it.loadVariants(); return it.variants || []; }
function jobFor(it, v) {
  const src = SOURCES[it.source].name.replace(" (Creative Commons)", "");
  return { url: https(v.url), baseName: `${it.title} - ${src} - ${v.w && v.w < 9999 ? v.w + "w" : "original"}`, title: it.title, type: it.type, thumb: it.thumb, page: it.page,
    source: it.source, sourceName: src, query: state.q, quality: v.label, license: it.license, credit: it.credit || "", match: it.check ? Math.round(100 * (it.check.ai ?? it.check.text)) : undefined };
}
async function enqueue(pairs, extra = {}) {
  if (!pairs.length) return [];
  const list = pairs.map(([it, v], k) => { try { it.track?.(); } catch {} return { ...jobFor(it, v), ...(typeof extra === "function" ? extra(it, v, k) : extra) }; });
  const added = (await cd.download(list)) || [];
  added.forEach((j, i) => { jobs.set(j.id, j); if (pairs[i]) queued.set(pairs[i][0].uid, j.id); });
  updateBadge();
  return added;
}
async function quickDownload(it) {
  try { const v = pick(await ensureVariants(it), state.pref); if (!v) return toast("No downloadable file."); await enqueue([[it, v]]); toast("Downloading…"); }
  catch (e) { toast("Couldn't load files: " + e.message); }
}
function updateBadge() { const n = [...jobs.values()].filter(j => ["queued", "downloading"].includes(j.status)).length; $("#dlBadge").hidden = !n; $("#dlBadge").textContent = n; }
function jobHTML(j) {
  const pct = j.total ? Math.min(100, j.received / j.total * 100) : 0;
  const st = { queued: "Waiting", downloading: j.total ? Math.round(pct) + "%" : fmtBytes(j.received), done: "Saved · " + fmtBytes(j.total), failed: "Failed: " + (j.error || ""), cancelled: "Cancelled" }[j.status] || j.status;
  return `<div class="ditem" data-id="${j.id}"><img src="${esc(j.thumb || "")}" alt="" data-onfail="hide">
    <div class="dt">${esc(j.title)}</div><div class="ds">${esc(j.sourceName || "")} · ${esc(j.quality || "")}${j.match != null ? " · ✓" + j.match + "%" : ""} · <span class="st-${j.status}">${esc(st)}</span></div>
    ${["queued", "downloading"].includes(j.status) ? `<div class="bar"><i style="width:${pct}%"></i></div>`
      : `<div class="dbtns">${j.status === "done" && isNative ? '<button data-a="open">Open</button>' : ""}${j.status === "failed" ? '<button data-a="retry">Retry</button>' : ""}<button data-a="remove">Remove</button></div>`}</div>`;
}
function renderDownloads() {
  const list = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  $("#dWhere").textContent = isNative ? "Files are saved in your phone's Download / Creator Downloader folder." : "Files go to your browser's downloads.";
  $("#dList").innerHTML = list.length ? list.map(jobHTML).join("") : `<div class="empty">${HEROES.byte.svg}<p>No downloads yet. Tap a yellow button to save something.</p></div>`;
}
$("#dList").onclick = async e => {
  const b = e.target.closest("[data-a]"); if (!b) return; const id = b.closest(".ditem").dataset.id;
  if (b.dataset.a === "open") cd.open(id); if (b.dataset.a === "retry") cd.retry(id);
  if (b.dataset.a === "remove") { await cd.remove(id); jobs.delete(id); renderDownloads(); }
};
$("#openFolder").onclick = () => isNative ? cd.openFolder() : toast("Open your browser's Downloads to see files.");
$("#clearDone").onclick = async () => { const all = await cd.clearDone(); jobs.clear(); (all || []).forEach(j => jobs.set(j.id, j)); renderDownloads(); };
cd.onDownload(j => {
  const prev = jobs.get(j.id); jobs.set(j.id, j); updateBadge();
  if (view === "downloads") { const el = $(`.ditem[data-id="${j.id}"]`); if (el) { const t = document.createElement("div"); t.innerHTML = jobHTML(j); el.replaceWith(t.firstElementChild); } else renderDownloads(); }
  if (j.status === "done" && prev?.status !== "done") { celebrate(); if (view === "search") { const it = state.items.find(x => queued.get(x.uid) === j.id); if (it) updateCard(it); } }
  if (j.status === "failed" && prev?.status !== "failed") console.warn("Download failed:", j.title, j.error);
});
function celebrate() {
  if (cfg.downloader.sound !== false) navigator.vibrate?.(30);
  if (cfg.downloader.fx === false || pin.open) return;
  const el = document.createElement("div"); el.className = "fxpop"; el.textContent = SFX[Math.floor(Math.random() * SFX.length)];
  $("#fx").appendChild(el); setTimeout(() => el.remove(), 1100);
}

/* ---------------- detail sheet ---------------- */
function openSheet(html) { $("#sheetBody").innerHTML = '<div class="grab"></div>' + html; $("#sheet").hidden = false; }
function closeSheet() { $("#sheet").hidden = true; $$("#sheet video").forEach(v => v.pause()); }
$("#sheet").onclick = e => { if (e.target.closest("[data-close]")) closeSheet(); };
async function openDetail(it) {
  const credit = it.credit || [it.title && `“${it.title}”`, it.author && `by ${it.author}`, `via ${SOURCES[it.source].name}`, it.license && `(${it.license})`].filter(Boolean).join(" ");
  const c = it.check && it.check.q === state.q ? it.check : null;
  openSheet(`<div class="stage">${it.type === "video" && !it.watchOnly ? `<video controls playsinline poster="${esc(it.thumb)}" src="${esc(it.preview || "")}"></video>` : `<img src="${esc(it.thumb)}" alt="">`}</div>
    <h2>${esc(it.title)}</h2>
    <dl class="kv"><dt>Library</dt><dd>${esc(SOURCES[it.source].name)} · <a href="${esc(it.page)}" target="_blank" rel="noopener">page ↗</a></dd>
      ${it.author ? `<dt>Creator</dt><dd>${esc(it.author)}</dd>` : ""}<dt>License</dt><dd><span class="lic ${it.lic}">${LIC_LABEL[it.lic]}</span> ${esc(it.license || "")}</dd>
      ${c ? `<dt>Match</dt><dd>${c.ok ? "✓ Good match" : "✗ Weak match"} · picture ${c.ai != null ? Math.round(100 * c.ai) + "%" : "not checked"} · words ${Math.round(100 * c.text)}%</dd>` : ""}
      ${it.tags ? `<dt>Tags</dt><dd>${esc(String(it.tags).slice(0, 160))}</dd>` : ""}</dl>
    <div class="vlist" id="vlist"><div class="vrow"><span class="r">${it.watchOnly ? "YouTube videos can only be watched on YouTube." : "Loading sizes…"}</span></div></div>
    <div class="attr"><span>${esc(credit)}</span><button class="chip" id="copyCredit" type="button">Copy</button></div>`);
  $("#copyCredit").onclick = () => navigator.clipboard?.writeText(credit).then(() => toast("Copied."), () => toast("Couldn't copy."));
  if (it.watchOnly) { $("#vlist").innerHTML = `<div class="vrow"><a class="watch" href="${esc(it.page)}" target="_blank" rel="noopener">Watch on YouTube</a></div>`; return; }
  try {
    const vs = [...await ensureVariants(it)].sort((a, b) => (b.w || 0) - (a.w || 0)); const best = pick(vs, state.pref);
    if (it.type === "image") { const big = pick(vs, "medium"); if (big) { const pre = new Image(); pre.onload = () => { const im = $("#sheetBody .stage img"); if (im) im.src = pre.src; }; pre.src = https(big.url); } }
    else if (!it.preview) { const p = pick(vs, "small"); if (p) $("#sheetBody .stage video").src = https(p.url); }
    $("#vlist").innerHTML = vs.map((v, i) => `<div class="vrow"><span class="q">${esc(v.label)}</span><span class="r">${v.w && v.w < 9999 ? (v.approx ? "~" : "") + v.w + "px" : "full"} · ${esc((ext(v.url) || "file").toUpperCase())}</span><button class="${v === best ? "primary" : ""}" data-get="${i}" type="button">Get</button></div>`).join("") || `<div class="vrow"><span class="r">No direct files.</span></div>`;
    $("#vlist").onclick = e => { const g = e.target.closest("[data-get]"); if (g) { enqueue([[it, vs[+g.dataset.get]]]); g.textContent = "✓"; } };
  } catch (e) { $("#vlist").innerHTML = `<div class="vrow"><span class="r">Couldn't load sizes (${esc(e.message)}).</span></div>`; }
}

/* ---------------- home ---------------- */
let homeItems = [], homeQ = "";
function buildHome() {
  $("#logoMark").innerHTML = LOGO_MARK;
  const ideas = ["neon city at night", "ocean waves", "space nebula", "cherry blossom", "thunderstorm", "mountain sunrise", "robot", "fireworks"];
  $("#ideas").innerHTML = ideas.map(i => `<button type="button">${esc(i)}</button>`).join("");
  $("#ideas").onclick = e => { const b = e.target.closest("button"); if (b) startSearch(b.textContent); };
  $("#crew").innerHTML = Object.values(HEROES).map(h => `<article class="hcard" style="--c:${h.color}"><div class="art">${h.svg}</div><h3>${esc(h.name)}</h3><p>${esc(h.line)}</p></article>`).join("");
}
async function loadPicks() {
  const pool = ["neon city", "ocean waves", "space nebula", "cherry blossom", "northern lights", "mountain sunrise", "jungle"];
  homeQ = pool[Math.floor(Math.random() * pool.length)]; $("#picksMore").textContent = `All “${homeQ}” →`;
  $("#picksGrid").innerHTML = skeletons(6);
  const ids = ["openverse", "nasa", "wikimedia", "artic"].filter(id => enabledSet().has(id));
  const res = await Promise.all(ids.map(id => SOURCES[id].search(homeQ, "image", 1).catch(e => ({ err: e.message, id }))));
  homeItems = interleave(res.filter(Array.isArray)).filter(it => it.thumb).slice(0, 12); homeItems.forEach(licOK);
  const errs = res.filter(r => r.err);
  $("#picksGrid").innerHTML = homeItems.length ? homeItems.map((it, i) => cardHTML(it, i, "h")).join("")
    : `<div class="empty"><div class="big">Couldn't reach the libraries</div><p>${esc(errs.map(e => SOURCES[e.id].name + ": " + e.err).join(" · ") || "No results")}. Check your connection.</p></div>`;
}
$("#picksMore").onclick = () => startSearch(homeQ);
$("#picksGrid").onclick = e => {
  const o = e.target.closest("[data-hopen]"); if (o) return openDetail(homeItems[+o.dataset.hopen]);
  const d = e.target.closest("[data-hdl]"); if (d) quickDownload(homeItems[+d.dataset.hdl]);
};

/* ---------------- bulk ---------------- */
const bulk = { rows: [], running: false, paused: false, stop: false, project: "", pinRows: [], pinIdx: 0, pinNeed: 0, started: false };
$("#bFile").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (/^(audio|video)\//.test(f.type)) { toast("That's an audio file. Paste the lyrics as text."); e.target.value = ""; return; }
  $("#bText").value = await f.text(); if (!$("#bName").value) $("#bName").value = f.name.replace(/\.[a-z0-9]+$/i, ""); e.target.value = "";
};
$("#bMake").onclick = () => {
  const lines = parseLines($("#bText").value, { skipRepeats: $("#bSkip").checked }).slice(0, 150);
  if (!lines.length) return toast("Paste some text or load a file first.");
  bulk.rows = lines.map((line, i) => ({ i, line, q: toQuery(line), on: true, state: "ready", picks: [], pinCount: 0 }));
  bulk.project = ($("#bName").value.trim() || lines[0].slice(0, 30)) + " " + new Date().toISOString().slice(0, 10);
  $("#bStep2").hidden = false; $("#bPinGo").hidden = true; renderBulk(); $("#bStep2").scrollIntoView({ behavior: "smooth" });
};
const subdirOf = r => ["Bulk", bulk.project, `${pad2(r.i + 1)} - ${r.q || "line"}`];
function rowState(r) {
  if (r.state === "search") return "Searching…";
  if (r.state === "score") return r.msg || "Checking pictures…";
  if (r.state === "fail") return esc(r.msg);
  return r.picks.map(p => `<img src="${esc(p.thumb)}" alt="" data-onfail="hide">`).join("") + (r.state === "done" && r.msg ? ` <span>${esc(r.msg)}</span>` : "");
}
function renderBulk() {
  $("#bCountLbl").textContent = `${bulk.rows.filter(r => r.on).length} of ${bulk.rows.length} lines`;
  $("#bList").innerHTML = bulk.rows.map(r => `<li class="brow ${r.state === "done" ? "done" : r.state === "fail" ? "fail" : ["search", "score"].includes(r.state) ? "run" : ""}" data-i="${r.i}">
    <input type="checkbox" class="toggle" data-on ${r.on ? "checked" : ""} ${bulk.running ? "disabled" : ""} aria-label="Use line ${r.i + 1}"><span class="n">${r.i + 1}</span><span class="orig">${esc(r.line)}</span>
    <input class="input q" data-q value="${esc(r.q)}" ${bulk.running ? "disabled" : ""} aria-label="Search words">
    <span class="st">${rowState(r)}${r.pinCount ? `<span class="pc">+${r.pinCount} Pinterest</span>` : ""}</span></li>`).join("");
}
$("#bList").addEventListener("change", e => { const li = e.target.closest(".brow"); if (!li) return; const r = bulk.rows[+li.dataset.i];
  if (e.target.matches("[data-on]")) { r.on = e.target.checked; renderBulk(); } if (e.target.matches("[data-q]")) r.q = e.target.value.trim(); });
$("#bOpen").onclick = () => isNative ? cd.openFolder() : toast("Files are in your browser's downloads.");
$("#bPause").onclick = () => { bulk.paused = !bulk.paused; $("#bPause").textContent = bulk.paused ? "Resume" : "Pause"; };
$("#bStop").onclick = () => { bulk.stop = true; bulk.paused = false; };
const tcache = new Map();
async function analyze(it) { if (tcache.has(it.uid)) return tcache.get(it.uid); const d = await getImage(it); const st = d ? await analyzeImage(d).catch(() => null) : null; tcache.set(it.uid, st); return st; }
function prog(done, total, label) { $("#bProg").hidden = false; $("#bProg i").style.width = (total ? done / total * 100 : 0) + "%"; $("#bProg span").textContent = label; }
async function bulkOne(r, opts) {
  r.state = "search"; r.msg = ""; renderBulk();
  const media = opts.media === "both" ? ["image", "video"] : [opts.media];
  const ids = Object.keys(SOURCES).filter(id => enabledSet().has(id) && keyOK(id) && !SOURCES[id].watchOnly && SOURCES[id].types.some(t => media.includes(t)));
  const stype = media.length > 1 ? "all" : media[0];
  let res = await Promise.allSettled(ids.map(id => SOURCES[id].search(r.q, stype, 1)));
  // Libraries sometimes refuse quick repeat searches: wait a moment and ask the failed ones again.
  if (res.some(x => x.status === "rejected")) {
    r.msg = "Retrying libraries…"; renderBulk(); await sleep(2500);
    res = await Promise.all(res.map(async (x, k) => x.status === "fulfilled" ? x : (await Promise.allSettled([SOURCES[ids[k]].search(r.q, stype, 1)]))[0]));
  }
  const items = res.flatMap(x => x.status === "fulfilled" ? x.value : []).filter(it => media.includes(it.type) && it.thumb && !it.watchOnly);
  items.forEach(it => it.lic = licClass(it.license));
  if (!items.length) {
    const errs = res.map((x, k) => x.status === "rejected" ? `${SOURCES[ids[k]].name}: ${x.reason?.message || x.reason}` : null).filter(Boolean);
    r.state = "fail"; r.msg = res.every(x => x.status === "rejected") ? "Libraries unreachable" : "Nothing found";
    console.warn("Bulk line", r.i + 1, r.q, r.msg, errs.join(" | "));
    return;
  }
  r.state = "score"; renderBulk();
  let n = 0;
  const { picks, checked, rejected } = await pickBest(items, r.q, opts, {
    analyze,
    check: list => checkItems(r.q, list, { ...checkOpts(), onEach: () => { n++; r.msg = `Checking pictures ${n}/${list.length}…`; renderBulk(); } })
  });
  if (!picks.length) { r.state = "fail"; r.msg = `No real match in the free libraries (${rejected} of ${checked} pictures rejected). Use the Pinterest step for this line.`; return; }
  const pairs = [], credits = [];
  for (const x of picks) { try { const v = pick(await ensureVariants(x.it), cfg.downloader.quality || "large"); if (v) { pairs.push([x.it, v]); r.picks.push({ thumb: x.it.thumb }); (r.pickInfo ||= []).push(`${x.it.source} ai=${x.it.check?.ai == null ? "na" : Math.round(x.it.check.ai * 100)} ${String(x.it.title).slice(0, 40)}`); credits.push(`${pairs.length}. ${x.it.title} | match ${Math.round(100 * (x.it.check?.ai ?? x.it.check?.text ?? 0))}% | ${x.it.author || "unknown"} | ${SOURCES[x.it.source].name} | ${x.it.license} | ${x.it.page}`); } } catch {} }
  if (!pairs.length) { r.state = "fail"; r.msg = "No downloadable files"; return; }
  const sub = subdirOf(r);
  await enqueue(pairs, (it, v, k) => ({ subdir: sub, baseName: `${k + 1} - ${it.title}`, query: r.q, bulk: bulk.project }));
  cd.bulkCredits(sub, `Line ${r.i + 1}: "${r.line}"\nSearch: ${r.q}\n${credits.join("\n")}\n`);
  r.state = "done"; r.msg = pairs.length < opts.count ? `only ${pairs.length} good` : "";
}
$("#bStart").onclick = async () => {
  if (bulk.running) return;
  const todo = bulk.rows.filter(r => r.on && r.q); if (!todo.length) return toast("Tick at least one line.");
  const opts = { count: +$("#bCount").value, shape: $("#bShape").value, lic: $("#bLic").value, media: $("#bMedia").value };
  Object.assign(bulk, { running: true, paused: false, stop: false, started: true });
  $("#bStart").hidden = true; $("#bPause").hidden = $("#bStop").hidden = false; $("#bPinGo").hidden = true;
  todo.forEach(r => { r.state = "ready"; r.picks = []; r.pickInfo = []; r.msg = ""; }); renderBulk();
  if (cfg.check.ai !== false && checkerStatus().state !== "ready") {
    const off = onCheckerStatus(st => { if (st.state === "loading") prog(0, todo.length, st.total ? `Getting the AI checker ready: ${fmtBytes(st.loaded)} of ${fmtBytes(st.total)} (first time only)` : "Getting the AI checker ready…"); });
    try { await ensureChecker(); } catch { toast("AI checker unavailable. Checking words only."); }
    off();
  }
  let done = 0;
  for (const r of todo) {
    while (bulk.paused && !bulk.stop) await sleep(300);
    if (bulk.stop) break;
    prog(done, todo.length, `Line ${r.i + 1}: ${r.q}`);
    try { await bulkOne(r, opts); } catch (e) { r.state = "fail"; r.msg = e.message; console.error("Bulk line failed", r.q, e); }
    done++; renderBulk();
    await sleep(800); // be gentle with the free libraries between lines
  }
  const ok = todo.filter(r => r.state === "done").length;
  prog(done, todo.length, bulk.stop ? `Stopped · ${ok} lines` : `Done · ${ok} of ${todo.length} lines`);
  bulk.running = false; $("#bStart").hidden = false; $("#bStart").textContent = "Run again"; $("#bPause").hidden = $("#bStop").hidden = true; renderBulk();
  if (ok) celebrate();
  const need = +$("#bPin").value;
  if (!bulk.stop && need && cfg.pinterest !== false && todo.length) {
    bulk.pinRows = todo; bulk.pinNeed = need; bulk.pinIdx = 0;
    $("#bPinGo").hidden = false; $("#bPinGo").textContent = isNative ? `Pick ${need} from Pinterest for each line` : "Pinterest picks (opens new tabs)";
  }
};
// Bulk Pinterest step: Pinterest opens inside the Bulk screen, one line at a time. You long-press the
// pictures you like; each goes into that line's folder and the next line opens after the set number.
$("#bPinGo").onclick = () => {
  if (!isNative) { const r = bulk.pinRows[bulk.pinIdx]; if (r) { cd.pinOpenTab(r.q); bulk.pinIdx = (bulk.pinIdx + 1) % bulk.pinRows.length; } return; }
  bulkPinGo(bulk.pinIdx);
};
function bulkPinBar() {
  const r = bulk.pinRows[bulk.pinIdx]; if (!r) return;
  $("#pinBar").innerHTML = `<div class="lbl">Line ${bulk.pinIdx + 1} of ${bulk.pinRows.length}: “${esc(r.q)}”<small>Long-press a picture to save · ${r.pinCount} of ${bulk.pinNeed} picked</small></div>
    <button type="button" data-pn="prev" ${bulk.pinIdx === 0 ? "disabled" : ""}>‹</button><button type="button" data-pn="next">›</button><button type="button" class="go" data-pn="close">Done</button>`;
}
function bulkPinGo(i) {
  if (i >= bulk.pinRows.length) { toast("Pinterest picks finished."); return bulkPinFinish(); }
  bulk.pinIdx = Math.max(0, i);
  const r = bulk.pinRows[bulk.pinIdx];
  bulkPinBar();
  pinOpen("bulk", r.q, { subdir: subdirOf(r), need: bulk.pinNeed, label: `Line ${r.i + 1}: ${r.q}` });
}
function bulkPinFinish(fromNative) {
  pinClose(fromNative);
  const left = bulk.pinRows.length - bulk.pinIdx;
  $("#bPinGo").textContent = left > 0 && bulk.pinRows.some(r => r.pinCount < bulk.pinNeed) ? `Continue Pinterest: line ${Math.min(bulk.pinIdx + 1, bulk.pinRows.length)} of ${bulk.pinRows.length}` : "Pinterest picks done ✓";
  renderBulk();
}

/* ---------------- profile ---------------- */
let page = "account";
function renderCard() { const h = HEROES[cfg.profile.hero] || HEROES.volt; $("#pAvatar").innerHTML = h.svg; $("#avatarMini").innerHTML = h.svg; $("#pName").textContent = cfg.profile.name || "Creator"; $("#pRole").textContent = "Team " + h.name; }
function openProfile(p) { page = p; renderCard(); $$("#ptabs button").forEach(b => b.toggleAttribute("aria-current", b.dataset.p === p)); $$("#ptabs [aria-current]").forEach(b => b.setAttribute("aria-current", "page")); ({ account: pAccount, connectors: pConn, downloader: pDl, websites: pSites, about: pAbout })[p](); }
$("#ptabs").onclick = e => { const b = e.target.closest("[data-p]"); if (b) openProfile(b.dataset.p); };
const saveBar = l => `<div class="savebar"><button class="cta" id="saveBtn" type="button">${l || "Save"}</button></div>`;
function pAccount() {
  const done = [...jobs.values()].filter(j => j.status === "done");
  $("#ppage").innerHTML = `<div class="box"><div class="prow"><label class="lbl" for="pfName">Display name</label><input class="input" id="pfName" maxlength="24" value="${esc(cfg.profile.name)}"></div>
    <div class="prow"><span class="lbl">Your hero</span><div class="heropick" id="heroPick">${Object.entries(HEROES).map(([k, h]) => `<button type="button" data-h="${k}" aria-pressed="${cfg.profile.hero === k}">${h.svg}</button>`).join("")}</div></div></div>
    <div class="box"><h3>Your haul</h3><div class="stats"><div class="stat"><b>${done.length}</b><span>Files</span></div><div class="stat"><b>${fmtBytes(done.reduce((a, j) => a + (j.total || 0), 0))}</b><span>Total size</span></div></div></div>${saveBar()}`;
  let hero = cfg.profile.hero;
  $("#heroPick").onclick = e => { const b = e.target.closest("[data-h]"); if (!b) return; hero = b.dataset.h; $$("#heroPick button").forEach(x => x.setAttribute("aria-pressed", x === b)); };
  $("#saveBtn").onclick = async () => { await saveSettings({ profile: { name: $("#pfName").value.trim() || "Creator", hero } }); renderCard(); toast("Saved."); };
}
function pConn() {
  const conns = Object.entries(SOURCES).filter(([, s]) => s.key);
  $("#ppage").innerHTML = `<div class="box">${conns.map(([id, s]) => { const m = META[id] || {}; return `<div class="prow"><label class="lbl" for="k_${s.key}">${esc(s.name.replace(" (Creative Commons)", " CC"))}<span class="pill ${keys[s.key] ? "key" : ""}" id="pill_${id}">${keys[s.key] ? "Saved" : "Not set"}</span></label>
    <input class="input" id="k_${s.key}" type="password" autocomplete="off" value="${esc(keys[s.key])}" placeholder="Paste API key"><div class="help">${esc(m.desc || "")} <a href="${esc(m.keyUrl)}" target="_blank" rel="noopener" style="color:var(--cyan)">Get a free key ↗</a></div>
    <button class="chip" data-test="${id}" type="button" style="align-self:flex-start">Test key</button></div>`; }).join("")}</div>
    <p class="note">Keys are stored only on this phone. The app never asks for website passwords.</p>${saveBar("Save keys")}`;
  $("#ppage").onclick = async e => {
    const t = e.target.closest("[data-test]"); if (!t) return;
    const id = t.dataset.test, s = SOURCES[id], pill = $("#pill_" + id), old = keys[s.key]; keys[s.key] = $("#k_" + s.key).value.trim();
    if (!keys[s.key]) { pill.className = "pill err"; pill.textContent = "Paste a key"; keys[s.key] = old; return; }
    pill.className = "pill"; pill.textContent = "Testing…";
    try { const r = await s.search("sunset", s.types.includes("image") ? "image" : "video", 1); pill.className = "pill ok"; pill.textContent = `Works · ${r.length}`; } catch (err) { pill.className = "pill err"; pill.textContent = err.message; }
    keys[s.key] = old;
  };
  $("#saveBtn").onclick = async () => { const k = {}; const en = enabledSet(); conns.forEach(([id, s]) => { k[s.key] = $("#k_" + s.key).value; if (k[s.key].trim()) en.add(id); }); await saveSettings({ enabled: [...en] }, k); pConn(); toast("Keys saved."); };
}
function pDl() {
  const d = cfg.downloader, c = cfg.check, a = cfg.auto, o = (v, cur, l) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${l}</option>`;
  const st = checkerStatus();
  const model = st.state === "ready" ? "Ready on this phone" : st.state === "loading" ? `Downloading ${fmtBytes(st.loaded)} of ${fmtBytes(st.total || 66e6)}` : st.state === "error" ? "Couldn't load: " + st.error : "Not downloaded yet (about 66 MB, once)";
  $("#ppage").innerHTML = `<div class="box"><h3>Picture checker</h3>
    <div class="prow"><label class="lbl" for="cAi">AI picture check <input type="checkbox" class="toggle" id="cAi" ${c.ai !== false ? "checked" : ""}></label>
      <div class="help">Looks at each picture and scores how well it shows your search words. Runs on this phone; nothing is uploaded.</div>
      <div class="setrow"><span class="help" id="modelState">${esc(model)}</span><button class="chip" id="modelGet" type="button" ${st.state === "ready" || st.state === "loading" ? "hidden" : ""}>Download now</button></div>
      <div class="modelbar" id="modelBar" ${st.state === "loading" ? "" : "hidden"}><i></i></div></div>
    <div class="prow"><label class="lbl" for="cStrict">How strict</label><select id="cStrict">${o("relaxed", c.strict, "Relaxed: more results, some off-topic")}${o("normal", c.strict, "Normal")}${o("strict", c.strict, "Strict: only clear matches")}</select></div>
    <div class="prow"><label class="lbl" for="cHide">Hide weak matches in results <input type="checkbox" class="toggle" id="cHide" ${c.hideWeak !== false ? "checked" : ""}></label></div></div>
    <div class="box"><h3>Auto-download</h3>
    <div class="prow"><label class="lbl" for="aOn">Download the best matches when I search <input type="checkbox" class="toggle" id="aOn" ${a.on ? "checked" : ""}></label><div class="help">Only pictures that pass the checker are saved, into Download / Creator Downloader / Search / your words.</div></div>
    <div class="prow"><label class="lbl" for="aCount">How many</label><select id="aCount">${o(3, a.count, "Best 3")}${o(5, a.count, "Best 5")}${o(10, a.count, "Best 10")}</select></div>
    <div class="prow"><label class="lbl" for="aVid">Include videos <input type="checkbox" class="toggle" id="aVid" ${a.videos ? "checked" : ""}></label><div class="help">When searching “All”. Choosing “Videos” in a search always auto-saves videos.</div></div></div>
    <div class="box"><div class="prow"><label class="lbl" for="dq">Download quality</label><select id="dq">${o("small", d.quality, "Small (≤800px)")}${o("medium", d.quality, "Medium (≤1600px)")}${o("large", d.quality, "Large (≤2560px)")}${o("original", d.quality, "Original")}</select></div>
    <div class="prow"><label class="lbl" for="fx">Comic pop-ups <input type="checkbox" class="toggle" id="fx" ${d.fx !== false ? "checked" : ""}></label></div>
    <div class="prow"><label class="lbl" for="vib">Vibrate when done <input type="checkbox" class="toggle" id="vib" ${d.sound !== false ? "checked" : ""}></label></div></div>${saveBar()}`;
  const off = onCheckerStatus(s => {
    if (page !== "downloader" || view !== "profile") return off();
    const ms = $("#modelState"); if (!ms) return;
    ms.textContent = s.state === "ready" ? "Ready on this phone" : s.state === "loading" ? `Downloading ${fmtBytes(s.loaded)} of ${fmtBytes(s.total || 66e6)}` : s.state === "error" ? "Couldn't load: " + s.error : "";
    $("#modelBar").hidden = s.state !== "loading"; $("#modelBar i").style.width = (s.total ? 100 * s.loaded / s.total : 5) + "%";
    $("#modelGet").hidden = s.state === "ready" || s.state === "loading";
  });
  $("#modelGet").onclick = () => ensureChecker().then(() => toast("AI checker ready."), e => toast("Couldn't load the AI checker: " + e.message));
  $("#saveBtn").onclick = async () => {
    await saveSettings({ check: { ai: $("#cAi").checked, strict: $("#cStrict").value, hideWeak: $("#cHide").checked }, auto: { on: $("#aOn").checked, count: +$("#aCount").value, videos: $("#aVid").checked },
      downloader: { quality: $("#dq").value, fx: $("#fx").checked, sound: $("#vib").checked } });
    state.pref = cfg.downloader.quality; $("#pref").value = state.pref; paintAutoChip(); toast("Saved.");
  };
}
function pSites() {
  const en = enabledSet();
  $("#ppage").innerHTML = `<div class="box"><h3>Libraries</h3>${Object.entries(SOURCES).map(([id, s]) => `<div class="prow"><label class="lbl" for="on_${id}">${esc(s.name)}<input type="checkbox" class="toggle" id="on_${id}" ${en.has(id) ? "checked" : ""}></label><div class="help">${esc((META[id] || {}).desc || "")}${s.key && !keyOK(id) ? " Needs a key (Connectors)." : ""}</div></div>`).join("")}</div>
    <div class="box"><h3>Pinterest</h3><div class="prow"><label class="lbl" for="pinOn">Show the Pinterest tab<input type="checkbox" class="toggle" id="pinOn" ${cfg.pinterest !== false ? "checked" : ""}></label>
    <div class="help">${isNative ? "Pinterest opens inside the Search and Bulk screens. Sign in with your Pinterest email and password (Google blocks its sign-in inside apps). Long-press a picture to save it." : "Opens Pinterest in a new tab."}</div>
    ${isNative ? '<button class="chip" id="pinOut" type="button" style="align-self:flex-start">Sign out of Pinterest</button>' : ""}</div></div>${saveBar()}`;
  $("#pinOut") && ($("#pinOut").onclick = async () => { await cd.pinSignOut(); toast("Signed out of Pinterest."); });
  $("#saveBtn").onclick = async () => { await saveSettings({ enabled: Object.keys(SOURCES).filter(id => $("#on_" + id).checked), pinterest: $("#pinOn").checked }); $(".pintab").hidden = cfg.pinterest === false; toast("Saved."); };
}
function pAbout() {
  $("#ppage").innerHTML = `<div class="box"><h3>Creator Downloader ${esc(version)}</h3><p class="help" style="padding-bottom:10px">Finds free images and videos across ${Object.keys(SOURCES).length} libraries, checks each picture against your words, and saves the good ones to your phone. “No credit” files are free to use, “Credit” files need the creator named, “Restricted” files can't be used commercially. Volt, Kitsu and Byte are original characters.</p></div>
    <div class="box"><h3>Something not working?</h3><div class="prow"><div class="help">Copy this report and paste it in our chat so the problem can be fixed.</div><pre class="diag" id="diag"></pre><button class="chip" id="diagCopy" type="button" style="align-self:flex-start">Copy report</button></div></div>
    <div class="box"><h3>Libraries</h3>${DIRECTORY.filter(r => r[5] === "in" || r[5] === "key").map(([n, u, m, a, l]) => `<div class="prow"><span class="lbl">${esc(n)}<span class="pill">${esc(a)}</span></span><div class="help">${esc(m)} · ${esc(l)}</div></div>`).join("")}</div>`;
  const rep = diagnostics(); $("#diag").textContent = rep;
  $("#diagCopy").onclick = () => navigator.clipboard?.writeText(rep).then(() => toast("Report copied."), () => toast("Couldn't copy. Long-press the text to copy it."));
}
function diagnostics() {
  const st = checkerStatus();
  return [`Creator Downloader ${version} · ${isNative ? "Android app" : "web"} · ${navigator.userAgent.replace(/^.*?\(/, "(").slice(0, 120)}`,
    `AI checker: ${st.state}${st.error ? " (" + st.error + ")" : ""} · strict ${cfg.check.strict} · auto ${cfg.auto.on ? cfg.auto.count : "off"}`,
    `Libraries: ${Object.keys(SOURCES).map(id => `${id}${enabledSet().has(id) ? (keyOK(id) ? "" : "(no key)") : "(off)"}`).join(", ")}`,
    `Last search: ${state.q || "-"} · ${Object.entries(state.status).map(([k, v]) => `${k}=${v.err || v.n}`).join(" ")}`,
    `Downloads: ${JSON.stringify([...jobs.values()].slice(0, 200).reduce((a, j) => (a[j.status] = (a[j.status] || 0) + 1, a), {}))}`,
    "Recent problems:", ...(window.__cdLog || []).slice(-25)].join("\n");
}

/* ---------------- toast ---------------- */
function toast(msg) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; $("#toasts").appendChild(el); setTimeout(() => el.remove(), 3200); }

/* ---------------- self-test (used by the automatic tests on GitHub) ---------------- */
async function waitFor(fn, ms, step = 500) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
async function selftest(mode) {
  // mode "native": Android emulator run, focused on what only the app does (saving files, Pinterest panel).
  // The AI checker is tested in the Chrome run; the emulator is too slow for it.
  const light = mode === "native";
  const log = (...a) => console.log("ST " + a.join(" "));
  const shot = async name => { log("SHOT " + name); await sleep(4000); };
  try {
    log("boot", isNative ? "native" : "web", version, navigator.userAgent);
    await saveSettings({ check: { ai: !light, strict: "normal", hideWeak: true }, auto: { on: true, count: 3, videos: false } }); paintAutoChip();
    await shot("home");
    const t0 = Date.now();
    if (!light) { try { await ensureChecker(); log("ai ready in", Date.now() - t0, "ms"); } catch (e) { log("ai FAILED", e.message); } }
    for (const q of light ? ["lighthouse"] : ["red apple", "sports car", "spiderman", "iron man"]) {
      startSearch(q);
      const ok = await waitFor(() => state.q === q && !state.busy && state.checkDone && (lastAuto?.q === q), 240000);
      log("search", q, ok ? "finished" : "TIMEOUT", JSON.stringify(Object.fromEntries(Object.entries(state.status).map(([k, v]) => [k, v.err || v.n]))));
      log("counts", `ok=${state.items.filter(it => it.check?.ok).length} weak=${state.items.filter(it => it.check && !it.check.ok).length} unchecked=${state.items.filter(it => !it.check).length} ai-scored=${state.items.filter(it => it.check?.ai != null).length}`);
      log("results", state.items.slice(0, 10).map(it => `[${it.check?.ok ? "OK" : "--"}${it.junk ? " JUNK" : ""} ai=${it.check?.ai == null ? "na" : Math.round(it.check.ai * 100)} txt=${Math.round((it.check?.text ?? 0) * 100)} ${it.source}] ${String(it.title).slice(0, 50)}`).join(" || "));
      log("rejected", state.items.filter(it => it.check && !it.check.ok).slice(0, 8).map(it => `[${it.junk ? "JUNK " : ""}ai=${it.check.ai == null ? "na" : Math.round(it.check.ai * 100)} txt=${Math.round(it.check.text * 100)} ${it.source}] ${String(it.title).slice(0, 50)}`).join(" || "));
      log("auto", JSON.stringify(lastAuto));
      await shot("search-" + q.replace(/\s+/g, "-"));
      await waitFor(() => (lastAuto?.ids || []).every(id => ["done", "failed"].includes(jobs.get(id)?.status)), 120000);
      log("auto jobs", (lastAuto?.ids || []).map(id => { const j = jobs.get(id); return `${j?.status}:${j?.path || j?.error || ""}`; }).join(" | "));
    }
    show("bulk");
    $("#bText").value = light ? "A lighthouse by the sea at night\nRed roses in the rain\n[Chorus]\nRed roses in the rain" : "A lighthouse by the sea at night\nSpiderman\nMarvel\nSuperman\nIron man\nHulk";
    $("#bName").value = "Selftest"; $("#bCount").value = light ? "1" : "2"; $("#bPin").value = "2"; $("#bShape").value = "any";
    $("#bMake").click(); await sleep(400); $("#bStart").click();
    const bok = await waitFor(() => bulk.started && !bulk.running, 420000);
    log("bulk", bok ? "finished" : "TIMEOUT", bulk.rows.map(r => `${r.q}=${r.state}/${r.picks.length}${r.msg ? "(" + r.msg + ")" : ""}`).join(" | "));
    log("bulk picks", bulk.rows.map(r => r.q + ": " + (r.pickInfo || []).join(" ; ")).join(" || "));
    await shot("bulk");
    await waitFor(() => [...jobs.values()].every(j => !["queued", "downloading"].includes(j.status)), 120000);
    log("all jobs", JSON.stringify([...jobs.values()].reduce((a, j) => (a[j.status] = (a[j.status] || 0) + 1, a), {})), [...jobs.values()].filter(j => j.status === "failed").map(j => j.title + ": " + j.error).slice(0, 5).join(" | "));
    if (isNative) {
      $("#bPinGo").click(); await sleep(9000);
      log("pin bulk", JSON.stringify(pinRect()), pin.open, $("#pinBar").textContent.replace(/\s+/g, " ").trim());
      await shot("pin-bulk");
      bulkPinFinish();
      show("search"); setSrcTab("pin"); await sleep(6000);
      log("pin search", pin.open, JSON.stringify(pinRect()));
      await shot("pin-search");
      setSrcTab("libs");
    }
    log("problems", (window.__cdLog || []).slice(-15).join(" || ") || "none");
  } catch (e) { log("CRASH", e.message, e.stack); }
  log("done");
}

/* ---------------- boot ---------------- */
(async function boot() {
  await loadSettings();
  state.pref = cfg.downloader.quality || "large"; $("#pref").value = state.pref;
  buildHome(); renderCard(); paintAutoChip();
  $(".pintab").hidden = cfg.pinterest === false;
  (await cd.downloads()).forEach(j => jobs.set(j.id, j)); updateBadge();
  loadPicks();
  if (!isNative && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  // Get the AI checker ready in the background so the first search is quick.
  const st = new URLSearchParams(location.search).get("selftest");
  if (cfg.check.ai !== false && !st) setTimeout(() => ensureChecker().catch(() => {}), 1500);
  if (st) selftest(st);
})();
