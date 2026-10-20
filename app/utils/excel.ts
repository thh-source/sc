// app/utils/excel.ts

export const excelNumber = (
  value: string | number,
  label: string,
  rowNumber: number,
  required = false,
) => {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) {
    if (required) throw new Error(`Dòng ${rowNumber}: thiếu ${label}`);
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed))
    throw new Error(`Dòng ${rowNumber}: ${label} không phải là số`);
  if (parsed < 0) throw new Error(`Dòng ${rowNumber}: ${label} không được âm`);
  return parsed;
};

export function splitCsvOrTsvLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((s) => s.trim().replace(/^["']|["']$/g, ""));
  }
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

export function parseExcelText(
  text: string,
): { headers: string[]; rows: Record<string, string>[] } {
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return { headers: [], rows: [] };

  const headers = splitCsvOrTsvLine(rawLines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    const cells = splitCsvOrTsvLine(rawLines[i]);
    if (cells.every((c) => !c)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] !== undefined ? cells[idx] : "";
    });
    rows.push(row);
  }

  return { headers, rows };
}
