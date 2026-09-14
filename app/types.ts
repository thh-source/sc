export type Item = {
  id: number;
  code: string;
  category: string;
  name: string;
  desc: string;
  spec: string;
  unit: string;
  qty: number;
  estimate: number;
};

export type Supplier = {
  id: number;
  code: string;
  name: string;
  shortName?: string;
  bankAccount: string;
  bank: string;
  address: string;
  contact: string;
  phone: string;
};

export type PurchaseHistory = {
  id: string;
  warehouseCode: string;
  warehouseName: string;
  itemCode: string;
  itemName: string;
  accountingDate: string;
  documentDate: string;
  documentNo: string;
  invoiceDate: string;
  invoiceNo: string;
  description: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  value: number;
  supplierCode: string;
  supplierName: string;
  supplierId: number;
  department: string;
};

export type QuoteMode = "before-vat" | "after-vat";

export type QuoteEntry = {
  price: string;
  note: string;
  priceMode?: QuoteMode;
  vatRate?: string;
  customColumns?: Record<string, string>;
};

export type Quote = Record<number, Record<number, QuoteEntry>>;

export type PR = {
  id: number;
  number: string;
  date: string;
  department: string;
  purpose: string;
  items: Item[];
  status: string;
  note?: string;
  quoteCustomColumns?: string[];
};

export type POAllocation = {
  prId: number;
  prNumber: string;
  prItemId: number;
  qty: number;
};

export type POItem = Item & {
  price: number;
  deliveryStatus: "Chưa giao" | "Giao một phần" | "Đã giao";
  deliveredQty: number;
  deliveryDate: string;
  allocations?: POAllocation[];
};

export type POCartLine = {
  id: string;
  item: Item;
  supplierId: number;
  price: number;
  priceBeforeVat?: number;
  allocation: POAllocation;
};

export type ApprovalRow = {
  id: string;
  prNumber: string;
  code: string;
  name: string;
  qty: number;
  unit: string;
  selectedSupplierId: number;
  prices: Record<number, number>;
};

export type ApprovalDraft = {
  number: string;
  date: string;
  department: string;
  prNumbers: string;
  purpose: string;
  intro: string;
  rows: ApprovalRow[];
  supplierIds: number[];
  note: string;
};

export type PODoc = {
  id: number;
  name: string;
  status: "Đã đủ" | "Còn thiếu" | "Chờ bổ sung";
  note: string;
};

export type Payment = {
  id: number;
  phase: string;
  percent: number;
  amount: number;
  status: "Chưa thanh toán" | "Đang xử lý" | "Đã thanh toán";
  date: string;
};

export type PO = {
  id: number;
  number: string;
  prNumber: string;
  supplierId: number;
  createdDate: string;
  expectedDate: string;
  status: string;
  items: POItem[];
  docs: PODoc[];
  payments: Payment[];
  note: string;
  contractNote?: string;
};

export type TrashItem = {
  id: string;
  type: "PR" | "PO" | "CONTRACT";
  label: string;
  deletedAt: string;
  expiresAt: string;
  data: PR | PO | { poId: number };
};

export type View =
  | "dashboard"
  | "prs"
  | "create"
  | "compare"
  | "suppliers"
  | "po-list"
  | "po-detail"
  | "contracts"
  | "project-contracts"
  | "approval"
  | "products"
  | "trash"
  | "settings";

export type ColumnKey =
  | "stt"
  | "code"
  | "category"
  | "name"
  | "desc"
  | "spec"
  | "unit"
  | "qty"
  | "estimate"
  | "amount";

export type SortState = { key: ColumnKey; direction: "asc" | "desc" } | null;

export type StoredState = {
  prs: PR[];
  products: Item[];
  suppliers: Supplier[];
  quotes: Quote;
  pos: PO[];
  items: Item[];
  quoteSupplierIds: number[];
  trash: TrashItem[];
  hiddenContractIds: number[];
  poCart: POCartLine[];
  quotesByPr: Record<number, Quote>;
  quoteSupplierIdsByPr: Record<number, number[]>;
  projectContracts: import("./ProjectContractManagement").ProjectContractWorkspace;
  quoteCompareMode?: QuoteMode;
  purchaseHistory?: PurchaseHistory[];
  purchaseHistoryImportIds?: string[];
};
