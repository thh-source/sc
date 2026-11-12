"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  EyeOff,
  PackageCheck,
  Sliders,
  MoveHorizontal,
} from "lucide-react";
import {
  ApprovalItemRow,
  ApprovalRequest,
  ApprovalSupplierColumn,
  ApprovalCustomSigner,
  ApprovalSupplierQuoteLine,
  PR,
  PO,
  Quote,
  Supplier,
  TrashItem,
  PaymentHandoverItem,
  isItemHidden,
  generatePOCode,
  isPONumberExists,
} from "../types";
import { fmt as formatVND, generateShortName } from "../utils/format";
import { dateVN } from "../utils/date";
import { PHENIKAA_PHARMA_LOGO_BASE64, localToday, parsePrintDate } from "../payment-utils";
import {
  cleanExcelNumber,
  createApprovalFromCompare,
  createApprovalFromPR,
  createManualApproval,
  formatApprovalSection1Title,
  parseExcelClipboard,
  getSavedApprovalSigners,
  saveDefaultApprovalSigners,
} from "../utils/approvalSamples";
import { addNewDepartment, getUnifiedDepartments } from "../utils/departments";
import { DocFlowLinks } from "./DocFlowLinks";
import { resolveDocFlow } from "../utils/docFlow";
import { isApprovalCompleted, calcPODeliveryStats } from "../utils/paymentSync";
import { calcPOTotal } from "../types";
import { useIsMobile } from "../useIsMobile";

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
        badgeClass: "done",
        style: { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" },
      };
    }

    return {
      text: "Đã tạo PO",
      badgeClass: "done",
      style: { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" },
    };
  }

  if (req.status === "Đã tạo PO") {
    return {
      text: "Đã tạo PO",
      badgeClass: "done",
      style: { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" },
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
  autoOpenCreate?: boolean;
  onClearAutoCreate?: () => void;
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

export function renderQuotedProductHeaderNode(title: string): React.ReactNode {
  if (title === "Mặt hàng NCC báo") {
    return (
      <>
        Mặt hàng
        <br />
        NCC báo
      </>
    );
  }
  if (title.includes(" / ") || title.includes("/")) {
    const parts = title.split("/");
    return (
      <>
        {parts[0].trim()}
        <br />
        {parts.slice(1).join("/").trim()}
      </>
    );
  }
  return <span style={{ display: "inline-block", whiteSpace: "normal", wordBreak: "break-word" }}>{title}</span>;
}

/**
 * Chuyển đổi chuỗi ngày định dạng DD/MM/YYYY hoặc YYYY-MM-DD thành số so sánh (YYYYMMDD)
 * để đảm bảo sắp xếp chính xác từ mới nhất đến cũ nhất.
 */
export function getApprovalDisplayDate(createdDate?: string, id?: number): string {
  if (createdDate && createdDate.trim()) return createdDate.trim();
  if (id && id > 1500000000000 && id < 3000000000000) {
    try {
      const d = new Date(id);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return "—";
    }
  }
  return "—";
}

export function parseApprovalDate(dateStr?: string, id?: number): number {
  if (dateStr && typeof dateStr === "string") {
    const parts = dateStr.trim().split(/[\/\-\.]/);
    if (parts.length === 3) {
      let day = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else if (year < 100) {
        year += 2000;
      }
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return year * 10000 + month * 100 + day;
      }
    }
  }
  if (id && id > 1500000000000 && id < 3000000000000) {
    const d = new Date(id);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  return 0;
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
 * Tính số tiền thuế VAT cho từng cột NCC theo cấu hình của ĐNPD
 */
export function computeSupplierVatAmount(
  req: ApprovalRequest,
  colId: string,
): number {
  if (req.vatMode !== "with_vat") return 0;
  if (req.vatCalculationType === "already_included") return 0;
  const rate = req.vatRate !== undefined ? req.vatRate : 10;
  const subtotal = computeSupplierTotal(req, colId);
  return Math.round(subtotal * (rate / 100));
}

/**
 * Tính tổng tiền thanh toán cuối cùng (Tổng có VAT hoặc chưa VAT tùy chọn)
 */
export function computeSupplierFinalTotal(
  req: ApprovalRequest,
  colId: string,
): number {
  const subtotal = computeSupplierTotal(req, colId);
  if (req.vatMode !== "with_vat") return subtotal;
  if (req.vatCalculationType === "already_included") return subtotal;
  return subtotal + computeSupplierVatAmount(req, colId);
}

/**
 * Tự động tính số dòng hiển thị (rows) cho textarea dựa trên độ dài chuỗi và ký tự xuống dòng
 */
function calcTextareaRows(text: string | undefined, charsPerLine = 32): number {
  if (!text) return 1;
  const lines = String(text).split("\n");
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  return Math.max(1, Math.min(8, totalLines));
}

/**
 * Combobox tìm kiếm và chọn NCC cho Header cột so sánh (Phía trên của bảng)
 * - Hiển thị và lưu tên viết tắt vào header cột (shortName)
 * - Tự động ghi nhận tên đầy đủ của NCC (supplierName) & ID
 */
interface SupplierColumnSearchProps {
  column: ApprovalSupplierColumn;
  suppliers: Supplier[];
  isReportMode: boolean;
  onUpdate: (updates: { shortName: string; supplierName: string; supplierId?: number }) => void;
}

function SupplierColumnSearchCombobox({
  column,
  suppliers,
  isReportMode,
  onUpdate,
}: SupplierColumnSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return suppliers;
    const matched = suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.shortName && s.shortName.toLowerCase().includes(q)) ||
        s.code.toLowerCase().includes(q)
    );
    const others = suppliers.filter((s) => !matched.includes(s));
    return [...matched, ...others];
  }, [query, suppliers]);

  const handleSelect = (s: Supplier) => {
    const short = s.shortName || generateShortName(s.name);
    onUpdate({
      shortName: short,
      supplierName: s.name,
      supplierId: s.id,
    });
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="sup-combobox-wrap" ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          className="sup-short-input"
          value={column.shortName ?? ""}
          readOnly={isReportMode}
          placeholder="Tên viết tắt / gõ tìm NCC..."
          title="Tên viết tắt của NCC (Hiển thị ở phía trên của bảng so sánh)"
          onFocus={() => {
            if (!isReportMode) {
              setIsOpen(true);
              setQuery("");
            }
          }}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (!isOpen) setIsOpen(true);
            if (!val.trim()) {
              onUpdate({
                shortName: "",
                supplierName: "",
                supplierId: undefined,
              });
            } else {
              onUpdate({
                shortName: val,
                supplierName:
                  column.supplierName && column.supplierName !== column.shortName
                    ? column.supplierName
                    : val,
                supplierId: column.supplierId,
              });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              setIsOpen(false);
            }
          }}
        />
        {!isReportMode && (
          <button
            type="button"
            className="sup-combobox-toggle-btn"
            title="Gõ tìm hoặc chọn NCC từ danh bạ"
            onClick={(e) => {
              e.stopPropagation();
              setQuery("");
              setIsOpen((prev) => !prev);
              if (!isOpen) inputRef.current?.focus();
            }}
            style={{
              position: "absolute",
              right: "4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              fontSize: "11px",
              padding: "2px 4px",
            }}
          >
            ▾
          </button>
        )}
      </div>

      <div
        className="sup-fullname-caption"
        title={`Tên pháp nhân đầy đủ: ${column.supplierName || column.shortName}`}
      >
        {column.supplierName && column.supplierName !== column.shortName
          ? column.supplierName
          : "(Gõ để tìm NCC danh bạ)"}
      </div>

      {isOpen && !isReportMode && (
        <div className="sup-searchable-dropdown">
          <div
            style={{
              padding: "6px 8px",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "11px",
              fontWeight: 700,
              color: "#475569",
            }}
          >
            🔍 Chọn Nhà cung cấp (Tên viết tắt lên bảng, Tên đầy đủ xuống đề xuất):
          </div>
          {filteredSuppliers.length === 0 ? (
            <div
              style={{
                padding: "10px",
                fontSize: "12px",
                color: "#94a3b8",
                textAlign: "center",
              }}
            >
              Không tìm thấy NCC khớp với &quot;{query}&quot;
            </div>
          ) : (
            filteredSuppliers.map((s) => {
              const short = s.shortName || generateShortName(s.name);
              return (
                <div
                  key={s.id}
                  className="sup-searchable-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(s);
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "2px",
                    }}
                  >
                    <span className="sup-short-badge">{short}</span>
                    <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                      {s.code}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#1e293b",
                      lineHeight: 1.25,
                    }}
                  >
                    {s.name}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Textarea tự động co giãn độ cao và tự xuống dòng theo nội dung trong ô bảng A4 WYSIWYG
 */
interface SheetCellTextareaProps {
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onChange: (val: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

function SheetCellTextarea({
  value,
  readOnly,
  placeholder,
  className,
  style,
  onChange,
  onPaste,
}: SheetCellTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(22, textareaRef.current.scrollHeight)}px`;
    }
  };

  useLayoutEffect(() => {
    autoResize();
  }, [value]);

  const textVal = value || "";
  const lineCount = (textVal.match(/\n/g) || []).length + 1;
  const estimatedRows = Math.max(1, lineCount, Math.ceil(textVal.length / 24));

  return (
    <textarea
      ref={textareaRef}
      rows={estimatedRows}
      value={textVal}
      readOnly={readOnly}
      placeholder={placeholder}
      className={`sheet-textarea ${className || ""}`}
      style={{
        width: "100%",
        minHeight: "22px",
        resize: "none",
        overflow: "visible",
        fieldSizing: "content" as any,
        boxSizing: "border-box",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        display: "block",
        lineHeight: "1.35",
        padding: "2px 3px",
        margin: 0,
        background: "transparent",
        border: "1px solid transparent",
        outline: "none",
        fontFamily: "inherit",
        fontSize: "inherit",
        color: "inherit",
        ...style,
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = "auto";
        el.style.height = `${Math.max(22, el.scrollHeight)}px`;
      }}
      onChange={(e) => {
        onChange(e.target.value);
        autoResize();
      }}
      onPaste={onPaste}
    />
  );
}

/**
 * Header Combobox cho Nhà cung cấp trên bản in WYSIWYG
 * - Cho phép gõ tìm kiếm và chọn NCC từ danh mục
 * - Hiển thị tên viết tắt trên bảng, tự động lưu tên pháp nhân đầy đủ vào supplierName
 * - Tự động đồng bộ với NCC đề xuất trúng thầu
 */
interface PaperSupplierHeaderComboboxProps {
  column: ApprovalSupplierColumn;
  suppliers: Supplier[];
  isReportMode: boolean;
  onUpdate: (updates: { shortName: string; supplierName: string; supplierId?: number }) => void;
}

function PaperSupplierHeaderCombobox({
  column,
  suppliers,
  isReportMode,
  onUpdate,
}: PaperSupplierHeaderComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.shortName && s.shortName.toLowerCase().includes(q)) ||
        (s.code && s.code.toLowerCase().includes(q))
    );
  }, [query, suppliers]);

  const handleSelect = (s: Supplier) => {
    const short = s.shortName || generateShortName(s.name);
    onUpdate({
      shortName: short,
      supplierName: s.name,
      supplierId: s.id,
    });
    setIsOpen(false);
    setQuery("");
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (!isOpen) setIsOpen(true);
    const matched = suppliers.find(
      (s) =>
        (s.shortName && s.shortName.trim().toLowerCase() === val.trim().toLowerCase()) ||
        s.name.trim().toLowerCase() === val.trim().toLowerCase() ||
        (s.code && s.code.trim().toLowerCase() === val.trim().toLowerCase())
    );

    if (matched) {
      onUpdate({
        shortName: val,
        supplierName: matched.name,
        supplierId: matched.id,
      });
    } else {
      onUpdate({
        shortName: val,
        supplierName:
          column.supplierName && column.supplierName !== column.shortName
            ? column.supplierName
            : val,
        supplierId: column.supplierId,
      });
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", position: "relative", width: "100%", minWidth: 0 }}>
        <input
          ref={inputRef}
          type="text"
          className="sheet-inline-input center bold-input uppercase"
          style={{
            fontSize: "8.5pt",
            fontWeight: 700,
            paddingRight: !isReportMode ? "14px" : "2px",
            width: "100%",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          value={column.shortName || column.supplierName || ""}
          readOnly={isReportMode}
          placeholder="Tên NCC..."
          list={`sup-list-${column.colId}`}
          onFocus={() => {
            if (!isReportMode) {
              setQuery("");
            }
          }}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              setIsOpen(false);
            }
          }}
        />
        {!isReportMode && (
          <button
            type="button"
            className="no-print"
            title="Chọn NCC từ danh mục"
            onClick={(e) => {
              e.stopPropagation();
              setQuery("");
              setIsOpen((prev) => !prev);
              if (!isOpen) inputRef.current?.focus();
            }}
            style={{
              position: "absolute",
              right: "2px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              fontSize: "11px",
              padding: "1px 3px",
              lineHeight: 1,
            }}
          >
            ▾
          </button>
        )}
      </div>

      <datalist id={`sup-list-${column.colId}`}>
        {suppliers.map((s) => (
          <option key={s.id} value={s.shortName || generateShortName(s.name) || s.name}>
            {s.name} {s.code ? `(${s.code})` : ""}
          </option>
        ))}
      </datalist>

      {isOpen && !isReportMode && (
        <div
          className="no-print"
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            minWidth: "260px",
            maxWidth: "340px",
            maxHeight: "240px",
            overflowY: "auto",
            backgroundColor: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
            zIndex: 100,
            textAlign: "left",
          }}
        >
          <div
            style={{
              padding: "5px 8px",
              background: "#f1f5f9",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "11px",
              fontWeight: 700,
              color: "#334155",
            }}
          >
            🔍 Gõ tìm hoặc chọn NCC ({filteredSuppliers.length}):
          </div>
          {filteredSuppliers.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>
              Không tìm thấy NCC khớp &quot;{query}&quot;
            </div>
          ) : (
            filteredSuppliers.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: "5px 8px",
                  borderBottom: "1px solid #f8fafc",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(s);
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      background: "#dbeafe",
                      color: "#1e40af",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: "3px",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.shortName || generateShortName(s.name)}
                  </span>
                  {s.code && (
                    <span style={{ fontSize: "10px", color: "#64748b" }}>
                      ({s.code})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "#1e293b", marginTop: "2px", lineHeight: "1.25" }}>
                  {s.name}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Combobox tìm kiếm và chọn NCC cho Mục II.1 (Đề xuất nhà cung cấp ở phía dưới)
 * - Hiển thị và lưu tên đầy đủ của NCC (fullName)
 * - Đồng bộ với cột NCC tương ứng ở bảng trên nếu khớp
 */
interface ProposalSupplierSearchProps {
  value: string;
  suppliers: Supplier[];
  supplierColumns: ApprovalSupplierColumn[];
  isReportMode: boolean;
  onSelect: (supplierName: string, matchedColId?: string) => void;
  onChangeText: (text: string) => void;
}

function ProposalSupplierSearchCombobox({
  value,
  suppliers,
  supplierColumns,
  isReportMode,
  onSelect,
  onChangeText,
}: ProposalSupplierSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return suppliers;
    const matched = suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.shortName && s.shortName.toLowerCase().includes(q)) ||
        s.code.toLowerCase().includes(q)
    );
    const others = suppliers.filter((s) => !matched.includes(s));
    return [...matched, ...others];
  }, [query, suppliers]);

  const handleChoose = (s: Supplier) => {
    const matchedCol = supplierColumns.find(
      (c) =>
        c.supplierId === s.id ||
        (c.supplierName && c.supplierName.trim().toLowerCase() === s.name.trim().toLowerCase()) ||
        (c.shortName && s.shortName && c.shortName.trim().toLowerCase() === s.shortName.trim().toLowerCase())
    );
    onSelect(s.name, matchedCol?.colId);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div
      className="eval-field-wrap"
      ref={containerRef}
      style={{ position: "relative", width: "100%" }}
    >
      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          className="sheet-inline-input bold-input no-print"
          value={value ?? ""}
          readOnly={isReportMode}
          placeholder="Nhập hoặc gõ tìm tên đầy đủ của Nhà cung cấp được đề xuất..."
          onFocus={() => {
            if (!isReportMode) {
              setIsOpen(true);
              setQuery("");
            }
          }}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (!isOpen) setIsOpen(true);
            onChangeText(val);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              setIsOpen(false);
            }
          }}
        />
        {!isReportMode && (
          <button
            type="button"
            className="sup-combobox-toggle-btn"
            title="Gõ tìm hoặc chọn NCC từ danh bạ"
            onClick={(e) => {
              e.stopPropagation();
              setQuery("");
              setIsOpen((prev) => !prev);
              if (!isOpen) inputRef.current?.focus();
            }}
            style={{
              position: "absolute",
              right: "6px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              fontSize: "12px",
              padding: "2px 4px",
            }}
          >
            ▾
          </button>
        )}
      </div>

      {isOpen && !isReportMode && (
        <div
          className="sup-searchable-dropdown"
          style={{ minWidth: "100%", maxWidth: "650px" }}
        >
          {supplierColumns.length > 0 && (
            <div
              style={{
                padding: "6px 10px",
                background: "#f0fdf4",
                borderBottom: "1px solid #bbf7d0",
                fontSize: "11px",
                fontWeight: 700,
                color: "#166534",
              }}
            >
              ⭐ Các nhà cung cấp trong bảng so sánh:
            </div>
          )}
          {supplierColumns.map((col) => {
            const isMatch =
              col.supplierName &&
              col.supplierName.trim().toLowerCase() === value.trim().toLowerCase();
            return (
              <div
                key={`prop_col_${col.colId}`}
                className={`sup-searchable-item ${isMatch ? "highlighted" : ""}`}
                style={{ background: isMatch ? "#dcfce7" : undefined }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(col.supplierName || col.shortName, col.colId);
                  setIsOpen(false);
                  setQuery("");
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    className="sup-short-badge"
                    style={{ background: "#bbf7d0", color: "#166534" }}
                  >
                    {col.shortName || "NCC"}
                  </span>
                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 700,
                      color: "#1e293b",
                    }}
                  >
                    {col.supplierName || col.shortName}
                  </span>
                  {col.isSelected && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#16a34a",
                        fontWeight: 700,
                        marginLeft: "auto",
                      }}
                    >
                      ✓ Đang chọn
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div
            style={{
              padding: "6px 10px",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "11px",
              fontWeight: 700,
              color: "#475569",
            }}
          >
            🏢 Danh sách tất cả Nhà cung cấp (Tên đầy đủ):
          </div>
          {filteredSuppliers.length === 0 ? (
            <div
              style={{
                padding: "10px",
                fontSize: "12px",
                color: "#94a3b8",
                textAlign: "center",
              }}
            >
              Không tìm thấy NCC khớp với &quot;{query}&quot;
            </div>
          ) : (
            filteredSuppliers.map((s) => {
              const short = s.shortName || generateShortName(s.name);
              const isMatch =
                s.name.trim().toLowerCase() === value.trim().toLowerCase();
              return (
                <div
                  key={`prop_all_${s.id}`}
                  className={`sup-searchable-item ${isMatch ? "highlighted" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleChoose(s);
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "2px",
                    }}
                  >
                    <span className="sup-short-badge">{short}</span>
                    <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                      {s.code}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      color: "#1e293b",
                      lineHeight: 1.25,
                    }}
                  >
                    {s.name}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 2. CÔNG THỨC KHỞI TẠO TỶ LỆ ĐỘNG THEO SỐ LƯỢNG NCC (N = 1, 2 HOẶC 3)
 * - Dành cố định 36% cho 4 cột bên trái:
 *   - STT: 4%
 *   - Hàng hóa: 22%
 *   - Số lượng: 5%
 *   - ĐVT: 5%
 * - Phân bổ 64% còn lại chia đều cho N Nhà cung cấp (N in {1, 2, 3}):
 *   - Mỗi cụm NCC chiếm: Width_NCC = 64% / N
 *   - Phân bổ 4 cột con trong từng cụm:
 *     - Mặt hàng NCC báo: 40% * Width_NCC
 *     - Đơn giá: 25% * Width_NCC
 *     - Số lượng: 15% * Width_NCC
 *     - Thành tiền: 20% * Width_NCC
 */
export function computeApprovalColumnWidths(
  numSups: number,
  hasQuotedProduct: boolean,
  hasSupplierQty: boolean
): number[] {
  const N = Math.max(1, numSups);
  let leftWidths: number[];
  let widthPerNCC: number;

  if (N === 1) {
    // 1 NCC: Khóa khít 100% lề giấy, mở rộng Hàng hóa và NCC để không bị thụt vào
    if (hasQuotedProduct && hasSupplierQty) {
      leftWidths = [4.0, 26.0, 6.0, 6.0]; // 42%
      widthPerNCC = 58.0;
    } else if (hasQuotedProduct && !hasSupplierQty) {
      leftWidths = [4.0, 28.0, 6.0, 6.0]; // 44%
      widthPerNCC = 56.0;
    } else if (!hasQuotedProduct && hasSupplierQty) {
      leftWidths = [4.0, 30.0, 6.0, 6.0]; // 46%
      widthPerNCC = 54.0;
    } else {
      leftWidths = [4.0, 36.0, 7.0, 7.0]; // 54%
      widthPerNCC = 46.0;
    }
  } else if (N === 2) {
    // 2 NCC: Chuẩn 36% bên trái + 64% chia đều 2 NCC (32% mỗi NCC)
    leftWidths = [4.0, 22.0, 5.0, 5.0];
    widthPerNCC = 32.0;
  } else if (N === 3) {
    // 3 NCC: Tinh gọn 30% bên trái (STT 3.5%, Hàng hóa 18.5%, SL 4%, ĐVT 4%) + 70% chia đều 3 NCC (~23.33% mỗi NCC)
    leftWidths = [3.5, 18.5, 4.0, 4.0];
    widthPerNCC = 70.0 / 3;
  } else {
    // 4 NCC trở lên: Tinh gọn tối đa 26% bên trái + 74% chia đều cho N NCC
    leftWidths = [3.0, 15.0, 4.0, 4.0];
    widthPerNCC = 74.0 / N;
  }

  const supplierWidths: number[] = [];
  for (let s = 0; s < N; s++) {
    if (hasQuotedProduct && hasSupplierQty) {
      supplierWidths.push(
        Number((0.38 * widthPerNCC).toFixed(2)),
        Number((0.26 * widthPerNCC).toFixed(2)),
        Number((0.14 * widthPerNCC).toFixed(2)),
        Number((0.22 * widthPerNCC).toFixed(2))
      );
    } else if (hasQuotedProduct && !hasSupplierQty) {
      supplierWidths.push(
        Number((0.44 * widthPerNCC).toFixed(2)),
        Number((0.28 * widthPerNCC).toFixed(2)),
        Number((0.28 * widthPerNCC).toFixed(2))
      );
    } else if (!hasQuotedProduct && hasSupplierQty) {
      supplierWidths.push(
        Number((0.40 * widthPerNCC).toFixed(2)),
        Number((0.20 * widthPerNCC).toFixed(2)),
        Number((0.40 * widthPerNCC).toFixed(2))
      );
    } else {
      // 2 cột con: Đơn giá và Thành tiền
      supplierWidths.push(
        Number((0.50 * widthPerNCC).toFixed(2)),
        Number((0.50 * widthPerNCC).toFixed(2))
      );
    }
  }

  const all = [...leftWidths, ...supplierWidths];
  // Khép kín tổng chính xác 100.00% bằng cách bù phần dư làm tròn vào cột Hàng hóa
  const currentSum = all.reduce((sum, w) => sum + w, 0);
  const diff = Number((100.0 - currentSum).toFixed(2));
  all[1] = Number((all[1] + diff).toFixed(2));
  return all;
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
  autoOpenCreate = false,
  onClearAutoCreate,
}: ApprovalManagementProps) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (autoOpenCreate) {
      setSourceModalMode("compare");
      onClearAutoCreate?.();
    }
  }, [autoOpenCreate]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showHidden, setShowHidden] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("scmh_approval_show_hidden") === "true";
    }
    return false;
  });

  const toggleShowHidden = () => {
    setShowHidden((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("scmh_approval_show_hidden", String(next));
      }
      return next;
    });
  };

  const hiddenApprovalCount = useMemo(() => {
    return approvalRequests.filter((r) => isItemHidden(r)).length;
  }, [approvalRequests]);

  const handleToggleHideApproval = (id: number) => {
    const target = approvalRequests.find((r) => r.id === id);
    if (!target) return;
    const nextHidden = !isItemHidden(target);
    onSaveApproval({ ...target, isHidden: nextHidden, is_hidden: nextHidden });
  };
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
  const [isSubmittingPO, setIsSubmittingPO] = useState<boolean>(false);
  const [showColWidthAdjuster, setShowColWidthAdjuster] = useState(false);
  const [workspaceViewMode, setWorkspaceViewMode] = useState<"wysiwyg" | "cards">("wysiwyg");
  const [resizingColKey, setResizingColKey] = useState<string | null>(null);
  const resizeRef = useRef<{
    colKey: string;
    startX: number;
    startWidth: number;
    tableWidth: number;
  } | null>(null);

  // Trạng thái hiển thị bảng xem nhanh danh mục hàng khi di chuột vào số ĐNPD
  const [hoveredApproval, setHoveredApproval] = useState<{
    req: ApprovalRequest;
    top: number;
    left: number;
  } | null>(null);
  const hoverTimeoutRef = useRef<any>(null);

  const handlePrMouseEnter = (e: React.MouseEvent, req: ApprovalRequest) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const popoverWidth = 560;
    const popoverMaxHeight = 360;

    const top =
      rect.bottom + 8 + popoverMaxHeight > window.innerHeight
        ? Math.max(10, rect.top - popoverMaxHeight - 8)
        : rect.bottom + 8;
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - popoverWidth - 24));

    setHoveredApproval({ req, top, left });
  };

  const handlePrMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredApproval(null);
    }, 150);
  };

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
    const defaultVat =
      req.vatMode === "with_vat"
        ? (req.vatCalculationType === "already_included" ? 0 : (req.vatRate !== undefined ? req.vatRate : 10))
        : 10;
    setPoCreateVatRate(defaultVat);
    setIsSubmittingPO(false);
    setPoCreateModalReq(req);
  };

  useEffect(() => {
    setMounted(true);
    if (typeof document !== "undefined") {
      document.querySelectorAll("colgroup[data-smart-columns]").forEach((el) => el.remove());
      document.querySelectorAll("style.smart-table-css").forEach((el) => el.remove());
      document.querySelectorAll(".smart-table-enabled").forEach((el) => el.classList.remove("smart-table-enabled"));
      document.querySelectorAll<HTMLTableElement>("table.phenikaa-print-grid").forEach((t) => {
        t.style.width = "100%";
      });
    }
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
        if (!showHidden && isItemHidden(req)) return false;
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
        // Luôn sắp xếp thuần túy từ mới nhất đến cũ nhất
        const dateA = parseApprovalDate(a.createdDate, a.id);
        const dateB = parseApprovalDate(b.createdDate, b.id);
        if (dateB !== dateA) return dateB - dateA;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
  }, [approvalRequests, searchQuery, statusFilter, showHidden]);

  // Bản nháp cục bộ: KHÔNG tự động lưu khi chỉnh sửa, chỉ lưu khi người dùng bấm nút "Lưu ĐNPD"
  const [localDraft, setLocalDraft] = useState<ApprovalRequest | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  useEffect(() => {
    if (activeApprovalId === null) {
      setLocalDraft(null);
      setHasUnsavedChanges(false);
      return;
    }
    const found = approvalRequests.find((r) => r.id === activeApprovalId);
    if (found) {
      setLocalDraft(JSON.parse(JSON.stringify(found)));
      setHasUnsavedChanges(false);
    } else {
      setLocalDraft(null);
      setHasUnsavedChanges(false);
    }
  }, [activeApprovalId]);

  const activeRequest = localDraft;

  useEffect(() => {
    if (autoPrint && activeRequest) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, activeRequest]);


  // Xử lý cập nhật tên người ký và tự động lưu làm mặc định cho các lần sau
  const handleLeaderChange = (val: string) => {
    updateActive((prev) => ({ ...prev, approverLeader: val }));
    saveDefaultApprovalSigners({ approverLeader: val });
  };

  const handleDeptHeadChange = (val: string) => {
    updateActive((prev) => ({ ...prev, approverDeptHead: val }));
    saveDefaultApprovalSigners({ approverDeptHead: val });
  };

  const handleRequesterChange = (val: string) => {
    updateActive((prev) => ({ ...prev, requesterName: val }));
    saveDefaultApprovalSigners({ requesterName: val });
  };

  const handleAddCustomSigner = (defaultTitle: string = "Bộ phận chuyên môn") => {
    const saved = getSavedApprovalSigners();
    const matchedSaved = (saved.customSigners || []).find(
      (cs) => cs.title.trim().toLowerCase() === defaultTitle.trim().toLowerCase()
    );
    const newSigner: ApprovalCustomSigner = {
      id: `cs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: defaultTitle,
      name: matchedSaved?.name || "",
    };
    updateActive((prev) => {
      const current = prev.customSigners || [];
      const updated = [...current, newSigner];
      saveDefaultApprovalSigners({
        customSigners: updated.map((c) => ({ title: c.title, name: c.name })),
      });
      return { ...prev, customSigners: updated };
    });
    showToast(`✓ Đã thêm ô ký: "${defaultTitle}"`);
  };

  const handleRemoveCustomSigner = (signerId: string) => {
    updateActive((prev) => {
      const updated = (prev.customSigners || []).filter((cs) => cs.id !== signerId);
      saveDefaultApprovalSigners({
        customSigners: updated.map((c) => ({ title: c.title, name: c.name })),
      });
      return { ...prev, customSigners: updated };
    });
    showToast("✓ Đã xóa ô ký");
  };

  const handleCustomSignerChange = (signerId: string, field: "title" | "name", val: string) => {
    updateActive((prev) => {
      const updated = (prev.customSigners || []).map((cs) =>
        cs.id === signerId ? { ...cs, [field]: val } : cs
      );
      saveDefaultApprovalSigners({
        customSigners: updated.map((c) => ({ title: c.title, name: c.name })),
      });
      return { ...prev, customSigners: updated };
    });
  };

  // Cập nhật dữ liệu vào bản nháp cục bộ (KHÔNG gọi API lưu tự động)
  const updateActive = (updater: (prev: ApprovalRequest) => ApprovalRequest) => {
    if (!localDraft || isReportMode) return;
    setLocalDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      setHasUnsavedChanges(true);
      return next;
    });
  };

  // Lưu tường minh khi người dùng bấm nút Lưu hoặc Ctrl+S
  const handleExplicitSave = () => {
    if (!localDraft) return;
    onSaveApproval(localDraft);
    setHasUnsavedChanges(false);
    showToast("💾 Đã lưu thành công Đề nghị phê duyệt!");
  };

  // Phím tắt Ctrl+S để lưu nhanh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (localDraft && !isReportMode) {
          handleExplicitSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localDraft, isReportMode]);

  // Xử lý khi bấm nút "Danh sách" quay lại
  const handleBackToList = () => {
    if (hasUnsavedChanges) {
      const confirmLeave = window.confirm(
        "Bạn có thay đổi chưa lưu trên Đề nghị phê duyệt này.\nBạn có chắc chắn muốn thoát mà KHÔNG lưu không?"
      );
      if (!confirmLeave) return;
    }
    setActiveApprovalId(null);
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

  // Tự động làm sạch các số PR giả định đã vô tình sinh ra trước đây khi tạo thủ công
  useEffect(() => {
    if (!activeRequest || isReportMode) return;
    if (
      activeRequest.sourceType === "manual" &&
      /^\d{2}\/03\/PR2603$/.test(activeRequest.prNumber || "") &&
      !prs.some((p) => p.number === activeRequest.prNumber)
    ) {
      updateActive((prev) => ({
        ...prev,
        prNumber: "",
        noteRef: /^\d{2}\/03\/PR2603$/.test(prev.noteRef || "") ? "" : prev.noteRef,
      }));
    }
  }, [activeRequest?.id, activeRequest?.prNumber, prs, isReportMode]);

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
        columnWidths: computeApprovalColumnWidths(prev.supplierColumns.length, nextVal, supQty),
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
        columnWidths: computeApprovalColumnWidths(prev.supplierColumns.length, quotedProd, nextVal),
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

  // Tính tổng tiền chưa có VAT, thuế VAT và tổng tiền có VAT cho từng cột NCC
  const { supplierSubtotals, supplierVatAmounts, supplierFinalTotals } = useMemo(() => {
    const subtotals: Record<string, number> = {};
    const vatAmounts: Record<string, number> = {};
    const finalTotals: Record<string, number> = {};
    if (!activeRequest) {
      return { supplierSubtotals: subtotals, supplierVatAmounts: vatAmounts, supplierFinalTotals: finalTotals };
    }
    activeRequest.supplierColumns.forEach((sc) => {
      subtotals[sc.colId] = computeSupplierTotal(activeRequest, sc.colId);
      vatAmounts[sc.colId] = computeSupplierVatAmount(activeRequest, sc.colId);
      finalTotals[sc.colId] = computeSupplierFinalTotal(activeRequest, sc.colId);
    });
    return { supplierSubtotals: subtotals, supplierVatAmounts: vatAmounts, supplierFinalTotals: finalTotals };
  }, [activeRequest]);

  const supplierTotals = supplierSubtotals;

  // Chọn NCC được đề xuất (Radio trên header cột)
  const handleSelectSupplierCol = (colId: string) => {
    updateActive((prev) => {
      const targetCol = prev.supplierColumns.find((c) => c.colId === colId);
      const nextCols = prev.supplierColumns.map((c) => ({
        ...c,
        isSelected: c.colId === colId,
      }));
      const matchedSup = targetCol?.supplierId
        ? suppliers.find((s) => s.id === targetCol.supplierId)
        : suppliers.find(
            (s) =>
              s.name.trim().toLowerCase() === (targetCol?.supplierName || "").trim().toLowerCase() ||
              (s.shortName && targetCol?.shortName && s.shortName.trim().toLowerCase() === targetCol.shortName.trim().toLowerCase())
          );
      const fullSupplierName =
        matchedSup?.name ||
        targetCol?.supplierName ||
        targetCol?.shortName ||
        prev.recommendedSupplierName;

      return {
        ...prev,
        supplierColumns: nextCols,
        recommendedSupplierName: fullSupplierName,
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
      shortName:
        matchedSup?.shortName ||
        (matchedSup?.name ? generateShortName(matchedSup.name) : `NCC ${newIndex}`),
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
        columnWidths: computeApprovalColumnWidths(nextCols.length, hasQuotedProduct, hasSupplierQty),
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
        columnWidths: computeApprovalColumnWidths(remaining.length, hasQuotedProduct, hasSupplierQty),
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
    if (!activeRequest) return;
    updateActive((prev) => {
      if (prev.rows.length <= 1) {
        // Nếu chỉ còn 1 dòng, xóa sạch để người dùng gõ mới chứ không xóa mất bảng
        const resetRow: ApprovalRequestRow = {
          rowId: `row_${Date.now()}_1`,
          stt: 1,
          itemName: "",
          qty: 1,
          unit: "Cái",
          supplierQuotes: prev.supplierColumns.reduce((acc, col) => {
            acc[col.colId] = [
              {
                lineId: `line_init_${col.colId}_1`,
                quotedProduct: "",
                origin: "",
                unitPrice: 0,
                qty: 1,
                amount: 0,
              },
            ];
            return acc;
          }, {} as Record<string, ApprovalSupplierQuoteLine[]>),
        };
        return { ...prev, rows: [resetRow] };
      }
      const filtered = prev.rows
        .filter((r) => r.rowId !== rowId)
        .map((r, idx) => ({ ...r, stt: idx + 1 }));
      return { ...prev, rows: filtered };
    });
  };

  // Chèn thêm 1 dòng hàng hóa ngay dưới vị trí chỉ định
  const handleInsertRowAfter = (targetIndex: number) => {
    if (!activeRequest) return;
    updateActive((prev) => {
      const rowId = `row_${Date.now()}`;
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
      const newRow: ApprovalRequestRow = {
        rowId,
        stt: targetIndex + 2,
        itemName: "",
        qty: 1,
        unit: "Cái",
        supplierQuotes,
      };
      const newRows = [...prev.rows];
      newRows.splice(targetIndex + 1, 0, newRow);
      return {
        ...prev,
        rows: newRows.map((r, idx) => ({ ...r, stt: idx + 1 })),
      };
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
    const newReq = createManualApproval(approvalRequests.length, suppliers);
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
   * 2. CÔNG THỨC KHỞI TẠO TỶ LỆ ĐỘNG THEO SỐ LƯỢNG NCC (N = 1, 2 HOẶC 3)
   * Bảng gồm 2 nhóm:
   * - Nhóm cố định bên trái (4 cột): STT (4%), Hàng hóa (22%), Số lượng (5%), ĐVT (5%) -> Tổng = 36%
   * - Nhóm biến thiên theo NCC: 64% còn lại chia đều cho N Nhà cung cấp (Width_NCC = 64% / N)
   *   Mỗi NCC gồm 4 cột con: Mặt hàng (40%), Đơn giá (25%), Số lượng (15%), Thành tiền (20%)
   * Tổng các phần tử trong mảng columnWidths PHẢI LUÔN BẰNG ĐÚNG 100%.
   */
  const columnWidths = useMemo<number[]>(() => {
    const numSups = Math.max(1, activeRequest?.supplierColumns.length || 1);
    const subCount = 2 + (hasQuotedProduct ? 1 : 0) + (hasSupplierQty ? 1 : 0);
    const expectedLength = 4 + numSups * subCount;

    const stored = activeRequest?.columnWidths;
    if (Array.isArray(stored) && stored.length === expectedLength) {
      const sum = stored.reduce((a, b) => a + b, 0);
      if (Math.abs(100 - sum) < 0.15) {
        return stored;
      }
      if (sum >= 97 && sum <= 103) {
        const diff = Number((100.0 - sum).toFixed(2));
        const normalized = [...stored];
        normalized[1] = Number((normalized[1] + diff).toFixed(2));
        return normalized;
      }
    }

    return computeApprovalColumnWidths(numSups, hasQuotedProduct, hasSupplierQty);
  }, [
    activeRequest?.columnWidths,
    activeRequest?.supplierColumns.length,
    hasQuotedProduct,
    hasSupplierQty,
  ]);

  /**
   * 3. CƠ CHẾ KÉO THẢ CO/GIÃN ĐỘ RỘNG CỘT (ADJACENT RESIZING - GIỮ NGUYÊN TỔNG 100%)
   * - Đặt thanh kéo (resize handle) ở mép phải của các thẻ <th> (trừ cột cuối cùng).
   * - Khi kéo vạch giữa Cột i và Cột i + 1: nếu Cột i tăng thêm +Δ%, thì Cột i + 1 giảm đi đúng -Δ%.
   * - Giới hạn minWidthPercent = 3% cho mỗi cột để tránh kéo biến mất cột.
   * - Tổng độ rộng bảng = 100% không bao giờ thay đổi, mép trái & phải khóa chặt khít 2 bên lề giấy.
   */
  const resizePairRef = useRef<{
    colIndex: number;
    startX: number;
    startWidthI: number;
    startWidthNext: number;
    tableWidth: number;
    initialWidths: number[];
  } | null>(null);

  const [resizingColIndex, setResizingColIndex] = useState<number | null>(null);

  const handleResizeStart = (colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tableEl = (e.currentTarget as HTMLElement).closest("table");
    const tableWidth = tableEl ? tableEl.getBoundingClientRect().width : 1000;
    const startWidthI = columnWidths[colIndex];
    const startWidthNext = columnWidths[colIndex + 1];

    resizePairRef.current = {
      colIndex,
      startX: e.clientX,
      startWidthI,
      startWidthNext,
      tableWidth,
      initialWidths: [...columnWidths],
    };
    setResizingColIndex(colIndex);
  };

  useEffect(() => {
    if (resizingColIndex === null) return;

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEv: MouseEvent) => {
      if (!resizePairRef.current) return;
      const { colIndex, startX, startWidthI, startWidthNext, tableWidth, initialWidths } =
        resizePairRef.current;
      const deltaPx = moveEv.clientX - startX;
      const deltaPct = (deltaPx / tableWidth) * 100;
      const numCols = initialWidths.length;
      const minWidthPercent = numCols >= 14 ? 1.5 : numCols >= 10 ? 2.0 : 2.5;

      let maxDelta = startWidthNext - minWidthPercent;
      let minDelta = -(startWidthI - minWidthPercent);
      let clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaPct));

      const nextWidths = [...initialWidths];
      nextWidths[colIndex] = Number((startWidthI + clampedDelta).toFixed(2));
      nextWidths[colIndex + 1] = Number((startWidthNext - clampedDelta).toFixed(2));

      // Khép kín tổng chính xác 100.00%
      const sum = nextWidths.reduce((a, b) => a + b, 0);
      const diff = Number((100.0 - sum).toFixed(2));
      nextWidths[colIndex + 1] = Number((nextWidths[colIndex + 1] + diff).toFixed(2));

      updateActive((prev) => ({
        ...prev,
        columnWidths: nextWidths,
      }));
    };

    const onMouseUp = () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      setResizingColIndex(null);
      resizePairRef.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingColIndex]);

  /**
   * Helper colWidths tương thích ngược cho thanh trượt
   */
  const colWidths = useMemo(() => {
    const stt = columnWidths[0] ?? 4.0;
    const item = columnWidths[1] ?? 22.0;
    const qty = columnWidths[2] ?? 5.0;
    const unit = columnWidths[3] ?? 5.0;
    const spec = hasQuotedProduct ? (columnWidths[4] ?? 10.0) : 0;
    const priceIdx = 4 + (hasQuotedProduct ? 1 : 0);
    const price = columnWidths[priceIdx] ?? 10.0;
    const supQtyIdx = priceIdx + 1;
    const supQty = hasSupplierQty ? (columnWidths[supQtyIdx] ?? 5.0) : 0;
    const amtIdx = hasSupplierQty ? supQtyIdx + 1 : priceIdx + 1;
    const amt = columnWidths[amtIdx] ?? 10.0;

    return {
      stt: `${stt}%`,
      item: `${item}%`,
      qty: `${qty}%`,
      unit: `${unit}%`,
      spec: `${spec}%`,
      price: `${price}%`,
      supQty: `${supQty}%`,
      amt: `${amt}%`,
      numValues: { stt, item, qty, unit, spec, price, supQty, amt },
      hasCustom: !!activeRequest?.columnWidths,
    };
  }, [columnWidths, hasQuotedProduct, hasSupplierQty, activeRequest?.columnWidths]);

  const handleUpdateSingleColWidth = (
    key: "item" | "spec" | "price" | "qty",
    targetVal: number
  ) => {
    if (!activeRequest) return;
    const nextWidths = [...columnWidths];
    if (key === "item") {
      const delta = targetVal - nextWidths[1];
      nextWidths[1] = Math.max(10, Math.min(45, targetVal));
      if (nextWidths.length > 2) {
        nextWidths[2] = Math.max(3, Number((nextWidths[2] - delta).toFixed(2)));
      }
    } else if (key === "spec" && hasQuotedProduct && nextWidths.length > 4) {
      const delta = targetVal - nextWidths[4];
      nextWidths[4] = Math.max(3, Math.min(30, targetVal));
      if (nextWidths.length > 5) {
        nextWidths[5] = Math.max(3, Number((nextWidths[5] - delta).toFixed(2)));
      }
    } else if (key === "price" && nextWidths.length > 5) {
      const pIdx = 4 + (hasQuotedProduct ? 1 : 0);
      const delta = targetVal - nextWidths[pIdx];
      nextWidths[pIdx] = Math.max(3, Math.min(25, targetVal));
      if (pIdx + 1 < nextWidths.length) {
        nextWidths[pIdx + 1] = Math.max(3, Number((nextWidths[pIdx + 1] - delta).toFixed(2)));
      }
    } else if (key === "qty" && nextWidths.length > 2) {
      const delta = targetVal - nextWidths[2];
      nextWidths[2] = Math.max(3, Math.min(15, targetVal));
      nextWidths[1] = Math.max(10, Number((nextWidths[1] - delta).toFixed(2)));
    }
    const sum = nextWidths.reduce((a, b) => a + b, 0);
    const diff = Number((100.0 - sum).toFixed(2));
    nextWidths[1] = Number((nextWidths[1] + diff).toFixed(2));
    updateActive((prev) => ({ ...prev, columnWidths: nextWidths }));
  };

  const applyColWidthPreset = (preset: "balanced" | "long_item" | "large_amount") => {
    if (!activeRequest) return;
    const numSups = Math.max(1, activeRequest.supplierColumns.length || 1);
    if (preset === "balanced") {
      updateActive((prev) => ({
        ...prev,
        columnWidths: undefined,
      }));
      return;
    }
    const base = computeApprovalColumnWidths(numSups, hasQuotedProduct, hasSupplierQty);
    if (preset === "long_item") {
      base[1] = 30.0;
      const remaining = 70.0;
      const otherSum = base.reduce((s, w, i) => (i === 1 ? s : s + w), 0);
      for (let i = 0; i < base.length; i++) {
        if (i !== 1) {
          base[i] = Number(((base[i] / otherSum) * remaining).toFixed(2));
        }
      }
    } else if (preset === "large_amount") {
      base[1] = 16.0;
      const remaining = 84.0;
      const otherSum = base.reduce((s, w, i) => (i === 1 ? s : s + w), 0);
      for (let i = 0; i < base.length; i++) {
        if (i !== 1) {
          base[i] = Number(((base[i] / otherSum) * remaining).toFixed(2));
        }
      }
    }
    const sum = base.reduce((a, b) => a + b, 0);
    const diff = Number((100.0 - sum).toFixed(2));
    base[1] = Number((base[1] + diff).toFixed(2));
    updateActive((prev) => ({ ...prev, columnWidths: base }));
  };

  /**
   * 2. Quản lý độ rộng cột tập trung bằng thẻ <colgroup> đặt ngay dưới <table>:
   * Tổng các phần tử trong mảng columnWidths PHẢI LUÔN BẰNG ĐÚNG 100%.
   */
  const renderTableColGroup = () => {
    return (
      <colgroup>
        {columnWidths.map((width, idx) => (
          <col key={idx} style={{ width: `${width}%` }} />
        ))}
      </colgroup>
    );
  };

  // Tên NCC đề xuất (tự động fallback sang NCC được tích chọn nếu ô nhập đang trống, ưu tiên tên đầy đủ)
  const effectiveRecommendedSupplier = useMemo(() => {
    if (!activeRequest) return "";
    const rawName = activeRequest.recommendedSupplierName?.trim();
    if (rawName) {
      const matched = suppliers.find(
        (s) =>
          s.name.trim().toLowerCase() === rawName.toLowerCase() ||
          (s.shortName &&
            s.shortName.trim().toLowerCase() === rawName.toLowerCase()) ||
          (s.code && s.code.trim().toLowerCase() === rawName.toLowerCase()) ||
          (s.shortName &&
            s.shortName.trim().toLowerCase().includes(rawName.toLowerCase())) ||
          s.name.trim().toLowerCase().includes(rawName.toLowerCase())
      );
      if (matched) return matched.name;
      return rawName;
    }
    const sel =
      activeRequest.supplierColumns.find((c) => c.isSelected) ||
      activeRequest.supplierColumns[0];
    if (sel) {
      if (sel.supplierId) {
        const sup = suppliers.find((s) => s.id === sel.supplierId);
        if (sup) return sup.name;
      }
      const matched = suppliers.find(
        (s) =>
          s.name.trim().toLowerCase() === (sel.supplierName || "").trim().toLowerCase() ||
          (s.shortName &&
            sel.shortName &&
            s.shortName.trim().toLowerCase() === sel.shortName.trim().toLowerCase()) ||
          (sel.shortName &&
            s.shortName &&
            s.shortName.trim().toLowerCase().includes(sel.shortName.trim().toLowerCase())) ||
          (sel.shortName &&
            s.name.trim().toLowerCase().includes(sel.shortName.trim().toLowerCase()))
      );
      if (matched) return matched.name;
      return sel.supplierName || sel.shortName || "";
    }
    return "";
  }, [activeRequest, suppliers]);

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

        {/* Stitch v2 Executive Page Header */}
        <div className="heading stitch-page-banner">
          <div>
            <div className="stitch-breadcrumb">
              <span>Điều hành Thu mua</span>
              <span>/</span>
              <b>Đề nghị Phê duyệt NCC (ĐNPD)</b>
            </div>
            <h1>Đề nghị Phê duyệt Lựa chọn Nhà Cung Cấp</h1>
            <p className="stitch-subtitle">
              Tổng hợp ma trận báo giá cạnh tranh, thẩm định phương án tối ưu và trình ký phê duyệt NCC trúng thầu
            </p>
          </div>
          {!isReportMode && (
            <div className="approval-source-actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn approval-source-btn source-compare"
                onClick={() => setSourceModalMode("compare")}
              >
                <Scale size={16} /> Lập từ So sánh giá
              </button>
              <button
                type="button"
                className="btn approval-source-btn source-pr"
                onClick={() => setSourceModalMode("pr")}
              >
                <FileText size={16} /> Lập từ PR
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleCreateManual}
              >
                <Plus size={16} /> Tạo phiếu ĐNPD mới
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  onRestoreSamples();
                  showToast("✓ Đã nạp biểu mẫu chuẩn Phenikaa Pharma!");
                }}
              >
                <RotateCcw size={16} /> Mẫu chuẩn
              </button>
            </div>
          )}
        </div>

        {/* Stitch v2 Bento KPI Summary Strip */}
        <div className="stitch-kpi-strip">
          <div className="stitch-kpi-card kpi-navy">
            <div className="stitch-kpi-icon">
              <FileText size={20} />
            </div>
            <div className="stitch-kpi-body">
              <small>Tổng Phiếu Đề Nghị Phê Duyệt</small>
              <strong>
                {approvalRequests.length} <em>hồ sơ ĐNPD</em>
              </strong>
              <span className="stitch-kpi-sub">
                Lưu trữ & đồng bộ trực tuyến Cloudflare D1
              </span>
            </div>
          </div>

          <div className="stitch-kpi-card kpi-orange">
            <div className="stitch-kpi-icon">
              <Scale size={20} />
            </div>
            <div className="stitch-kpi-body">
              <small>Đang Thẩm Định & Chờ Duyệt</small>
              <strong>
                {pendingCount} <em>phiếu chờ duyệt</em>
              </strong>
              <span className="stitch-kpi-sub">
                Bao gồm phiếu Nháp & Chờ Ban lãnh đạo ký duyệt
              </span>
            </div>
          </div>

          <div className="stitch-kpi-card kpi-emerald">
            <div className="stitch-kpi-icon">
              <CheckCircle2 size={20} />
            </div>
            <div className="stitch-kpi-body">
              <small>Đã Phê Duyệt & Phát Hành PO</small>
              <strong>
                {approvedCount + poCreatedCount} <em>phiếu hoàn tất</em>
              </strong>
              <span className="stitch-kpi-sub">
                Đã lên PO: <b>{poCreatedCount}</b> phiếu · Sẵn sàng tạo PO: <b>{approvedCount}</b>
              </span>
            </div>
          </div>
        </div>

        {/* Bảng Danh sách các phiếu Đề nghị Phê duyệt */}
        <div className="pr-panel">
          <div className="pr-toolbar stitch-filter-bar">
            <div className="stitch-seg-group">
              <button
                type="button"
                className={`stitch-seg-btn ${statusFilter === "ALL" ? "active" : ""}`}
                onClick={() => setStatusFilter("ALL")}
              >
                Tất cả <b>{approvalRequests.length}</b>
              </button>
              <button
                type="button"
                className={`stitch-seg-btn ${statusFilter === "Chờ phê duyệt" ? "active" : ""}`}
                onClick={() => setStatusFilter("Chờ phê duyệt")}
              >
                Chờ duyệt <b>{pendingCount}</b>
              </button>
              <button
                type="button"
                className={`stitch-seg-btn ${statusFilter === "Đã phê duyệt" ? "active" : ""}`}
                onClick={() => setStatusFilter("Đã phê duyệt")}
              >
                Đã duyệt <b>{approvedCount}</b>
              </button>
              <button
                type="button"
                className={`stitch-seg-btn ${statusFilter === "Đã tạo PO" ? "active" : ""}`}
                onClick={() => setStatusFilter("Đã tạo PO")}
              >
                Đã tạo PO <b>{poCreatedCount}</b>
              </button>
              <button
                type="button"
                className={`stitch-seg-btn ${showHidden ? "active" : ""}`}
                onClick={toggleShowHidden}
                title={showHidden ? "Đang hiển thị cả ĐNPD đã ẩn. Bấm để ẩn lại" : "Bấm để xem các ĐNPD đã ẩn"}
                style={{
                  background: showHidden ? "#fef3c7" : undefined,
                  color: showHidden ? "#92400e" : undefined,
                  borderColor: showHidden ? "#f59e0b" : undefined,
                  fontWeight: showHidden ? 700 : undefined,
                }}
              >
                {showHidden ? <Eye size={14} /> : <EyeOff size={14} />} Đã ẩn <b>{hiddenApprovalCount}</b>
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <label style={{ minWidth: 280, display: "inline-flex", alignItems: "center", gap: "6px", position: "relative" }}>
                <Search size={16} style={{ color: "var(--slate-400)", position: "absolute", left: "12px", pointerEvents: "none" }} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo số PR, tên nhà cung cấp, bộ phận, nội dung..."
                  style={{ paddingLeft: "36px" }}
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
              <span className="stitch-count-pill">
                Hiển thị <b>{filteredRequests.length}</b> phiếu ĐNPD
              </span>
            </div>
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
                  ? computeSupplierFinalTotal(req, selectedCol.colId)
                  : 0;
                const isDone = isApprovalCompleted(req);
                const flow = resolveDocFlow({ approval: req }, { prs, pos, approvalRequests });
                const canCreatePO = !isReportMode && (req.status === "Đã phê duyệt" || req.status === "Đã tạo PO");
                const ctxStatus = getApprovalContextualStatus(req, pos, paymentHandovers);

                return (
                  <article key={req.id} className={`${isDone ? "row-completed" : ""} ${isItemHidden(req) ? "row-hidden" : ""}`} style={isItemHidden(req) ? { opacity: 0.8, border: "1px dashed #f59e0b", background: "#fffdfa" } : undefined}>
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
                        {isItemHidden(req) && (
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#b45309",
                              background: "#fef3c7",
                              border: "1px solid #fde68a",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Đã ẩn
                          </span>
                        )}
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
                        <dd style={{ color: "#2B6DF8" }}>
                          {req.recommendedSupplierName || selectedCol?.supplierName || "Chưa chọn"}
                        </dd>
                      </div>
                      <div>
                        <dt>Tổng tiền {req.vatMode === "with_vat" ? "(Có VAT)" : "(Chưa VAT)"}</dt>
                        <dd style={{ color: "#0284c7" }}>
                          {selectedTotal > 0 ? `${formatVND(selectedTotal)} ₫` : "-"}
                          {req.vatMode === "with_vat" && (
                            <span style={{ fontSize: "10.5px", marginLeft: "4px", color: "#166534", fontWeight: 700 }}>
                              {req.vatCalculationType === "already_included" ? "(Đã gồm VAT)" : `(VAT ${req.vatRate ?? 10}%)`}
                            </span>
                          )}
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

                      {req.linkedPoNumber ? (
                        <button
                          type="button"
                          className="m-action-btn m-btn-success"
                          style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }}
                          onClick={() => {
                            const matched = pos.find((p) => p.number === req.linkedPoNumber || p.id === req.linkedPoId);
                            if (matched) {
                              onNavigate?.({ view: "po-detail", id: matched.id });
                            } else {
                              handleOpenPOCreateModal(req);
                            }
                          }}
                          title={`Phiếu này đã tạo đơn PO: ${req.linkedPoNumber}. Bấm để mở xem đơn hàng.`}
                        >
                          <PackageCheck size={17} />
                          <span>PO: {req.linkedPoNumber}</span>
                        </button>
                      ) : canCreatePO ? (
                        <button
                          type="button"
                          className="m-action-btn m-btn-success"
                          onClick={() => handleOpenPOCreateModal(req)}
                          title="Phát hành đơn mua hàng (PO) từ phiếu đã duyệt này"
                        >
                          <PackagePlus size={17} />
                          <span>Tạo PO</span>
                        </button>
                      ) : null}

                      {!isReportMode && (
                        <button
                          type="button"
                          className="m-action-btn"
                          onClick={() => handleToggleHideApproval(req.id)}
                          title={isItemHidden(req) ? "Hiện lại phiếu ĐNPD này" : "Ẩn phiếu ĐNPD này khỏi danh sách"}
                          style={{
                            color: isItemHidden(req) ? "#b45309" : "#64748b",
                            background: isItemHidden(req) ? "#fef3c7" : undefined,
                          }}
                        >
                          {isItemHidden(req) ? <Eye size={17} /> : <EyeOff size={17} />}
                          <span>{isItemHidden(req) ? "Hiện lại" : "Ẩn"}</span>
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

          <div className="pr-table" style={{ width: "100%", overflowX: "auto", overflowY: "visible", maxHeight: "none" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 145 }}>Số PR / Mã phiếu</th>
                  <th style={{ width: 110 }}>Ngày lập</th>
                  <th style={{ width: 130, textAlign: "center" }}>Quy mô đánh giá</th>
                  <th style={{ width: 240 }}>NCC đề xuất lựa chọn</th>
                  <th style={{ width: 155, textAlign: "right" }}>
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
                      colSpan={7}
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
                      ? computeSupplierFinalTotal(req, selectedCol.colId)
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
                              onMouseEnter={(e) => handlePrMouseEnter(e, req)}
                              onMouseLeave={handlePrMouseLeave}
                            >
                              {req.prNumber || req.requestNumber}
                            </button>
                            {isItemHidden(req) && (
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  color: "#b45309",
                                  background: "#fef3c7",
                                  border: "1px solid #fde68a",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Đã ẩn
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{getApprovalDisplayDate(req.createdDate, req.id)}</td>
                        <td className="center">
                          <span className="scale-pill">
                            {req.supplierColumns.length} NCC · {req.rows.length} mục
                          </span>
                        </td>
                        <td>
                          <span style={{ color: "#0f172a", fontSize: "13px", fontWeight: 400 }}>
                            {req.recommendedSupplierName ||
                              selectedCol?.supplierName ||
                              "Chưa chọn"}
                          </span>
                        </td>
                        <td className="money">
                          {selectedTotal > 0 ? (
                            <div>
                              <div>{`${formatVND(selectedTotal)} ₫`}</div>
                              <small style={{ fontSize: "11px", color: "#0f172a", fontWeight: 400 }}>
                                {req.vatMode === "with_vat" ? (req.vatCalculationType === "already_included" ? "Đã gồm VAT" : `Có VAT (${req.vatRate ?? 10}%)`) : "Chưa VAT"}
                              </small>
                            </div>
                          ) : "-"}
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
                              className="stitch-action-pill pill-navy"
                              onClick={() => setActiveApprovalId(req.id)}
                              title="Mở xem chi tiết phiếu Đề nghị phê duyệt"
                            >
                              <span>Mở phiếu</span>
                              <ArrowRight size={13} />
                            </button>
                            {!isReportMode &&
                              (req.status === "Đã phê duyệt" ||
                                req.status === "Đã tạo PO") && (
                                <button
                                  type="button"
                                  className="stitch-action-pill pill-navy"
                                  onClick={() => {
                                    handleOpenPOCreateModal(req);
                                  }}
                                  title="Phát hành đơn mua hàng (PO) từ phiếu đã duyệt này"
                                >
                                  <PackagePlus size={13} />
                                  <span>Tạo PO</span>
                                </button>
                              )}
                            {!isReportMode && (
                              <button
                                type="button"
                                className="btn-icon"
                                onClick={() => handleToggleHideApproval(req.id)}
                                title={isItemHidden(req) ? "Hiện lại phiếu ĐNPD này" : "Ẩn phiếu ĐNPD này khỏi bảng"}
                                style={{ color: isItemHidden(req) ? "#d97706" : "#64748b" }}
                              >
                                {isItemHidden(req) ? <Eye size={15} /> : <EyeOff size={15} />}
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

        {/* Hover Popover hiển thị Bảng danh mục hàng khi di chuột vào số ĐNPD */}
        {hoveredApproval && typeof document !== "undefined" && createPortal(
          <div
            style={{
              position: "fixed",
              top: hoveredApproval.top,
              left: hoveredApproval.left,
              width: "580px",
              maxHeight: "380px",
              backgroundColor: "#ffffff",
              borderRadius: "10px",
              boxShadow: "0 14px 35px -4px rgba(15, 23, 42, 0.22), 0 6px 14px -3px rgba(15, 23, 42, 0.12)",
              border: "1px solid #cbd5e1",
              zIndex: 99999,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            }}
            onMouseLeave={handlePrMouseLeave}
          >
            {(() => {
              const hReq = hoveredApproval.req;
              const hCol = hReq.supplierColumns.find((c) => c.isSelected) || hReq.supplierColumns[0];
              const hTotal = hCol ? computeSupplierFinalTotal(hReq, hCol.colId) : 0;
              const supplierName = hReq.recommendedSupplierName || hCol?.supplierName || "Chưa chọn NCC";

              return (
                <>
                  <div
                    style={{
                      padding: "10px 14px",
                      backgroundColor: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "#0f172a",
                            backgroundColor: "#f1f5f9",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {hReq.prNumber || hReq.requestNumber}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                          Danh mục hàng hóa ({hReq.rows.length} mục)
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        NCC đề xuất: <span style={{ color: "#0f172a", fontWeight: 600 }}>{supplierName}</span>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "12px",
                        backgroundColor: "#f1f5f9",
                        color: "#475569",
                      }}
                    >
                      {hReq.createdDate}
                    </span>
                  </div>

                  {/* Table Container */}
                  <div style={{ maxHeight: "250px", overflowY: "auto", overflowX: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr
                          style={{
                            backgroundColor: "#f1f5f9",
                            color: "#475569",
                            fontSize: "11px",
                            fontWeight: 700,
                            position: "sticky",
                            top: 0,
                            zIndex: 2,
                            borderBottom: "1px solid #cbd5e1",
                          }}
                        >
                          <th style={{ padding: "6px 8px", width: "36px", textAlign: "center" }}>STT</th>
                          <th style={{ padding: "6px 10px", textAlign: "left" }}>TÊN HÀNG HÓA</th>
                          <th style={{ padding: "6px 8px", width: "55px", textAlign: "center" }}>ĐVT</th>
                          <th style={{ padding: "6px 8px", width: "55px", textAlign: "right" }}>SL</th>
                          <th style={{ padding: "6px 10px", width: "95px", textAlign: "right" }}>ĐƠN GIÁ</th>
                          <th style={{ padding: "6px 10px", width: "105px", textAlign: "right" }}>THÀNH TIỀN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hReq.rows.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                              Phiếu chưa có mặt hàng nào.
                            </td>
                          </tr>
                        ) : (
                          hReq.rows.map((row, idx) => {
                            const lines = hCol ? row.supplierQuotes[hCol.colId] || [] : [];
                            const line = lines[0];
                            const unitPrice = Number(line?.unitPrice) || 0;
                            const qty = row.qty || 1;
                            const amount = unitPrice > 0 ? unitPrice * qty : (Number(line?.amount) || 0);

                            return (
                              <tr
                                key={row.rowId || idx}
                                style={{
                                  borderBottom: "1px solid #f1f5f9",
                                  backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fbfcfe",
                                }}
                              >
                                <td style={{ padding: "6px 8px", textAlign: "center", color: "#64748b" }}>
                                  {row.stt || idx + 1}
                                </td>
                                <td style={{ padding: "6px 10px", textAlign: "left" }}>
                                  <div style={{ fontWeight: 400, color: "#0f172a" }}>
                                    {row.itemName}
                                  </div>
                                  {row.spec && (
                                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                                      {row.spec}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "center", color: "#475569" }}>
                                  {row.unit || "—"}
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 400, color: "#0f172a" }}>
                                  {qty}
                                </td>
                                <td style={{ padding: "6px 10px", textAlign: "right", color: "#334155", fontVariantNumeric: "tabular-nums" }}>
                                  {unitPrice > 0 ? `${formatVND(unitPrice)} ₫` : "—"}
                                </td>
                                <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 400, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
                                  {amount > 0 ? `${formatVND(amount)} ₫` : "—"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Popover Footer */}
                  <div
                    style={{
                      padding: "8px 14px",
                      backgroundColor: "#f8fafc",
                      borderTop: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ color: "#64748b" }}>
                      Trạng thái: <b style={{ color: "#0f172a" }}>{hReq.status}</b>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "#64748b" }}>Tổng tiền:</span>
                      <b style={{ color: "#0f172a", fontSize: "13px" }}>
                        {hTotal > 0 ? `${formatVND(hTotal)} ₫` : "—"}
                      </b>
                      <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                        ({hReq.vatMode === "with_vat" ? "Có VAT" : "Chưa VAT"})
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>,
          document.body
        )}

        {/* Modal Chọn PR khi tạo từ So sánh giá hoặc tạo từ PR */}
        {sourceModalMode && renderPRSourceModal()}

        {/* Modal Chọn VAT khi tạo PO từ Danh sách */}
        {poCreateModalReq && renderPOCreateModal()}
      </section>
    );
  }

  // =========================================================================
  // BẢN IN A4 WYSIWYG TRỰC QUAN (GIỐNG 100% PHIẾU IN, CHỈNH SỬA TRỰC TIẾP TRÊN TRANG)
  // =========================================================================
  const renderWYSIWYGPaperWorkspace = () => {
    if (!activeRequest) return null;

    return (
      <div className="a4-paper-workspace-wrapper no-print">
        {hasUnsavedChanges && (
          <div
            className="no-print"
            style={{
              maxWidth: activeRequest.printOrientation === "landscape" ? "297mm" : "210mm",
              margin: "0 auto 12px auto",
              padding: "10px 16px",
              backgroundColor: "#fff7ed",
              border: "1.5px solid #fb923c",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 4px 14px rgba(234, 88, 12, 0.15)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#9a3412" }}>
              <span style={{ fontSize: "18px" }}>💾</span>
              <div>
                <strong>Có thay đổi chưa lưu trên ĐNPD này!</strong>
                <div style={{ fontSize: "11px", color: "#c2410c", marginTop: "1px" }}>
                  Hệ thống không tự động lưu dữ liệu đang gõ. Hãy bấm nút &quot;Lưu ĐNPD&quot; hoặc ấn phím <strong>Ctrl + S</strong> để lưu lại.
                </div>
              </div>
            </div>
            <button
              type="button"
              style={{
                backgroundColor: "#ea580c",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                padding: "7px 16px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 6px rgba(234, 88, 12, 0.4)",
              }}
              onClick={handleExplicitSave}
            >
              <Save size={15} /> Lưu ĐNPD ngay
            </button>
          </div>
        )}
        {/* Scoped CSS chống tràn và ép khít 100% khổ giấy cho màn hình soạn thảo A4 */}
        <style>{`
          .a4-paper-canvas {
            box-sizing: border-box !important;
          }
          .a4-paper-canvas table.phenikaa-print-grid {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            box-sizing: border-box !important;
            margin: 0 !important;
          }
          .a4-paper-canvas table.phenikaa-print-grid th {
            box-sizing: border-box !important;
            min-width: 0 !important;
            overflow: visible !important;
          }
          .a4-paper-canvas table.phenikaa-print-grid td {
            box-sizing: border-box !important;
            min-width: 0 !important;
            overflow: hidden !important;
          }
          .a4-paper-canvas table.phenikaa-print-grid th.col-sub-spec,
          .a4-paper-canvas table.phenikaa-print-grid th.col-sub-price,
          .a4-paper-canvas table.phenikaa-print-grid th.col-sub-qty,
          .a4-paper-canvas table.phenikaa-print-grid th.col-sub-amount,
          .a4-paper-canvas table.phenikaa-print-grid th.col-supplier-group {
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            line-height: 1.18 !important;
            text-align: center !important;
          }
          .a4-paper-canvas table.phenikaa-print-grid th *,
          .a4-paper-canvas table.phenikaa-print-grid td * {
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          .a4-paper-canvas table.phenikaa-print-grid .cell-sub-price,
          .a4-paper-canvas table.phenikaa-print-grid .cell-sub-amount,
          .a4-paper-canvas table.phenikaa-print-grid .cell-right {
            white-space: nowrap !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
            text-align: right !important;
            font-variant-numeric: tabular-nums !important;
          }
        `}</style>
        <div
          className={`a4-paper-canvas ${
            activeRequest.printOrientation === "landscape"
              ? "a4-landscape"
              : "a4-portrait"
          }`}
        >
          {/* 1. Header Công ty + Tiêu đề Biểu mẫu */}
          <table className="phenikaa-header-table" data-react-managed="true" style={{ display: "table" }}>
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

          {/* 2. Khung Thông tin căn cứ 4 dòng dọc */}
          <div className="phenikaa-meta-lines">
            <div className="phenikaa-meta-line">
              <span className="meta-lbl">Số PR:</span>
              <input
                type="text"
                className="sheet-inline-input meta-inline-input"
                value={activeRequest.prNumber || ""}
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    prNumber: e.target.value,
                  }))
                }
                placeholder="Số PR..."
              />
            </div>
            <div className="phenikaa-meta-line">
              <span className="meta-lbl">Ngày:</span>
              <input
                type="text"
                className="sheet-inline-input meta-inline-input"
                value={activeRequest.createdDate || ""}
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    createdDate: e.target.value,
                  }))
                }
                placeholder="DD/MM/YYYY"
              />
            </div>
            <div className="phenikaa-meta-line">
              <span className="meta-lbl">Đơn vị lập biểu mẫu:</span>
              <input
                type="text"
                className="sheet-inline-input meta-inline-input"
                value={activeRequest.department || ""}
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    department: e.target.value,
                  }))
                }
                placeholder="Đơn vị lập biểu mẫu..."
              />
            </div>
            <div className="phenikaa-meta-line" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="meta-lbl">Căn cứ theo PR số:</span>
              <input
                type="text"
                className="sheet-inline-input meta-inline-input"
                style={{ flex: 1 }}
                value={
                  activeRequest.noteRef !== undefined
                    ? activeRequest.noteRef
                    : activeRequest.prNumber || ""
                }
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    noteRef: e.target.value,
                  }))
                }
                placeholder="Nhập hoặc chọn PR bên cạnh..."
              />
              {!isReportMode && prs && prs.length > 0 && (
                <select
                  className="no-print"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#0369a1",
                    backgroundColor: "#f0f9ff",
                    border: "1px solid #bae6fd",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    cursor: "pointer",
                    maxWidth: "240px",
                  }}
                  value=""
                  onChange={(e) => {
                    const prNum = e.target.value;
                    if (!prNum) return;
                    const targetPR = prs.find((p) => p.number === prNum);
                    if (!targetPR) return;

                    updateActive((prev) => {
                      let nextRows = prev.rows;
                      if (targetPR.items && targetPR.items.length > 0) {
                        nextRows = targetPR.items.map((it, idx) => {
                          const rowId = `row_${Date.now()}_${idx + 1}`;
                          const supplierQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
                          prev.supplierColumns.forEach((col) => {
                            supplierQuotes[col.colId] = [
                              {
                                lineId: `line_${rowId}_${col.colId}_1`,
                                quotedProduct: it.name || "",
                                origin: "",
                                unitPrice: 0,
                                qty: Number(it.qty) || 1,
                                amount: 0,
                              },
                            ];
                          });
                          return {
                            rowId,
                            stt: idx + 1,
                            itemName: it.name || "",
                            qty: Number(it.qty) || 1,
                            unit: it.unit || "Cái",
                            supplierQuotes,
                          };
                        });
                      }

                      const dept = targetPR.department || prev.department || "RD";
                      const newSectionTitle = `Theo yêu cầu mua hàng phục vụ công việc của phòng ${dept} . Phòng Cung Ứng đã tìm kiếm, đánh giá và đề xuất phương án như sau:`;

                      return {
                        ...prev,
                        prNumber: prev.prNumber || targetPR.number,
                        noteRef: targetPR.number,
                        prId: targetPR.id,
                        department: targetPR.department || prev.department,
                        requestingDepartment: targetPR.department || prev.requestingDepartment,
                        section1Title: newSectionTitle,
                        rows: nextRows,
                      };
                    });

                    showToast(
                      `✨ Đã tự động nạp ${targetPR.items?.length || 0} mặt hàng & phòng ban từ PR ${targetPR.number}!`
                    );
                  }}
                  title="Chọn PR để tự động nạp danh sách hàng hóa và phòng ban"
                >
                  <option value="">▼ Chọn từ danh sách PR ({prs.length})</option>
                  {prs.map((p) => (
                    <option key={p.id} value={p.number}>
                      {p.number} {p.department ? `(${p.department})` : ""} - {p.items?.length || 0} mục
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* 3. Phần I & Bảng So Sánh Báo Giá */}
          <div className="phenikaa-section-block">
            <div className="phenikaa-section-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
              <span>I. Nội dung đề nghị phê duyệt:</span>
              {!isReportMode && (
                <div className="no-print" style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={{
                      border: "1px solid #cbd5e1",
                      background: activeRequest.printOrientation === "landscape" ? "#eff6ff" : "#ffffff",
                      color: activeRequest.printOrientation === "landscape" ? "#1d4ed8" : "#334155",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    onClick={() => {
                      const nextOrient = activeRequest.printOrientation === "landscape" ? "portrait" : "landscape";
                      updateActive((prev) => ({
                        ...prev,
                        printOrientation: nextOrient,
                      }));
                      showToast(`✨ Đã đổi sang khổ giấy: ${nextOrient === "landscape" ? "A4 Ngang" : "A4 Dọc"}`);
                    }}
                    title="Chuyển đổi giữa khổ in A4 Dọc và A4 Ngang"
                  >
                    {activeRequest.printOrientation === "landscape" ? "🖼️ A4 Ngang" : "📄 A4 Dọc"}
                  </button>
                  <button
                    type="button"
                    style={{
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#475569",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    onClick={() => {
                      const numSups = Math.max(1, activeRequest.supplierColumns.length || 1);
                      const freshWidths = computeApprovalColumnWidths(numSups, hasQuotedProduct, hasSupplierQty);
                      updateActive((prev) => ({
                        ...prev,
                        columnWidths: freshWidths,
                      }));
                      showToast("✨ Đã tự động căn khít 100% lề giấy!");
                    }}
                    title="Khôi phục độ rộng chuẩn, căn khít 100% lề giấy A4"
                  >
                    ↺ Khóa khít 100%
                  </button>
                  <button
                    type="button"
                    style={{
                      border: "1px dashed #2563eb",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    onClick={handleAddSupplierColumn}
                    title="Thêm cột Nhà cung cấp mới để so sánh giá"
                  >
                    ＋ Thêm cột NCC ({activeRequest.supplierColumns.length})
                  </button>
                  <button
                    type="button"
                    style={{
                      border: "1px dashed #16a34a",
                      background: "#f0fdf4",
                      color: "#15803d",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    onClick={handleAddRow}
                    title="Thêm dòng vật tư mới"
                  >
                    ＋ Thêm dòng vật tư ({activeRequest.rows.length})
                  </button>
                </div>
              )}
            </div>
            <div className="phenikaa-section-subline" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="text"
                className="sheet-inline-input"
                style={{ fontWeight: 400, flex: 1 }}
                value={activeRequest.section1Title || ""}
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    section1Title: e.target.value,
                  }))
                }
                placeholder="Theo yêu cầu mua hàng..."
              />
              {!isReportMode && (
                <select
                  className="no-print"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#475569",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  value=""
                  onChange={(e) => {
                    const dept = e.target.value;
                    if (!dept) return;
                    updateActive((prev) => ({
                      ...prev,
                      requestingDepartment: dept,
                      section1Title: `Theo yêu cầu mua hàng phục vụ công việc của phòng ${dept} . Phòng Cung Ứng đã tìm kiếm, đánh giá và đề xuất phương án như sau:`,
                    }));
                  }}
                  title="Chọn phòng ban để tự động cập nhật câu đề nghị"
                >
                  <option value="">▼ Đổi phòng ban</option>
                  {["RD", "Cơ điện", "QA", "QC", "Sản xuất", "Kế hoạch", "Kho vận", "Hành chính", "IT", "Cung ứng"].map((d) => (
                    <option key={d} value={d}>
                      Phòng {d}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <table
              className="phenikaa-print-grid"
              data-react-managed="true"
              style={{
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "collapse",
                boxSizing: "border-box",
                margin: 0,
              }}
            >
              {renderTableColGroup()}
              <thead>
                <tr>
                  <th rowSpan={2} className="col-stt" style={{ width: `${columnWidths[0]}%`, position: "relative", zIndex: 50, overflow: "visible" }}>
                    <span>STT</span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColIndex === 0 ? "active" : ""}`}
                        onMouseDown={(e) => handleResizeStart(0, e)}
                        title="Kéo sang trái/phải để điều chỉnh độ rộng cột STT"
                      />
                    )}
                  </th>
                  <th rowSpan={2} className="col-item-name" style={{ width: `${columnWidths[1]}%`, position: "relative", zIndex: 49, overflow: "visible" }}>
                    <span>Hàng hóa</span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColIndex === 1 ? "active" : ""}`}
                        onMouseDown={(e) => handleResizeStart(1, e)}
                        title="Kéo sang trái/phải để điều chỉnh độ rộng cột Hàng hóa"
                      />
                    )}
                  </th>
                  <th rowSpan={2} className="col-qty" style={{ width: `${columnWidths[2]}%`, position: "relative", zIndex: 48, overflow: "visible" }}>
                    <span>Số<br />lượng</span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColIndex === 2 ? "active" : ""}`}
                        onMouseDown={(e) => handleResizeStart(2, e)}
                        title="Kéo sang trái/phải để điều chỉnh độ rộng cột Số lượng"
                      />
                    )}
                  </th>
                  <th rowSpan={2} className="col-unit" style={{ width: `${columnWidths[3]}%`, position: "relative", zIndex: 47, overflow: "visible" }}>
                    <span>ĐVT</span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColIndex === 3 ? "active" : ""}`}
                        onMouseDown={(e) => handleResizeStart(3, e)}
                        title="Kéo sang trái/phải để điều chỉnh độ rộng cột ĐVT"
                      />
                    )}
                  </th>
                  {activeRequest.supplierColumns.map((sc, sIdx) => {
                    const lastSubColIdx = 4 + (sIdx + 1) * subColCountPerSupplier - 1;
                    const supTotalWidth = Array.from(
                      { length: subColCountPerSupplier },
                      (_, k) => columnWidths[4 + sIdx * subColCountPerSupplier + k] || 0
                    ).reduce((a, b) => a + b, 0);
                    return (
                      <th
                        key={`w_head_${sc.colId}`}
                        colSpan={subColCountPerSupplier}
                        className={`col-supplier-group ${sc.isSelected ? "selected-supplier-th" : ""}`}
                        style={{
                          width: `${supTotalWidth}%`,
                          backgroundColor: sc.isSelected ? "#f0fdf4" : undefined,
                          borderTop: sc.isSelected ? "2.5px solid #16a34a" : undefined,
                          position: "relative",
                          zIndex: 40 - sIdx,
                          padding: "2px 2px",
                          overflow: "visible",
                          verticalAlign: "middle",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "stretch", width: "100%", minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minWidth: 0, gap: "2px" }}>
                            {sc.isSelected ? (
                              <span style={{ fontSize: "9px", color: "#16a34a", fontWeight: 800, whiteSpace: "nowrap" }}>
                                ★ NCC chọn
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="no-print"
                                style={{
                                  fontSize: "9px",
                                  color: "#2563eb",
                                  background: "#eff6ff",
                                  border: "1px solid #bfdbfe",
                                  borderRadius: "3px",
                                  padding: "1px 4px",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  lineHeight: "1.2",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectSupplierCol(sc.colId);
                                }}
                                title="Chọn nhà cung cấp này trúng thầu"
                              >
                                Chọn NCC này
                              </button>
                            )}
                            {!isReportMode && activeRequest.supplierColumns.length > 1 && (
                              <button
                                type="button"
                                className="no-print"
                                style={{
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#dc2626",
                                  borderRadius: "3px",
                                  fontSize: "10px",
                                  width: "14px",
                                  height: "14px",
                                  cursor: "pointer",
                                  lineHeight: "12px",
                                  marginLeft: "auto",
                                  padding: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSupplierColumn(sc.colId);
                                }}
                                title="Xóa cột NCC này"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          <PaperSupplierHeaderCombobox
                            column={sc}
                            suppliers={suppliers}
                            isReportMode={isReportMode}
                            onUpdate={({ shortName, supplierName, supplierId }) => {
                              updateActive((prev) => ({
                                ...prev,
                                supplierColumns: prev.supplierColumns.map((c) =>
                                  c.colId === sc.colId
                                    ? { ...c, shortName, supplierName, supplierId }
                                    : c
                                ),
                                recommendedSupplierName:
                                  sc.isSelected && supplierName ? supplierName : prev.recommendedSupplierName,
                              }));
                            }}
                          />
                        </div>
                        {!isReportMode && sIdx < activeRequest.supplierColumns.length - 1 && (
                          <div
                            className={`col-resizer-handle no-print ${resizingColIndex === lastSubColIdx ? "active" : ""}`}
                            onMouseDown={(e) => handleResizeStart(lastSubColIdx, e)}
                            title="Kéo sang trái/phải để điều chỉnh ranh giới giữa 2 Nhà cung cấp"
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {activeRequest.supplierColumns.map((sc, sIdx) => {
                    const baseIdx = 4 + sIdx * subColCountPerSupplier;
                    let offset = 0;
                    return (
                      <React.Fragment key={`w_sub_${sc.colId}`}>
                        {hasQuotedProduct && (() => {
                          const colIdx = baseIdx + offset++;
                          return (
                            <th className="col-sub-spec" style={{ width: `${columnWidths[colIdx]}%`, position: "relative", zIndex: 40 - colIdx, overflow: "visible", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.15, textAlign: "center" }}>
                              <span>{renderQuotedProductHeaderNode(quotedProductTitle)}</span>
                              {!isReportMode && colIdx < columnWidths.length - 1 && (
                                <div
                                  className={`col-resizer-handle no-print ${resizingColIndex === colIdx ? "active" : ""}`}
                                  onMouseDown={(e) => handleResizeStart(colIdx, e)}
                                  title="Kéo sang trái/phải để điều chỉnh độ rộng cột Mặt hàng NCC báo"
                                />
                              )}
                            </th>
                          );
                        })()}
                        {(() => {
                          const colIdx = baseIdx + offset++;
                          return (
                            <th className="col-sub-price" style={{ width: `${columnWidths[colIdx]}%`, position: "relative", zIndex: 40 - colIdx, overflow: "visible", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.15, textAlign: "center" }}>
                              <span>Đơn giá<br />(VNĐ)</span>
                              {!isReportMode && colIdx < columnWidths.length - 1 && (
                                <div
                                  className={`col-resizer-handle no-print ${resizingColIndex === colIdx ? "active" : ""}`}
                                  onMouseDown={(e) => handleResizeStart(colIdx, e)}
                                  title="Kéo sang trái/phải để điều chỉnh độ rộng cột Đơn giá"
                                />
                              )}
                            </th>
                          );
                        })()}
                        {hasSupplierQty && (() => {
                          const colIdx = baseIdx + offset++;
                          return (
                            <th className="col-sub-qty" style={{ width: `${columnWidths[colIdx]}%`, position: "relative", zIndex: 40 - colIdx, overflow: "visible", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.15, textAlign: "center" }}>
                              <span>Số<br />lượng</span>
                              {!isReportMode && colIdx < columnWidths.length - 1 && (
                                <div
                                  className={`col-resizer-handle no-print ${resizingColIndex === colIdx ? "active" : ""}`}
                                  onMouseDown={(e) => handleResizeStart(colIdx, e)}
                                  title="Kéo sang trái/phải để điều chỉnh độ rộng cột Số lượng của NCC"
                                />
                              )}
                            </th>
                          );
                        })()}
                        {(() => {
                          const colIdx = baseIdx + offset++;
                          return (
                            <th className="col-sub-amount" style={{ width: `${columnWidths[colIdx]}%`, position: "relative", zIndex: 40 - colIdx, overflow: "visible", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.15, textAlign: "center" }}>
                              <span>Thành<br />tiền</span>
                              {!isReportMode && colIdx < columnWidths.length - 1 && (
                                <div
                                  className={`col-resizer-handle no-print ${resizingColIndex === colIdx ? "active" : ""}`}
                                  onMouseDown={(e) => handleResizeStart(colIdx, e)}
                                  title="Kéo sang trái/phải để điều chỉnh độ rộng cột Thành tiền"
                                />
                              )}
                            </th>
                          );
                        })()}
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {activeRequest.rows.map((row, rIdx) => {
                  const maxSubLines = hasSupplierQty
                    ? Math.max(
                        1,
                        ...activeRequest.supplierColumns.map(
                          (sc) => (row.supplierQuotes[sc.colId] || []).length
                        )
                      )
                    : 1;

                  return Array.from({ length: maxSubLines }, (_, subIdx) => (
                    <tr key={`w_row_${row.rowId}_${subIdx}`}>
                      {subIdx === 0 && (
                        <>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-stt"
                            style={{ position: "relative", verticalAlign: "top", paddingTop: "4px", paddingLeft: "1px", paddingRight: "1px", overflow: "hidden" }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", minWidth: 0 }}>
                              <span style={{ fontWeight: 700, fontSize: "9pt", lineHeight: 1 }}>{row.stt}</span>
                              {!isReportMode && (
                                <div className="no-print" style={{ display: "flex", gap: "1px", marginTop: "2px" }}>
                                  <button
                                    type="button"
                                    style={{
                                      border: "none",
                                      background: "#fee2e2",
                                      color: "#dc2626",
                                      borderRadius: "2px",
                                      fontSize: "9px",
                                      width: "12px",
                                      height: "12px",
                                      cursor: "pointer",
                                      lineHeight: "10px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: 0,
                                      fontWeight: 700,
                                      flexShrink: 0,
                                    }}
                                    onClick={() => handleRemoveRow(row.rowId)}
                                    title={activeRequest.rows.length <= 1 ? "Xóa sạch dữ liệu dòng này" : "Xóa dòng này"}
                                  >
                                    ×
                                  </button>
                                  <button
                                    type="button"
                                    style={{
                                      border: "none",
                                      background: "#eff6ff",
                                      color: "#2563eb",
                                      borderRadius: "2px",
                                      fontSize: "9px",
                                      width: "12px",
                                      height: "12px",
                                      cursor: "pointer",
                                      lineHeight: "10px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: 0,
                                      fontWeight: 700,
                                      flexShrink: 0,
                                    }}
                                    onClick={() => handleInsertRowAfter(rIdx)}
                                    title="Chèn thêm dòng ngay bên dưới"
                                  >
                                    ＋
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-left cell-item-name"
                          >
                            <SheetCellTextarea
                              value={row.itemName}
                              readOnly={isReportMode}
                              placeholder="Tên hàng hóa / vật tư..."
                              onChange={(val) =>
                                handleUpdateFixedRow(rIdx, "itemName", val)
                              }
                              onPaste={(e) => handleCellPaste(e, rIdx, 1)}
                            />
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-qty"
                          >
                            <input
                              type="text"
                              className="sheet-inline-input center"
                              value={row.qty || ""}
                              readOnly={isReportMode}
                              onChange={(e) =>
                                handleUpdateFixedRow(rIdx, "qty", e.target.value)
                              }
                              onPaste={(e) => handleCellPaste(e, rIdx, 2)}
                              placeholder="1"
                            />
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-unit"
                          >
                            <input
                              type="text"
                              className="sheet-inline-input center"
                              value={row.unit}
                              readOnly={isReportMode}
                              onChange={(e) =>
                                handleUpdateFixedRow(rIdx, "unit", e.target.value)
                              }
                              onPaste={(e) => handleCellPaste(e, rIdx, 3)}
                              placeholder="ĐVT"
                            />
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
                          const amt = (Number(line.unitPrice) || 0) * effQty;

                          return (
                            <React.Fragment key={`w_span_${row.rowId}_${sc.colId}`}>
                              {hasQuotedProduct && (
                                <td
                                  rowSpan={maxSubLines}
                                  className="cell-left cell-sub-spec"
                                >
                                  <SheetCellTextarea
                                    value={line.quotedProduct || line.origin || ""}
                                    readOnly={isReportMode}
                                    placeholder="Quy cách/hãng..."
                                    onChange={(val) =>
                                      handleUpdateSupplierLine(
                                        rIdx,
                                        sc.colId,
                                        0,
                                        "quotedProduct",
                                        val
                                      )
                                    }
                                    onPaste={(e) =>
                                      handleCellPaste(
                                        e,
                                        rIdx,
                                        getSupplierFlatColIndex(sc.colId, "quotedProduct"),
                                        0
                                      )
                                    }
                                  />
                                </td>
                              )}
                              <td
                                rowSpan={maxSubLines}
                                className="cell-right cell-sub-price"
                              >
                                <input
                                  type="text"
                                  className="sheet-inline-input right"
                                  style={{ fontWeight: 600 }}
                                  value={line.unitPrice ? formatVND(line.unitPrice) : ""}
                                  readOnly={isReportMode}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rIdx,
                                      sc.colId,
                                      0,
                                      "unitPrice",
                                      e.target.value
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rIdx,
                                      getSupplierFlatColIndex(sc.colId, "unitPrice"),
                                      0
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
                                    className="sheet-inline-input center"
                                    value={line.qty || ""}
                                    readOnly={isReportMode}
                                    placeholder="1"
                                    onChange={(e) =>
                                      handleUpdateSupplierLine(
                                        rIdx,
                                        sc.colId,
                                        0,
                                        "qty",
                                        e.target.value
                                      )
                                    }
                                    onPaste={(e) =>
                                      handleCellPaste(
                                        e,
                                        rIdx,
                                        getSupplierFlatColIndex(sc.colId, "qty"),
                                        0
                                      )
                                    }
                                  />
                                </td>
                              )}
                              <td
                                rowSpan={maxSubLines}
                                className="cell-right cell-sub-amount"
                                style={{ fontWeight: 600 }}
                              >
                                {amt ? formatVND(amt) : "-"}
                              </td>
                            </React.Fragment>
                          );
                        }

                        const line = lines[subIdx];
                        if (!line) {
                          return (
                            <React.Fragment key={`w_empty_${row.rowId}_${sc.colId}_${subIdx}`}>
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

                        return (
                          <React.Fragment key={`w_cell_${row.rowId}_${sc.colId}_${subIdx}`}>
                            {hasQuotedProduct && (
                              <td className="cell-left cell-sub-spec">
                                <SheetCellTextarea
                                  value={line.quotedProduct || line.origin || ""}
                                  readOnly={isReportMode}
                                  placeholder="Quy cách/hãng..."
                                  onChange={(val) =>
                                    handleUpdateSupplierLine(
                                      rIdx,
                                      sc.colId,
                                      subIdx,
                                      "quotedProduct",
                                      val
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rIdx,
                                      getSupplierFlatColIndex(sc.colId, "quotedProduct"),
                                      subIdx
                                    )
                                  }
                                />
                              </td>
                            )}
                            <td className="cell-right cell-sub-price">
                              <input
                                type="text"
                                className="sheet-inline-input right"
                                style={{ fontWeight: 600 }}
                                value={line.unitPrice ? formatVND(line.unitPrice) : ""}
                                readOnly={isReportMode}
                                placeholder="0"
                                onChange={(e) =>
                                  handleUpdateSupplierLine(
                                    rIdx,
                                    sc.colId,
                                    subIdx,
                                    "unitPrice",
                                    e.target.value
                                  )
                                }
                                onPaste={(e) =>
                                  handleCellPaste(
                                    e,
                                    rIdx,
                                    getSupplierFlatColIndex(sc.colId, "unitPrice"),
                                    subIdx
                                  )
                                }
                              />
                            </td>
                            {hasSupplierQty && (
                              <td className="cell-center cell-sub-qty">
                                <input
                                  type="text"
                                  className="sheet-inline-input center"
                                  value={line.qty || ""}
                                  readOnly={isReportMode}
                                  placeholder="1"
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rIdx,
                                      sc.colId,
                                      subIdx,
                                      "qty",
                                      e.target.value
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rIdx,
                                      getSupplierFlatColIndex(sc.colId, "qty"),
                                      subIdx
                                    )
                                  }
                                />
                              </td>
                            )}
                            <td
                              className="cell-right cell-sub-amount"
                              style={{ fontWeight: 600 }}
                            >
                              {amt ? formatVND(amt) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ));
                })}

                {/* Dòng thêm mới vật tư trên màn hình */}
                {!isReportMode && (
                  <tr className="no-print">
                    <td
                      colSpan={
                        4 +
                        activeRequest.supplierColumns.length * subColCountPerSupplier
                      }
                      style={{
                        textAlign: "left",
                        padding: "5px 8px",
                        background: "#f8fafc",
                        borderTop: "1px dashed #cbd5e1",
                      }}
                    >
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", width: "100%", minWidth: 0 }}>
                        <button
                          type="button"
                          style={{
                            border: "1px dashed #2563eb",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            borderRadius: "4px",
                            padding: "3px 10px",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                          }}
                          onClick={handleAddRow}
                        >
                          ＋ Thêm dòng vật tư / hàng hóa
                        </button>
                        <button
                          type="button"
                          style={{
                            border: "1px dashed #64748b",
                            background: "#ffffff",
                            color: "#334155",
                            borderRadius: "4px",
                            padding: "3px 8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          onClick={handleAddSupplierColumn}
                        >
                          ＋ Thêm cột NCC
                        </button>
                        <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "auto", whiteSpace: "nowrap" }}>
                          (Tổng: <strong>{activeRequest.rows.length}</strong> mặt hàng | <strong>{activeRequest.supplierColumns.length}</strong> NCC)
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {activeRequest.showDeliveryTimeRow && (
                  <tr>
                    <td />
                    <td colSpan={3} className="cell-center bold-cell">
                      Thời gian giao hàng
                    </td>
                    {activeRequest.supplierColumns.map((sc) => (
                      <td
                        key={`w_deliv_${sc.colId}`}
                        colSpan={subColCountPerSupplier}
                        className="cell-center bold-cell"
                      >
                        <input
                          type="text"
                          className="sheet-inline-input center"
                          value={sc.deliveryTime || ""}
                          readOnly={isReportMode}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateActive((prev) => ({
                              ...prev,
                              supplierColumns: prev.supplierColumns.map((c) =>
                                c.colId === sc.colId ? { ...c, deliveryTime: val } : c
                              ),
                            }));
                          }}
                          placeholder="Thời gian giao..."
                        />
                      </td>
                    ))}
                  </tr>
                )}

                {/* Dòng tổng tiền: Phản ánh đúng Chưa VAT hoặc Có VAT */}
                {activeRequest.vatMode !== "with_vat" ? (
                  <tr className="total-footer-row">
                    <td colSpan={4} className="cell-center bold-cell">
                      Tổng tiền chưa có VAT
                    </td>
                    {activeRequest.supplierColumns.map((sc) => {
                      const totalVal = supplierSubtotals[sc.colId] || 0;
                      return (
                        <React.Fragment key={`w_tot_${sc.colId}`}>
                          <td colSpan={subColCountPerSupplier - 1} />
                          <td className="cell-right bold-cell">
                            {totalVal ? formatVND(totalVal) : "-"}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ) : activeRequest.vatCalculationType === "already_included" ? (
                  <tr className="total-footer-row">
                    <td
                      colSpan={4}
                      className="cell-center bold-cell"
                      style={{ fontWeight: 700 }}
                    >
                      Tổng tiền có VAT (Đã gồm VAT)
                    </td>
                    {activeRequest.supplierColumns.map((sc) => {
                      const totalVal = supplierFinalTotals[sc.colId] || 0;
                      return (
                        <React.Fragment key={`w_tot_${sc.colId}`}>
                          <td colSpan={subColCountPerSupplier - 1} />
                          <td
                            className="cell-right bold-cell"
                            style={{ fontWeight: 800 }}
                          >
                            {totalVal ? formatVND(totalVal) : "-"}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ) : (
                  <>
                    <tr className="total-footer-row">
                      <td
                        colSpan={4}
                        className="cell-center bold-cell"
                        style={{ color: "#334155" }}
                      >
                        Tổng tiền chưa có VAT
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const subVal = supplierSubtotals[sc.colId] || 0;
                        return (
                          <React.Fragment key={`w_sub_${sc.colId}`}>
                            <td colSpan={subColCountPerSupplier - 1} />
                            <td className="cell-right bold-cell">
                              {subVal ? formatVND(subVal) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                    <tr className="total-footer-row">
                      <td
                        colSpan={4}
                        className="cell-center bold-cell"
                        style={{ color: "#334155" }}
                      >
                        Thuế GTGT (VAT {activeRequest.vatRate ?? 10}%)
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const vatVal = supplierVatAmounts[sc.colId] || 0;
                        return (
                          <React.Fragment key={`w_vat_${sc.colId}`}>
                            <td colSpan={subColCountPerSupplier - 1} />
                            <td className="cell-right bold-cell">
                              {vatVal ? `+${formatVND(vatVal)}` : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                    <tr className="total-footer-row">
                      <td
                        colSpan={4}
                        className="cell-center bold-cell"
                        style={{ fontWeight: 800 }}
                      >
                        TỔNG TIỀN CÓ VAT
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const finalVal = supplierFinalTotals[sc.colId] || 0;
                        return (
                          <React.Fragment key={`w_fin_${sc.colId}`}>
                            <td colSpan={subColCountPerSupplier - 1} />
                            <td
                              className="cell-right bold-cell"
                              style={{ fontWeight: 800 }}
                            >
                              {finalVal ? formatVND(finalVal) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* 4. Phần II: Đánh giá và đề xuất lựa chọn nhà cung cấp */}
          <div className="phenikaa-section-block">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="phenikaa-section-heading">
                II. Đánh giá và đề xuất lựa chọn nhà cung cấp:
              </div>
              {!isReportMode && (
                <button
                  type="button"
                  className="no-print"
                  style={{
                    border: "1px dashed #94a3b8",
                    background: "#f8fafc",
                    fontSize: "11px",
                    color: "#0369a1",
                    borderRadius: "4px",
                    padding: "1px 6px",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    updateActive((prev) => {
                      const currentRows = prev.customEvaluationRows || [];
                      const nextIdx = currentRows.length + 4;
                      return {
                        ...prev,
                        customEvaluationRows: [
                          ...currentRows,
                          {
                            id: `eval_${Date.now()}`,
                            label: `${nextIdx}. Điều kiện bổ sung:`,
                            value: "",
                          },
                        ],
                      };
                    })
                  }
                >
                  ＋ Thêm dòng điều kiện
                </button>
              )}
            </div>

            {/* 1. Nhà cung cấp đề xuất (Tên đầy đủ) */}
            <div className="eval-row" style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span className="eval-label" style={{ whiteSpace: "nowrap" }}>1. Nhà cung cấp đề xuất:</span>
              <input
                type="text"
                className="sheet-inline-input uppercase bold-input"
                style={{
                  flex: 1,
                  fontWeight: 700,
                  fontSize: "10pt",
                  color: "#0f172a",
                }}
                value={
                  activeRequest.recommendedSupplierName !== undefined
                    ? activeRequest.recommendedSupplierName
                    : effectiveRecommendedSupplier
                }
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    recommendedSupplierName: e.target.value,
                  }))
                }
                placeholder="Tên đầy đủ nhà cung cấp đề xuất..."
              />
            </div>

            {/* 2. Điều kiện giao hàng */}
            <div className="eval-row" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="eval-label">2. Điều kiện giao hàng:</span>
              <input
                type="text"
                className="sheet-inline-input"
                style={{ flex: 1 }}
                value={activeRequest.deliveryTerms || ""}
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    deliveryTerms: e.target.value,
                  }))
                }
                placeholder="Nhập hoặc chọn điều kiện giao hàng..."
              />
              {!isReportMode && (
                <select
                  className="no-print"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#475569",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    cursor: "pointer",
                    maxWidth: "180px",
                  }}
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    updateActive((prev) => ({
                      ...prev,
                      deliveryTerms: e.target.value,
                    }));
                  }}
                  title="Chọn gợi ý điều kiện giao hàng"
                >
                  <option value="">▼ Gợi ý giao hàng</option>
                  <option value="Đã bao gồm chi phí vận chuyển đến kho bên mua">
                    Đã bao gồm chi phí vận chuyển đến kho bên mua
                  </option>
                  <option value="Giao hàng tại kho bên bán (Bên mua tự vận chuyển)">
                    Giao hàng tại kho bên bán
                  </option>
                  <option value="Giao hàng tại kho Phenikaa Pharma">
                    Giao hàng tại kho Phenikaa Pharma
                  </option>
                  <option value="Giao hàng trong vòng 3-5 ngày từ ngày đặt hàng">
                    Giao trong vòng 3-5 ngày
                  </option>
                  <option value="Giao hàng theo từng đợt theo yêu cầu">
                    Giao theo từng đợt theo yêu cầu
                  </option>
                  <option value="Bên bán chịu mọi chi phí vận chuyển và bốc dỡ">
                    Bên bán chịu phí vận chuyển & bốc dỡ
                  </option>
                </select>
              )}
            </div>

            {/* 3. Điều khoản thanh toán */}
            <div className="eval-row" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="eval-label">3. Điều khoản thanh toán:</span>
              <input
                type="text"
                className="sheet-inline-input"
                style={{ flex: 1 }}
                value={activeRequest.paymentTerms || ""}
                readOnly={isReportMode}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    paymentTerms: e.target.value,
                  }))
                }
                placeholder="Nhập hoặc chọn điều khoản thanh toán..."
              />
              {!isReportMode && (
                <select
                  className="no-print"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#475569",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    cursor: "pointer",
                    maxWidth: "180px",
                  }}
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    updateActive((prev) => ({
                      ...prev,
                      paymentTerms: e.target.value,
                    }));
                  }}
                  title="Chọn gợi ý điều khoản thanh toán"
                >
                  <option value="">▼ Gợi ý thanh toán</option>
                  <option value="Thanh toán 100% trước khi giao hàng.">
                    Thanh toán 100% trước khi giao hàng
                  </option>
                  <option value="Thanh toán sau khi nhận hàng và hóa đơn GTGT hợp lệ trong vòng 30 ngày.">
                    Thanh toán sau khi nhận hàng & hóa đơn (30 ngày)
                  </option>
                  <option value="Tạm ứng 50%, thanh toán 50% còn lại sau khi nghiệm thu và nhận hóa đơn.">
                    Tạm ứng 50%, thanh toán 50% sau nghiệm thu
                  </option>
                  <option value="Thanh toán trong vòng 15 ngày kể từ ngày ký biên bản bàn giao.">
                    Thanh toán 15 ngày sau ký biên bản bàn giao
                  </option>
                  <option value="Thanh toán theo tiến độ từng đợt giao hàng.">
                    Thanh toán theo tiến độ từng đợt
                  </option>
                </select>
              )}
            </div>

            {/* Các dòng điều kiện bổ sung nếu có */}
            {(activeRequest.customEvaluationRows || []).map((row, idx) => (
              <div key={row.id} className="eval-row" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="text"
                  className="sheet-inline-input bold-input eval-label"
                  style={{ width: "180px", fontWeight: 700 }}
                  value={row.label}
                  readOnly={isReportMode}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActive((prev) => ({
                      ...prev,
                      customEvaluationRows: (prev.customEvaluationRows || []).map((r, i) =>
                        i === idx ? { ...r, label: val } : r
                      ),
                    }));
                  }}
                  placeholder="Tiêu đề..."
                />
                <input
                  type="text"
                  className="sheet-inline-input"
                  style={{ flex: 1 }}
                  value={row.value}
                  readOnly={isReportMode}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActive((prev) => ({
                      ...prev,
                      customEvaluationRows: (prev.customEvaluationRows || []).map((r, i) =>
                        i === idx ? { ...r, value: val } : r
                      ),
                    }));
                  }}
                  placeholder="Nội dung điều kiện..."
                />
                {!isReportMode && (
                  <button
                    type="button"
                    className="no-print"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "12px",
                      padding: "0 4px",
                    }}
                    title="Xóa dòng này"
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        customEvaluationRows: (prev.customEvaluationRows || []).filter(
                          (_, i) => i !== idx
                        ),
                      }))
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 5. Phần III: Lý do lựa chọn */}
          <div className="phenikaa-section-block">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div className="phenikaa-section-heading">
                III. Lý do lựa chọn:
              </div>
              {!isReportMode && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }} className="no-print">
                  <select
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#0369a1",
                      backgroundColor: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      cursor: "pointer",
                    }}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      updateActive((prev) => ({
                        ...prev,
                        reasons: [...prev.reasons, val],
                      }));
                    }}
                    title="Chọn lý do mẫu để thêm vào danh sách"
                  >
                    <option value="">▼ Thêm từ lý do mẫu</option>
                    <option value="Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.">
                      Đạt chất lượng & đơn giá rẻ nhất
                    </option>
                    <option value="Thời gian giao hàng nhanh nhất, đáp ứng tiến độ.">
                      Thời gian giao hàng nhanh nhất
                    </option>
                    <option value="Nhà phân phối độc quyền chính hãng, đầy đủ CO/CQ.">
                      Nhà phân phối chính hãng / độc quyền
                    </option>
                    <option value="Đã từng hợp tác, chất lượng sản phẩm và dịch vụ uy tín.">
                      Đã từng hợp tác uy tín
                    </option>
                    <option value="Đơn giá cạnh tranh, điều kiện thanh toán và bảo hành tốt.">
                      Đơn giá cạnh tranh & bảo hành tốt
                    </option>
                    <option value="Đáp ứng đầy đủ hồ sơ năng lực và tiêu chuẩn kỹ thuật nhà máy.">
                      Đạt hồ sơ năng lực & tiêu chuẩn kỹ thuật
                    </option>
                  </select>

                  <button
                    type="button"
                    style={{
                      border: "1px dashed #94a3b8",
                      background: "#f8fafc",
                      fontSize: "11px",
                      color: "#0369a1",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        reasons: [...prev.reasons, ""],
                      }))
                    }
                  >
                    ＋ Thêm dòng trống
                  </button>
                </div>
              )}
            </div>
            {activeRequest.reasons.map((reason, idx) => (
              <div
                key={`w_reason_${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  marginBottom: "1px",
                  lineHeight: 1.2,
                }}
              >
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {idx + 1}.
                </span>
                <input
                  type="text"
                  className="sheet-inline-input"
                  style={{ flex: 1 }}
                  value={reason}
                  readOnly={isReportMode}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActive((prev) => {
                      const nextReasons = [...prev.reasons];
                      nextReasons[idx] = val;
                      return { ...prev, reasons: nextReasons };
                    });
                  }}
                  placeholder={`Lý do thứ ${idx + 1}...`}
                />
                {!isReportMode && (
                  <select
                    className="no-print"
                    style={{
                      fontSize: "10px",
                      color: "#64748b",
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      borderRadius: "3px",
                      padding: "1px 4px",
                      cursor: "pointer",
                      maxWidth: "140px",
                    }}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      updateActive((prev) => {
                        const nextReasons = [...prev.reasons];
                        nextReasons[idx] = val;
                        return { ...prev, reasons: nextReasons };
                      });
                    }}
                    title="Chọn gợi ý thay thế cho dòng lý do này"
                  >
                    <option value="">Gợi ý...</option>
                    <option value="Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.">
                      Đạt chất lượng & giá rẻ nhất
                    </option>
                    <option value="Thời gian giao hàng nhanh nhất, đáp ứng tiến độ.">
                      Giao hàng nhanh nhất
                    </option>
                    <option value="Nhà phân phối độc quyền chính hãng, đầy đủ CO/CQ.">
                      Phân phối độc quyền
                    </option>
                    <option value="Đã từng hợp tác, chất lượng sản phẩm và dịch vụ uy tín.">
                      Hợp tác uy tín
                    </option>
                    <option value="Đơn giá cạnh tranh, điều kiện thanh toán và bảo hành tốt.">
                      Giá cạnh tranh & bảo hành tốt
                    </option>
                  </select>
                )}
                {!isReportMode && activeRequest.reasons.length > 1 && (
                  <button
                    type="button"
                    className="no-print"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "12px",
                      padding: "0 4px",
                    }}
                    title="Xóa dòng lý do này"
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        reasons: prev.reasons.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 5.5 Dòng ngày tháng & Kính trình Ban Lãnh đạo (Chuẩn mẫu Phenikaa) */}
          {(() => {
            const dp = parsePrintDate(activeRequest.createdDate);
            return (
              <div
                style={{
                  textAlign: "right",
                  marginTop: "14px",
                  marginBottom: "8px",
                  fontStyle: "italic",
                  fontSize: "10pt",
                  lineHeight: 1.45,
                }}
              >
                <div>
                  Hà Nội, ngày {dp.d} tháng {dp.m} năm {dp.y}
                </div>
                <div style={{ fontWeight: 700 }}>
                  Kính trình Ban Lãnh đạo xem xét và phê duyệt!
                </div>
              </div>
            );
          })()}

          {/* 6. Chữ ký đa cột */}
          {(() => {
            const totalCols = 3 + (activeRequest.customSigners?.length || 0);
            const colWidth = `${(100 / totalCols).toFixed(2)}%`;
            return (
              <table
                className="phenikaa-sign-table"
                data-react-managed="true"
                style={{ width: "100%", tableLayout: "fixed", marginTop: "10px" }}
              >
                <tbody>
                  <tr>
                    <td className="sign-col" style={{ width: colWidth }}>
                      <div className="sign-title">Lãnh đạo phê duyệt</div>
                      <div
                        className="sign-space"
                        style={{
                          height: `${activeRequest.signSpaceHeight || 80}px`,
                        }}
                      />
                      <input
                        type="text"
                        className="sheet-inline-input center bold-input sign-name"
                        value={activeRequest.approverLeader || ""}
                        readOnly={isReportMode}
                        onChange={(e) =>
                          updateActive((prev) => ({
                            ...prev,
                            approverLeader: e.target.value,
                          }))
                        }
                        placeholder="Họ và tên..."
                      />
                    </td>
                    {(activeRequest.customSigners || []).map((cs, csIdx) => (
                      <td
                        key={cs.id}
                        className="sign-col"
                        style={{ width: colWidth }}
                      >
                        <div className="sign-title">
                          {cs.title || "Bộ phận chuyên môn"}
                        </div>
                        <div
                          className="sign-space"
                          style={{
                            height: `${activeRequest.signSpaceHeight || 80}px`,
                          }}
                        />
                        <input
                          type="text"
                          className="sheet-inline-input center bold-input sign-name"
                          value={cs.name || ""}
                          readOnly={isReportMode}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateActive((prev) => ({
                              ...prev,
                              customSigners: (prev.customSigners || []).map((c, i) =>
                                i === csIdx ? { ...c, name: val } : c
                              ),
                            }));
                          }}
                          placeholder="Họ và tên..."
                        />
                      </td>
                    ))}
                    <td className="sign-col" style={{ width: colWidth }}>
                      <div className="sign-title">Trưởng bộ phận</div>
                      <div
                        className="sign-space"
                        style={{
                          height: `${activeRequest.signSpaceHeight || 80}px`,
                        }}
                      />
                      <input
                        type="text"
                        className="sheet-inline-input center bold-input sign-name"
                        value={activeRequest.approverDeptHead || ""}
                        readOnly={isReportMode}
                        onChange={(e) =>
                          updateActive((prev) => ({
                            ...prev,
                            approverDeptHead: e.target.value,
                          }))
                        }
                        placeholder="Họ và tên..."
                      />
                    </td>
                    <td className="sign-col" style={{ width: colWidth }}>
                      <div className="sign-title">Người đề nghị</div>
                      <div
                        className="sign-space"
                        style={{
                          height: `${activeRequest.signSpaceHeight || 80}px`,
                        }}
                      />
                      <input
                        type="text"
                        className="sheet-inline-input center bold-input sign-name"
                        value={activeRequest.requesterName || ""}
                        readOnly={isReportMode}
                        onChange={(e) =>
                          updateActive((prev) => ({
                            ...prev,
                            requesterName: e.target.value,
                          }))
                        }
                        placeholder="Họ và tên..."
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
    );
  };

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
            onClick={handleBackToList}
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
            {hasUnsavedChanges && (
              <span className="unsaved-change-pill" title="Dữ liệu chưa được lưu vào hệ thống">
                ● Có thay đổi chưa lưu
              </span>
            )}
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

              {activeRequest.linkedPoNumber ? (
                <button
                  type="button"
                  className="btn"
                  style={{ background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0", fontWeight: 700 }}
                  onClick={() => {
                    const matched = pos.find((p) => p.number === activeRequest.linkedPoNumber || p.id === activeRequest.linkedPoId);
                    if (matched) {
                      onNavigate?.({ view: "po-detail", id: matched.id });
                    } else {
                      handleOpenPOCreateModal(activeRequest);
                    }
                  }}
                  title={`Đã tạo đơn ${activeRequest.linkedPoNumber}. Bấm để chuyển tới đơn PO.`}
                >
                  <PackageCheck size={16} /> Đã có PO: {activeRequest.linkedPoNumber}
                </button>
              ) : (
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
              )}

              <button
                type="button"
                className={`btn ${hasUnsavedChanges ? "btn-primary" : ""}`}
                style={
                  hasUnsavedChanges
                    ? {
                        background: "#2563eb",
                        color: "#ffffff",
                        borderColor: "#1d4ed8",
                        fontWeight: 700,
                        boxShadow: "0 2px 4px rgba(37,99,235,0.25)",
                      }
                    : undefined
                }
                onClick={handleExplicitSave}
                title={
                  hasUnsavedChanges
                    ? "Lưu các thay đổi trên phiếu vào hệ thống (Ctrl + S)"
                    : "Đã lưu bản mới nhất"
                }
              >
                <Save size={16} /> {hasUnsavedChanges ? "Lưu ngay (Ctrl+S)" : "Lưu"}
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
        {/* Chế độ làm việc: Form giấy in A4 WYSIWYG vs Dạng thẻ */}
        <div className="config-group" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span className="config-label" style={{ fontWeight: 700 }}>Giao diện:</span>
          <div className="segmented-pills">
            <button
              type="button"
              className={`seg-pill ${workspaceViewMode === "wysiwyg" ? "active" : ""}`}
              onClick={() => setWorkspaceViewMode("wysiwyg")}
              title="Soạn thảo trực tiếp trên biểu mẫu giấy in A4 trực quan"
            >
              📄 Mẫu in A4 (Chuẩn)
            </button>
            <button
              type="button"
              className={`seg-pill ${workspaceViewMode === "cards" ? "active" : ""}`}
              onClick={() => setWorkspaceViewMode("cards")}
              title="Xem và chỉnh sửa theo các thẻ phân đoạn"
            >
              📋 Dạng thẻ
            </button>
          </div>
        </div>

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

        {/* Lựa chọn Tổng tiền: Chưa có VAT hoặc Có VAT */}
        <div className="config-group" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <span className="config-label" style={{ fontWeight: 650 }}>Tính tổng tiền:</span>
          <div className="segmented-pills">
            <button
              type="button"
              className={`seg-pill ${activeRequest.vatMode !== "with_vat" ? "active" : ""}`}
              onClick={() =>
                updateActive((prev) => ({
                  ...prev,
                  vatMode: "without_vat",
                }))
              }
              title="Tổng tiền chưa bao gồm thuế giá trị gia tăng"
            >
              Chưa có VAT
            </button>
            <button
              type="button"
              className={`seg-pill ${activeRequest.vatMode === "with_vat" ? "active" : ""}`}
              onClick={() =>
                updateActive((prev) => ({
                  ...prev,
                  vatMode: "with_vat",
                  vatRate: prev.vatRate !== undefined ? prev.vatRate : 10,
                  vatCalculationType: prev.vatCalculationType || "add_vat",
                }))
              }
              title="Tổng tiền có bao gồm thuế giá trị gia tăng"
            >
              Có VAT
            </button>
          </div>

          {activeRequest.vatMode === "with_vat" && (
            <select
              className="approval-filter-select"
              style={{
                width: "auto",
                minWidth: "120px",
                padding: "4px 8px",
                fontSize: "12px",
                fontWeight: 650,
                color: "#0369a1",
                backgroundColor: "#f0f9ff",
                borderColor: "#bae6fd",
                borderRadius: "6px",
              }}
              value={
                activeRequest.vatCalculationType === "already_included"
                  ? "included"
                  : String(activeRequest.vatRate !== undefined ? activeRequest.vatRate : 10)
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === "included") {
                  updateActive((prev) => ({
                    ...prev,
                    vatCalculationType: "already_included",
                    vatRate: 0,
                  }));
                } else {
                  updateActive((prev) => ({
                    ...prev,
                    vatCalculationType: "add_vat",
                    vatRate: Number(val),
                  }));
                }
              }}
              title="Chọn mức thuế suất VAT hoặc đơn giá đã bao gồm VAT"
            >
              <option value="10">Thuế VAT 10%</option>
              <option value="8">Thuế VAT 8%</option>
              <option value="5">Thuế VAT 5%</option>
              <option value="0">Thuế VAT 0%</option>
              <option value="included">Đơn giá đã gồm VAT</option>
            </select>
          )}
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
            <button
              type="button"
              className={`seg-pill col-width-tool-btn ${
                showColWidthAdjuster ? "active" : ""
              }`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontWeight: 700,
                color: showColWidthAdjuster ? "#1d4ed8" : "#334155",
                background: showColWidthAdjuster ? "#eff6ff" : "#ffffff",
                borderColor: showColWidthAdjuster ? "#3b82f6" : "#cbd5e1",
              }}
              onClick={() => setShowColWidthAdjuster((prev) => !prev)}
              title="Mở thanh công cụ co kéo, tùy chỉnh độ rộng các cột bản in"
            >
              <Sliders size={14} />
              <span>📐 Co kéo cột in</span>
              {colWidths.hasCustom && (
                <span
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    fontSize: "10px",
                    borderRadius: "99px",
                    padding: "1px 6px",
                    marginLeft: "2px",
                  }}
                >
                  Đã chỉnh
                </span>
              )}
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

      {/* THANH CÔNG CỤ CO KÉO ĐỘ RỘNG CỘT BẢN IN TRỰC QUAN */}
      {showColWidthAdjuster && (
        <div className="col-width-adjuster-panel no-print">
          <div className="adjuster-header">
            <div className="adjuster-title">
              <Sliders size={16} />
              <strong>Tùy chỉnh khoảng cách & độ rộng các cột bản in (Áp dụng tức thì cho cả màn hình & bản in)</strong>
            </div>
            <div className="adjuster-actions">
              <button
                type="button"
                className="preset-btn"
                onClick={() => applyColWidthPreset("balanced")}
                title="Cân đối chuẩn A4: Số tiền rộng rãi, Tên hàng gọn gàng"
              >
                ⚖️ Cân đối chuẩn
              </button>
              <button
                type="button"
                className="preset-btn"
                onClick={() => applyColWidthPreset("long_item")}
                title="Dành cho mặt hàng có tên gọi hoặc quy cách rất dài"
              >
                📝 Ưu tiên Tên hàng
              </button>
              <button
                type="button"
                className="preset-btn"
                onClick={() => applyColWidthPreset("large_amount")}
                title="Dành cho đơn hàng tiền tỷ hoặc số tiền nhiều chữ số"
              >
                💰 Ưu tiên Số tiền
              </button>
              {colWidths.hasCustom && (
                <button
                  type="button"
                  className="reset-btn"
                  onClick={() =>
                    updateActive((prev) => ({
                      ...prev,
                      customColWidths: undefined,
                    }))
                  }
                  title="Xóa tùy biến, khôi phục tỉ lệ cột chuẩn"
                >
                  ↺ Đặt lại mặc định
                </button>
              )}
              <button
                type="button"
                className="close-adjuster-btn"
                onClick={() => setShowColWidthAdjuster(false)}
                title="Đóng bảng co kéo"
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          <div className="adjuster-sliders-grid">
            {/* Cột Hàng hóa */}
            <div className="slider-item">
              <div className="slider-label">
                <span>Cột Hàng hóa:</span>
                <strong>
                  {colWidths.numValues.item}% (~
                  {(colWidths.numValues.item * 1.98).toFixed(0)}mm)
                </strong>
              </div>
              <input
                type="range"
                min={15}
                max={40}
                step={0.5}
                value={colWidths.numValues.item}
                onChange={(e) =>
                  handleUpdateSingleColWidth("item", parseFloat(e.target.value))
                }
              />
            </div>

            {/* Cột Mặt hàng NCC báo */}
            {hasQuotedProduct && (
              <div className="slider-item">
                <div className="slider-label">
                  <span>Mặt hàng NCC báo:</span>
                  <strong>
                    {colWidths.numValues.spec}% (~
                    {(colWidths.numValues.spec * 1.98).toFixed(0)}mm)
                  </strong>
                </div>
                <input
                  type="range"
                  min={7}
                  max={22}
                  step={0.5}
                  value={colWidths.numValues.spec}
                  onChange={(e) =>
                    handleUpdateSingleColWidth("spec", parseFloat(e.target.value))
                  }
                />
              </div>
            )}

            {/* Cột Đơn giá & Thành tiền */}
            <div className="slider-item">
              <div className="slider-label">
                <span>Đơn giá & Thành tiền (mỗi cột):</span>
                <strong>
                  {colWidths.numValues.price}% (~
                  {(colWidths.numValues.price * 1.98).toFixed(0)}mm)
                </strong>
              </div>
              <input
                type="range"
                min={6}
                max={18}
                step={0.5}
                value={colWidths.numValues.price}
                onChange={(e) =>
                  handleUpdateSingleColWidth("price", parseFloat(e.target.value))
                }
              />
            </div>

            {/* Cột Số lượng & ĐVT */}
            <div className="slider-item">
              <div className="slider-label">
                <span>
                  Số lượng ({colWidths.numValues.qty}%) & ĐVT (
                  {colWidths.numValues.unit}%):
                </span>
                <strong>
                  ~{(colWidths.numValues.qty * 1.98).toFixed(0)}mm / ~
                  {(colWidths.numValues.unit * 1.98).toFixed(0)}mm
                </strong>
              </div>
              <input
                type="range"
                min={4}
                max={12}
                step={0.5}
                value={colWidths.numValues.qty}
                onChange={(e) =>
                  handleUpdateSingleColWidth("qty", parseFloat(e.target.value))
                }
              />
            </div>
          </div>

          <div className="adjuster-footer-hint">
            💡 <strong>Mẹo:</strong> Bạn có thể kéo các thanh trượt ở trên hoặc rê chuột vào mép phân cách giữa các cột trong bảng bên dưới rồi kéo thả trực tiếp (chuẩn như Excel). Bản in sẽ áp dụng chính xác kích thước bạn vừa co kéo.
          </div>
        </div>
      )}

      {/* ===================================================================
          GIAO DIỆN LÀM VIỆC ĐNPD TRÊN MÀN HÌNH
          Mặc định: Biểu mẫu in A4 WYSIWYG trực quan (100% như bản in)
          Có thể chuyển đổi sang Dạng thẻ phân đoạn nếu cần
         =================================================================== */}
      {workspaceViewMode === "wysiwyg" ? (
        renderWYSIWYGPaperWorkspace()
      ) : (
        <div className="approval-screen-workspace">
        {/* CARD 1: THÔNG TIN CHUNG PHIẾU ĐỀ NGHỊ PHÊ DUYỆT */}
        <div className="dnpd-workspace-card dnpd-meta-card no-print">
          <div className="dnpd-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3>📋 Thông tin chung Đề nghị phê duyệt</h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                (Mã phiếu: <strong>{activeRequest.id}</strong>)
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {linkedPR?.number && (
                <span
                  style={{
                    background: "#f1f5f9",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  🔗 Căn cứ PR: <strong>{linkedPR.number}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="dnpd-meta-grid">
            {/* 1. Căn cứ theo PR số */}
            <div className="dnpd-field-group">
              <label className="dnpd-field-label">Căn cứ theo PR số</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  list="approval-prs-list"
                  className="dnpd-field-input"
                  style={{ flex: 1 }}
                  value={activeRequest.prNumber || ""}
                  placeholder="Chọn hoặc nhập số PR..."
                  readOnly={isReportMode}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matchedPR = prs.find((p) => p.number === val);
                    updateActive((prev) => ({
                      ...prev,
                      prNumber: val,
                      noteRef:
                        prev.noteRef === prev.prNumber || !prev.noteRef
                          ? val
                          : prev.noteRef,
                      requestingDepartment:
                        matchedPR?.department || prev.requestingDepartment,
                      section1Title: matchedPR?.department
                        ? formatApprovalSection1Title(matchedPR.department)
                        : prev.section1Title,
                    }));
                  }}
                />
                <datalist id="approval-prs-list">
                  {prs.map((p) => (
                    <option key={p.id} value={p.number}>
                      {p.number} — {p.department || "Yêu cầu mua sắm"}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* 2. Ngày lập */}
            <div className="dnpd-field-group">
              <label className="dnpd-field-label">Ngày lập biểu mẫu</label>
              <input
                type="text"
                className="dnpd-field-input"
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

            {/* 3. Đơn vị lập biểu mẫu */}
            <div className="dnpd-field-group">
              <label className="dnpd-field-label">Đơn vị lập biểu mẫu</label>
              <input
                type="text"
                className="dnpd-field-input"
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

            {/* 4. Phòng ban yêu cầu */}
            <div className="dnpd-field-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="dnpd-field-label">Phòng ban yêu cầu</label>
                {linkedPR?.department && !isReportMode && (
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onClick={() => handleSelectRequestingDept(linkedPR.department)}
                    title={`Điền tự động phòng ban từ PR số ${linkedPR.number}: ${linkedPR.department}`}
                  >
                    📋 Lấy từ PR
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <select
                  className="dnpd-field-input"
                  style={{ flex: 1, cursor: "pointer" }}
                  disabled={isReportMode}
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
                  <option value="">-- Chọn phòng ban --</option>
                  {departmentOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                  <option value="__ADD_NEW__">＋ Thêm phòng ban mới...</option>
                </select>
                {!isReportMode && (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "0 8px", fontSize: "11.5px", height: "34px" }}
                    onClick={handleAddNewDept}
                    title="Thêm mã phòng ban mới"
                  >
                    ＋ Thêm
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Trích yếu / Nội dung đề nghị phê duyệt */}
          <div className="dnpd-field-group" style={{ marginTop: "6px" }}>
            <label className="dnpd-field-label">Nội dung đề nghị phê duyệt (Trích yếu)</label>
            <input
              type="text"
              className="dnpd-field-input"
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
        </div>

        {/* CARD 2: BẢNG DỮ LIỆU HÀNG HÓA & SO SÁNH GIÁ (DATA GRID CHUẨN) */}
        <div className="dnpd-workspace-card dnpd-table-card">
          <div className="dnpd-card-header no-print">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h3>📊 Bảng so sánh báo giá Nhà cung cấp</h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                ({activeRequest.rows.length} mặt hàng, {activeRequest.supplierColumns.length} NCC)
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                onClick={handleAddRow}
                disabled={isReportMode}
              >
                ＋ Thêm hàng hóa
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleAddSupplierColumn}
                disabled={isReportMode}
              >
                ＋ Thêm NCC ({activeRequest.supplierColumns.length})
              </button>
            </div>
          </div>

          {/* NATIVE MOBILE VENDOR COMPARISON CARDS */}
          {isMobile && !isReportMode ? (
            <div className="mobile-vendor-cards-container space-y-3.5 my-3 no-print">
              {activeRequest.supplierColumns.map((sc, scIdx) => {
                const scTotal = activeRequest.rows.reduce((sum, row) => {
                  const lines = row.supplierQuotes[sc.colId] || [];
                  return (
                    sum +
                    lines.reduce(
                      (lSum, l) =>
                        lSum +
                        (Number(l.amount) ||
                          (Number(l.unitPrice) || 0) * (Number(l.qty) || Number(row.qty) || 0)),
                      0
                    )
                  );
                }, 0);

                return (
                  <div
                    key={sc.colId}
                    className={`rounded-2xl p-4 transition-all border-2 shadow-sm ${
                      sc.isSelected
                        ? "bg-emerald-50/60 border-emerald-500 shadow-emerald-100 ring-2 ring-emerald-400/20"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            NCC {scIdx + 1}
                          </span>
                          <h3 className="font-extrabold text-base text-slate-900 m-0">
                            {sc.shortName || sc.supplierName || `Nhà cung cấp ${scIdx + 1}`}
                          </h3>
                        </div>
                        {sc.supplierName && sc.supplierName !== sc.shortName && (
                          <p className="text-xs text-slate-500 mt-0.5 m-0">{sc.supplierName}</p>
                        )}
                      </div>

                      {/* 1-Tap Winner Selection Button */}
                      <button
                        type="button"
                        onClick={() => handleSelectSupplierCol(sc.colId)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                          sc.isSelected
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                        }`}
                      >
                        {sc.isSelected ? (
                          <>
                            <CheckCircle2 size={16} />
                            <span>Đã chọn ✓</span>
                          </>
                        ) : (
                          <>
                            <Circle size={16} />
                            <span>Chọn NCC này</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Supplier Terms Pills */}
                    <div className="grid grid-cols-2 gap-2 my-2.5 text-xs">
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-slate-500 block text-[11px]">Thời gian giao:</span>
                        <span className="font-semibold text-slate-800">{sc.leadTime || "Theo thỏa thuận"}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-slate-500 block text-[11px]">Bảo hành:</span>
                        <span className="font-semibold text-slate-800">{sc.warranty || "Theo tiêu chuẩn"}</span>
                      </div>
                    </div>

                    {/* Total Quoted Amount */}
                    <div className="flex items-center justify-between p-2.5 bg-blue-50/70 rounded-xl mb-3 border border-blue-100">
                      <span className="text-xs font-bold text-blue-900">Tổng tiền chào giá:</span>
                      <span className="text-base font-extrabold text-blue-700">{formatVND(scTotal)} ₫</span>
                    </div>

                    {/* Item Price List */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 block">Đơn giá từng mặt hàng:</span>
                      {activeRequest.rows.map((row, rIdx) => {
                        const lines = row.supplierQuotes[sc.colId] || [];
                        const firstLine = lines[0] || { unitPrice: 0, amount: 0 };
                        return (
                          <div key={row.rowId} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                            <div className="flex justify-between font-bold text-slate-900 mb-1">
                              <span>{row.stt}. {row.itemName}</span>
                              <span className="text-slate-600">SL: {row.qty} {row.unit}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <span className="text-slate-500">Đơn giá (chưa VAT):</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={firstLine.unitPrice ? String(firstLine.unitPrice) : ""}
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(rIdx, sc.colId, 0, "unitPrice", e.target.value)
                                  }
                                  placeholder="0"
                                  className="w-24 h-7 text-right px-2 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 text-xs outline-none focus:border-blue-500"
                                />
                                <span className="text-slate-500">₫</span>
                              </div>
                            </div>
                            {Number(firstLine.amount) > 0 && (
                              <div className="flex justify-end gap-1 mt-1 font-semibold text-blue-700 text-[11.5px]">
                                <span>Thành tiền: {formatVND(Number(firstLine.amount))} ₫</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Add Supplier Button on Mobile */}
              <button
                type="button"
                onClick={handleAddSupplierColumn}
                className="w-full py-3 bg-white border-2 border-dashed border-blue-400 text-blue-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                <Plus size={16} /> Thêm Nhà cung cấp so sánh
              </button>
            </div>
          ) : (
            <div className="approval-grid-scroll-wrap">
            <table className="phenikaa-approval-grid">
              {renderTableColGroup()}
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="col-stt"
                  >
                    <span>STT</span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColKey === "stt" ? "active" : ""}`}
                        onMouseDown={(e) => startColumnDrag("stt", e)}
                        title="Kéo sang trái/phải để co giãn độ rộng cột STT"
                      />
                    )}
                  </th>
                  <th
                    rowSpan={2}
                    className="col-item-name"
                  >
                    <span>Hàng hóa</span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColKey === "item" ? "active" : ""}`}
                        onMouseDown={(e) => startColumnDrag("item", e)}
                        title="Kéo sang trái/phải để co giãn độ rộng cột Hàng hóa"
                      />
                    )}
                  </th>
                  <th
                    rowSpan={2}
                    className="col-qty"
                  >
                    <span>
                      Số
                      <br />
                      lượng
                    </span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColKey === "qty" ? "active" : ""}`}
                        onMouseDown={(e) => startColumnDrag("qty", e)}
                        title="Kéo sang trái/phải để co giãn độ rộng cột Số lượng"
                      />
                    )}
                  </th>
                  <th
                    rowSpan={2}
                    className="col-unit"
                  >
                    <span>ĐVT</span>
                    {!isReportMode && (
                      <div
                        className={`col-resizer-handle no-print ${resizingColKey === "unit" ? "active" : ""}`}
                        onMouseDown={(e) => startColumnDrag("unit", e)}
                        title="Kéo sang trái/phải để co giãn độ rộng cột ĐVT"
                      />
                    )}
                  </th>
                  {activeRequest.supplierColumns.map((sc) => (
                    <th
                      key={sc.colId}
                      colSpan={subColCountPerSupplier}
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
                        <SupplierColumnSearchCombobox
                          column={sc}
                          suppliers={suppliers}
                          isReportMode={isReportMode}
                          onUpdate={({ shortName, supplierName, supplierId }) => {
                            updateActive((prev) => ({
                              ...prev,
                              supplierColumns: prev.supplierColumns.map((c) =>
                                c.colId === sc.colId
                                  ? {
                                      ...c,
                                      shortName,
                                      supplierName,
                                      supplierId,
                                    }
                                  : c,
                              ),
                              recommendedSupplierName:
                                sc.isSelected && supplierName
                                  ? supplierName
                                  : prev.recommendedSupplierName,
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
                        <th className="col-sub-spec">
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
                          {!isReportMode && (
                            <div
                              className={`col-resizer-handle no-print ${resizingColKey === "spec" ? "active" : ""}`}
                              onMouseDown={(e) => startColumnDrag("spec", e)}
                              title="Kéo sang trái/phải để co giãn độ rộng cột Mặt hàng NCC báo"
                            />
                          )}
                        </th>
                      )}
                      <th className="col-sub-price">
                        <span>
                          Đơn giá
                          <br />
                          (VNĐ)
                        </span>
                        {!isReportMode && (
                          <div
                            className={`col-resizer-handle no-print ${resizingColKey === "price" ? "active" : ""}`}
                            onMouseDown={(e) => startColumnDrag("price", e)}
                            title="Kéo sang trái/phải để co giãn độ rộng cột Đơn giá"
                          />
                        )}
                      </th>
                      {hasSupplierQty && (
                        <th className="col-sub-qty">
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
                          {!isReportMode && (
                            <div
                              className={`col-resizer-handle no-print ${resizingColKey === "supQty" ? "active" : ""}`}
                              onMouseDown={(e) => startColumnDrag("supQty", e)}
                              title="Kéo sang trái/phải để co giãn độ rộng cột Số lượng của NCC"
                            />
                          )}
                        </th>
                      )}
                      <th className="col-sub-amount">
                        <span>
                          Thành
                          <br />
                          tiền
                        </span>
                        {!isReportMode && (
                          <div
                            className={`col-resizer-handle no-print ${resizingColKey === "amt" ? "active" : ""}`}
                            onMouseDown={(e) => startColumnDrag("amt", e)}
                            title="Kéo sang trái/phải để co giãn độ rộng cột Thành tiền"
                          />
                        )}
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

                {/* Dòng tổng tiền: Tùy biến Chưa VAT hoặc Có VAT */}
                {activeRequest.vatMode !== "with_vat" ? (
                  <tr className="total-footer-row">
                    <td colSpan={4} className="cell-center bold-cell">
                      Tổng tiền chưa có VAT
                    </td>
                    {activeRequest.supplierColumns.map((sc) => {
                      const totalVal = supplierSubtotals[sc.colId] || 0;
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
                ) : activeRequest.vatCalculationType === "already_included" ? (
                  <tr className="total-footer-row" style={{ backgroundColor: "#f0fdf4" }}>
                    <td colSpan={4} className="cell-center bold-cell" style={{ color: "#166534" }}>
                      Tổng tiền có VAT (Đã gồm VAT)
                    </td>
                    {activeRequest.supplierColumns.map((sc) => {
                      const totalVal = supplierFinalTotals[sc.colId] || 0;
                      return (
                        <React.Fragment key={`total_${sc.colId}`}>
                          <td
                            colSpan={subColCountPerSupplier - 1}
                            className="cell-empty-total"
                          />
                          <td className="cell-right bold-cell total-amount-cell" style={{ color: "#0f172a", fontWeight: 700 }}>
                            {totalVal ? formatVND(totalVal) : "-"}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ) : (
                  <>
                    <tr className="total-footer-row subtotal-row" style={{ backgroundColor: "#f8fafc" }}>
                      <td colSpan={4} className="cell-center bold-cell" style={{ color: "#0f172a" }}>
                        Tổng tiền chưa có VAT
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const subVal = supplierSubtotals[sc.colId] || 0;
                        return (
                          <React.Fragment key={`subtotal_${sc.colId}`}>
                            <td
                              colSpan={subColCountPerSupplier - 1}
                              className="cell-empty-total"
                            />
                            <td className="cell-right bold-cell" style={{ color: "#0f172a" }}>
                              {subVal ? formatVND(subVal) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                    <tr className="total-footer-row vat-row" style={{ backgroundColor: "#f8fafc" }}>
                      <td colSpan={4} className="cell-center bold-cell" style={{ color: "#0f172a" }}>
                        Tiền thuế GTGT (VAT {activeRequest.vatRate ?? 10}%)
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const vatVal = supplierVatAmounts[sc.colId] || 0;
                        return (
                          <React.Fragment key={`vat_${sc.colId}`}>
                            <td
                              colSpan={subColCountPerSupplier - 1}
                              className="cell-empty-total"
                            />
                            <td className="cell-right bold-cell" style={{ color: "#0f172a" }}>
                              {vatVal ? `+${formatVND(vatVal)}` : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                    <tr className="total-footer-row grand-total-row" style={{ backgroundColor: "#f8fafc" }}>
                      <td colSpan={4} className="cell-center bold-cell" style={{ color: "#0f172a", fontSize: "13px" }}>
                        TỔNG TIỀN CÓ VAT
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const finalVal = supplierFinalTotals[sc.colId] || 0;
                        return (
                          <React.Fragment key={`final_${sc.colId}`}>
                            <td
                              colSpan={subColCountPerSupplier - 1}
                              className="cell-empty-total"
                            />
                            <td className="cell-right bold-cell total-amount-cell" style={{ color: "#0f172a", fontWeight: 700, fontSize: "13px" }}>
                              {finalVal ? formatVND(finalVal) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          )}

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

        {/* CARD 3: ĐÁNH GIÁ VÀ ĐIỀU KIỆN LỰA CHỌN NHÀ CUNG CẤP */}
        <div className="dnpd-workspace-card dnpd-eval-card no-print">
          <div className="dnpd-card-header">
            <h3>⚖️ Đánh giá & Điều kiện lựa chọn Nhà cung cấp</h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* 1. Nhà cung cấp đề xuất */}
            <div className="dnpd-field-group">
              <label className="dnpd-field-label">1. Nhà cung cấp đề xuất lựa chọn</label>
              <ProposalSupplierSearchCombobox
                value={effectiveRecommendedSupplier}
                suppliers={suppliers}
                supplierColumns={activeRequest.supplierColumns}
                isReportMode={isReportMode}
                onSelect={(supplierName, matchedColId) => {
                  updateActive((prev) => ({
                    ...prev,
                    recommendedSupplierName: supplierName,
                    supplierColumns: matchedColId
                      ? prev.supplierColumns.map((c) => ({
                          ...c,
                          isSelected: c.colId === matchedColId,
                        }))
                      : prev.supplierColumns,
                  }));
                }}
                onChangeText={(text) => {
                  updateActive((prev) => ({
                    ...prev,
                    recommendedSupplierName: text,
                  }));
                }}
              />
            </div>

            {/* 2. Điều kiện giao hàng */}
            <div className="dnpd-field-group">
              <label className="dnpd-field-label">2. Điều kiện giao hàng</label>
              <input
                type="text"
                className="dnpd-field-input"
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
                <div className="preset-pills" style={{ marginTop: "4px" }}>
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

            {/* 3. Điều khoản thanh toán */}
            <div className="dnpd-field-group">
              <label className="dnpd-field-label">3. Điều khoản thanh toán</label>
              <input
                type="text"
                className="dnpd-field-input"
                value={activeRequest.paymentTerms}
                readOnly={isReportMode}
                placeholder="VD: Thanh toán 100% trong vòng 30 ngày sau khi nhận đủ hàng và hồ sơ hợp lệ."
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    paymentTerms: e.target.value,
                  }))
                }
              />
              {!isReportMode && (
                <div className="preset-pills" style={{ marginTop: "4px" }}>
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

            {/* 4. Lý do lựa chọn */}
            <div className="dnpd-field-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="dnpd-field-label">4. Lý do lựa chọn</label>
                {!isReportMode && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ fontSize: "11.5px" }}
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        reasons: [...prev.reasons, ""],
                      }))
                    }
                  >
                    ＋ Thêm dòng lý do
                  </button>
                )}
              </div>

              <div className="reasons-list">
                {activeRequest.reasons.map((reason, idx) => (
                  <div key={idx} className="reason-item-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, color: "#475569", width: "22px" }}>{idx + 1}.</span>
                    <input
                      type="text"
                      className="dnpd-field-input"
                      style={{ flex: 1 }}
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
                        className="btn"
                        style={{ color: "#dc2626", padding: "0 8px", height: "34px" }}
                        onClick={() =>
                          updateActive((prev) => ({
                            ...prev,
                            reasons: prev.reasons.filter((_, i) => i !== idx),
                          }))
                        }
                        title="Xóa dòng lý do này"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {!isReportMode && (
                <div className="preset-pills" style={{ marginTop: "4px" }}>
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
              )}
            </div>
          </div>
        </div>

        {/* CARD 4: PHÊ DUYỆT & NGƯỜI KÝ (DẠNG THẺ CHUYÊN NGHIỆP) */}
        <div className="dnpd-workspace-card dnpd-signers-card no-print">
          <div className="dnpd-card-header">
            <div>
              <h3>✍️ Bộ phận phê duyệt & Người ký</h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                (Tên người ký sẽ tự động áp dụng vào mẫu in chuẩn A4 khi bấm &quot;In phiếu&quot;)
              </span>
            </div>

            {!isReportMode && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b" }}>Thêm ô ký:</span>
                <button
                  type="button"
                  onClick={() => handleAddCustomSigner("Bộ phận chuyên môn")}
                  className="btn"
                  style={{ fontSize: "11.5px", padding: "3px 8px" }}
                >
                  + BP Chuyên môn
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCustomSigner("Kế toán")}
                  className="btn"
                  style={{ fontSize: "11.5px", padding: "3px 8px" }}
                >
                  + Kế toán
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCustomSigner("Ô ký khác")}
                  className="btn"
                  style={{ fontSize: "11.5px", padding: "3px 8px" }}
                >
                  + Khác...
                </button>
              </div>
            )}
          </div>

          {/* Grid thẻ người ký trên màn hình (Giao diện chuẩn, không có khoảng trắng giả giấy 96px) */}
          <div className="dnpd-signers-grid">
            {/* Cột 1: Lãnh đạo phê duyệt */}
            <div className="dnpd-signer-card">
              <div className="dnpd-signer-role">
                <span>Lãnh đạo phê duyệt</span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>Duyệt chính</span>
              </div>
              <input
                type="text"
                className="dnpd-signer-input"
                value={activeRequest.approverLeader}
                placeholder="Họ và tên Lãnh đạo duyệt..."
                readOnly={isReportMode}
                title="Tự động lưu tên này cho các ĐNPD sau"
                onChange={(e) => handleLeaderChange(e.target.value)}
              />
            </div>

            {/* Các ô ký bổ sung (Bộ phận chuyên môn, Kế toán,...) */}
            {(activeRequest.customSigners || []).map((signer) => (
              <div key={signer.id} className="dnpd-signer-card">
                <div className="dnpd-signer-role">
                  <input
                    type="text"
                    value={signer.title}
                    readOnly={isReportMode}
                    placeholder="Tên chức danh ô ký..."
                    onChange={(e) =>
                      handleCustomSignerChange(signer.id, "title", e.target.value)
                    }
                    style={{
                      fontWeight: 700,
                      fontSize: "12px",
                      border: "none",
                      borderBottom: "1px dashed #cbd5e1",
                      background: "transparent",
                      outline: "none",
                      width: "80%",
                    }}
                  />
                  {!isReportMode && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomSigner(signer.id)}
                      title="Xóa ô ký này"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#dc2626",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="dnpd-signer-input"
                  value={signer.name}
                  placeholder="Họ và tên..."
                  readOnly={isReportMode}
                  title="Tự động lưu tên này cho các ĐNPD sau"
                  onChange={(e) =>
                    handleCustomSignerChange(signer.id, "name", e.target.value)
                  }
                />
              </div>
            ))}

            {/* Cột 2: Trưởng bộ phận */}
            <div className="dnpd-signer-card">
              <div className="dnpd-signer-role">
                <span>Trưởng bộ phận</span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>Xác nhận</span>
              </div>
              <input
                type="text"
                className="dnpd-signer-input"
                value={activeRequest.approverDeptHead}
                placeholder="Họ và tên Trưởng bộ phận..."
                readOnly={isReportMode}
                title="Tự động lưu tên này cho các ĐNPD sau"
                onChange={(e) => handleDeptHeadChange(e.target.value)}
              />
            </div>

            {/* Cột 3: Người đề nghị */}
            <div className="dnpd-signer-card">
              <div className="dnpd-signer-role">
                <span>Người đề nghị</span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>Lập biểu</span>
              </div>
              <input
                type="text"
                className="dnpd-signer-input"
                value={activeRequest.requesterName}
                placeholder="Họ và tên Người đề nghị..."
                readOnly={isReportMode}
                title="Tự động lưu tên này cho các ĐNPD sau"
                onChange={(e) => handleRequesterChange(e.target.value)}
              />
            </div>
          </div>

          {/* Thanh chỉnh độ cao ô ký khi in giấy (Không ảnh hưởng màn hình làm việc) */}
          {!isReportMode && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "14px",
                padding: "8px 12px",
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#475569",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span>📐 <b>Khoảng trống chữ ký bản in:</b> {activeRequest.signSpaceHeight || 96}px</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: (activeRequest.signSpaceHeight || 96) === 48 ? "#2563eb" : "#ffffff",
                    color: (activeRequest.signSpaceHeight || 96) === 48 ? "#ffffff" : "#334155",
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
                  className="btn btn-sm"
                  style={{
                    background: (activeRequest.signSpaceHeight || 96) === 96 ? "#2563eb" : "#ffffff",
                    color: (activeRequest.signSpaceHeight || 96) === 96 ? "#ffffff" : "#334155",
                    fontWeight: (activeRequest.signSpaceHeight || 96) === 96 ? 700 : 400,
                  }}
                  onClick={() =>
                    updateActive((prev) => ({
                      ...prev,
                      signSpaceHeight: 96,
                    }))
                  }
                >
                  Chuẩn (96px)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: (activeRequest.signSpaceHeight || 96) === 130 ? "#2563eb" : "#ffffff",
                    color: (activeRequest.signSpaceHeight || 96) === 130 ? "#ffffff" : "#334155",
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
                  onChange={(e) =>
                    updateActive((prev) => ({
                      ...prev,
                      signSpaceHeight: Number(e.target.value),
                    }))
                  }
                  style={{ width: "80px", cursor: "pointer" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      )}

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
                  box-sizing: border-box !important;
                  vertical-align: middle !important;
                  color: #000000 !important;
                  background: transparent !important;
                  overflow: hidden !important; /* Tuyệt đối không tràn ra ngoài ô */
                }
                #approvalPrintPortal .phenikaa-print-grid th,
                #approvalPrintPortal .phenikaa-print-grid td {
                  border: 1px solid #000000 !important;
                  padding: 2px 2px !important;
                  font-size: 8.5pt !important;
                  line-height: 1.15 !important;
                  box-sizing: border-box !important;
                  overflow: hidden !important;
                }
                #approvalPrintPortal .cell-item-name,
                #approvalPrintPortal .cell-sub-spec {
                  white-space: normal !important;
                  word-break: break-word !important;
                  overflow-wrap: break-word !important;
                  hyphens: auto !important;
                  text-align: left !important;
                  padding: 2px 3px !important;
                }
                #approvalPrintPortal .cell-right,
                #approvalPrintPortal td.cell-right,
                #approvalPrintPortal .cell-sub-price,
                #approvalPrintPortal .cell-sub-amount,
                #approvalPrintPortal .total-amount-cell {
                  text-align: right !important;
                  white-space: nowrap !important;
                  word-break: normal !important;
                  overflow-wrap: normal !important;
                  font-variant-numeric: tabular-nums !important;
                  font-size: ${(activeRequest.supplierColumns?.length || 1) >= 3 ? "7.5pt" : (activeRequest.supplierColumns?.length || 1) === 2 ? "8.5pt" : "9.5pt"} !important;
                  letter-spacing: ${(activeRequest.supplierColumns?.length || 1) >= 3 ? "-0.3px" : (activeRequest.supplierColumns?.length || 1) === 2 ? "-0.2px" : "normal"} !important;
                  padding-right: 2px !important;
                  padding-left: 1px !important;
                  overflow: hidden !important;
                  text-overflow: clip !important;
                }
                #approvalPrintPortal .total-footer-row td.cell-right {
                  font-size: ${(activeRequest.supplierColumns?.length || 1) >= 3 ? "7.5pt" : (activeRequest.supplierColumns?.length || 1) === 2 ? "8.5pt" : "9.5pt"} !important;
                  letter-spacing: ${(activeRequest.supplierColumns?.length || 1) >= 3 ? "-0.3px" : (activeRequest.supplierColumns?.length || 1) === 2 ? "-0.2px" : "normal"} !important;
                  padding-right: 2px !important;
                  padding-left: 1px !important;
                  white-space: nowrap !important;
                  overflow: hidden !important;
                  text-overflow: clip !important;
                  font-weight: 700 !important;
                }
                #approvalPrintPortal .cell-left,
                #approvalPrintPortal td.cell-left {
                  text-align: left !important;
                }
                #approvalPrintPortal .cell-center,
                #approvalPrintPortal td.cell-center {
                  text-align: center !important;
                }
                #approvalPrintPortal .col-stt,
                #approvalPrintPortal .cell-stt,
                #approvalPrintPortal .col-unit,
                #approvalPrintPortal .col-sub-qty,
                #approvalPrintPortal .col-qty,
                #approvalPrintPortal .cell-qty {
                  text-align: center !important;
                  white-space: nowrap !important;
                  word-break: keep-all !important;
                  overflow: hidden !important;
                }
                #approvalPrintPortal .col-qty,
                #approvalPrintPortal .col-sub-qty {
                  white-space: normal !important;
                  line-height: 1.1 !important;
                }
                #approvalPrintPortal th.col-sub-spec,
                #approvalPrintPortal th.col-sub-price,
                #approvalPrintPortal th.col-sub-qty,
                #approvalPrintPortal th.col-sub-amount,
                #approvalPrintPortal th.col-supplier-group {
                  white-space: normal !important;
                  word-break: break-word !important;
                  overflow-wrap: break-word !important;
                  line-height: 1.15 !important;
                  text-align: center !important;
                }
                #approvalPrintPortal .cell-unit {
                  white-space: normal !important;
                  word-break: break-word !important;
                  overflow-wrap: break-word !important;
                  text-align: center !important;
                  line-height: 1.15 !important;
                  padding: 1px 1px !important;
                  overflow: hidden !important;
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
                  <span>{activeRequest.prNumber || ""}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Ngày:</span>{" "}
                  <span>{activeRequest.createdDate || ""}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Đơn vị lập biểu mẫu:</span>{" "}
                  <span>{activeRequest.department || ""}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Căn cứ theo PR số:</span>{" "}
                  <span>
                    {activeRequest.noteRef ||
                      (activeRequest.prNumber ? activeRequest.prNumber : "")}
                  </span>
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

                <table
                  className="phenikaa-print-grid"
                  data-react-managed="true"
                  style={{
                    width: "100%",
                    tableLayout: "fixed",
                    borderCollapse: "collapse",
                    boxSizing: "border-box",
                    margin: 0,
                  }}
                >
                  {renderTableColGroup()}
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        className="col-stt"
                        style={{ width: `${columnWidths[0]}%` }}
                      >
                        STT
                      </th>
                      <th
                        rowSpan={2}
                        className="col-item-name"
                        style={{ width: `${columnWidths[1]}%` }}
                      >
                        Hàng hóa
                      </th>
                      <th
                        rowSpan={2}
                        className="col-qty"
                        style={{ width: `${columnWidths[2]}%` }}
                      >
                        Số
                        <br />
                        lượng
                      </th>
                      <th
                        rowSpan={2}
                        className="col-unit"
                        style={{ width: `${columnWidths[3]}%` }}
                      >
                        ĐVT
                      </th>
                      {activeRequest.supplierColumns.map((sc, sIdx) => {
                        const supTotalWidth = Array.from(
                          { length: subColCountPerSupplier },
                          (_, k) => columnWidths[4 + sIdx * subColCountPerSupplier + k] || 0
                        ).reduce((a, b) => a + b, 0);
                        const supName = sc.shortName?.trim() || sc.supplierName?.trim() || "";
                        return (
                          <th
                            key={`p_head_${sc.colId}`}
                            colSpan={subColCountPerSupplier}
                            className={`col-supplier-group ${sc.isSelected ? "selected-supplier-th" : ""}`}
                            style={{
                              width: `${supTotalWidth}%`,
                              whiteSpace: "normal",
                              wordBreak: "break-word",
                              lineHeight: "1.2",
                              padding: "2px 2px",
                              textAlign: "center",
                              verticalAlign: "middle",
                            }}
                          >
                            {sc.isSelected ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", gap: "1px" }}>
                                <div style={{ fontSize: "7.5pt", fontWeight: 700, color: "#15803d", textTransform: "uppercase" }}>
                                  ★ NCC lựa chọn:
                                </div>
                                <div style={{ fontSize: "8.5pt", fontWeight: 800, color: "#000000", wordBreak: "break-word" }}>
                                  {supName || `(Chưa chọn NCC)`}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: "8.5pt", fontWeight: 700, color: "#000000", wordBreak: "break-word" }}>
                                {supName || `NCC ${sIdx + 1}`}
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                    <tr>
                      {activeRequest.supplierColumns.map((sc, sIdx) => {
                        const baseIdx = 4 + sIdx * subColCountPerSupplier;
                        let offset = 0;
                        return (
                          <React.Fragment key={`p_sub_${sc.colId}`}>
                            {hasQuotedProduct && (() => {
                              const colIdx = baseIdx + offset++;
                              return (
                                <th
                                  className="col-sub-spec"
                                  style={{
                                    width: `${columnWidths[colIdx]}%`,
                                    whiteSpace: "normal",
                                    wordBreak: "break-word",
                                    lineHeight: 1.15,
                                    textAlign: "center",
                                  }}
                                >
                                  {renderQuotedProductHeaderNode(quotedProductTitle)}
                                </th>
                              );
                            })()}
                            {(() => {
                              const colIdx = baseIdx + offset++;
                              return (
                                <th
                                  className="col-sub-price"
                                  style={{ width: `${columnWidths[colIdx]}%` }}
                                >
                                  Đơn giá
                                  <br />
                                  (VNĐ)
                                </th>
                              );
                            })()}
                            {hasSupplierQty && (() => {
                              const colIdx = baseIdx + offset++;
                              return (
                                <th
                                  className="col-sub-qty"
                                  style={{ width: `${columnWidths[colIdx]}%` }}
                                >
                                  Số
                                  <br />
                                  lượng
                                </th>
                              );
                            })()}
                            {(() => {
                              const colIdx = baseIdx + offset++;
                              return (
                                <th
                                  className="col-sub-amount"
                                  style={{ width: `${columnWidths[colIdx]}%` }}
                                >
                                  Thành
                                  <br />
                                  tiền
                                </th>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
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
                                className="cell-center cell-stt"
                              >
                                {row.stt}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-left cell-item-name"
                              >
                                {row.itemName}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center cell-qty"
                              >
                                {row.qty}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center cell-unit"
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
                                      className="cell-left cell-sub-spec"
                                    >
                                      {prodText}
                                    </td>
                                  )}
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-right cell-sub-price"
                                  >
                                    {line.unitPrice
                                      ? formatVND(line.unitPrice)
                                      : "-"}
                                  </td>
                                  {hasSupplierQty && (
                                    <td
                                      rowSpan={maxSubLines}
                                      className="cell-center cell-sub-qty"
                                    >
                                      {line.qty}
                                    </td>
                                  )}
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-right cell-sub-amount"
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
                                  <td className="cell-left cell-sub-spec">{prodText}</td>
                                )}
                                <td className="cell-right cell-sub-price">
                                  {line.unitPrice
                                    ? formatVND(line.unitPrice)
                                    : "-"}
                                </td>
                                {hasSupplierQty && (
                                  <td className="cell-center cell-sub-qty">{line.qty}</td>
                                )}
                                <td className="cell-right cell-sub-amount">
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

                    {/* Dòng tổng tiền in ấn: Phản ánh đúng Chưa VAT hoặc Có VAT */}
                    {activeRequest.vatMode !== "with_vat" ? (
                      <tr className="total-footer-row">
                        <td colSpan={4} className="cell-center bold-cell">
                          Tổng tiền chưa có VAT
                        </td>
                        {activeRequest.supplierColumns.map((sc) => {
                          const totalVal = supplierSubtotals[sc.colId] || 0;
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
                    ) : activeRequest.vatCalculationType === "already_included" ? (
                      <tr className="total-footer-row">
                        <td colSpan={4} className="cell-center bold-cell" style={{ fontWeight: 700 }}>
                          Tổng tiền có VAT (Đã gồm VAT)
                        </td>
                        {activeRequest.supplierColumns.map((sc) => {
                          const totalVal = supplierFinalTotals[sc.colId] || 0;
                          return (
                            <React.Fragment key={`p_tot_${sc.colId}`}>
                              <td colSpan={subColCountPerSupplier - 1} />
                              <td className="cell-right bold-cell" style={{ fontWeight: 800 }}>
                                {totalVal ? formatVND(totalVal) : "-"}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ) : (
                      <>
                        <tr className="total-footer-row">
                          <td colSpan={4} className="cell-center bold-cell" style={{ color: "#334155" }}>
                            Tổng tiền chưa có VAT
                          </td>
                          {activeRequest.supplierColumns.map((sc) => {
                            const subVal = supplierSubtotals[sc.colId] || 0;
                            return (
                              <React.Fragment key={`p_sub_${sc.colId}`}>
                                <td colSpan={subColCountPerSupplier - 1} />
                                <td className="cell-right bold-cell">
                                  {subVal ? formatVND(subVal) : "-"}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                        <tr className="total-footer-row">
                          <td colSpan={4} className="cell-center bold-cell" style={{ color: "#334155" }}>
                            Thuế GTGT (VAT {activeRequest.vatRate ?? 10}%)
                          </td>
                          {activeRequest.supplierColumns.map((sc) => {
                            const vatVal = supplierVatAmounts[sc.colId] || 0;
                            return (
                              <React.Fragment key={`p_vat_${sc.colId}`}>
                                <td colSpan={subColCountPerSupplier - 1} />
                                <td className="cell-right bold-cell">
                                  {vatVal ? `+${formatVND(vatVal)}` : "-"}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                        <tr className="total-footer-row">
                          <td colSpan={4} className="cell-center bold-cell" style={{ fontWeight: 800 }}>
                            TỔNG TIỀN CÓ VAT
                          </td>
                          {activeRequest.supplierColumns.map((sc) => {
                            const finalVal = supplierFinalTotals[sc.colId] || 0;
                            return (
                              <React.Fragment key={`p_fin_${sc.colId}`}>
                                <td colSpan={subColCountPerSupplier - 1} />
                                <td className="cell-right bold-cell" style={{ fontWeight: 800 }}>
                                  {finalVal ? formatVND(finalVal) : "-"}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      </>
                    )}
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
                  <strong style={{ flex: 1, textTransform: "uppercase" }}>
                    {activeRequest.recommendedSupplierName || effectiveRecommendedSupplier}
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
                {(activeRequest.customEvaluationRows || []).map((row) => (
                  <div key={row.id} className="eval-row">
                    <span className="eval-label">{row.label}</span>
                    <span style={{ flex: 1 }}>{row.value}</span>
                  </div>
                ))}
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

              {/* 5.5 Dòng ngày tháng & Kính trình Ban Lãnh đạo (Chuẩn mẫu Phenikaa) */}
          {(() => {
            const dp = parsePrintDate(activeRequest.createdDate);
            return (
              <div
                style={{
                  textAlign: "right",
                  marginTop: "14px",
                  marginBottom: "8px",
                  fontStyle: "italic",
                  fontSize: "10pt",
                  lineHeight: 1.45,
                }}
              >
                <div>
                  Hà Nội, ngày {dp.d} tháng {dp.m} năm {dp.y}
                </div>
                <div style={{ fontWeight: 700 }}>
                  Kính trình Ban Lãnh đạo xem xét và phê duyệt!
                </div>
              </div>
            );
          })()}

          {/* 6. Chữ ký đa cột */}
              {(() => {
                const totalCols = 3 + (activeRequest.customSigners?.length || 0);
                const colWidth = `${(100 / totalCols).toFixed(2)}%`;
                return (
                  <table className="phenikaa-sign-table" data-react-managed="true" style={{ width: "100%", tableLayout: "fixed" }}>
                    <tbody>
                      <tr>
                        <td className="sign-col" style={{ width: colWidth }}>
                          <div className="sign-title">Lãnh đạo phê duyệt</div>
                          <div
                            className="sign-space"
                            style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                          />
                          <div className="sign-name">
                            {activeRequest.approverLeader}
                          </div>
                        </td>
                        {(activeRequest.customSigners || []).map((cs) => (
                          <td
                            key={cs.id}
                            className="sign-col"
                            style={{ width: colWidth }}
                          >
                            <div className="sign-title">{cs.title || "Bộ phận chuyên môn"}</div>
                            <div
                              className="sign-space"
                              style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                            />
                            <div className="sign-name">
                              {cs.name}
                            </div>
                          </td>
                        ))}
                        <td className="sign-col" style={{ width: colWidth }}>
                          <div className="sign-title">Trưởng bộ phận</div>
                          <div
                            className="sign-space"
                            style={{ height: `${activeRequest.signSpaceHeight || 96}px` }}
                          />
                          <div className="sign-name">
                            {activeRequest.approverDeptHead}
                          </div>
                        </td>
                        <td className="sign-col" style={{ width: colWidth }}>
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
                );
              })()}
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
    const effectivePoNumber = poCreateNumberManual
      ? poCreateCustomNumber.trim()
      : (poCreateCustomNumber && poCreateCustomNumber.trim())
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
                  value={poCreateNumberManual ? poCreateCustomNumber : (poCreateCustomNumber || fallbackAutoCode)}
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
                  background: isButtonDisabled || isSubmittingPO ? "#94a3b8" : "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
                  color: "#ffffff",
                  cursor: isButtonDisabled || isSubmittingPO ? "not-allowed" : "pointer",
                  boxShadow: isButtonDisabled || isSubmittingPO ? "none" : "0 2px 8px rgba(34, 82, 246, 0.35)",
                }}
                disabled={isButtonDisabled || isSubmittingPO}
                onClick={() => {
                  if (isButtonDisabled || isSubmittingPO) return;
                  setIsSubmittingPO(true);
                  onCreatePOFromApproval(poCreateModalReq, poCreateVatRate, effectivePoNumber);
                  setPoCreateModalReq(null);
                  setTimeout(() => setIsSubmittingPO(false), 800);
                }}
              >
                <PackagePlus size={16} /> {isSubmittingPO ? "Đang tạo..." : "Xác nhận tạo PO"}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${sourceModalMode === "compare" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSourceModalMode("compare")}
              >
                📊 Từ Bảng So sánh giá PR
              </button>
              <button
                type="button"
                className={`btn btn-sm ${sourceModalMode === "pr" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSourceModalMode("pr")}
              >
                📋 Từ PR trực tiếp
              </button>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-teal"
              onClick={() => {
                setSourceModalMode(null);
                handleCreateManual();
              }}
              title="Tạo tờ trình ĐNPD độc lập không liên kết PR"
            >
              ➕ Tạo phiếu ĐNPD mới (Trắng)
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
                        <div style={{ fontWeight: 700, color: "#2B6DF8" }}>
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
