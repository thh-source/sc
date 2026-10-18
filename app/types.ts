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
  | "payment"
  | "handover"
  | "print-templates"
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

export type PaymentDetailLine = {
  id?: string | number;
  description: string;
  invoice_no: string;
  invoice_date?: string;
  amount: number | string;
  note?: string;
};

export type PaymentRequestEntry = {
  id: number;
  legacy_stt?: string | number;
  beneficiary_id?: number;
  payee_name: string;
  group_id?: number | string;
  group_code?: string;
  description: string;
  item_name?: string;
  invoice_no?: string;
  invoice_date?: string;
  amount: number | string;
  currency: "VND" | "USD" | "EUR" | string;
  documents: string[];
  request_date: string;
  payment_type: string;
  status: string;
  doc_supplement?: string;
  address?: string;
  account_no?: string;
  bank?: string;
  created_by_name?: string;
  lines?: PaymentDetailLine[];
};

export type PaymentGroup = {
  id: number;
  code: string;
  name: string;
  payee_name?: string;
  total_amount: number | string;
  currency: string;
  note?: string;
};

export type PaymentBeneficiary = {
  id: number;
  name: string;
  short_name?: string;
  address?: string;
  account_no?: string;
  bank?: string;
};

export type PaymentHandoverItem = {
  id: number;
  department: string;
  item_name: string;
  unit: string;
  quantity_doc: string | number;
  quantity_pass: string | number;
  quantity_fail: string | number;
  note: string;
  handover_date: string;
  sender_name?: string;
  sender_dept?: string;
  receiver_name?: string;
};

export type PaymentPrintTemplate = {
  company_name: string;
  form_code: string;
  form_title: string;
  recipient_label: string;
  recipients: string;
  label_requester: string;
  default_requester_name: string;
  label_department: string;
  department_name: string;
  intro_text: string;
  label_payee: string;
  label_address: string;
  label_account: string;
  label_bank: string;
  label_description: string;
  deadline_label: string;
  deadline_val: string;
  table_title: string;
  col_stt: string;
  col_invoice: string;
  col_item: string;
  col_amount: string;
  col_note: string;
  col_total: string;
  label_money_words: string;
  label_docs: string;
  date_location: string;
  sign1_title: string;
  sign1_name: string;
  sign2_title: string;
  sign2_name: string;
  sign3_title: string;
  sign3_name: string;
  sign4_title: string;
  sign4_name: string;
  draft_warning: string;
};

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
  projectContracts?: any;
  quoteCompareMode?: QuoteMode;
  purchaseHistory?: PurchaseHistory[];
  purchaseHistoryImportIds?: string[];
  paymentRequests?: PaymentRequestEntry[];
  paymentGroups?: PaymentGroup[];
  paymentBeneficiaries?: PaymentBeneficiary[];
  paymentHandovers?: PaymentHandoverItem[];
  paymentTemplate?: PaymentPrintTemplate;
};
