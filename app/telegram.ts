/**
 * Module Tích hợp Telegram Bot cho SCMH (Phenikaa)
 * Trợ lý mua hàng cá nhân 24/7 trên Telegram (@Pnksc_bot)
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

// -------------------------------------------------------------
// BUSINESS LOGIC: NHẮC VIỆC, TRA CỨU, UPLOAD
// -------------------------------------------------------------

/**
 * 1. BẢN TIN NHẮC VIỆC & HẠN THANH TOÁN (08:30 SÁNG HOẶC /nhacviec)
 */
export function buildDailyBriefingMessage(data: any): { text: string; markup: any } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const vnDateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const paymentRequests: any[] = Array.isArray(data?.paymentRequests) ? data.paymentRequests : [];
  const pos: any[] = Array.isArray(data?.pos) ? data.pos : [];
  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];
  const suppliers: any[] = Array.isArray(data?.suppliers) ? data.suppliers : [];

  const suppMap = new Map<number, string>();
  suppliers.forEach((s) => {
    if (s.id) suppMap.set(Number(s.id), s.name || s.code || "");
  });

  // 1. Quét ĐNTT
  const pendingPayments = paymentRequests.filter((p) => {
    const isCompleted = p.is_paid || p.status === "paid" || p.status === "completed";
    return !isCompleted;
  });

  const dueSoonPayments = pendingPayments.slice(0, 4);

  // 2. Quét PO giao hàng
  const pendingPOs = pos.filter((po) => {
    const status = (po.status || "").toLowerCase();
    return !status.includes("hoàn thành") && !status.includes("đã giao") && !status.includes("hủy");
  });

  const dueTodayPOs = pendingPOs.filter((po) => {
    if (!po.expectedDate) return false;
    return po.expectedDate.includes(todayStr) || po.expectedDate.includes(vnDateStr);
  });

  // 3. PR chưa hoàn thành
  const pendingPRs = prs.filter((pr) => !pr.isCompleted && (pr.status || "") !== "Hoàn thành");

  let msg = `☕ <b>BẢN TIN MUA HÀNG HÔM NAY (${vnDateStr})</b>\n`;
  msg += `─────────────────────────\n\n`;

  // Mục 1: Đề nghị thanh toán
  msg += `💳 <b>HẠN THANH TOÁN ĐNTT:</b>\n`;
  if (dueSoonPayments.length === 0) {
    msg += `• <i>Hiện không có khoản thanh toán nào gấp.</i>\n\n`;
  } else {
    dueSoonPayments.forEach((p, idx) => {
      const payee = escapeHtml(p.payee_name || "Nhà cung cấp");
      const amount = formatVND(p.total_amount || p.amount);
      const invoice = p.invoice_no ? ` (HĐ: ${escapeHtml(p.invoice_no)})` : "";
      msg += `${idx + 1}. <b>${payee}</b>: <code>${amount}</code>${invoice}\n`;
    });
    if (pendingPayments.length > dueSoonPayments.length) {
      msg += `• <i>Và còn ${pendingPayments.length - dueSoonPayments.length} khoản ĐNTT khác cần thanh toán.</i>\n`;
    }
    msg += `\n`;
  }

  // Mục 2: Hẹn giao hàng
  msg += `📦 <b>TIẾN ĐỘ HÀNG VỀ (PO):</b>\n`;
  if (dueTodayPOs.length === 0) {
    msg += `• Hôm nay không có đơn nào hẹn giao.\n`;
    if (pendingPOs.length > 0) {
      msg += `• Tổng cộng đang có <b>${pendingPOs.length} đơn PO</b> đang chờ nhà cung cấp giao hàng.\n\n`;
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

  // Mục 3: PR chờ mua
  msg += `📋 <b>PHIẾU MUA HÀNG (PR):</b>\n`;
  msg += `• Đang có <b>${pendingPRs.length} PR</b> đang xử lý / tìm báo giá.\n\n`;
  msg += `─────────────────────────\n`;
  msg += `💡 <i>Gõ <code>/pr &lt;mã&gt;</code> hoặc <code>/gia &lt;tên hàng&gt;</code> để tra cứu ngay!</i>`;

  const markup = {
    inline_keyboard: [
      [
        { text: "🔍 Xem PR mới nhất", callback_data: "act:latest_prs" },
        { text: "💰 Giá mua gần đây", callback_data: "act:recent_prices" },
      ],
      [{ text: "🌐 Mở Web Quản Lý SCMH", url: BASE_WEB_URL }],
    ],
  };

  return { text: msg, markup };
}

/**
 * 2. TRA CỨU LỊCH SỬ GIÁ MUA (/gia hoặc 'giá Methanol')
 */
export async function handlePriceLookup(
  keyword: string,
  db: any,
  data: any
): Promise<{ text: string; markup?: any }> {
  const cleanKeyword = keyword.trim().replace(/^(\/gia|giá|gia|lịch sử|lich su)\s*/i, "").trim();
  if (!cleanKeyword) {
    return {
      text: "⚠️ <b>Vui lòng nhập tên hàng cần tra giá!</b>\n\nVí dụ: <code>/gia Methanol</code> hoặc gõ <i>giá Acetylcystein</i>",
    };
  }

  let results: any[] = [];

  // Tìm trong D1 bảng purchase_history trước (có 777+ bản ghi lịch sử)
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

  // Fallback tìm trong app_state nếu D1 chưa ra kết quả
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
    if (qty) msg += `• <b>Số lượng mua:</b> ${qty} (Ngày: ${date})\n`;
    msg += `• <b>NCC:</b> ${supp}${inv}\n`;
  });

  const latestPrice = formatVND(results[0].unit_price);
  const latestUnit = escapeHtml(results[0].unit || "Đơn vị");
  msg += `\n─────────────────────────\n`;
  msg += `💡 <i>Giá mua gần nhất: <b>${latestPrice} / ${latestUnit}</b></i>`;

  return { text: msg };
}

/**
 * 3. TRA CỨU DANH BẠ & STK NHÀ CUNG CẤP (/ncc hoặc 'stk Tân Á')
 */
export async function handleSupplierLookup(
  keyword: string,
  db: any,
  data: any
): Promise<{ text: string; markup?: any }> {
  const cleanKeyword = keyword.trim().replace(/^(\/ncc|ncc|stk|sdt|nhà cung cấp)\s*/i, "").trim();
  if (!cleanKeyword) {
    return {
      text: "⚠️ <b>Vui lòng nhập tên nhà cung cấp cần tra cứu!</b>\n\nVí dụ: <code>/ncc Đức Giang</code> hoặc gõ <i>stk Tân Á</i>",
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

/**
 * 4. TRA CỨU TIẾN ĐỘ PR (/pr hoặc 'tiến độ QC261106.2')
 */
export function handlePrLookup(keyword: string, data: any): { text: string; markup?: any } {
  const clean = keyword.trim().replace(/^(\/pr|pr|tiến độ|phiếu)\s*/i, "").trim().toLowerCase();
  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];

  if (!clean) {
    // Show 4 latest PRs
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
      text: `🔍 <b>Không tìm thấy phiếu PR nào khớp với mã: "${escapeHtml(clean)}"</b>`,
    };
  }

  const items: any[] = Array.isArray(match.items) ? match.items : [];
  const statusStr = match.isCompleted ? "✅ Hoàn thành" : `⏳ ${match.status || "Đang xử lý"}`;

  let msg = `📋 <b>CHI TIẾT PHIẾU YÊU CẦU PR #${escapeHtml(match.number)}</b>\n`;
  msg += `─────────────────────────\n`;
  msg += `• <b>Bộ phận yêu cầu:</b> ${escapeHtml(match.department || "Chưa rõ")}\n`;
  msg += `• <b>Ngày lập:</b> ${escapeHtml(match.date || "---")}\n`;
  msg += `• <b>Mục đích mua:</b> ${escapeHtml(match.purpose || "---")}\n`;
  msg += `• <b>Trạng thái:</b> <b>${statusStr}</b>\n`;
  if (match.note) msg += `• <b>Ghi chú:</b> ${escapeHtml(match.note)}\n`;

  if (items.length > 0) {
    msg += `\n📦 <b>Danh sách mặt hàng (${items.length}):</b>\n`;
    items.slice(0, 5).forEach((it, idx) => {
      const q = it.qty ? ` - SL: <b>${it.qty} ${escapeHtml(it.unit || "")}</b>` : "";
      msg += `${idx + 1}. ${escapeHtml(it.name)}${q}\n`;
    });
    if (items.length > 5) {
      msg += `• <i>Và còn ${items.length - 5} mặt hàng khác...</i>\n`;
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

/**
 * 5. TRA CỨU TIẾN ĐỘ PO (/po hoặc 'PO-2611-01')
 */
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
      text: `🔍 <b>Không tìm thấy đơn hàng nào khớp với mã PO: "${escapeHtml(clean)}"</b>`,
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

/**
 * 6. XỬ LÝ KHI NGƯỜI DÙNG GỬI ẢNH HOẶC TÀI LIỆU (PDF/SCAN)
 */
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

  // Lưu file tạm vào D1
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

  // Lấy 2 PR gần nhất để tạo nút bấm
  const prs: any[] = Array.isArray(data?.prs) ? data.prs : [];
  const latestPrs = prs.slice(-2).reverse();

  const keyboard: any[] = [];
  latestPrs.forEach((pr) => {
    keyboard.push([
      {
        text: `📎 Gắn vào PR #${pr.number} (${pr.department || "PR"})`,
        callback_data: `up:pr:${pr.id}:${tempId}`,
      },
    ]);
  });

  // Tùy chọn lưu vào kho dữ liệu
  keyboard.push([
    {
      text: "📁 Lưu vào Kho chứng từ Cloud (Data Vault)",
      callback_data: `up:vault:0:${tempId}`,
    },
  ]);

  let msg = `📸 <b>ĐÃ TIẾP NHẬN BẢN SCAN / CHỨNG TỪ</b>\n`;
  msg += `─────────────────────────\n`;
  msg += `• <b>Tên tài liệu:</b> <i>${escapeHtml(fileName)}</i>\n`;
  msg += `• <b>Dung lượng:</b> ${formatFileSize(fileSize)}\n\n`;
  msg += `👉 <b>Bạn muốn gắn chứng từ này vào đâu?</b>`;

  await sendTelegramMessage(chatId, msg, { replyMarkup: { inline_keyboard: keyboard } }, token);
}

/**
 * 7. XỬ LÝ KHI NGƯỜI DÙNG BẤM NÚT CALLBACK (INLINE BUTTONS)
 */
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

  // Xử lý nút gắn file vào PR hoặc Kho
  if (dataStr.startsWith("up:")) {
    // Format: up:type:targetId:tempId
    const parts = dataStr.split(":");
    const targetType = parts[1]; // "pr" hoặc "vault"
    const targetId = parts[2];
    const tempId = parts[3];

    await answerCallbackQuery(cbId, "Đang tải và lưu lên Cloudflare R2...", false, token);

    if (!db || !bucket) {
      if (messageId) {
        await editTelegramMessage(
          chatId,
          messageId,
          "❌ Lỗi hệ thống: Chưa cấu hình kết nối D1 / R2.",
          {},
          token
        );
      }
      return;
    }

    // Đọc thông tin file tạm
    const pendingRow = await db
      .prepare("SELECT * FROM telegram_pending_files WHERE id = ?")
      .bind(tempId)
      .first<any>();

    if (!pendingRow) {
      if (messageId) {
        await editTelegramMessage(
          chatId,
          messageId,
          "⚠️ Tài liệu này đã được xử lý hoặc đã hết hạn.",
          {},
          token
        );
      }
      return;
    }

    // Tải file từ Telegram CDN
    const dl = await downloadTelegramFile(pendingRow.file_id, token);
    if (!dl) {
      if (messageId) {
        await editTelegramMessage(
          chatId,
          messageId,
          "❌ Lỗi khi tải dữ liệu từ Telegram CDN. Vui lòng gửi lại ảnh.",
          {},
          token
        );
      }
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

      // Cập nhật PR trong app_state
      if (pr) {
        pr.scan_file_url = scanUrl;
        await saveMasterAppState(db, masterData);
      }

      // Cập nhật D1 prs table
      try {
        await db
          .prepare("UPDATE prs SET scan_file_url = ? WHERE id = ?")
          .bind(scanUrl, Number(targetId))
          .run();
      } catch {}
    } else {
      key = `vault/${Date.now()}_${pendingRow.file_name}`;
      destinationLabel = "Kho chứng từ Cloud (Data Vault)";
    }

    // Lưu vào Cloudflare R2
    await bucket.put(key, dl.buffer, {
      httpMetadata: { contentType: pendingRow.mime_type },
      customMetadata: {
        originalName: pendingRow.file_name,
        uploadedAt: new Date().toISOString(),
        uploadedBy: cb.from.username || "telegram_bot",
      },
    });

    // Thêm bản ghi vào bảng files
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
          targetType === "pr" ? "pr" : "vault",
          targetType === "pr" ? prNumber : "vault",
          pendingRow.file_name,
          key,
          pendingRow.mime_type,
          pendingRow.file_size,
          nowIso,
          cb.from.username || "telegram_bot",
          targetType === "pr" ? "Bản scan PR" : "Chứng từ",
          "Đã lưu",
          `Tải lên từ Telegram bởi @${cb.from.username || cb.from.first_name}`
        )
        .run();
    } catch (e) {
      console.warn("Lỗi ghi files table:", e);
    }

    // Xóa record pending
    try {
      await db.prepare("DELETE FROM telegram_pending_files WHERE id = ?").bind(tempId).run();
    } catch {}

    const fileViewUrl = `${BASE_WEB_URL}/api/upload-scan?key=${encodeURIComponent(key)}`;
    let successMsg = `✅ <b>ĐÃ LƯU CHỨNG TỪ THÀNH CÔNG!</b>\n`;
    successMsg += `─────────────────────────\n`;
    successMsg += `• <b>Điểm lưu:</b> <b>${destinationLabel}</b>\n`;
    successMsg += `• <b>File:</b> <i>${escapeHtml(pendingRow.file_name)}</i>\n`;
    successMsg += `• <b>Dung lượng:</b> ${formatFileSize(pendingRow.file_size)}\n`;
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
              [{ text: "📄 Xem trực tiếp file đã lưu", url: fileViewUrl }],
              [{ text: "🌐 Mở Web SCMH", url: BASE_WEB_URL }],
            ],
          },
        },
        token
      );
    }
    return;
  }

  // Nút hành động nhanh
  if (dataStr === "act:briefing") {
    await answerCallbackQuery(cbId, "Đang tải bản tin...", false, token);
    const masterData = await getMasterAppState(db);
    const briefing = buildDailyBriefingMessage(masterData);
    if (messageId) {
      await editTelegramMessage(chatId, messageId, briefing.text, { replyMarkup: briefing.markup }, token);
    }
    return;
  }

  if (dataStr === "act:latest_prs") {
    await answerCallbackQuery(cbId, "Đang tra cứu PR...", false, token);
    const masterData = await getMasterAppState(db);
    const prRes = handlePrLookup("", masterData);
    if (messageId) {
      await editTelegramMessage(chatId, messageId, prRes.text, { replyMarkup: prRes.markup }, token);
    }
    return;
  }

  if (dataStr === "act:recent_prices") {
    await answerCallbackQuery(cbId, "Đang tra cứu giá...", false, token);
    const masterData = await getMasterAppState(db);
    const priceRes = await handlePriceLookup("Methanol", db, masterData);
    if (messageId) {
      await editTelegramMessage(chatId, messageId, priceRes.text, { replyMarkup: priceRes.markup }, token);
    }
    return;
  }

  await answerCallbackQuery(cbId, "", false, token);
}

/**
 * 8. ROUTER CHÍNH TIẾP NHẬN MỌI UPDATE TỪ TELEGRAM
 */
export async function processTelegramUpdate(update: TelegramUpdate, env: any) {
  const token = getBotToken(env);
  const db = env?.DB;

  // 1. Xử lý Callback Query (Bấm nút trên tin nhắn)
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env, token);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const user = message.from || { id: chatId, first_name: "Người dùng" };

  // Tự động lưu người dùng vào danh bạ nhận tin nhắn tự động
  await saveSubscriber(db, user, chatId);

  // 2. Xử lý khi người dùng gửi file ảnh hoặc PDF
  if (message.photo || message.document) {
    const masterData = await getMasterAppState(db);
    await handleIncomingMedia(message, db, masterData, token);
    return;
  }

  const rawText = (message.text || "").trim();
  if (!rawText) return;

  const textLower = rawText.toLowerCase();

  // /start hoặc /help hoặc 'menu'
  if (textLower === "/start" || textLower === "/help" || textLower === "menu" || textLower === "trợ giúp") {
    let welcome = `👋 <b>Xin chào ${escapeHtml(user.first_name)}!</b>\n`;
    welcome += `Tôi là <b>Trợ lý Mua hàng SCMH (Phenikaa)</b>.\n\n`;
    welcome += `Tôi sẵn sàng hỗ trợ bạn tác nghiệp mua hàng 24/7:\n\n`;
    welcome += `🔍 <b>TRA CỨU NHANH:</b>\n`;
    welcome += `• <b>Giá cũ:</b> <code>/gia &lt;tên hàng&gt;</code> <i>(vd: /gia Methanol)</i>\n`;
    welcome += `• <b>Tiến độ PR:</b> <code>/pr &lt;mã PR&gt;</code> <i>(vd: /pr QC261106.2)</i>\n`;
    welcome += `• <b>Tiến độ PO:</b> <code>/po &lt;mã PO&gt;</code> <i>(vd: /po PO-2611-01)</i>\n`;
    welcome += `• <b>STK & NCC:</b> <code>/ncc &lt;tên&gt;</code> <i>(vd: /ncc Đức Giang hoặc stk Tân Á)</i>\n\n`;
    welcome += `⏰ <b>NHẮC VIỆC & ĐIỂM TIN:</b>\n`;
    welcome += `• Gõ <code>/nhacviec</code> để xem hạn thanh toán và hàng hẹn giao hôm nay.\n`;
    welcome += `• Tự động gửi tin tổng hợp vào <b>08:30 sáng mỗi ngày</b>.\n\n`;
    welcome += `📸 <b>LƯU CHỨNG TỪ:</b>\n`;
    welcome += `• Gửi ảnh hóa đơn/biên bản vào đây ➔ Bấm chọn PR ➔ Tự động lưu lên Cloud R2 và gắn vào Web!`;

    const markup = {
      inline_keyboard: [
        [
          { text: "☕ Điểm tin & Nhắc việc hôm nay", callback_data: "act:briefing" },
        ],
        [
          { text: "🔍 Tra PR mới nhất", callback_data: "act:latest_prs" },
          { text: "💰 Giá mua gần đây", callback_data: "act:recent_prices" },
        ],
        [{ text: "🌐 Mở Web Quản Lý SCMH", url: BASE_WEB_URL }],
      ],
    };

    await sendTelegramMessage(chatId, welcome, { replyMarkup: markup }, token);
    return;
  }

  // /nhacviec hoặc /diemtin hoặc 'hôm nay có gì'
  if (
    textLower.startsWith("/nhacviec") ||
    textLower.startsWith("/diemtin") ||
    textLower.includes("hôm nay") ||
    textLower.includes("nhắc việc")
  ) {
    const masterData = await getMasterAppState(db);
    const briefing = buildDailyBriefingMessage(masterData);
    await sendTelegramMessage(chatId, briefing.text, { replyMarkup: briefing.markup }, token);
    return;
  }

  // Tra cứu giá cũ (/gia hoặc 'giá ...' hoặc 'lịch sử ...')
  if (textLower.startsWith("/gia") || textLower.startsWith("giá ") || textLower.startsWith("lịch sử ")) {
    const masterData = await getMasterAppState(db);
    const res = await handlePriceLookup(rawText, db, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Tra cứu Nhà cung cấp & STK (/ncc hoặc 'stk ...' hoặc 'ncc ...')
  if (textLower.startsWith("/ncc") || textLower.startsWith("stk ") || textLower.startsWith("ncc ") || textLower.startsWith("sdt ")) {
    const masterData = await getMasterAppState(db);
    const res = await handleSupplierLookup(rawText, db, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Tra cứu PO (/po hoặc có dạng PO-...)
  if (textLower.startsWith("/po") || textLower.startsWith("po-")) {
    const masterData = await getMasterAppState(db);
    const res = handlePoLookup(rawText, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Tra cứu PR (/pr hoặc có dạng QC...)
  if (textLower.startsWith("/pr") || textLower.startsWith("qc") || textLower.includes("pr")) {
    const masterData = await getMasterAppState(db);
    const res = handlePrLookup(rawText, masterData);
    await sendTelegramMessage(chatId, res.text, { replyMarkup: res.markup }, token);
    return;
  }

  // Nếu người dùng gõ từ khóa thông thường, thử tìm giá hoặc PR
  const masterData = await getMasterAppState(db);
  const priceRes = await handlePriceLookup(rawText, db, masterData);
  if (!priceRes.text.includes("Không tìm thấy")) {
    await sendTelegramMessage(chatId, priceRes.text, { replyMarkup: priceRes.markup }, token);
    return;
  }

  // Phản hồi hướng dẫn nếu không hiểu
  let fallback = `🤖 <b>Trợ lý chưa hiểu yêu cầu: "${escapeHtml(rawText)}"</b>\n\n`;
  fallback += `💡 Bạn có thể thử các lệnh sau:\n`;
  fallback += `• <code>/gia Methanol</code> (Tra lịch sử giá mua)\n`;
  fallback += `• <code>/pr QC261106.2</code> (Xem tiến độ PR)\n`;
  fallback += `• <code>/ncc Đức Giang</code> (Xem STK và SĐT nhà cung cấp)\n`;
  fallback += `• <code>/nhacviec</code> (Xem hạn thanh toán & hàng về hôm nay)\n`;
  fallback += `• Hoặc gửi trực tiếp ảnh hóa đơn/chứng từ vào đây để lưu lên Web!`;

  await sendTelegramMessage(chatId, fallback, {}, token);
}

/**
 * 9. HÀM CHẠY CRON ĐỊNH KỲ (08:30 SÁNG HÀNG NGÀY)
 */
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
