"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Scale,
  FileText,
  Plus,
  RotateCcw,
  ArrowRight,
  PackagePlus,
  Trash2,
  ArrowLeft,
  ClipboardPaste,
  Check,
  Save,
  Printer,
  Search,
  CheckCircle2,
  Circle,
  Eye,
} from "lucide-react";
import {
  ApprovalItemRow,
  ApprovalRequest,
  ApprovalSupplierColumn,
  ApprovalSupplierQuoteLine,
  PR,
  PO,
  Quote,
  Supplier,
  TrashItem,
  generatePOCode,
  isPONumberExists,
} from "../types";
import { fmt as formatVND } from "../utils/format";
import { PHENIKAA_PHARMA_LOGO_BASE64, localToday } from "../payment-utils";
import {
  cleanExcelNumber,
  createApprovalFromCompare,
  createApprovalFromPR,
  createManualApproval,
  formatApprovalSection1Title,
  parseExcelClipboard,
} from "../utils/approvalSamples";
import { addNewDepartment, getUnifiedDepartments } from "../utils/departments";
import { DocFlowLinks } from "./DocFlowLinks";
import { resolveDocFlow } from "../utils/docFlow";
import { isApprovalCompleted, calcPODeliveryStats } from "../utils/paymentSync";
import { calcPOTotal, PaymentHandoverItem } from "../types";

export function getApprovalContextualStatus(
  req: ApprovalRequest,
  pos: PO[] = [],
  paymentHandovers: PaymentHandoverItem[] = []
): { text: string; badgeClass: string; style?: React.CSSProperties } {
  const linkedPo = pos.find(
    (p) =>
      (req.linkedPoId && p.id === req.linkedPoId) ||
      (req.linkedPoNumber && p.number === req.linkedPoNumber) ||
      (req.prNumber && p.prNumber === req.prNumber) ||
      (req.prId !== undefined && p.items?.some((it) => it.allocations?.some((al) => al.prId === req.prId)))
  );

  if (linkedPo) {
    const poTotal = calcPOTotal(linkedPo);
    const poPaid = (linkedPo.payments || [])
      .filter((p) => p.status === "Đã thanh toán")
      .reduce((n, p) => n + (Number(p.amount) || 0), 0);
    const isPaid = (poTotal > 0 && poPaid >= poTotal) || linkedPo.status === "Đã thanh toán";
    if (isPaid) {
      return {
        text: "Đã thanh toán",
        badgeClass: "done",
        style: { background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" },
      };
    }

    const deliveryStats = calcPODeliveryStats(linkedPo, paymentHandovers);
    const isDelivered =
      linkedPo.status === "Đã giao hàng" ||
      deliveryStats.isFullyDelivered ||
      (linkedPo.items.length > 0 && deliveryStats.fullyDeliveredItemsCount >= linkedPo.items.length);
    if (isDelivered) {
      return {
        text: "Đã giao hàng",
        badgeClass: "progress",
        style: { background: "#e0f2fe", color: "#0369a1", border: "1px solid #7dd3fc" },
      };
    }

    return {
      text: "Đã tạo PO",
      badgeClass: "progress",
      style: { background: "#f0fdfa", color: "#0f766e", border: "1px solid #99f6e4" },
    };
  }

  if (req.status === "Đã tạo PO") {
    return {
      text: "Đã tạo PO",
      badgeClass: "progress",
      style: { background: "#f0fdfa", color: "#0f766e", border: "1px solid #99f6e4" },
    };
  }

  if (req.status === "Đã phê duyệt") {
    return {
      text: "Đã phê duyệt",
      badgeClass: "done",
      style: { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" },
    };
  }

  if ((req.status as string) === "Từ chối") {
    return {
      text: "Từ chối",
      badgeClass: "waiting",
      style: { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" },
    };
  }

  return {
    text: req.status || "Chờ phê duyệt",
    badgeClass: "waiting",
    style: { background: "#fff5dc", color: "#a86600", border: "1px solid #fde68a" },
  };
}

interface ApprovalManagementProps {
  approvalRequests: ApprovalRequest[];
  activeApprovalId: number | null;
  setActiveApprovalId: (id: number | null) => void;
  onSaveApproval: (req: ApprovalRequest) => void;
  onDeleteApproval: (id: number) => void;
  onRestoreSamples: () => void;
  onCreatePOFromApproval: (req: ApprovalRequest, vatRate?: number, customPoNumber?: string) => void;
  trash?: TrashItem[];
  prs: PR[];
  suppliers: Supplier[];
  quotesByPr: Record<number, Quote>;
  quoteSupplierIdsByPr: Record<number, number[]>;
  isReportMode?: boolean;
  onBackToCompare?: () => void;
  autoPrint?: boolean;
  pos?: PO[];
  paymentHandovers?: PaymentHandoverItem[];
  onNavigate?: (route: any) => void;
  onToggleComplete?: (req: ApprovalRequest) => void;
}

type FlatColDescriptor =
  | { type: "fixed"; field: "itemName" | "qty" | "unit" }
  | {
      type: "supplier";
      colId: string;
      field: "quotedProduct" | "unitPrice" | "qty" | "amount";
    };

const DELIVERY_TERM_PRESETS = [
  "Giao hàng tại kho nhà máy Phenikaa Pharma",
  "Đã bao gồm chi phí vận chuyển đến kho bên mua",
  "Giao hàng trong giờ hành chính",
];

const PAYMENT_TERM_PRESETS = [
  "Thanh toán 100% trước khi giao hàng.",
  "Thanh toán 100% trong vòng 30 ngày sau khi nhận đủ hàng và hồ sơ thanh toán hợp lệ.",
  "Tạm ứng 30% sau khi ký PO, thanh toán 70% còn lại sau khi giao hàng.",
];

const REASON_PRESETS = [
  "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.",
  "Thời gian giao hàng: 5 ngày từ ngày đặt hàng.",
  "Thời gian giao hàng: Hàng có sẵn.",
  "Nhà cung cấp uy tín, lịch sử thực hiện hợp đồng và dịch vụ hậu mãi tốt.",
];

export function isQuotedProductVisible(req: ApprovalRequest): boolean {
  if (req.showQuotedProduct !== undefined) return req.showQuotedProduct;
  return req.columnMode === "origin" || req.columnMode === "extended";
}

export function isSupplierQtyVisible(req: ApprovalRequest): boolean {
  if (req.showSupplierQty !== undefined) return req.showSupplierQty;
  return req.columnMode === "extended";
}

export function getQuotedProductTitle(req: ApprovalRequest): string {
  if (req.quotedProductHeader && req.quotedProductHeader.trim()) {
    return req.quotedProductHeader;
  }
  if (req.columnMode === "origin") return "Hãng/ Xuất xứ";
  return "Mặt hàng NCC báo";
}

export function computeSupplierTotal(
  req: ApprovalRequest,
  colId: string,
): number {
  const useSupQty = isSupplierQtyVisible(req);
  let sum = 0;
  req.rows.forEach((row) => {
    const lines = row.supplierQuotes[colId] || [];
    lines.forEach((line) => {
      const effQty = useSupQty
        ? Number(line.qty) || 0
        : Number(row.qty) || 0;
      const unitPrice = Number(line.unitPrice) || 0;
      const amt = unitPrice > 0 ? unitPrice * effQty : Number(line.amount) || 0;
      sum += amt;
    });
  });
  return sum;
}

/**
 * Tự động tính số dòng hiển thị (rows) cho textarea dựa trên độ dài chuỗi và ký tự xuống dòng
 */
function calcTextareaRows(text: string | undefined, charsPerLine = 22): number {
  if (!text) return 2;
  const lines = String(text).split("\n");
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  return Math.max(2, Math.min(8, totalLines));
}

export default function ApprovalManagement({
  approvalRequests,
  activeApprovalId,
  setActiveApprovalId,
  onSaveApproval,
  onDeleteApproval,
  onRestoreSamples,
  onCreatePOFromApproval,
  prs,
  suppliers,
  quotesByPr,
  quoteSupplierIdsByPr,
  isReportMode = false,
  onBackToCompare,
  autoPrint = false,
  pos = [],
  paymentHandovers = [],
  trash = [],
  onNavigate,
  onToggleComplete,
}: ApprovalManagementProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sourceModalMode, setSourceModalMode] = useState<"compare" | "pr" | null>(
    null,
  );
  const [selectedAddSupplierId, setSelectedAddSupplierId] = useState<string>("");
  const [pasteToast, setPasteToast] = useState<string | null>(null);
  const [showExcelPasteModal, setShowExcelPasteModal] = useState(false);
  const [rawExcelModalText, setRawExcelModalText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [poCreateModalReq, setPoCreateModalReq] = useState<ApprovalRequest | null>(null);
  const [poCreateVatRate, setPoCreateVatRate] = useState<number>(10);
  const [poCreateCustomNumber, setPoCreateCustomNumber] = useState<string>("");
  const [poCreateNumberManual, setPoCreateNumberManual] = useState<boolean>(false);

  const handleOpenPOCreateModal = (req: ApprovalRequest) => {
    const selectedCol =
      req.supplierColumns.find((c) => c.isSelected) ||
      (req.recommendedSupplierName
        ? req.supplierColumns.find(
            (c) =>
              c.supplierName &&
              c.supplierName.trim().toLowerCase() === req.recommendedSupplierName.trim().toLowerCase()
          )
        : undefined) ||
      req.supplierColumns[0];

    const supName =
      req.recommendedSupplierName?.trim() ||
      selectedCol?.supplierName?.trim() ||
      "Nhà cung cấp được phê duyệt";

    const matchedSupplier =
      (selectedCol?.supplierId !== undefined
        ? suppliers.find((s) => s.id === selectedCol.supplierId)
        : undefined) ||
      suppliers.find(
        (s) =>
          (req.recommendedSupplierName &&
            s.name.trim().toLowerCase() === req.recommendedSupplierName.trim().toLowerCase()) ||
          (selectedCol?.supplierName &&
            s.name.trim().toLowerCase() === selectedCol.supplierName.trim().toLowerCase()) ||
          (selectedCol?.shortName &&
            s.shortName &&
            s.shortName.trim().toLowerCase() === selectedCol.shortName.trim().toLowerCase())
      );

    const sup = matchedSupplier || {
      shortName: selectedCol?.shortName || "",
      name: supName,
      code: selectedCol?.colId || "",
    };

    const todayDate = localToday();
    const autoCode = generatePOCode(sup, todayDate, pos, trash);
    setPoCreateCustomNumber(autoCode);
    setPoCreateNumberManual(false);
    setPoCreateVatRate(10);
    setPoCreateModalReq(req);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = (msg: string) => {
    setPasteToast(msg);
    setTimeout(() => {
      setPasteToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const filteredRequests = useMemo(() => {
    return approvalRequests
      .filter((req) => {
        if (statusFilter !== "ALL" && req.status !== statusFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          req.requestNumber.toLowerCase().includes(q) ||
          req.prNumber.toLowerCase().includes(q) ||
          req.department.toLowerCase().includes(q) ||
          req.recommendedSupplierName.toLowerCase().includes(q) ||
          req.section1Title.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aDone = isApprovalCompleted(a);
        const bDone = isApprovalCompleted(b);
        if (aDone !== bDone) return aDone ? 1 : -1;
        return (b.createdDate || "").localeCompare(a.createdDate || "") || (b.id - a.id);
      });
  }, [approvalRequests, searchQuery, statusFilter]);

  // Chỉ mở giao diện làm việc khi activeApprovalId khác null và tìm thấy phiếu
  const activeRequest = useMemo(() => {
    if (activeApprovalId === null) return null;
    return approvalRequests.find((r) => r.id === activeApprovalId) || null;
  }, [approvalRequests, activeApprovalId]);

  useEffect(() => {
    if (autoPrint && activeRequest) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, activeRequest]);

  const updateActive = (updater: (prev: ApprovalRequest) => ApprovalRequest) => {
    if (!activeRequest || isReportMode) return;
    const next = updater(activeRequest);
    onSaveApproval(next);
  };

  // PR tương ứng được liên kết với phiếu Đề nghị phê duyệt
  const linkedPR = useMemo(() => {
    if (!activeRequest) return null;
    return (
      prs.find((p) => p.id === activeRequest.prId) ||
      prs.find((p) => p.number === activeRequest.prNumber) ||
      prs.find((p) => p.number === activeRequest.noteRef) ||
      null
    );
  }, [prs, activeRequest?.prId, activeRequest?.prNumber, activeRequest?.noteRef]);

  const [sysDepts, setSysDepts] = useState<string[]>(() => getUnifiedDepartments());

  useEffect(() => {
    const onDeptsUpdated = () => setSysDepts(getUnifiedDepartments());
    window.addEventListener("scm_departments_updated", onDeptsUpdated);
    return () => window.removeEventListener("scm_departments_updated", onDeptsUpdated);
  }, []);

  // Danh sách các phòng ban thống nhất toàn web
  const departmentOptions = useMemo(() => {
    const set = new Set<string>(sysDepts);
    if (linkedPR?.department && linkedPR.department.trim()) {
      set.add(linkedPR.department.trim());
    }
    return Array.from(set).filter(Boolean);
  }, [sysDepts, linkedPR]);

  // Xử lý tạo thêm mã/phòng ban mới vào hệ thống
  const handleAddNewDept = () => {
    const name = window.prompt("Nhập tên / mã phòng ban mới để lưu vào hệ thống:", "");
    if (!name || !name.trim()) return;
    const res = addNewDepartment(name.trim());
    if (res.success) {
      setSysDepts(res.list);
      handleSelectRequestingDept(name.trim());
    }
  };

  // Xử lý chọn tên phòng ban để tự cập nhật Mục I
  const handleSelectRequestingDept = (deptName: string) => {
    const newTitle = formatApprovalSection1Title(deptName);
    updateActive((prev) => ({
      ...prev,
      requestingDepartment: deptName,
      section1Title: newTitle,
    }));
  };

  const hasQuotedProduct = activeRequest
    ? isQuotedProductVisible(activeRequest)
    : false;
  const hasSupplierQty = activeRequest
    ? isSupplierQtyVisible(activeRequest)
    : false;
  const quotedProductTitle = activeRequest
    ? getQuotedProductTitle(activeRequest)
    : "Mặt hàng NCC báo";

  // Bật/tắt cột Mặt hàng NCC báo
  const toggleQuotedProductColumn = (forceVal?: boolean) => {
    updateActive((prev) => {
      const current = isQuotedProductVisible(prev);
      const nextVal = forceVal !== undefined ? forceVal : !current;
      const supQty = isSupplierQtyVisible(prev);
      return {
        ...prev,
        showQuotedProduct: nextVal,
        quotedProductHeader: prev.quotedProductHeader || "Mặt hàng NCC báo",
        columnMode: nextVal && supQty ? "extended" : nextVal ? "origin" : "basic",
      };
    });
  };

  // Bật/tắt cột Số lượng mua của NCC
  const toggleSupplierQtyColumn = (forceVal?: boolean) => {
    updateActive((prev) => {
      const current = isSupplierQtyVisible(prev);
      const nextVal = forceVal !== undefined ? forceVal : !current;
      const quotedProd = isQuotedProductVisible(prev);
      return {
        ...prev,
        showSupplierQty: nextVal,
        columnMode: nextVal ? "extended" : quotedProd ? "origin" : "basic",
      };
    });
  };

  // Danh sách cột phẳng phục vụ Paste Excel đa dòng/cột theo đúng các cột đang bật
  const flatColumns = useMemo<FlatColDescriptor[]>(() => {
    if (!activeRequest) return [];
    const cols: FlatColDescriptor[] = [
      { type: "fixed", field: "itemName" },
      { type: "fixed", field: "qty" },
      { type: "fixed", field: "unit" },
    ];
    activeRequest.supplierColumns.forEach((sc) => {
      if (hasQuotedProduct) {
        cols.push({ type: "supplier", colId: sc.colId, field: "quotedProduct" });
      }
      cols.push({ type: "supplier", colId: sc.colId, field: "unitPrice" });
      if (hasSupplierQty) {
        cols.push({ type: "supplier", colId: sc.colId, field: "qty" });
      }
      cols.push({ type: "supplier", colId: sc.colId, field: "amount" });
    });
    return cols;
  }, [activeRequest, hasQuotedProduct, hasSupplierQty]);

  // Tính tổng tiền chưa có VAT cho từng cột NCC
  const supplierTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!activeRequest) return totals;
    activeRequest.supplierColumns.forEach((sc) => {
      totals[sc.colId] = computeSupplierTotal(activeRequest, sc.colId);
    });
    return totals;
  }, [activeRequest]);

  // Chọn NCC được đề xuất (Radio trên header cột)
  const handleSelectSupplierCol = (colId: string) => {
    updateActive((prev) => {
      const targetCol = prev.supplierColumns.find((c) => c.colId === colId);
      const nextCols = prev.supplierColumns.map((c) => ({
        ...c,
        isSelected: c.colId === colId,
      }));
      return {
        ...prev,
        supplierColumns: nextCols,
        recommendedSupplierName:
          targetCol?.supplierName ||
          targetCol?.shortName ||
          prev.recommendedSupplierName,
      };
    });
  };

  // Thêm cột NCC mới
  const handleAddSupplierColumn = () => {
    if (!activeRequest) return;
    const supIdNum = selectedAddSupplierId
      ? Number(selectedAddSupplierId)
      : undefined;
    const matchedSup =
      supIdNum !== undefined
        ? suppliers.find((s) => s.id === supIdNum)
        : undefined;

    const newIndex = activeRequest.supplierColumns.length + 1;
    const newColId = `col_${Date.now()}_${newIndex}`;
    const newCol: ApprovalSupplierColumn = {
      colId: newColId,
      supplierId: matchedSup?.id,
      supplierName: matchedSup?.name || `Nhà cung cấp ${newIndex}`,
      shortName: matchedSup?.shortName || matchedSup?.name || `NCC ${newIndex}`,
      isSelected: activeRequest.supplierColumns.length === 0,
      deliveryTime: "",
    };

    updateActive((prev) => {
      const nextCols = [...prev.supplierColumns, newCol];
      const nextRows = prev.rows.map((r) => ({
        ...r,
        supplierQuotes: {
          ...r.supplierQuotes,
          [newColId]: [
            {
              lineId: `line_${r.rowId}_${newColId}_1`,
              quotedProduct: r.itemName,
              origin: "",
              unitPrice: 0,
              qty: r.qty,
              amount: 0,
            },
          ],
        },
      }));
      return {
        ...prev,
        supplierColumns: nextCols,
        rows: nextRows,
        printOrientation:
          nextCols.length >= 3 ? "landscape" : prev.printOrientation,
      };
    });
    setSelectedAddSupplierId("");
  };

  // Xóa cột NCC
  const handleRemoveSupplierColumn = (colId: string) => {
    if (!activeRequest || activeRequest.supplierColumns.length <= 1) return;
    updateActive((prev) => {
      const remaining = prev.supplierColumns.filter((c) => c.colId !== colId);
      if (remaining.length > 0 && !remaining.some((c) => c.isSelected)) {
        remaining[0] = { ...remaining[0], isSelected: true };
      }
      const nextRows = prev.rows.map((r) => {
        const copy = { ...r.supplierQuotes };
        delete copy[colId];
        return { ...r, supplierQuotes: copy };
      });
      const selected = remaining.find((c) => c.isSelected);
      return {
        ...prev,
        supplierColumns: remaining,
        rows: nextRows,
        recommendedSupplierName:
          selected?.supplierName || prev.recommendedSupplierName,
      };
    });
  };

  // Thêm dòng hàng hóa mới
  const handleAddRow = () => {
    if (!activeRequest) return;
    updateActive((prev) => {
      const nextStt = prev.rows.length + 1;
      const rowId = `row_${Date.now()}_${nextStt}`;
      const supplierQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
      prev.supplierColumns.forEach((col) => {
        supplierQuotes[col.colId] = [
          {
            lineId: `line_${rowId}_${col.colId}_1`,
            quotedProduct: "",
            origin: "",
            unitPrice: 0,
            qty: 1,
            amount: 0,
          },
        ];
      });
      return {
        ...prev,
        rows: [
          ...prev.rows,
          {
            rowId,
            stt: nextStt,
            itemName: "",
            qty: 1,
            unit: "Cái",
            supplierQuotes,
          },
        ],
      };
    });
  };

  // Xóa dòng hàng hóa
  const handleRemoveRow = (rowId: string) => {
    if (!activeRequest || activeRequest.rows.length <= 1) return;
    updateActive((prev) => {
      const filtered = prev.rows
        .filter((r) => r.rowId !== rowId)
        .map((r, idx) => ({ ...r, stt: idx + 1 }));
      return { ...prev, rows: filtered };
    });
  };

  // Tách dòng con (Sub-row) cho 1 NCC trên 1 mặt hàng
  const handleSplitSubRow = (rowId: string, colId: string) => {
    updateActive((prev) => {
      const nextRows = prev.rows.map((row) => {
        if (row.rowId !== rowId) return row;
        const currentLines = row.supplierQuotes[colId] || [];
        const newLine: ApprovalSupplierQuoteLine = {
          lineId: `line_${rowId}_${colId}_${Date.now()}`,
          quotedProduct: row.itemName,
          origin: "",
          unitPrice: 0,
          qty: 1,
          amount: 0,
        };
        return {
          ...row,
          supplierQuotes: {
            ...row.supplierQuotes,
            [colId]: [...currentLines, newLine],
          },
        };
      });
      return {
        ...prev,
        showSupplierQty: true,
        columnMode: "extended",
        rows: nextRows,
      };
    });
  };

  // Xóa dòng tách con của NCC
  const handleRemoveSubRow = (rowId: string, colId: string, lineId: string) => {
    updateActive((prev) => {
      const nextRows = prev.rows.map((row) => {
        if (row.rowId !== rowId) return row;
        const currentLines = row.supplierQuotes[colId] || [];
        if (currentLines.length <= 1) return row;
        return {
          ...row,
          supplierQuotes: {
            ...row.supplierQuotes,
            [colId]: currentLines.filter((l) => l.lineId !== lineId),
          },
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  // Cập nhật trường cố định của dòng (Hàng hóa, Số lượng chung, ĐVT)
  const handleUpdateFixedRow = (
    rowIdx: number,
    field: "itemName" | "qty" | "unit",
    rawValue: string,
  ) => {
    updateActive((prev) => {
      const useSupQty = isSupplierQtyVisible(prev);
      const nextRows = prev.rows.map((row, idx) => {
        if (idx !== rowIdx) return row;
        if (field === "qty") {
          const newQty = cleanExcelNumber(rawValue);
          const updatedQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
          Object.keys(row.supplierQuotes).forEach((colId) => {
            const lines = row.supplierQuotes[colId] || [];
            updatedQuotes[colId] = lines.map((line, lIdx) => {
              const nextLineQty =
                lines.length === 1 && !useSupQty ? newQty : line.qty;
              const effQty = useSupQty ? line.qty : newQty;
              return {
                ...line,
                qty: lIdx === 0 && lines.length === 1 ? newQty : nextLineQty,
                amount: (Number(line.unitPrice) || 0) * effQty,
              };
            });
          });
          return { ...row, qty: newQty, supplierQuotes: updatedQuotes };
        }
        return { ...row, [field]: rawValue };
      });
      return { ...prev, rows: nextRows };
    });
  };

  // Cập nhật ô báo giá của NCC
  const handleUpdateSupplierLine = (
    rowIdx: number,
    colId: string,
    subIdx: number,
    field: "quotedProduct" | "unitPrice" | "qty",
    rawValue: string,
  ) => {
    updateActive((prev) => {
      const useSupQty = isSupplierQtyVisible(prev);
      const nextRows = prev.rows.map((row, idx) => {
        if (idx !== rowIdx) return row;
        const lines = [...(row.supplierQuotes[colId] || [])];
        while (lines.length <= subIdx) {
          lines.push({
            lineId: `line_${row.rowId}_${colId}_${lines.length + 1}`,
            quotedProduct: "",
            origin: "",
            unitPrice: 0,
            qty: row.qty,
            amount: 0,
          });
        }
        const target = { ...lines[subIdx] };
        if (field === "unitPrice") {
          target.unitPrice = cleanExcelNumber(rawValue);
        } else if (field === "qty") {
          target.qty = cleanExcelNumber(rawValue);
        } else if (field === "quotedProduct") {
          target.quotedProduct = rawValue;
          target.origin = rawValue;
        }
        const effQty = useSupQty
          ? Number(target.qty) || 0
          : Number(row.qty) || 0;
        target.amount = (Number(target.unitPrice) || 0) * effQty;
        lines[subIdx] = target;
        return {
          ...row,
          supplierQuotes: {
            ...row.supplierQuotes,
            [colId]: lines,
          },
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  /**
   * Xử lý sự kiện Paste trực tiếp từ Excel vào bất kỳ ô nào trên bảng
   */
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    startRowIdx: number,
    startFlatColIdx: number,
    subIdx: number = 0,
  ) => {
    if (!activeRequest || isReportMode) return;
    const clipboardText = e.clipboardData?.getData("text/plain") || "";
    if (!clipboardText) return;

    const matrix = parseExcelClipboard(clipboardText);
    if (matrix.length === 0) return;

    const targetColDesc = flatColumns[startFlatColIdx];
    const isNumericTarget =
      (targetColDesc?.type === "fixed" && targetColDesc.field === "qty") ||
      (targetColDesc?.type === "supplier" &&
        (targetColDesc.field === "unitPrice" ||
          targetColDesc.field === "qty" ||
          targetColDesc.field === "amount"));

    if (matrix.length === 1 && matrix[0].length === 1 && !isNumericTarget) {
      return;
    }

    e.preventDefault();
    applyMatrixToTable(matrix, startRowIdx, startFlatColIdx, subIdx);
  };

  const applyMatrixToTable = (
    matrix: string[][],
    startRowIdx: number,
    startFlatColIdx: number,
    subIdx: number = 0,
  ) => {
    if (!activeRequest) return;

    updateActive((prev) => {
      const useSupQty = isSupplierQtyVisible(prev);
      const nextRows = [
        ...prev.rows.map((r) => ({
          ...r,
          supplierQuotes: { ...r.supplierQuotes },
        })),
      ];

      const requiredRows = startRowIdx + matrix.length;
      while (nextRows.length < requiredRows) {
        const newStt = nextRows.length + 1;
        const newRowId = `row_paste_${Date.now()}_${newStt}`;
        const sq: Record<string, ApprovalSupplierQuoteLine[]> = {};
        prev.supplierColumns.forEach((sc) => {
          sq[sc.colId] = [
            {
              lineId: `line_${newRowId}_${sc.colId}_1`,
              quotedProduct: "",
              origin: "",
              unitPrice: 0,
              qty: 1,
              amount: 0,
            },
          ];
        });
        nextRows.push({
          rowId: newRowId,
          stt: newStt,
          itemName: "",
          qty: 1,
          unit: "Cái",
          supplierQuotes: sq,
        });
      }

      matrix.forEach((rowCells, rOffset) => {
        const targetRowIndex = startRowIdx + rOffset;
        const rowObj = { ...nextRows[targetRowIndex] };
        const rowQuotes = { ...rowObj.supplierQuotes };

        rowCells.forEach((cellVal, cOffset) => {
          const flatCol = flatColumns[startFlatColIdx + cOffset];
          if (!flatCol) return;

          if (flatCol.type === "fixed") {
            if (flatCol.field === "itemName") {
              rowObj.itemName = cellVal;
            } else if (flatCol.field === "unit") {
              rowObj.unit = cellVal;
            } else if (flatCol.field === "qty") {
              const parsedQty = cleanExcelNumber(cellVal);
              rowObj.qty = parsedQty;
              Object.keys(rowQuotes).forEach((cid) => {
                rowQuotes[cid] = (rowQuotes[cid] || []).map((line, lIdx) => {
                  const effQty = useSupQty ? line.qty : parsedQty;
                  return {
                    ...line,
                    qty: lIdx === 0 && !useSupQty ? parsedQty : line.qty,
                    amount: (Number(line.unitPrice) || 0) * effQty,
                  };
                });
              });
            }
          } else if (flatCol.type === "supplier") {
            const lines = [...(rowQuotes[flatCol.colId] || [])];
            const targetSubIdx = rOffset === 0 ? subIdx : 0;
            while (lines.length <= targetSubIdx) {
              lines.push({
                lineId: `line_${rowObj.rowId}_${flatCol.colId}_${lines.length + 1}`,
                quotedProduct: "",
                origin: "",
                unitPrice: 0,
                qty: rowObj.qty,
                amount: 0,
              });
            }
            const line = { ...lines[targetSubIdx] };
            if (flatCol.field === "quotedProduct") {
              line.quotedProduct = cellVal;
              line.origin = cellVal;
            } else if (flatCol.field === "unitPrice") {
              line.unitPrice = cleanExcelNumber(cellVal);
              const effQty = useSupQty
                ? Number(line.qty) || 0
                : Number(rowObj.qty) || 0;
              line.amount = line.unitPrice * effQty;
            } else if (flatCol.field === "qty") {
              line.qty = cleanExcelNumber(cellVal);
              line.amount = (Number(line.unitPrice) || 0) * line.qty;
            } else if (flatCol.field === "amount") {
              const pastedAmt = cleanExcelNumber(cellVal);
              if (line.unitPrice > 0) {
                const effQty = useSupQty
                  ? Number(line.qty) || 0
                  : Number(rowObj.qty) || 0;
                line.amount = line.unitPrice * effQty;
              } else {
                line.amount = pastedAmt;
              }
            }
            lines[targetSubIdx] = line;
            rowQuotes[flatCol.colId] = lines;
          }
        });

        rowObj.supplierQuotes = rowQuotes;
        nextRows[targetRowIndex] = rowObj;
      });

      return { ...prev, rows: nextRows };
    });

    showToast(
      `📋 Đã dán ${matrix.length} dòng × ${matrix[0]?.length || 1} cột từ Excel!`,
    );
  };

  // Tạo mới từ 3 nguồn -> Tự động mở vào giao diện làm việc chi tiết
  const handleCreateFromCompare = (pr: PR) => {
    const qForPr = quotesByPr[pr.id] || {};
    const sIds = quoteSupplierIdsByPr[pr.id] || [];
    const newReq = createApprovalFromCompare(
      pr,
      qForPr,
      sIds,
      suppliers,
      approvalRequests.length,
    );
    onSaveApproval(newReq);
    setActiveApprovalId(newReq.id);
    setSourceModalMode(null);
    showToast(`✓ Đã tạo phiếu Đề nghị phê duyệt từ So sánh giá PR ${pr.number}`);
  };

  const handleCreateFromPR = (pr: PR) => {
    const newReq = createApprovalFromPR(pr, suppliers, approvalRequests.length);
    onSaveApproval(newReq);
    setActiveApprovalId(newReq.id);
    setSourceModalMode(null);
    showToast(`✓ Đã tạo phiếu Đề nghị phê duyệt từ PR ${pr.number}`);
  };

  const handleCreateManual = () => {
    const newReq = createManualApproval(approvalRequests.length);
    onSaveApproval(newReq);
    setActiveApprovalId(newReq.id);
    showToast("✓ Đã tạo phiếu Đề nghị phê duyệt độc lập (Trắng)");
  };

  const getSupplierFlatColIndex = (
    colId: string,
    field: "quotedProduct" | "unitPrice" | "qty" | "amount",
  ) => {
    return flatColumns.findIndex(
      (c) => c.type === "supplier" && c.colId === colId && c.field === field,
    );
  };

  const subColCountPerSupplier =
    2 + (hasQuotedProduct ? 1 : 0) + (hasSupplierQty ? 1 : 0);

  const totalTableColumns =
    4 + (activeRequest?.supplierColumns.length || 0) * subColCountPerSupplier;

  const shouldRecommendLandscape =
    activeRequest &&
    (activeRequest.supplierColumns.length >= 3 || subColCountPerSupplier >= 3);

  /**
   * Tính toán tỉ lệ phần trăm độ rộng (<colgroup> & <th>) cho từng cột:
   * - Các cột co gọn được (STT, Số lượng, ĐVT, Đơn giá, Thành tiền) được ép gọn tối đa với tiêu đề 2 dòng.
   * - Đảm bảo tổng độ rộng 100% trang A4 cả trên màn hình làm việc lẫn khi in.
   */
  const colWidths = useMemo(() => {
    const numSups = Math.max(1, activeRequest?.supplierColumns.length || 1);
    const sttPct = 2.4;
    const itemPct = numSups >= 3 ? 13.0 : 16.0;
    const qtyPct = 2.8;
    const unitPct = 2.8;
    const remainingPct = 100 - (sttPct + itemPct + qtyPct + unitPct);
    const perSupPct = remainingPct / numSups;

    let specPct = 0;
    let pricePct = 0;
    let supQtyPct = 0;
    let amtPct = 0;

    if (hasQuotedProduct && hasSupplierQty) {
      specPct = perSupPct * 0.38;
      pricePct = perSupPct * 0.24;
      supQtyPct = perSupPct * 0.11;
      amtPct = perSupPct * 0.27;
    } else if (hasQuotedProduct && !hasSupplierQty) {
      specPct = perSupPct * 0.44;
      pricePct = perSupPct * 0.27;
      amtPct = perSupPct * 0.29;
    } else if (!hasQuotedProduct && hasSupplierQty) {
      pricePct = perSupPct * 0.42;
      supQtyPct = perSupPct * 0.14;
      amtPct = perSupPct * 0.44;
    } else {
      pricePct = perSupPct * 0.48;
      amtPct = perSupPct * 0.52;
    }

    return {
      stt: `${sttPct}%`,
      item: `${itemPct}%`,
      qty: `${qtyPct}%`,
      unit: `${unitPct}%`,
      perSup: `${perSupPct.toFixed(2)}%`,
      spec: `${specPct.toFixed(2)}%`,
      price: `${pricePct.toFixed(2)}%`,
      supQty: `${supQtyPct.toFixed(2)}%`,
      amt: `${amtPct.toFixed(2)}%`,
    };
  }, [activeRequest?.supplierColumns.length, hasQuotedProduct, hasSupplierQty]);

  const renderTableColGroup = () => {
    if (!activeRequest) return null;
    return (
      <colgroup>
        <col style={{ width: colWidths.stt }} />
        <col style={{ width: colWidths.item }} />
        <col style={{ width: colWidths.qty }} />
        <col style={{ width: colWidths.unit }} />
        {activeRequest.supplierColumns.map((sc) => (
          <React.Fragment key={`colg_${sc.colId}`}>
            {hasQuotedProduct && <col style={{ width: colWidths.spec }} />}
            <col style={{ width: colWidths.price }} />
            {hasSupplierQty && <col style={{ width: colWidths.supQty }} />}
            <col style={{ width: colWidths.amt }} />
          </React.Fragment>
        ))}
      </colgroup>
    );
  };

  // Tên NCC đề xuất (tự động fallback sang NCC được tích chọn nếu ô nhập đang trống)
  const effectiveRecommendedSupplier = useMemo(() => {
    if (!activeRequest) return "";
    if (activeRequest.recommendedSupplierName?.trim()) {
      return activeRequest.recommendedSupplierName;
    }
    const sel =
      activeRequest.supplierColumns.find((c) => c.isSelected) ||
      activeRequest.supplierColumns[0];
    return sel?.supplierName || sel?.shortName || "";
  }, [activeRequest]);

  // =========================================================================
  // CHẾ ĐỘ 1: GIAO DIỆN DANH SÁCH PHIẾU PHÊ DUYỆT (MẶC ĐỊNH KHI VÀO TAB)
  // =========================================================================
  if (!activeRequest) {
    const pendingCount = approvalRequests.filter(
      (r) => r.status === "Nháp" || r.status === "Chờ phê duyệt",
    ).length;
    const approvedCount = approvalRequests.filter(
      (r) => r.status === "Đã phê duyệt",
    ).length;
    const poCreatedCount = approvalRequests.filter(
      (r) => r.status === "Đã tạo PO",
    ).length;

    return (
      <section className="content pr-page approval-list-page">
        {pasteToast && <div className="approval-toast no-print">{pasteToast}</div>}

        <div className="heading">
          <div>
            <h1>Đề nghị Phê duyệt</h1>
          </div>
          {!isReportMode && (
            <div className="approval-source-actions">
              <button
                type="button"
                className="btn approval-source-btn source-compare"
                onClick={() => setSourceModalMode("compare")}
              >
                <Scale size={16} /> Từ So sánh
              </button>
              <button
                type="button"
                className="btn approval-source-btn source-pr"
                onClick={() => setSourceModalMode("pr")}
              >
                <FileText size={16} /> Từ PR
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleCreateManual}
              >
                <Plus size={16} /> Tạo mới
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  onRestoreSamples();
                  showToast("✓ Đã nạp 2 biểu mẫu chuẩn Phenikaa Pharma!");
                }}
              >
                <RotateCcw size={16} /> Mẫu chuẩn
              </button>
            </div>
          )}
        </div>

        {/* Bảng Danh sách các phiếu Đề nghị Phê duyệt */}
        <div className="pr-panel">
          <div className="pr-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
              <label style={{ minWidth: 280, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Search size={16} style={{ color: "var(--slate-400)" }} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo số PR, tên nhà cung cấp, bộ phận, nội dung..."
                />
              </label>
              <select
                className="approval-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">
                  Tất cả trạng thái ({approvalRequests.length})
                </option>
                <option value="Nháp">Nháp</option>
                <option value="Chờ phê duyệt">Chờ phê duyệt</option>
                <option value="Đã phê duyệt">Đã phê duyệt</option>
                <option value="Đã tạo PO">Đã tạo PO</option>
              </select>
            </div>
            <span>Hiển thị {filteredRequests.length} phiếu đề nghị phê duyệt</span>
          </div>

          {/* Danh sách thẻ hiển thị trên Mobile (thay thế pr-table khi màn hình nhỏ) */}
          <div className="mobile-record-list">
            {filteredRequests.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 16px", color: "#64748b", background: "#ffffff", borderRadius: "10px", border: "1px dashed #cbd5e1" }}>
                Chưa có phiếu Đề nghị Phê duyệt nào khớp bộ lọc.
              </div>
            ) : (
              filteredRequests.map((req) => {
                const selectedCol =
                  req.supplierColumns.find((c) => c.isSelected) ||
                  req.supplierColumns[0];
                const selectedTotal = selectedCol
                  ? computeSupplierTotal(req, selectedCol.colId)
                  : 0;
                const isDone = isApprovalCompleted(req);
                const flow = resolveDocFlow({ approval: req }, { prs, pos, approvalRequests });
                const canCreatePO = !isReportMode && (req.status === "Đã phê duyệt" || req.status === "Đã tạo PO");
                const ctxStatus = getApprovalContextualStatus(req, pos, paymentHandovers);

                return (
                  <article key={req.id} className={isDone ? "row-completed" : ""}>
                    <header>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        {onToggleComplete && (
                          <button
                            type="button"
                            className="completion-toggle-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleComplete(req);
                            }}
                            title={isDone ? "Đã hoàn thành (Bấm để mở lại)" : "Đang xử lý (Bấm để đánh dấu Hoàn thành)"}
                          >
                            {isDone ? (
                              <CheckCircle2 size={22} className="text-emerald-600 fill-emerald-100" />
                            ) : (
                              <Circle size={22} className="text-slate-400 hover:text-slate-600" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveApprovalId(req.id)}
                          style={{ fontSize: "15px", fontWeight: 800, color: "#0284c7", background: "none", border: 0, padding: 0, cursor: "pointer" }}
                        >
                          {req.prNumber || req.requestNumber}
                        </button>
                      </div>
                      <span className={`status ${ctxStatus.badgeClass}`} style={ctxStatus.style}>
                        {ctxStatus.text}
                      </span>
                    </header>

                    <h3>{req.section1Title || "Đề nghị phê duyệt kết quả lựa chọn NCC"}</h3>
                    <p>
                      {req.department} · {req.createdDate}
                    </p>

                    <dl>
                      <div>
                        <dt>NCC đề xuất</dt>
                        <dd style={{ color: "#0f2b5b" }}>
                          {req.recommendedSupplierName || selectedCol?.supplierName || "Chưa chọn"}
                        </dd>
                      </div>
                      <div>
                        <dt>Tổng tiền</dt>
                        <dd style={{ color: "#0284c7" }}>
                          {selectedTotal > 0 ? `${formatVND(selectedTotal)} ₫` : "-"}
                        </dd>
                      </div>
                      <div>
                        <dt>Quy mô</dt>
                        <dd>
                          {req.supplierColumns.length} NCC · {req.rows.length} mục
                        </dd>
                      </div>
                    </dl>

                    

                    <footer className="m-card-footer">
                      <button
                        type="button"
                        className="m-action-btn m-btn-primary"
                        onClick={() => setActiveApprovalId(req.id)}
                        title="Mở xem phiếu đề nghị phê duyệt"
                      >
                        <Eye size={17} />
                        <span>Mở phiếu</span>
                      </button>

                      {canCreatePO && (
                        <button
                          type="button"
                          className="m-action-btn m-btn-success"
                          onClick={() => handleOpenPOCreateModal(req)}
                          title="Phát hành đơn mua hàng (PO) từ phiếu đã duyệt này"
                        >
                          <PackagePlus size={17} />
                          <span>Tạo PO</span>
                        </button>
                      )}

                      {!isReportMode && (
                        <button
                          type="button"
                          className="m-action-btn m-btn-danger"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Bạn có chắc muốn xóa phiếu Đề nghị phê duyệt "${req.prNumber || req.requestNumber}"?`
                              )
                            ) {
                              onDeleteApproval(req.id);
                            }
                          }}
                          title="Xóa phiếu"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })
            )}
          </div>

          <div className="pr-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 135 }}>Số PR / Mã phiếu</th>
                  <th style={{ width: 105 }}>Ngày lập</th>
                  <th style={{ width: 155 }}>Bộ phận lập</th>
                  <th>Nội dung đề nghị phê duyệt</th>
                  <th style={{ width: 130, textAlign: "center" }}>Quy mô đánh giá</th>
                  <th style={{ width: 220 }}>NCC đề xuất lựa chọn</th>
                  <th style={{ width: 145, textAlign: "right" }}>
                    Tổng tiền đề xuất
                  </th>
                  <th style={{ width: 140 }}>Trạng thái</th>
                  <th style={{ width: 170, textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        textAlign: "center",
                        padding: "36px 16px",
                        color: "#64748b",
                      }}
                    >
                      Chưa có phiếu Đề nghị Phê duyệt nào khớp bộ lọc. Hãy bấm{" "}
                      <b>＋ Tạo phiếu mới</b> ở góc trên để bắt đầu.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => {
                    const selectedCol =
                      req.supplierColumns.find((c) => c.isSelected) ||
                      req.supplierColumns[0];
                    const selectedTotal = selectedCol
                      ? computeSupplierTotal(req, selectedCol.colId)
                      : 0;
                    const isDone = isApprovalCompleted(req);
                    const ctxStatus = getApprovalContextualStatus(req, pos, paymentHandovers);

                    return (
                      <tr
                        key={req.id}
                        className={isDone ? "row-completed" : ""}
                        style={{ cursor: "pointer" }}
                        onClick={() => setActiveApprovalId(req.id)}
                      >
                        <td>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            {onToggleComplete && (
                              <button
                                type="button"
                                className="completion-toggle-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleComplete(req);
                                }}
                                title={isDone ? "Đã hoàn thành (Bấm để mở lại)" : "Đang xử lý (Bấm để đánh dấu Hoàn thành)"}
                              >
                                {isDone ? (
                                  <CheckCircle2 size={16} className="text-emerald-600 fill-emerald-100" />
                                ) : (
                                  <Circle size={16} className="text-slate-400 hover:text-slate-600" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              className="pr-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveApprovalId(req.id);
                              }}
                            >
                              {req.prNumber || req.requestNumber}
                            </button>
                          </div>
                        </td>
                        <td>{req.createdDate}</td>
                        <td>{req.department}</td>
                        <td className="purpose-cell">{req.section1Title}</td>
                        <td className="center">
                          <span className="scale-pill">
                            {req.supplierColumns.length} NCC · {req.rows.length} mục
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#0f2b5b", fontSize: 13 }}>
                            {req.recommendedSupplierName ||
                              selectedCol?.supplierName ||
                              "Chưa chọn"}
                          </strong>
                        </td>
                        <td className="money">
                          {selectedTotal > 0 ? `${formatVND(selectedTotal)} ₫` : "-"}
                        </td>
                        <td>
                          <span className={`status ${ctxStatus.badgeClass}`} style={ctxStatus.style}>
                            {ctxStatus.text}
                          </span>
                        </td>
                        <td
                          style={{ textAlign: "right" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              gap: 6,
                              alignItems: "center",
                            }}
                          >
                            <button
                              type="button"
                              className="btn-icon primary-ghost"
                              onClick={() => setActiveApprovalId(req.id)}
                              title="Mở phiếu"
                            >
                              <ArrowRight size={16} />
                            </button>
                            {!isReportMode &&
                              (req.status === "Đã phê duyệt" ||
                                req.status === "Đã tạo PO") && (
                                <button
                                  type="button"
                                  className="btn-icon accent-ghost"
                                  onClick={() => {
                                    handleOpenPOCreateModal(req);
                                  }}
                                  title="Phát hành đơn mua hàng (PO) từ phiếu đã duyệt này"
                                >
                                  <PackagePlus size={16} />
                                </button>
                              )}
                            {!isReportMode && (
                              <button
                                type="button"
                                className="btn-icon danger-ghost"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Bạn có chắc muốn xóa phiếu Đề nghị phê duyệt "${req.prNumber || req.requestNumber}"?`,
                                    )
                                  ) {
                                    onDeleteApproval(req.id);
                                  }
                                }}
                                title="Xóa phiếu"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Chọn PR khi tạo từ So sánh giá hoặc tạo từ PR */}
        {sourceModalMode && renderPRSourceModal()}

        {/* Modal Chọn VAT khi tạo PO từ Danh sách */}
        {poCreateModalReq && renderPOCreateModal()}
      </section>
    );
  }

  // =========================================================================
  // CHẾ ĐỘ 2: GIAO DIỆN LÀM VIỆC CHI TIẾT CỦA PHIẾU ĐỀ NGHỊ PHÊ DUYỆT
  // =========================================================================
  return (
    <section className="content approval-mgmt-wrapper">
      {pasteToast && <div className="approval-toast no-print">{pasteToast}</div>}

      {/* Thanh Điều hướng Quay lại Danh sách & Tác vụ chính */}
      <div className="approval-detail-topbar no-print">
        <div className="detail-topbar-left">
          <button
            type="button"
            className="btn btn-back-list"
            onClick={() => setActiveApprovalId(null)}
          >
            <ArrowLeft size={16} /> Danh sách
          </button>
          {onBackToCompare && (
            <button
              type="button"
              className="btn"
              onClick={onBackToCompare}
              title="Quay lại Bảng so sánh giá"
            >
              <Scale size={16} /> So sánh giá
            </button>
          )}
          <div className="detail-breadcrumb">
            <span className="crumb-code">
              Phiếu số: {activeRequest.prNumber || activeRequest.requestNumber}
            </span>
            <span
              className={`chip-status ${
                activeRequest.status === "Đã tạo PO"
                  ? "st-po"
                  : activeRequest.status === "Đã phê duyệt"
                    ? "st-approved"
                    : activeRequest.status === "Chờ phê duyệt"
                      ? "st-pending"
                      : "st-draft"
              }`}
            >
              {activeRequest.status}
            </span>
          </div>
          <DocFlowLinks
            flow={resolveDocFlow({ approval: activeRequest }, { prs, pos, approvalRequests })}
            currentView="approval"
            onNavigate={onNavigate}
            onCreatePOFromApproval={() => {
            handleOpenPOCreateModal(activeRequest);
          }}
          />
        </div>

        <div className="config-actions-right">
          {!isReportMode && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setShowExcelPasteModal(true)}
                title="Dán nhanh bảng dữ liệu copy từ Excel"
              >
                <ClipboardPaste size={16} /> Dán Excel
              </button>

              <select
                className="approval-status-select"
                value={activeRequest.status}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    status: e.target.value as ApprovalRequest["status"],
                  }))
                }
              >
                <option value="Nháp">Trạng thái: Nháp</option>
                <option value="Chờ phê duyệt">Trạng thái: Chờ phê duyệt</option>
                <option value="Đã phê duyệt">Trạng thái: Đã phê duyệt</option>
                <option value="Đã tạo PO">Trạng thái: Đã tạo PO</option>
              </select>

              <button
                type="button"
                className={`btn ${isApprovalCompleted(activeRequest) ? "btn-secondary" : "btn-approve-status"}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: isApprovalCompleted(activeRequest) ? "#ecfdf5" : undefined,
                  color: isApprovalCompleted(activeRequest) ? "#059669" : undefined,
                  borderColor: isApprovalCompleted(activeRequest) ? "#a7f3d0" : undefined,
                  fontWeight: 600,
                }}
                onClick={() => {
                  const willComplete = !isApprovalCompleted(activeRequest);
                  if (onToggleComplete) {
                    onToggleComplete(activeRequest);
                  } else {
                    updateActive((prev) => ({
                      ...prev,
                      isCompleted: willComplete,
                      status: willComplete ? "Đã phê duyệt" : "Chờ phê duyệt",
                    }));
                  }
                  showToast(
                    willComplete
                      ? "✓ Đã đánh dấu Hoàn thành phiếu!"
                      : "✓ Đã chuyển lại trạng thái Chưa hoàn thành (Chờ phê duyệt)."
                  );
                }}
                title={isApprovalCompleted(activeRequest) ? "Mở lại (Chuyển sang Chờ phê duyệt)" : "Đánh dấu Hoàn thành / Đã phê duyệt"}
              >
                {isApprovalCompleted(activeRequest) ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-600" /> Đã hoàn thành
                  </>
                ) : (
                  <>
                    <Circle size={16} /> Hoàn thành phiếu
                  </>
                )}
              </button>

              {activeRequest.status !== "Đã phê duyệt" &&
                activeRequest.status !== "Đã tạo PO" && (
                  <button
                    type="button"
                    className="btn btn-approve-status"
                    onClick={() => {
                      updateActive((prev) => ({
                        ...prev,
                        status: "Đã phê duyệt",
                      }));
                      showToast(
                        "✓ Đã phê duyệt phiếu! Bây giờ bạn có thể bấm 'Tạo PO'.",
                      );
                    }}
                  >
                    <Check size={16} /> Duyệt phiếu
                  </button>
                )}

              <button
                type="button"
                className="btn btn-create-po-from-approval"
                disabled={
                  activeRequest.status !== "Đã phê duyệt" &&
                  activeRequest.status !== "Đã tạo PO"
                }
                title={
                  activeRequest.status !== "Đã phê duyệt" &&
                  activeRequest.status !== "Đã tạo PO"
                    ? "Vui lòng bấm 'Duyệt phiếu' sang trạng thái Đã phê duyệt trước khi tạo PO"
                    : "Đẩy thông tin Nhà cung cấp được lựa chọn sang Đơn Mua Hàng (PO)"
                }
                onClick={() => {
                handleOpenPOCreateModal(activeRequest);
              }}
              >
                <PackagePlus size={16} /> Tạo PO (
                {activeRequest.supplierColumns.find((c) => c.isSelected)
                  ?.shortName || "NCC chọn"}
                )
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => {
                  onSaveApproval(activeRequest);
                  showToast("💾 Đã lưu phiếu Đề nghị phê duyệt!");
                }}
              >
                <Save size={16} /> Lưu
              </button>

              {confirmDeleteId === activeRequest.id ? (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: "#dc2626", color: "#fff" }}
                    onClick={() => {
                      onDeleteApproval(activeRequest.id);
                      setConfirmDeleteId(null);
                      setActiveApprovalId(null);
                      showToast("🗑️ Đã xóa phiếu Đề nghị phê duyệt");
                    }}
                  >
                    Xác nhận xóa
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Hủy
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn"
                  style={{ color: "#dc2626" }}
                  onClick={() => setConfirmDeleteId(activeRequest.id)}
                  title="Xóa phiếu"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
          >
            <Printer size={16} /> In phiếu
          </button>
        </div>
      </div>

      {/* Thanh Cấu hình Cột con của Nhà Cung Cấp & Khổ giấy in */}
      <div className="approval-config-bar no-print">
        <div className="config-group">
          <span className="config-label">Tùy chọn cột của Nhà Cung Cấp:</span>

          <label
            className={`col-toggle-pill ${hasQuotedProduct ? "active" : ""}`}
            title="Thêm/Bật cột Mặt hàng NCC báo (hoặc Sản phẩm / Hãng sản xuất)"
          >
            <input
              type="checkbox"
              checked={hasQuotedProduct}
              onChange={(e) => toggleQuotedProductColumn(e.target.checked)}
            />
            <span>＋ Cột Mặt hàng NCC báo</span>
          </label>

          {hasQuotedProduct && (
            <input
              type="text"
              className="subcol-title-input"
              value={quotedProductTitle}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  quotedProductHeader: e.target.value,
                }))
              }
              title="Đổi tên tiêu đề cột (VD: Mặt hàng NCC báo, Sản phẩm, Hãng/ Xuất xứ)"
              placeholder="Tên cột (VD: Mặt hàng NCC báo)"
            />
          )}

          <label
            className={`col-toggle-pill ${hasSupplierQty ? "active" : ""}`}
            title="Thêm/Bật cột Số lượng mua của từng NCC (cho phép tách dòng số lượng)"
          >
            <input
              type="checkbox"
              checked={hasSupplierQty}
              onChange={(e) => toggleSupplierQtyColumn(e.target.checked)}
            />
            <span>＋ Cột Số lượng mua của NCC</span>
          </label>

          <label
            className={`col-toggle-pill ${
              activeRequest.showDeliveryTimeRow ? "active" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={activeRequest.showDeliveryTimeRow}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  showDeliveryTimeRow: e.target.checked,
                }))
              }
            />
            <span>＋ Dòng Thời gian giao hàng</span>
          </label>
        </div>

        {!isReportMode && (
          <div className="config-group">
            <select
              className="approval-filter-select"
              value={selectedAddSupplierId}
              onChange={(e) => setSelectedAddSupplierId(e.target.value)}
            >
              <option value="">
                -- Chọn NCC từ danh mục (hoặc thêm trống) --
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shortName ? `${s.shortName} - ${s.name}` : s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={handleAddSupplierColumn}
            >
              ＋ Thêm Nhà Cung Cấp ({activeRequest.supplierColumns.length})
            </button>
          </div>
        )}

        <div className="config-group">
          <span className="config-label">Khổ in:</span>
          <div className="segmented-pills">
            <button
              type="button"
              className={`seg-pill ${
                activeRequest.printOrientation === "portrait" ? "active" : ""
              }`}
              onClick={() =>
                updateActive((prev) => ({
                  ...prev,
                  printOrientation: "portrait",
                }))
              }
            >
              📄 A4 Dọc
            </button>
            <button
              type="button"
              className={`seg-pill ${
                activeRequest.printOrientation === "landscape" ? "active" : ""
              }`}
              onClick={() =>
                updateActive((prev) => ({
                  ...prev,
                  printOrientation: "landscape",
                }))
              }
            >
              🖼️ A4 Ngang
            </button>
          </div>
          {shouldRecommendLandscape &&
            activeRequest.printOrientation === "portrait" && (
              <button
                type="button"
                className="landscape-hint-btn"
                onClick={() =>
                  updateActive((prev) => ({
                    ...prev,
                    printOrientation: "landscape",
                  }))
                }
              >
                💡 Gợi ý chọn A4 Ngang khi in
              </button>
            )}
        </div>
      </div>

      {/* ===================================================================
          BIỂU MẪU LÀM VIỆC TRÊN MÀN HÌNH (WYSIWYG WORKSPACE)
         =================================================================== */}
      <div
        className={`approval-a4-sheet orient-${activeRequest.printOrientation}`}
      >
        {/* 1. KHUNG HEADER BIỂU MẪU CÔNG TY */}
        <table className="phenikaa-header-table">
          <tbody>
            <tr>
              <td className="phenikaa-logo-box">
                <img
                  src={PHENIKAA_PHARMA_LOGO_BASE64}
                  alt="PHENIKAA PHARMA"
                  className="phenikaa-logo-img"
                />
              </td>
              <td className="phenikaa-title-box">
                ĐỀ NGHỊ PHÊ DUYỆT LỰA CHỌN NCC
              </td>
            </tr>
          </tbody>
        </table>

        {/* 2. KHUNG THÔNG TIN BÊN TRÁI (KHÔNG KẺ BẢNG, HIỂN THỊ LIỀN MẠCH HẾT BỀ NGANG) */}
        <div className="phenikaa-meta-lines">
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Số PR:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.prNumber}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  prNumber: e.target.value,
                  requestNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Ngày:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.createdDate}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  createdDate: e.target.value,
                }))
              }
            />
          </div>
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Đơn vị lập biểu mẫu:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.department}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  department: e.target.value,
                }))
              }
            />
          </div>
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Ghi chú: Căn cứ theo PR số:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.noteRef}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  noteRef: e.target.value,
                }))
              }
            />
          </div>
        </div>

        {/* 3. PHẦN I: NỘI DUNG ĐỀ NGHỊ PHÊ DUYỆT & BẢNG SO SÁNH ĐỘNG */}
        <div className="phenikaa-section-block">
          <div
            className="phenikaa-section-heading"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span>I. Nội dung đề nghị phê duyệt:</span>

            {!isReportMode && (
              <div
                className="no-print"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: "normal",
                }}
              >
                <span style={{ color: "#475569", fontWeight: 600 }}>
                  🏢 Phòng ban yêu cầu:
                </span>

                {linkedPR?.department && (
                  <button
                    type="button"
                    style={{
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      border: "1px solid #bfdbfe",
                      padding: "2px 8px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      borderRadius: "5px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    onClick={() => handleSelectRequestingDept(linkedPR.department)}
                    title={`Điền tự động phòng ban từ PR số ${linkedPR.number}: ${linkedPR.department}`}
                  >
                    📋 Lấy từ PR ({linkedPR.department})
                  </button>
                )}

                <select
                  style={{
                    height: "28px",
                    padding: "0 8px",
                    fontSize: "12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "5px",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                  value={
                    departmentOptions.includes(activeRequest.requestingDepartment || "")
                      ? activeRequest.requestingDepartment
                      : ""
                  }
                  onChange={(e) => {
                    if (e.target.value === "__ADD_NEW__") {
                      handleAddNewDept();
                      return;
                    }
                    if (e.target.value) {
                      handleSelectRequestingDept(e.target.value);
                    }
                  }}
                >
                  <option value="">-- Chọn phòng ban yêu cầu --</option>
                  {departmentOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                  <option value="__ADD_NEW__">＋ Thêm phòng ban mới...</option>
                </select>

                <button
                  type="button"
                  style={{
                    background: "#f1f5f9",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                    padding: "2px 8px",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                  onClick={handleAddNewDept}
                  title="Thêm phòng ban mới vào hệ thống (không tự gõ không thêm mã)"
                >
                  ＋ Thêm mã
                </button>
              </div>
            )}
          </div>
          <div className="phenikaa-section-subline">
            <input
              type="text"
              className="sheet-inline-input bold-input"
              value={activeRequest.section1Title}
              readOnly={isReportMode}
              placeholder="Theo yêu cầu mua hàng phục vụ công việc của phòng... Phòng Cung Ứng đã tìm kiếm, đánh giá và đề xuất phương án như sau:"
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  section1Title: e.target.value,
                }))
              }
            />
          </div>

          <div className="approval-grid-scroll-wrap">
            <table className="phenikaa-approval-grid">
              {renderTableColGroup()}
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="col-stt"
                    style={{ width: colWidths.stt }}
                  >
                    STT
                  </th>
                  <th
                    rowSpan={2}
                    className="col-item-name"
                    style={{ width: colWidths.item }}
                  >
                    Hàng hóa
                  </th>
                  <th
                    rowSpan={2}
                    className="col-qty"
                    style={{ width: colWidths.qty }}
                  >
                    Số
                    <br />
                    lượng
                  </th>
                  <th
                    rowSpan={2}
                    className="col-unit"
                    style={{ width: colWidths.unit }}
                  >
                    ĐVT
                  </th>
                  {activeRequest.supplierColumns.map((sc) => (
                    <th
                      key={sc.colId}
                      colSpan={subColCountPerSupplier}
                      style={{ width: colWidths.perSup }}
                      className={`col-supplier-group ${
                        sc.isSelected ? "selected-supplier-th" : ""
                      }`}
                    >
                      <div className="screen-supplier-header no-print">
                        <div className="sup-header-top">
                          <label
                            className="sup-select-radio"
                            title="Đánh dấu là Nhà cung cấp được lựa chọn"
                          >
                            <input
                              type="radio"
                              name={`selected_sup_${activeRequest.id}`}
                              checked={sc.isSelected}
                              disabled={isReportMode}
                              onChange={() => handleSelectSupplierCol(sc.colId)}
                            />
                            <span>
                              {sc.isSelected ? "NCC lựa chọn:" : "NCC tham gia:"}
                            </span>
                          </label>
                          {!isReportMode &&
                            activeRequest.supplierColumns.length > 1 && (
                              <button
                                type="button"
                                className="sup-remove-btn"
                                title="Xóa cột Nhà cung cấp này"
                                onClick={() =>
                                  handleRemoveSupplierColumn(sc.colId)
                                }
                              >
                                ×
                              </button>
                            )}
                        </div>
                        <input
                          type="text"
                          className="sup-short-input"
                          value={sc.shortName}
                          readOnly={isReportMode}
                          placeholder="Tên Nhà cung cấp"
                          onChange={(e) => {
                            const val = e.target.value;
                            updateActive((prev) => ({
                              ...prev,
                              supplierColumns: prev.supplierColumns.map((c) =>
                                c.colId === sc.colId
                                  ? {
                                      ...c,
                                      shortName: val,
                                      supplierName:
                                        !c.supplierName ||
                                        c.supplierName === c.shortName
                                          ? val
                                          : c.supplierName,
                                    }
                                  : c,
                              ),
                            }));
                          }}
                        />
                        {!isReportMode &&
                          (!hasQuotedProduct || !hasSupplierQty) && (
                            <div className="sup-quick-add-cols">
                              {!hasQuotedProduct && (
                                <button
                                  type="button"
                                  className="quick-subcol-btn"
                                  onClick={() => toggleQuotedProductColumn(true)}
                                  title="Thêm cột Mặt hàng NCC báo cho các NCC"
                                >
                                  + Mặt hàng NCC báo
                                </button>
                              )}
                              {!hasSupplierQty && (
                                <button
                                  type="button"
                                  className="quick-subcol-btn"
                                  onClick={() => toggleSupplierQtyColumn(true)}
                                  title="Thêm cột Số lượng mua của NCC"
                                >
                                  + SL mua của NCC
                                </button>
                              )}
                            </div>
                          )}
                      </div>
                    </th>
                  ))}
                </tr>

                <tr>
                  {activeRequest.supplierColumns.map((sc) => (
                    <React.Fragment key={`sub_${sc.colId}`}>
                      {hasQuotedProduct && (
                        <th
                          className="col-sub-spec"
                          style={{ width: colWidths.spec }}
                        >
                          <div className="subcol-th-wrap">
                            <span>{quotedProductTitle}</span>
                            {!isReportMode && (
                              <button
                                type="button"
                                className="hide-subcol-x no-print"
                                title="Ẩn cột Mặt hàng NCC báo"
                                onClick={() => toggleQuotedProductColumn(false)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </th>
                      )}
                      <th
                        className="col-sub-price"
                        style={{ width: colWidths.price }}
                      >
                        Đơn giá
                        <br />
                        (VNĐ)
                      </th>
                      {hasSupplierQty && (
                        <th
                          className="col-sub-qty"
                          style={{ width: colWidths.supQty }}
                        >
                          <div className="subcol-th-wrap">
                            <span>
                              Số
                              <br />
                              lượng
                            </span>
                            {!isReportMode && (
                              <button
                                type="button"
                                className="hide-subcol-x no-print"
                                title="Ẩn cột Số lượng mua của NCC"
                                onClick={() => toggleSupplierQtyColumn(false)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </th>
                      )}
                      <th
                        className="col-sub-amount"
                        style={{ width: colWidths.amt }}
                      >
                        Thành
                        <br />
                        tiền
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {activeRequest.rows.map((row, rowIdx) => {
                  const maxSubLines = hasSupplierQty
                    ? Math.max(
                        1,
                        ...activeRequest.supplierColumns.map(
                          (sc) => (row.supplierQuotes[sc.colId] || []).length,
                        ),
                      )
                    : 1;

                  return Array.from({ length: maxSubLines }, (_, subIdx) => (
                    <tr key={`${row.rowId}_sub_${subIdx}`}>
                      {subIdx === 0 && (
                        <>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-stt"
                          >
                            <span>{row.stt}</span>
                            {!isReportMode && activeRequest.rows.length > 1 && (
                              <button
                                type="button"
                                className="row-del-btn no-print"
                                title="Xóa dòng hàng hóa này"
                                onClick={() => handleRemoveRow(row.rowId)}
                              >
                                ×
                              </button>
                            )}
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-left cell-item-name"
                          >
                            <textarea
                              className="cell-textarea no-print"
                              rows={calcTextareaRows(row.itemName, 22)}
                              value={row.itemName}
                              readOnly={isReportMode}
                              placeholder="Nhập hoặc Paste tên hàng hóa..."
                              onChange={(e) =>
                                handleUpdateFixedRow(
                                  rowIdx,
                                  "itemName",
                                  e.target.value,
                                )
                              }
                              onPaste={(e) => handleCellPaste(e, rowIdx, 0, 0)}
                            />
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-qty"
                          >
                            <input
                              type="text"
                              className="cell-input center no-print"
                              value={row.qty || ""}
                              readOnly={isReportMode}
                              onChange={(e) =>
                                handleUpdateFixedRow(
                                  rowIdx,
                                  "qty",
                                  e.target.value,
                                )
                              }
                              onPaste={(e) => handleCellPaste(e, rowIdx, 1, 0)}
                            />
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-unit"
                          >
                            <input
                              type="text"
                              className="cell-input center no-print"
                              value={row.unit}
                              readOnly={isReportMode}
                              onChange={(e) =>
                                handleUpdateFixedRow(
                                  rowIdx,
                                  "unit",
                                  e.target.value,
                                )
                              }
                              onPaste={(e) => handleCellPaste(e, rowIdx, 2, 0)}
                            />
                          </td>
                        </>
                      )}

                      {activeRequest.supplierColumns.map((sc) => {
                        const lines = row.supplierQuotes[sc.colId] || [
                          {
                            lineId: `default_${row.rowId}_${sc.colId}`,
                            quotedProduct: "",
                            origin: "",
                            unitPrice: 0,
                            qty: row.qty,
                            amount: 0,
                          },
                        ];

                        if (lines.length === 1 && maxSubLines > 1) {
                          if (subIdx > 0) return null;
                          const line = lines[0];
                          const effQty = hasSupplierQty
                            ? Number(line.qty) || 0
                            : Number(row.qty) || 0;
                          const computedAmt =
                            (Number(line.unitPrice) || 0) * effQty;
                          const prodText =
                            line.quotedProduct || line.origin || "";

                          return (
                            <React.Fragment
                              key={`cell_${row.rowId}_${sc.colId}_span`}
                            >
                              {hasQuotedProduct && (
                                <td
                                  rowSpan={maxSubLines}
                                  className="cell-left cell-sub-spec"
                                >
                                  <textarea
                                    className="cell-textarea no-print"
                                    rows={calcTextareaRows(prodText, 20)}
                                    value={prodText}
                                    readOnly={isReportMode}
                                    placeholder={`${quotedProductTitle}...`}
                                    onChange={(e) =>
                                      handleUpdateSupplierLine(
                                        rowIdx,
                                        sc.colId,
                                        0,
                                        "quotedProduct",
                                        e.target.value,
                                      )
                                    }
                                    onPaste={(e) =>
                                      handleCellPaste(
                                        e,
                                        rowIdx,
                                        getSupplierFlatColIndex(
                                          sc.colId,
                                          "quotedProduct",
                                        ),
                                        0,
                                      )
                                    }
                                  />
                                  {!isReportMode && (
                                    <button
                                      type="button"
                                      className="split-line-btn no-print"
                                      onClick={() =>
                                        handleSplitSubRow(row.rowId, sc.colId)
                                      }
                                    >
                                      + Tách dòng
                                    </button>
                                  )}
                                </td>
                              )}
                              <td
                                rowSpan={maxSubLines}
                                className="cell-right cell-sub-price"
                              >
                                <input
                                  type="text"
                                  className="cell-input right no-print"
                                  value={
                                    line.unitPrice
                                      ? formatVND(line.unitPrice)
                                      : ""
                                  }
                                  readOnly={isReportMode}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rowIdx,
                                      sc.colId,
                                      0,
                                      "unitPrice",
                                      e.target.value,
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rowIdx,
                                      getSupplierFlatColIndex(
                                        sc.colId,
                                        "unitPrice",
                                      ),
                                      0,
                                    )
                                  }
                                />
                              </td>
                              {hasSupplierQty && (
                                <td
                                  rowSpan={maxSubLines}
                                  className="cell-center cell-sub-qty"
                                >
                                  <input
                                    type="text"
                                    className="cell-input center no-print"
                                    value={line.qty || ""}
                                    readOnly={isReportMode}
                                    onChange={(e) =>
                                      handleUpdateSupplierLine(
                                        rowIdx,
                                        sc.colId,
                                        0,
                                        "qty",
                                        e.target.value,
                                      )
                                    }
                                    onPaste={(e) =>
                                      handleCellPaste(
                                        e,
                                        rowIdx,
                                        getSupplierFlatColIndex(sc.colId, "qty"),
                                        0,
                                      )
                                    }
                                  />
                                </td>
                              )}
                              <td
                                rowSpan={maxSubLines}
                                className="cell-right cell-sub-amount"
                              >
                                {computedAmt ? formatVND(computedAmt) : "-"}
                              </td>
                            </React.Fragment>
                          );
                        }

                        const line = lines[subIdx];
                        if (!line) {
                          return (
                            <React.Fragment
                              key={`empty_${row.rowId}_${sc.colId}_${subIdx}`}
                            >
                              {hasQuotedProduct && <td />}
                              <td />
                              {hasSupplierQty && <td />}
                              <td />
                            </React.Fragment>
                          );
                        }

                        const effQty = hasSupplierQty
                          ? Number(line.qty) || 0
                          : Number(row.qty) || 0;
                        const computedAmt =
                          (Number(line.unitPrice) || 0) * effQty;
                        const prodText =
                          line.quotedProduct || line.origin || "";

                        return (
                          <React.Fragment
                            key={`cell_${row.rowId}_${sc.colId}_${subIdx}`}
                          >
                            {hasQuotedProduct && (
                              <td className="cell-left cell-sub-spec">
                                <textarea
                                  className="cell-textarea no-print"
                                  rows={calcTextareaRows(prodText, 20)}
                                  value={prodText}
                                  readOnly={isReportMode}
                                  placeholder={`${quotedProductTitle}...`}
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rowIdx,
                                      sc.colId,
                                      subIdx,
                                      "quotedProduct",
                                      e.target.value,
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rowIdx,
                                      getSupplierFlatColIndex(
                                        sc.colId,
                                        "quotedProduct",
                                      ),
                                      subIdx,
                                    )
                                  }
                                />
                                {!isReportMode && hasSupplierQty && (
                                  <div className="subrow-tools no-print">
                                    {subIdx === lines.length - 1 && (
                                      <button
                                        type="button"
                                        className="split-line-btn"
                                        onClick={() =>
                                          handleSplitSubRow(row.rowId, sc.colId)
                                        }
                                      >
                                        + Tách dòng
                                      </button>
                                    )}
                                    {lines.length > 1 && (
                                      <button
                                        type="button"
                                        className="remove-subline-btn"
                                        onClick={() =>
                                          handleRemoveSubRow(
                                            row.rowId,
                                            sc.colId,
                                            line.lineId,
                                          )
                                        }
                                      >
                                        × Xóa dòng tách
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}

                            <td className="cell-right cell-sub-price">
                              <input
                                type="text"
                                className="cell-input right no-print"
                                value={
                                  line.unitPrice
                                    ? formatVND(line.unitPrice)
                                    : ""
                                }
                                readOnly={isReportMode}
                                placeholder="0"
                                onChange={(e) =>
                                  handleUpdateSupplierLine(
                                    rowIdx,
                                    sc.colId,
                                    subIdx,
                                    "unitPrice",
                                    e.target.value,
                                  )
                                }
                                onPaste={(e) =>
                                  handleCellPaste(
                                    e,
                                    rowIdx,
                                    getSupplierFlatColIndex(
                                      sc.colId,
                                      "unitPrice",
                                    ),
                                    subIdx,
                                  )
                                }
                              />
                            </td>

                            {hasSupplierQty && (
                              <td className="cell-center cell-sub-qty">
                                <input
                                  type="text"
                                  className="cell-input center no-print"
                                  value={line.qty || ""}
                                  readOnly={isReportMode}
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rowIdx,
                                      sc.colId,
                                      subIdx,
                                      "qty",
                                      e.target.value,
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rowIdx,
                                      getSupplierFlatColIndex(sc.colId, "qty"),
                                      subIdx,
                                    )
                                  }
                                />
                                {!isReportMode && !hasQuotedProduct && (
                                  <div className="subrow-tools no-print">
                                    {subIdx === lines.length - 1 && (
                                      <button
                                        type="button"
                                        className="split-line-btn"
                                        onClick={() =>
                                          handleSplitSubRow(row.rowId, sc.colId)
                                        }
                                      >
                                        + Tách
                                      </button>
                                    )}
                                    {lines.length > 1 && (
                                      <button
                                        type="button"
                                        className="remove-subline-btn"
                                        onClick={() =>
                                          handleRemoveSubRow(
                                            row.rowId,
                                            sc.colId,
                                            line.lineId,
                                          )
                                        }
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}

                            <td className="cell-right cell-sub-amount">
                              {computedAmt ? formatVND(computedAmt) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ));
                })}

                {activeRequest.showDeliveryTimeRow && (
                  <tr className="delivery-time-row">
                    <td className="cell-center" />
                    <td colSpan={3} className="cell-center bold-cell">
                      Thời gian giao hàng
                    </td>
                    {activeRequest.supplierColumns.map((sc) => (
                      <td
                        key={`deliv_${sc.colId}`}
                        colSpan={subColCountPerSupplier}
                        className="cell-center bold-cell"
                      >
                        <input
                          type="text"
                          className="cell-input center bold-input no-print"
                          placeholder="VD: Hàng có sẵn / 5 ngày..."
                          value={sc.deliveryTime || ""}
                          readOnly={isReportMode}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateActive((prev) => ({
                              ...prev,
                              supplierColumns: prev.supplierColumns.map((c) =>
                                c.colId === sc.colId
                                  ? { ...c, deliveryTime: val }
                                  : c,
                              ),
                            }));
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                )}

                <tr className="total-footer-row">
                  <td colSpan={4} className="cell-center bold-cell">
                    Tổng tiền chưa có VAT
                  </td>
                  {activeRequest.supplierColumns.map((sc) => {
                    const totalVal = supplierTotals[sc.colId] || 0;
                    return (
                      <React.Fragment key={`total_${sc.colId}`}>
                        <td
                          colSpan={subColCountPerSupplier - 1}
                          className="cell-empty-total"
                        />
                        <td className="cell-right bold-cell total-amount-cell">
                          {totalVal ? formatVND(totalVal) : "-"}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {!isReportMode && (
            <div className="table-bottom-actions no-print">
              <button type="button" className="btn" onClick={handleAddRow}>
                ＋ Thêm dòng hàng hóa
              </button>
              <span className="paste-hint-inline">
                💡 Bạn có thể copy nhiều dòng/cột từ Excel và bấm{" "}
                <code>Ctrl + V</code> trực tiếp vào bất kỳ ô nào trong bảng
              </span>
            </div>
          )}
        </div>

        {/* 4. PHẦN II: ĐÁNH GIÁ VÀ ĐỀ XUẤT LỰA CHỌN NHÀ CUNG CẤP */}
        <div className="phenikaa-section-block">
          <div className="phenikaa-section-heading">
            II. Đánh giá và đề xuất lựa chọn nhà cung cấp:
          </div>

          <div className="eval-row">
            <span className="eval-label">1. Nhà cung cấp đề xuất:</span>
            <div className="eval-field-wrap">
              <input
                type="text"
                list="approval-suppliers-datalist"
                className="sheet-inline-input bold-input no-print"
                value={effectiveRecommendedSupplier}
                readOnly={isReportMode}
                placeholder="Nhập hoặc chọn tên đầy đủ của Nhà cung cấp được đề xuất..."
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    recommendedSupplierName: e.target.value,
                  }))
                }
              />
              <datalist id="approval-suppliers-datalist">
                {activeRequest.supplierColumns.map((sc) => (
                  <option key={sc.colId} value={sc.supplierName} />
                ))}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="eval-row">
            <span className="eval-label">2. Điều kiện giao hàng:</span>
            <div className="eval-field-wrap">
              <input
                type="text"
                className="sheet-inline-input no-print"
                value={activeRequest.deliveryTerms}
                readOnly={isReportMode}
                placeholder="Để trống hoặc nhập điều kiện giao hàng..."
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    deliveryTerms: e.target.value,
                  }))
                }
              />
              {!isReportMode && (
                <div className="preset-pills no-print">
                  {DELIVERY_TERM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        updateActive((prev) => ({
                          ...prev,
                          deliveryTerms: preset,
                        }))
                      }
                    >
                      + {preset}
                    </button>
                  ))}
                  {activeRequest.deliveryTerms && (
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        updateActive((prev) => ({
                          ...prev,
                          deliveryTerms: "",
                        }))
                      }
                    >
                      Xóa trống
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="eval-row">
            <span className="eval-label">3. Điều khoản thanh toán:</span>
            <div className="eval-field-wrap">
              <input
                type="text"
                className="sheet-inline-input no-print"
                value={activeRequest.paymentTerms}
                readOnly={isReportMode}
                placeholder="VD: Thanh toán 100% trước khi giao hàng."
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    paymentTerms: e.target.value,
                  }))
                }
              />
              {!isReportMode && (
                <div className="preset-pills no-print">
                  {PAYMENT_TERM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        updateActive((prev) => ({
                          ...prev,
                          paymentTerms: preset,
                        }))
                      }
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. PHẦN III: LÝ DO LỰA CHỌN */}
        <div className="phenikaa-section-block">
          <div className="phenikaa-section-heading">III. Lý do lựa chọn:</div>

          <div className="reasons-list">
            {activeRequest.reasons.map((reason, idx) => (
              <div key={idx} className="reason-item-row">
                <span className="reason-index">{idx + 1}.</span>
                <input
                  type="text"
                  className="sheet-inline-input no-print"
                  value={reason}
                  readOnly={isReportMode}
                  placeholder="Nhập lý do đánh giá / lựa chọn..."
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActive((prev) => ({
                      ...prev,
                      reasons: prev.reasons.map((r, i) =>
                        i === idx ? val : r,
                      ),
                    }));
                  }}
                />
                {!isReportMode && activeRequest.reasons.length > 1 && (
                  <button
                    type="button"
                    className="reason-del-btn no-print"
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        reasons: prev.reasons.filter((_, i) => i !== idx),
                      }))
                    }
                    title="Xóa dòng lý do này"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {!isReportMode && (
            <div className="reasons-toolbar no-print">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  updateActive((prev) => ({
                    ...prev,
                    reasons: [...prev.reasons, ""],
                  }))
                }
              >
                ＋ Thêm dòng lý do
              </button>
              <div className="preset-pills">
                {REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="preset-chip"
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        reasons: [...prev.reasons, preset],
                      }))
                    }
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 6. KHU VỰC CHỮ KÝ 3 CỘT */}
        <table className="phenikaa-sign-table">
          <tbody>
            <tr>
              <td className="sign-col">
                <div className="sign-title">Lãnh đạo phê duyệt</div>
                <div
                  className="sign-space"
                  style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                />
                <div className="sign-name">
                  <input
                    type="text"
                    className="sheet-inline-input center bold-input no-print"
                    value={activeRequest.approverLeader}
                    readOnly={isReportMode}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        approverLeader: e.target.value,
                      }))
                    }
                  />
                </div>
              </td>
              <td className="sign-col">
                <div className="sign-title">Trưởng bộ phận</div>
                <div
                  className="sign-space"
                  style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                />
                <div className="sign-name">
                  <input
                    type="text"
                    className="sheet-inline-input center bold-input no-print"
                    value={activeRequest.approverDeptHead}
                    readOnly={isReportMode}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        approverDeptHead: e.target.value,
                      }))
                    }
                  />
                </div>
              </td>
              <td className="sign-col">
                <div className="sign-title">Người đề nghị</div>
                <div
                  className="sign-space"
                  style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                />
                <div className="sign-name">
                  <input
                    type="text"
                    className="sheet-inline-input center bold-input no-print"
                    value={activeRequest.requesterName}
                    readOnly={isReportMode}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        requesterName: e.target.value,
                      }))
                    }
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Thanh kéo chỉnh độ giãn cách khu vực ký (Chỉ trên màn hình, không in) */}
        {!isReportMode && (
          <div
            className="no-print"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
              marginTop: "8px",
              padding: "6px 12px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#475569",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span>✍️ <b>Khu vực ký:</b> {activeRequest.signSpaceHeight || 96}px</span>
              <button
                type="button"
                style={{
                  padding: "2px 8px",
                  fontSize: "11px",
                  background: (activeRequest.signSpaceHeight || 96) === 48 ? "#2563eb" : "#ffffff",
                  color: (activeRequest.signSpaceHeight || 96) === 48 ? "#ffffff" : "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  updateActive((prev) => ({
                    ...prev,
                    signSpaceHeight: 48,
                  }))
                }
              >
                Gọn (48px)
              </button>
              <button
                type="button"
                style={{
                  padding: "2px 8px",
                  fontSize: "11px",
                  background: (activeRequest.signSpaceHeight || 96) === 96 ? "#2563eb" : "#ffffff",
                  color: (activeRequest.signSpaceHeight || 96) === 96 ? "#ffffff" : "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: (activeRequest.signSpaceHeight || 96) === 96 ? 700 : 400,
                }}
                onClick={() =>
                  updateActive((prev) => ({
                    ...prev,
                    signSpaceHeight: 96,
                  }))
                }
              >
                Gấp đôi / Chuẩn (96px)
              </button>
              <button
                type="button"
                style={{
                  padding: "2px 8px",
                  fontSize: "11px",
                  background: (activeRequest.signSpaceHeight || 96) === 130 ? "#2563eb" : "#ffffff",
                  color: (activeRequest.signSpaceHeight || 96) === 130 ? "#ffffff" : "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  updateActive((prev) => ({
                    ...prev,
                    signSpaceHeight: 130,
                  }))
                }
              >
                Rộng (130px)
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px" }}>Kéo chỉnh:</span>
              <input
                type="range"
                min="40"
                max="180"
                step="4"
                value={activeRequest.signSpaceHeight || 96}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateActive((prev) => ({
                    ...prev,
                    signSpaceHeight: val,
                  }));
                }}
                style={{ width: "120px", cursor: "pointer" }}
                title="Kéo thanh trượt để thay đổi chiều cao khu vực ký tên"
              />
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================
          PORTAL BẢN IN CÔ LẬP TRỰC TIẾP RA DOCUMENT.BODY (#approvalPrintPortal)
         =================================================================== */}
      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="approvalPrintPortal">
            <style>{`
              @page {
                size: A4 ${activeRequest.printOrientation || "portrait"};
                margin: 5mm 6mm;
              }
              @media screen {
                #approvalPrintPortal {
                  display: none !important;
                }
              }
              @media print {
                html, body {
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #ffffff !important;
                }
                .app,
                #paymentPrintPortal,
                #phenikaa-ai-host,
                [id^="phenikaa-ai"],
                .pka-fab-btn,
                .pka-chat-panel,
                .no-print {
                  display: none !important;
                  visibility: hidden !important;
                  opacity: 0 !important;
                }
                #approvalPrintPortal {
                  display: block !important;
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  font-family: "Times New Roman", Times, serif !important;
                  font-size: 10pt !important;
                  line-height: 1.18 !important;
                }
                /* Ghi đè triệt để rule global table { min-width: max-content } và th, td { white-space: nowrap } từ globals.css */
                #approvalPrintPortal table,
                #approvalPrintPortal .phenikaa-print-grid,
                #approvalPrintPortal .phenikaa-header-table,
                #approvalPrintPortal .phenikaa-sign-table {
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: 100% !important;
                  table-layout: fixed !important;
                  border-collapse: collapse !important;
                }
                #approvalPrintPortal .phenikaa-header-table {
                  margin-bottom: 4px !important;
                }
                #approvalPrintPortal .phenikaa-logo-box {
                  padding: 3px 6px !important;
                }
                #approvalPrintPortal .phenikaa-logo-img {
                  max-height: 40px !important;
                }
                #approvalPrintPortal .phenikaa-title-box {
                  font-size: 14pt !important;
                  padding: 4px 6px !important;
                  line-height: 1.15 !important;
                  font-weight: 700 !important;
                }
                #approvalPrintPortal .phenikaa-meta-lines {
                  width: 100% !important;
                  margin-bottom: 4px !important;
                }
                #approvalPrintPortal .phenikaa-meta-line {
                  width: 100% !important;
                  text-align: left !important;
                  padding: 0px 0 !important;
                  font-size: 10pt !important;
                  line-height: 1.18 !important;
                }
                #approvalPrintPortal .phenikaa-section-block {
                  margin-bottom: 4px !important;
                }
                #approvalPrintPortal .phenikaa-section-heading {
                  font-size: 10.5pt !important;
                  margin-bottom: 1px !important;
                  line-height: 1.15 !important;
                  font-weight: 700 !important;
                }
                #approvalPrintPortal .phenikaa-section-subline {
                  font-size: 10pt !important;
                  margin-bottom: 2px !important;
                  line-height: 1.15 !important;
                }
                #approvalPrintPortal .eval-row {
                  margin-bottom: 1px !important;
                  line-height: 1.18 !important;
                  font-size: 10pt !important;
                }
                #approvalPrintPortal .phenikaa-sign-table {
                  margin-top: 6px !important;
                }
                #approvalPrintPortal .sign-title {
                  font-size: 10.5pt !important;
                  line-height: 1.15 !important;
                  font-weight: 700 !important;
                }
                #approvalPrintPortal .sign-space {
                  height: ${activeRequest.signSpaceHeight || 96}px !important;
                }
                #approvalPrintPortal .sign-name {
                  font-size: 10.5pt !important;
                  line-height: 1.15 !important;
                  font-weight: 700 !important;
                }
                #approvalPrintPortal th,
                #approvalPrintPortal td {
                  min-width: 0 !important;
                  height: auto !important;
                  position: static !important;
                  white-space: pre-wrap !important;
                  word-break: break-word !important;
                  overflow-wrap: break-word !important;
                  box-sizing: border-box !important;
                  vertical-align: middle !important;
                  color: #000000 !important;
                  background: transparent !important;
                }
                #approvalPrintPortal .phenikaa-print-grid th,
                #approvalPrintPortal .phenikaa-print-grid td {
                  border: 1px solid #000000 !important;
                  padding: 2px 3px !important;
                  font-size: 9.5pt !important;
                  line-height: 1.15 !important;
                }
                #approvalPrintPortal .phenikaa-sign-table td {
                  border: none !important;
                  vertical-align: top !important;
                }
              }
            `}</style>

            <div className="approval-pure-print-page">
              {/* 1. Header Công ty + Tiêu đề Biểu mẫu */}
              <table className="phenikaa-header-table">
                <tbody>
                  <tr>
                    <td className="phenikaa-logo-box">
                      <img
                        src={PHENIKAA_PHARMA_LOGO_BASE64}
                        alt="PHENIKAA PHARMA"
                        className="phenikaa-logo-img"
                      />
                    </td>
                    <td className="phenikaa-title-box">
                      ĐỀ NGHỊ PHÊ DUYỆT LỰA CHỌN NCC
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 2. Khung Thông tin bên trái (không kẻ bảng, hiển thị liền mạch hết bề ngang) */}
              <div className="phenikaa-meta-lines">
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Số PR:</span>{" "}
                  <span>{activeRequest.prNumber}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Ngày:</span>{" "}
                  <span>{activeRequest.createdDate}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Đơn vị lập biểu mẫu:</span>{" "}
                  <span>{activeRequest.department}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Ghi chú: Căn cứ theo PR số:</span>{" "}
                  <span>{activeRequest.noteRef}</span>
                </div>
              </div>

              {/* 3. Phần I & Bảng So sánh */}
              <div className="phenikaa-section-block">
                <div className="phenikaa-section-heading">
                  I. Nội dung đề nghị phê duyệt:
                </div>
                <div
                  className="phenikaa-section-subline"
                  style={{ fontWeight: 700 }}
                >
                  {activeRequest.section1Title}
                </div>

                <table className="phenikaa-print-grid">
                  {renderTableColGroup()}
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ width: colWidths.stt }}>
                        STT
                      </th>
                      <th rowSpan={2} style={{ width: colWidths.item }}>
                        Hàng hóa
                      </th>
                      <th rowSpan={2} style={{ width: colWidths.qty }}>
                        Số
                        <br />
                        lượng
                      </th>
                      <th rowSpan={2} style={{ width: colWidths.unit }}>
                        ĐVT
                      </th>
                      {activeRequest.supplierColumns.map((sc) => (
                        <th
                          key={`p_head_${sc.colId}`}
                          colSpan={subColCountPerSupplier}
                          style={{ width: colWidths.perSup }}
                        >
                          {sc.isSelected
                            ? `NCC lựa chọn: ${sc.shortName || sc.supplierName}`
                            : sc.shortName || sc.supplierName}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {activeRequest.supplierColumns.map((sc) => (
                        <React.Fragment key={`p_sub_${sc.colId}`}>
                          {hasQuotedProduct && (
                            <th style={{ width: colWidths.spec }}>
                              {quotedProductTitle}
                            </th>
                          )}
                          <th style={{ width: colWidths.price }}>
                            Đơn giá
                            <br />
                            (VNĐ)
                          </th>
                          {hasSupplierQty && (
                            <th style={{ width: colWidths.supQty }}>
                              Số
                              <br />
                              lượng
                            </th>
                          )}
                          <th style={{ width: colWidths.amt }}>
                            Thành
                            <br />
                            tiền
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRequest.rows.map((row) => {
                      const maxSubLines = hasSupplierQty
                        ? Math.max(
                            1,
                            ...activeRequest.supplierColumns.map(
                              (sc) => (row.supplierQuotes[sc.colId] || []).length,
                            ),
                          )
                        : 1;

                      return Array.from({ length: maxSubLines }, (_, subIdx) => (
                        <tr key={`p_${row.rowId}_${subIdx}`}>
                          {subIdx === 0 && (
                            <>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center"
                              >
                                {row.stt}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-left"
                              >
                                {row.itemName}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center"
                              >
                                {row.qty}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center"
                              >
                                {row.unit}
                              </td>
                            </>
                          )}

                          {activeRequest.supplierColumns.map((sc) => {
                            const lines = row.supplierQuotes[sc.colId] || [
                              {
                                lineId: `d_${row.rowId}_${sc.colId}`,
                                quotedProduct: "",
                                origin: "",
                                unitPrice: 0,
                                qty: row.qty,
                                amount: 0,
                              },
                            ];

                            if (lines.length === 1 && maxSubLines > 1) {
                              if (subIdx > 0) return null;
                              const line = lines[0];
                              const effQty = hasSupplierQty
                                ? Number(line.qty) || 0
                                : Number(row.qty) || 0;
                              const amt =
                                (Number(line.unitPrice) || 0) * effQty;
                              const prodText =
                                line.quotedProduct || line.origin || "";

                              return (
                                <React.Fragment
                                  key={`p_span_${row.rowId}_${sc.colId}`}
                                >
                                  {hasQuotedProduct && (
                                    <td
                                      rowSpan={maxSubLines}
                                      className="cell-left"
                                    >
                                      {prodText}
                                    </td>
                                  )}
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-right"
                                  >
                                    {line.unitPrice
                                      ? formatVND(line.unitPrice)
                                      : "-"}
                                  </td>
                                  {hasSupplierQty && (
                                    <td
                                      rowSpan={maxSubLines}
                                      className="cell-center"
                                    >
                                      {line.qty}
                                    </td>
                                  )}
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-right"
                                  >
                                    {amt ? formatVND(amt) : "-"}
                                  </td>
                                </React.Fragment>
                              );
                            }

                            const line = lines[subIdx];
                            if (!line) {
                              return (
                                <React.Fragment
                                  key={`p_empty_${row.rowId}_${sc.colId}_${subIdx}`}
                                >
                                  {hasQuotedProduct && <td />}
                                  <td />
                                  {hasSupplierQty && <td />}
                                  <td />
                                </React.Fragment>
                              );
                            }

                            const effQty = hasSupplierQty
                              ? Number(line.qty) || 0
                              : Number(row.qty) || 0;
                            const amt = (Number(line.unitPrice) || 0) * effQty;
                            const prodText =
                              line.quotedProduct || line.origin || "";

                            return (
                              <React.Fragment
                                key={`p_cell_${row.rowId}_${sc.colId}_${subIdx}`}
                              >
                                {hasQuotedProduct && (
                                  <td className="cell-left">{prodText}</td>
                                )}
                                <td className="cell-right">
                                  {line.unitPrice
                                    ? formatVND(line.unitPrice)
                                    : "-"}
                                </td>
                                {hasSupplierQty && (
                                  <td className="cell-center">{line.qty}</td>
                                )}
                                <td className="cell-right">
                                  {amt ? formatVND(amt) : "-"}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ));
                    })}

                    {activeRequest.showDeliveryTimeRow && (
                      <tr>
                        <td />
                        <td colSpan={3} className="cell-center bold-cell">
                          Thời gian giao hàng
                        </td>
                        {activeRequest.supplierColumns.map((sc) => (
                          <td
                            key={`p_deliv_${sc.colId}`}
                            colSpan={subColCountPerSupplier}
                            className="cell-center bold-cell"
                          >
                            {sc.deliveryTime || ""}
                          </td>
                        ))}
                      </tr>
                    )}

                    <tr className="total-footer-row">
                      <td colSpan={4} className="cell-center bold-cell">
                        Tổng tiền chưa có VAT
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const totalVal = supplierTotals[sc.colId] || 0;
                        return (
                          <React.Fragment key={`p_tot_${sc.colId}`}>
                            <td colSpan={subColCountPerSupplier - 1} />
                            <td className="cell-right bold-cell">
                              {totalVal ? formatVND(totalVal) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4. Phần II */}
              <div className="phenikaa-section-block">
                <div className="phenikaa-section-heading">
                  II. Đánh giá và đề xuất lựa chọn nhà cung cấp:
                </div>
                <div className="eval-row">
                  <span className="eval-label">1. Nhà cung cấp đề xuất:</span>
                  <strong style={{ flex: 1 }}>
                    {effectiveRecommendedSupplier}
                  </strong>
                </div>
                <div className="eval-row">
                  <span className="eval-label">2. Điều kiện giao hàng:</span>
                  <span style={{ flex: 1 }}>{activeRequest.deliveryTerms}</span>
                </div>
                <div className="eval-row">
                  <span className="eval-label">3. Điều khoản thanh toán:</span>
                  <span style={{ flex: 1 }}>{activeRequest.paymentTerms}</span>
                </div>
              </div>

              {/* 5. Phần III */}
              <div className="phenikaa-section-block">
                <div className="phenikaa-section-heading">
                  III. Lý do lựa chọn:
                </div>
                {activeRequest.reasons.map((reason, idx) => (
                  <div
                    key={`p_reason_${idx}`}
                    style={{ marginBottom: 1, lineHeight: 1.18, fontSize: "10pt" }}
                  >
                    {idx + 1}. {reason}
                  </div>
                ))}
              </div>

              {/* 6. Chữ ký 3 cột */}
              <table className="phenikaa-sign-table">
                <tbody>
                  <tr>
                    <td className="sign-col">
                      <div className="sign-title">Lãnh đạo phê duyệt</div>
                      <div
                        className="sign-space"
                        style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                      />
                      <div className="sign-name">
                        {activeRequest.approverLeader}
                      </div>
                    </td>
                    <td className="sign-col">
                      <div className="sign-title">Trưởng bộ phận</div>
                      <div
                        className="sign-space"
                        style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                      />
                      <div className="sign-name">
                        {activeRequest.approverDeptHead}
                      </div>
                    </td>
                    <td className="sign-col">
                      <div className="sign-title">Người đề nghị</div>
                      <div
                        className="sign-space"
                        style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                      />
                      <div className="sign-name">
                        {activeRequest.requesterName}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>,
          document.body,
        )}

      {/* MODAL DÁN NHANH VÙNG DỮ LIỆU TỪ EXCEL */}
      {/* Modal Chọn VAT khi tạo PO từ Chi tiết */}
      {poCreateModalReq && renderPOCreateModal()}

      {showExcelPasteModal && (
        <div
          className="backdrop no-print"
        >
          <div
            className="modal-panel"
            style={{ width: "min(960px, 95vw)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  📋 Dán nhanh vùng dữ liệu từ Excel
                </h3>
                <p className="modal-desc">
                  Copy các dòng/cột từ Excel (bắt đầu từ cột{" "}
                  <strong>Hàng hóa | Số lượng | ĐVT | ...</strong>) và dán vào ô
                  bên dưới, hoặc bấm <code>Ctrl + V</code> trực tiếp vào bất kỳ ô
                  nào trên bảng.
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowExcelPasteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <textarea
                className="excel-modal-textarea"
                rows={10}
                placeholder={
                  "Ví dụ copy từ Excel:\nKép thu vi sinh inox 316L\t6\tCái\t1.930.000\t11.580.000\nMặt bích inox 304 DN40\t2\tCái\t160.000\t320.000"
                }
                value={rawExcelModalText}
                onChange={(e) => setRawExcelModalText(e.target.value)}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowExcelPasteModal(false)}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const matrix = parseExcelClipboard(rawExcelModalText);
                    if (matrix.length > 0) {
                      applyMatrixToTable(matrix, 0, 0, 0);
                      setRawExcelModalText("");
                      setShowExcelPasteModal(false);
                    }
                  }}
                >
                  ✓ Áp dụng vào Bảng Phê duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  function renderPOCreateModal() {
    if (!poCreateModalReq) return null;
    const selectedCol =
      poCreateModalReq.supplierColumns.find((c) => c.isSelected) ||
      (poCreateModalReq.recommendedSupplierName
        ? poCreateModalReq.supplierColumns.find(
            (c) =>
              c.supplierName &&
              c.supplierName.trim().toLowerCase() === poCreateModalReq.recommendedSupplierName.trim().toLowerCase()
          )
        : undefined) ||
      poCreateModalReq.supplierColumns[0];

    const supName =
      poCreateModalReq.recommendedSupplierName?.trim() ||
      selectedCol?.supplierName?.trim() ||
      "Nhà cung cấp được phê duyệt";

    const matchedSupplier =
      (selectedCol?.supplierId !== undefined
        ? suppliers.find((s) => s.id === selectedCol.supplierId)
        : undefined) ||
      suppliers.find(
        (s) =>
          (poCreateModalReq.recommendedSupplierName &&
            s.name.trim().toLowerCase() === poCreateModalReq.recommendedSupplierName.trim().toLowerCase()) ||
          (selectedCol?.supplierName &&
            s.name.trim().toLowerCase() === selectedCol.supplierName.trim().toLowerCase()) ||
          (selectedCol?.shortName &&
            s.shortName &&
            s.shortName.trim().toLowerCase() === selectedCol.shortName.trim().toLowerCase())
      );

    const targetSup = matchedSupplier || {
      shortName: selectedCol?.shortName || "",
      name: supName,
      code: selectedCol?.colId || "",
    };

    const todayDate = localToday();
    const fallbackAutoCode = generatePOCode(targetSup, todayDate, pos, trash);
    const effectivePoNumber = (poCreateCustomNumber && poCreateCustomNumber.trim())
      ? poCreateCustomNumber.trim()
      : fallbackAutoCode;

    const subtotal = selectedCol
      ? computeSupplierTotal(poCreateModalReq, selectedCol.colId)
      : 0;
    const vatAmount = Math.round(subtotal * (poCreateVatRate / 100));
    const totalWithVat = subtotal + vatAmount;
    const isDuplicatePO = Boolean(effectivePoNumber && isPONumberExists(effectivePoNumber, pos, trash));
    const isButtonDisabled = !effectivePoNumber || isDuplicatePO;

    return (
      <div
        className="payment-modal-overlay no-print"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.7)",
          backdropFilter: "blur(4px)",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
        onClick={() => setPoCreateModalReq(null)}
      >
        <div
          className="payment-modal-card"
          style={{
            maxWidth: "580px",
            width: "100%",
            background: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 20px",
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "#1e293b",
                  color: "#38bdf8",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <PackagePlus size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                  Phát hành Đơn mua hàng (PO)
                </h3>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  Căn cứ ĐNPD: <b>{poCreateModalReq.prNumber || poCreateModalReq.requestNumber}</b>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPoCreateModalReq(null)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: 0,
                background: "#1e293b",
                color: "#94a3b8",
                fontSize: 18,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Box NCC & Số mặt hàng */}
            <div
              style={{
                background: "#f8fafc",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <span style={{ color: "#64748b" }}>Nhà cung cấp được chọn: </span>
                  <strong style={{ color: "#0f172a", fontSize: 14 }}>{supName}</strong>
                </div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#ecfdf5",
                    color: "#059669",
                    border: "1px solid #a7f3d0",
                  }}
                >
                  ✓ Đã chọn
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: 12.5 }}>
                <span>Số lượng mặt hàng: <strong style={{ color: "#0f172a" }}>{poCreateModalReq.rows.length} mặt hàng</strong></span>
                <span>Tiền tố mã PO: <strong style={{ color: "#0284c7" }}>{targetSup.shortName || "NCC"}</strong></span>
              </div>
            </div>

            {/* Dòng Số PO */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                  Số PO (Tự động gợi ý duy nhất, có thể sửa): <span style={{ color: "#ef4444" }}>*</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  className="cell-input"
                  style={{
                    flex: 1,
                    height: 40,
                    fontSize: 14,
                    fontWeight: 700,
                    color: isDuplicatePO ? "#dc2626" : "#0284c7",
                    padding: "0 12px",
                    border: `1.5px solid ${isDuplicatePO ? "#ef4444" : "#93c5fd"}`,
                    borderRadius: 6,
                    background: isDuplicatePO ? "#fef2f2" : "#ffffff",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  value={poCreateCustomNumber || effectivePoNumber}
                  onChange={(e) => {
                    setPoCreateCustomNumber(e.target.value);
                    setPoCreateNumberManual(true);
                  }}
                  placeholder="VD: PHUCVINH-26102026-02"
                />
                <button
                  type="button"
                  className="btn"
                  style={{
                    height: 40,
                    padding: "0 14px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    color: "#334155",
                    flexShrink: 0,
                  }}
                  title="Tạo lại mã tự động theo chuẩn NCC và ngày"
                  onClick={() => {
                    const autoCode = generatePOCode(targetSup, todayDate, pos, trash);
                    setPoCreateCustomNumber(autoCode);
                    setPoCreateNumberManual(false);
                  }}
                >
                  <RotateCcw size={14} /> Tự động
                </button>
              </div>

              {isDuplicatePO ? (
                <div style={{ color: "#ef4444", fontSize: 12, marginTop: 5, fontWeight: 600 }}>
                  ⚠ Số PO này đã tồn tại trên hệ thống, vui lòng chọn số khác!
                </div>
              ) : (
                <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 4 }}>
                  ✓ Mã duy nhất, tự động tăng hậu tố (-02, -03...) nếu có nhiều đơn cùng NCC trong ngày.
                </div>
              )}
            </div>

            {/* Mức thuế VAT */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                Chọn mức thuế suất VAT:
              </label>
              <select
                className="cell-input"
                style={{
                  width: "100%",
                  height: 38,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: "0 10px",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: 6,
                  background: "#fff",
                  boxSizing: "border-box",
                }}
                value={poCreateVatRate}
                onChange={(e) => setPoCreateVatRate(Number(e.target.value))}
              >
                <option value={10}>10% - Thuế GTGT chuẩn (10%)</option>
                <option value={8}>8% - Thuế GTGT ưu đãi (8%)</option>
                <option value={5}>5% - Thuế GTGT 5%</option>
                <option value={0}>0% - Không chịu thuế / Miễn thuế (0%)</option>
              </select>
            </div>

            {/* Khối tính toán trực quan (Live Calculation Preview) */}
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 8,
                padding: 14,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#475569" }}>Tổng tiền trước VAT:</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{formatVND(subtotal)} ₫</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottom: "1px dashed #bbf7d0" }}>
                <span style={{ color: "#475569" }}>Tiền thuế VAT ({poCreateVatRate}%):</span>
                <span style={{ fontWeight: 600, color: "#0284c7" }}>+{formatVND(vatAmount)} ₫</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, color: "#166534", fontSize: 14 }}>TỔNG THANH TOÁN (SAU VAT):</span>
                <span style={{ fontWeight: 800, color: "#15803d", fontSize: 18 }}>{formatVND(totalWithVat)} ₫</span>
              </div>
            </div>

            {/* Nút hành động */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 6,
                paddingTop: 14,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button
                type="button"
                className="btn"
                style={{
                  height: 38,
                  padding: "0 16px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => setPoCreateModalReq(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  height: 38,
                  padding: "0 20px",
                  borderRadius: 6,
                  border: "none",
                  fontWeight: 700,
                  fontSize: 13.5,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: isButtonDisabled ? "#94a3b8" : "#16a34a",
                  color: "#ffffff",
                  cursor: isButtonDisabled ? "not-allowed" : "pointer",
                  boxShadow: isButtonDisabled ? "none" : "0 2px 8px rgba(22, 163, 74, 0.35)",
                }}
                disabled={isButtonDisabled}
                onClick={() => {
                  if (isButtonDisabled) return;
                  onCreatePOFromApproval(poCreateModalReq, poCreateVatRate, effectivePoNumber);
                  setPoCreateModalReq(null);
                }}
              >
                <PackagePlus size={16} /> Xác nhận tạo PO
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

    function renderPRSourceModal() {
    return (
      <div
        className="backdrop no-print"
      >
        <div
          className="modal-panel"
          style={{ width: "min(880px, 95vw)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h3 className="modal-title">
                {sourceModalMode === "compare"
                  ? "📊 Tạo Đề nghị Phê duyệt từ Bảng So sánh giá PR"
                  : "📋 Tạo Đề nghị Phê duyệt trực tiếp từ PR (Bỏ qua so sánh giá)"}
              </h3>
              <p className="modal-desc">
                {sourceModalMode === "compare"
                  ? "Kế thừa toàn bộ danh mục hàng hóa, các Nhà cung cấp tham gia báo giá, đơn giá đã so sánh và tự động đánh dấu NCC có giá tốt nhất."
                  : "Lấy danh mục hàng hóa, số lượng và ĐVT từ PR sang để bạn tự nhập hoặc Paste đơn giá khảo sát."}
              </p>
            </div>
            <button
              type="button"
              className="btn-close"
              onClick={() => setSourceModalMode(null)}
            >
              ×
            </button>
          </div>
          <div
            className="modal-body"
            style={{ maxHeight: 420, overflowY: "auto" }}
          >
            {prs.length === 0 ? (
              <p>Chưa có phiếu PR nào trong hệ thống.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {prs.map((pr) => {
                  const qCount = Object.keys(quotesByPr[pr.id] || {}).length;
                  const supCount = (quoteSupplierIdsByPr[pr.id] || []).length;
                  return (
                    <div
                      key={pr.id}
                      className="pr-source-pick-card"
                      onClick={() =>
                        sourceModalMode === "compare"
                          ? handleCreateFromCompare(pr)
                          : handleCreateFromPR(pr)
                      }
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f2b5b" }}>
                          PR số: {pr.number} — {pr.department}
                        </div>
                        <div style={{ fontSize: 13, color: "#475569" }}>
                          {pr.purpose} · Ngày: {pr.date} · {pr.items.length} mặt
                          hàng
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {sourceModalMode === "compare" && (
                          <div
                            style={{
                              fontSize: 12,
                              color: qCount > 0 ? "#16a34a" : "#64748b",
                              fontWeight: 600,
                            }}
                          >
                            {qCount > 0
                              ? `Đã có báo giá (${supCount} NCC)`
                              : "Chưa nhập giá so sánh"}
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                        >
                          Chọn PR này →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
