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
