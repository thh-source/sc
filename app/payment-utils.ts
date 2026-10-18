import { PaymentPrintTemplate, PaymentRequestEntry } from "./types";

export const PAID_STATUSES = [
  "Done",
  "Đã thanh toán (chờ chứng từ)",
  "Đã thanh toán (chờ giao hàng)",
];

export const PAYMENT_STATUSES = [
  "Done",
  "Đã thanh toán (chờ chứng từ)",
  "Đã thanh toán (chờ giao hàng)",
  "Đã giao KT, chờ đi tiền",
];

export const PAYMENT_TYPES = [
  "TT trước 100%",
  "TT sau 100%",
  "TT lần 1",
  "TT lần 2",
  "TT lần 3",
  "TT lần 4",
];

export const DEFAULT_DOCS = [
  "ĐNTT",
  "ĐNPD",
  "Hóa đơn",
  "Hợp đồng",
  "BB bàn giao",
  "Bảo lãnh",
  "Packing List",
  "Invoice",
  "DQ",
  "CO",
  "CQ",
  "IQ/OQ",
  "Phụ lục",
  "FAT",
  "BB nghiệm thu",
  "Bảng tổng hợp khối lượng",
  "Khác",
];

export const BANK_SUGGESTIONS = [
  "Vietcombank",
  "Techcombank",
  "BIDV",
  "Vietinbank",
  "MB Bank",
  "VPBank",
  "ACB",
  "Sacombank",
  "HDBank",
  "TPBank",
  "Agribank",
  "VIB",
  "SHB",
  "Eximbank",
  "MSB",
  "SeABank",
  "OCB",
  "Bac A Bank",
  "PVcomBank",
  "LPBank",
  "LienVietPostBank",
  "Shinhan Bank",
  "Woori Bank",
  "Public Bank",
  "Standard Chartered",
  "HSBC",
  "Hong Leong Bank",
  "UOB",
  "CIMB",
  "Kienlongbank",
  "BaoViet Bank",
  "Vietbank",
  "Nam A Bank",
  "Saigonbank",
  "NCB",
  "PGBank",
  "BVBank",
  "Viet Capital Bank",
  "Viet A Bank",
  "OceanBank",
  "GPBank",
  "CB Bank",
];

export const PHENIKAA_PHARMA_LOGO_BASE64 = "data:image/png;base64,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";


export const DEFAULT_PAYMENT_TEMPLATE: PaymentPrintTemplate = {
  company_name: "CÔNG TY CỔ PHẦN DƯỢC PHẨM PHENIKAA",
  form_code: "Mẫu số 01 – TT",
  form_title: "GIẤY ĐỀ NGHỊ THANH TOÁN BẰNG CHUYỂN KHOẢN",
  recipient_label: "Kính gửi:",
  recipients: "- BAN LÃNH ĐẠO CÔNG TY\n- PHÒNG TÀI CHÍNH - KẾ TOÁN",
  label_requester: "Họ tên người đề nghị:",
  default_requester_name: "Trần Hải Hà",
  label_department: "Bộ phận:",
  department_name: "Phòng Cung Ứng",
  intro_text:
    "Đề nghị xét duyệt và chuyển tiền cho đơn vị đã cung cấp hàng hóa, dịch vụ dưới đây:",
  label_payee: "Đơn vị hưởng lợi:",
  label_address: "Địa chỉ:",
  label_account: "Tài khoản:",
  label_bank: "Ngân hàng:",
  label_description: "Nội dung chuyển tiền:",
  deadline_label: "Thời hạn chuyển tiền:",
  deadline_val: "Trong vòng 3 ngày kể từ ngày đề nghị",
  table_title: "Số tiền chuyển theo bảng kê dưới đây:",
  col_stt: "TT",
  col_invoice: "Số hóa đơn (nếu có)",
  col_item: "Tên hàng hóa/dịch vụ",
  col_amount: "Số tiền",
  col_note: "Ghi chú",
  col_total: "Tổng cộng",
  label_money_words: "Số tiền bằng chữ:",
  label_docs: "Chứng từ đi kèm",
  date_location: "Hà Nội",
  sign1_title: "Lãnh đạo phê duyệt",
  sign1_name: "Đinh Anh Hào",
  sign2_title: "Kế toán trưởng",
  sign2_name: "Nguyễn Thị Nga",
  sign3_title: "Trưởng bộ phận",
  sign3_name: "Lưu Thị Thanh Xuân",
  sign4_title: "Người đề nghị TT",
  sign4_name: "",
  draft_warning: "BẢN NHÁP – CHƯA XÁC NHẬN TIỀN TỆ",
};

export function normName(str: string): string {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fmtMoney(val: number | string | undefined): string {
  const n = Number(String(val ?? "").replace(/,/g, ""));
  if (isNaN(n) || !isFinite(n)) return "0";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export function plainAmount(val: string | number): string {
  return String(val ?? "").replace(/[^\d.-]/g, "");
}

export function moneyWords(x: { amount: number | string; currency: string }): string {
  const n = Number(String(x.amount ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || isNaN(n)) return "Chưa có số tiền hợp lệ";

  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

  function group(num: number, full: boolean) {
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;
    const out: string[] = [];

    if (h || full) {
      out.push(digits[h] + " trăm");
    }
    if (t > 1) {
      out.push(digits[t] + " mươi");
      if (u) out.push(u === 1 ? "mốt" : u === 5 ? "lăm" : digits[u]);
    } else if (t === 1) {
      out.push("mười");
      if (u) out.push(u === 5 ? "lăm" : digits[u]);
    } else if (u) {
      if (h || full) out.push("lẻ");
      out.push(digits[u]);
    }
    return out.join(" ");
  }

  function whole(num: number) {
    if (num === 0) return "không";
    const parts: string[] = [];
    const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ"];
    let i = 0;
    while (num > 0 && i < units.length) {
      const v = num % 1000;
      if (v) parts.unshift(group(v, i > 0 && num >= 1000) + " " + units[i]);
      num = Math.floor(num / 1000);
      i++;
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  const main = whole(Math.floor(n));
  const decimals = Math.round((n - Math.floor(n)) * 100);
  const end =
    x.currency === "USD"
      ? "đô la Mỹ"
      : x.currency === "EUR"
      ? "euro"
      : x.currency === "VND"
      ? "đồng"
      : "(chưa xác nhận loại tiền)";

  const w = main + (decimals ? " phẩy " + whole(decimals) : "") + " " + end;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function parsePrintDate(dStr: string) {
  if (!dStr) {
    const now = new Date();
    return {
      d: String(now.getDate()).padStart(2, "0"),
      m: String(now.getMonth() + 1).padStart(2, "0"),
      y: String(now.getFullYear()),
    };
  }
  const parts = dStr.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return { d: parts[2].padStart(2, "0"), m: parts[1].padStart(2, "0"), y: parts[0] };
    }
    return { d: parts[0].padStart(2, "0"), m: parts[1].padStart(2, "0"), y: parts[2] };
  }
  const now = new Date();
  return {
    d: String(now.getDate()).padStart(2, "0"),
    m: String(now.getMonth() + 1).padStart(2, "0"),
    y: String(now.getFullYear()),
  };
}

export function printEntries(x: PaymentRequestEntry) {
  if (Array.isArray(x.lines) && x.lines.length > 0) {
    return x.lines.map((l, i, arr) => ({
      ...l,
      description:
        String(l.description || "").trim() || (i === 0 ? x.item_name || "" : ""),
      invoice_no:
        String(l.invoice_no || "").trim() || (arr.length === 1 ? x.invoice_no || "" : ""),
      amount:
        arr.length === 1 && (!l.amount || Number(l.amount) === 0) && Number(x.amount) > 0
          ? x.amount
          : l.amount,
    }));
  }
  return [
    {
      description: x.item_name || x.description || "",
      invoice_no: x.invoice_no || "",
      amount: x.amount,
    },
  ];
}

export function parseFlexibleDate(val: string): string {
  let s = String(val || "").trim().replace(/[\/.\-\s]+$/, "");
  if (!s) return "";
  const currentYear = new Date().getFullYear();

  // 1. ISO format YYYY-MM-DD
  let iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    let y = parseInt(iso[1], 10);
    let m = parseInt(iso[2], 10);
    let d = parseInt(iso[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let maxDays = new Date(y, m, 0).getDate();
      if (d > maxDays) d = maxDays;
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    }
  }

  // 2. DD/MM or DD/MM/YYYY or DD/MM/YY with / . - or space
  let dmy = s.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?$/);
  if (!dmy) dmy = s.match(/^(\d{1,2})\s+(\d{1,2})(?:\s+(\d{2,4}))?$/);
  if (dmy) {
    let d = parseInt(dmy[1], 10);
    let m = parseInt(dmy[2], 10);
    let yStr = dmy[3];
    let y = currentYear;
    if (yStr) {
      y = yStr.length === 2 ? parseInt("20" + yStr, 10) : parseInt(yStr, 10);
    }
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let maxDays = new Date(y, m, 0).getDate();
      if (d > maxDays) d = maxDays;
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    }
  }

  // 3. Continuous digits: 4 digits (DDMM), 6 digits (DDMMYY), 8 digits (DDMMYYYY)
  let digits = s.replace(/\D/g, "");
  if (digits.length === 4) {
    let d = parseInt(digits.slice(0, 2), 10);
    let m = parseInt(digits.slice(2, 4), 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let maxDays = new Date(currentYear, m, 0).getDate();
      if (d > maxDays) d = maxDays;
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${currentYear}`;
    }
  } else if (digits.length === 6) {
    let d = parseInt(digits.slice(0, 2), 10);
    let m = parseInt(digits.slice(2, 4), 10);
    let y = parseInt("20" + digits.slice(4, 6), 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let maxDays = new Date(y, m, 0).getDate();
      if (d > maxDays) d = maxDays;
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    }
  } else if (digits.length === 8) {
    let d = parseInt(digits.slice(0, 2), 10);
    let m = parseInt(digits.slice(2, 4), 10);
    let y = parseInt(digits.slice(4, 8), 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let maxDays = new Date(y, m, 0).getDate();
      if (d > maxDays) d = maxDays;
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    }
  }

  let p = parsePrintDate(s);
  if (p) {
    return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
  }

  return s;
}

export function splitCsvOrTsvLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((c) => c.trim().replace(/^"|"$/g, ""));
  }
  const parts: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      parts.push(cur.trim().replace(/^"|"$/g, ""));
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur.trim().replace(/^"|"$/g, ""));
  return parts;
}

export function parseExcelText(
  rawText: string,
  defaultDept: string,
  defaultDate: string
): any[] {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: any[] = [];
  const today = defaultDate || new Date().toISOString().slice(0, 10);
  let activeDept = defaultDept || "";

  for (const line of lines) {
    const deptMatch = line.match(/bộ phận:\s*([^\t,\r\n]+)/i);
    if (
      deptMatch &&
      deptMatch[1].trim() &&
      !deptMatch[1].includes("…") &&
      !deptMatch[1].toLowerCase().includes("cung ứng") &&
      !deptMatch[1].toLowerCase().includes("khcu")
    ) {
      activeDept = deptMatch[1].trim();
      continue;
    }
    if (line.toLowerCase().includes("người nhận hàng")) {
      const addrMatch = line.match(/địa chỉ:\s*([^\t,\r\n]+)/i);
      if (
        addrMatch &&
        addrMatch[1].trim() &&
        !addrMatch[1].includes("…") &&
        !addrMatch[1].toLowerCase().includes("khcu")
      ) {
        activeDept = addrMatch[1].trim();
      }
      continue;
    }

    const parts = splitCsvOrTsvLine(line);
    if (!parts.length) continue;

    const firstLower = parts[0].toLowerCase();
    if (
      firstLower === "stt" ||
      firstLower === "tt" ||
      firstLower.startsWith("bộ phận:") ||
      firstLower.includes("tên hàng hóa") ||
      firstLower.includes("biên bản bàn giao") ||
      firstLower.includes("chúng tôi gồm") ||
      firstLower.includes("hôm nay") ||
      firstLower.includes("kết luận") ||
      firstLower.includes("tại công ty") ||
      firstLower.includes("người giao hàng")
    )
      continue;
    if (parts.every((p) => !p)) continue;

    let item_name = "",
      unit = "Cái",
      qty_doc = "1",
      qty_pass = "",
      qty_fail = "",
      note = "";

    let startIndex = 0;
    if (/^\d+$/.test(parts[0]) && parts.length > 1) {
      startIndex = 1;
    }

    const cols = parts.slice(startIndex);
    if (cols.length === 1) {
      item_name = cols[0];
    } else if (cols.length === 2) {
      item_name = cols[0];
      if (/^[0-9.,]+$/.test(cols[1])) qty_doc = cols[1];
      else unit = cols[1];
    } else if (cols.length === 3) {
      item_name = cols[0];
      unit = cols[1] || "Cái";
      qty_doc = cols[2] || "1";
    } else if (cols.length === 4) {
      item_name = cols[0];
      unit = cols[1] || "Cái";
      qty_doc = cols[2] || "1";
      note = cols[3] || "";
    } else if (cols.length === 5) {
      item_name = cols[0];
      unit = cols[1] || "Cái";
      qty_doc = cols[2] || "1";
      qty_pass = cols[3] || "";
      note = cols[4] || "";
    } else if (cols.length >= 6) {
      item_name = cols[0];
      unit = cols[1] || "Cái";
      qty_doc = cols[2] || "1";
      qty_pass = cols[3] || "";
      qty_fail = cols[4] || "";
      note = cols[5] || "";
    }

    if (
      !item_name ||
      item_name.startsWith("Biên bản") ||
      item_name.startsWith("Tại Công ty")
    )
      continue;

    rows.push({
      department: activeDept,
      item_name,
      unit,
      quantity_doc: qty_doc,
      quantity_pass: qty_pass,
      quantity_fail: qty_fail,
      note,
      handover_date: today,
      sender_name: "Trần Hải Hà",
      sender_dept: "Phòng KHCU",
      receiver_name: "",
    });
  }
  return rows;
}


