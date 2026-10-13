// One API for the interface, two back ends:
//  - Android app: calls go to the native layer (window.AndroidCD) which does networking, downloads and Pinterest.
//  - Web (installed from the browser): plain fetch, browser downloads, Pinterest opens in a new tab.
const NATIVE = typeof window !== "undefined" && !!window.AndroidCD;
const listeners = { dl: new Set(), pin: new Set() };

/* ---------------- native transport ---------------- */
let seq = 0; const pending = new Map();
window.__cd = {
  resolve(id, json) { const p = pending.get(id); if (!p) return; pending.delete(id); try { p.res(JSON.parse(json)); } catch (e) { p.rej(e); } },
  event(name, json) { let d; try { d = JSON.parse(json); } catch { return; } (listeners[name] || []).forEach(fn => { try { fn(d); } catch {} }); }
};
function call(method, ...args) {
  return new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej });
    try { window.AndroidCD.call(id, method, JSON.stringify(args)); } catch (e) { pending.delete(id); rej(e); }
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); res(null); } }, 60000);
  });
}

/* ---------------- web fallback ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("cdm_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("cdm_" + k, JSON.stringify(v)); } catch {} }
};
const DEFAULTS = {
  profile: { name: "Creator", hero: "volt" },
  downloader: { quality: "large", fx: true, sound: true },
  search: { type: "all", lic: "all" }, enabled: null, pinterest: true
};
let webJobs = store.get("jobs", []);
const saveJobs = () => store.set("jobs", webJobs.slice(0, 300));
const emitDl = j => { saveJobs(); listeners.dl.forEach(fn => fn({ ...j })); };
async function webDownload(job) {
  job.status = "downloading"; emitDl(job);
  try {
    const r = await fetch(job.url, { mode: "cors" }); if (!r.ok) throw new Error("Server answered " + r.status);
    const total = +r.headers.get("content-length") || 0; job.total = total;
    let blob;
    if (r.body && total) {
      const rd = r.body.getReader(), parts = []; let got = 0, last = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; job.received = got; if (Date.now() - last > 300) { last = Date.now(); listeners.dl.forEach(fn => fn({ ...job })); } }
      blob = new Blob(parts, { type: r.headers.get("content-type") || "" });
    } else blob = await r.blob();
    const ext = (job.url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1] || (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const prefix = (job.subdir || []).slice(1).join(" - ");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = ((prefix ? prefix + " - " : "") + job.baseName).replace(/[\\/:*?"<>|]+/g, "").slice(0, 120) + "." + ext;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    Object.assign(job, { status: "done", total: blob.size, received: blob.size, path: a.download });
  } catch (e) {
    // host blocks direct download: open it so the person can long-press → Download
    window.open(job.url, "_blank", "noopener");
    Object.assign(job, { status: "done", error: null, opened: true, quality: (job.quality || "") + " · opened" });
  }
  emitDl(job);
}

/* ---------------- shared API ---------------- */
export const isNative = NATIVE;
export const cd = {
  json: (url, headers) => NATIVE ? call("json", url, headers || {}) :
    fetch(url, { headers: headers || {} }).then(async r => { const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, data: d, error: r.ok ? null : (d?.error?.message || d?.message || "HTTP " + r.status) }; })
      .catch(() => ({ ok: false, status: 0, error: "No connection" })),
  ping: url => NATIVE ? call("ping", url) : fetch(url).catch(() => {}),
  thumb: url => NATIVE ? call("thumb", url) :
    fetch(url, { mode: "cors" }).then(r => r.ok ? r.blob() : null).then(b => b && /^image\//.test(b.type) ? new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); }) : null).catch(() => null),
  download: async items => {
    if (NATIVE) return (await call("download", items)) || [];
    const added = items.map(it => ({ ...it, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), status: "queued", received: 0, total: 0, createdAt: Date.now() }));
    webJobs.unshift(...added); saveJobs();
    (async () => { for (const j of added) await webDownload(j); })();
    return added;
  },
  downloads: async () => NATIVE ? (await call("downloads")) || [] : webJobs,
  cancel: id => NATIVE && call("cancel", id),
  retry: id => { if (NATIVE) return call("retry", id); const j = webJobs.find(x => x.id === id); if (j) webDownload(j); },
  remove: async id => { if (NATIVE) return call("remove", id); webJobs = webJobs.filter(j => j.id !== id); saveJobs(); return webJobs; },
  clearDone: async () => { if (NATIVE) return call("clearDone"); webJobs = webJobs.filter(j => ["queued", "downloading"].includes(j.status)); saveJobs(); return webJobs; },
  open: id => NATIVE ? call("open", id) : null,
  openFolder: () => NATIVE ? call("openFolder") : null,
  onDownload: fn => { listeners.dl.add(fn); return () => listeners.dl.delete(fn); },
  onPinSaved: fn => { listeners.pin.add(fn); return () => listeners.pin.delete(fn); },
  getSettings: async () => {
    if (NATIVE) { const r = await call("getSettings"); return { settings: deep(structuredClone(DEFAULTS), r?.settings || {}), keys: r?.keys || {}, version: r?.version || "" }; }
    return { settings: deep(structuredClone(DEFAULTS), store.get("settings", {})), keys: store.get("keys", {}), version: "web" };
  },
  setSettings: async (patch, keys) => {
    if (NATIVE) { const r = await call("setSettings", patch || null, keys || null); return { settings: deep(structuredClone(DEFAULTS), r?.settings || {}), keys: r?.keys || {} }; }
    const s = deep(store.get("settings", {}), patch || {}); store.set("settings", s);
    const k = store.get("keys", {}); for (const [n, v] of Object.entries(keys || {})) { if (String(v || "").trim()) k[n] = String(v).trim(); else delete k[n]; } store.set("keys", k);
    return { settings: deep(structuredClone(DEFAULTS), s), keys: k };
  },
  external: url => NATIVE ? call("external", url) : window.open(url, "_blank", "noopener"),
  // Pinterest: native app opens its own Pinterest screen (you sign in there, long-press to save); web opens a tab.
  pinOpen: ({ query, subdir = null, need = 0, label = "" }) => NATIVE ? call("pinOpen", { query, subdir, need, label })
    : window.open("https://www.pinterest.com/search/pins/?q=" + encodeURIComponent(query || ""), "_blank", "noopener"),
  pinSignOut: () => NATIVE && call("pinSignOut"),
  bulkCredits: (subdir, text) => NATIVE ? call("bulkCredits", subdir, text) : null
};
function deep(base, add) {
  for (const k of Object.keys(add || {})) {
    if (add[k] && typeof add[k] === "object" && !Array.isArray(add[k]) && base[k] && typeof base[k] === "object") deep(base[k], add[k]);
    else base[k] = add[k];
  }
  return base;
}
