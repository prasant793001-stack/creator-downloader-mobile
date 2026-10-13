// Creator Downloader for Android (and installable web app).
import { SOURCES, META, ELSEWHERE, DIRECTORY, keys, licClass, LIC_LABEL, pick, ext } from "./sources.js";
import { LOGO_MARK, HEROES, SFX } from "./art.js";
import { parseLines, toQuery, pickBest, analyzeImage } from "./bulk.js";
import { cd, isNative } from "./bridge.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const https = u => (u ? String(u).replace(/^http:\/\//, "https://") : u);
const fmtBytes = n => !n ? "0 B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";
const DL_ICON = '<svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';
const pad2 = n => String(n).padStart(2, "0");

/* ---------------- settings ---------------- */
let cfg, version = "";
async function loadSettings() { const r = await cd.getSettings(); cfg = r.settings; version = r.version; Object.assign(keys, { pexels: "", pixabay: "", unsplash: "", youtube: "" }, r.keys || {}); }
async function saveSettings(patch, k) { const r = await cd.setSettings(patch, k); cfg = r.settings; Object.assign(keys, { pexels: "", pixabay: "", unsplash: "", youtube: "" }, r.keys || {}); }
const enabledSet = () => new Set(cfg.enabled || Object.keys(SOURCES));
const keyOK = id => !SOURCES[id].key || !!keys[SOURCES[id].key];

/* ---------------- views ---------------- */
let view = "home";
function show(v) {
  view = v;
  for (const id of ["home", "search", "bulk", "downloads", "profile"]) $("#v-" + id).hidden = id !== v;
  $$("#tabbar button").forEach(b => b.toggleAttribute("aria-current", b.dataset.v === v));
  $$("#tabbar [aria-current]").forEach(b => b.setAttribute("aria-current", "page"));
  if (v === "downloads") renderDownloads();
  if (v === "profile") openProfile(page);
  scrollTo({ top: 0 });
}
$("#tabbar").onclick = e => { const b = e.target.closest("[data-v]"); if (b) show(b.dataset.v); };
$("#goHome").onclick = () => show("home");

/* ---------------- search ---------------- */
const state = { q: "", type: "all", lic: "all", pref: "large", page: 1, items: [], seen: new Set(), status: {}, busy: false, token: 0 };
const jobs = new Map(); const queued = new Map();
const active = () => { const en = enabledSet(); return Object.keys(SOURCES).filter(id => en.has(id) && keyOK(id) && (state.type === "all" || SOURCES[id].types.includes(state.type))); };
function licOK(it) { const c = it.lic || (it.lic = licClass(it.license)); return state.lic === "all" || (state.lic === "commercial" ? c !== "nc" : c === "nocredit"); }
function cardHTML(it, i, pre = "") {
  const j = jobs.get(queued.get(it.uid)); const done = j?.status === "done";
  return `<article class="card"><button class="thumb" type="button" data-${pre}open="${i}" aria-label="${esc(it.title)}">
    <img src="${esc(it.thumb)}" alt="" loading="lazy" data-onfail="card">
    <span class="tags"><span class="tag">${esc(SOURCES[it.source].name.split(" ")[0])}</span>${it.type === "video" ? '<span class="tag v">Video</span>' : ""}</span></button>
    <div class="meta"><div class="t"><div class="ctitle">${esc(it.title)}</div><span class="lic ${it.lic}">${LIC_LABEL[it.lic]}</span></div>
    ${it.watchOnly ? `<a class="watch" href="${esc(it.page)}" target="_blank" rel="noopener">Watch</a>`
      : `<button class="dl${done ? " done" : ""}" type="button" data-${pre}dl="${i}" aria-label="Download">${done ? CHECK : DL_ICON}</button>`}</div></article>`;
}
const skeletons = n => Array.from({ length: n }, () => '<div class="skel"></div>').join("");
function renderGrid() {
  const vis = state.items.map((it, i) => [it, i]).filter(([it]) => licOK(it));
  const sts = Object.values(state.status);
  if (!vis.length && !state.busy) {
    const allFail = sts.length && sts.every(s => s.err);
    $("#grid").innerHTML = `<div class="empty">${HEROES.kitsu.svg}<div class="big">${!state.q ? "What are we hunting?" : allFail ? "Can't reach the libraries" : state.items.length ? "Filters hid everything" : "Nothing found"}</div>
      <p>${!state.q ? "Type a search above." : allFail ? esc(Object.entries(state.status).map(([id, s]) => SOURCES[id].name + ": " + s.err).slice(0, 3).join(" · ")) : state.items.length ? "Set License to “All free”." : "Try other words, or switch on more libraries in Profile → Websites."}</p></div>`;
  } else $("#grid").innerHTML = vis.map(([it, i]) => cardHTML(it, i)).join("") + (state.busy ? skeletons(6) : "");
  $("#summary").textContent = state.items.length ? `${vis.length} shown · ${active().length} libraries` : "";
  $("#moreBtn").hidden = state.busy || !state.items.length || !sts.some(s => s.more);
  const pin = cfg.pinterest !== false && !!state.q; $("#pinSearch").hidden = !pin; $("#pinSearch span").textContent = state.q;
}
const interleave = lists => { const out = []; let i = 0; while (lists.some(l => i < l.length)) { for (const l of lists) if (i < l.length) out.push(l[i]); i++; } return out; };
async function runSearch(append = false) {
  const q = state.q.trim(); if (!q) return renderGrid();
  const token = ++state.token;
  if (!append) { state.page = 1; state.items = []; state.seen = new Set(); state.status = {}; }
  $("#heading").textContent = `“${q}”`;
  const ids = active().filter(id => !append || state.status[id]?.more);
  state.busy = true; renderGrid();
  const res = await Promise.all(ids.map(async id => {
    try { const items = (await SOURCES[id].search(q, state.type, state.page)).filter(it => it.thumb && (state.type === "all" || it.type === state.type)); return [id, { n: items.length, more: items.length >= 8 }, items]; }
    catch (e) { return [id, { err: e.message, more: false }, []]; }
  }));
  if (token !== state.token) return;
  res.forEach(([id, st]) => state.status[id] = st);
  state.items.push(...interleave(res.map(r => r[2])).filter(it => !state.seen.has(it.uid) && state.seen.add(it.uid)));
  state.busy = false; renderGrid();
}
function startSearch(q) { q = String(q || "").trim(); if (!q) return; state.q = q; $("#tq").value = q; show("search"); runSearch(); }
$("#topSearch").onsubmit = e => { e.preventDefault(); $("#tq").blur(); startSearch($("#tq").value); };
$("#moreBtn").onclick = () => { state.page++; runSearch(true); };
$("#typeSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; state.type = b.dataset.v; $$("#typeSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); runSearch(); };
$("#lic").onchange = e => { state.lic = e.target.value; renderGrid(); };
$("#pref").onchange = e => { state.pref = e.target.value; };
$("#pinSearch").onclick = () => cd.pinOpen({ query: state.q });
$("#grid").onclick = e => {
  const o = e.target.closest("[data-open]"); if (o) return openDetail(state.items[+o.dataset.open]);
  const d = e.target.closest("[data-dl]"); if (d) quickDownload(state.items[+d.dataset.dl]);
};
document.addEventListener("error", e => { const im = e.target; if (im instanceof HTMLImageElement && im.dataset.onfail === "card") im.closest(".card")?.remove(); else if (im instanceof HTMLImageElement && im.dataset.onfail === "hide") im.style.visibility = "hidden"; }, true);

/* ---------------- downloads ---------------- */
async function ensureVariants(it) { if (!it.variants && it.loadVariants) it.variants = await it.loadVariants(); return it.variants || []; }
function jobFor(it, v) {
  const src = SOURCES[it.source].name.replace(" (Creative Commons)", "");
  return { url: https(v.url), baseName: `${it.title} - ${src} - ${v.w && v.w < 9999 ? v.w + "w" : "original"}`, title: it.title, type: it.type, thumb: it.thumb, page: it.page,
    source: it.source, sourceName: src, query: state.q, quality: v.label, license: it.license, credit: it.credit || "" };
}
async function enqueue(pairs, extra = {}) {
  const list = pairs.map(([it, v], k) => { try { it.track?.(); } catch {} return { ...jobFor(it, v), ...(typeof extra === "function" ? extra(it, v, k) : extra) }; });
  const added = await cd.download(list);
  added.forEach((j, i) => { jobs.set(j.id, j); queued.set(pairs[i][0].uid, j.id); });
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
    <div class="dt">${esc(j.title)}</div><div class="ds">${esc(j.sourceName || "")} · ${esc(j.quality || "")} · <span class="st-${j.status}">${esc(st)}</span></div>
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
  if (j.status === "done" && prev?.status !== "done") { celebrate(); if (view === "search") renderGrid(); }
  if (j.status === "failed" && prev?.status !== "failed") toast("Download failed: " + (j.error || ""));
});
function celebrate() {
  if (cfg.downloader.sound !== false) navigator.vibrate?.(30);
  if (cfg.downloader.fx === false) return;
  const el = document.createElement("div"); el.className = "fxpop"; el.textContent = SFX[Math.floor(Math.random() * SFX.length)];
  $("#fx").appendChild(el); setTimeout(() => el.remove(), 1100);
}

/* ---------------- detail sheet ---------------- */
function openSheet(html) { $("#sheetBody").innerHTML = '<div class="grab"></div>' + html; $("#sheet").hidden = false; }
function closeSheet() { $("#sheet").hidden = true; $$("#sheet video").forEach(v => v.pause()); }
$("#sheet").onclick = e => { if (e.target.closest("[data-close]")) closeSheet(); };
async function openDetail(it) {
  const credit = it.credit || [it.title && `“${it.title}”`, it.author && `by ${it.author}`, `via ${SOURCES[it.source].name}`, it.license && `(${it.license})`].filter(Boolean).join(" ");
  openSheet(`<div class="stage">${it.type === "video" && !it.watchOnly ? `<video controls playsinline poster="${esc(it.thumb)}" src="${esc(it.preview || "")}"></video>` : `<img src="${esc(it.thumb)}" alt="">`}</div>
    <h2>${esc(it.title)}</h2>
    <dl class="kv"><dt>Library</dt><dd>${esc(SOURCES[it.source].name)} · <a href="${esc(it.page)}" target="_blank" rel="noopener">page ↗</a></dd>
      ${it.author ? `<dt>Creator</dt><dd>${esc(it.author)}</dd>` : ""}<dt>License</dt><dd><span class="lic ${it.lic}">${LIC_LABEL[it.lic]}</span> ${esc(it.license || "")}</dd></dl>
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
const bulk = { rows: [], running: false, paused: false, stop: false, project: "", pinQueue: [], pinIdx: 0 };
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
function renderBulk() {
  $("#bCountLbl").textContent = `${bulk.rows.filter(r => r.on).length} of ${bulk.rows.length} lines`;
  $("#bList").innerHTML = bulk.rows.map(r => `<li class="brow ${r.state === "done" ? "done" : r.state === "fail" ? "fail" : ["search", "score"].includes(r.state) ? "run" : ""}" data-i="${r.i}">
    <input type="checkbox" class="toggle" data-on ${r.on ? "checked" : ""} ${bulk.running ? "disabled" : ""} aria-label="Use line ${r.i + 1}"><span class="n">${r.i + 1}</span><span class="orig">${esc(r.line)}</span>
    <input class="input q" data-q value="${esc(r.q)}" ${bulk.running ? "disabled" : ""} aria-label="Search words">
    <span class="st">${r.state === "search" ? "Searching…" : r.state === "score" ? "Checking pictures…" : r.state === "fail" ? esc(r.msg) : r.picks.map(p => `<img src="${esc(p.thumb)}" alt="" data-onfail="hide">`).join("")}${r.pinCount ? `<span class="pc">+${r.pinCount} Pinterest</span>` : ""}</span></li>`).join("");
}
$("#bList").addEventListener("change", e => { const li = e.target.closest(".brow"); if (!li) return; const r = bulk.rows[+li.dataset.i];
  if (e.target.matches("[data-on]")) { r.on = e.target.checked; renderBulk(); } if (e.target.matches("[data-q]")) r.q = e.target.value.trim(); });
$("#bOpen").onclick = () => isNative ? cd.openFolder() : toast("Files are in your browser's downloads.");
$("#bPause").onclick = () => { bulk.paused = !bulk.paused; $("#bPause").textContent = bulk.paused ? "Resume" : "Pause"; };
$("#bStop").onclick = () => { bulk.stop = true; bulk.paused = false; };
const tcache = new Map();
async function analyze(it) { if (tcache.has(it.uid)) return tcache.get(it.uid); const d = await cd.thumb(https(it.thumb)); const st = d ? await analyzeImage(d).catch(() => null) : null; tcache.set(it.uid, st); return st; }
function prog(done, total, label) { $("#bProg").hidden = false; $("#bProg i").style.width = (total ? done / total * 100 : 0) + "%"; $("#bProg span").textContent = label; }
async function bulkOne(r, opts) {
  r.state = "search"; renderBulk();
  const ids = Object.keys(SOURCES).filter(id => enabledSet().has(id) && keyOK(id) && SOURCES[id].types.includes("image") && !SOURCES[id].watchOnly);
  const res = await Promise.allSettled(ids.map(id => SOURCES[id].search(r.q, "image", 1)));
  const items = res.flatMap(x => x.status === "fulfilled" ? x.value : []).filter(it => it.type === "image" && it.thumb);
  items.forEach(it => it.lic = licClass(it.license));
  if (!items.length) { r.state = "fail"; r.msg = res.every(x => x.status === "rejected") ? "Libraries unreachable" : "Nothing found"; return; }
  r.state = "score"; renderBulk();
  const best = await pickBest(items, r.q, opts, analyze);
  const pairs = [], credits = [];
  for (const x of best) { try { const v = pick(await ensureVariants(x.it), cfg.downloader.quality || "large"); if (v) { pairs.push([x.it, v]); r.picks.push({ thumb: x.it.thumb }); credits.push(`${pairs.length}. ${x.it.title} | ${x.it.author || "unknown"} | ${SOURCES[x.it.source].name} | ${x.it.license} | ${x.it.page}`); } } catch {} }
  if (!pairs.length) { r.state = "fail"; r.msg = "No downloadable files"; return; }
  const sub = subdirOf(r);
  await enqueue(pairs, (it, v, k) => ({ subdir: sub, baseName: `${k + 1} - ${it.title}`, query: r.q, bulk: bulk.project }));
  cd.bulkCredits(sub, `Line ${r.i + 1}: "${r.line}"\nSearch: ${r.q}\n${credits.join("\n")}\n`);
  r.state = "done";
}
$("#bStart").onclick = async () => {
  if (bulk.running) return;
  const todo = bulk.rows.filter(r => r.on && r.q); if (!todo.length) return toast("Tick at least one line.");
  const opts = { count: +$("#bCount").value, shape: $("#bShape").value, lic: $("#bLic").value };
  Object.assign(bulk, { running: true, paused: false, stop: false });
  $("#bStart").hidden = true; $("#bPause").hidden = $("#bStop").hidden = false; $("#bPinGo").hidden = true;
  todo.forEach(r => { r.state = "ready"; r.picks = []; }); renderBulk();
  let done = 0;
  for (const r of todo) {
    while (bulk.paused && !bulk.stop) await new Promise(res => setTimeout(res, 300));
    if (bulk.stop) break;
    prog(done, todo.length, `Line ${r.i + 1}: ${r.q}`);
    try { await bulkOne(r, opts); } catch (e) { r.state = "fail"; r.msg = e.message; }
    done++; renderBulk();
  }
  const ok = todo.filter(r => r.state === "done").length;
  prog(done, todo.length, bulk.stop ? `Stopped · ${ok} lines` : `Done · ${ok} of ${todo.length} lines`);
  bulk.running = false; $("#bStart").hidden = false; $("#bStart").textContent = "Run again"; $("#bPause").hidden = $("#bStop").hidden = true; renderBulk();
  if (ok) celebrate();
  const need = +$("#bPin").value;
  if (!bulk.stop && need && cfg.pinterest !== false) { bulk.pinQueue = todo; bulk.pinNeed = need; bulk.pinIdx = 0; $("#bPinGo").hidden = false; }
};
// Pinterest picks: the app opens Pinterest for one line at a time; you long-press pictures you like.
function pinNext() {
  const r = bulk.pinQueue[bulk.pinIdx];
  if (!r) { toast("Pinterest picks finished."); $("#bPinGo").hidden = true; return; }
  $("#bPinGo").textContent = `Pinterest: line ${bulk.pinIdx + 1} of ${bulk.pinQueue.length}`;
  cd.pinOpen({ query: r.q, subdir: subdirOf(r), need: bulk.pinNeed, label: `Line ${r.i + 1}: ${r.q}` });
  if (!isNative) { bulk.pinIdx++; }
}
$("#bPinGo").onclick = pinNext;
cd.onPinSaved(d => {   // native: {count, closed} for the line just shown
  const r = bulk.pinQueue[bulk.pinIdx]; if (!r) return;
  if (d.count != null) { r.pinCount = d.count; renderBulk(); }
  if (d.closed) { bulk.pinIdx++; if (d.next && bulk.pinIdx < bulk.pinQueue.length) pinNext(); else $("#bPinGo").textContent = bulk.pinIdx < bulk.pinQueue.length ? `Continue Pinterest: line ${bulk.pinIdx + 1} of ${bulk.pinQueue.length}` : "Pinterest picks done ✓"; }
});

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
  const d = cfg.downloader, o = (v, cur, l) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`;
  $("#ppage").innerHTML = `<div class="box"><div class="prow"><label class="lbl" for="dq">Default quality</label><select id="dq">${o("small", d.quality, "Small (≤800px)")}${o("medium", d.quality, "Medium (≤1600px)")}${o("large", d.quality, "Large (≤2560px)")}${o("original", d.quality, "Original")}</select></div>
    <div class="prow"><label class="lbl" for="fx">Comic pop-ups <input type="checkbox" class="toggle" id="fx" ${d.fx !== false ? "checked" : ""}></label></div>
    <div class="prow"><label class="lbl" for="vib">Vibrate when done <input type="checkbox" class="toggle" id="vib" ${d.sound !== false ? "checked" : ""}></label></div>
    <div class="prow"><span class="lbl">Save location</span><div class="help">${isNative ? "Download / Creator Downloader, with a folder per library or per Bulk line." : "Your browser's downloads folder."}</div></div></div>${saveBar()}`;
  $("#saveBtn").onclick = async () => { await saveSettings({ downloader: { quality: $("#dq").value, fx: $("#fx").checked, sound: $("#vib").checked } }); state.pref = cfg.downloader.quality; $("#pref").value = state.pref; toast("Saved."); };
}
function pSites() {
  const en = enabledSet();
  $("#ppage").innerHTML = `<div class="box"><h3>Libraries</h3>${Object.entries(SOURCES).map(([id, s]) => `<div class="prow"><label class="lbl" for="on_${id}">${esc(s.name)}<input type="checkbox" class="toggle" id="on_${id}" ${en.has(id) ? "checked" : ""}></label><div class="help">${esc((META[id] || {}).desc || "")}${s.key && !keyOK(id) ? " Needs a key (Connectors)." : ""}</div></div>`).join("")}</div>
    <div class="box"><h3>Pinterest</h3><div class="prow"><label class="lbl" for="pinOn">Show Pinterest buttons<input type="checkbox" class="toggle" id="pinOn" ${cfg.pinterest !== false ? "checked" : ""}></label>
    <div class="help">${isNative ? "Pinterest opens in its own screen inside the app. Sign in with your Pinterest email and password (Google sign-in doesn't work inside apps). Long-press a picture to save it." : "Opens Pinterest in a new tab."}</div>
    ${isNative ? '<button class="chip" id="pinOut" type="button" style="align-self:flex-start">Sign out of Pinterest</button>' : ""}</div></div>${saveBar()}`;
  $("#pinOut") && ($("#pinOut").onclick = async () => { await cd.pinSignOut(); toast("Signed out of Pinterest."); });
  $("#saveBtn").onclick = async () => { await saveSettings({ enabled: Object.keys(SOURCES).filter(id => $("#on_" + id).checked), pinterest: $("#pinOn").checked }); toast("Saved."); };
}
function pAbout() {
  $("#ppage").innerHTML = `<div class="box"><h3>Creator Downloader ${esc(version)}</h3><p class="help" style="padding-bottom:10px">Finds free images and videos across ${Object.keys(SOURCES).length} libraries and saves them to your phone. Every file keeps its license: “No credit” files are free to use, “Credit” files need the creator named, “Restricted” files can't be used commercially. Volt, Kitsu and Byte are original characters.</p></div>
    <div class="box"><h3>Libraries</h3>${DIRECTORY.filter(r => r[5] === "in" || r[5] === "key").map(([n, u, m, a, l]) => `<div class="prow"><span class="lbl">${esc(n)}<span class="pill">${esc(a)}</span></span><div class="help">${esc(m)} · ${esc(l)}</div></div>`).join("")}</div>`;
}

/* ---------------- toast ---------------- */
function toast(msg) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; $("#toasts").appendChild(el); setTimeout(() => el.remove(), 3200); }

/* ---------------- boot ---------------- */
(async function boot() {
  await loadSettings();
  state.pref = cfg.downloader.quality || "large"; $("#pref").value = state.pref;
  buildHome(); renderCard();
  (await cd.downloads()).forEach(j => jobs.set(j.id, j)); updateBadge();
  loadPicks();
  if (!isNative && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (isNative) document.documentElement.classList.add("native");
})();
