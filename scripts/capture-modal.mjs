import { spawn } from "node:child_process";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromeProc = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-port=9228",
  "--window-size=412,915",
  "http://localhost:8790/app.html#view=po-list",
]);

await new Promise((r) => setTimeout(r, 2000));
const t = await (await fetch("http://localhost:9228/json")).json();
const ws = new WebSocket(t[0].webSocketDebuggerUrl);
let id = 1,
  cbs = new Map();
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (cbs.has(d.id)) {
    cbs.get(d.id)(d.result);
    cbs.delete(d.id);
  }
};
const send = (m, p = {}) =>
  new Promise((r) => {
    const i = id++;
    cbs.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
await new Promise((r) => (ws.onopen = r));
await send("Page.enable");
await send("Runtime.enable");
await new Promise((r) => setTimeout(r, 2500));

// Click + Lập PO
await send("Runtime.evaluate", {
  expression: `Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Lập PO")).click()`,
});
await new Promise((r) => setTimeout(r, 1200));

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(
  "C:\\Users\\PC\\.gemini\\antigravity\\brain\\7ade713c-0491-440c-82a0-b9a14a996836\\apk-test-v112-create-po-modal.png",
  Buffer.from(shot.data, "base64")
);
ws.close();
chromeProc.kill();
console.log("Saved create PO modal screenshot!");
process.exit(0);
