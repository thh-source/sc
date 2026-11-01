import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9259;
const artifactDir = "C:\\Users\\PC\\.gemini\\antigravity\\brain\\7ade713c-0491-440c-82a0-b9a14a996836";

const chromeProc = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--window-size=1440,900",
  "about:blank",
]);
await new Promise((r) => setTimeout(r, 1500));

const targets = await (await fetch(`http://localhost:${DEBUG_PORT}/json`)).json();
const pageTarget = targets.find((t) => t.type === "page") || targets[0];
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

let id = 1;
const cb = new Map();
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.id && cb.has(d.id)) {
    cb.get(d.id)(d.result);
    cb.delete(d.id);
  }
};
function send(m, p = {}) {
  return new Promise((r) => {
    const i = id++;
    cb.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
}
await new Promise((r) => (ws.onopen = r));
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Network.setCookie", {
  name: "mh_session",
  value: "test_token_settings_download_12345",
  domain: "pnk.sc-pnk.workers.dev",
  path: "/",
  httpOnly: true,
  secure: true,
});

// Chụp Desktop PO
await send("Page.navigate", { url: "https://pnk.sc-pnk.workers.dev/#po-list" });
await new Promise((r) => setTimeout(r, 4000));
let shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(artifactDir, "web-desktop-po-rollback.png"), Buffer.from(shot.data, "base64"));
console.log("✓ Đã chụp: web-desktop-po-rollback.png");

// Chụp Desktop PR
await send("Runtime.evaluate", {
  expression: `(function() {
    const btn = Array.from(document.querySelectorAll('aside nav button')).find(b => b.textContent && b.textContent.includes('Yêu cầu'));
    if (btn) btn.click();
  })()`,
});
await new Promise((r) => setTimeout(r, 2000));
shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(artifactDir, "web-desktop-pr-rollback.png"), Buffer.from(shot.data, "base64"));
console.log("✓ Đã chụp: web-desktop-pr-rollback.png");

ws.close();
chromeProc.kill();
console.log("Hoàn tất kiểm tra desktop web!");
