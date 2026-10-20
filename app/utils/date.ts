// app/utils/date.ts

export const dateVN = (s: string) =>
  s ? new Intl.DateTimeFormat("vi-VN").format(new Date(s)) : "—";

export function localToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parsePrintDate(dStr: string) {
  if (!dStr) {
    const today = new Date();
    return {
      day: String(today.getDate()).padStart(2, "0"),
      month: String(today.getMonth() + 1).padStart(2, "0"),
      year: String(today.getFullYear()),
    };
  }
  const clean = dStr.split("T")[0];
  const parts = clean.includes("-") ? clean.split("-") : clean.split("/");
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return {
        year: parts[0],
        month: parts[1].padStart(2, "0"),
        day: parts[2].padStart(2, "0"),
      };
    } else {
      return {
        day: parts[0].padStart(2, "0"),
        month: parts[1].padStart(2, "0"),
        year: parts[2],
      };
    }
  }
  const today = new Date();
  return {
    day: String(today.getDate()).padStart(2, "0"),
    month: String(today.getMonth() + 1).padStart(2, "0"),
    year: String(today.getFullYear()),
  };
}

export function parseFlexibleDate(val: string): string {
  if (!val) return "";
  const s = String(val).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)) {
    const delimiter = s.includes("/") ? "/" : "-";
    const [d, m, y] = s.split(delimiter);
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YY or DD-MM-YY
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2}$/.test(s)) {
    const delimiter = s.includes("/") ? "/" : "-";
    const [d, m, y] = s.split(delimiter);
    const fullYear = Number(y) > 50 ? `19${y}` : `20${y}`;
    return `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Excel serial number
  const num = Number(s);
  if (!isNaN(num) && num > 20000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return s;
}
