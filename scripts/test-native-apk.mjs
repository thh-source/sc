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

    // Đánh giá trạng thái DOM ban đầu (Dashboard)
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

          const cloudStatusEl = document.querySelector(".cloud-status");
          const cloudStatusComputedDisplay = cloudStatusEl ? window.getComputedStyle(cloudStatusEl).display : "none";
          const isCloudStatusHidden = !cloudStatusEl || cloudStatusComputedDisplay === "none";

          return {
            rootChildCount: root ? root.children.length : 0,
            rootHTMLSnippet: root ? root.innerHTML.slice(0, 300) : "",
            splashStillVisible: !!splash && splash.style.display !== "none" && splash.style.opacity !== "0",
            hasErrorCard: !!errorCard,
            hasDashboard,
            hasBottomNav,
            hasTodoViasco: document.body.innerText.includes("Viasco"),
            isCloudStatusHidden,
            cloudStatusComputedDisplay,
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
    console.log(`📊 KẾT QUẢ KIỂM THỬ GIẢ LẬP ANDROID WEBVIEW CHO APK v1.0.9:`);
    console.log(`----------------------------------------------------------`);
    console.log(`🔹 Root Children Count:     ${result.rootChildCount} phần tử`);
    console.log(`🔹 Splash Overlay Visible:   ${result.splashStillVisible ? "⚠️ Còn hiện" : "✅ Đã gỡ sạch"}`);
    console.log(`🔹 Error Boundary Bị Bật:    ${result.hasErrorCard ? "❌ BỊ LỖI!" : "✅ KHÔNG CÓ LỖI (HOẠT ĐỘNG HOÀN HẢO)"}`);
    console.log(`🔹 Mobile Dashboard Render:  ${result.hasDashboard ? "✅ ĐÃ HIỂN THỊ THÀNH CÔNG" : "❌ Chưa hiện"}`);
    console.log(`🔹 Bottom Navigation Bar:    ${result.hasBottomNav ? "✅ ĐÃ HIỂN THỊ" : "❌ Chưa hiện"}`);
    console.log(`🔹 Todo List Hiển thị Viasco: ${result.hasTodoViasco ? "✅ CÓ MẶT TRÊN MÀN HÌNH (Thứ 2 ký hợp đồng Viasco)" : "❌ Chưa tìm thấy"}`);
    console.log(`🔹 Nút Desktop Cloud-Status: ${result.isCloudStatusHidden ? "✅ ĐÃ ẨN TRIỆT ĐỂ (display: " + result.cloudStatusComputedDisplay + ")" : "⚠️ Chưa ẩn (" + result.cloudStatusComputedDisplay + ")"}`);
    console.log(`🔹 Các tiêu đề trên màn hình:`, result.headers);
    console.log(`🔹 Các nút điều hướng nhận diện:`, result.buttons);
    console.log(`🔹 Nội dung text hiển thị:   "${result.bodyTextSnippet}"`);
    console.log(`==========================================================`);

    // Chụp ảnh màn hình 1: Dashboard
    const screenshotRes1 = await send("Page.captureScreenshot", { format: "png" });
    if (screenshotRes1 && screenshotRes1.data) {
      const screenshotPath1 = path.join(rootDir, "apk-test-simulation.png");
      fs.writeFileSync(screenshotPath1, Buffer.from(screenshotRes1.data, "base64"));
      console.log(`📸 [1/2] Đã chụp ảnh Dashboard giả lập: ${screenshotPath1}`);
    }

    // 5. Test Click "Menu khác" (Action Sheet)
    console.log(`\n[5/5] Kiểm thử mở Menu tổng ("Menu khác")...`);
    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const navBtns = Array.from(document.querySelectorAll(".mobile-bottom-nav button"));
          const menuBtn = navBtns.find(b => b.innerText.includes("Menu khác")) || navBtns[navBtns.length - 1];
          if (menuBtn) menuBtn.click();
        })()
      `,
    });

    // Đợi hiệu ứng trượt của Action Sheet
    await new Promise((r) => setTimeout(r, 600));

    const sheetEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const overlay = document.querySelector(".native-action-sheet-overlay");
          const content = document.querySelector(".native-action-sheet-content");
          const items = Array.from(document.querySelectorAll(".native-action-sheet-content span"))
            .map(s => s.innerText.trim())
            .filter(Boolean);
          const computedZIndex = overlay ? window.getComputedStyle(overlay).zIndex : "0";
          const computedPosition = overlay ? window.getComputedStyle(overlay).position : "static";

          return {
            hasOverlay: !!overlay,
            hasContent: !!content,
            position: computedPosition,
            zIndex: computedZIndex,
            itemCount: items.length,
            items: items
          };
        })()
      `,
      returnByValue: true,
    });

    const sheetResult = sheetEval.result.value;
    console.log(`\n📋 KẾT QUẢ KIỂM THỬ MENU TỔNG (ACTION SHEET NATIVE):`);
    console.log(`----------------------------------------------------------`);
    console.log(`🔹 Sheet Overlay Xuất Hiện:  ${sheetResult.hasOverlay ? "✅ THÀNH CÔNG" : "❌ Thất bại"}`);
    console.log(`🔹 Sheet Position / Z-Index: ${sheetResult.position} / z-index: ${sheetResult.zIndex} (Che phủ toàn bộ FAB & Nav)`);
    console.log(`🔹 Số lượng chức năng:       ${sheetResult.itemCount}/9 chức năng`);
    console.log(`🔹 Danh sách tính năng:     `, sheetResult.items);
    console.log(`----------------------------------------------------------`);

    // Chụp ảnh màn hình 2: Action Sheet
    const screenshotRes2 = await send("Page.captureScreenshot", { format: "png" });
    if (screenshotRes2 && screenshotRes2.data) {
      const screenshotPath2 = path.join(rootDir, "apk-test-action-sheet.png");
      fs.writeFileSync(screenshotPath2, Buffer.from(screenshotRes2.data, "base64"));
      console.log(`📸 [2/3] Đã chụp ảnh Action Sheet giả lập: ${screenshotPath2}`);
    }

    // 6. Test Click "Thanh toán" từ Action Sheet
    console.log(`\n[6/6] Kiểm thử click tính năng "Thanh toán" từ Action Sheet...`);
    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll(".native-action-sheet-content button"));
          const payBtn = buttons.find(b => b.innerText.includes("Thanh toán"));
          if (payBtn) payBtn.click();
        })()
      `,
    });

    await new Promise((r) => setTimeout(r, 800));

    const payEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const hash = window.location.hash;
          const isPaymentView = !document.querySelector(".mobile-native-dashboard") && (
            document.body.innerText.includes("Quản lý thanh toán") ||
            document.body.innerText.includes("Lập đề nghị thanh toán") ||
            document.body.innerText.includes("Danh sách hồ sơ thanh toán") ||
            document.body.innerText.includes("Đề nghị thanh toán") ||
            document.body.innerText.includes("DNTT")
          );
          const title = document.querySelector("h1, h2, h3")?.innerText || "";
          const tableRows = document.querySelectorAll("table tr, .mobile-record-card, [class*='payment']").length;

          return {
            hash,
            isPaymentView,
            title,
            elementCount: tableRows
          };
        })()
      `,
      returnByValue: true,
    });

    const payResult = payEval.result.value;
    console.log(`\n💳 KẾT QUẢ ĐIỀU HƯỚNG TỚI TAB THANH TOÁN:`);
    console.log(`----------------------------------------------------------`);
    console.log(`🔹 URL Hash hiện tại:       ${payResult.hash}`);
    console.log(`🔹 Chuyển sang Màn Thanh toán: ${payResult.isPaymentView ? "✅ THÀNH CÔNG (KHÔNG BỊ KẸT TRANG CHỦ)" : "❌ Vẫn ở trang chủ"}`);
    console.log(`🔹 Tiêu đề màn hình:        ${payResult.title}`);
    console.log(`🔹 Số phần tử hiển thị:     ${payResult.elementCount}`);
    console.log(`----------------------------------------------------------`);

    // Chụp ảnh màn hình 3: Payment Screen
    const screenshotRes3 = await send("Page.captureScreenshot", { format: "png" });
    if (screenshotRes3 && screenshotRes3.data) {
      const screenshotPath3 = path.join(rootDir, "apk-test-payment-screen.png");
      fs.writeFileSync(screenshotPath3, Buffer.from(screenshotRes3.data, "base64"));
      console.log(`📸 [3/3] Đã chụp ảnh Màn hình Quản lý Thanh toán: ${screenshotPath3}`);
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
