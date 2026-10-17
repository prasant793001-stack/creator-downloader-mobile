// Small fixes for phones whose Android System WebView hasn't updated in a while.
if (!Array.prototype.at) Object.defineProperty(Array.prototype, "at", { value: function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; }, configurable: true, writable: true });
if (typeof structuredClone !== "function") window.structuredClone = v => JSON.parse(JSON.stringify(v));
window.__cdLog = [];
(function () {
  const keep = (lvl, args) => { try { window.__cdLog.push(new Date().toISOString().slice(11, 19) + " " + lvl + " " + [].map.call(args, a => a && a.stack ? a.stack.split("\n")[0] : typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ").slice(0, 400)); if (window.__cdLog.length > 300) window.__cdLog.shift(); } catch (e) {} };
  const e = console.error.bind(console), w = console.warn.bind(console);
  console.error = function () { keep("ERR", arguments); e.apply(null, arguments); };
  console.warn = function () { keep("WARN", arguments); w.apply(null, arguments); };
  window.addEventListener("error", ev => keep("ERR", [ev.message + " @" + (ev.filename || "").split("/").pop() + ":" + ev.lineno]));
  window.addEventListener("unhandledrejection", ev => keep("ERR", ["Unhandled: " + (ev.reason && ev.reason.message || ev.reason)]));
})();
