/**
 * Hệ thống Trợ lý Mua hàng Toàn diện trên Telegram (SCMH Assistant - @Pnksc_bot)
 * Điều hành trọn vẹn 8 luồng nghiệp vụ mua sắm:
 * 1. PR (Yêu cầu mua sắm)
 * 2. PO (Đơn đặt hàng & Theo dõi trễ hẹn)
 * 3. Chào giá & Lịch sử giá (777+ dữ liệu)
 * 4. Nhà cung cấp & STK
 * 5. Giao nhận nhập kho (BBBG)
 * 6. Thanh toán ĐNTT & Công nợ
 * 7. Sổ tay công việc cá nhân (Todo list D1)
 * 8. Báo cáo tài chính & Nạp chứng từ R2
 */

export const TELEGRAM_BOT_TOKEN_FALLBACK = "9070832704:AAG4_wVrNaKj87Z8iaM3kYg-Cnp_ClbPH50";
export const MASTER_WORKSPACE_ID = "b7f7f770-898b-4e2d-983f-9e640a42950d";
export const MASTER_STATE_KEY = `procurement:${MASTER_WORKSPACE_ID}`;
export const BASE_WEB_URL = "https://pnk.sc-pnk.workers.dev";

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  first_name?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// -------------------------------------------------------------
// TELEGRAM API CLIENT HELPERS
// -------------------------------------------------------------

export function getBotToken(env?: any): string {
  return env?.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN_FALLBACK;
}

export async function callTelegramApi(
  method: string,
  payload: Record<string, any>,
  token: string
): Promise<any> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json();
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options: {
    replyMarkup?: any;
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    disableWebPreview?: boolean;
  } = {},
  token: string
) {
  return await callTelegramApi(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode ?? "HTML",
      reply_markup: options.replyMarkup,
      disable_web_page_preview: options.disableWebPreview ?? true,
    },
    token
  );
}

export async function editTelegramMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  options: {
    replyMarkup?: any;
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  } = {},
  token: string
) {
  return await callTelegramApi(
    "editMessageText",
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parseMode ?? "HTML",
      reply_markup: options.replyMarkup,
      disable_web_page_preview: true,
    },
    token
  );
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
  token: string = TELEGRAM_BOT_TOKEN_FALLBACK
) {
  return await callTelegramApi(
    "answerCallbackQuery",
    {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    },
    token
  );
}

export async function downloadTelegramFile(fileId: string, token: string): Promise<{
  buffer: ArrayBuffer;
  filePath: string;
} | null> {
  const fileRes = await callTelegramApi("getFile", { file_id: fileId }, token);
  if (!fileRes.ok || !fileRes.result?.file_path) {
    console.error("Không lấy được đường dẫn file từ Telegram:", fileRes);
    return null;
  }
  const filePath = fileRes.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const resp = await fetch(downloadUrl);
  if (!resp.ok) {
    console.error("Lỗi tải file từ Telegram CDN:", resp.statusText);
    return null;
  }
  const buffer = await resp.arrayBuffer();
  return { buffer, filePath };
}

// -------------------------------------------------------------
// DATABASE & STORAGE HELPERS
// -------------------------------------------------------------

export async function ensureTelegramTables(db: any) {
  if (!db) return;
  const queries = [
    `CREATE TABLE IF NOT EXISTS telegram_subscribers (
      chat_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );`,
    `CREATE TABLE IF NOT EXISTS telegram_pending_files (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      object_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL,
      owner_user_id TEXT,
      document_type TEXT,
      expires_at TEXT,
      status TEXT,
      note TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS personal_todos (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'admin',
      content TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      is_priority INTEGER DEFAULT 0,
      tags TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0
    );`,
  ];
  for (const q of queries) {
    try {
      await db.prepare(q).run();
    } catch (e) {
      console.warn("Lỗi tạo bảng telegram:", e);
    }
  }
}

export async function saveSubscriber(db: any, user: TelegramUser, chatId: number | string) {
  if (!db) return;
  try {
    await ensureTelegramTables(db);
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO telegram_subscribers (chat_id, username, first_name, created_at, updated_at, active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(chat_id) DO UPDATE SET
           username = excluded.username,
           first_name = excluded.first_name,
           updated_at = excluded.updated_at,
           active = 1;`
      )
      .bind(String(chatId), user.username || "", user.first_name || "Nhân viên Mua hàng", now, now)
      .run();
  } catch (e) {
    console.error("Lỗi lưu subscriber telegram:", e);
  }
}

export async function getActiveSubscribers(db: any): Promise<string[]> {
  if (!db) return [];
  try {
    await ensureTelegramTables(db);
    const rows = await db
      .prepare("SELECT chat_id FROM telegram_subscribers WHERE active = 1")
      .all();
    return (rows.results || []).map((r: any) => String(r.chat_id));
  } catch (e) {
    console.error("Lỗi lấy danh sách subscribers:", e);
    return [];
  }
}

export async function getMasterAppState(db: any): Promise<any> {
  if (!db) return null;
  try {
    let row = await db
      .prepare("SELECT payload FROM app_state WHERE id = ?")
      .bind(MASTER_STATE_KEY)
      .first<{ payload: string }>();

    if (!row || !row.payload) {
      row = await db
        .prepare("SELECT payload FROM app_state WHERE id = 'procurement'")
        .first<{ payload: string }>();
    }

    if (row && row.payload) {
      return JSON.parse(row.payload);
    }
  } catch (e) {
    console.error("Lỗi đọc master app_state:", e);
  }
  return null;
}

export async function saveMasterAppState(db: any, payloadObj: any): Promise<boolean> {
  if (!db) return false;
  try {
    const serialized = JSON.stringify(payloadObj);
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE app_state SET payload = ?, updated_at = ?, version = version + 1 WHERE id = ?`
      )
      .bind(serialized, now, MASTER_STATE_KEY)
      .run();
    return true;
  } catch (e) {
    console.error("Lỗi lưu master app_state:", e);
    return false;
  }
}

// -------------------------------------------------------------
// FORMATTING HELPERS
// -------------------------------------------------------------

export function formatVND(val: number | string | undefined | null): string {
  const n = Number(val) || 0;
  return n.toLocaleString("vi-VN") + " đ";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseDateIso(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
  const vnMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (vnMatch) return new Date(`${vnMatch[3]}-${vnMatch[2].padStart(2, "0")}-${vnMatch[1].padStart(2, "0")}`);
  return null;
}

// -------------------------------------------------------------
// LUỒNG 1: BẢN TIN NHẮC VIỆC & ĐIỂM TIN SÁNG (08:30)
// -------------------------------------------------------------

export function buildDailyBriefingMessage(data: any): { text: string; markup: any } {
  const today = new Date();
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const vnDateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const paymentRequests: any[] = Array.isArray(data?.paymentRequests) ? data.paymentRequests : [];
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];
  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];
  const suppliers: any[] = Array.isArray(data?.suppliers) ? data.suppliers : [];

  const suppMap = new Map<number, string>();
  suppliers.forEach((s) => {
    if (s.id) suppMap.set(Number(s.id), s.name || s.code || "");
  });

  // 1. Quét ĐNTT chưa thanh toán
  const pendingPayments = paymentRequests.filter((p) => {
    const isCompleted = p.is_paid || p.status === "paid" || p.status === "completed";
    return !isCompleted;
  });

  // 2. Quét PO trễ hẹn giao & hẹn giao hôm nay
  const pendingPOs = pos.filter((po) => {
    const status = (po.status || "").toLowerCase();
    return !status.includes("hoàn thành") && !status.includes("đã giao") && !status.includes("hủy");
  });

  const overduePOs: any[] = [];
  const dueTodayPOs: any[] = [];

  pendingPOs.forEach((po) => {
    const d = parseDateIso(po.expectedDate);
    if (!d) return;
    const diffDays = Math.round((d.getTime() - todayZero.getTime()) / (1000 * 3600 * 24));
    if (diffDays < 0) overduePOs.push(po);
    else if (diffDays === 0) dueTodayPOs.push(po);
  });

  // 3. PR chưa hoàn thành
  const pendingPRs = prs.filter((pr) => !pr.isCompleted && (pr.status || "") !== "Hoàn thành");

  let msg = `☕ <b>BẢN TIN MUA HÀNG HÔM NAY (${vnDateStr})</b>\n`;
  msg += `─────────────────────────\n\n`;

  // Cảnh báo trễ hạn PO nếu có (ưu tiên số 1)
  if (overduePOs.length > 0) {
    msg += `🚨 <b>CẢNH BÁO: CÓ ${overduePOs.length} ĐƠN PO TRỄ HẸN GIAO:</b>\n`;
    overduePOs.slice(0, 3).forEach((po) => {
      const sName = escapeHtml(suppMap.get(Number(po.supplierId)) || "NCC");
      msg += `• <b>#${escapeHtml(po.number)}</b> (${sName}) - Hẹn ngày: <code>${po.expectedDate}</code>\n`;
    });
    msg += `👉 <i>Gõ <code>/trehen</code> để kiểm tra và gọi nhắc nhà cung cấp.</i>\n\n`;
  }

  // Đơn hàng hẹn giao hôm nay
  msg += `📦 <b>TIẾN ĐỘ HÀNG VỀ (PO):</b>\n`;
  if (dueTodayPOs.length === 0) {
    msg += `• Hôm nay không có đơn hẹn giao.\n`;
    if (pendingPOs.length > 0) {
      msg += `• Hiện có <b>${pendingPOs.length} đơn PO</b> đang trong tiến trình giao hàng.\n\n`;
    } else {
      msg += `\n`;
    }
  } else {
    dueTodayPOs.forEach((po, idx) => {
      const sName = escapeHtml(suppMap.get(Number(po.supplierId)) || "NCC");
      msg += `${idx + 1}. <b>#${escapeHtml(po.number)}</b> - ${sName}\n`;
    });
    msg += `\n`;
  }

  // Đề nghị thanh toán (ĐNTT)
  msg += `💳 <b>HẠN THANH TOÁN (ĐNTT):</b>\n`;
  if (pendingPayments.length === 0) {
    msg += `• <i>Hiện không có khoản ĐNTT nào tồn đọng.</i>\n\n`;
  } else {
    pendingPayments.slice(0, 3).forEach((p, idx) => {
      const payee = escapeHtml(p.payee_name || "Nhà cung cấp");
      const amount = formatVND(p.total_amount || p.amount);
      const invoice = p.invoice_no ? ` (HĐ: ${escapeHtml(p.invoice_no)})` : "";
      msg += `${idx + 1}. <b>${payee}</b>: <code>${amount}</code>${invoice}\n`;
    });
    if (pendingPayments.length > 3) {
      msg += `• <i>Và còn ${pendingPayments.length - 3} khoản ĐNTT khác cần chi trả.</i>\n`;
    }
    msg += `👉 <i>Gõ <code>/dntt</code> để xem toàn bộ danh sách thanh toán.</i>\n\n`;
  }

  // Phiếu yêu cầu PR
  msg += `📋 <b>PHIẾU YÊU CẦU PR:</b>\n`;
  msg += `• Đang có <b>${pendingPRs.length} PR</b> đang chờ xử lý / tìm báo giá.\n\n`;

  msg += `─────────────────────────\n`;
  msg += `💡 <i>Bấm các nút bên dưới hoặc gõ lệnh để thao tác nhanh!</i>`;

  const markup = {
    inline_keyboard: [
      [
        { text: "🚨 Đơn trễ hẹn", callback_data: "cmd:trehen" },
        { text: "💳 Khoản cần TT", callback_data: "cmd:dntt" },
      ],
      [
        { text: "📋 PR chờ mua", callback_data: "cmd:pr_cho" },
        { text: "📦 Đơn chờ giao", callback_data: "cmd:po_chogiao" },
      ],
      [
        { text: "📝 Việc cần làm", callback_data: "cmd:todos" },
        { text: "📊 Báo cáo tháng", callback_data: "cmd:baocao" },
      ],
      [{ text: "🌐 Mở Web Quản Lý SCMH", url: BASE_WEB_URL }],
    ],
  };

  return { text: msg, markup };
}

// -------------------------------------------------------------
// LUỒNG 2: QUẢN LÝ YÊU CẦU MUA HÀNG (PR)
// -------------------------------------------------------------

export function handlePrLookup(keyword: string, data: any): { text: string; markup?: any } {
  const clean = keyword.trim().replace(/^(\/pr|pr|tiến độ|phiếu)\s*/i, "").trim().toLowerCase();
  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];

  if (!clean) {
    const latest = prs.slice(-4).reverse();
    let msg = `📋 <b>DANH SÁCH PR GẦN ĐÂY:</b>\n`;
    msg += `─────────────────────────\n`;
    latest.forEach((p, idx) => {
      const status = p.isCompleted ? "✅ Hoàn thành" : `⏳ ${p.status || "Đang xử lý"}`;
      msg += `${idx + 1}. <b>#${escapeHtml(p.number)}</b> (${escapeHtml(p.department || "---")}) - ${status}\n`;
    });
    msg += `\n💡 <i>Gõ <code>/pr &lt;mã PR&gt;</code> (vd: <code>/pr ${latest[0]?.number || "QC261106.2"}</code>) để xem chi tiết!</i>`;
    return { text: msg };
  }

  const match = prs.find((p) => {
    const num = (p.number || "").toLowerCase();
    const id = String(p.id);
    return num.includes(clean) || id === clean;
  });

  if (!match) {
    return {
      text: `🔍 <b>Không tìm thấy phiếu PR nào khớp với mã: "${escapeHtml(clean)}"</b>\n\n💡 <i>Gõ <code>/pr_cho</code> để xem danh sách các PR đang chờ xử lý.</i>`,
    };
  }

  const items: any[] = Array.isArray(match.items) ? match.items : [];
  const statusStr = match.isCompleted ? "✅ Hoàn thành" : `⏳ ${match.status || "Đang xử lý"}`;

  let msg = `📋 <b>CHI TIẾT PHIẾU YÊU CẦU PR #${escapeHtml(match.number)}</b>\n`;
  msg += `─────────────────────────\n`;
  msg += `• <b>Bộ phận:</b> ${escapeHtml(match.department || "Chưa rõ")}\n`;
  msg += `• <b>Ngày lập:</b> ${escapeHtml(match.date || "---")}\n`;
  msg += `• <b>Mục đích:</b> ${escapeHtml(match.purpose || "---")}\n`;
  msg += `• <b>Trạng thái:</b> <b>${statusStr}</b>\n`;
  if (match.note) msg += `• <b>Ghi chú:</b> ${escapeHtml(match.note)}\n`;

  if (items.length > 0) {
    msg += `\n📦 <b>Danh sách mặt hàng (${items.length}):</b>\n`;
    items.slice(0, 6).forEach((it, idx) => {
      const q = it.qty ? ` - SL: <b>${it.qty} ${escapeHtml(it.unit || "")}</b>` : "";
      msg += `${idx + 1}. ${escapeHtml(it.name)}${q}\n`;
    });
    if (items.length > 6) {
      msg += `• <i>Và còn ${items.length - 6} mặt hàng khác...</i>\n`;
    }
  }

  msg += `─────────────────────────\n`;

  const buttons: any[] = [];
  const row1: any[] = [{ text: "🌐 Mở trên Web", url: BASE_WEB_URL }];
  if (match.scan_file_url) {
    const scanFullUrl = match.scan_file_url.startsWith("http")
      ? match.scan_file_url
      : `${BASE_WEB_URL}${match.scan_file_url}`;
    row1.push({ text: "📄 Xem bản scan PR", url: scanFullUrl });
  }
  buttons.push(row1);

  return { text: msg, markup: { inline_keyboard: buttons } };
}

export function handlePendingPrs(data: any): { text: string; markup?: any } {
  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];
  const pending = prs.filter((p) => !p.isCompleted && (p.status || "") !== "Hoàn thành");

  if (pending.length === 0) {
    return {
      text: `🎉 <b>Tuyệt vời! Hiện không có phiếu PR nào tồn đọng chờ mua.</b>\n\nTất cả các yêu cầu mua sắm đều đã hoàn thành.`,
    };
  }

  let msg = `📋 <b>DANH SÁCH PR ĐANG CHỜ XỬ LÝ (${pending.length} phiếu):</b>\n`;
  msg += `─────────────────────────\n`;

  pending.slice(0, 8).forEach((p, idx) => {
    const dept = escapeHtml(p.department || "Khối");
    const count = Array.isArray(p.items) ? p.items.length : 0;
    const purpose = p.purpose ? ` - <i>${escapeHtml(p.purpose)}</i>` : "";
    msg += `${idx + 1}. <b>#${escapeHtml(p.number)}</b> (${dept}) [${count} món]${purpose}\n`;
  });

  if (pending.length > 8) {
    msg += `\n• <i>Và còn ${pending.length - 8} phiếu PR khác...</i>\n`;
  }

  msg += `─────────────────────────\n`;
  msg += `💡 <i>Gõ <code>/pr &lt;mã PR&gt;</code> để xem chi tiết từng phiếu.</i>`;

  return {
    text: msg,
    markup: {
      inline_keyboard: [[{ text: "🌐 Mở Web SCMH", url: BASE_WEB_URL }]],
    },
  };
}

// -------------------------------------------------------------
// LUỒNG 3: QUẢN LÝ ĐƠN HÀNG (PO) & BÁO CÁO TRỄ HẸN GIAO
// -------------------------------------------------------------

export function handlePoLookup(keyword: string, data: any): { text: string; markup?: any } {
  const clean = keyword.trim().replace(/^(\/po|po|đơn hàng)\s*/i, "").trim().toLowerCase();
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];
  const suppliers: any[] = Array.isArray(data?.suppliers) ? data.suppliers : [];
  const suppMap = new Map<number, string>();
  suppliers.forEach((s) => {
    if (s.id) suppMap.set(Number(s.id), s.name || s.code || "");
  });

  if (!clean) {
    const latest = pos.slice(-4).reverse();
    let msg = `📑 <b>DANH SÁCH ĐƠN HÀNG PO GẦN ĐÂY:</b>\n`;
    msg += `─────────────────────────\n`;
    latest.forEach((p, idx) => {
      const sName = escapeHtml(suppMap.get(Number(p.supplierId)) || "NCC");
      msg += `${idx + 1}. <b>#${escapeHtml(p.number)}</b> (${sName}) - <b>${escapeHtml(p.status || "Đang xử lý")}</b>\n`;
    });
    msg += `\n💡 <i>Gõ <code>/po &lt;mã PO&gt;</code> để xem chi tiết đơn hàng!</i>`;
    return { text: msg };
  }

  const match = pos.find((p) => {
    const num = (p.number || "").toLowerCase();
    const id = String(p.id);
    return num.includes(clean) || id === clean;
  });

  if (!match) {
    return {
      text: `🔍 <b>Không tìm thấy đơn hàng nào khớp với mã PO: "${escapeHtml(clean)}"</b>\n\n💡 <i>Gõ <code>/po_chogiao</code> để xem các đơn PO đang thực hiện.</i>`,
    };
  }

  const sName = escapeHtml(suppMap.get(Number(match.supplierId)) || "Chưa chọn NCC");
  const items: any[] = Array.isArray(match.items) ? match.items : [];

  let totalAmount = 0;
  items.forEach((it) => {
    const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
    const vat = Number(it.vatRate) || 0;
    totalAmount += Math.round(sub * (1 + vat / 100));
  });

  let msg = `📑 <b>CHI TIẾT ĐƠN HÀNG PO #${escapeHtml(match.number)}</b>\n`;
  msg += `─────────────────────────\n`;
  msg += `• <b>Nhà cung cấp:</b> <b>${sName}</b>\n`;
  msg += `• <b>Ngày đặt hàng:</b> ${escapeHtml(match.createdDate || "---")}\n`;
  msg += `• <b>Hẹn giao hàng:</b> <b>${escapeHtml(match.expectedDate || "Chưa có")}</b>\n`;
  msg += `• <b>Trạng thái:</b> <b>${escapeHtml(match.status || "Đang thực hiện")}</b>\n`;
  msg += `• <b>Tổng giá trị đơn:</b> <code>${formatVND(totalAmount)}</code>\n`;
  if (match.note) msg += `• <b>Ghi chú:</b> ${escapeHtml(match.note)}\n`;

  if (items.length > 0) {
    msg += `\n📦 <b>Mặt hàng (${items.length}):</b>\n`;
    items.slice(0, 5).forEach((it, idx) => {
      const delStatus = it.deliveryStatus ? ` [${escapeHtml(it.deliveryStatus)}]` : "";
      msg += `${idx + 1}. ${escapeHtml(it.name)} - SL: ${it.qty} ${escapeHtml(it.unit || "")}${delStatus}\n`;
    });
    if (items.length > 5) {
      msg += `• <i>Và còn ${items.length - 5} mặt hàng khác...</i>\n`;
    }
  }

  msg += `─────────────────────────\n`;

  return {
    text: msg,
    markup: {
      inline_keyboard: [[{ text: "🌐 Mở Web SCMH", url: BASE_WEB_URL }]],
    },
  };
}

export function handlePendingPos(data: any): { text: string; markup?: any } {
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];
  const suppliers: any[] = Array.isArray(data?.suppliers) ? data.suppliers : [];
  const suppMap = new Map<number, string>();
  suppliers.forEach((s) => {
    if (s.id) suppMap.set(Number(s.id), s.name || s.code || "");
  });

  const pending = pos.filter((po) => {
    const status = (po.status || "").toLowerCase();
    return !status.includes("hoàn thành") && !status.includes("đã giao") && !status.includes("hủy");
  });

  if (pending.length === 0) {
    return {
      text: `🎉 <b>Hiện tại không có đơn hàng PO nào đang chờ giao.</b>`,
    };
  }

  let msg = `📦 <b>DANH SÁCH ĐƠN PO ĐANG CHỜ GIAO HÀNG (${pending.length} đơn):</b>\n`;
  msg += `─────────────────────────\n`;

  pending.slice(0, 8).forEach((po, idx) => {
    const sName = escapeHtml(suppMap.get(Number(po.supplierId)) || "NCC");
    const exp = po.expectedDate ? ` (Hẹn: ${escapeHtml(po.expectedDate)})` : "";
    msg += `${idx + 1}. <b>#${escapeHtml(po.number)}</b> - ${sName}${exp}\n`;
  });

  if (pending.length > 8) {
    msg += `\n• <i>Và còn ${pending.length - 8} đơn khác...</i>\n`;
  }

  msg += `─────────────────────────\n`;
  msg += `💡 <i>Gõ <code>/trehen</code> để kiểm tra đơn nào quá hạn giao!</i>`;

  return { text: msg };
}

export function handleOverduePos(data: any): { text: string; markup?: any } {
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];
  const suppliers: any[] = Array.isArray(data?.suppliers) ? data.suppliers : [];
  const suppMap = new Map<number, string>();
  suppliers.forEach((s) => {
    if (s.id) suppMap.set(Number(s.id), s.name || s.code || "");
  });

  const today = new Date();
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const pendingPOs = pos.filter((po) => {
    const status = (po.status || "").toLowerCase();
    return !status.includes("hoàn thành") && !status.includes("đã giao") && !status.includes("hủy");
  });

  const overduePOs: any[] = [];
  pendingPOs.forEach((po) => {
    const d = parseDateIso(po.expectedDate);
    if (!d) return;
    const diff = Math.round((d.getTime() - todayZero.getTime()) / (1000 * 3600 * 24));
    if (diff < 0) {
      overduePOs.push({ ...po, lateDays: Math.abs(diff) });
    }
  });

  if (overduePOs.length === 0) {
    return {
      text: `✅ <b>Tuyệt vời! Không có đơn PO nào bị trễ hạn giao hàng.</b>\n\nTất cả các đơn hàng đều đang đúng tiến độ cam kết.`,
    };
  }

  let msg = `🚨 <b>DANH SÁCH ${overduePOs.length} ĐƠN PO QUÁ HẠN GIAO HÀNG:</b>\n`;
  msg += `─────────────────────────\n`;

  overduePOs.forEach((po, idx) => {
    const sName = escapeHtml(suppMap.get(Number(po.supplierId)) || "NCC");
    msg += `${idx + 1}. <b>#${escapeHtml(po.number)}</b> - ${sName}\n`;
    msg += `   • Hẹn giao: <code>${po.expectedDate}</code> (<b>Đã trễ ${po.lateDays} ngày!</b>)\n`;
  });

  msg += `\n─────────────────────────\n`;
  msg += `💡 <i>Khuyến nghị: Bạn hãy liên hệ ngay với Nhà cung cấp để giục tiến độ giao hàng!</i>`;

  return { text: msg };
}

// -------------------------------------------------------------
// LUỒNG 4: TRA CỨU GIÁ CŨ & DANH BẠ NHÀ CUNG CẤP
// -------------------------------------------------------------

export async function handlePriceLookup(
  keyword: string,
  db: any,
  data: any
): Promise<{ text: string; markup?: any }> {
  const cleanKeyword = keyword.trim().replace(/^(\/gia|giá|gia|lịch sử|lich su)\s*/i, "").trim();
  if (!cleanKeyword) {
    return {
      text: "⚠️ <b>Vui lòng nhập tên hàng cần tra giá!</b>\n\nVí dụ: <code>/gia Methanol</code> hoặc gõ <i>giá Máy đo điểm chảy</i>",
    };
  }

  let results: any[] = [];

  if (db) {
    try {
      const sqlPattern = `%${cleanKeyword}%`;
      const queryRes = await db
        .prepare(
          `SELECT item_name, unit_price, quantity, unit, document_date, invoice_no, supplier_name, department
           FROM purchase_history
           WHERE item_name LIKE ? OR description LIKE ?
           ORDER BY document_date DESC
           LIMIT 4;`
        )
        .bind(sqlPattern, sqlPattern)
        .all();
      results = queryRes.results || [];
    } catch (e) {
      console.warn("Lỗi truy vấn purchase_history D1:", e);
    }
  }

  if (results.length === 0 && Array.isArray(data?.purchaseHistory)) {
    const lower = cleanKeyword.toLowerCase();
    results = data.purchaseHistory
      .filter((h: any) => (h.itemName || "").toLowerCase().includes(lower) || (h.description || "").toLowerCase().includes(lower))
      .sort((a: any, b: any) => String(b.documentDate || "").localeCompare(String(a.documentDate || "")))
      .slice(0, 4)
      .map((h: any) => ({
        item_name: h.itemName,
        unit_price: h.unitPrice,
        quantity: h.quantity,
        unit: h.unit,
        document_date: h.documentDate,
        invoice_no: h.invoiceNo,
        supplier_name: h.supplierName,
        department: h.department,
      }));
  }

  if (results.length === 0) {
    return {
      text: `🔍 <b>Không tìm thấy lịch sử giá cho từ khóa: "${escapeHtml(cleanKeyword)}"</b>\n\n💡 <i>Gợi ý: Thử gõ từ khóa ngắn hơn (ví dụ: gõ "Methanol" thay vì tên đầy đủ).</i>`,
    };
  }

  let msg = `💰 <b>LỊCH SỬ GIÁ MUA: "${escapeHtml(cleanKeyword)}"</b>\n`;
  msg += `─────────────────────────\n`;

  results.forEach((row, idx) => {
    const name = escapeHtml(row.item_name || cleanKeyword);
    const price = formatVND(row.unit_price);
    const unit = escapeHtml(row.unit || "Đơn vị");
    const date = row.document_date || "---";
    const qty = row.quantity ? `${row.quantity} ${unit}` : "";
    const supp = escapeHtml(row.supplier_name || "Nhà cung cấp");
    const inv = row.invoice_no ? ` (HĐ: ${escapeHtml(row.invoice_no)})` : "";

    msg += `\n${idx + 1}️⃣ <b>${name}</b>\n`;
    msg += `• <b>Đơn giá:</b> <code>${price} / ${unit}</code>\n`;
    if (qty) msg += `• <b>Số lượng:</b> ${qty} (Ngày: ${date})\n`;
    msg += `• <b>NCC:</b> ${supp}${inv}\n`;
  });

  const latestPrice = formatVND(results[0].unit_price);
  const latestUnit = escapeHtml(results[0].unit || "Đơn vị");
  msg += `\n─────────────────────────\n`;
  msg += `💡 <i>Giá mua gần nhất: <b>${latestPrice} / ${latestUnit}</b></i>`;

  return { text: msg };
}

export async function handleSupplierLookup(
  keyword: string,
  db: any,
  data: any
): Promise<{ text: string; markup?: any }> {
  const cleanKeyword = keyword.trim().replace(/^(\/ncc|ncc|stk|sdt|nhà cung cấp)\s*/i, "").trim();
  if (!cleanKeyword) {
    return {
      text: "⚠️ <b>Vui lòng nhập tên nhà cung cấp cần tra cứu!</b>\n\nVí dụ: <code>/ncc Đức Giang</code> hoặc gõ <i>stk SATICUS</i>",
    };
  }

  const lower = cleanKeyword.toLowerCase();
  const suppliers: any[] = Array.isArray(data?.suppliers) ? data.suppliers : [];

  let matches = suppliers.filter((s) => {
    return (
      (s.name || "").toLowerCase().includes(lower) ||
      (s.code || "").toLowerCase().includes(lower) ||
      (s.shortName || "").toLowerCase().includes(lower)
    );
  });

  if (matches.length === 0 && db) {
    try {
      const q = `%${cleanKeyword}%`;
      const res = await db
        .prepare("SELECT name, code, phone, bank, bank_account, address, contact FROM suppliers WHERE name LIKE ? OR code LIKE ? LIMIT 3")
        .bind(q, q)
        .all();
      matches = (res.results || []).map((r: any) => ({
        name: r.name,
        code: r.code,
        phone: r.phone,
        bank: r.bank,
        bankAccount: r.bank_account,
        address: r.address,
        contact: r.contact,
      }));
    } catch (e) {
      console.warn("Lỗi tìm suppliers D1:", e);
    }
  }

  if (matches.length === 0) {
    return {
      text: `🔍 <b>Không tìm thấy nhà cung cấp nào có tên: "${escapeHtml(cleanKeyword)}"</b>`,
    };
  }

  const supp = matches[0];
  let msg = `🏢 <b>THÔNG TIN NHÀ CUNG CẤP</b>\n`;
  msg += `<b>${escapeHtml(supp.name)}</b> (${escapeHtml(supp.code || "---")})\n`;
  msg += `─────────────────────────\n`;
  if (supp.contact) msg += `• <b>Người liên hệ:</b> ${escapeHtml(supp.contact)}\n`;
  if (supp.phone) msg += `• <b>Số điện thoại:</b> <code>${escapeHtml(supp.phone)}</code>\n`;
  if (supp.address) msg += `• <b>Địa chỉ:</b> ${escapeHtml(supp.address)}\n`;
  msg += `• <b>Ngân hàng:</b> ${escapeHtml(supp.bank || "Chưa cập nhật")}\n`;
  msg += `• <b>Số tài khoản:</b> <code>${escapeHtml(supp.bankAccount || "Chưa cập nhật")}</code>\n`;
  msg += `─────────────────────────\n`;
  msg += `💡 <i>Chạm vào <b>Số tài khoản</b> hoặc <b>Số điện thoại</b> để sao chép nhanh!</i>`;

  return { text: msg };
}

// -------------------------------------------------------------
// LUỒNG 5: TIẾN ĐỘ GIAO NHẬN NHẬP KHO (BBBG)
// -------------------------------------------------------------

export function handleHandoverLookup(data: any): { text: string; markup?: any } {
  const handovers: any[] = Array.isArray(data?.paymentHandovers) ? data.paymentHandovers : [];

  if (handovers.length === 0) {
    return {
      text: `📦 <b>Chưa có biên bản giao nhận / bàn giao hàng hóa nào trong hệ thống.</b>`,
    };
  }

  const latest = handovers.slice(-5).reverse();
  let msg = `📦 <b>BIÊN BẢN GIAO NHẬN HÀNG HÓA GẦN ĐÂY (${handovers.length} bản ghi):</b>\n`;
  msg += `─────────────────────────\n`;

  latest.forEach((h, idx) => {
    const item = escapeHtml(h.item_name || "Mặt hàng");
    const dept = escapeHtml(h.department || "Kho");
    const date = h.handover_date || "---";
    const qtyDoc = h.quantity_doc || "0";
    const qtyPass = h.quantity_pass || qtyDoc;
    const unit = escapeHtml(h.unit || "");
    const failNotice = Number(h.quantity_fail) > 0 ? ` (⚠️ Lỗi: ${h.quantity_fail})` : "";

    msg += `\n${idx + 1}. <b>${item}</b> (${dept})\n`;
    msg += `   • Ngày nhận: ${date}\n`;
    msg += `   • Nghiệm thu: <b>${qtyPass}/${qtyDoc} ${unit}</b> đạt chuẩn${failNotice}\n`;
    if (h.sender_name) msg += `   • Đơn vị giao: ${escapeHtml(h.sender_name)}\n`;
  });

  msg += `\n─────────────────────────\n`;
  msg += `🌐 <i>Mở Web mục 'Bàn giao' để xem và in phiếu BBBG hoàn chỉnh.</i>`;

  return {
    text: msg,
    markup: { inline_keyboard: [[{ text: "🌐 Mở Web SCMH", url: BASE_WEB_URL }]] },
  };
}

// -------------------------------------------------------------
// LUỒNG 6: QUẢN LÝ THANH TOÁN (ĐNTT & CÔNG NỢ)
// -------------------------------------------------------------

export function handlePaymentRequests(data: any): { text: string; markup?: any } {
  const paymentRequests: any[] = Array.isArray(data?.paymentRequests) ? data.paymentRequests : [];

  const pending = paymentRequests.filter((p) => {
    return !p.is_paid && p.status !== "paid" && p.status !== "completed";
  });

  if (pending.length === 0) {
    return {
      text: `🎉 <b>Tất cả các khoản Đề nghị thanh toán (ĐNTT) đều đã được thanh toán hoàn tất!</b>`,
    };
  }

  let totalPending = 0;
  pending.forEach((p) => {
    totalPending += Number(p.total_amount || p.amount) || 0;
  });

  let msg = `💳 <b>DANH SÁCH ĐNTT CHỜ THANH TOÁN (${pending.length} khoản):</b>\n`;
  msg += `💰 <b>Tổng số tiền cần chi:</b> <code>${formatVND(totalPending)}</code>\n`;
  msg += `─────────────────────────\n`;

  pending.slice(0, 6).forEach((p, idx) => {
    const payee = escapeHtml(p.payee_name || "Nhà cung cấp");
    const amount = formatVND(p.total_amount || p.amount);
    const invoice = p.invoice_no ? ` - HĐ: <code>${escapeHtml(p.invoice_no)}</code>` : "";
    const desc = p.description ? `\n   <i>${escapeHtml(p.description)}</i>` : "";
    msg += `${idx + 1}. <b>${payee}</b>: <b>${amount}</b>${invoice}${desc}\n`;
  });

  if (pending.length > 6) {
    msg += `\n• <i>Và còn ${pending.length - 6} khoản thanh toán khác...</i>\n`;
  }

  msg += `─────────────────────────\n`;
  msg += `💡 <i>Gõ <code>/congno</code> để xem tổng quan công nợ mua hàng.</i>`;

  return {
    text: msg,
    markup: { inline_keyboard: [[{ text: "🌐 Mở Web Quản lý Thanh toán", url: BASE_WEB_URL }]] },
  };
}

export function handleDebtSummary(data: any): { text: string; markup?: any } {
  const paymentRequests: any[] = Array.isArray(data?.paymentRequests) ? data.paymentRequests : [];
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];

  let pendingPaymentAmount = 0;
  let paidPaymentAmount = 0;
  paymentRequests.forEach((p) => {
    const amt = Number(p.total_amount || p.amount) || 0;
    if (p.is_paid || p.status === "paid" || p.status === "completed") {
      paidPaymentAmount += amt;
    } else {
      pendingPaymentAmount += amt;
    }
  });

  let totalPOValue = 0;
  pos.forEach((po) => {
    const items: any[] = Array.isArray(po.items) ? po.items : [];
    items.forEach((it) => {
      const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
      const vat = Number(it.vatRate) || 0;
      totalPOValue += Math.round(sub * (1 + vat / 100));
    });
  });

  let msg = `📊 <b>TỔNG QUAN TÀI CHÍNH & CÔNG NỢ MUA HÀNG</b>\n`;
  msg += `─────────────────────────\n`;
  msg += `• <b>Tổng giá trị các đơn PO:</b> <code>${formatVND(totalPOValue)}</code>\n`;
  msg += `• <b>Tổng tiền đã chi trả (ĐNTT):</b> <code>${formatVND(paidPaymentAmount)}</code>\n`;
  msg += `• 🔴 <b>Số tiền ĐNTT đang chờ chi:</b> <code>${formatVND(pendingPaymentAmount)}</code>\n`;
  msg += `─────────────────────────\n`;
  msg += `💡 <i>Gõ <code>/dntt</code> để xem danh sách chi tiết các khoản đang chờ chi.</i>`;

  return { text: msg };
}

// -------------------------------------------------------------
// LUỒNG 7: SỔ TAY CÔNG VIỆC CÁ NHÂN (TODOS D1)
// -------------------------------------------------------------

export async function handleTodoAdd(
  rawText: string,
  user: TelegramUser,
  db: any
): Promise<{ text: string }> {
  if (!db) return { text: "❌ Lỗi hệ thống: Chưa kết nối D1 Database." };
  await ensureTelegramTables(db);

  const content = rawText.trim().replace(/^(\/todo|todo|việc|them viec)\s*/i, "").trim();
  if (!content) {
    return {
      text: "⚠️ <b>Vui lòng nhập nội dung việc cần làm!</b>\n\nVí dụ: <code>/todo Gọi giục bên SATICUS gửi phụ kiện</code>",
    };
  }

  const todoId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db
      .prepare(
        `INSERT INTO personal_todos (id, user_id, content, is_completed, is_priority, created_at, updated_at, is_deleted)
         VALUES (?, ?, ?, 0, 0, ?, ?, 0)`
      )
      .bind(todoId, MASTER_WORKSPACE_ID, content, now, now)
      .run();

    return {
      text: `✅ <b>Đã thêm việc vào Sổ tay công việc:</b>\n\n📌 <i>"${escapeHtml(content)}"</i>\n\n💡 <i>Gõ <code>/todos</code> để xem danh sách việc cần làm.</i>`,
    };
  } catch (e: any) {
    return { text: `❌ Lỗi khi thêm việc: ${e?.message}` };
  }
}

export async function handleTodoList(
  user: TelegramUser,
  db: any
): Promise<{ text: string; markup?: any }> {
  if (!db) return { text: "❌ Lỗi hệ thống: Chưa kết nối D1 Database." };
  await ensureTelegramTables(db);

  try {
    const res = await db
      .prepare(
        `SELECT id, content, is_completed, is_priority, created_at
         FROM personal_todos
         WHERE is_deleted = 0 AND is_completed = 0
         ORDER BY is_priority DESC, created_at DESC
         LIMIT 6;`
      )
      .all();

    const todos = res.results || [];
    if (todos.length === 0) {
      return {
        text: `🎉 <b>Tuyệt vời! Bạn không còn việc nào tồn đọng trong sổ tay.</b>\n\n💡 <i>Gõ <code>/todo &lt;nội dung&gt;</code> để thêm việc mới bất cứ lúc nào!</i>`,
      };
    }

    let msg = `📝 <b>SỔ TAY CÔNG VIỆC CẦN LÀM (${todos.length} việc):</b>\n`;
    msg += `─────────────────────────\n`;

    const keyboard: any[] = [];
    todos.forEach((t: any, idx: number) => {
      const priority = t.is_priority ? "⭐ " : "";
      msg += `${idx + 1}. ${priority}<b>${escapeHtml(t.content)}</b>\n`;

      const shortId = t.id.slice(0, 8);
      keyboard.push([
        {
          text: `✅ Hoàn thành: ${t.content.slice(0, 25)}...`,
          callback_data: `done:${shortId}`,
        },
      ]);
    });

    msg += `\n─────────────────────────\n`;
    msg += `💡 <i>Bấm nút bên dưới để đánh dấu xong việc ngay lập tức!</i>`;

    return { text: msg, markup: { inline_keyboard: keyboard } };
  } catch (e: any) {
    return { text: `❌ Lỗi đọc sổ tay công việc: ${e?.message}` };
  }
}

export async function handleTodoDone(
  shortId: string,
  db: any,
  token: string,
  cbId?: string
): Promise<{ text: string }> {
  if (!db) return { text: "Lỗi kết nối CSDL" };

  try {
    const match = await db
      .prepare(`SELECT id, content FROM personal_todos WHERE id LIKE ? AND is_deleted = 0 LIMIT 1`)
      .bind(`${shortId}%`)
      .first<any>();

    if (!match) {
      if (cbId) await answerCallbackQuery(cbId, "Không tìm thấy công việc này", false, token);
      return { text: "⚠️ Công việc không tồn tại hoặc đã được hoàn thành." };
    }

    const now = new Date().toISOString();
    await db
      .prepare(`UPDATE personal_todos SET is_completed = 1, updated_at = ? WHERE id = ?`)
      .bind(now, match.id)
      .run();

    if (cbId) await answerCallbackQuery(cbId, "Đã hoàn thành công việc!", false, token);
    return {
      text: `🎉 <b>Đã hoàn thành công việc:</b>\n\n✅ <s>${escapeHtml(match.content)}</s>`,
    };
  } catch (e: any) {
    return { text: `Lỗi: ${e?.message}` };
  }
}

// -------------------------------------------------------------
// LUỒNG 8: BÁO CÁO TỔNG HỢP & NẠP CHỨNG TỪ TỨC THÌ
// -------------------------------------------------------------

export function handleReportSummary(data: any): { text: string; markup?: any } {
  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];
  const paymentRequests: any[] = Array.isArray(data?.paymentRequests) ? data.paymentRequests : [];
  const handovers: any[] = Array.isArray(data?.paymentHandovers) ? data.paymentHandovers : [];

  let totalPO = 0;
  pos.forEach((p) => {
    const items = p.items || [];
    items.forEach((it: any) => {
      const sub = (Number(it.qty) || 0) * (Number(it.price) || 0);
      const vat = Number(it.vatRate) || 0;
      totalPO += Math.round(sub * (1 + vat / 100));
    });
  });

  let totalDisbursed = 0;
  paymentRequests.forEach((p) => {
    if (p.is_paid || p.status === "paid" || p.status === "completed") {
      totalDisbursed += Number(p.total_amount || p.amount) || 0;
    }
  });

  let msg = `📊 <b>BÁO CÁO TỔNG HỢP HOẠT ĐỘNG MUA HÀNG (SCMH)</b>\n`;
  msg += `─────────────────────────\n`;
  msg += `📋 <b>Phiếu mua hàng (PR):</b> ${prs.length} phiếu (${prs.filter((p) => p.isCompleted).length} hoàn thành)\n`;
  msg += `📦 <b>Đơn đặt hàng (PO):</b> ${pos.length} đơn hàng\n`;
  msg += `💰 <b>Tổng giá trị đơn hàng:</b> <code>${formatVND(totalPO)}</code>\n`;
  msg += `💳 <b>Tổng tiền đã thanh toán:</b> <code>${formatVND(totalDisbursed)}</code>\n`;
  msg += `🚚 <b>Biên bản bàn giao nhập kho:</b> ${handovers.length} đợt giao nhận\n`;
  msg += `─────────────────────────\n`;
  msg += `🌐 <i>Xem dashboard chi tiết và biểu đồ trực quan tại Web SCMH!</i>`;

  return {
    text: msg,
    markup: { inline_keyboard: [[{ text: "🌐 Mở Web SCMH", url: BASE_WEB_URL }]] },
  };
}

export async function handleIncomingMedia(
  message: TelegramMessage,
  db: any,
  data: any,
  token: string
) {
  const chatId = message.chat.id;
  await ensureTelegramTables(db);

  let fileId = "";
  let fileName = "";
  let mimeType = "image/jpeg";
  let fileSize = 0;

  if (message.photo && message.photo.length > 0) {
    const highestPhoto = message.photo[message.photo.length - 1];
    fileId = highestPhoto.file_id;
    fileSize = highestPhoto.file_size || 0;
    fileName = `scan_${Date.now()}.jpg`;
    mimeType = "image/jpeg";
  } else if (message.document) {
    fileId = message.document.file_id;
    fileSize = message.document.file_size || 0;
    fileName = message.document.file_name || `doc_${Date.now()}.pdf`;
    mimeType = message.document.mime_type || "application/pdf";
  } else {
    return;
  }

  const tempId = crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO telegram_pending_files (id, file_id, file_name, mime_type, file_size, chat_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(tempId, fileId, fileName, mimeType, fileSize, String(chatId), now)
      .run();
  } catch (e) {
    console.error("Lỗi lưu pending file:", e);
  }

  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];
  const latestPr = prs.slice(-1)[0];
  const latestPo = pos.slice(-1)[0];

  const keyboard: any[] = [];
  if (latestPr) {
    keyboard.push([
      {
        text: `📎 Gắn vào PR #${latestPr.number} (${latestPr.department || "PR"})`,
        callback_data: `up:pr:${latestPr.id}:${tempId}`,
      },
    ]);
  }
  if (latestPo) {
    keyboard.push([
      {
        text: `📎 Gắn vào Đơn PO #${latestPo.number}`,
        callback_data: `up:po:${latestPo.id}:${tempId}`,
      },
    ]);
  }
  keyboard.push([
    {
      text: "📁 Lưu vào Kho chứng từ Cloud (Data Vault)",
      callback_data: `up:vault:0:${tempId}`,
    },
  ]);

  let msg = `📸 <b>ĐÃ TIẾP NHẬN BẢN SCAN / HÓA ĐƠN</b>\n`;
  msg += `─────────────────────────\n`;
  msg += `• <b>Tên tài liệu:</b> <i>${escapeHtml(fileName)}</i>\n`;
  msg += `• <b>Dung lượng:</b> ${formatFileSize(fileSize)}\n\n`;
  msg += `👉 <b>Bạn muốn lưu chứng từ này vào đâu?</b>`;

  await sendTelegramMessage(chatId, msg, { replyMarkup: { inline_keyboard: keyboard } }, token);
}

export async function handleCallbackQuery(
  cb: TelegramCallbackQuery,
  env: any,
  token: string
) {
  const cbId = cb.id;
  const dataStr = cb.data || "";
  const chatId = cb.message?.chat.id || cb.from.id;
  const messageId = cb.message?.message_id;

  const db = env?.DB;
  const bucket = env?.R2_BUCKET || env?.BUCKET;

  // Xử lý hoàn thành todo
  if (dataStr.startsWith("done:")) {
    const shortId = dataStr.split(":")[1];
    const res = await handleTodoDone(shortId, db, token, cbId);
    if (messageId) {
      await editTelegramMessage(chatId, messageId, res.text, {}, token);
    }
    return;
  }

  // Xử lý các nút lệnh nhanh
  if (dataStr.startsWith("cmd:")) {
    const cmd = dataStr.replace("cmd:", "");
    const masterData = await getMasterAppState(db);

    if (cmd === "trehen") {
      await answerCallbackQuery(cbId, "Đang kiểm tra đơn trễ hẹn...", false, token);
      const res = handleOverduePos(masterData);
      if (messageId) await editTelegramMessage(chatId, messageId, res.text, { replyMarkup: res.markup }, token);
      return;
    }
    if (cmd === "dntt") {
      await answerCallbackQuery(cbId, "Đang tra cứu ĐNTT...", false, token);
      const res = handlePaymentRequests(masterData);
      if (messageId) await editTelegramMessage(chatId, messageId, res.text, { replyMarkup: res.markup }, token);
      return;
    }
    if (cmd === "pr_cho") {
      await answerCallbackQuery(cbId, "Đang tải PR chờ mua...", false, token);
      const res = handlePendingPrs(masterData);
      if (messageId) await editTelegramMessage(chatId, messageId, res.text, { replyMarkup: res.markup }, token);
      return;
    }
    if (cmd === "po_chogiao") {
      await answerCallbackQuery(cbId, "Đang tải PO chờ giao...", false, token);
      const res = handlePendingPos(masterData);
      if (messageId) await editTelegramMessage(chatId, messageId, res.text, { replyMarkup: res.markup }, token);
      return;
    }
    if (cmd === "todos") {
      await answerCallbackQuery(cbId, "Đang tải sổ việc...", false, token);
      const res = await handleTodoList(cb.from, db);
      if (messageId) await editTelegramMessage(chatId, messageId, res.text, { replyMarkup: res.markup }, token);
      return;
    }
    if (cmd === "baocao") {
      await answerCallbackQuery(cbId, "Đang tổng hợp báo cáo...", false, token);
      const res = handleReportSummary(masterData);
      if (messageId) await editTelegramMessage(chatId, messageId, res.text, { replyMarkup: res.markup }, token);
      return;
    }
  }

  // Xử lý lưu file vào R2
  if (dataStr.startsWith("up:")) {
    const parts = dataStr.split(":");
    const targetType = parts[1];
    const targetId = parts[2];
    const tempId = parts[3];

    await answerCallbackQuery(cbId, "Đang tải và lưu lên Cloudflare R2...", false, token);

    if (!db || !bucket) {
      if (messageId) await editTelegramMessage(chatId, messageId, "❌ Lỗi hệ thống: Chưa cấu hình kết nối D1 / R2.", {}, token);
      return;
    }

    const pendingRow = await db.prepare("SELECT * FROM telegram_pending_files WHERE id = ?").bind(tempId).first<any>();
    if (!pendingRow) {
      if (messageId) await editTelegramMessage(chatId, messageId, "⚠️ Tài liệu này đã được xử lý hoặc hết hạn.", {}, token);
      return;
    }

    const dl = await downloadTelegramFile(pendingRow.file_id, token);
    if (!dl) {
      if (messageId) await editTelegramMessage(chatId, messageId, "❌ Lỗi khi tải dữ liệu từ Telegram CDN.", {}, token);
      return;
    }

    const ext = pendingRow.file_name.split(".").pop()?.toLowerCase() || "jpg";
    let key = "";
    let destinationLabel = "";
    let prNumber = "";

    const masterData = await getMasterAppState(db);

    if (targetType === "pr") {
      const prs: any[] = Array.isArray(masterData?.prs) ? masterData.prs : [];
      const pr = prs.find((p) => String(p.id) === String(targetId));
      prNumber = pr?.number || `PR${targetId}`;
      const safePrCode = prNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
      key = `pr-scans/${safePrCode}_${Date.now()}.${ext}`;
      destinationLabel = `Phiếu PR #${prNumber}`;

      const scanUrl = `/api/upload-scan?key=${encodeURIComponent(key)}`;
      if (pr) {
        pr.scan_file_url = scanUrl;
        await saveMasterAppState(db, masterData);
      }
      try {
        await db.prepare("UPDATE prs SET scan_file_url = ? WHERE id = ?").bind(scanUrl, Number(targetId)).run();
      } catch {}
    } else if (targetType === "po") {
      const pos: any[] = Array.isArray(masterData?.pos) ? masterData.pos : [];
      const po = pos.find((p) => String(p.id) === String(targetId));
      const poNum = po?.number || `PO${targetId}`;
      const safePoCode = poNum.replace(/[^a-zA-Z0-9_-]/g, "_");
      key = `po-docs/${safePoCode}_${Date.now()}.${ext}`;
      destinationLabel = `Đơn PO #${poNum}`;
    } else {
      key = `vault/${Date.now()}_${pendingRow.file_name}`;
      destinationLabel = "Kho chứng từ Cloud (Data Vault)";
    }

    await bucket.put(key, dl.buffer, {
      httpMetadata: { contentType: pendingRow.mime_type },
      customMetadata: {
        originalName: pendingRow.file_name,
        uploadedAt: new Date().toISOString(),
        uploadedBy: cb.from.username || "telegram_bot",
      },
    });

    const fileRecordId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    try {
      await db
        .prepare(
          `INSERT INTO files (id, entity_type, entity_id, file_name, object_key, content_type, size, uploaded_at, owner_user_id, document_type, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          fileRecordId,
          targetType,
          targetId,
          pendingRow.file_name,
          key,
          pendingRow.mime_type,
          pendingRow.file_size,
          nowIso,
          cb.from.username || "telegram_bot",
          "Bản scan chứng từ",
          "Đã lưu",
          `Tải lên từ Telegram bởi @${cb.from.username || cb.from.first_name}`
        )
        .run();
    } catch (e) {
      console.warn("Lỗi ghi files table:", e);
    }

    try {
      await db.prepare("DELETE FROM telegram_pending_files WHERE id = ?").bind(tempId).run();
    } catch {}

    const fileViewUrl = `${BASE_WEB_URL}/api/upload-scan?key=${encodeURIComponent(key)}`;
    let successMsg = `✅ <b>ĐÃ LƯU CHỨNG TỪ THÀNH CÔNG!</b>\n`;
    successMsg += `─────────────────────────\n`;
    successMsg += `• <b>Điểm lưu:</b> <b>${destinationLabel}</b>\n`;
    successMsg += `• <b>File:</b> <i>${escapeHtml(pendingRow.file_name)}</i> (${formatFileSize(pendingRow.file_size)})\n`;
    successMsg += `• <b>Lưu trữ:</b> Cloudflare R2 (An toàn & vĩnh viễn)\n`;
    successMsg += `─────────────────────────\n`;
    successMsg += `🌐 <i>Mở Web để thấy chứng từ đã tự động cập nhật!</i>`;

    if (messageId) {
      await editTelegramMessage(
        chatId,
        messageId,
        successMsg,
        {
          replyMarkup: {
            inline_keyboard: [
              [{ text: "📄 Xem file trên Web", url: fileViewUrl }],
              [{ text: "🌐 Mở Web SCMH", url: BASE_WEB_URL }],
            ],
          },
        },
        token
      );
    }
    return;
  }

  await answerCallbackQuery(cbId, "", false, token);
}

// -------------------------------------------------------------
// ROUTER ĐIỀU PHỐI TẤT CẢ UPDATE TỪ TELEGRAM
// -------------------------------------------------------------

export async function processTelegramUpdate(update: TelegramUpdate, env: any) {
  const token = getBotToken(env);
  const db = env?.DB;

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env, token);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const user = message.from || { id: chatId, first_name: "Người dùng" };

  await saveSubscriber(db, user, chatId);

  if (message.photo || message.document) {
    const masterData = await getMasterAppState(db);
    await handleIncomingMedia(message, db, masterData, token);
    return;
  }

  const rawText = (message.text || "").trim();
  if (!rawText) return;

  const textLower = rawText.toLowerCase();

  // Menu / Trợ giúp
  if (textLower === "/start" || textLower === "/help" || textLower === "menu" || textLower === "trợ giúp") {
    let welcome = `👋 <b>Chào bạn ${escapeHtml(user.first_name)}!</b>\n`;
    welcome += `Tôi là <b>Trợ lý Mua hàng Toàn diện SCMH (Phenikaa)</b>.\n\n`;
    welcome += `Tôi hỗ trợ bạn điều hành toàn bộ 8 luồng nghiệp vụ mua sắm:\n\n`;

    welcome += `📋 <b>YÊU CẦU MUA HÀNG (PR):</b>\n`;
    welcome += `• <code>/pr &lt;mã&gt;</code>: Xem chi tiết PR (vd: <code>/pr QC261106.2</code>)\n`;
    welcome += `• <code>/pr_cho</code>: Xem danh sách PR đang chờ mua sắm\n\n`;

    welcome += `📦 <b>ĐƠN HÀNG (PO) & GIAO NHẬN:</b>\n`;
    welcome += `• <code>/po &lt;mã&gt;</code>: Xem tiến độ PO (vd: <code>/po PO-2611-01</code>)\n`;
    welcome += `• <code>/po_chogiao</code>: Xem các đơn PO đang chờ giao\n`;
    welcome += `• <code>/trehen</code>: Cảnh báo các đơn PO quá hạn giao hàng\n`;
    welcome += `• <code>/giaonhan</code>: Xem biên bản bàn giao (BBBG) nhập kho\n\n`;

    welcome += `💰 <b>GIÁ CẢ & NHÀ CUNG CẤP:</b>\n`;
    welcome += `• <code>/gia &lt;tên hàng&gt;</code>: Tra cứu giá cũ từ 777+ hóa đơn\n`;
    welcome += `• <code>/ncc &lt;tên NCC&gt;</code>: Tra STK, SĐT, người liên hệ NCC\n\n`;

    welcome += `💳 <b>THANH TOÁN & CÔNG NỢ:</b>\n`;
    welcome += `• <code>/dntt</code>: Danh sách ĐNTT đang chờ thanh toán\n`;
    welcome += `• <code>/congno</code>: Tổng hợp công nợ & giá trị đơn hàng\n\n`;

    welcome += `📝 <b>SỔ TAY CÔNG VIỆC:</b>\n`;
    welcome += `• <code>/todo &lt;nội dung&gt;</code>: Thêm việc cần làm nhanh\n`;
    welcome += `• <code>/todos</code>: Xem danh sách việc cần làm\n\n`;

    welcome += `📊 <b>BÁO CÁO & THỐNG KÊ:</b>\n`;
    welcome += `• <code>/nhacviec</code>: Bản tin mua hàng hôm nay (tự động 08:30 sáng)\n`;
    welcome += `• <code>/baocao</code>: Báo cáo tài chính mua sắm tháng\n\n`;

    welcome += `📸 <b>NẠP CHỨNG TỪ:</b> Gửi trực tiếp ảnh/PDF để lưu thẳng lên Web!`;

    const markup = {
      inline_keyboard: [
        [
          { text: "☕ Nhắc việc hôm nay", callback_data: "cmd:nhacviec" },
          { text: "🚨 Đơn trễ hẹn", callback_data: "cmd:trehen" },
        ],
        [
          { text: "💳 Khoản cần TT", callback_data: "cmd:dntt" },
          { text: "📋 PR chờ mua", callback_data: "cmd:pr_cho" },
        ],
        [
          { text: "📝 Việc cần làm", callback_data: "cmd:todos" },
          { text: "📊 Báo cáo tháng", callback_data: "cmd:baocao" },
        ],
        [{ text: "🌐 Mở Web Quản Lý SCMH", url: BASE_WEB_URL }],
      ],
    };

    await sendTelegramMessage(chatId, welcome, { replyMarkup: markup }, token);
    return;
  }

  // Nhắc việc
  if (textLower.startsWith("/nhacviec") || textLower.startsWith("/diemtin") || textLower.includes("hôm nay") || textLower.includes("nhắc việc")) {
    const masterData = await getMasterAppState(db);
    const briefing = buildDailyBriefingMessage(masterData);
    await sendTelegramMessage(chatId, briefing.text, { replyMarkup: briefing.markup }, token);
    return;
  }

  // Đơn trễ hẹn
  if (textLower === "/trehen" || textLower === "trễ hẹn" || textLower === "quá hạn") {
    const masterData = await getMasterAppState(db);
    const res = handleOverduePos(masterData);
    await sendTelegramMessage(chatId, res.text, {}, token);
    return;
  }

  // PR chờ mua
  if (textLower === "/pr_cho" || textLower === "pr chờ" || textLower === "chờ mua") {
    const masterData = await getMasterAppState(db);
    const res = handlePendingPrs(masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // PO chờ giao
  if (textLower === "/po_chogiao" || textLower === "po chờ" || textLower === "chờ giao") {
    const masterData = await getMasterAppState(db);
    const res = handlePendingPos(masterData);
    await sendTelegramMessage(chatId, res.text, {}, token);
    return;
  }

  // Biên bản bàn giao / giao nhận
  if (textLower === "/giaonhan" || textLower === "/bbbg" || textLower.includes("bàn giao") || textLower.includes("giao nhận")) {
    const masterData = await getMasterAppState(db);
    const res = handleHandoverLookup(masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Đề nghị thanh toán (ĐNTT)
  if (textLower === "/dntt" || textLower === "/thanhtoan" || textLower.startsWith("thanh toán")) {
    const masterData = await getMasterAppState(db);
    const res = handlePaymentRequests(masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Công nợ
  if (textLower === "/congno" || textLower.includes("công nợ")) {
    const masterData = await getMasterAppState(db);
    const res = handleDebtSummary(masterData);
    await sendTelegramMessage(chatId, res.text, {}, token);
    return;
  }

  // Báo cáo tháng
  if (textLower === "/baocao" || textLower.includes("báo cáo")) {
    const masterData = await getMasterAppState(db);
    const res = handleReportSummary(masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Sổ tay công việc: thêm việc
  if (textLower.startsWith("/todo ") || textLower.startsWith("todo ") || textLower.startsWith("thêm việc ")) {
    const res = await handleTodoAdd(rawText, user, db);
    await sendTelegramMessage(chatId, res.text, {}, token);
    return;
  }

  // Sổ tay công việc: xem danh sách
  if (textLower === "/todos" || textLower === "/todo" || textLower === "/viec" || textLower === "việc cần làm") {
    const res = await handleTodoList(user, db);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Hoàn thành việc qua lệnh /done <id>
  if (textLower.startsWith("/done ")) {
    const shortId = rawText.replace(/^\/done\s+/i, "").trim();
    const res = await handleTodoDone(shortId, db, token);
    await sendTelegramMessage(chatId, res.text, {}, token);
    return;
  }

  // Tra giá
  if (textLower.startsWith("/gia") || textLower.startsWith("giá ") || textLower.startsWith("lịch sử ")) {
    const masterData = await getMasterAppState(db);
    const res = await handlePriceLookup(rawText, db, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Tra NCC
  if (textLower.startsWith("/ncc") || textLower.startsWith("stk ") || textLower.startsWith("ncc ") || textLower.startsWith("sdt ")) {
    const masterData = await getMasterAppState(db);
    const res = await handleSupplierLookup(rawText, db, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Tra PO
  if (textLower.startsWith("/po") || textLower.startsWith("po-")) {
    const masterData = await getMasterAppState(db);
    const res = handlePoLookup(rawText, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Tra PR
  if (textLower.startsWith("/pr") || textLower.startsWith("qc") || textLower.includes("pr")) {
    const masterData = await getMasterAppState(db);
    const res = handlePrLookup(rawText, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Tìm kiếm thông minh tự động: Thử tìm giá hoặc NCC hoặc PR
  const masterData = await getMasterAppState(db);
  const priceRes = await handlePriceLookup(rawText, db, masterData);
  if (!priceRes.text.includes("Không tìm thấy")) {
    await sendTelegramMessage(chatId, priceRes.text, { replyMarkup: priceRes.markup }, token);
    return;
  }

  let fallback = `🤖 <b>Trợ lý chưa hiểu lệnh: "${escapeHtml(rawText)}"</b>\n\n`;
  fallback += `💡 Bạn có thể dùng các lệnh sau:\n`;
  fallback += `• <code>/nhacviec</code>: Bản tin mua hàng hôm nay\n`;
  fallback += `• <code>/trehen</code>: Xem đơn PO bị trễ hạn\n`;
  fallback += `• <code>/gia Methanol</code>: Tra lịch sử giá mua\n`;
  fallback += `• <code>/dntt</code>: Xem các khoản cần thanh toán\n`;
  fallback += `• <code>/pr_cho</code>: Xem PR đang chờ mua sắm\n`;
  fallback += `• <code>/todo Gọi NCC</code>: Ghi chú việc cần làm\n`;
  fallback += `• Hoặc gõ <code>/help</code> để mở Menu đầy đủ!`;

  await sendTelegramMessage(chatId, fallback, {}, token);
}

export async function runScheduledBriefing(env: any) {
  const token = getBotToken(env);
  const db = env?.DB;
  if (!db) return;

  const subscribers = await getActiveSubscribers(db);
  if (subscribers.length === 0) return;

  const masterData = await getMasterAppState(db);
  const briefing = buildDailyBriefingMessage(masterData);

  for (const chatId of subscribers) {
    try {
      await sendTelegramMessage(chatId, briefing.text, { replyMarkup: briefing.markup }, token);
    } catch (e) {
      console.error(`Lỗi gửi cron briefing tới chat ${chatId}:`, e);
    }
  }
}
