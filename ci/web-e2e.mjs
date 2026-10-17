// Runs the app's self-test in Chromium at phone size against the real libraries and the real AI model.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
const OUT = "ci-out-web"; fs.mkdirSync(OUT, { recursive: true });
const srv = spawn("python3", ["-m", "http.server", "8099", "-d", "www"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));
// Like the Android app (which fetches pictures natively), let the test read pictures from any site.
const browser = await chromium.launch({ args: ["--disable-web-security"] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const lines = []; let done = false;
page.on("console", async m => {
  const t = m.text();
  if (t.startsWith("ST ") || m.type() === "error") lines.push(`${m.type()}: ${t}`);
  const s = t.match(/^ST SHOT (\S+)/); if (s) await page.screenshot({ path: `${OUT}/${s[1]}.png` }).catch(() => {});
  if (t.startsWith("ST done")) done = true;
});
page.on("pageerror", e => lines.push("PAGEERROR: " + e.message));
page.on("popup", p => p.close().catch(() => {}));
let downloads = 0; page.on("download", () => downloads++);
await page.goto("http://localhost:8099/index.html?selftest=1");
const t0 = Date.now();
while (!done && Date.now() - t0 < 25 * 60e3) await new Promise(r => setTimeout(r, 1000));
lines.push(`browser downloads started: ${downloads}`);
fs.writeFileSync(`${OUT}/selftest.txt`, lines.join("\n"));
console.log(lines.filter(l => l.includes("ST ")).join("\n"));
await browser.close(); srv.kill();
