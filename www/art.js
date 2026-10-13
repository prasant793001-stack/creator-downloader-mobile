// Original art for Creator Downloader: logo + three original heroes (Volt, Kitsu, Byte).
// Drawn as SVG in a comic / anime cel style: thick ink outlines, flat fills, one shade tone, highlight sparks.
const INK = "#140b2b";

// Comic burst polygon (alternating radii) used by the logo and FX.
export function burst(cx, cy, r1, r2, n = 14, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n, r = i % 2 ? r2 : r1;
    pts.push((cx + Math.cos(a) * r).toFixed(1) + "," + (cy + Math.sin(a) * r).toFixed(1));
  }
  return pts.join(" ");
}

export const LOGO_MARK = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon points="${burst(60, 60, 58, 44, 12, 0.13)}" fill="#ffd400" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <polygon points="${burst(60, 60, 44, 36, 12, 0.39)}" fill="#ff2e88" opacity=".9"/>
  <circle cx="60" cy="60" r="30" fill="#7b3bff" stroke="${INK}" stroke-width="5"/>
  <path d="M64 30 L46 64 H58 L52 90 L76 52 H63 L70 30 Z" fill="#fff7e6" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M42 86 H78" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="44" cy="42" r="4" fill="#fff7e6"/>
</svg>`;

/* ---------------- VOLT: the download hero (masked, spiky hair, lightning cape) ---------------- */
export const VOLT = `
<svg viewBox="0 0 260 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Volt, the download hero">
  <defs>
    <pattern id="vdots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="${INK}" opacity=".22"/></pattern>
  </defs>
  <!-- cape -->
  <path d="M70 168 C40 220 30 280 22 330 L130 300 L238 330 C230 280 220 220 190 168 Z" fill="#ff2e88" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M130 300 L22 330 C30 290 38 250 56 214 Z" fill="url(#vdots)"/>
  <!-- legs -->
  <path d="M100 262 L92 326 H122 L128 270 Z M160 262 L168 326 H138 L132 270 Z" fill="#28e0ff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M88 318 H124 V334 H84 Z M136 318 H172 L176 334 H136 Z" fill="#ffd400" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <!-- torso -->
  <path d="M86 170 C84 210 90 250 100 270 H160 C170 250 176 210 174 170 C160 160 100 160 86 170 Z" fill="#28e0ff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M100 270 C92 240 88 205 90 176 L110 172 C104 205 108 240 118 270 Z" fill="${INK}" opacity=".18"/>
  <path d="M96 252 H164" stroke="${INK}" stroke-width="5"/>
  <rect x="96" y="246" width="68" height="12" fill="#ffd400" stroke="${INK}" stroke-width="4"/>
  <!-- emblem: download bolt -->
  <circle cx="130" cy="206" r="24" fill="#ffd400" stroke="${INK}" stroke-width="5"/>
  <path d="M134 188 L120 210 H130 L125 226 L142 202 H132 L137 188 Z" fill="#7b3bff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <!-- left arm down, right arm raised fist -->
  <path d="M88 176 C70 196 64 222 68 246" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
  <path d="M88 176 C70 196 64 222 68 246" fill="none" stroke="#28e0ff" stroke-width="13" stroke-linecap="round"/>
  <circle cx="68" cy="252" r="13" fill="#ffd9b8" stroke="${INK}" stroke-width="5"/>
  <path d="M172 176 C196 160 206 130 204 102" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
  <path d="M172 176 C196 160 206 130 204 102" fill="none" stroke="#28e0ff" stroke-width="13" stroke-linecap="round"/>
  <rect x="190" y="74" width="30" height="30" rx="9" fill="#ffd9b8" stroke="${INK}" stroke-width="5"/>
  <path d="M196 84 H214 M196 93 H214" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <!-- sparks around fist -->
  <path d="M226 62 L238 50 M232 80 L250 78 M212 56 L214 38" stroke="#ffd400" stroke-width="6" stroke-linecap="round"/>
  <!-- neck + head -->
  <rect x="116" y="146" width="28" height="22" fill="#ffd9b8" stroke="${INK}" stroke-width="5"/>
  <path d="M68 96 C68 52 98 30 130 30 C164 30 192 52 192 96 C192 132 166 156 130 156 C94 156 68 132 68 96 Z" fill="#ffd9b8" stroke="${INK}" stroke-width="5"/>
  <path d="M130 156 C108 156 90 146 80 128 C100 140 118 142 130 140 Z" fill="${INK}" opacity=".12"/>
  <!-- spiky anime hair -->
  <path d="M62 92 L54 58 L76 66 L72 30 L100 50 L110 10 L128 42 L150 8 L158 46 L186 22 L182 60 L208 52 L196 92 C188 66 168 56 130 56 C94 56 72 66 62 92 Z" fill="#7b3bff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M110 10 L118 40 L128 42 Z M150 8 L148 40 L158 46 Z" fill="#b48cff"/>
  <!-- mask -->
  <path d="M66 98 C80 82 106 80 130 92 C154 80 180 82 194 98 C186 112 168 118 154 114 C146 110 138 104 130 106 C122 104 114 110 106 114 C92 118 74 112 66 98 Z" fill="#ff2e88" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <!-- big anime eyes -->
  <ellipse cx="104" cy="100" rx="15" ry="13" fill="#fff"/>
  <ellipse cx="156" cy="100" rx="15" ry="13" fill="#fff"/>
  <ellipse cx="107" cy="102" rx="9" ry="10" fill="${INK}"/>
  <ellipse cx="153" cy="102" rx="9" ry="10" fill="${INK}"/>
  <circle cx="110" cy="97" r="4" fill="#fff"/><circle cx="156" cy="97" r="4" fill="#fff"/>
  <circle cx="104" cy="106" r="2" fill="#28e0ff"/><circle cx="150" cy="106" r="2" fill="#28e0ff"/>
  <!-- blush + grin -->
  <ellipse cx="88" cy="128" rx="9" ry="5" fill="#ff8fb3" opacity=".7"/>
  <ellipse cx="172" cy="128" rx="9" ry="5" fill="#ff8fb3" opacity=".7"/>
  <path d="M114 132 C122 144 140 144 148 132 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

/* ---------------- KITSU: the search scout (fox spirit ninja) ---------------- */
export const KITSU = `
<svg viewBox="0 0 260 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kitsu, the search scout">
  <!-- tails -->
  <path d="M168 250 C230 240 252 190 236 140 C226 182 200 206 160 216 Z" fill="#ff8a1f" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M236 140 C246 160 240 182 226 196 C232 176 232 158 236 140 Z" fill="#fff7e6" stroke="${INK}" stroke-width="4"/>
  <path d="M160 270 C220 286 252 256 256 220 C236 248 206 256 166 246 Z" fill="#ff8a1f" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <!-- body: ninja suit -->
  <path d="M84 178 C80 220 86 268 98 300 H162 C174 268 180 220 176 178 C160 166 100 166 84 178 Z" fill="#2a1d57" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M98 300 C90 270 86 230 88 186 L108 180 C104 220 108 266 118 300 Z" fill="#000" opacity=".2"/>
  <path d="M130 172 L130 300" stroke="#7b3bff" stroke-width="4"/>
  <rect x="88" y="240" width="84" height="14" fill="#ff2e88" stroke="${INK}" stroke-width="4"/>
  <path d="M168 248 L196 274 L186 280 L162 256 Z" fill="#ff2e88" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M98 300 L94 332 H124 L128 300 Z M162 300 L166 332 H136 L132 300 Z" fill="#2a1d57" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <!-- arm holding magnifier -->
  <path d="M86 186 C62 200 52 222 56 238" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
  <path d="M86 186 C62 200 52 222 56 238" fill="none" stroke="#2a1d57" stroke-width="13" stroke-linecap="round"/>
  <circle cx="56" cy="244" r="12" fill="#fff7e6" stroke="${INK}" stroke-width="5"/>
  <path d="M50 252 L34 278" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
  <path d="M50 252 L34 278" stroke="#ffd400" stroke-width="4" stroke-linecap="round"/>
  <circle cx="30" cy="294" r="24" fill="#ffd400" stroke="${INK}" stroke-width="5"/>
  <circle cx="30" cy="294" r="16" fill="#c9f6ff" stroke="${INK}" stroke-width="4"/>
  <path d="M20 288 C22 282 27 279 33 279" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="36" cy="300" r="2.5" fill="#fff"/>
  <!-- scarf -->
  <path d="M92 166 C110 178 150 178 168 166 L172 182 C150 192 110 192 88 182 Z" fill="#ff2e88" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M168 172 C196 168 214 150 226 128 C222 158 204 182 172 188 Z" fill="#ff2e88" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <!-- ears -->
  <path d="M74 84 L66 18 L114 58 Z" fill="#ff8a1f" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M186 84 L194 18 L146 58 Z" fill="#ff8a1f" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M78 70 L74 34 L100 58 Z M182 70 L186 34 L160 58 Z" fill="#ffd9b8"/>
  <!-- head -->
  <path d="M66 100 C66 62 96 46 130 46 C164 46 194 62 194 100 C194 128 176 150 156 158 L130 168 L104 158 C84 150 66 128 66 100 Z" fill="#ff8a1f" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M84 116 C96 112 116 118 130 132 C144 118 164 112 176 116 C172 140 152 156 130 166 C108 156 88 140 84 116 Z" fill="#fff7e6"/>
  <path d="M130 166 L122 160 H138 Z" fill="${INK}"/>
  <!-- ninja headband -->
  <path d="M68 82 C100 70 160 70 192 82 L190 96 C160 86 100 86 70 96 Z" fill="#7b3bff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <rect x="118" y="78" width="24" height="14" rx="3" fill="#ffd400" stroke="${INK}" stroke-width="3"/>
  <path d="M190 88 C206 84 220 90 230 80 C226 98 212 104 192 98 Z" fill="#7b3bff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <!-- eyes: sly anime eyes -->
  <path d="M90 110 C98 102 112 102 118 110 C110 118 98 118 90 110 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M142 110 C148 102 162 102 170 110 C162 118 150 118 142 110 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="106" cy="110" r="5.5" fill="#28a745"/><circle cx="156" cy="110" r="5.5" fill="#28a745"/>
  <circle cx="106" cy="110" r="2.5" fill="${INK}"/><circle cx="156" cy="110" r="2.5" fill="${INK}"/>
  <circle cx="108" cy="108" r="1.6" fill="#fff"/><circle cx="158" cy="108" r="1.6" fill="#fff"/>
  <path d="M120 146 C126 150 134 150 140 146" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M96 132 L80 130 M96 138 L80 140 M164 132 L180 130 M164 138 L180 140" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

/* ---------------- BYTE: the organizer (pocket mecha) ---------------- */
export const BYTE = `
<svg viewBox="0 0 260 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Byte, the organizer">
  <!-- thrusters flame -->
  <path d="M96 300 C90 320 104 336 110 340 C112 326 120 318 116 300 Z M144 300 C140 318 148 326 150 340 C156 336 170 320 164 300 Z" fill="#ffd400" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M100 302 C98 314 104 324 108 328 C108 318 112 312 110 302 Z M150 302 C150 312 152 318 152 328 C156 324 162 314 160 302 Z" fill="#ff2e88"/>
  <!-- legs/thrusters -->
  <path d="M92 270 H126 L120 304 H96 Z M134 270 H168 L164 304 H140 Z" fill="#9aa6c8" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <!-- body -->
  <rect x="70" y="170" width="120" height="104" rx="22" fill="#e8ecff" stroke="${INK}" stroke-width="5"/>
  <path d="M70 230 C70 250 80 268 100 274 H92 C78 270 70 256 70 236 Z" fill="${INK}" opacity=".15"/>
  <rect x="92" y="190" width="76" height="52" rx="10" fill="#140b2b" stroke="${INK}" stroke-width="4"/>
  <!-- chest screen: progress bar + folder -->
  <rect x="100" y="224" width="60" height="9" rx="4" fill="#2a1d57"/>
  <rect x="100" y="224" width="42" height="9" rx="4" fill="#28e0ff"/>
  <path d="M106 200 H120 L124 205 H152 V218 H106 Z" fill="#ffd400"/>
  <!-- arms -->
  <path d="M70 196 C46 196 38 214 40 234" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round"/>
  <path d="M70 196 C46 196 38 214 40 234" fill="none" stroke="#9aa6c8" stroke-width="11" stroke-linecap="round"/>
  <path d="M28 236 C28 228 52 228 52 236 L48 250 H32 Z" fill="#7b3bff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M190 196 C214 186 222 160 218 140" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round"/>
  <path d="M190 196 C214 186 222 160 218 140" fill="none" stroke="#9aa6c8" stroke-width="11" stroke-linecap="round"/>
  <!-- held folder icon -->
  <path d="M196 104 H220 L226 112 H250 V146 H196 Z" fill="#ffd400" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M214 120 V136 M206 130 L214 138 L222 130" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- neck -->
  <rect x="116" y="150" width="28" height="22" fill="#9aa6c8" stroke="${INK}" stroke-width="5"/>
  <!-- head -->
  <rect x="58" y="56" width="144" height="100" rx="30" fill="#e8ecff" stroke="${INK}" stroke-width="5"/>
  <path d="M58 116 C60 140 76 156 100 156 H88 C70 152 58 138 58 120 Z" fill="${INK}" opacity=".15"/>
  <!-- antenna -->
  <path d="M130 56 V26" stroke="${INK}" stroke-width="5"/>
  <circle cx="130" cy="22" r="10" fill="#ff2e88" stroke="${INK}" stroke-width="5"/>
  <path d="M146 18 L156 10 M148 30 L160 32" stroke="#ff2e88" stroke-width="4" stroke-linecap="round"/>
  <!-- ear bolts -->
  <rect x="44" y="90" width="16" height="32" rx="6" fill="#7b3bff" stroke="${INK}" stroke-width="4"/>
  <rect x="200" y="90" width="16" height="32" rx="6" fill="#7b3bff" stroke="${INK}" stroke-width="4"/>
  <!-- visor -->
  <rect x="74" y="74" width="112" height="62" rx="22" fill="#140b2b" stroke="${INK}" stroke-width="4"/>
  <!-- LED anime eyes -->
  <path d="M96 108 C96 92 118 92 118 108 C118 116 96 116 96 108 Z" fill="#28e0ff"/>
  <path d="M142 108 C142 92 164 92 164 108 C164 116 142 116 142 108 Z" fill="#28e0ff"/>
  <circle cx="111" cy="100" r="4" fill="#fff"/><circle cx="157" cy="100" r="4" fill="#fff"/>
  <path d="M116 124 Q130 132 144 124" stroke="#28e0ff" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M80 82 C90 78 100 78 108 80" stroke="#fff" stroke-width="3" opacity=".5" fill="none" stroke-linecap="round"/>
</svg>`;

export const HEROES = {
  volt: { name: "Volt", role: "The Downloader", line: "One click and it's yours. I fetch the file in the quality you choose and drop it straight in your folder.", svg: VOLT, color: "#ffd400" },
  kitsu: { name: "Kitsu", role: "The Scout", line: "I sniff out free images and videos across ten libraries at once, and filter out anything you can't use.", svg: KITSU, color: "#ff8a1f" },
  byte: { name: "Byte", role: "The Organizer", line: "Every file lands in a tidy folder by website, search or date, with progress you can watch.", svg: BYTE, color: "#28e0ff" }
};

// Comic sound effects for finished downloads
export const SFX = ["KA-CHUNK!", "ZAP!", "SNAG!", "BOOM!", "GOT IT!", "WHOOSH!", "YOINK!"];
