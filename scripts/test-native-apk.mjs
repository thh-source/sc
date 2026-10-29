import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const assetsDir = path.resolve(rootDir, "android/app/src/main/assets/public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// 1. Tạo Static Server phục vụ chính xác thư mục web assets của APK
const PORT = 8789;
const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/" || reqPath === "") reqPath = "/index.html";

  // Mock API nếu app gọi lúc chạy giả lập
  if (reqPath.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    if (reqPath.includes("/state")) {
      res.end(JSON.stringify({ prs: [], pos: [], quotes: {}, products: [], suppliers: [], paymentRequests: [] }));
    } else if (reqPath.includes("/todos")) {
      res.end(JSON.stringify({ todos: [] }));
    } else {
      res.end(JSON.stringify({ ok: true }));
    }
    return;
  }

  const filePath = path.join(assetsDir, reqPath);
  if (!fs.existsSync(filePath)) {
    // SPA fallback
    const fallbackPath = path.join(assetsDir, "index.html");
    if (fs.existsSync(fallbackPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(fallbackPath));
      return;
    }
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, async () => {
  console.log(`[1/5] Server giả lập WebView đang chạy tại http://localhost:${PORT}`);
  console.log(`      Phục vụ tệp APK từ: ${assetsDir}`);

  // 2. Tìm Chrome
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  if (!fs.existsSync(chromePath)) {
    console.error("Không tìm thấy Chrome tại", chromePath);
    process.exit(1);
  }

  const DEBUG_PORT = 9223;
  console.log(`[2/5] Khởi động Chromium giả lập môi trường Android WebView (390x844)...`);
  const chromeProc = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--window-size=390,844",
    "--user-agent=Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-features=Translate",
    `http://localhost:${PORT}/`,
  ]);

  // Đợi Chrome mở cổng debug
  await new Promise((r) => setTimeout(r, 1500));

  try {
    // 3. Lấy WebSocket Debug URL từ Chrome
    const targetsRes = await fetch(`http://localhost:${DEBUG_PORT}/json`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page") || targets[0];

    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error("Không lấy được webSocketDebuggerUrl từ Chrome");
    }

    console.log(`[3/5] Đã kết nối DevTools Protocol tới WebView...`);
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data.result);
        callbacks.delete(data.id);
      }
      // Ghi log console của WebView
      if (data.method === "Runtime.consoleAPICalled") {
        const text = data.params.args.map((a) => a.value || JSON.stringify(a)).join(" ");
        console.log(`   [WebView Console ${data.params.type.toUpperCase()}]: ${text}`);
      }
      if (data.method === "Runtime.exceptionThrown") {
        console.error(`   ❌ [WebView Uncaught Error]:`, data.params.exceptionDetails);
      }
    };

    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });

    await new Promise((r) => (ws.onopen = r));

    await send("Runtime.enable");
    await send("Page.enable");

    // Tiêm Capacitor mock để giả lập Android Native Platform
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.Capacitor = {
          isNativePlatform: () => true,
          getPlatform: () => 'android',
          Plugins: {
            App: { addListener: () => {} },
            Network: { getStatus: async () => ({ connected: true, connectionType: 'wifi' }), addListener: () => {} },
            CapacitorUpdater: { notifyAppReady: async () => {}, setStatsUrl: async () => {} }
          }
        };
      `,
    });

    console.log(`[4/5] Đang chờ ứng dụng nạp React và gỡ màn hình Splash...`);
    // Đợi 4 giây để React render và dismiss splash
    await new Promise((r) => setTimeout(r, 4000));

    // Đánh giá trạng thái DOM
    const evalRes = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const root = document.getElementById("root");
          const splash = document.getElementById("pka-splash-overlay");
          const errorCard = document.querySelector(".native-app-error") || document.body.innerText.includes("Đã xảy ra sự cố hiển thị");
          const hasDashboard = !!document.querySelector(".mobile-native-dashboard");
          const hasBottomNav = !!document.querySelector(".mobile-bottom-nav");
          const headers = Array.from(document.querySelectorAll("h1, h2, h3")).map(h => h.innerText);
          const buttons = Array.from(document.querySelectorAll("button, nav button b")).map(b => b.innerText.trim()).filter(Boolean);

          return {
            rootChildCount: root ? root.children.length : 0,
            rootHTMLSnippet: root ? root.innerHTML.slice(0, 300) : "",
            splashStillVisible: !!splash && splash.style.display !== "none" && splash.style.opacity !== "0",
            hasErrorCard: !!errorCard,
            hasDashboard,
            hasBottomNav,
            headers: headers.slice(0, 5),
            buttons: buttons.slice(0, 10),
            bodyTextSnippet: document.body.innerText.slice(0, 250).replace(/\\n+/g, " ")
          };
        })()
      `,
      returnByValue: true,
    });

    const result = evalRes.result.value;
    console.log(`\n==========================================================`);
    console.log(`📊 KẾT QUẢ KIỂM THỬ GIẢ LẬP ANDROID WEBVIEW CHO APK v1.0.8:`);
    console.log(`----------------------------------------------------------`);
    console.log(`🔹 Root Children Count:     ${result.rootChildCount} phần tử`);
    console.log(`🔹 Splash Overlay Visible:   ${result.splashStillVisible ? "⚠️ Còn hiện" : "✅ Đã gỡ sạch"}`);
    console.log(`🔹 Error Boundary Bị Bật:    ${result.hasErrorCard ? "❌ BỊ LỖI!" : "✅ KHÔNG CÓ LỖI (HOẠT ĐỘNG HOÀN HẢO)"}`);
    console.log(`🔹 Mobile Dashboard Render:  ${result.hasDashboard ? "✅ ĐÃ HIỂN THỊ THÀNH CÔNG" : "❌ Chưa hiện"}`);
    console.log(`🔹 Bottom Navigation Bar:    ${result.hasBottomNav ? "✅ ĐÃ HIỂN THỊ" : "❌ Chưa hiện"}`);
    console.log(`🔹 Các tiêu đề trên màn hình:`, result.headers);
    console.log(`🔹 Các nút điều hướng nhận diện:`, result.buttons);
    console.log(`🔹 Nội dung text hiển thị:   "${result.bodyTextSnippet}"`);
    console.log(`==========================================================`);

    // Chụp ảnh màn hình lưu lại
    const screenshotRes = await send("Page.captureScreenshot", { format: "png" });
    if (screenshotRes && screenshotRes.data) {
      const screenshotPath = path.join(rootDir, "apk-test-simulation.png");
      fs.writeFileSync(screenshotPath, Buffer.from(screenshotRes.data, "base64"));
      console.log(`📸 Đã chụp ảnh màn hình giả lập thực tế: ${screenshotPath}`);
    }

    ws.close();
  } catch (err) {
    console.error("Lỗi kiểm thử giả lập:", err);
  } finally {
    try {
      chromeProc.kill();
    } catch {}
    server.close();
    process.exit(0);
  }
});
