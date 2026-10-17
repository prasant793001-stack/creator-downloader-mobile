// Print products for Bulk (shared by the Android and Windows apps).
// Pick what you're printing on (T-shirt, mug, …) and how many pictures each needs. Every line of your
// text is then searched as "<line words> graphics for <product> print" (the extra words can be edited),
// and each product's pictures go into its own folder inside the line's folder.

export const PRODUCT_PRESETS = ["T-shirt", "Hoodie", "Mug", "Bottle", "Keychain", "Poster", "Sticker", "Phone case", "Tote bag", "Cap", "Pillow", "Canvas"];
export const DEFAULT_TEMPLATE = "graphics for {item} print";

// "one piece luffy" + "T-shirt" -> "one piece luffy graphics for t-shirt print"
export function phraseFor(base, item, template) {
  let t = String(template || DEFAULT_TEMPLATE).trim() || DEFAULT_TEMPLATE;
  if (!t.includes("{item}")) t += " {item}";
  return `${base} ${t.replace(/\{item\}/g, String(item).toLowerCase())}`.replace(/\s+/g, " ").trim();
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const countOpts = sel => Array.from({ length: 11 }, (_, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${i}</option>`).join("");

// state = { items: [{ name, count }], template }. onChange(state) fires on every edit.
export function mountProductPicker(root, state, onChange = () => {}) {
  state.items ||= []; state.template ||= DEFAULT_TEMPLATE;
  const sample = () => (root.dataset.sample || "one piece luffy");
  const paint = () => {
    const have = new Set(state.items.map(p => p.name.toLowerCase()));
    root.innerHTML = `
      <div class="prodhead"><b>Print products</b><small>Optional. Pick what you're printing on; each line is searched with these words added.</small></div>
      <div class="prodchips">${PRODUCT_PRESETS.filter(p => !have.has(p.toLowerCase())).map(p => `<button type="button" data-add="${esc(p)}">+ ${esc(p)}</button>`).join("")}
        <button type="button" class="custom" data-custom>+ Custom…</button></div>
      <div class="prodcustom" hidden><input class="input" maxlength="40" placeholder="Your product, e.g. Pillow cover"><button type="button" class="chipbtn" data-addcustom>Add</button></div>
      ${state.items.length ? `<ul class="prodlist">${state.items.map((p, i) => `<li><span class="pn">${esc(p.name)}</span>
        <label><span>Pictures</span><select data-count="${i}">${countOpts(p.count)}</select></label>
        <button type="button" class="x" data-del="${i}" aria-label="Remove ${esc(p.name)}">×</button></li>`).join("")}</ul>
      <label class="prodtpl"><span>Words added to each search</span><input class="input" data-tpl maxlength="80" value="${esc(state.template)}"></label>
      <p class="prodpreview">Example: “${esc(phraseFor(sample(), state.items[0].name, state.template))}”</p>` : ""}`;
  };
  root.addEventListener("click", e => {
    const a = e.target.closest("[data-add]"); if (a) { state.items.push({ name: a.dataset.add, count: 3 }); paint(); onChange(state); return; }
    if (e.target.closest("[data-custom]")) { const c = root.querySelector(".prodcustom"); c.hidden = false; c.querySelector("input").focus(); return; }
    if (e.target.closest("[data-addcustom]")) addCustom();
    const d = e.target.closest("[data-del]"); if (d) { state.items.splice(+d.dataset.del, 1); paint(); onChange(state); }
  });
  const addCustom = () => {
    const inp = root.querySelector(".prodcustom input"); const v = inp.value.replace(/\s+/g, " ").trim();
    if (!v) return;
    if (!state.items.some(p => p.name.toLowerCase() === v.toLowerCase())) state.items.push({ name: v, count: 3 });
    paint(); onChange(state);
  };
  root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest(".prodcustom")) { e.preventDefault(); addCustom(); } });
  root.addEventListener("change", e => {
    const c = e.target.closest("[data-count]"); if (c) { state.items[+c.dataset.count].count = +c.value; onChange(state); }
  });
  root.addEventListener("input", e => {
    if (e.target.matches("[data-tpl]")) { state.template = e.target.value; const pv = root.querySelector(".prodpreview"); if (pv && state.items[0]) pv.textContent = `Example: “${phraseFor(sample(), state.items[0].name, state.template)}”`; onChange(state); }
  });
  paint();
  return { repaint: paint };
}

export const PRODUCT_CSS = `
.prodbox{border:3px solid var(--outline);border-radius:14px;padding:10px 12px;margin:10px 0;background:var(--panel, #1f1640)}
.prodhead b{font:20px/1 var(--f-display);letter-spacing:.04em;color:var(--volt)}
.prodhead small{display:block;color:var(--muted);font-size:12.5px;margin-top:3px}
.prodchips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.prodchips button{border:2px solid var(--outline);background:var(--ink-2, #171032);color:var(--text);border-radius:999px;padding:6px 11px;font-weight:700;font-size:13px;cursor:pointer}
.prodchips button:hover{border-color:var(--volt)}
.prodchips .custom{background:transparent;border-style:dashed}
.prodcustom{display:flex;gap:6px;margin:0 0 8px}.prodcustom .input{flex:1}
.prodlist{list-style:none;margin:6px 0;padding:0;display:grid;gap:6px}
.prodlist li{display:flex;align-items:center;gap:8px;background:var(--ink-2, #171032);border:2px solid var(--outline);border-radius:10px;padding:6px 8px}
.prodlist .pn{flex:1;font-weight:700}
.prodlist label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.prodlist .x{border:0;background:transparent;color:var(--err, #ff5470);font-size:22px;line-height:1;cursor:pointer;padding:0 4px}
.prodtpl{display:grid;gap:4px;font-size:12px;color:var(--muted);margin-top:6px}
.prodpreview{margin:6px 0 0;font-size:12.5px;color:var(--cyan, #28e0ff)}
.brow .prodst{display:block;font-size:12px;margin-top:3px;color:var(--muted)}
`;
