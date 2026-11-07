import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Trash2,
  Truck,
  Plus,
  Check,
  RotateCcw,
  CreditCard,
  FileDown,
  Printer,
  ClipboardCheck,
  Table,
  LayoutGrid,
  CheckCircle2,
  Circle,
  Link2,
  AlertCircle,
  Package,
  ExternalLink,
  Building2,
  FolderCheck,
  Clock,
  Layers,
} from "lucide-react";
import {
  Supplier,
  PO,
  POItem,
  PODoc,
  Payment,
  ApprovalRequest,
  PR,
  PaymentRequestEntry,
  PaymentHandoverItem,
  isContractPO,
  calcPOItemSubtotal,
  calcPOItemTotal,
  calcPOTotal,
  formatPONumber,
  generatePOCode,
  isPONumberExists,
  TrashItem,
} from "../types";
import { fmt, dateVN, makeId, generateShortName } from "../utils";
import { cleanExcelNumber, parseExcelClipboard } from "../utils/approvalSamples";
import { BANK_SUGGESTIONS } from "../payment-utils";
import { SupplierSearchCombobox } from "./SupplierSearchCombobox";
import VisualTimeline from "./VisualTimeline";
import DocumentManager from "./DocumentManager";
import { DocFlowLinks } from "./DocFlowLinks";
import { POPaymentLinkModal } from "./POPaymentLinkModal";
import { isPaymentCompleted } from "../utils/paymentSync";
import { InvoiceScanControl } from "./InvoiceScanControl";
import { resolveDocFlow } from "../utils/docFlow";
import { isPOCompleted, calcPODeliveryStats, calcPOItemDeliveryStats } from "../utils/paymentSync";
import { PODeliveryModal, POItemsMobileCards, DeliveryConfirmPayload } from "./PODeliveryMobileSheet";
import { POHandoverBatchSection } from "./POHandoverBatchSection";

export type POTabId = "supplier" | "documents" | "payments" | "timeline" | "items" | "all";

export function PODetail({
  po,
  pos = [],
  trash = [],
  suppliers,
  setSuppliers,
  onUpdate,
  onBack,
  workspaceId,
  readOnly = false,
  onStatus,
  onCreateHandover,
  onCreatePaymentRequest,
  onOpenGeneralPaymentRequest,
  onPrintPaymentRequest,
  onNavigateToPayment,
  onSave,
  onAddSupplier,
  approvalRequests = [],
  prs = [],
  paymentRequests = [],
  paymentHandovers = [],
  paymentTemplate,
  onNavigate,
  onDelete,
  onUpdatePaymentRequest,
  onUpdateHandovers,
}: {
  po: PO;
  pos?: PO[];
  trash?: TrashItem[];
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onUpdate: (po: PO) => void;
  onBack: () => void;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
  onCreateHandover?: (po: PO) => void;
  onCreatePaymentRequest?: (po: PO, payment: Payment) => void;
  onOpenGeneralPaymentRequest?: (po: PO) => void;
  onPrintPaymentRequest?: (paymentRequestId: number) => void;
  paymentTemplate?: any;
  onNavigateToPayment?: (reqId?: number) => void;
  onSave?: () => Promise<void> | void;
  onAddSupplier?: (supplier: Supplier) => void;
  approvalRequests?: ApprovalRequest[];
  prs?: PR[];
  paymentRequests?: PaymentRequestEntry[];
  paymentHandovers?: PaymentHandoverItem[];
  onNavigate?: (route: any) => void;
  onDelete?: (po: PO) => void;
  onUpdatePaymentRequest?: (updated: PaymentRequestEntry) => void;
  onUpdateHandovers?: (handovers: PaymentHandoverItem[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [linkingStage, setLinkingStage] = useState<Payment | null>(null);

  const poDeliveryStats = useMemo(() => {
    return calcPODeliveryStats(po, paymentHandovers);
  }, [po, paymentHandovers]);
  const savedNoticeTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (savedNoticeTimerRef.current) clearTimeout(savedNoticeTimerRef.current);
    };
  }, []);

  // Batch Delivery Modal State
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [batchDeliveryDate, setBatchDeliveryDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [batchSelected, setBatchSelected] = useState<Record<number, boolean>>({});
  const [batchQty, setBatchQty] = useState<Record<number, number>>({});
  const [batchItemDate, setBatchItemDate] = useState<Record<number, string>>({});

  // Import from ĐNPĐ Modal State
  const [showImportApprovalModal, setShowImportApprovalModal] = useState(false);
  const [itemsViewMode, setItemsViewMode] = useState<"auto" | "table" | "card">("auto");

  // Quản lý tab hiển thị riêng biệt từng mục (không dàn trải)
  const [activeTab, setActiveTab] = useState<POTabId>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes("tab=supplier") || hash.endsWith("#supplier")) return "supplier";
      if (hash.includes("tab=document") || hash.endsWith("#documents")) return "documents";
      if (hash.includes("tab=payment") || hash.endsWith("#payments")) return "payments";
      if (hash.includes("tab=timeline") || hash.endsWith("#timeline")) return "timeline";
      if (hash.includes("tab=item") || hash.endsWith("#po-items") || hash.endsWith("#items")) return "items";
      if (hash.includes("tab=all") || hash.endsWith("#all")) return "all";

      const saved = sessionStorage.getItem("po_detail_active_tab");
      if (saved && ["supplier", "documents", "payments", "timeline", "items", "all"].includes(saved)) {
        return saved as POTabId;
      }
    }
    return "supplier";
  });

  const handleSelectTab = (tab: POTabId) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("po_detail_active_tab", tab);
        const hash = window.location.hash;
        if (hash.startsWith("#view=po-detail")) {
          const params = new URLSearchParams(hash.replace(/^#/, ""));
          params.set("tab", tab);
          window.history.replaceState(null, "", `#${params.toString()}`);
        }
      } catch {
        // ignore
      }
      const tabsEl = document.querySelector(".po-tabs");
      if (tabsEl) {
        const rect = tabsEl.getBoundingClientRect();
        if (rect.top < 60) {
          tabsEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  };

  useEffect(() => {
    const handleHash = () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash.toLowerCase();
      if (hash.includes("tab=supplier") || hash.endsWith("#supplier")) setActiveTab("supplier");
      else if (hash.includes("tab=document") || hash.endsWith("#documents")) setActiveTab("documents");
      else if (hash.includes("tab=payment") || hash.endsWith("#payments")) setActiveTab("payments");
      else if (hash.includes("tab=timeline") || hash.endsWith("#timeline")) setActiveTab("timeline");
      else if (hash.includes("tab=item") || hash.endsWith("#po-items") || hash.endsWith("#items")) setActiveTab("items");
      else if (hash.includes("tab=all") || hash.endsWith("#all")) setActiveTab("all");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Quản lý thu gọn / xổ ra theo yêu cầu tối ưu mobile
  const [isSupplierExpanded, setIsSupplierExpanded] = useState(true);
  const [isPaymentsExpanded, setIsPaymentsExpanded] = useState(true);
  const [showNoteInput, setShowNoteInput] = useState(false);

  const supplier = suppliers.find((s) => Number(s.id) === Number(po.supplierId));
  const isDuplicateNumber = isPONumberExists(po.number, pos, trash, po.id);
  const items = po.items || [];
  const subtotal = items.reduce((s, i) => s + calcPOItemSubtotal(i), 0);
  const total = calcPOTotal(po);
  const totalVatAmount = total - subtotal;

  const deliveredStats = useMemo(() => {
    const list = items || [];
    let deliveredItemsCount = 0;
    let totalDeliveredQty = 0;
    let totalQty = 0;
    list.forEach((it) => {
      const q = Number(it.qty) || 0;
      const d = Number(it.deliveredQty) || 0;
      totalQty += q;
      totalDeliveredQty += d;
      if (d >= q && q > 0) deliveredItemsCount++;
    });
    return {
      deliveredItemsCount,
      totalItems: list.length,
      totalDeliveredQty,
      totalQty,
      isFullyDelivered: list.length > 0 && deliveredItemsCount === list.length,
    };
  }, [items]);

  const linkedHandovers = useMemo(() => {
    const cleanNum = (po?.number || "").trim().toLowerCase();
    if (!cleanNum) return [];
    return paymentHandovers.filter(
      (h) => (h.source_number || "").trim().toLowerCase() === cleanNum
    );
  }, [po?.number, paymentHandovers]);

  const linkedHandoverBatchesCount = useMemo(() => {
    const set = new Set<string>();
    linkedHandovers.forEach((h) => {
      if (h.batch_id && h.batch_id.trim()) set.add(h.batch_id.trim());
      else if (h.handover_date) set.add(h.handover_date);
    });
    return set.size;
  }, [linkedHandovers]);

  const updatePOItemsAndSyncPayments = (nextItems: POItem[]) => {
    const nextTotal = calcPOTotal({ items: nextItems });
    const nextPayments = (po.payments || []).map((p) => ({
      ...p,
      amount: Math.round((nextTotal * (Number(p.percent) || 0)) / 100),
    }));
    onUpdate({
      ...po,
      items: nextItems,
      payments: nextPayments,
    });
  };

  const PO_ITEM_EDITABLE_FIELDS = [
    "name",
    "qty",
    "unit",
    "price",
    "vatRate",
    "note",
  ] as const;
  type POItemEditableField = (typeof PO_ITEM_EDITABLE_FIELDS)[number];

  const handlePOItemPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowIdx: number,
    startField: POItemEditableField
  ) => {
    if (readOnly) return;
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text) return;

    const matrix = parseExcelClipboard(text);
    if (matrix.length === 0) return;

    const isMultiCell =
      matrix.length > 1 || (matrix[0] && matrix[0].length > 1);
    const isNumField =
      startField === "qty" || startField === "price" || startField === "vatRate";

    if (!isMultiCell) {
      if (isNumField && matrix[0]?.[0] !== undefined) {
        e.preventDefault();
        const cleaned = cleanExcelNumber(matrix[0][0]);
        const nextItems = items.map((x, idx) =>
          idx === startRowIdx
            ? { ...x, [startField]: cleaned, ...(startField === "price" ? { estimate: cleaned } : {}) }
            : x
        );
        updatePOItemsAndSyncPayments(nextItems);
      }
      return;
    }

    e.preventDefault();
    const startColIdx = PO_ITEM_EDITABLE_FIELDS.indexOf(startField);
    if (startColIdx === -1) return;

    const nextItems = items.map((x) => ({ ...x }));
    const neededRows = startRowIdx + matrix.length;
    while (nextItems.length < neededRows) {
      const nextIdx = nextItems.length + 1;
      nextItems.push({
        id: makeId() + nextItems.length * 17 + Math.floor(Math.random() * 1000),
        code: `VT-${String(nextIdx).padStart(2, "0")}`,
        category: "Vật tư / Hàng hóa",
        name: "",
        desc: "",
        spec: "",
        unit: "Cái",
        qty: 1,
        estimate: 0,
        price: 0,
        vatRate: 8,
        note: "",
        deliveryStatus: "Chưa giao",
        deliveredQty: 0,
        deliveryDate: "",
        deliveryHistory: [],
      });
    }

    for (let r = 0; r < matrix.length; r++) {
      const targetRow = nextItems[startRowIdx + r];
      if (!targetRow) continue;
      const rowCells = matrix[r];
      for (let c = 0; c < rowCells.length; c++) {
        const targetField = PO_ITEM_EDITABLE_FIELDS[startColIdx + c];
        if (!targetField) break;
        const cellVal = rowCells[c];
        if (targetField === "qty") {
          targetRow.qty = cleanExcelNumber(cellVal);
        } else if (targetField === "price") {
          const numVal = cleanExcelNumber(cellVal);
          targetRow.price = numVal;
          targetRow.estimate = numVal;
        } else if (targetField === "vatRate") {
          const rawVat = cleanExcelNumber(cellVal);
          const validVats = [0, 5, 8, 10];
          targetRow.vatRate = validVats.includes(rawVat) ? rawVat : rawVat > 0 ? 8 : 0;
        } else {
          targetRow[targetField] = cellVal;
        }
      }
    }

    updatePOItemsAndSyncPayments(nextItems);
  };

  const openDeliveryPopup = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setBatchDeliveryDate(todayStr);
    const initSelected: Record<number, boolean> = {};
    const initQty: Record<number, number> = {};
    const initDates: Record<number, string> = {};
    items.forEach((it) => {
      const rem = Math.max(0, (Number(it.qty) || 0) - (Number(it.deliveredQty) || 0));
      initSelected[it.id] = rem > 0;
      initQty[it.id] = rem > 0 ? rem : Number(it.qty) || 0;
      initDates[it.id] = todayStr;
    });
    setBatchSelected(initSelected);
    setBatchQty(initQty);
    setBatchItemDate(initDates);
    setShowDeliveryModal(true);
  };

  const handleDeliveryConfirm = (payload: DeliveryConfirmPayload) => {
    const { selectedItems, senderName, receiverName, uploadedPhotoNames, signatureDataUrl, createHandoverAfter } = payload;
    if (!selectedItems || selectedItems.length === 0) return;

    const payloadMap = new Map(selectedItems.map((s) => [s.id, s]));

    const updatedItems: POItem[] = items.map((it) => {
      const match = payloadMap.get(it.id);
      if (!match) return it;
      const addQty = Math.max(0, match.qty || 0);
      if (addQty <= 0) return it;
      const delivDate = match.date || new Date().toISOString().slice(0, 10);
      const prevDelivered = Number(it.deliveredQty) || 0;
      const nextDelivered = prevDelivered + addQty;
      const nextStatus: POItem["deliveryStatus"] =
        nextDelivered >= (Number(it.qty) || 0)
          ? "Đã giao"
          : nextDelivered > 0
          ? "Giao một phần"
          : "Chưa giao";
      const nextHistory = [
        ...(it.deliveryHistory || []),
        {
          date: delivDate,
          qty: addQty,
          note: match.note || undefined,
          discrepancyReason: match.reason || undefined,
          senderName: senderName || undefined,
          receiverName: receiverName || undefined,
          photoNames: uploadedPhotoNames.length > 0 ? uploadedPhotoNames : undefined,
          signatureDataUrl: signatureDataUrl || undefined,
        },
      ];
      return {
        ...it,
        deliveredQty: nextDelivered,
        deliveryDate: delivDate,
        deliveryStatus: nextStatus,
        deliveryHistory: nextHistory,
      };
    });

    const allDone =
      updatedItems.length > 0 &&
      updatedItems.every((i) => (Number(i.deliveredQty) || 0) >= (Number(i.qty) || 0));
    const someDone = updatedItems.some(
      (i) => (Number(i.deliveredQty) || 0) > 0
    );
    const nextPoStatus = allDone
      ? "Đã giao đủ"
      : someDone
      ? "Đang giao hàng"
      : po.status;

    const updatedPo = {
      ...po,
      status: nextPoStatus,
      items: updatedItems,
    };

    onUpdate(updatedPo);
    setShowDeliveryModal(false);
    onStatus?.(`✓ Đã cập nhật giao nhận cho ${selectedItems.length} mặt hàng trong PO ${po.number}`);

    if (createHandoverAfter && onCreateHandover) {
      onCreateHandover(updatedPo);
    }
  };

  const handleImportItemsFromApproval = (req: ApprovalRequest) => {
    const selectedCol =
      req.supplierColumns.find((c) => c.isSelected) || req.supplierColumns[0];
    if (!selectedCol) return;

    const useSupQty =
      req.showSupplierQty !== undefined
        ? req.showSupplierQty
        : req.columnMode === "extended";
    const useQuotedProd =
      req.showQuotedProduct !== undefined
        ? req.showQuotedProduct
        : req.columnMode === "extended";

    const importedItems: POItem[] = [];
    req.rows.forEach((row, rIdx) => {
      const lines = row.supplierQuotes[selectedCol.colId] || [];
      if (lines.length === 0) return;
      lines.forEach((line, lIdx) => {
        const effQty = useSupQty
          ? Number(line.qty) || Number(row.qty) || 1
          : Number(row.qty) || 1;
        const unitPrice = Number(line.unitPrice) || 0;
        if (lines.length > 1 && unitPrice <= 0) return;
        const itemName =
          useQuotedProd && (line.quotedProduct?.trim() || line.origin?.trim())
            ? line.quotedProduct?.trim() || line.origin?.trim() || row.itemName
            : row.itemName || `Hàng hóa #${rIdx + 1}`;
        importedItems.push({
          id: makeId() + rIdx * 10 + lIdx,
          code: row.itemCode || `VT-${String(importedItems.length + 1).padStart(2, "0")}`,
          category: "Vật tư / Hàng hóa",
          name: itemName,
          desc: line.origin || "",
          spec: row.spec || "",
          unit: row.unit || "Cái",
          qty: effQty,
          estimate: unitPrice,
          price: unitPrice,
          vatRate: 8,
          note: "",
          deliveryStatus: "Chưa giao",
          deliveredQty: 0,
          deliveryDate: "",
          deliveryHistory: [],
        });
      });
    });

    if (importedItems.length === 0) {
      alert("Phiếu Đề nghị phê duyệt này chưa có dòng hàng hóa nào có đơn giá!");
      return;
    }

    const nextItems = [...items.filter((x) => x.name.trim() !== ""), ...importedItems];
    const nextTotal = calcPOTotal({ items: nextItems });
    const nextPayments = (po.payments || []).map((p) => ({
      ...p,
      amount: Math.round((nextTotal * (Number(p.percent) || 0)) / 100),
    }));

    onUpdate({
      ...po,
      prNumber: req.prNumber || req.requestNumber || po.prNumber,
      items: nextItems,
      payments: nextPayments,
    });
    setShowImportApprovalModal(false);
    onStatus?.(`✓ Đã lấy ${importedItems.length} mặt hàng từ ĐNPĐ ${req.prNumber || req.requestNumber}`);
  };

  const bankOptions = useMemo(() => {
    const set = new Set<string>(BANK_SUGGESTIONS);
    suppliers.forEach((s) => {
      if (s.bank?.trim()) set.add(s.bank.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [suppliers]);

  const handleManualSave = async (andGoBack = false) => {
    setSaving(true);
    try {
      if (onSave) {
        await onSave();
      }
      setSavedNotice(true);
      onStatus?.(`✓ Đã lưu thông tin ${po.number}`);
      if (savedNoticeTimerRef.current) clearTimeout(savedNoticeTimerRef.current);
      savedNoticeTimerRef.current = setTimeout(() => setSavedNotice(false), 3000);
      if (andGoBack) {
        onBack();
      }
    } finally {
      setSaving(false);
    }
  };

  const supplierUpdate = (key: keyof Supplier, value: string) => {
    if (!supplier) {
      const newId = makeId();
      const nextCode = `NCC-${String(suppliers.length + 1).padStart(3, "0")}`;
      const newSupp: Supplier = {
        id: newId,
        code: key === "code" ? value : nextCode,
        name: key === "name" ? value : "Nhà cung cấp mới",
        shortName: key === "shortName" ? value : "",
        bankAccount: key === "bankAccount" ? value : "",
        bank: key === "bank" ? value : "",
        address: key === "address" ? value : "",
        contact: key === "contact" ? value : "",
        phone: key === "phone" ? value : "",
      };
      setSuppliers((list) => [newSupp, ...list]);
      onUpdate({ ...po, supplierId: newId });
      return;
    }
    setSuppliers((list) =>
      list.map((s) => (Number(s.id) === Number(supplier.id) ? { ...s, [key]: value } : s)),
    );
  };
  const itemUpdate = (id: number, key: keyof POItem, value: string | number) =>
    onUpdate({
      ...po,
      items: items.map((i) => (i.id === id ? { ...i, [key]: value } : i)),
    });

  const payments = po.payments || [];
  const totalAllocatedPercent = payments.reduce((s, p) => s + (Number(p.percent) || 0), 0);
  const totalAllocatedAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const handleApplyPreset = (type: "1-post" | "1-advance" | "2-50-50" | "2-30-70" | "3-30-40-30") => {
    let newPayments: Payment[] = [];
    if (type === "1-post") {
      newPayments = [
        {
          id: makeId(),
          phase: "Thanh toán toàn bộ (Trả sau 100%)",
          percent: 100,
          amount: total,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "Thanh toán sau khi nhận đủ hàng và HĐ VAT",
        },
      ];
    } else if (type === "1-advance") {
      newPayments = [
        {
          id: makeId(),
          phase: "Tạm ứng toàn bộ (Trả trước 100%)",
          percent: 100,
          amount: total,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi giao hàng",
        },
      ];
    } else if (type === "2-50-50") {
      const p1 = Math.round(total * 0.5);
      newPayments = [
        {
          id: makeId(),
          phase: "Đợt 1: Tạm ứng (50%)",
          percent: 50,
          amount: p1,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Đợt 2: Quyết toán (50%)",
          percent: 50,
          amount: total - p1,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "",
        },
      ];
    } else if (type === "2-30-70") {
      const p1 = Math.round(total * 0.3);
      newPayments = [
        {
          id: makeId(),
          phase: "Đợt 1: Tạm ứng (30%)",
          percent: 30,
          amount: p1,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Đợt 2: Quyết toán (70%)",
          percent: 70,
          amount: total - p1,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "",
        },
      ];
    } else if (type === "3-30-40-30") {
      const p1 = Math.round(total * 0.3);
      const p2 = Math.round(total * 0.4);
      newPayments = [
        {
          id: makeId(),
          phase: "Đợt 1: Tạm ứng (30%)",
          percent: 30,
          amount: p1,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Đợt 2: Giao hàng (40%)",
          percent: 40,
          amount: p2,
          condition: "post",
          status: "Chưa thanh toán",
          date: "",
          note: "",
        },
        {
          id: makeId(),
          phase: "Đợt 3: Quyết toán (30%)",
          percent: 30,
          amount: total - p1 - p2,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "",
        },
      ];
    }
    onUpdate({ ...po, payments: newPayments });
  };

  const handleAddPaymentStage = () => {
    const allocatedPct = (po.payments || []).reduce((s, p) => s + (Number(p.percent) || 0), 0);
    const remPct = Math.max(0, 100 - allocatedPct);
    const remAmt = Math.round((total * remPct) / 100);
    const nextIdx = (po.payments || []).length + 1;
    const isFirst = nextIdx === 1;
    const newStage: Payment = {
      id: makeId(),
      phase: `Đợt ${nextIdx}: ${isFirst ? "Tạm ứng" : "Thanh toán đợt " + nextIdx}`,
      percent: remPct,
      amount: remAmt,
      condition: isFirst ? "advance" : "post",
      status: "Chưa thanh toán",
      date: "",
      note: isFirst ? "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng" : "",
    };
    onUpdate({
      ...po,
      payments: [...(po.payments || []), newStage],
    });
  };

  const handleRemovePaymentStage = (id: number) => {
    const stage = po.payments?.find((p) => p.id === id);
    if (stage?.paymentRequestId) {
      if (!confirm(`Đợt này đã liên kết với ĐNTT #${stage.paymentRequestId}. Bạn có chắc chắn muốn xóa không?`)) {
        return;
      }
    } else if (po.payments?.length === 1) {
      if (!confirm("Đây là đợt thanh toán duy nhất còn lại. Bạn có chắc muốn xóa không?")) {
        return;
      }
    }
    onUpdate({
      ...po,
      payments: (po.payments || []).filter((p) => p.id !== id),
    });
  };

  const handleUpdatePaymentStage = (id: number, patch: Partial<Payment>) => {
    let updatedStage: Payment | undefined;
    onUpdate({
      ...po,
      payments: (po.payments || []).map((p) => {
        if (p.id !== id) return p;
        const updated: Payment = { ...p, ...patch };
        if (patch.percent !== undefined && patch.amount === undefined) {
          const pct = Number(patch.percent) || 0;
          updated.amount = Math.round((total * pct) / 100);
        } else if (patch.amount !== undefined && patch.percent === undefined) {
          const amt = Number(patch.amount) || 0;
          updated.percent = total > 0 ? Math.round((amt / total) * 100) : 0;
        }
        updatedStage = updated;
        return updated;
      }),
    });

    // Đồng bộ thông tin hóa đơn & bản scan sang ĐNTT đã liên kết (nếu có)
    if (
      updatedStage?.paymentRequestId &&
      onUpdatePaymentRequest &&
      (patch.invoiceNo !== undefined ||
        patch.invoiceDate !== undefined ||
        patch.invoiceScanUrl !== undefined ||
        patch.invoiceScanName !== undefined)
    ) {
      const linkedReq = paymentRequests.find((r) => r.id === updatedStage!.paymentRequestId);
      if (linkedReq) {
        const nextInvoiceNo =
          patch.invoiceNo !== undefined ? patch.invoiceNo : linkedReq.invoice_no;
        const nextInvoiceDate =
          patch.invoiceDate !== undefined ? patch.invoiceDate : linkedReq.invoice_date;
        const nextScanUrl =
          patch.invoiceScanUrl !== undefined ? patch.invoiceScanUrl : linkedReq.invoice_scan_url;
        const nextScanName =
          patch.invoiceScanName !== undefined ? patch.invoiceScanName : linkedReq.invoice_scan_name;

        const nextLines =
          linkedReq.lines && linkedReq.lines.length > 0
            ? linkedReq.lines.map((line, idx) =>
                idx === 0
                  ? {
                      ...line,
                      invoice_no: nextInvoiceNo || "",
                      invoice_date: nextInvoiceDate || "",
                      invoice_scan_url: nextScanUrl,
                      invoice_scan_name: nextScanName,
                    }
                  : line
              )
            : linkedReq.lines;

        onUpdatePaymentRequest({
          ...linkedReq,
          invoice_no: nextInvoiceNo || "",
          invoice_date: nextInvoiceDate || "",
          invoice_scan_url: nextScanUrl,
          invoice_scan_name: nextScanName,
          lines: nextLines,
        });
      }
    }
  };

  const handleConfirmLinkPaymentRequest = (req: PaymentRequestEntry) => {
    if (!linkingStage) return;

    const reqScanUrl = req.invoice_scan_url || req.lines?.[0]?.invoice_scan_url;
    const reqScanName = req.invoice_scan_name || req.lines?.[0]?.invoice_scan_name;

    const patch: Partial<Payment> = {
      paymentRequestId: req.id,
      status: isPaymentCompleted(req) ? "Đã thanh toán" : "Chưa thanh toán",
    };

    // Đồng bộ số hóa đơn & bản scan từ ĐNTT sang PO nếu PO chưa có mà ĐNTT đã có
    if (!linkingStage.invoiceNo && req.invoice_no) {
      patch.invoiceNo = req.invoice_no;
      patch.invoiceDate = req.invoice_date || linkingStage.invoiceDate;
    }
    if (!linkingStage.invoiceScanUrl && reqScanUrl) {
      patch.invoiceScanUrl = reqScanUrl;
      patch.invoiceScanName = reqScanName || linkingStage.invoiceScanName;
    }

    handleUpdatePaymentStage(linkingStage.id, patch);

    // Đồng bộ ĐNTT: gán group_code = po.number nếu chưa có, hoặc cập nhật HĐ & bản scan nếu PO có mà ĐNTT chưa có
    const mergedScanUrl = reqScanUrl || linkingStage.invoiceScanUrl;
    const mergedScanName = reqScanName || linkingStage.invoiceScanName;
    const updatedReq: PaymentRequestEntry = {
      ...req,
      group_code: req.group_code || po.number,
      invoice_no: req.invoice_no || linkingStage.invoiceNo || "",
      invoice_date: req.invoice_date || linkingStage.invoiceDate || "",
      invoice_scan_url: mergedScanUrl,
      invoice_scan_name: mergedScanName,
    };
    if (onUpdatePaymentRequest) {
      onUpdatePaymentRequest(updatedReq);
    }

    onStatus?.(`✓ Đã liên kết đợt "${linkingStage.phase}" với Đề nghị thanh toán #${req.legacy_stt || req.id}`);
    setLinkingStage(null);
  };

  const events = [
    ...items
      .filter((i) => i.deliveryDate)
      .map((i) => ({
        date: i.deliveryDate,
        title: `Giao hàng: ${i.name}`,
        note: `${i.deliveredQty || 0}/${i.qty} ${i.unit} · ${i.deliveryStatus || ""}`,
        kind: "delivery",
      })),
    ...(po.payments || [])
      .filter((p) => p.date)
      .map((p) => ({
        date: p.date,
        title: `Thanh toán: ${p.phase}`,
        note: `${fmt(p.amount || 0)} ₫ · ${p.status}`,
        kind: "payment",
      })),
  ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const poTabs: {
    id: POTabId;
    label: string;
    icon: React.ReactNode;
    badge?: string | number | null;
  }[] = [
    {
      id: "supplier",
      label: "Thông tin NCC",
      icon: <Building2 size={15} />,
      badge: supplier?.shortName || (supplier ? "Đã chọn" : null),
    },
    {
      id: "documents",
      label: "Hồ sơ & Hợp đồng",
      icon: <FolderCheck size={15} />,
      badge: (po.docs || []).length > 0 ? (po.docs || []).length : undefined,
    },
    {
      id: "payments",
      label: "Thanh toán",
      icon: <CreditCard size={15} />,
      badge: (po.payments || []).length > 0 ? `${(po.payments || []).length} đợt` : undefined,
    },
    {
      id: "timeline",
      label: "Timeline",
      icon: <Clock size={15} />,
      badge: events.length > 0 ? events.length : undefined,
    },
    {
      id: "items",
      label: "Danh sách hàng hóa & Giao hàng",
      icon: <Package size={15} />,
      badge: `${items.length} mục`,
    },
    {
      id: "all",
      label: "Xem toàn bộ",
      icon: <Layers size={15} />,
    },
  ];

  return (
    <section className="content po-detail">
      <div className="heading">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={16} /> Quay lại
          </button>
          <em>{isContractPO(po) ? "HỢP ĐỒNG MUA HÀNG" : "ĐƠN MUA HÀNG"} · {po.number}</em>
          <h1>{supplier?.name || "Chưa chọn nhà cung cấp"}</h1>
          <div style={{ marginTop: "6px", marginBottom: "6px" }}>
            <DocFlowLinks
              flow={resolveDocFlow(
                { po },
                { prs, pos: [po], approvalRequests, paymentRequests, paymentHandovers }
              )}
              currentView="po-detail"
              onNavigate={onNavigate}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginTop: "8px",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              <span>Số PO:</span>
              <input
                value={po.number || ""}
                disabled={readOnly}
                placeholder="VD: MERCK-24102026"
                style={{
                  width: "175px",
                  height: "30px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: isDuplicateNumber ? "#dc2626" : "#0284c7",
                  padding: "2px 8px",
                  border: isDuplicateNumber ? "1px solid #ef4444" : "1px solid #cbd5e1",
                  background: isDuplicateNumber ? "#fef2f2" : "#ffffff",
                  borderRadius: "4px",
                }}
                onChange={(e) => onUpdate({ ...po, number: e.target.value })}
              />
              {!readOnly && (
                <button
                  type="button"
                  style={{
                    height: "30px",
                    padding: "0 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background: "#f0f9ff",
                    border: "1px solid #bae6fd",
                    color: "#0369a1",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                  title="Tạo lại Số PO tự động theo NCC và ngày tạo (tự tăng hậu tố nếu trùng)"
                  onClick={() =>
                    onUpdate({
                      ...po,
                      number: generatePOCode(supplier, po.createdDate, pos, trash, po.id),
                    })
                  }
                >
                  <RotateCcw size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "3px" }} /> Tạo mã
                </button>
              )}
              {isDuplicateNumber && (
                <span style={{ color: "#ef4444", fontSize: "11px", fontWeight: 700, marginLeft: 4 }} title="Mã này đang trùng với đơn khác trên hệ thống">
                  ⚠ Trùng mã!
                </span>
              )}
            </label>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              <span>Số PR / Nguồn:</span>
              <input
                value={po.prNumber || ""}
                disabled={readOnly}
                placeholder="Nhập số PR..."
                style={{
                  width: "155px",
                  height: "30px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  padding: "2px 8px",
                }}
                onChange={(e) => onUpdate({ ...po, prNumber: e.target.value })}
              />
            </label>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              <span>Ngày tạo PO:</span>
              <input
                type="date"
                value={po.createdDate || ""}
                disabled={readOnly}
                style={{
                  height: "30px",
                  fontSize: "12px",
                  padding: "2px 8px",
                }}
                onChange={(e) => onUpdate({ ...po, createdDate: e.target.value })}
              />
            </label>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {!readOnly && (
            <>
              <button
                type="button"
                className="po-save-btn"
                disabled={saving}
                onClick={() => void handleManualSave(false)}
                title="Lưu toàn bộ thông tin đơn hàng PO này"
              >
                {saving ? "Đang lưu..." : savedNotice ? <><Check size={16} /> Đã lưu!</> : <><Save size={16} /> Lưu</>}
              </button>
              <button
                type="button"
                className="po-save-back-btn"
                disabled={saving}
                onClick={() => void handleManualSave(true)}
                title="Lưu thông tin và quay lại danh sách PO"
              >
                <Check size={16} /> Lưu & Quay lại
              </button>
            </>
          )}
          {onCreateHandover && (
            <button
              type="button"
              className={poDeliveryStats.isFullyDelivered ? "btn btn-md" : "btn btn-primary btn-md"}
              style={poDeliveryStats.isFullyDelivered ? { background: "#f8fafc", color: "#15803d", border: "1.5px solid #86efac", fontWeight: 700 } : undefined}
              onClick={() => onCreateHandover(po)}
              title={poDeliveryStats.isFullyDelivered ? "Đơn hàng đã bàn giao nội bộ đủ 100% (Bấm để xem hoặc tạo thêm đợt)" : "Lập Phiếu Bàn giao nội bộ cho Bộ phận sử dụng (không qua kho)"}
            >
              <ClipboardCheck size={16} /> {poDeliveryStats.isFullyDelivered ? "Đã bàn giao nội bộ (100%)" : "Bàn giao nội bộ"}
            </button>
          )}
          {(onCreatePaymentRequest || onOpenGeneralPaymentRequest) && (
            <button
              type="button"
              className="btn btn-teal btn-md"
              onClick={() => {
                if (onOpenGeneralPaymentRequest) {
                  onOpenGeneralPaymentRequest(po);
                } else if (onCreatePaymentRequest && po.payments && po.payments.length > 0) {
                  onCreatePaymentRequest(po, po.payments[0]);
                }
              }}
              title="Lập Đề nghị thanh toán (ĐNTT) và mở ngay bản in Mẫu 01-TT"
              style={{
                height: "38px",
                padding: "0 14px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
              }}
            >
              <CreditCard size={15} /> Tạo ĐNTT
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              className={`btn ${isPOCompleted(po) ? "btn-secondary" : "btn-success"}`}
              style={{
                height: "38px",
                padding: "0 12px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                backgroundColor: isPOCompleted(po) ? "#ecfdf5" : undefined,
                color: isPOCompleted(po) ? "#059669" : undefined,
                borderColor: isPOCompleted(po) ? "#a7f3d0" : undefined,
              }}
              onClick={() => {
                const nextVal = !isPOCompleted(po);
                onUpdate({
                  ...po,
                  isCompleted: nextVal,
                  status: nextVal ? "Đã hoàn thành" : "Đang thực hiện",
                });
              }}
              title={isPOCompleted(po) ? "Đổi sang Đang thực hiện" : "Đánh dấu Đã hoàn thành đơn hàng"}
            >
              {isPOCompleted(po) ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-600" /> Đã hoàn thành
                </>
              ) : (
                <>
                  <Circle size={16} /> Hoàn thành đơn
                </>
              )}
            </button>
          )}
          {!readOnly && onDelete && (
            <button
              type="button"
              className="delete-action"
              style={{
                height: "38px",
                padding: "0 14px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
              onClick={() => onDelete(po)}
              title="Chuyển đơn PO này vào thùng rác"
            >
              <Trash2 size={15} /> Xóa
            </button>
          )}
          <div className="po-total">
            <span>Giá trị PO (Sau VAT)</span>
            <b>{fmt(total)} ₫</b>
            <i>{po.status}</i>
          </div>
        </div>
      </div>
      {/* Ghi chú chung PO: Nếu không có thì ẩn đi, khi cần ấn nút mới hiện */}
      {(showNoteInput || Boolean(po.note && po.note.trim())) ? (
        <section className="common-note-card po-common-note" style={{ position: "relative" }}>
          <label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <span>✎ Ghi chú chung PO</span>
              {!readOnly && (
                <button
                  type="button"
                  style={{ background: "transparent", border: 0, color: "#64748b", fontSize: "11.5px", cursor: "pointer" }}
                  onClick={() => {
                    if (!po.note?.trim() || confirm("Bạn có muốn đóng ô ghi chú này không?")) {
                      onUpdate({ ...po, note: "" });
                      setShowNoteInput(false);
                    }
                  }}
                >
                  ✕ Ẩn ghi chú
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={po.note || ""}
              placeholder="Diễn giải tự do, điều kiện đặc biệt hoặc lưu ý thực hiện PO..."
              onChange={(e) => onUpdate({ ...po, note: e.target.value })}
            />
          </label>
        </section>
      ) : (
        !readOnly && (
          <div style={{ margin: "6px 0 10px" }}>
            <button
              type="button"
              onClick={() => setShowNoteInput(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                color: "#475569",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={14} /> Thêm Ghi chú chung PO
            </button>
          </div>
        )
      )}
      <div
        className="po-tabs"
        role="tablist"
        aria-label="Các mục thông tin PO"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "6px 10px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
          position: "sticky",
          top: "60px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "2px 0", alignItems: "center" }}>
          {poTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectTab(tab.id)}
                className={`po-tab-btn ${isActive ? "active" : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "7px 13px",
                  borderRadius: "7px",
                  fontSize: "12.5px",
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? "#ffffff" : "#475569",
                  background: isActive ? "#0284c7" : "#ffffff",
                  border: isActive ? "1.5px solid #0369a1" : "1.5px solid #cbd5e1",
                  boxShadow: isActive ? "0 2px 4px rgba(2, 132, 199, 0.25)" : "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ display: "inline-flex", color: isActive ? "#ffffff" : "#64748b" }}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge !== null && (
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "1px 7px",
                      borderRadius: "10px",
                      background: isActive ? "rgba(255, 255, 255, 0.25)" : "#f1f5f9",
                      color: isActive ? "#ffffff" : "#64748b",
                      fontWeight: 700,
                      lineHeight: "16px",
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!readOnly && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingRight: "4px" }}>
            {savedNotice && (
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#168446" }}>
                ✓ Đã lưu lúc {new Date().toLocaleTimeString("vi-VN")}
              </span>
            )}
            <button
              type="button"
              className="po-save-btn"
              style={{
                height: "32px",
                padding: "0 12px",
                fontSize: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
                color: "#ffffff",
                border: "1px solid #1d4ed8",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              disabled={saving}
              onClick={() => void handleManualSave(false)}
            >
              {saving ? "Đang lưu..." : <><Save size={14} /> Lưu thay đổi</>}
            </button>
          </div>
        )}
      </div>

      {/* 1. THÔNG TIN NHÀ CUNG CẤP */}
      {(activeTab === "supplier" || activeTab === "all") && (
        <section id="supplier" className="po-section">
        <div
          className="section-heading"
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setIsSupplierExpanded(!isSupplierExpanded)}
        >
          <div>
            <h2>Thông tin nhà cung cấp</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSupplierExpanded(!isSupplierExpanded);
              }}
              style={{
                height: "30px",
                padding: "0 12px",
                background: isSupplierExpanded ? "#e2e8f0" : "#eff6ff",
                border: isSupplierExpanded ? "1px solid #cbd5e1" : "1px solid #bfdbfe",
                color: isSupplierExpanded ? "#334155" : "#0284c7",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              {isSupplierExpanded ? "▲ Thu gọn NCC" : "▼ Xem & Sửa chi tiết NCC"}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleManualSave(false);
                }}
                style={{
                  height: "30px",
                  padding: "0 12px",
                  background: "#f0fdf4",
                  borderColor: "#86efac",
                  color: "#166534",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Check size={14} /> Lưu NCC
              </button>
            )}
          </div>
        </div>

        {/* CHẾ ĐỘ THU GỌN: Mặc định chỉ hiển thị tên Nhà cung cấp */}
        {!isSupplierExpanded ? (
          <div
            style={{
              padding: "12px 16px",
              background: "#ffffff",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              cursor: "pointer",
            }}
            onClick={() => setIsSupplierExpanded(true)}
          >
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Nhà cung cấp:
              </div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                {supplier?.name || "Chưa chọn nhà cung cấp"}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {supplier?.code && <span>Mã: <b>{supplier.code}</b></span>}
                {supplier?.shortName && <span>Viết tắt: <b>{supplier.shortName}</b></span>}
                {supplier?.bank && <span>🏦 {supplier.bank} - {supplier.bankAccount}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSupplierExpanded(true);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#0284c7",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Chạm để xem chi tiết ➔
            </button>
          </div>
        ) : (
          /* CHẾ ĐỘ MỞ RỘNG: Hiển thị đầy đủ form thông tin NCC */
          <div className="po-supplier-form">
            <div className="full-field" style={{ marginBottom: "2px" }}>
              <SupplierSearchCombobox
                suppliers={suppliers}
                selectedSupplierId={po.supplierId || ""}
                onSelectSupplier={(id) => onUpdate({ ...po, supplierId: Number(id) || 0 })}
                onAddSupplier={(newSupp) => {
                  if (onAddSupplier) {
                    onAddSupplier(newSupp);
                  } else {
                    setSuppliers((prev) => [newSupp, ...prev]);
                  }
                  onUpdate({ ...po, supplierId: newSupp.id });
                }}
                label="Chọn hoặc tìm kiếm Nhà cung cấp cho đơn hàng"
              />
            </div>
            <label className="wide-field">
              Tên đầy đủ nhà cung cấp
              <input
                value={supplier?.name || ""}
                placeholder="Nhập tên công ty / nhà cung cấp..."
                onChange={(e) => {
                  const val = e.target.value;
                  supplierUpdate("name", val);
                  if (supplier && (!supplier.shortName || supplier.shortName === generateShortName(supplier.name))) {
                    supplierUpdate("shortName", generateShortName(val));
                  }
                }}
              />
            </label>
            <label>
              Mã NCC / Tên viết tắt
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px" }}>
                <input
                  value={supplier?.code || ""}
                  placeholder="Mã NCC"
                  title="Mã nhà cung cấp"
                  onChange={(e) => supplierUpdate("code", e.target.value)}
                />
                <input
                  value={supplier?.shortName || ""}
                  placeholder="Tên viết tắt"
                  title="Tên viết tắt"
                  onChange={(e) => supplierUpdate("shortName", e.target.value)}
                />
              </div>
            </label>
            <label>
              Số tài khoản
              <input
                value={supplier?.bankAccount || ""}
                placeholder="Nhập số tài khoản ngân hàng..."
                onChange={(e) => supplierUpdate("bankAccount", e.target.value)}
              />
            </label>
            <label>
              Ngân hàng
              <input
                list="poDetailBankList"
                value={supplier?.bank || ""}
                placeholder="Chọn hoặc nhập tên ngân hàng..."
                onChange={(e) => supplierUpdate("bank", e.target.value)}
              />
              <datalist id="poDetailBankList">
                {bankOptions.map((bn) => (
                  <option key={bn} value={bn} />
                ))}
              </datalist>
            </label>
            <label>
              Người liên hệ
              <input
                value={supplier?.contact || ""}
                placeholder="Tên người liên hệ..."
                onChange={(e) => supplierUpdate("contact", e.target.value)}
              />
            </label>
            <label>
              Điện thoại
              <input
                value={supplier?.phone || ""}
                placeholder="Số điện thoại liên hệ..."
                onChange={(e) => supplierUpdate("phone", e.target.value)}
              />
            </label>
            <label className="wide-field">
              Địa chỉ
              <input
                value={supplier?.address || ""}
                placeholder="Địa chỉ xuất hóa đơn / giao dịch của nhà cung cấp..."
                onChange={(e) => supplierUpdate("address", e.target.value)}
              />
            </label>
            <div style={{ gridColumn: "1 / -1", marginTop: "4px", textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setIsSupplierExpanded(false)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ▲ Thu gọn thông tin NCC
              </button>
            </div>
          </div>
        )}
      </section>
      )}

      {/* 2 & 3. HỒ SƠ & HỢP ĐỒNG + CÁC ĐỢT THANH TOÁN */}
      {(activeTab === "documents" || activeTab === "payments" || activeTab === "all") && (
        <div className={activeTab === "all" ? "po-two-columns" : "po-single-column"}>
          {(activeTab === "documents" || activeTab === "all") && (
            <section id="documents" className="po-section">
          <div className="section-heading">
            <div>
              <span>▧</span>
              <h2>Hồ sơ cần thiết ({(po.docs || []).length})</h2>
            </div>
            {!readOnly && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {(po.docs || []).length > 0 && (
                  <button
                    type="button"
                    style={{
                      borderColor: "#fca5a5",
                      color: "#dc2626",
                      background: "#fff5f5",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (confirm("Bạn có chắc muốn xóa toàn bộ danh sách hồ sơ của PO này không?")) {
                        onUpdate({
                          ...po,
                          contractNumber: undefined,
                          contractDate: undefined,
                          docs: [],
                        });
                      }
                    }}
                  >
                    <Trash2 size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "3px" }} /> Xóa hết
                  </button>
                )}
                <button
                  type="button"
                  style={{
                    cursor: "pointer",
                    fontWeight: 600,
                    background: "#f5f3ff",
                    borderColor: "#c4b5fd",
                    color: "#6d28d9",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={() => {
                    const existingContract = (po.docs || []).find(
                      (x) => x.isContract || x.name?.trim().toLowerCase() === "hợp đồng"
                    );
                    if (existingContract) {
                      alert("PO này đã có mục hồ sơ Hợp đồng. Bạn có thể nhập Số hợp đồng và Ngày hợp đồng ngay bên dưới.");
                      return;
                    }
                    const defaultDate = po.contractDate || po.createdDate || new Date().toISOString().slice(0, 10);
                    onUpdate({
                      ...po,
                      contractDate: defaultDate,
                      docs: [
                        {
                          id: makeId(),
                          name: "Hợp đồng",
                          status: "Đã đủ",
                          note: "",
                          isContract: true,
                          contractNumber: po.contractNumber || "",
                          contractDate: defaultDate,
                          contractValue: total,
                        },
                        ...(po.docs || []),
                      ],
                    });
                  }}
                >
                  <Plus size={14} /> Thêm hợp đồng
                </button>
                <button
                  type="button"
                  style={{ cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={() =>
                    onUpdate({
                      ...po,
                      docs: [
                        ...(po.docs || []),
                        {
                          id: makeId(),
                          name: "Hồ sơ mới",
                          status: "Còn thiếu",
                          note: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={14} /> Thêm hồ sơ
                </button>
              </div>
            )}
          </div>

          {!readOnly && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
                padding: "8px 14px",
                background: "#f8fafc",
                borderBottom: "1px solid #edf1f5",
                fontSize: "11.5px",
              }}
            >
              <span style={{ color: "#64748b", fontWeight: 600 }}>Thêm nhanh:</span>
              <button
                type="button"
                className="po-preset-pill"
                style={{
                  padding: "3px 9px",
                  fontSize: "11.5px",
                  background: "#f5f3ff",
                  borderColor: "#c4b5fd",
                  color: "#6d28d9",
                  fontWeight: 600,
                }}
                onClick={() => {
                  const existingContract = (po.docs || []).find(
                    (x) => x.isContract || x.name?.trim().toLowerCase() === "hợp đồng"
                  );
                  if (existingContract) {
                    alert("PO này đã có mục hồ sơ Hợp đồng ở bên dưới.");
                    return;
                  }
                  const defaultDate = po.contractDate || po.createdDate || new Date().toISOString().slice(0, 10);
                  onUpdate({
                    ...po,
                    contractDate: defaultDate,
                    docs: [
                      {
                        id: makeId(),
                        name: "Hợp đồng",
                        status: "Đã đủ",
                        note: "",
                        isContract: true,
                        contractNumber: po.contractNumber || "",
                        contractDate: defaultDate,
                        contractValue: total,
                      },
                      ...(po.docs || []),
                    ],
                  });
                }}
              >
                <Plus size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "2px" }} /> Hợp đồng
              </button>
              {[
                "PO xác nhận",
                "Hóa đơn VAT",
                "Biên bản giao nhận",
                "CO / CQ",
                "Báo giá",
              ].map((presetName) => (
                <button
                  key={presetName}
                  type="button"
                  className="po-preset-pill"
                  style={{ padding: "3px 9px", fontSize: "11.5px" }}
                  onClick={() =>
                    onUpdate({
                      ...po,
                      docs: [
                        ...(po.docs || []),
                        {
                          id: makeId(),
                          name: presetName,
                          status: "Còn thiếu",
                          note: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "2px" }} /> {presetName}
                </button>
              ))}
            </div>
          )}

          <div className="checklist">
            {(po.docs || []).length === 0 ? (
              <div
                style={{
                  display: "block",
                  padding: "20px 14px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "12.5px",
                  background: "#fcfdfe",
                  border: "1px dashed #cbd5e1",
                  borderRadius: "6px",
                  margin: "8px 0",
                }}
              >
                Chưa có hồ sơ nào cho PO này. Bấm <b>"📑 ＋ Thêm hợp đồng"</b> (nếu PO có hợp đồng) hoặc <b>"＋ Thêm hồ sơ"</b> ở trên để bổ sung.
              </div>
            ) : (
              (po.docs || []).map((d) => {
                const isContractDoc = Boolean(
                  d.isContract || d.name?.trim().toLowerCase() === "hợp đồng"
                );
                if (isContractDoc) {
                  return (
                    <div
                      key={d.id}
                      style={{
                        display: "block",
                        background: "#faf5ff",
                        border: "1px solid #d8b4fe",
                        borderRadius: "8px",
                        padding: "12px",
                        margin: "8px 0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          marginBottom: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              background: "#7c3aed",
                              color: "#fff",
                              fontSize: "11.5px",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            📑 HỢP ĐỒNG
                          </span>
                          <span style={{ fontSize: "12px", color: "#5b21b6", fontWeight: 600 }}>
                            Thông tin hợp đồng đi kèm PO (dùng tự động khi tạo Đề nghị thanh toán)
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <select
                            value={d.status || "Đã đủ"}
                            style={{ height: "32px", fontSize: "12px", fontWeight: 600 }}
                            onChange={(e) =>
                              onUpdate({
                                ...po,
                                docs: (po.docs || []).map((x) =>
                                  x.id === d.id
                                    ? { ...x, status: e.target.value as PODoc["status"] }
                                    : x
                                ),
                              })
                            }
                          >
                            <option>Đã đủ</option>
                            <option>Còn thiếu</option>
                            <option>Chờ bổ sung</option>
                          </select>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdate({
                                  ...po,
                                  contractNumber: undefined,
                                  contractDate: undefined,
                                  docs: (po.docs || []).filter((x) => x.id !== d.id),
                                })
                              }
                              style={{
                                height: "32px",
                                width: "32px",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "#fff5f5",
                                border: "1px solid #fca5a5",
                                borderRadius: "5px",
                                color: "#dc2626",
                                cursor: "pointer",
                                fontSize: "14px",
                                padding: 0,
                              }}
                              title="Xóa hợp đồng khỏi PO"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                          gap: "10px",
                          alignItems: "end",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              color: "#4c1d95",
                              marginBottom: "4px",
                            }}
                          >
                            Số hợp đồng <span style={{ color: "#dc2626" }}>*</span>
                          </label>
                          <input
                            value={d.contractNumber ?? po.contractNumber ?? ""}
                            placeholder="Nhập số HĐ (VD: 01/2026/HĐKT)..."
                            style={{ width: "100%", background: "#fff", fontWeight: 600 }}
                            onChange={(e) => {
                              const val = e.target.value;
                              onUpdate({
                                ...po,
                                contractNumber: val,
                                docs: (po.docs || []).map((x) =>
                                  x.id === d.id
                                    ? { ...x, isContract: true, contractNumber: val }
                                    : x
                                ),
                              });
                            }}
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              color: "#4c1d95",
                              marginBottom: "4px",
                            }}
                          >
                            Ngày hợp đồng <span style={{ color: "#dc2626" }}>*</span>
                          </label>
                          <input
                            type="date"
                            value={d.contractDate ?? po.contractDate ?? po.createdDate ?? ""}
                            style={{ width: "100%", background: "#fff" }}
                            onChange={(e) => {
                              const val = e.target.value;
                              onUpdate({
                                ...po,
                                contractDate: val,
                                docs: (po.docs || []).map((x) =>
                                  x.id === d.id
                                    ? { ...x, isContract: true, contractDate: val }
                                    : x
                                ),
                              });
                            }}
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              color: "#4c1d95",
                              marginBottom: "4px",
                            }}
                          >
                            Giá trị hợp đồng (= Giá trị PO)
                          </label>
                          <input
                            readOnly
                            value={`${fmt(total)} ₫`}
                            style={{
                              width: "100%",
                              background: "#f3e8ff",
                              color: "#4c1d95",
                              fontWeight: 700,
                              cursor: "default",
                            }}
                            title="Giá trị hợp đồng tự động bằng giá trị PO"
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: "8px" }}>
                        <input
                          placeholder="Ghi chú hợp đồng (nếu có)..."
                          value={d.note || ""}
                          style={{ width: "100%", background: "#fff", fontSize: "12px" }}
                          onChange={(e) =>
                            onUpdate({
                              ...po,
                              docs: (po.docs || []).map((x) =>
                                x.id === d.id ? { ...x, note: e.target.value } : x
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={d.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: readOnly ? "1.2fr 115px 1fr" : "1.2fr 115px 1fr 34px",
                      gap: "7px",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid #edf1f5",
                    }}
                  >
                    <input
                      value={d.name || ""}
                      placeholder="Tên loại hồ sơ..."
                      onChange={(e) =>
                        onUpdate({
                          ...po,
                          docs: (po.docs || []).map((x) =>
                            x.id === d.id ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <select
                      value={d.status || "Còn thiếu"}
                      onChange={(e) =>
                        onUpdate({
                          ...po,
                          docs: (po.docs || []).map((x) =>
                            x.id === d.id
                              ? { ...x, status: e.target.value as PODoc["status"] }
                              : x,
                          ),
                        })
                      }
                    >
                      <option>Đã đủ</option>
                      <option>Còn thiếu</option>
                      <option>Chờ bổ sung</option>
                    </select>
                    <input
                      placeholder="Ghi chú"
                      value={d.note || ""}
                      onChange={(e) =>
                        onUpdate({
                          ...po,
                          docs: (po.docs || []).map((x) =>
                            x.id === d.id ? { ...x, note: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate({
                            ...po,
                            docs: (po.docs || []).filter((x) => x.id !== d.id),
                          })
                        }
                        style={{
                          height: "34px",
                          width: "34px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#fff5f5",
                          border: "1px solid #fca5a5",
                          borderRadius: "5px",
                          color: "#dc2626",
                          cursor: "pointer",
                          fontSize: "14px",
                          padding: 0,
                        }}
                        title={`Xóa hồ sơ "${d.name}"`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {!readOnly && (
            <DocumentManager
              title={`File hồ sơ PO ${po.number}`}
              entityType="po"
              entityId={String(po.id)}
              workspaceId={workspaceId}
              readOnly={readOnly}
              onStatus={onStatus}
            />
          )}
        </section>
          )}

          {(activeTab === "payments" || activeTab === "all") && (
            <section id="payments" className="po-section po-payment-section">
          <div
            className="section-heading"
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => setIsPaymentsExpanded(!isPaymentsExpanded)}
          >
            <div>
              <h2>Các đợt thanh toán ({(po.payments || []).length} đợt)</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaymentsExpanded(!isPaymentsExpanded);
                }}
                style={{
                  height: "30px",
                  padding: "0 12px",
                  background: isPaymentsExpanded ? "#e2e8f0" : "#eff6ff",
                  border: isPaymentsExpanded ? "1px solid #cbd5e1" : "1px solid #bfdbfe",
                  color: isPaymentsExpanded ? "#334155" : "#0284c7",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                {isPaymentsExpanded ? "▲ Thu gọn đợt TT" : `▼ Xem chi tiết (${(po.payments || []).length} đợt)`}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaymentsExpanded(true);
                  handleAddPaymentStage();
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "30px", fontSize: "12px" }}
              >
                <Plus size={14} /> Thêm đợt
              </button>
            </div>
          </div>

          {/* Quick preset selector & allocation KPI */}
          <div className="po-payment-summary-bar">
            <div className="po-payment-summary-kpis">
              <span>Tổng đơn: <b>{fmt(total)} ₫</b></span>
              <span>
                Phân bổ:{" "}
                <b style={{ color: totalAllocatedPercent === 100 ? "#16a34a" : totalAllocatedPercent > 100 ? "#dc2626" : "#d97706" }}>
                  {totalAllocatedPercent}% ({fmt(totalAllocatedAmount)} ₫)
                </b>
              </span>
              {totalAllocatedPercent === 100 && (
                <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "12px" }}>✓ Đã đủ 100%</span>
              )}
              {totalAllocatedPercent < 100 && (
                <span style={{ color: "#d97706", fontWeight: 600, fontSize: "12px" }}>⚠️ Thiếu {100 - totalAllocatedPercent}%</span>
              )}
              {totalAllocatedPercent > 100 && (
                <span style={{ color: "#dc2626", fontWeight: 600, fontSize: "12px" }}>⚠️ Vượt {totalAllocatedPercent - 100}%</span>
              )}
            </div>
          </div>

          {/* CHẾ ĐỘ THU GỌN: Chỉ hiển thị tóm tắt gọn các đợt */}
          {!isPaymentsExpanded ? (
            <div
              style={{
                padding: "12px 14px",
                background: "#ffffff",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                marginTop: "10px",
                cursor: "pointer",
              }}
              onClick={() => setIsPaymentsExpanded(true)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>
                  Danh sách đợt thanh toán ({(po.payments || []).length} đợt):
                </span>
                <span style={{ fontSize: "12px", color: "#0284c7", fontWeight: 600 }}>
                  Chạm để mở rộng ➔
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {(po.payments || []).length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic", padding: "6px 0" }}>
                    Chưa thiết lập đợt thanh toán nào. Chạm vào để thêm.
                  </div>
                ) : (
                  (po.payments || []).map((p, idx) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12.5px",
                        padding: "6px 10px",
                        background: "#f8fafc",
                        borderRadius: "6px",
                        border: "1px solid #f1f5f9",
                        flexWrap: "wrap",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: 700, color: "#0284c7" }}>Đợt {idx + 1}:</span>
                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{p.phase || `Đợt ${idx + 1}`}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontWeight: 700, color: "#1d4ed8" }}>
                          {p.percent}% ({fmt(p.amount)} ₫)
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: p.status === "Đã thanh toán" ? "#dcfce7" : "#f1f5f9",
                            color: p.status === "Đã thanh toán" ? "#166534" : "#64748b",
                          }}
                        >
                          {p.status || "Chưa thanh toán"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* CHẾ ĐỘ MỞ RỘNG: Hiển thị đầy đủ mẫu thiết lập & từng card đợt thanh toán */
            <>
              <div className="po-payment-preset-bar">
                <span style={{ fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Mẫu thiết lập nhanh:</span>
                <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("1-post")} title="1 đợt trả sau 100% khi nhận hàng">
                  📦 1 đợt Trả sau (100%)
                </button>
                <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("1-advance")} title="1 đợt trả trước 100% tạm ứng">
                  ⚡ 1 đợt Trả trước (100%)
                </button>
                <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("2-50-50")} title="2 đợt: Tạm ứng 50% + Quyết toán 50%">
                  ⚖️ 2 đợt (50% - 50%)
                </button>
                <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("2-30-70")} title="2 đợt: Tạm ứng 30% + Quyết toán 70%">
                  💼 2 đợt (30% - 70%)
                </button>
                <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("3-30-40-30")} title="3 đợt: Tạm ứng 30% + Giao hàng 40% + Quyết toán 30%">
                  🏗️ 3 đợt (30% - 40% - 30%)
                </button>
              </div>

              {/* Payment cards list */}
              <div className="po-payment-cards-list">
                {(!po.payments || po.payments.length === 0) && (
                  <div style={{ textAlign: "center", padding: "20px 12px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#64748b" }}>
                    <p style={{ margin: "0 0 10px 0" }}>Chưa có đợt thanh toán nào được cấu hình cho đơn hàng này.</p>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                      <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("1-post")}>
                        Chọn 1 đợt trả sau (100%)
                      </button>
                      <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("2-50-50")}>
                        Chọn 2 đợt (50% - 50%)
                      </button>
                      <button type="button" className="po-preset-pill" onClick={handleAddPaymentStage} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Plus size={12} /> Thêm đợt thủ công
                      </button>
                    </div>
                  </div>
                )}

            {po.payments?.map((p, idx) => {
              const condition = p.condition || (idx === 0 && po.payments.length > 1 ? "advance" : "post");
              return (
                <div key={p.id} className="po-payment-card">
                  {/* Card Header */}
                  <div className="po-payment-card-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                      <span className="po-stage-badge">Đợt {idx + 1}</span>
                      <input
                        className="po-stage-title-input"
                        placeholder="Tên đợt thanh toán (VD: Tạm ứng, Giao hàng, Quyết toán...)"
                        value={p.phase}
                        onChange={(e) => handleUpdatePaymentStage(p.id, { phase: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="po-stage-del-btn"
                      onClick={() => handleRemovePaymentStage(p.id)}
                      title="Xóa đợt thanh toán này (cho phép giảm xuống 1 đợt duy nhất)"
                      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <Trash2 size={13} /> Xóa đợt
                    </button>
                  </div>

                  {/* Card Body */}
                  <div className="po-payment-card-body">
                    {/* Financial details & status */}
                    <div className="po-payment-grid">
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Tỷ lệ (%)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            style={{ width: "60px", textAlign: "right" }}
                            value={p.percent}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { percent: Number(e.target.value) })}
                          />
                          <span style={{ fontWeight: 600, color: "#475569" }}>%</span>
                          {p.percent !== 100 && (
                            <button
                              type="button"
                              style={{ padding: "2px 5px", fontSize: "10px", background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: "3px", cursor: "pointer" }}
                              onClick={() => handleUpdatePaymentStage(p.id, { percent: 100 })}
                              title="Đặt đợt này thành 100%"
                            >
                              100%
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Số tiền thanh toán (₫)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input
                            type="number"
                            style={{ width: "100%", fontWeight: 700, color: "#0f172a" }}
                            value={p.amount}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { amount: Number(e.target.value) })}
                          />
                          <span style={{ fontSize: "11px", color: "#0284c7", fontWeight: 600, whiteSpace: "nowrap" }}>
                            {fmt(p.amount)} ₫
                          </span>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Trạng thái
                        </label>
                        <select
                          value={p.status === "Đã thanh toán" ? "Đã thanh toán" : "Chưa thanh toán"}
                          onChange={(e) => handleUpdatePaymentStage(p.id, { status: e.target.value as Payment["status"] })}
                          style={{
                            fontWeight: 600,
                            color: p.status === "Đã thanh toán" ? "#16a34a" : "#475569"
                          }}
                        >
                          <option>Chưa thanh toán</option>
                          <option>Đã thanh toán</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Hạn / Ngày TT
                        </label>
                        <input
                          type="date"
                          value={p.date}
                          onChange={(e) => handleUpdatePaymentStage(p.id, { date: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Condition Selector */}
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                        Điều kiện thanh toán:
                      </label>
                      <div className="po-condition-toggles">
                        <button
                          type="button"
                          className={`po-condition-btn ${condition === "advance" ? "active-advance" : ""}`}
                          onClick={() => handleUpdatePaymentStage(p.id, {
                            condition: "advance",
                            note: p.note || "Yêu cầu bổ sung hóa đơn VAT sau khi giao hàng"
                          })}
                        >
                          ⚡ Trả trước (Tạm ứng trước giao hàng)
                        </button>
                        <button
                          type="button"
                          className={`po-condition-btn ${condition === "post" ? "active-post" : ""}`}
                          onClick={() => handleUpdatePaymentStage(p.id, {
                            condition: "post",
                            note: p.note === "Yêu cầu bổ sung hóa đơn VAT sau khi giao hàng" ? "" : p.note
                          })}
                        >
                          📦 Trả sau (Sau khi nhận hàng & HĐ VAT)
                        </button>
                        <button
                          type="button"
                          className={`po-condition-btn ${condition === "other" ? "active-other" : ""}`}
                          onClick={() => handleUpdatePaymentStage(p.id, { condition: "other" })}
                        >
                          ⚙️ Khác
                        </button>
                      </div>
                    </div>

                    {/* Condition Requirements & Invoices */}
                    {condition === "advance" && (
                      <div className="po-condition-box-advance">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <span style={{ fontSize: "14px" }}>⚠️</span>
                          <div>
                            <b>Quy định trả trước: Yêu cầu bổ sung hóa đơn sau khi giao hàng</b>
                            <p style={{ margin: "2px 0 0 0", color: "#78350f" }}>
                              Đợt thanh toán trả trước (tạm ứng). NCC chưa xuất hóa đơn VAT tại thời điểm giải ngân đợt này.
                              Bắt buộc NCC phải bổ sung đầy đủ Hóa đơn GTGT sau khi hoàn tất giao hàng & nghiệm thu.
                            </p>
                          </div>
                        </div>
                        <div className="po-invoice-row">
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Số HĐ VAT bổ sung (nếu đã nhận):
                            </span>
                            <input
                              placeholder="Chờ NCC bổ sung sau giao hàng..."
                              value={p.invoiceNo || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceNo: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ngày HĐ VAT:
                            </span>
                            <input
                              type="date"
                              value={p.invoiceDate || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceDate: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ghi chú điều kiện / Hạn nợ HĐ:
                            </span>
                            <input
                              placeholder="Hạn bổ sung HĐ sau giao hàng..."
                              value={p.note || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { note: e.target.value })}
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed rgba(148, 163, 184, 0.4)" }}>
                          <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px", color: "#334155" }}>
                            Bản scan Hóa đơn GTGT (Xem trực tiếp / In / Chia sẻ):
                          </span>
                          <InvoiceScanControl
                            scanUrl={p.invoiceScanUrl}
                            scanName={p.invoiceScanName}
                            invoiceNo={p.invoiceNo}
                            invoiceDate={p.invoiceDate}
                            entityCode={po.number}
                            supplierName={supplier?.name}
                            onUpdate={(scanUrl, scanName) =>
                              handleUpdatePaymentStage(p.id, { invoiceScanUrl: scanUrl, invoiceScanName: scanName })
                            }
                            onStatus={onStatus}
                          />
                        </div>
                      </div>
                    )}

                    {condition === "post" && (
                      <div className="po-condition-box-post">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <span style={{ fontSize: "14px" }}>📄</span>
                          <div>
                            <b>Quy định trả sau: Bắt buộc nhập Số hóa đơn GTGT trước khi lập ĐNTT</b>
                            <p style={{ margin: "2px 0 0 0", color: "#14532d" }}>
                              Đợt thanh toán trả sau (sau giao hàng / công nợ). Yêu cầu nhập đầy đủ thông tin Hóa đơn GTGT do NCC đã phát hành trước khi giải ngân.
                            </p>
                          </div>
                        </div>
                        <div className="po-invoice-row">
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px", color: !p.invoiceNo ? "#b91c1c" : "#166534" }}>
                              Số HĐ GTGT đã xuất: {!p.invoiceNo ? "(BẮT BUỘC ĐỂ LẬP ĐNTT)" : "✓ Đã nhập"}
                            </span>
                            <input
                              id={`invoice-no-input-${p.id}`}
                              placeholder="Ví dụ: 0012345, 1C24T..."
                              style={{
                                borderColor: !p.invoiceNo ? "#ef4444" : "#86efac",
                                background: !p.invoiceNo ? "#fff1f2" : "#ffffff",
                              }}
                              value={p.invoiceNo || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceNo: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ngày xuất hóa đơn:
                            </span>
                            <input
                              type="date"
                              value={p.invoiceDate || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceDate: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ghi chú chứng từ kèm theo:
                            </span>
                            <input
                              placeholder="Biên bản giao hàng, phiếu nghiệm thu..."
                              value={p.note || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { note: e.target.value })}
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed rgba(22, 101, 52, 0.25)" }}>
                          <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px", color: "#14532d" }}>
                            Bản scan Hóa đơn GTGT (Xem trực tiếp / In / Chia sẻ):
                          </span>
                          <InvoiceScanControl
                            scanUrl={p.invoiceScanUrl}
                            scanName={p.invoiceScanName}
                            invoiceNo={p.invoiceNo}
                            invoiceDate={p.invoiceDate}
                            entityCode={po.number}
                            supplierName={supplier?.name}
                            onUpdate={(scanUrl, scanName) =>
                              handleUpdatePaymentStage(p.id, { invoiceScanUrl: scanUrl, invoiceScanName: scanName })
                            }
                            onStatus={onStatus}
                          />
                        </div>
                      </div>
                    )}

                    {condition === "other" && (
                      <div className="po-condition-box-other">
                        <span style={{ fontWeight: 600 }}>Tùy chọn chứng từ hóa đơn:</span>
                        <div className="po-invoice-row">
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px", color: !p.invoiceNo ? "#b91c1c" : "#166534" }}>
                              Số hóa đơn GTGT: {!p.invoiceNo ? "(Bắt buộc nếu trả sau)" : "✓ Đã có"}
                            </span>
                            <input
                              id={`invoice-no-input-${p.id}`}
                              placeholder="Số hóa đơn (nếu có)..."
                              style={{ borderColor: !p.invoiceNo ? "#ef4444" : "#cbd5e1" }}
                              value={p.invoiceNo || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceNo: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ngày hóa đơn:
                            </span>
                            <input
                              type="date"
                              value={p.invoiceDate || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceDate: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ghi chú điều khoản:
                            </span>
                            <input
                              placeholder="Ghi chú điều khoản thanh toán..."
                              value={p.note || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { note: e.target.value })}
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed rgba(148, 163, 184, 0.4)" }}>
                          <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px", color: "#334155" }}>
                            Bản scan Hóa đơn GTGT (Xem trực tiếp / In / Chia sẻ):
                          </span>
                          <InvoiceScanControl
                            scanUrl={p.invoiceScanUrl}
                            scanName={p.invoiceScanName}
                            invoiceNo={p.invoiceNo}
                            invoiceDate={p.invoiceDate}
                            entityCode={po.number}
                            supplierName={supplier?.name}
                            onUpdate={(scanUrl, scanName) =>
                              handleUpdatePaymentStage(p.id, { invoiceScanUrl: scanUrl, invoiceScanName: scanName })
                            }
                            onStatus={onStatus}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Lập ĐNTT / Xem ĐNTT liên kết */}
                  <div className="po-payment-card-footer">
                    {p.paymentRequestId ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px", flexWrap: "wrap" }}>
                        <div className="po-payment-req-linked">
                          <span>✓ Đã liên kết Đề nghị thanh toán #{p.paymentRequestId}</span>
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          {onPrintPaymentRequest && (
                            <button
                              type="button"
                              className="po-create-payment-req-btn"
                              onClick={() => onPrintPaymentRequest(p.paymentRequestId!)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                background: "#0284c7",
                                color: "#ffffff",
                                border: "none",
                              }}
                              title="Mở trực tiếp bản in Giấy đề nghị thanh toán (Mẫu 01-TT)"
                            >
                              <Printer size={13} /> In phiếu ĐNTT
                            </button>
                          )}
                          <button
                            type="button"
                            className="po-create-payment-req-btn"
                            onClick={() => onNavigateToPayment?.(p.paymentRequestId)}
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            Xem ĐNTT <ArrowRight size={13} />
                          </button>
                          <button
                            type="button"
                            style={{ padding: "4px 8px", background: "transparent", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px", color: "#64748b", cursor: "pointer" }}
                            onClick={() => {
                              if (confirm("Bạn có muốn hủy liên kết ĐNTT này khỏi đợt thanh toán không?")) {
                                handleUpdatePaymentStage(p.id, { paymentRequestId: undefined, status: "Chưa thanh toán" });
                                onStatus?.(`Đã hủy liên kết ĐNTT cho đợt "${p.phase}"`);
                              }
                            }}
                            title="Hủy liên kết để có thể lập lại ĐNTT mới hoặc liên kết với phiếu ĐNTT khác"
                          >
                            Hủy liên kết
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px", flexWrap: "wrap" }}>
                        <div>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            Chưa lập ĐNTT cho đợt này ({fmt(p.amount)} ₫).
                          </span>
                          {condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim()) && (
                            <div style={{ fontSize: "11.5px", color: "#dc2626", fontWeight: 600, marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <AlertCircle size={13} /> Bắt buộc nhập Số HĐ GTGT để lập ĐNTT trả sau
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          {/* Nút Liên kết với phiếu ĐNTT tự tạo */}
                          <button
                            type="button"
                            className="po-link-payment-req-btn"
                            onClick={() => setLinkingStage(p)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "6px 12px",
                              background: "#f1f5f9",
                              color: "#0f172a",
                              border: "1px solid #cbd5e1",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            title="Liên kết đợt thanh toán này với một Phiếu Đề nghị thanh toán đã tự tạo sẵn"
                          >
                            <Link2 size={13} /> Liên kết ĐNTT có sẵn
                          </button>

                          {/* Nút Lập ĐNTT & In mới */}
                          {onCreatePaymentRequest && (
                            <button
                              type="button"
                              className="po-create-payment-req-btn"
                              onClick={() => {
                                const isPost = condition !== "advance";
                                const hasInv = Boolean(p.invoiceNo && p.invoiceNo.trim());
                                if (isPost && !hasInv) {
                                  alert(
                                    `Đợt thanh toán trả sau "${p.phase}" bắt buộc phải có thông tin Số hóa đơn GTGT.\n\n` +
                                    `Vui lòng nhập Số hóa đơn vào ô "Số HĐ GTGT đã xuất" bên trên trước khi lập ĐNTT, hoặc bấm nút "Liên kết ĐNTT có sẵn" nếu đã có phiếu tự tạo!`
                                  );
                                  const inputEl = document.getElementById(`invoice-no-input-${p.id}`);
                                  if (inputEl) {
                                    inputEl.scrollIntoView({ behavior: "smooth", block: "center" });
                                    inputEl.focus();
                                  }
                                  return;
                                }
                                onCreatePaymentRequest(po, p);
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                background: condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim()) ? "#94a3b8" : "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
                                color: "#ffffff",
                                border: "1px solid #1d4ed8",
                                opacity: condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim()) ? 0.85 : 1,
                              }}
                              title={
                                condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim())
                                  ? "Yêu cầu nhập Số hóa đơn trước khi lập ĐNTT trả sau"
                                  : "Lập Đề nghị thanh toán và mở trực tiếp bản in Mẫu 01-TT"
                              }
                            >
                              <CreditCard size={14} /> Lập ĐNTT & In
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
              </div>
              <div style={{ marginTop: "12px", textAlign: "right" }}>
                <button
                  type="button"
                  onClick={() => setIsPaymentsExpanded(false)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    color: "#475569",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ▲ Thu gọn các đợt thanh toán
                </button>
              </div>
            </>
          )}
        </section>
          )}
        </div>
      )}

      {/* 4. TIMELINE GIAO HÀNG & THANH TOÁN */}
      {(activeTab === "timeline" || activeTab === "all") && (
        <section id="timeline" className="po-section">
        <div className="section-heading">
          <div>
            <span>◷</span>
            <h2>Timeline giao hàng & thanh toán</h2>
          </div>
        </div>
        <div className="timeline">
          <VisualTimeline
            empty="Chưa có sự kiện giao hàng hoặc thanh toán."
            items={events.map((e, i) => ({
              id: i,
              date: e.date,
              title: e.title,
              note: e.note,
              status: e.kind === "payment" ? "done" : "doing",
            }))}
          />
        </div>
      </section>
      )}

      {/* 5. DANH SÁCH HÀNG HÓA & GIAO HÀNG */}
      {(activeTab === "items" || activeTab === "all") && (
        <>
          <section id="po-items" className="po-section">
        <div className="section-heading">
          <div>
            <span>📦</span>
            <h2>Danh sách hàng hóa trong PO ({items.length})</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#475569",
                marginRight: "4px",
              }}
            >
              <span>Ngày dự kiến giao chung:</span>
              <input
                type="date"
                value={po.expectedDate || ""}
                disabled={readOnly}
                style={{ height: "32px", fontSize: "12px", padding: "2px 8px" }}
                onChange={(e) => onUpdate({ ...po, expectedDate: e.target.value })}
              />
            </label>

            {!readOnly && approvalRequests.length > 0 && (
              <button
                type="button"
                onClick={() => setShowImportApprovalModal(true)}
                style={{
                  height: "34px",
                  padding: "0 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#f5f3ff",
                  border: "1px solid #c4b5fd",
                  color: "#6d28d9",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                title="Lấy danh sách hàng hóa & đơn giá từ Phiếu Đề nghị phê duyệt (ĐNPĐ)"
              >
                <FileDown size={14} /> Lấy từ ĐNPĐ
              </button>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={openDeliveryPopup}
                style={{
                  height: "34px",
                  padding: "0 13px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  background: "#0284c7",
                  border: "1px solid #0369a1",
                  color: "#ffffff",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Ghi nhận đợt giao nhận hàng từ Nhà cung cấp đến Nhân viên mua hàng"
              >
                <Truck size={14} /> Giao hàng
              </button>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={openDeliveryPopup}
                style={{
                  height: "34px",
                  padding: "0 11px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: deliveredStats.isFullyDelivered ? "#f0fdf4" : "#f8fafc",
                  border: deliveredStats.isFullyDelivered ? "1px solid #86efac" : "1px solid #cbd5e1",
                  color: deliveredStats.isFullyDelivered ? "#15803d" : "#334155",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                title="Xem tiến độ và chi tiết các đợt hàng đã nhận từ Nhà cung cấp"
              >
                <Package size={14} />
                <span>Hàng đã nhận ({deliveredStats.deliveredItemsCount}/{deliveredStats.totalItems})</span>
              </button>
            )}

            {onCreateHandover && (
              <button
                type="button"
                onClick={() => onCreateHandover(po)}
                style={{
                  height: "34px",
                  padding: "0 13px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  background: "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
                  border: "1px solid #1d4ed8",
                  color: "#ffffff",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 3px rgba(34, 82, 246, 0.25)",
                }}
                title="Nhân viên mua hàng bàn giao trực tiếp cho Bộ phận sử dụng (không qua kho), tự động đẩy dữ liệu sang Tab Bàn giao để tạo phiếu"
              >
                <ClipboardCheck size={14} /> Bàn giao nội bộ
              </button>
            )}

            {linkedHandovers.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) {
                    onNavigate({ view: "handover", query: po.number });
                  }
                }}
                style={{
                  height: "34px",
                  padding: "0 11px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1d4ed8",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                title={`Đã có ${linkedHandoverBatchesCount || 1} đợt bàn giao nội bộ từ PO này. Bấm để chuyển sang Tab Bàn giao.`}
              >
                <ExternalLink size={13} />
                <span>Tab Bàn giao ({linkedHandoverBatchesCount || 1})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setItemsViewMode(itemsViewMode === "card" ? "table" : "card")}
              style={{
                height: "34px",
                padding: "0 10px",
                fontSize: "12px",
                fontWeight: 600,
                background: itemsViewMode === "card" ? "#eff6ff" : "#f8fafc",
                border: itemsViewMode === "card" ? "1px solid #3b82f6" : "1px solid #cbd5e1",
                borderRadius: "6px",
                cursor: "pointer",
                color: itemsViewMode === "card" ? "#1d4ed8" : "#334155",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
              title="Chuyển chế độ xem dạng Bảng chi tiết hoặc Thẻ di động"
            >
              {itemsViewMode === "card" ? <Table size={14} /> : <LayoutGrid size={14} />}
              {itemsViewMode === "card" ? "Dạng bảng" : "Dạng thẻ"}
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  const newItem: POItem = {
                    id: makeId(),
                    code: `VT-${String(items.length + 1).padStart(2, "0")}`,
                    category: "Vật tư / Hàng hóa",
                    name: "",
                    desc: "",
                    spec: "",
                    unit: "Cái",
                    qty: 1,
                    estimate: 0,
                    price: 0,
                    vatRate: 8,
                    note: "",
                    deliveryStatus: "Chưa giao",
                    deliveredQty: 0,
                    deliveryDate: "",
                    deliveryHistory: [],
                  };
                  updatePOItemsAndSyncPayments([...items, newItem]);
                }}
                style={{
                  height: "34px",
                  padding: "0 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Plus size={14} /> Thêm hàng
              </button>
            )}
          </div>
        </div>

        {/* MOBILE CARDS VIEW */}
        {(itemsViewMode === "card" || itemsViewMode === "auto") && (
          <div
            className={itemsViewMode === "auto" ? "po-mobile-cards-view" : ""}
            style={{ padding: "12px 14px" }}
          >
            <POItemsMobileCards
              po={po}
              items={items}
              readOnly={readOnly}
              onUpdateItem={(id, patch) => {
                const nextItems = items.map((x) => (x.id === id ? { ...x, ...patch } : x));
                updatePOItemsAndSyncPayments(nextItems);
              }}
              onDeleteItem={(id) => {
                const nextItems = items.filter((x) => x.id !== id);
                updatePOItemsAndSyncPayments(nextItems);
              }}
              onOpenDeliveryPopup={openDeliveryPopup}
            />
          </div>
        )}

        {/* DESKTOP TABLE VIEW */}
        {(itemsViewMode === "table" || itemsViewMode === "auto") && (
          <div
            className={`delivery-table ${itemsViewMode === "auto" ? "po-desktop-table-view" : ""}`}
            style={{ overflowX: "auto" }}
          >
          <table style={{ width: "100%", minWidth: "1050px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ width: "42px", textAlign: "center" }}>STT</th>
                <th style={{ minWidth: "220px" }}>Tên hàng hóa</th>
                <th style={{ width: "90px", textAlign: "right" }}>Số lượng</th>
                <th style={{ width: "80px", textAlign: "center" }}>ĐVT</th>
                <th style={{ width: "130px", textAlign: "right" }}>Đơn giá (₫)</th>
                <th style={{ width: "125px", textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <span>VAT (%)</span>
                    {!readOnly && items.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value === "") return;
                          const rate = Number(e.target.value);
                          const nextItems = items.map((it) => ({ ...it, vatRate: rate }));
                          updatePOItemsAndSyncPayments(nextItems);
                        }}
                        style={{
                          height: "24px",
                          fontSize: "11px",
                          padding: "0 4px",
                          background: "#f8fafc",
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          fontWeight: 600,
                          color: "#0284c7",
                          cursor: "pointer",
                        }}
                        title="Chọn mức thuế VAT áp dụng nhanh cho tất cả mặt hàng trong PO"
                      >
                        <option value="">Chọn tất cả...</option>
                        <option value="0">Tất cả 0%</option>
                        <option value="5">Tất cả 5%</option>
                        <option value="8">Tất cả 8%</option>
                        <option value="10">Tất cả 10%</option>
                      </select>
                    )}
                  </div>
                </th>
                <th style={{ width: "140px", textAlign: "right" }}>Thành tiền (₫)</th>
                <th style={{ width: "175px", textAlign: "center" }}>Ngày giao hàng</th>
                <th style={{ minWidth: "160px" }}>Ghi chú</th>
                {!readOnly && <th style={{ width: "44px", textAlign: "center" }}>Xóa</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={readOnly ? 9 : 10}
                    style={{
                      textAlign: "center",
                      padding: "20px 12px",
                      color: "#64748b",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      Chưa có mặt hàng nào trong PO này. Bấm <b>&quot;＋ Thêm hàng hóa&quot;</b>, <b>&quot;📥 Lấy hàng từ ĐNPĐ&quot;</b> hoặc dán trực tiếp từ Excel vào ô bên dưới:
                    </div>
                    {!readOnly && (
                      <div style={{ marginTop: "8px", display: "flex", justifyContent: "center" }}>
                        <input
                          value=""
                          onChange={() => {}}
                          onPaste={(e) => handlePOItemPaste(e, 0, "name")}
                          placeholder="📋 Click vào đây và nhấn Ctrl+V để dán bảng hàng hóa từ Excel..."
                          style={{
                            maxWidth: "460px",
                            width: "100%",
                            textAlign: "center",
                            border: "1px dashed #3b82f6",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            fontWeight: 600,
                          }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((i, idx) => {
                  const rowTotal = calcPOItemTotal(i);
                  const stat = calcPOItemDeliveryStats(i, po, paymentHandovers);
                  const delivQty = stat.quantityDelivered;
                  const orderQty = stat.quantityOrdered;
                  const isDone = stat.isFullyDelivered;
                  const isPartial = stat.quantityDelivered > 0 && !stat.isFullyDelivered;
                  const historyList = i.deliveryHistory || [];
                  return (
                    <tr key={i.id}>
                      <td style={{ textAlign: "center", fontWeight: 600, color: "#64748b" }}>
                        {idx + 1}
                      </td>
                      <td>
                        <input
                          value={i.name ?? (i as any).itemName ?? (i as any).item_name ?? (i as any).productName ?? ""}
                          disabled={readOnly}
                          placeholder="Nhập tên hàng hóa / vật tư..."
                          style={{ width: "100%", fontWeight: 600 }}
                          onPaste={(e) => handlePOItemPaste(e, idx, "name")}
                          onChange={(e) => {
                            const nextItems = items.map((x) =>
                              x.id === i.id
                                ? ({ ...x, name: e.target.value, itemName: undefined, item_name: undefined, productName: undefined } as any)
                                : x
                            );
                            onUpdate({ ...po, items: nextItems });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={i.qty === 0 ? "" : (i.qty ?? "")}
                          disabled={readOnly}
                          style={{ width: "100%", textAlign: "right", fontWeight: 600 }}
                          onPaste={(e) => handlePOItemPaste(e, idx, "qty")}
                          onChange={(e) => {
                            const val = e.target.value === "" ? 0 : (Number(e.target.value) || 0);
                            const nextItems = items.map((x) =>
                              x.id === i.id ? { ...x, qty: val } : x
                            );
                            updatePOItemsAndSyncPayments(nextItems);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={i.unit || ""}
                          disabled={readOnly}
                          placeholder="ĐVT"
                          style={{ width: "100%", textAlign: "center" }}
                          onPaste={(e) => handlePOItemPaste(e, idx, "unit")}
                          onChange={(e) => {
                            const nextItems = items.map((x) =>
                              x.id === i.id ? { ...x, unit: e.target.value } : x
                            );
                            onUpdate({ ...po, items: nextItems });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={i.price === 0 ? "" : (i.price ?? "")}
                          disabled={readOnly}
                          style={{ width: "100%", textAlign: "right", fontWeight: 600 }}
                          onPaste={(e) => handlePOItemPaste(e, idx, "price")}
                          onChange={(e) => {
                            const val = e.target.value === "" ? 0 : (Number(e.target.value) || 0);
                            const nextItems = items.map((x) =>
                              x.id === i.id ? { ...x, price: val } : x
                            );
                            updatePOItemsAndSyncPayments(nextItems);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <select
                          value={i.vatRate ?? 0}
                          disabled={readOnly}
                          style={{ width: "100%", textAlign: "center", fontWeight: 600 }}
                          onChange={(e) => {
                            const rate = Number(e.target.value) || 0;
                            const nextItems = items.map((x) =>
                              x.id === i.id ? { ...x, vatRate: rate } : x
                            );
                            updatePOItemsAndSyncPayments(nextItems);
                          }}
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={8}>8%</option>
                          <option value={10}>10%</option>
                        </select>
                      </td>
                      <td
                        className="money"
                        style={{
                          textAlign: "right",
                          fontWeight: 700,
                          color: "#0f172a",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmt(rowTotal)} ₫
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div
                          onClick={!readOnly ? openDeliveryPopup : undefined}
                          style={{
                            cursor: !readOnly ? "pointer" : "default",
                            padding: "4px 6px",
                            borderRadius: "6px",
                            background: isDone
                              ? "#f0fdf4"
                              : isPartial
                              ? "#fefce8"
                              : "#f8fafc",
                            border: `1px solid ${
                              isDone ? "#bbf7d0" : isPartial ? "#fde047" : "#e2e8f0"
                            }`,
                            fontSize: "11.5px",
                          }}
                          title="Bấm nút '🚚 Giao hàng' để cập nhật ngày giao và số lượng giao"
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: isDone
                                ? "#15803d"
                                : isPartial
                                ? "#b45309"
                                : "#64748b",
                            }}
                          >
                            {isDone
                              ? `✓ Đã giao đủ (${delivQty}/${orderQty})`
                              : isPartial
                              ? `⏳ Đã giao ${delivQty}/${orderQty} (Thiếu ${stat.quantityRemaining})`
                              : "Chưa giao"}
                          </div>
                          {historyList.length > 0 ? (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#334155",
                                marginTop: "2px",
                              }}
                            >
                              {historyList.map((h, hIdx) => (
                                <div key={hIdx}>
                                  📅 {dateVN(h.date)} ({h.qty} {i.unit})
                                </div>
                              ))}
                            </div>
                          ) : i.deliveryDate ? (
                            <div style={{ fontSize: "11px", color: "#334155", marginTop: "2px" }}>
                              📅 {dateVN(i.deliveryDate)}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <input
                          value={i.note || ""}
                          disabled={readOnly}
                          placeholder="Ghi chú..."
                          style={{ width: "100%" }}
                          onPaste={(e) => handlePOItemPaste(e, idx, "note")}
                          onChange={(e) => {
                            const nextItems = items.map((x) =>
                              x.id === i.id ? { ...x, note: e.target.value } : x
                            );
                            onUpdate({ ...po, items: nextItems });
                          }}
                        />
                      </td>
                      {!readOnly && (
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const nextItems = items.filter((x) => x.id !== i.id);
                              updatePOItemsAndSyncPayments(nextItems);
                            }}
                            style={{
                              height: "30px",
                              width: "30px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "#fff5f5",
                              border: "1px solid #fca5a5",
                              borderRadius: "5px",
                              color: "#dc2626",
                              cursor: "pointer",
                              padding: 0,
                            }}
                            title="Xóa mặt hàng này khỏi PO"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
                  <td colSpan={6} style={{ textAlign: "right", padding: "8px 12px", color: "#475569" }}>
                    Tổng tiền trước thuế VAT:
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 12px", color: "#0f172a", whiteSpace: "nowrap" }}>
                    {fmt(subtotal)} ₫
                  </td>
                  <td colSpan={readOnly ? 2 : 3} />
                </tr>
                <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
                  <td colSpan={6} style={{ textAlign: "right", padding: "6px 12px", color: "#475569" }}>
                    Tổng tiền thuế VAT:
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 12px", color: "#0369a1", whiteSpace: "nowrap" }}>
                    {fmt(totalVatAmount)} ₫
                  </td>
                  <td colSpan={readOnly ? 2 : 3} />
                </tr>
                <tr style={{ background: "#eff6ff", fontWeight: 700, fontSize: "13.5px" }}>
                  <td colSpan={6} style={{ textAlign: "right", padding: "10px 12px", color: "#1e3a8a" }}>
                    TỔNG GIÁ TRỊ ĐƠN HÀNG PO (SAU VAT):
                  </td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: "#1d4ed8", whiteSpace: "nowrap" }}>
                    {fmt(total)} ₫
                  </td>
                  <td colSpan={readOnly ? 2 : 3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      </section>

      {/* THỐNG KÊ TỪNG ĐỢT BÀN GIAO TRONG PO VÀ CHỈNH SỬA SỐ LƯỢNG */}
      {onUpdateHandovers && (
        <POHandoverBatchSection
          po={po}
          paymentHandovers={paymentHandovers}
          onUpdateHandovers={onUpdateHandovers}
          onUpdatePO={onUpdate}
          readOnly={readOnly}
        />
      )}
        </>
      )}

      {/* POPUP GIAO HÀNG CHO PO (MOBILE-FIRST FIELD RECEIVING) */}
      <PODeliveryModal
        po={po}
        isOpen={showDeliveryModal}
        onClose={() => setShowDeliveryModal(false)}
        onConfirm={handleDeliveryConfirm}
        workspaceId={workspaceId}
        onStatus={onStatus}
        hasHandoverFeature={Boolean(onCreateHandover)}
        paymentHandovers={paymentHandovers}
        onUpdateHandovers={onUpdateHandovers}
        onUpdatePO={onUpdate}
      />

      {/* POPUP LẤY HÀNG HÓA TỪ ĐỀ NGHỊ PHÊ DUYỆT (ĐNPĐ) */}
      {showImportApprovalModal && (
        <div
          className="payment-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            className="payment-modal-card"
            style={{
              background: "#fff",
              borderRadius: "10px",
              maxWidth: "1000px",
              width: "100%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 35px -10px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f8fafc",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>
                  📥 Chọn Phiếu Đề nghị Phê duyệt (ĐNPĐ) để lấy danh sách hàng
                </h3>
                <small style={{ color: "#64748b" }}>
                  Hệ thống sẽ lấy toàn bộ mặt hàng, số lượng, ĐVT và đơn giá của NCC được lựa chọn sang PO này
                </small>
              </div>
              <button
                type="button"
                onClick={() => setShowImportApprovalModal(false)}
                style={{
                  border: 0,
                  background: "transparent",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
              {approvalRequests.map((req) => {
                const chosenCol = req.supplierColumns.find((c) => c.isSelected) || req.supplierColumns[0];
                return (
                  <div
                    key={req.id}
                    style={{
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      background: "#fcfdfe",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "13.5px" }}>
                        {req.prNumber || req.requestNumber} — {req.section1Title || req.department || "Phiếu phê duyệt NCC"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                        NCC được chọn: <b>{req.recommendedSupplierName || chosenCol?.supplierName || "Chưa chọn"}</b> · Số mặt hàng: <b>{req.rows.length}</b>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleImportItemsFromApproval(req)}
                      style={{
                        height: "34px",
                        padding: "0 14px",
                        background: "#6d28d9",
                        color: "#fff",
                        border: 0,
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "12px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <Check size={14} /> Lấy hàng
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="po-footer-actions">
          <button
            type="button"
            className="btn btn-outline btn-md"
            onClick={onBack}
            style={{
              height: "38px",
              padding: "0 16px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <ArrowLeft size={16} /> Quay lại
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {savedNotice && (
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#168446" }}>
                ✓ Đã lưu thành công!
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                className="delete-action"
                style={{
                  height: "38px",
                  padding: "0 14px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                onClick={() => onDelete(po)}
              >
                <Trash2 size={15} /> Xóa
              </button>
            )}
            <button
              type="button"
              className="po-save-btn"
              disabled={saving}
              onClick={() => void handleManualSave(false)}
            >
              {saving ? "Đang lưu..." : <><Save size={15} /> Lưu</>}
            </button>
            <button
              type="button"
              className="po-save-back-btn"
              disabled={saving}
              onClick={() => void handleManualSave(true)}
            >
              <Check size={15} /> Lưu & Quay lại
            </button>
          </div>
        </div>
      )}

      {/* Popup Liên kết Đợt thanh toán PO với Phiếu ĐNTT có sẵn / tự tạo */}
      {linkingStage && (
        <POPaymentLinkModal
          isOpen={Boolean(linkingStage)}
          onClose={() => setLinkingStage(null)}
          po={po}
          stage={linkingStage}
          paymentRequests={paymentRequests}
          pos={pos}
          onConfirmLink={handleConfirmLinkPaymentRequest}
        />
      )}
    </section>
  );
}

