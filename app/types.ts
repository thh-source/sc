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
  isCompleted?: boolean;
  note?: string;
  quoteCustomColumns?: string[];
};

export type POAllocation = {
  prId: number;
  prNumber: string;
  prItemId: number;
  qty: number;
};

export type PODeliveryLog = {
  date: string;
  qty: number;
  note?: string;
  discrepancyReason?: string;
  senderName?: string;
  receiverName?: string;
  photoNames?: string[];
  signatureDataUrl?: string;
};

export type POItem = Item & {
  price: number;
  vatRate?: number;
  note?: string;
  deliveryStatus: "Chưa giao" | "Giao một phần" | "Đã giao";
  deliveredQty: number;
  deliveryDate: string;
  deliveryHistory?: PODeliveryLog[];
  allocations?: POAllocation[];
};

export const calcPOItemSubtotal = (
  item: { qty?: number; price?: number } | null | undefined,
): number => {
  if (!item) return 0;
  return (Number(item.qty) || 0) * (Number(item.price) || 0);
};

export const calcPOItemTotal = (
  item: { qty?: number; price?: number; vatRate?: number } | null | undefined,
): number => {
  if (!item) return 0;
  const sub = calcPOItemSubtotal(item);
  const vat = Number(item.vatRate) || 0;
  return Math.round(sub * (1 + vat / 100));
};

export const calcPOTotal = (
  po: { items?: { qty?: number; price?: number; vatRate?: number }[] } | null | undefined,
): number => {
  if (!po || !po.items) return 0;
  return po.items.reduce((sum, item) => sum + calcPOItemTotal(item), 0);
};

export const formatPONumber = (
  supplier: { shortName?: string; code?: string; name?: string } | null | undefined,
  createdDate?: string,
): string => {
  let abcd = (supplier?.shortName || "").trim();
  if (!abcd && supplier?.name) {
    const cleaned = supplier.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/\b(CONG TY|CTY|TNHH|CO PHAN|CP|MTV|TM|DV|SX|XNK|THUONG MAI|DICH VU|SAN XUAT|VIET NAM|VN)\b/gi, " ")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      abcd = words.slice(0, 2).join("").toUpperCase();
    }
  }
  if (!abcd) {
    abcd = (supplier?.code || "NCC").trim().toUpperCase();
  }
  abcd = abcd
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase() || "NCC";

  const rawDate = (createdDate || new Date().toISOString().slice(0, 10)).trim();
  let xyz = rawDate.replace(/\D/g, "");
  const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    xyz = `${isoMatch[3]}${isoMatch[2]}${isoMatch[1]}`;
  } else {
    const vnMatch = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (vnMatch) {
      xyz = `${vnMatch[1]}${vnMatch[2]}${vnMatch[3]}`;
    }
  }
  return `${abcd}-${xyz}`;
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
  isContract?: boolean;
  contractNumber?: string;
  contractDate?: string;
  contractValue?: number;
};

export type Payment = {
  id: number;
  phase: string;
  condition?: "advance" | "post" | "other";
  invoiceNo?: string;
  invoiceDate?: string;
  note?: string;
  paymentRequestId?: number;
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
  isCompleted?: boolean;
  items: POItem[];
  docs: PODoc[];
  payments: Payment[];
  note: string;
  contractNote?: string;
  contractNumber?: string;
  contractDate?: string;
};

export type ContractPO = PO & {
  contractNumber?: string;
  contractDate?: string;
  isContract?: boolean;
};

export const getPOContractInfo = (
  po: PO | null | undefined,
): {
  hasContract: boolean;
  contractNumber: string;
  contractDate: string;
  contractValue: number;
  contractDoc?: PODoc;
} => {
  if (!po) {
    return { hasContract: false, contractNumber: "", contractDate: "", contractValue: 0 };
  }
  const poTotal = calcPOTotal(po);
  const contractDoc = (po.docs || []).find(
    (d) =>
      d.isContract === true ||
      d.name?.trim().toLowerCase() === "hợp đồng" ||
      d.name?.trim().toLowerCase() === "hợp đồng mua bán"
  );
  if (contractDoc) {
    return {
      hasContract: true,
      contractNumber: (contractDoc.contractNumber || po.contractNumber || "").trim(),
      contractDate: (contractDoc.contractDate || po.contractDate || po.createdDate || "").trim(),
      contractValue: poTotal,
      contractDoc,
    };
  }
  if (po.contractNumber && po.contractNumber.trim()) {
    return {
      hasContract: true,
      contractNumber: po.contractNumber.trim(),
      contractDate: (po.contractDate || po.createdDate || "").trim(),
      contractValue: poTotal,
    };
  }
  return {
    hasContract: false,
    contractNumber: "",
    contractDate: "",
    contractValue: poTotal,
  };
};

export const formatContractDateVN = (dateStr?: string): string => {
  if (!dateStr) return "...";
  const s = dateStr.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return s || "...";
};

export const buildPOPaymentDescription = (
  po: PO,
  payment?: Payment | null,
  customPercent?: number,
): string => {
  const poTotal = calcPOTotal(po);
  let stageNum = 1;
  let pct = customPercent ?? 100;

  if (payment) {
    const phaseMatch = (payment.phase || "").match(/đợt\s*(\d+)/i);
    if (phaseMatch) {
      stageNum = Number(phaseMatch[1]) || 1;
    } else if (po.payments && po.payments.length > 0) {
      const idx = po.payments.findIndex((p) => p.id === payment.id);
      if (idx >= 0) stageNum = idx + 1;
    }
    if (payment.percent !== undefined && payment.percent > 0) {
      pct = payment.percent;
    } else if (poTotal > 0 && payment.amount > 0) {
      pct = Math.round((payment.amount / poTotal) * 100);
    }
  }

  const contractInfo = getPOContractInfo(po);
  if (contractInfo.hasContract) {
    const cNo = contractInfo.contractNumber || po.number || "...";
    const cDate = formatContractDateVN(contractInfo.contractDate || po.createdDate);
    return `Thanh toán đợt ${stageNum} ${pct}% hợp đồng số ${cNo} ngày ${cDate}`;
  }
  return `Thanh toán đợt ${stageNum} ${pct}% tiền vật tư hàng hóa`;
};

export const isContractPO = (
  po: { number?: string; contractNote?: string; contractNumber?: string; docs?: PODoc[] } | null | undefined,
): boolean => {
  if (!po) return false;
  if (po.docs && po.docs.some((d) => d.isContract || d.name?.trim().toLowerCase() === "hợp đồng")) {
    return true;
  }
  return Boolean(po.contractNumber || po.number?.startsWith("HĐ-") || po.contractNote);
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
  | "settings"
  | "guide";

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
  isCompleted?: boolean;
  paidAt?: string;
  doc_supplement?: string;
  address?: string;
  account_no?: string;
  bank?: string;
  created_by_name?: string;
  due_date?: string;
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
  source_type?: string;
  source_number?: string;
  specification?: string;
  isCompleted?: boolean;
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

export type ApprovalColumnMode = "basic" | "origin" | "extended";

export type ApprovalSupplierColumn = {
  colId: string;
  supplierId?: number;
  supplierName: string;
  shortName: string;
  isSelected: boolean;
  deliveryTime?: string;
};

export type ApprovalSupplierQuoteLine = {
  lineId: string;
  quotedProduct?: string;
  origin?: string;
  unitPrice: number;
  qty: number;
  amount: number;
  note?: string;
};

export type ApprovalItemRow = {
  rowId: string;
  stt: number;
  itemCode?: string;
  itemName: string;
  spec?: string;
  qty: number;
  unit: string;
  supplierQuotes: Record<string, ApprovalSupplierQuoteLine[]>;
};

export type ApprovalRequest = {
  id: number;
  requestNumber: string;
  sourceType: "compare" | "pr" | "manual";
  prId?: number;
  prNumber: string;
  createdDate: string;
  department: string;
  requestingDepartment?: string;
  noteRef: string;
  section1Title: string;
  columnMode: ApprovalColumnMode;
  showQuotedProduct?: boolean;
  quotedProductHeader?: string;
  showSupplierQty?: boolean;
  showDeliveryTimeRow: boolean;
  printOrientation: "portrait" | "landscape";
  signSpaceHeight?: number;
  supplierColumns: ApprovalSupplierColumn[];
  rows: ApprovalItemRow[];
  recommendedSupplierName: string;
  deliveryTerms: string;
  paymentTerms: string;
  reasons: string[];
  approverLeader: string;
  approverDeptHead: string;
  requesterName: string;
  status: "Nháp" | "Chờ phê duyệt" | "Đã phê duyệt" | "Đã tạo PO";
  isCompleted?: boolean;
  linkedPoId?: number;
  linkedPoNumber?: string;
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
  approvalRequests?: ApprovalRequest[];
};
