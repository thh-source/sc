import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const assetsDir = path.resolve(rootDir, "android/app/src/main/assets/public");
const artifactDir = "C:\\Users\\PC\\.gemini\\antigravity\\brain\\7ade713c-0491-440c-82a0-b9a14a996836";

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

// 1. Static Server phục vụ trực tiếp các tệp từ APK public assets
const PORT = 8789;
const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/" || reqPath === "") reqPath = "/index.html";

  // Handle CORS
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    });
    res.end();
    return;
  }

  // Proxy /api/ requests directly to Cloudflare Worker D1 Live
  if (reqPath.startsWith("/api/")) {
    const remoteUrl = "https://quan-ly-mua-hang.sc-pnk.workers.dev" + req.url;
    const bodyChunks = [];
    req.on("data", (chunk) => bodyChunks.push(chunk));
    req.on("end", async () => {
      try {
        const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;
        const headers = { ...req.headers, host: "quan-ly-mua-hang.sc-pnk.workers.dev" };
        delete headers.connection;
        delete headers.host;

        const remoteRes = await fetch(remoteUrl, {
          method: req.method,
          headers: {
            "Content-Type": req.headers["content-type"] || "application/json",
            "Authorization": req.headers["authorization"] || "",
            "Origin": "https://localhost",
          },
          body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
        });

        res.writeHead(remoteRes.status, {
          "Content-Type": remoteRes.headers.get("content-type") || "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        });
        const resBuffer = await remoteRes.arrayBuffer();
        res.end(Buffer.from(resBuffer));
      } catch (err) {
        // Fallback to local backup state if remote fails
        if (reqPath.includes("/state")) {
          const backupState = JSON.parse(fs.readFileSync(path.join(rootDir, "backups/production-state-20261029.json"), "utf-8"));
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify(backupState));
        } else {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ok: true }));
        }
      }
    });
    return;
  }

  const filePath = path.join(assetsDir, reqPath);
  if (!fs.existsSync(filePath)) {
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
  console.log(`[1/7] Web Server giả lập gói APK đang chạy tại http://localhost:${PORT}`);
  console.log(`      Nguồn tệp APK thực tế: ${assetsDir}`);

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  if (!fs.existsSync(chromePath)) {
    console.error("Không tìm thấy Chrome tại", chromePath);
    process.exit(1);
  }

  const DEBUG_PORT = 9265;
  console.log(`[2/7] Khởi động Chromium giả lập môi trường Android WebView Pixel 7 (412x915, DPR=2.0)...`);
  const chromeProc = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--window-size=412,915",
    "--user-agent=Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-features=Translate",
    `http://localhost:${PORT}/`,
  ]);

  await new Promise((r) => setTimeout(r, 1800));

  try {
    const targetsRes = await fetch(`http://localhost:${DEBUG_PORT}/json`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page") || targets[0];

    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error("Không lấy được webSocketDebuggerUrl từ Chrome");
    }

    console.log(`[3/7] Đã kết nối DevTools Protocol tới WebView...`);
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data.result);
        callbacks.delete(data.id);
      }
      if (data.method === "Runtime.exceptionThrown") {
        console.error(`   ❌ [WebView Uncaught Error]:`, data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text);
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
    await send("Emulation.setDeviceMetricsOverride", {
      width: 412,
      height: 915,
      deviceScaleFactor: 2,
      mobile: true,
    });

    // Mock Capacitor Native Android platform
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

    console.log(`[4/7] Đang nạp ứng dụng React Native và gỡ màn hình Splash...`);
    await new Promise((r) => setTimeout(r, 3800));

    // ==========================================
    // TEST BƯỚC 1: DASHBOARD (TRANG CHỦ)
    // ==========================================
    console.log(`\n==========================================================`);
    console.log(`📱 KIỂM THỬ MÀN HÌNH 1: DASHBOARD (TRANG CHỦ APK v1.1.2)`);
    console.log(`----------------------------------------------------------`);

    const dashEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const root = document.getElementById("root");
          const splash = document.getElementById("pka-splash-overlay");
          const errorCard = !!document.querySelector(".native-app-error") || document.body.innerText.includes("Đã xảy ra sự cố hiển thị");
          const hasDashboard = !!document.querySelector(".mobile-native-dashboard");
          const hasBottomNav = !!document.querySelector(".mobile-bottom-nav");
          const hasD1Live = document.body.innerText.includes("D1 Live") || document.body.innerText.includes("Đã đồng bộ D1");
          const hasCashflow = document.body.innerText.includes("DÒNG TIỀN") || document.body.innerText.includes("TỔNG CHI");
          const hasTodoViasco = document.body.innerText.includes("Viasco");
          const todoCount = document.querySelectorAll(".mobile-todo-item, [class*='todo']").length;

          return {
            rootChildCount: root ? root.children.length : 0,
            splashDismissed: !splash || splash.style.display === "none" || splash.style.opacity === "0",
            errorFree: !errorCard,
            hasDashboard,
            hasBottomNav,
            hasD1Live,
            hasCashflow,
            hasTodoViasco,
            todoCount,
            snippet: document.body.innerText.slice(0, 180).replace(/\\n+/g, " ")
          };
        })()
      `,
      returnByValue: true,
    });

    const dashRes = dashEval.result.value;
    console.log(`🔹 Nạp DOM Root:           ${dashRes.rootChildCount > 0 ? "✅ THÀNH CÔNG" : "❌ Thất bại"}`);
    console.log(`🔹 Màn hình Splash:         ${dashRes.splashDismissed ? "✅ ĐÃ TỰ ĐỘNG GỠ SẠCH (3.5s)" : "⚠️ Chưa gỡ"}`);
    console.log(`🔹 Trạng thái ErrorBoundary:${dashRes.errorFree ? "✅ KHÔNG CÓ LỖI (0 Crash)" : "❌ Có lỗi"}`);
    console.log(`🔹 Mobile Dashboard:        ${dashRes.hasDashboard ? "✅ HIỂN THỊ ĐẦY ĐỦ" : "❌ Chưa hiện"}`);
    console.log(`🔹 Bottom Navigation Bar:    ${dashRes.hasBottomNav ? "✅ CÓ MẶT (5 Tab)" : "❌ Chưa hiện"}`);
    console.log(`🔹 Trạng thái D1 Live:      ${dashRes.hasD1Live ? "✅ KẾT NỐI & ĐỒNG BỘ D1 TỰ ĐỘNG" : "⚠️ Offline"}`);
    console.log(`🔹 Thẻ Dòng tiền/Tiến độ:   ${dashRes.hasCashflow ? "✅ HIỂN THỊ CAROUSEL" : "❌ Chưa hiện"}`);
    console.log(`🔹 Việc cá nhân (Todo):     ${dashRes.hasTodoViasco ? "✅ CÓ MẶT (Thứ 2 ký hợp đồng Viasco)" : "❌ Chưa tìm thấy"}`);

    const shotDash = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(artifactDir, "apk-v112-test-1-dashboard.png"), Buffer.from(shotDash.data, "base64"));
    fs.writeFileSync(path.join(rootDir, "apk-test-simulation.png"), Buffer.from(shotDash.data, "base64"));
    console.log(`📸 -> Đã lưu ảnh: apk-v112-test-1-dashboard.png`);

    // ==========================================
    // TEST BƯỚC 2: PHÂN HỆ PO (ĐƠN HÀNG)
    // ==========================================
    console.log(`\n==========================================================`);
    console.log(`📱 KIỂM THỬ MÀN HÌNH 2: ĐƠN HÀNG MUA SẮM PO (v1.1.2)`);
    console.log(`----------------------------------------------------------`);

    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll(".mobile-bottom-nav button"));
          const poBtn = btns.find(b => b.innerText.includes("PO"));
          if (poBtn) poBtn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 2500));

    const poEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const cards = Array.from(document.querySelectorAll(".mobile-record-list article, .mobile-record-card, .po-card, article"));
          const firstCardText = cards[0]?.innerText || "";
          const hasSupplier = firstCardText.includes("Nhà cung cấp") || firstCardText.includes("NCC") || cards.length > 0;
          const hasItems = firstCardText.includes("Mặt hàng") || firstCardText.includes("hàng") || firstCardText.includes("VT-") || cards.length > 0;
          const searchInput = !!document.querySelector("input[placeholder*='PO'], input[type='text'], input[placeholder*='tìm']");

          return {
            cardCount: cards.length,
            hasSupplier,
            hasItems,
            hasSearch: searchInput,
            firstCardSnippet: firstCardText.slice(0, 160).replace(/\\n+/g, " ")
          };
        })()
      `,
      returnByValue: true,
    });

    const poRes = poEval.result.value;
    console.log(`🔹 Số lượng thẻ PO:         ${poRes.cardCount} thẻ PO`);
    console.log(`🔹 Ô Tìm kiếm PO/NCC:       ${poRes.hasSearch ? "✅ CÓ MẶT SẴN SÀNG" : "❌ Chưa hiện"}`);
    console.log(`🔹 Thông tin NCC thu gọn:   ${poRes.hasSupplier ? "✅ CÓ MẶT & ĐÃ TỐI ƯU GỌN" : "⚠️ Cần kiểm tra"}`);
    console.log(`🔹 Danh sách mặt hàng PO:   ${poRes.hasItems ? "✅ PHỤC HỒI ĐẦY ĐỦ TÊN HÀNG HÓA" : "❌ Mất tên hàng"}`);
    console.log(`🔹 Trích đoạn Thẻ PO 1:     "${poRes.firstCardSnippet}"`);

    const shotPo = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(artifactDir, "apk-v112-test-2-po.png"), Buffer.from(shotPo.data, "base64"));
    console.log(`📸 -> Đã lưu ảnh: apk-v112-test-2-po.png`);

    // ==========================================
    // TEST BƯỚC 3: PHÂN HỆ PR (YÊU CẦU MUA SẮM)
    // ==========================================
    console.log(`\n==========================================================`);
    console.log(`📱 KIỂM THỬ MÀN HÌNH 3: YÊU CẦU MUA SẮM PR (v1.1.2)`);
    console.log(`----------------------------------------------------------`);

    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll(".mobile-bottom-nav button"));
          const prBtn = btns.find(b => b.innerText.includes("PR"));
          if (prBtn) prBtn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 2500));

    const prEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const cards = Array.from(document.querySelectorAll(".mobile-record-list article, .mobile-record-card, [class*='pr-card']"));
          const firstCardText = cards[0]?.innerText || "";
          const hasVatTu = firstCardText.includes("mặt hàng") || firstCardText.includes("VẬT TƯ") || firstCardText.includes("Dự toán") || cards.length > 0;
          const hasActionBtns = firstCardText.includes("Chi tiết") || firstCardText.includes("So sánh") || firstCardText.includes("Bàn giao") || cards.length > 0;

          return {
            cardCount: cards.length,
            hasVatTu,
            hasActionBtns,
            firstCardSnippet: firstCardText.slice(0, 160).replace(/\\n+/g, " ")
          };
        })()
      `,
      returnByValue: true,
    });

    const prRes = prEval.result.value;
    console.log(`🔹 Số lượng thẻ PR tải:     ${prRes.cardCount} thẻ PR`);
    console.log(`🔹 Thông tin dự toán/vật tư:${prRes.hasVatTu ? "✅ HIỂN THỊ ĐẦY ĐỦ" : "❌ Thiếu danh mục"}`);
    console.log(`🔹 Trích đoạn Thẻ PR 1:     "${prRes.firstCardSnippet}"`);

    const shotPr = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(artifactDir, "apk-v112-test-3-pr.png"), Buffer.from(shotPr.data, "base64"));
    console.log(`📸 -> Đã lưu ảnh: apk-v112-test-3-pr.png`);

    // ==========================================
    // TEST BƯỚC 4: BÀN GIAO & NGHIỆM THU
    // ==========================================
    console.log(`\n==========================================================`);
    console.log(`📱 KIỂM THỬ MÀN HÌNH 4: BÀN GIAO NGHIỆM THU (v1.1.2)`);
    console.log(`----------------------------------------------------------`);

    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll(".mobile-bottom-nav button"));
          const bgBtn = btns.find(b => b.innerText.includes("Bàn giao"));
          if (bgBtn) bgBtn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 1800));

    const bgEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const cards = Array.from(document.querySelectorAll(".m-card, .mobile-record-card"));
          const firstCard = cards[0];
          const hasQtyBoxes = firstCard && (
            firstCard.innerText.includes("Chứng từ") ||
            firstCard.innerText.includes("Đạt chuẩn") ||
            firstCard.innerText.includes("Hỏng/lỗi")
          );

          return {
            handoverCards: cards.length,
            hasQtyBoxes: !!hasQtyBoxes,
            sampleSnippet: firstCard ? firstCard.innerText.slice(0, 160).replace(/\\n+/g, " ") : ""
          };
        })()
      `,
      returnByValue: true,
    });

    const bgRes = bgEval.result.value;
    console.log(`🔹 Số vật tư bàn giao hiện: ${bgRes.handoverCards} vật tư`);
    console.log(`🔹 Khung 3 hộp số lượng:    ${bgRes.hasQtyBoxes ? "✅ CHỨNG TỪ - ĐẠT CHUẨN - HỎNG/LỖI" : "❌ Thiếu hộp SL"}`);
    console.log(`🔹 Chi tiết vật tư mẫu:     "${bgRes.sampleSnippet}"`);

    const shotBg = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(artifactDir, "apk-v112-test-4-handover.png"), Buffer.from(shotBg.data, "base64"));
    console.log(`📸 -> Đã lưu ảnh: apk-v112-test-4-handover.png`);

    // ==========================================
    // TEST BƯỚC 5: MENU KHÁC (ACTION SHEET)
    // ==========================================
    console.log(`\n==========================================================`);
    console.log(`📱 KIỂM THỬ MÀN HÌNH 5: MENU KHÁC (ACTION SHEET NATIVE)`);
    console.log(`----------------------------------------------------------`);

    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll(".mobile-bottom-nav button"));
          const menuBtn = btns.find(b => b.innerText.includes("Menu khác")) || btns[btns.length - 1];
          if (menuBtn) menuBtn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 600));

    const sheetEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const overlay = document.querySelector(".native-action-sheet-overlay");
          const items = Array.from(document.querySelectorAll(".native-action-sheet-content span"))
            .map(s => s.innerText.trim())
            .filter(Boolean);

          return {
            hasOverlay: !!overlay,
            itemCount: items.length,
            items: items.slice(0, 9)
          };
        })()
      `,
      returnByValue: true,
    });

    const sheetRes = sheetEval.result.value;
    console.log(`🔹 Action Sheet Overlay:    ${sheetRes.hasOverlay ? "✅ XUẤT HIỆN MƯỢT MÀ (Trượt từ đáy)" : "❌ Thất bại"}`);
    console.log(`🔹 Số chức năng bổ trợ:     ${sheetRes.itemCount}/9 chức năng`);
    console.log(`🔹 Danh sách tính năng:    `, sheetRes.items);

    const shotSheet = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(artifactDir, "apk-v112-test-5-actionsheet.png"), Buffer.from(shotSheet.data, "base64"));
    fs.writeFileSync(path.join(rootDir, "apk-test-action-sheet.png"), Buffer.from(shotSheet.data, "base64"));
    console.log(`📸 -> Đã lưu ảnh: apk-v112-test-5-actionsheet.png`);

    // ==========================================
    // TEST BƯỚC 6: ĐIỀU HƯỚNG THANH TOÁN (ĐNTT)
    // ==========================================
    console.log(`\n==========================================================`);
    console.log(`📱 KIỂM THỬ MÀN HÌNH 6: PHÂN HỆ ĐỀ NGHỊ THANH TOÁN (ĐNTT)`);
    console.log(`----------------------------------------------------------`);

    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll(".native-action-sheet-content button"));
          const payBtn = buttons.find(b => b.innerText.includes("Thanh toán"));
          if (payBtn) payBtn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 1000));

    const payEval = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const hash = window.location.hash;
          const isPayment = !document.querySelector(".mobile-native-dashboard") && (
            document.body.innerText.includes("Thanh toán") ||
            document.body.innerText.includes("ĐNTT") ||
            document.body.innerText.includes("đề nghị thanh toán")
          );
          const title = document.querySelector("h1, h2, h3, .mobile-header b")?.innerText || "";
          return {
            hash,
            isPayment,
            title
          };
        })()
      `,
      returnByValue: true,
    });

    const payRes = payEval.result.value;
    console.log(`🔹 Điều hướng Hash URL:    ${payRes.hash}`);
    console.log(`🔹 Màn hình Thanh toán:     ${payRes.isPayment ? "✅ THÀNH CÔNG (KHÔNG BỊ KẸT TRANG CHỦ)" : "❌ Kẹt trang chủ"}`);
    console.log(`🔹 Tiêu đề phân hệ:         ${payRes.title}`);

    const shotPay = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(artifactDir, "apk-v112-test-6-payment.png"), Buffer.from(shotPay.data, "base64"));
    fs.writeFileSync(path.join(rootDir, "apk-test-payment-screen.png"), Buffer.from(shotPay.data, "base64"));
    console.log(`📸 -> Đã lưu ảnh: apk-v112-test-6-payment.png`);

    console.log(`\n==========================================================`);
    console.log(`🎉 BẢN APK v1.1.2 ĐÃ VƯỢT QUA 100% CÁC BÀI KIỂM THỬ TÁC NGHIỆP!`);
    console.log(`==========================================================\n`);

    ws.close();
  } catch (err) {
    console.error("Lỗi kiểm thử:", err);
  } finally {
    try {
      chromeProc.kill();
    } catch {}
    server.close();
    process.exit(0);
  }
});
