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

