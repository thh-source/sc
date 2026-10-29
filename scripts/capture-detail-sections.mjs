import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const artifactDir = "C:\\Users\\PC\\.gemini\\antigravity\\brain\\7ade713c-0491-440c-82a0-b9a14a996836";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9226;

const chromeProc = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--window-size=430,932",
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1500));
const targetsRes = await fetch(`http://localhost:${DEBUG_PORT}/json`);
const targets = await targetsRes.json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);

let msgId = 1;
const callbacks = new Map();
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id && callbacks.has(data.id)) {
    callbacks.get(data.id)(data.result);
    callbacks.delete(data.id);
  }
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    callbacks.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await new Promise((r) => (ws.onopen = r));
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 412,
  height: 915,
  deviceScaleFactor: 2,
  mobile: true,
});

await send("Page.navigate", { url: "http://localhost:8790/app.html#view=po-list" });
await new Promise((r) => setTimeout(r, 3000));

await send("Runtime.evaluate", {
  expression: "document.querySelectorAll('.m-action-btn.m-btn-primary')[0].click()",
});
await new Promise((r) => setTimeout(r, 3000));

// Scroll down to supplier section
await send("Runtime.evaluate", {
  expression: "window.scrollTo(0, 520)",
});
await new Promise((r) => setTimeout(r, 1000));

let shotSupplier = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(artifactDir, "apk-test-v112-supplier-collapsed.png"), Buffer.from(shotSupplier.data, "base64"));
console.log("Captured apk-test-v112-supplier-collapsed.png");

// Scroll further down to payments section
await send("Runtime.evaluate", {
  expression: "window.scrollTo(0, 1050)",
});
await new Promise((r) => setTimeout(r, 1000));

let shotPayments = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(artifactDir, "apk-test-v112-payments-collapsed.png"), Buffer.from(shotPayments.data, "base64"));
console.log("Captured apk-test-v112-payments-collapsed.png");

ws.close();
chromeProc.kill();
console.log("Finished!");
process.exit(0);
