import { ColumnKey, Item, SortState, PurchaseHistory, Supplier, QuoteEntry, QuoteMode, PR, PO } from "./types";

export const BASE_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "stt", label: "STT" },
  { key: "code", label: "Mã hàng" },
  { key: "category", label: "Phân loại" },
  { key: "name", label: "Tên vật tư hàng hóa" },
  { key: "desc", label: "Mô tả kỹ thuật" },
  { key: "spec", label: "Quy cách" },
  { key: "unit", label: "ĐVT" },
  { key: "qty", label: "Số lượng" },
  { key: "estimate", label: "Đơn giá dự kiến" },
  { key: "amount", label: "Thành tiền dự kiến" },
];

export const valueOf = (item: Item, key: ColumnKey, index = 0): string | number =>
  key === "stt"
    ? index + 1
    : key === "amount"
      ? item.qty * item.estimate
      : item[key];

export const reorder = (order: ColumnKey[], from: ColumnKey, to: ColumnKey) => {
  const next = [...order],
    a = next.indexOf(from),
    b = next.indexOf(to);
  if (a < 0 || b < 0 || a === b) return next;
  next.splice(a, 1);
  next.splice(b, 0, from);
  return next;
};

export const applyTools = (
  rows: Item[],
  order: ColumnKey[],
  filters: Partial<Record<ColumnKey, string[]>>,
  sort: SortState,
) => {
  const filtered = rows.filter((item, index) =>
    order.every(
      (key) =>
        !filters[key]?.length ||
        filters[key]!.includes(String(valueOf(item, key, index))),
    ),
  );
  if (!sort) return filtered;
  return [...filtered].sort((a, b) => {
    const av = valueOf(a, sort.key),
      bv = valueOf(b, sort.key);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "vi");
    return sort.direction === "asc" ? cmp : -cmp;
  });
};

export type PurchaseHistorySeed = {
  suppliers: Supplier[];
  products: Item[];
  transactions: PurchaseHistory[];
};

export const makeId = () => {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return (Date.now() % 1_000_000_000) * 1_000_000 + (random[0] % 1_000_000);
};

export const emptyItem = (index: number): Item => ({
  id: makeId(),
  code: `VT-${String(index + 1).padStart(3, "0")}`,
  category: "",
  name: "",
  desc: "",
  spec: "",
  unit: "Cái",
  qty: 1,
  estimate: 0,
});

export const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);

export const dateVN = (s: string) =>
  s ? new Intl.DateTimeFormat("vi-VN").format(new Date(s)) : "—";

export const DEFAULT_VAT_RATE = 10;

export const quoteDefaults = (entry?: Partial<QuoteEntry>): QuoteEntry => ({
  price: entry?.price || "",
  note: entry?.note || "",
  priceMode: entry?.priceMode || "before-vat",
  vatRate: entry?.vatRate || String(DEFAULT_VAT_RATE),
});

export const quoteAmount = (entry?: Partial<QuoteEntry>) => Number(entry?.price) || 0;

export const quoteVatRate = (entry?: Partial<QuoteEntry>) => {
  const rate = Number(entry?.vatRate ?? DEFAULT_VAT_RATE);
  return Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_VAT_RATE;
};

export const quoteBeforeVat = (entry?: Partial<QuoteEntry>) => {
  const amount = quoteAmount(entry);
  if (!amount) return 0;
  return (entry?.priceMode || "before-vat") === "after-vat"
    ? amount / (1 + quoteVatRate(entry) / 100)
    : amount;
};

export const quoteAfterVat = (entry?: Partial<QuoteEntry>) => {
  const amount = quoteAmount(entry);
  if (!amount) return 0;
  return (entry?.priceMode || "before-vat") === "after-vat"
    ? amount
    : amount * (1 + quoteVatRate(entry) / 100);
};

export const quoteComparePrice = (entry: Partial<QuoteEntry> | undefined, mode: QuoteMode) =>
  mode === "after-vat" ? quoteAfterVat(entry) : quoteBeforeVat(entry);

export const priceStats = (rows: PurchaseHistory[]) => {
  const priced = rows.filter((row) => row.unitPrice > 0),
    latest = [...priced].sort((a, b) =>
      (b.documentDate || b.accountingDate).localeCompare(
        a.documentDate || a.accountingDate,
      ),
    )[0],
    min = priced.length ? Math.min(...priced.map((row) => row.unitPrice)) : 0,
    max = priced.length ? Math.max(...priced.map((row) => row.unitPrice)) : 0,
    totalValue = rows.reduce((sum, row) => sum + row.value, 0),
    totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
  return { latest, min, max, totalValue, totalQty, count: rows.length };
};

export const mergeHistorySeed = (
  currentSuppliers: Supplier[],
  currentProducts: Item[],
  currentHistory: PurchaseHistory[],
  seed: PurchaseHistorySeed,
) => {
  const supplierByCode = new Map(currentSuppliers.map((supplier) => [supplier.code, supplier])),
    productByCode = new Map(currentProducts.map((product) => [product.code, product])),
    historyById = new Map(currentHistory.map((row) => [row.id, row]));
  seed.suppliers.forEach((supplier) => {
    const existing = supplierByCode.get(supplier.code);
    supplierByCode.set(supplier.code, existing ? { ...supplier, ...existing } : supplier);
  });
  seed.products.forEach((product) => {
    const existing = productByCode.get(product.code);
    productByCode.set(
      product.code,
      existing
        ? {
            ...product,
            ...existing,
            estimate: existing.estimate || product.estimate,
            unit: existing.unit || product.unit,
            category: existing.category || product.category,
          }
        : product,
    );
  });
  seed.transactions.forEach((row) => historyById.set(row.id, row));
  return {
    suppliers: [...supplierByCode.values()],
    products: [...productByCode.values()],
    history: [...historyById.values()],
  };
};

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

export const emptyPR: PR = {
  id: 0,
  number: "",
  date: "",
  department: "",
  purpose: "",
  items: [],
  status: "",
};

export const emptyPO: PO = {
  id: 0,
  number: "",
  prNumber: "",
  supplierId: 0,
  createdDate: "",
  expectedDate: "",
  status: "",
  items: [],
  docs: [],
  payments: [],
  note: "",
};
