import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "android", "app", "src", "main", "assets", "public");
const PORT = 8790;
const REMOTE_WORKER = "https://pnk.sc-pnk.workers.dev";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// HTML trang Studio Giả lập Điện thoại
const SIMULATOR_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Phenikaa Procurement Mobile Simulator - APK v1.1.1</title>
  <link rel="icon" href="./favicon.svg"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      height: 100vh;
      display: flex;
      overflow: hidden;
    }

    /* KHUNG ĐIỀU KHIỂN BÊN TRÁI / SIDEBAR */
    .sidebar {
      width: 420px;
      min-width: 400px;
      background: #1e293b;
      border-right: 1px solid #334155;
      display: flex;
      flex-direction: column;
      height: 100vh;
      z-index: 10;
    }

    .sidebar-header {
      padding: 18px 20px;
      background: #0f172a;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .badge-v {
      background: #0284c7;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #10b981;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.1);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 8px #10b981;
    }

    .sidebar-content {
      padding: 16px 20px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .card-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px;
    }

    .btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .btn {
      background: #334155;
      color: #f8fafc;
      border: 1px solid #475569;
      padding: 9px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn:hover { background: #475569; border-color: #64748b; }
    .btn:active { transform: scale(0.98); }
    .btn-primary { background: #0284c7; border-color: #0369a1; }
    .btn-primary:hover { background: #0369a1; }
    .btn-danger { background: #dc2626; border-color: #b91c1c; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-success { background: #16a34a; border-color: #15803d; }
    .btn-success:hover { background: #15803d; }

    /* TOGGLE SWITCH NETWORK */
    .switch-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #0f172a;
      border-radius: 8px;
      border: 1px solid #334155;
    }

    /* DEVICE SELECTOR */
    .select-input {
      width: 100%;
      background: #0f172a;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
    }

    /* CONSOLE LOG BOX */
    .log-box {
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
      height: 180px;
      overflow-y: auto;
      color: #94a3b8;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .log-entry { word-break: break-all; }
    .log-entry.warn { color: #f59e0b; }
    .log-entry.error { color: #ef4444; }
    .log-entry.info { color: #38bdf8; }

    /* KHU VỰC HIỂN THỊ ĐIỆN THOẠI (CENTER STAGE) */
    .stage {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%);
      padding: 24px;
      position: relative;
    }

    /* SMARTPHONE CHASSIS */
    .phone-chassis {
      position: relative;
      background: #090d16;
      border-radius: 48px;
      padding: 12px;
      box-shadow: 
        0 25px 60px -15px rgba(0, 0, 0, 0.9),
        0 0 0 10px #1e293b,
        0 0 0 12px #334155,
        0 0 20px rgba(2, 132, 199, 0.15);
      display: flex;
      flex-direction: column;
      transition: all 0.3s ease;
    }

    /* PUNCH HOLE CAMERA */
    .camera-notch {
      position: absolute;
      top: 22px;
      left: 50%;
      transform: translateX(-50%);
      width: 80px;
      height: 22px;
      background: #000;
      border-radius: 12px;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      pointer-events: none;
    }
    .lens {
      width: 9px;
      height: 9px;
      background: #0f172a;
      border: 1.5px solid #1e293b;
      border-radius: 50%;
    }

    /* STATUS BAR TRÊN CÙNG */
    .phone-status-bar {
      position: absolute;
      top: 14px;
      left: 28px;
      right: 28px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      z-index: 9998;
      pointer-events: none;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }

    /* SCREEN IFRAME */
    .phone-screen {
      width: 412px;
      height: 890px;
      border: 0;
      border-radius: 38px;
      background: #082f58;
      overflow: hidden;
      display: block;
    }

    /* GESTURE HOME BAR DƯỚI CÙNG */
    .phone-home-bar {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 130px;
      height: 4px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 4px;
      z-index: 9999;
      pointer-events: none;
    }
  </style>
</head>
<body>

  <!-- SIDEBAR CONTROLS -->
  <div class="sidebar">
    <div class="sidebar-header">
      <img src="./favicon.svg" width="28" height="28" alt="Logo"/>
      <div style="flex:1;">
        <div style="display:flex; align-items:center; gap:8px;">
          <h2 style="font-size: 15px; font-weight: 800;">Phenikaa APK Studio</h2>
          <span class="badge-v">v1.1.1</span>
        </div>
        <p style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">Trình Giả lập Native Android Trực Tiếp</p>
      </div>
      <div class="status-pill">
        <div class="status-dot"></div>
        Live D1
      </div>
    </div>

    <div class="sidebar-content">
      <!-- 1. KIỂM THỬ NHANH CÁC LỖI VỪA FIX -->
      <div>
        <div class="section-title">⭐ KIỂM TRA NHANH TÍNH NĂNG ĐÃ FIX</div>
        <div class="card-box" style="border-color: #0284c7; background: rgba(2,132,199,0.06);">
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-primary" onclick="jumpToPayment()" style="width:100%; justify-content:space-between;">
              <span>💳 1. Tab "Thanh toán" (Không bị kẹt Home)</span>
              <span style="font-size:11px; opacity:0.8;">#payment ➔</span>
            </button>
            <button class="btn btn-primary" onclick="jumpToTodos()" style="width:100%; justify-content:space-between;">
              <span>📋 2. Xem Todo List ("Ký HĐ Viasco")</span>
              <span style="font-size:11px; opacity:0.8;">#dashboard ➔</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. ĐIỀU HƯỚNG TỪNG PHÂN HỆ NATIVE -->
      <div>
        <div class="section-title">🧭 ĐIỀU HƯỚNG CÁC PHÂN HỆ MUA HÀNG</div>
        <div class="btn-group">
          <button class="btn" onclick="navigateToHash('dashboard')">🏠 Trang chủ</button>
          <button class="btn" onclick="navigateToHash('pr-list')">📄 Yêu cầu PR</button>
          <button class="btn" onclick="navigateToHash('approval')">📋 Đề nghị ĐNPD</button>
          <button class="btn" onclick="navigateToHash('po-list')">📑 Đơn hàng PO</button>
          <button class="btn" onclick="navigateToHash('payment')">💳 Thanh toán</button>
          <button class="btn" onclick="navigateToHash('handover')">📦 Bàn giao</button>
          <button class="btn" onclick="navigateToHash('catalog')">🏢 Danh mục</button>
          <button class="btn" onclick="navigateToHash('trash')">🗑️ Thùng rác</button>
        </div>
      </div>

      <!-- 3. MÔ PHỎNG MẠNG & OFFLINE SYNC -->
      <div>
        <div class="section-title">🌐 MÔ PHỎNG KẾT NỐI MẠNG (OFFLINE DB)</div>
        <div class="switch-wrap">
          <div>
            <div id="networkLabel" style="font-size: 13px; font-weight: 700; color: #10b981;">🟢 Đang Online (Wifi)</div>
            <div style="font-size: 11px; color: #64748b; margin-top:2px;">Tự đồng bộ Cloudflare D1</div>
          </div>
          <button id="networkBtn" class="btn btn-danger" onclick="toggleNetwork()" style="padding: 6px 12px; font-size: 12px;">
            Mất mạng (Offline)
          </button>
        </div>
      </div>

      <!-- 4. THIẾT BỊ MÔ PHỎNG -->
      <div>
        <div class="section-title">📱 KÍCH THƯỚC THIẾT BỊ DI ĐỘNG</div>
        <select class="select-input" onchange="changeDevice(this.value)">
          <option value="412,890">Samsung Galaxy S24 Ultra (412 x 890 px)</option>
          <option value="393,852">iPhone 15 Pro (393 x 852 px)</option>
          <option value="412,915">Google Pixel 8 Pro (412 x 915 px)</option>
          <option value="375,812">Màn hình nhỏ Mini (375 x 812 px)</option>
        </select>
      </div>

      <!-- 5. TÁC VỤ HỆ THỐNG -->
      <div>
        <div class="section-title">⚙️ TÁC VỤ ỨNG DỤNG</div>
        <div class="btn-group">
          <button class="btn" onclick="reloadApp()">🔄 Nạp lại App</button>
          <button class="btn" onclick="openActionSheet()">☰ Mở Menu tổng</button>
        </div>
      </div>

      <!-- 6. CONSOLE LOG TRỰC TIẾP TỪ NATIVE WEBVIEW -->
      <div style="flex:1; display:flex; flex-direction:column; min-height:160px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div class="section-title" style="margin:0;">📝 NHẬT KÝ WEBVIEW REAL-TIME</div>
          <button style="background:transparent; border:0; color:#64748b; font-size:11px; cursor:pointer;" onclick="clearLogs()">Xóa log</button>
        </div>
        <div class="log-box" id="logBox">
          <div class="log-entry info">[Native Studio] Khởi động môi trường giả lập APK v1.1.1 thành công...</div>
          <div class="log-entry info">[Engine] Nạp tệp assets từ: /android/app/src/main/assets/public</div>
        </div>
      </div>
    </div>
  </div>

  <!-- STAGE: SMARTPHONE CHASSIS & SCREEN -->
  <div class="stage">
    <div class="phone-chassis" id="phoneChassis">
      <!-- Punch Hole Camera -->
      <div class="camera-notch">
        <div class="lens"></div>
      </div>

      <!-- Status Bar -->
      <div class="phone-status-bar">
        <span id="clockTime">09:41</span>
        <div style="display:flex; align-items:center; gap:6px;">
          <span>5G</span>
          <span id="wifiIcon">📶</span>
          <span>100% 🔋</span>
        </div>
      </div>

      <!-- Live APK Webview Iframe -->
      <iframe id="appIframe" class="phone-screen" src="./app.html"></iframe>

      <!-- Virtual Gesture Bar -->
      <div class="phone-home-bar"></div>
    </div>
  </div>

  <script>
    // Đồng hồ thời gian thực
    function updateClock() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('clockTime').innerText = h + ':' + m;
    }
    setInterval(updateClock, 1000);
    updateClock();

    const iframe = document.getElementById('appIframe');
    const logBox = document.getElementById('logBox');

    function appendLog(type, msg) {
      const div = document.createElement('div');
      div.className = 'log-entry ' + (type || 'info');
      div.innerText = '[' + new Date().toLocaleTimeString() + '] ' + msg;
      logBox.appendChild(div);
      logBox.scrollTop = logBox.scrollHeight;
    }

    function clearLogs() {
      logBox.innerHTML = '';
    }

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SIMULATOR_LOG') {
        appendLog(e.data.logType, e.data.message);
      }
    });

    // 1. Chuyển đổi Online / Offline
    let isOnline = true;
    function toggleNetwork() {
      isOnline = !isOnline;
      const label = document.getElementById('networkLabel');
      const btn = document.getElementById('networkBtn');
      const wifiIcon = document.getElementById('wifiIcon');

      if (isOnline) {
        label.innerText = '🟢 Đang Online (Wifi)';
        label.style.color = '#10b981';
        btn.innerText = 'Mất mạng (Offline)';
        btn.className = 'btn btn-danger';
        wifiIcon.innerText = '📶';
        appendLog('info', 'Chuyển trạng thái mạng: ONLINE (Đang đồng bộ Cloudflare D1...)');
      } else {
        label.innerText = '🔴 Đang Mất mạng (Offline)';
        label.style.color = '#ef4444';
        btn.innerText = 'Kết nối lại (Online)';
        btn.className = 'btn btn-success';
        wifiIcon.innerText = '⚠️';
        appendLog('warn', 'Chuyển trạng thái mạng: OFFLINE (Chuyển sang lưu IndexedDB)');
      }

      try {
        iframe.contentWindow.postMessage({
          type: 'SET_SIMULATED_NETWORK',
          online: isOnline
        }, '*');
      } catch (err) {
        console.error(err);
      }
    }

    // 2. Thay đổi thiết bị mô phỏng
    function changeDevice(val) {
      const [w, h] = val.split(',').map(Number);
      iframe.style.width = w + 'px';
      iframe.style.height = h + 'px';
      appendLog('info', 'Đổi kích thước màn hình sang: ' + w + ' x ' + h + ' px');
    }

    // 3. Nạp lại App
    function reloadApp() {
      appendLog('info', 'Khởi động lại ứng dụng...');
      iframe.src = './app.html?t=' + Date.now();
    }

    // 4. Điều hướng nhanh
    function navigateToHash(viewName) {
      appendLog('info', 'Điều hướng tới view: #' + viewName);
      iframe.contentWindow.location.hash = '#view=' + viewName;
    }

    function jumpToPayment() {
      appendLog('info', 'Kiểm thử nhảy thẳng tới Quản lý Đề nghị thanh toán (#payment)...');
      navigateToHash('payment');
    }

    function jumpToTodos() {
      appendLog('info', 'Kiểm thử mở Trang chủ & cuộn tới Việc cá nhân (Todo list)...');
      navigateToHash('dashboard');
    }

    function openActionSheet() {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const navBtns = Array.from(doc.querySelectorAll('.mobile-bottom-nav button'));
        const menuBtn = navBtns.find(b => b.innerText.includes('Menu khác')) || navBtns[navBtns.length - 1];
        if (menuBtn) {
          menuBtn.click();
          appendLog('info', 'Đã bấm mở Menu tổng (Action Sheet)!');
        } else {
          appendLog('warn', 'Chưa tìm thấy nút Menu khác (Có thể app chưa nạp xong).');
        }
      } catch (e) {
        appendLog('error', 'Lỗi mở Menu: ' + e.message);
      }
    }
  </script>
</body>
</html>
`;

// Khởi chạy HTTP Server
const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  // 1. Proxy API tới Cloudflare Worker
  if (urlPath.startsWith("/api/")) {
    const targetUrl = new URL(req.url, REMOTE_WORKER);
    const proxyReq = https.request(
      targetUrl,
      {
        method: req.method,
        headers: {
          ...req.headers,
          host: targetUrl.host,
          origin: REMOTE_WORKER,
          referer: REMOTE_WORKER + "/",
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          "access-control-allow-origin": "*",
        });
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Proxy Worker Error", message: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // 2. Trang chủ Giả lập (Studio)
  if (urlPath === "/" || urlPath === "/index.html" || urlPath === "/simulator") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(SIMULATOR_HTML);
    return;
  }

  // 3. Trang chạy ứng dụng Native bên trong Iframe (/app.html)
  if (urlPath === "/app.html" || urlPath === "/app") {
    const indexPath = path.join(publicDir, "index.html");
    if (!fs.existsSync(indexPath)) {
      res.writeHead(404);
      res.end("index.html not found in assets/public");
      return;
    }

    let html = fs.readFileSync(indexPath, "utf8");

    // Tiêm Capacitor Mock vào Iframe trước thẻ <script type="module"
    const capacitorBridge = `
    <script>
      window.__IS_SIMULATED_OFFLINE__ = false;
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
          App: { addListener: () => {} },
          Network: {
            getStatus: async () => ({
              connected: !window.__IS_SIMULATED_OFFLINE__,
              connectionType: window.__IS_SIMULATED_OFFLINE__ ? 'none' : 'wifi'
            }),
            addListener: (evt, cb) => {
              window.addEventListener('simulated-network', (e) => cb(e.detail));
            }
          },
          CapacitorUpdater: {
            notifyAppReady: async () => {},
            setStatsUrl: async () => {}
          }
        }
      };

      // Nhận lệnh đổi mạng từ Studio
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'SET_SIMULATED_NETWORK') {
          window.__IS_SIMULATED_OFFLINE__ = !e.data.online;
          window.dispatchEvent(new CustomEvent('simulated-network', {
            detail: {
              connected: e.data.online,
              connectionType: e.data.online ? 'wifi' : 'none'
            }
          }));
        }
      });

      // Forward log ra ngoài Studio Panel
      const _origLog = console.log;
      const _origErr = console.error;
      const _origWarn = console.warn;
      function sendToStudio(type, args) {
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: 'SIMULATOR_LOG',
              logType: type,
              message: Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
            }, '*');
          }
        } catch {}
      }
      console.log = function() { sendToStudio('info', arguments); _origLog.apply(console, arguments); };
      console.warn = function() { sendToStudio('warn', arguments); _origWarn.apply(console, arguments); };
      console.error = function() { sendToStudio('error', arguments); _origErr.apply(console, arguments); };
    </script>
    `;

    html = html.replace("<script type=\"module\"", capacitorBridge + "\n<script type=\"module\"");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // 4. Phục vụ tài nguyên tĩnh từ thư mục APK build (assets/public)
  const relPath = urlPath.replace(/^\//, "");
  const filePath = path.join(publicDir, relPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end(`Not found: ${urlPath}`);
});

server.listen(PORT, () => {
  console.log(`==========================================================`);
  console.log(`📱 PHENIKAA PROCUREMENT APK SIMULATOR v1.1.1`);
  console.log(`----------------------------------------------------------`);
  console.log(`🔹 Server đang chạy tại:  http://localhost:${PORT}`);
  console.log(`🔹 Nạp APK Asset từ:      ${publicDir}`);
  console.log(`🔹 Cloudflare D1 Backend: ${REMOTE_WORKER}`);
  console.log(`==========================================================\n`);

  // Mở trình duyệt Chrome hoặc Edge ở chế độ App Mode độc lập
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browserBin = fs.existsSync(chromePath) ? chromePath : (fs.existsSync(edgePath) ? edgePath : null);

  if (browserBin) {
    console.log(`🚀 Đang mở cửa sổ Giả lập Điện thoại trên màn hình...`);
    spawn(browserBin, [
      `--app=http://localhost:${PORT}`,
      `--window-size=1260,980`,
      `--window-position=120,40`,
    ], { detached: true, stdio: "ignore" }).unref();
  } else {
    console.log(`👉 Hãy mở trình duyệt và truy cập: http://localhost:${PORT}`);
  }
});
