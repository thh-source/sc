// app/utils/format.ts
export const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);

export function parseMoney(val: number | string | undefined): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, "").trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

export function fmtMoney(val: number | string | undefined): string {
  const num = parseMoney(val);
  return num === 0 ? "0" : num.toLocaleString("vi-VN");
}

export function plainAmount(val: string | number): string {
  if (val === undefined || val === null) return "";
  return String(val).replace(/,/g, "").trim();
}

export const makeId = () => {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return (Date.now() % 1_000_000_000) * 1_000_000 + (random[0] % 1_000_000);
};

export function normName(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeSearchText(str: string): string {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateShortName(name: string): string {
  if (!name) return "";
  let s = name.replace(/^(Công ty|Cty|Chi nhánh|Tổng công ty|Tập đoàn)\s+/i, "");
  s = s.replace(/\b(TNHH|CP|MTV|TM|DV|Thương mại|Dịch vụ|Cổ phần|Đầu tư|Phát triển|Sản xuất|Dược phẩm|Hóa chất|Thiết bị|Vật tư|Y tế)\b/gi, "");
  s = s.replace(/[()[\],-]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || name;
}

const CHU_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function docBlockBaSo(n: number, showZeroHundred: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;
  let res = "";

  if (tram > 0 || showZeroHundred) {
    res += CHU_SO[tram] + " trăm ";
  }

  if (chuc > 1) {
    res += CHU_SO[chuc] + " mươi ";
    if (donvi === 1) res += "mốt ";
    else if (donvi === 5) res += "lăm ";
    else if (donvi > 0) res += CHU_SO[donvi] + " ";
  } else if (chuc === 1) {
    res += "mười ";
    if (donvi === 5) res += "lăm ";
    else if (donvi > 0) res += CHU_SO[donvi] + " ";
  } else {
    if ((tram > 0 || showZeroHundred) && donvi > 0) {
      res += "lẻ " + CHU_SO[donvi] + " ";
    } else if (donvi > 0) {
      res += CHU_SO[donvi] + " ";
    }
  }

  return res.trim();
}

export function moneyWords(x: { amount: number | string; currency: string }): string {
  const num = typeof x.amount === "number" ? x.amount : parseMoney(x.amount);
  if (!num || isNaN(num) || num <= 0) return "Không đồng";

  const rounded = Math.round(num);
  const str = String(rounded);
  const blocks: number[] = [];

  for (let i = str.length; i > 0; i -= 3) {
    blocks.unshift(Number(str.substring(Math.max(0, i - 3), i)));
  }

  const donViLop = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  let words = "";

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b > 0) {
      const showZero = i > 0;
      const blockStr = docBlockBaSo(b, showZero);
      const unit = donViLop[blocks.length - 1 - i];
      words += (words ? " " : "") + blockStr + (unit ? " " + unit : "");
    }
  }

  words = words.trim();
  if (!words) return "Không đồng";

  words = words.charAt(0).toUpperCase() + words.slice(1);
  const currUpper = (x.currency || "VND").toUpperCase();
  if (currUpper === "USD") {
    return words + " đô la Mỹ chẵn";
  } else if (currUpper === "EUR") {
    return words + " euro chẵn";
  }
  return words + " đồng chẵn";
}
