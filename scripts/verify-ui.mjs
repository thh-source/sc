import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const artifactDir = "C:\\Users\\PC\\.gemini\\antigravity\\brain\\7ade713c-0491-440c-82a0-b9a14a996836";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9225;

console.log("[1] Khởi chạy Chrome Headless để kiểm thử...");
const chromeProc = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--window-size=430,932",
  "--user-agent=Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1500));

try {
  const targetsRes = await fetch(`http://localhost:${DEBUG_PORT}/json`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === "page") || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

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

  await new Promise((resolve) => (ws.onopen = resolve));

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 412,
    height: 915,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // 1. Mở trang PO List trong simulator
  console.log("[2] Điều hướng tới PO List...");
  await send("Page.navigate", { url: "http://localhost:8790/app.html#view=po-list" });
  await new Promise((r) => setTimeout(r, 3500));

  let shot1 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(artifactDir, "apk-test-v112-po-list.png"), Buffer.from(shot1.data, "base64"));
  console.log("-> Đã chụp: apk-test-v112-po-list.png");

  // 2. Chuyển sang PO Detail (Bấm nút Mở PO của thẻ đầu tiên)
  console.log("[3] Bấm nút Mở PO của đơn hàng đầu tiên...");
  const clickPoRes = await send("Runtime.evaluate", {
    expression: `
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const openBtn = btns.find(b => b.textContent.includes('Mở PO'));
        if (openBtn) {
          openBtn.click();
          return "clicked Mở PO";
        }
        return "none";
      })()
    `,
  });
  console.log("Result:", clickPoRes);
  await new Promise((r) => setTimeout(r, 3500));

  let shot3 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(artifactDir, "apk-test-v112-po-detail.png"), Buffer.from(shot3.data, "base64"));
  console.log("-> Đã chụp: apk-test-v112-po-detail.png");

  // 3. Chuyển sang PR List
  console.log("[4] Điều hướng tới PR List...");
  await send("Page.navigate", { url: "http://localhost:8790/app.html#view=prs" });
  await new Promise((r) => setTimeout(r, 3500));

  let shot2 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(artifactDir, "apk-test-v112-pr-list.png"), Buffer.from(shot2.data, "base64"));
  console.log("-> Đã chụp: apk-test-v112-pr-list.png");

  // 4. Mở modal tạo PO mới để kiểm tra ô Ghi chú chung đã được ẩn chưa
  console.log("[5] Điều hướng tới tạo PO mới...");
  await send("Page.navigate", { url: "http://localhost:8790/app.html#view=po-list" });
  await new Promise((r) => setTimeout(r, 2000));
  await send("Runtime.evaluate", {
    expression: `
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent.includes('Tạo Đơn Hàng') || b.textContent.includes('Tạo PO'));
        if (createBtn) createBtn.click();
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 1500));

  let shot4 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(artifactDir, "apk-test-v112-create-po.png"), Buffer.from(shot4.data, "base64"));
  console.log("-> Đã chụp: apk-test-v112-create-po.png");

  ws.close();
  chromeProc.kill();
  console.log("Hoàn thành kiểm thử UI!");
  process.exit(0);
} catch (err) {
  console.error("Lỗi kiểm thử UI:", err);
  chromeProc.kill();
  process.exit(1);
}
