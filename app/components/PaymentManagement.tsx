"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  FileText,
  Minimize2,
  Maximize2,
  Table,
  LayoutGrid,
  Printer,
  Pencil,
  Trash2,
  X,
  Settings,
  Check,
  Paperclip,
  Circle,
  CheckCircle2,
  ClipboardPaste,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Save,
  ArrowLeft,
} from "lucide-react";
import {
  PO,
  Payment,
  Supplier,
  PaymentRequestEntry,
  PaymentGroup,
  PaymentPrintTemplate,
  PaymentDetailLine,
  Item,
  PR,
  getPOContractInfo,
  buildPOPaymentDescription,
  isItemHidden,
} from "../types";
import { dateVN } from "../utils";
import { useTranslation } from "../i18n";
import {
  DEFAULT_PAYMENT_TEMPLATE,
  PAID_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  DEFAULT_DOCS,
  fmtMoney,
  parseMoney,
  moneyWords,
  normName,
  localToday,
  parsePrintDate,
  parseFlexibleDate,
  BANK_SUGGESTIONS,
} from "../payment-utils";
import "../payment.css";
import { useIsMobile } from "../useIsMobile";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { InvoiceScanControl } from "./InvoiceScanControl";
import { PaymentPrintSheet } from "./PaymentPrintSheet";
import { isPaymentCompleted, syncPaymentCompletionToPO } from "../utils/paymentSync";

export const isPOContract = (p: PO): boolean =>
  p.number.startsWith("HĐ-") ||
  Boolean(p.contractNote && p.contractNote.trim().length > 0) ||
  Boolean(p.prNumber && p.prNumber.toLowerCase().includes("hợp đồng"));

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: number | string;
  onValueChange: (val: number) => void;
}

export function MoneyInput({
  value,
  onValueChange,
  className,
  style,
  placeholder = "0",
  ...rest
}: MoneyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawStr, setRawStr] = useState<string>(() => {
    const n = parseMoney(value);
    return n === 0 ? "" : String(n);
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<any>(null);
  const lastCommittedRef = useRef<number>(parseMoney(value));

  // Sync with value prop when not focused
  useEffect(() => {
    if (!isFocused) {
      const n = parseMoney(value);
      setRawStr(n === 0 ? "" : String(n));
      lastCommittedRef.current = n;
    }
  }, [value, isFocused]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const commitValue = (valStr: string) => {
    const num = parseInt(valStr.replace(/\D/g, ""), 10) || 0;
    if (num !== lastCommittedRef.current) {
      lastCommittedRef.current = num;
      onValueChange(num);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only keep clean digits while user is typing (prevents Unikey repeating keys & caret jumps)
    const digits = e.target.value.replace(/\D/g, "");
    setRawStr(digits);

    // Debounce commit to parent state (400ms) so active typing is buttery smooth
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      commitValue(digits);
    }, 400);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    const n = parseMoney(value);
    setRawStr(n === 0 ? "" : String(n));
    // Select all on focus so user can immediately type a replacement
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.select();
      }
    }, 0);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    commitValue(rawStr);
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      commitValue(rawStr);
      e.currentTarget.blur();
    }
    if (rest.onKeyDown) {
      rest.onKeyDown(e);
    }
  };

  // When focused: display raw unformatted digits (prevents Unikey repeating keys & caret jumps)
  // When blurred: display formatted money with comma thousand separators
  const displayVal = isFocused
    ? rawStr
    : parseMoney(value) === 0
    ? ""
    : parseMoney(value).toLocaleString("en-US");

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      className={className}
      style={style}
      placeholder={placeholder}
      value={displayVal}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      {...rest}
    />
  );
}

export type ColumnId =
  | "stt"
  | "payee_name"
  | "group_code"
  | "description"
  | "item_name"
  | "invoice_no"
  | "invoice_date"
  | "amount"
  | "currency"
  | "documents"
  | "request_date"
  | "payment_type"
  | "status"
  | "doc_supplement"
  | "address"
  | "account_no"
  | "bank"
  | "created_by_name";

export interface ColumnSetting {
  id: ColumnId;
  label: string;
  minWidth: number;
  width: number;
  visible: boolean;
  pinned: boolean;
}

export const DEFAULT_COLUMN_SETTINGS: ColumnSetting[] = [
  { id: "stt", label: "A · STT", minWidth: 50, width: 55, visible: false, pinned: false },
  { id: "payee_name", label: "B · NCC", minWidth: 160, width: 200, visible: true, pinned: true },
  { id: "group_code", label: "C · Nhóm PO", minWidth: 120, width: 145, visible: true, pinned: false },
  { id: "description", label: "D · Nội dung TT", minWidth: 180, width: 240, visible: true, pinned: false },
  { id: "item_name", label: "E · Hàng hóa/DV", minWidth: 150, width: 190, visible: true, pinned: false },
  { id: "invoice_no", label: "F · Số HĐ", minWidth: 155, width: 185, visible: true, pinned: false },
  { id: "invoice_date", label: "Ngày HĐ", minWidth: 110, width: 125, visible: true, pinned: false },
  { id: "amount", label: "G · Số tiền", minWidth: 120, width: 145, visible: true, pinned: false },
  { id: "currency", label: "Tiền tệ", minWidth: 65, width: 75, visible: true, pinned: false },
  { id: "documents", label: "H · Hồ sơ", minWidth: 105, width: 125, visible: true, pinned: false },
  { id: "request_date", label: "I · Ngày ĐNTT", minWidth: 110, width: 125, visible: true, pinned: false },
  { id: "payment_type", label: "J · Loại TT", minWidth: 115, width: 130, visible: true, pinned: false },
  { id: "status", label: "K · Trạng thái", minWidth: 135, width: 160, visible: false, pinned: false },
  { id: "doc_supplement", label: "L · Bổ sung HS", minWidth: 120, width: 140, visible: true, pinned: false },
  { id: "address", label: "M · Địa chỉ", minWidth: 150, width: 200, visible: true, pinned: false },
  { id: "account_no", label: "N · Số TK", minWidth: 115, width: 135, visible: true, pinned: false },
  { id: "bank", label: "O · Ngân hàng", minWidth: 140, width: 180, visible: true, pinned: false },
  { id: "created_by_name", label: "Người tạo", minWidth: 100, width: 120, visible: true, pinned: false },
];

export interface PaymentManagementProps {
  paymentRequests?: PaymentRequestEntry[];
  paymentGroups?: PaymentGroup[];
  paymentTemplate?: PaymentPrintTemplate;
  pos?: PO[];
  suppliers?: Supplier[];
  products?: Item[];
  prs?: PR[];
  onUpdateState: (patch: {
    paymentRequests?: PaymentRequestEntry[];
    paymentGroups?: PaymentGroup[];
    paymentTemplate?: PaymentPrintTemplate;
    pos?: PO[];
  }) => void;
  onUpdatePO?: (po: PO) => void;
  onToggleCompletePayment?: (r: PaymentRequestEntry) => void;
  onMoveToTrash?: (type: "PAYMENT", label: string, data: any, msg?: string) => void;
  readOnly?: boolean;
  initialSearchQuery?: string;
  initialActiveId?: number;
  autoOpenCreate?: boolean;
  onClearAutoCreate?: () => void;
}

export function PaymentManagement({
  paymentRequests = [],
  paymentGroups = [],
  paymentTemplate = DEFAULT_PAYMENT_TEMPLATE,
  pos = [],
  suppliers = [],
  products = [],
  prs = [],
  onUpdateState,
  readOnly = false,
  initialSearchQuery,
  initialActiveId,
  onUpdatePO,
  onToggleCompletePayment,
  onMoveToTrash,
  autoOpenCreate = false,
  onClearAutoCreate,
}: PaymentManagementProps) {
  // Mobile / Desktop & Card view detection
  const isAutoMobile = useIsMobile(768);
  const [userMobileToggle, setUserMobileToggle] = useState<boolean | null>(null);
  const isPhoneScreen = isAutoMobile;
  const { t } = useTranslation();

  useEffect(() => {
    if (autoOpenCreate) {
      setPoFilterType("all");
      setPoSearch("");
      setShowPOPickerModal(true);
      onClearAutoCreate?.();
    }
  }, [autoOpenCreate]);

  const getPaymentColLabel = (id: string, fallback: string) => {
    switch (id) {
      case "stt": return t("table.stt");
      case "payee_name": return t("table.supplier");
      case "group_code": return t("table.contract_no");
      case "description": return t("table.payment_content");
      case "item_name": return t("table.item_name");
      case "invoice_no": return t("table.invoice_no");
      case "invoice_date": return t("table.invoice_date");
      case "amount": return t("table.amount");
      case "currency": return t("table.unit");
      case "documents": return t("table.documents");
      case "request_date": return t("table.request_date");
      case "payment_type": return t("table.payment_type");
      case "status": return t("table.status");
      case "address": return t("table.address");
      default: return fallback;
    }
  };

  const isCardView = userMobileToggle !== null ? userMobileToggle : true;
  const showMobileCards = isCardView;

  // Card view Edit modal state (allows editing on computer in card mode)
  const [editModalReqId, setEditModalReqId] = useState<number | null>(null);

  // Active Workspace Payment ID (WYSIWYG A4 Paper Workspace)
  const [activeWorkspacePaymentId, setActiveWorkspacePaymentId] = useState<number | null>(() => {
    return initialActiveId !== undefined ? initialActiveId : null;
  });
  const [localPaymentDraft, setLocalPaymentDraft] = useState<PaymentRequestEntry | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [printOrientation, setPrintOrientation] = useState<"portrait" | "landscape">("portrait");
  const [workspaceToast, setWorkspaceToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setWorkspaceToast(msg);
    setTimeout(() => {
      setWorkspaceToast((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Multi-invoice manager modal state
  const [multiInvoiceModalReqId, setMultiInvoiceModalReqId] = useState<number | null>(null);

  // Column settings modal & persisted column order
  const [showColumnConfigModal, setShowColumnConfigModal] = useState(false);
  const [draggedColId, setDraggedColId] = useState<ColumnId | null>(null);

  const [columns, setColumns] = useState<ColumnSetting[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const validIds = new Set(DEFAULT_COLUMN_SETTINGS.map((d) => d.id));
        const saved = localStorage.getItem("scmh_payment_columns_v5");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const defaultMap = new Map(DEFAULT_COLUMN_SETTINGS.map((d) => [d.id, d]));
            const validParsed = parsed.filter((p: any) => p && validIds.has(p.id));
            if (validParsed.length > 0) {
              const existingIds = new Set(validParsed.map((p: any) => p.id));
              const merged = validParsed.map((p: any) => {
                const def = defaultMap.get(p.id)!;
                return {
                  id: p.id,
                  label: def.label, // Always use canonical clean system label
                  minWidth: def.minWidth,
                  width: Number(p.width) || def.width || def.minWidth,
                  visible: p.visible !== undefined ? p.visible : def.visible,
                  pinned: p.pinned !== undefined ? p.pinned : def.pinned,
                };
              });
              const missing = DEFAULT_COLUMN_SETTINGS.filter((d) => !existingIds.has(d.id));
              return [...merged, ...missing];
            }
          }
        }
      } catch {}
    }
    return DEFAULT_COLUMN_SETTINGS;
  });

  const saveColumns = (newCols: ColumnSetting[]) => {
    setColumns(newCols);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("scmh_payment_columns_v5", JSON.stringify(newCols));
        localStorage.removeItem("scmh_payment_columns_v4");
        localStorage.removeItem("scmh_payment_columns_v3");
      } catch {}
    }
  };

  // Column resizing state & mouse handlers
  const resizingRef = useRef<{
    colId: ColumnId;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [resizingColId, setResizingColId] = useState<ColumnId | null>(null);

  const handleStartResize = (colId: ColumnId, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const targetCol = columns.find((c) => c.id === colId);
    if (!targetCol) return;

    const startX = e.clientX;
    const startWidth = targetCol.width || targetCol.minWidth || 120;

    resizingRef.current = { colId, startX, startWidth };
    setResizingColId(colId);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = moveEvent.clientX - resizingRef.current.startX;
      const minW = targetCol.minWidth || 50;
      const nextWidth = Math.max(minW, Math.round(resizingRef.current.startWidth + delta));

      setColumns((prevCols) =>
        prevCols.map((c) =>
          c.id === resizingRef.current?.colId ? { ...c, width: nextWidth } : c
        )
      );
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        setColumns((latestCols) => {
          saveColumns(latestCols);
          return latestCols;
        });
      }
      resizingRef.current = null;
      setResizingColId(null);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleDoubleClickResize = (colId: ColumnId, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const def = DEFAULT_COLUMN_SETTINGS.find((d) => d.id === colId);
    if (!def) return;
    const next = columns.map((c) =>
      c.id === colId ? { ...c, width: def.width || def.minWidth } : c
    );
    saveColumns(next);
  };

  // Selection states
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const toggleCheck = (id: number, checked: boolean) => {
    const next = new Set(checkedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setCheckedIds(next);
  };
  const [activeRequestId, setActiveRequestId] = useState<number | null>(() =>
    initialActiveId !== undefined ? initialActiveId : paymentRequests[0]?.id ?? null
  );

  // Filter states
  const [searchQuery, setSearchQuery] = useState(() => initialSearchQuery || "");

  const [highlightedRowId, setHighlightedRowId] = useState<number | null>(() =>
    initialActiveId !== undefined ? initialActiveId : null
  );

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (initialActiveId !== undefined && initialActiveId !== null) {
      const match = paymentRequests.find(
        (r) => r.id === initialActiveId || Number(r.legacy_stt) === Number(initialActiveId)
      );
      const targetId = match ? match.id : initialActiveId;

      // Nếu bộ lọc hiện tại đang ẩn dòng cần xem, tự động giải phóng bộ lọc để dòng hiển thị
      if (match) {
        if (statusFilter) {
          const isPaid = isPaymentCompleted(match);
          if ((statusFilter === "Đã thanh toán" && !isPaid) || (statusFilter === "Chưa thanh toán" && isPaid)) {
            setStatusFilter("");
          }
        }
        if (groupFilter && String(match.group_id || "") !== String(groupFilter)) {
          setGroupFilter("");
        }
      }

      setActiveRequestId(targetId);
      setHighlightedRowId(targetId);

      // Tự động cuộn mượt mà đến dòng vừa chọn
      const scrollTimer = setTimeout(() => {
        const rowEl = document.getElementById(`payment-row-${targetId}`);
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);

      // Xóa hiệu ứng highlight vàng sau 1.6 giây
      const clearTimer = setTimeout(() => {
        setHighlightedRowId((prev) => (prev === targetId ? null : prev));
      }, 1600);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [initialActiveId, paymentRequests]);
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);
  const [showHidden, setShowHidden] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("scmh_payment_show_hidden") === "true";
    }
    return false;
  });

  const toggleShowHidden = () => {
    setShowHidden((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("scmh_payment_show_hidden", String(next));
      }
      return next;
    });
  };

  const hiddenCount = useMemo(() => {
    return paymentRequests.filter((r) => isItemHidden(r)).length;
  }, [paymentRequests]);

  const handleToggleHideRequest = (id: number, currentHidden: boolean) => {
    if (readOnly) return;
    const nextHidden = !currentHidden;
    handleEditRequest(id, { isHidden: nextHidden, is_hidden: nextHidden });
  };

  const handleHideSelectedRequests = (hide: boolean) => {
    if (readOnly || checkedIds.size === 0) return;
    const next = paymentRequests.map((r) => {
      if (!checkedIds.has(r.id)) return r;
      return { ...r, isHidden: hide, is_hidden: hide };
    });
    onUpdateState?.({ paymentRequests: next });
    setCheckedIds(new Set());
  };

  const [unlockedReqIds, setUnlockedReqIds] = useState<Set<number>>(new Set());

  const toggleUnlockReq = (id: number) => {
    setUnlockedReqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleComplete = (r: PaymentRequestEntry) => {
    if (readOnly) return;
    if (onToggleCompletePayment) {
      onToggleCompletePayment(r);
      return;
    }
    const isDone = isPaymentCompleted(r);
    const willComplete = !isDone;

    const { updatedReq, updatedPOs, linkedPO } = syncPaymentCompletionToPO(r, willComplete, pos);

    const nextRequests = paymentRequests.map((item) => (item.id === r.id ? updatedReq : item));

    onUpdateState({
      paymentRequests: nextRequests,
      ...(updatedPOs && updatedPOs.length > 0 ? { pos: updatedPOs } : {}),
    });

    if (onUpdatePO && linkedPO) {
      const freshPO = updatedPOs.find((p) => p.id === linkedPO.id);
      if (freshPO) onUpdatePO(freshPO);
    }
  };

  // Modals state
  const [docModalReqId, setDocModalReqId] = useState<number | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [customDocTypes, setCustomDocTypes] = useState<string[]>(DEFAULT_DOCS);

  const [showPOPickerModal, setShowPOPickerModal] = useState(false);
  const [poSearch, setPoSearch] = useState("");
  const [poFilterType, setPoFilterType] = useState<"all" | "po" | "contract">("all");
  const [poSelectedMilestone, setPoSelectedMilestone] = useState<Record<number, string>>({});
  const [linkDocModalTargetReqId, setLinkDocModalTargetReqId] = useState<number | null>(null);
  const contractCount = useMemo(() => pos.filter(isPOContract).length, [pos]);
  const poOnlyCount = useMemo(() => pos.length - contractCount, [pos, contractCount]);

  // Print portal states
  const [isPrinting, setIsPrinting] = useState(false);
  const [printEntriesList, setPrintEntriesList] = useState<PaymentRequestEntry[]>([]);

  // Hidden date picker ref
  const calendarPickerRef = useRef<HTMLInputElement>(null);
  const calendarCbRef = useRef<((dateVal: string) => void) | null>(null);

  // Keep activeRequestId valid
  useEffect(() => {
    if (activeRequestId === null && paymentRequests.length > 0) {
      setActiveRequestId(paymentRequests[0].id);
    }
  }, [paymentRequests, activeRequestId]);

  // Active Request
  const activeReq = useMemo(
    () => paymentRequests.find((r) => r.id === activeRequestId) || paymentRequests[0] || null,
    [paymentRequests, activeRequestId]
  );

  // Filtered requests for DATA table (sắp xếp số thứ tự từ dưới lên trên, số to ở trên)
  const filteredRequests = useMemo(() => {
    const rawQ = searchQuery.trim();
    const tokens = rawQ ? normName(rawQ).split(/\s+/).filter(Boolean) : [];

    const list = paymentRequests.filter((r) => {
      // 0. Ẩn/Hiện thẻ tùy thích: nếu không bật showHidden thì bỏ qua thẻ đã ẩn
      if (!showHidden && isItemHidden(r)) return false;

      // 1. Bộ lọc trạng thái (chỉ 2 trạng thái: Đã thanh toán hoặc Chưa thanh toán)
      if (statusFilter) {
        const isPaid = isPaymentCompleted(r);
        if (statusFilter === "Đã thanh toán" && !isPaid) return false;
        if (statusFilter === "Chưa thanh toán" && isPaid) return false;
      }

      // 2. Bộ lọc nhóm
      if (groupFilter && String(r.group_id || "") !== String(groupFilter)) return false;

      // 3. Tìm kiếm theo từ khóa đa trường (NCC, STT, nội dung, hóa đơn, số tiền, nhóm, dòng chi tiết...)
      if (tokens.length > 0) {
        // Nhóm liên quan
        const grp = paymentGroups.find(
          (g) => String(g.id) === String(r.group_id) || (r.group_code && g.code === r.group_code)
        );

        // Nhà cung cấp liên quan
        const supp = suppliers.find(
          (s) =>
            normName(s.name) === normName(r.payee_name) ||
            (s.shortName && normName(s.shortName) === normName(r.payee_name)) ||
            (r.beneficiary_id && s.id === r.beneficiary_id)
        );

        // Chi tiết từng dòng hàng hóa/hóa đơn
        const linesText = (r.lines || [])
          .map(
            (l) =>
              `${l.description || ""} ${l.invoice_no || ""} ${l.amount || ""} ${fmtMoney(l.amount)} ${l.note || ""}`
          )
          .join(" ");

        // Xây dựng kho dữ liệu tìm kiếm toàn diện cho dòng đề nghị
        const corpus = [
          // STT
          r.legacy_stt,
          `stt ${r.legacy_stt || ""}`,
          `stt${r.legacy_stt || ""}`,
          r.id,
          `stt ${r.id}`,
          `#${r.legacy_stt || r.id}`,
          // Nhà cung cấp & Thụ hưởng
          r.payee_name,
          supp?.name,
          supp?.shortName,
          supp?.code,
          // Nhóm thanh toán & Mã PO
          r.group_code,
          grp?.code,
          grp?.name,
          // Nội dung & Hàng hóa
          r.description,
          r.item_name,
          linesText,
          // Số hóa đơn & Ngày
          r.invoice_no,
          r.invoice_date,
          r.request_date,
          // Số tiền & Tiền tệ
          String(r.amount || ""),
          fmtMoney(r.amount),
          r.currency,
          // Loại thanh toán & Trạng thái
          r.payment_type,
          r.status,
          r.doc_supplement,
          (r.documents || []).join(" "),
          // Ngân hàng & Tài khoản
          r.address,
          r.account_no,
          (r.account_no || "").replace(/[\s.-]/g, ""),
          r.bank,
          r.created_by_name,
          // Người đề nghị / Người tạo từ template mẫu (phòng trường hợp bản ghi chưa lưu created_by_name)
          paymentTemplate?.default_requester_name,
          paymentTemplate?.sign4_name,
          `người tạo ${r.created_by_name || paymentTemplate?.default_requester_name || ""}`,
          `người đề nghị ${r.created_by_name || paymentTemplate?.default_requester_name || ""}`,
          `ncc ${r.payee_name || ""}`,
          `thụ hưởng ${r.payee_name || ""}`,
        ]
          .filter(Boolean)
          .join(" ");

        const normCorpus = normName(corpus);
        const corpusDigits = corpus.replace(/\D/g, "");

        // Mọi token người dùng gõ đều phải được tìm thấy (hỗ trợ gõ nhiều từ cách nhau dấu cách)
        const allMatched = tokens.every((token) => {
          if (normCorpus.includes(token)) return true;
          // Nếu token có chữ số (số tiền có dấu chấm, số tài khoản, số hóa đơn...)
          const tokenDigits = token.replace(/\D/g, "");
          if (tokenDigits && corpusDigits.includes(tokenDigits)) return true;
          return false;
        });

        if (!allMatched) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      // Giữ nguyên thứ tự mới ở trên, cũ ở dưới (không đẩy mục đã hoàn tất xuống dưới)
      const na = Number(a.legacy_stt || a.id) || 0;
      const nb = Number(b.legacy_stt || b.id) || 0;
      if (nb !== na) return nb - na;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }, [paymentRequests, searchQuery, statusFilter, groupFilter, showHidden, paymentGroups, suppliers, paymentTemplate]);

  // Cập nhật activeRequestId hiển thị mục đầu tiên khi kết quả tìm kiếm thay đổi
  useEffect(() => {
    if (filteredRequests.length > 0) {
      if (!filteredRequests.some((r) => r.id === activeRequestId)) {
        setActiveRequestId(filteredRequests[0].id);
      }
    }
  }, [filteredRequests, activeRequestId]);

  // Suggestion lists for autocomplete datalists
  const bankSuggestions = useMemo(() => {
    const set = new Set<string>(BANK_SUGGESTIONS);
    suppliers.forEach((s) => {
      if (s.bank?.trim()) set.add(s.bank.trim());
    });
    paymentRequests.forEach((r) => {
      if (r.bank?.trim()) set.add(r.bank.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [suppliers, paymentRequests]);

  const itemSuggestions = useMemo(() => {
    const set = new Set<string>();
    (products || []).forEach((p) => {
      if (p.name?.trim()) set.add(p.name.trim());
    });
    (prs || []).forEach((pr) => {
      (pr.items || []).forEach((it) => {
        if (it.name?.trim()) set.add(it.name.trim());
      });
    });
    (pos || []).forEach((p) => {
      (p.items || []).forEach((it) => {
        if (it.name?.trim()) set.add(it.name.trim());
      });
    });
    paymentRequests.forEach((r) => {
      if (r.item_name?.trim()) set.add(r.item_name.trim());
      (r.lines || []).forEach((l) => {
        if (l.description?.trim()) set.add(l.description.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [products, prs, pos, paymentRequests]);

  const descSuggestions = useMemo(() => {
    const defaults = [
      "Thanh toán 100% tiền hàng",
      "Thanh toán tạm ứng hợp đồng",
      "Thanh toán đợt 1",
      "Thanh toán đợt 2",
      "Thanh toán đợt 3",
      "Thanh toán quyết toán hợp đồng",
      "Thanh toán theo hợp đồng",
      "Thanh toán phí dịch vụ",
      "Thanh toán bảo trì / sửa chữa",
      "Thanh toán mua sắm thiết bị",
      "Thanh toán mua hóa chất / dung môi",
      "Thanh toán mua bao bì / tá dược",
    ];
    const set = new Set<string>(defaults);
    paymentRequests.forEach((r) => {
      if (r.description?.trim()) set.add(r.description.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests]);

  const invoiceSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentRequests.forEach((r) => {
      if (r.invoice_no?.trim()) set.add(r.invoice_no.trim());
      (r.lines || []).forEach((l) => {
        if (l.invoice_no?.trim()) set.add(l.invoice_no.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests]);

  const docSupplementSuggestions = useMemo(() => {
    const defaults = [
      "Đầy đủ hồ sơ",
      "Chờ hóa đơn gốc",
      "Chờ biên bản bàn giao",
      "Chờ biên bản nghiệm thu",
      "Chờ chứng từ CO/CQ",
      "Chờ bảo lãnh ngân hàng",
      "Đã nộp KT bản cứng",
      "Bổ sung phiếu xuất kho",
    ];
    const set = new Set<string>(defaults);
    paymentRequests.forEach((r) => {
      if (r.doc_supplement?.trim()) set.add(r.doc_supplement.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests]);

  const requesterSuggestions = useMemo(() => {
    const set = new Set<string>();
    if (paymentTemplate.default_requester_name) set.add(paymentTemplate.default_requester_name);
    set.add("Trần Hải Hà");
    paymentRequests.forEach((r) => {
      if (r.created_by_name?.trim()) set.add(r.created_by_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests, paymentTemplate]);

  const groupSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentGroups.forEach((g) => {
      if (g.code?.trim()) set.add(g.code.trim());
    });
    (pos || []).forEach((p) => {
      if (p.number?.trim()) set.add(p.number.trim());
    });
    paymentRequests.forEach((r) => {
      if (r.group_code?.trim()) set.add(r.group_code.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentGroups, pos, paymentRequests]);

  // Request edits (supports single key-value or patch object for atomic updates)
  const handleEditRequest = (
    id: number,
    patchOrKey: keyof PaymentRequestEntry | Partial<PaymentRequestEntry>,
    val?: any
  ) => {
    if (readOnly) return;
    const patch: Partial<PaymentRequestEntry> =
      typeof patchOrKey === "string" ? { [patchOrKey]: val } : patchOrKey;

    const next = paymentRequests.map((r) => {
      if (r.id === id) {
        const updated = { ...r, ...patch };
        if ("payee_name" in patch) {
          const valName = patch.payee_name || "";
          if (!valName.trim()) {
            updated.payee_name = valName;
            updated.beneficiary_id = undefined;
          } else {
            const match = suppliers.find(
              (s) =>
                normName(s.name) === normName(valName) ||
                (s.shortName && normName(s.shortName) === normName(valName)) ||
                (s.code && normName(s.code) === normName(valName))
            );
            if (match) {
              updated.payee_name = valName;
              updated.beneficiary_id = match.id;
              if (match.address) updated.address = match.address;
              if (match.bankAccount) updated.account_no = match.bankAccount;
              if (match.bank) updated.bank = match.bank;
            } else {
              updated.payee_name = valName;
              updated.beneficiary_id = undefined;
            }
          }
        }
        if ("group_code" in patch) {
          const valCode = patch.group_code || "";
          if (!valCode.trim()) {
            updated.group_code = valCode;
            updated.group_id = undefined;
          } else {
            const g = paymentGroups.find(
              (x) => normName(x.code) === normName(valCode) || normName(x.name) === normName(valCode)
            );
            updated.group_id = g ? g.id : undefined;
          }
        }
        if ("status" in patch) {
          const isPaid = patch.status === "Đã thanh toán" || PAID_STATUSES.includes(patch.status as string);
          updated.isCompleted = isPaid;
          updated.status = isPaid ? "Đã thanh toán" : "Chưa thanh toán";
          if (isPaid && !updated.paidAt) updated.paidAt = new Date().toISOString();
          if (!isPaid) updated.paidAt = undefined;
        }
        return updated;
      }
      return r;
    });
    onUpdateState({ paymentRequests: next });

    // Đồng bộ ngược thông tin hóa đơn & bản scan về đợt thanh toán của PO đã liên kết (nếu có)
    if (
      onUpdatePO &&
      ("invoice_no" in patch ||
        "invoice_date" in patch ||
        "invoice_scan_url" in patch ||
        "invoice_scan_name" in patch)
    ) {
      const updatedReq = next.find((r) => r.id === id);
      if (updatedReq) {
        const linkedPO = pos.find((po) =>
          (po.payments || []).some((p) => p.paymentRequestId === id)
        );
        if (linkedPO) {
          onUpdatePO({
            ...linkedPO,
            payments: (linkedPO.payments || []).map((p) =>
              p.paymentRequestId === id
                ? {
                    ...p,
                    invoiceNo:
                      "invoice_no" in patch ? updatedReq.invoice_no || "" : p.invoiceNo,
                    invoiceDate:
                      "invoice_date" in patch ? updatedReq.invoice_date || "" : p.invoiceDate,
                    invoiceScanUrl:
                      "invoice_scan_url" in patch ? updatedReq.invoice_scan_url : p.invoiceScanUrl,
                    invoiceScanName:
                      "invoice_scan_name" in patch
                        ? updatedReq.invoice_scan_name
                        : p.invoiceScanName,
                  }
                : p
            ),
          });
        }
      }
    }
  };

  // Toggle paid status on mobile and cards
  const handleTogglePaid = (reqId: number, nextPaid: boolean) => {
    if (readOnly) return;
    const req = paymentRequests.find((r) => r.id === reqId);
    if (req && onToggleCompletePayment) {
      const isDone = isPaymentCompleted(req);
      if (isDone !== nextPaid) {
        onToggleCompletePayment(req);
        return;
      }
    }
    const targetStatus = nextPaid ? "Đã thanh toán" : "Chưa thanh toán";
    handleEditRequest(reqId, {
      status: targetStatus,
      isCompleted: nextPaid,
      paidAt: nextPaid ? new Date().toISOString() : undefined,
    });
  };

  const handleAddRequestRow = () => {
    if (readOnly) return;
    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt) || 0)) + 1;
    const newReq: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: String(maxStt).padStart(2, "0"),
      payee_name: "",
      group_code: "",
      description: "",
      item_name: "",
      invoice_no: "",
      invoice_date: "",
      amount: "0",
      currency: "VND",
      documents: [],
      request_date: localToday(),
      payment_type: "TT trước 100%",
      status: "Chưa thanh toán",
      isCompleted: false,
      address: "",
      account_no: "",
      bank: "",
      created_by_name: paymentTemplate.default_requester_name || "Trần Hải Hà",
      lines: [
        {
          description: "",
          invoice_no: "",
          invoice_date: "",
          amount: 0,
        },
      ],
    };
    const next = [newReq, ...paymentRequests];
    onUpdateState({ paymentRequests: next });
    setActiveRequestId(maxId);
    setLocalPaymentDraft(JSON.parse(JSON.stringify(newReq)));
    setPrintOrientation("portrait");
    setActiveWorkspacePaymentId(maxId);
    setHasUnsavedChanges(false);
    return maxId;
  };

  const handleOpenPaymentWorkspace = (id: number) => {
    const target = paymentRequests.find((r) => r.id === id);
    if (target) {
      setLocalPaymentDraft(JSON.parse(JSON.stringify(target)));
      setPrintOrientation((target.printOrientation as "portrait" | "landscape") || "portrait");
    }
    setActiveWorkspacePaymentId(id);
    setHasUnsavedChanges(false);
  };

  const handleAddNewFromCardView = () => {
    const newId = handleAddRequestRow();
    if (newId) {
      handleOpenPaymentWorkspace(newId);
    }
  };

  // Cập nhật dữ liệu vào bản nháp cục bộ (KHÔNG gọi API lưu tự động)
  const updateDraft = (updater: (prev: PaymentRequestEntry) => PaymentRequestEntry) => {
    if (readOnly) return;
    setLocalPaymentDraft((current) => {
      const base = current || paymentRequests.find((r) => r.id === activeWorkspacePaymentId);
      if (!base) return current;
      const next = updater(JSON.parse(JSON.stringify(base)));
      setHasUnsavedChanges(true);
      return next;
    });
  };

  // Lưu tường minh khi người dùng bấm nút "Lưu ĐNTT" hoặc nhấn Ctrl + S
  const handleExplicitSavePayment = () => {
    if (!localPaymentDraft || readOnly) return;
    let updatedDraft = { ...localPaymentDraft };
    if (updatedDraft.lines && updatedDraft.lines.length > 0) {
      const total = updatedDraft.lines.reduce((sum, l) => sum + (parseMoney(l.amount) || 0), 0);
      updatedDraft.amount = total;
      const firstLine = updatedDraft.lines[0];
      if (firstLine) {
        if (!updatedDraft.description || updatedDraft.description === updatedDraft.item_name) {
          updatedDraft.description = firstLine.description;
        }
        updatedDraft.item_name = firstLine.description;
        updatedDraft.invoice_no = firstLine.invoice_no;
        updatedDraft.invoice_date = firstLine.invoice_date;
        updatedDraft.doc_supplement = firstLine.note;
      }
    }
    const next = paymentRequests.map((r) => (r.id === updatedDraft.id ? updatedDraft : r));
    onUpdateState({ paymentRequests: next });
    setHasUnsavedChanges(false);
    showToast("💾 Đã lưu thành công Đề nghị thanh toán!");
  };

  // Phím tắt Ctrl + S để lưu nhanh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (localPaymentDraft && !readOnly) {
          handleExplicitSavePayment();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localPaymentDraft, readOnly, paymentRequests]);

  // Quay lại danh sách ĐNTT (kiểm tra thay đổi chưa lưu)
  const handleBackToList = () => {
    if (hasUnsavedChanges) {
      const confirmLeave = window.confirm(
        "Bạn có thay đổi chưa lưu trên Đề nghị thanh toán này.\nBạn có chắc chắn muốn thoát mà KHÔNG lưu không?"
      );
      if (!confirmLeave) return;
    }
    setActiveWorkspacePaymentId(null);
    setLocalPaymentDraft(null);
    setHasUnsavedChanges(false);
  };

  // Cập nhật một trường trên dòng thanh toán chi tiết
  const updateDraftLine = (index: number, field: keyof PaymentDetailLine, val: any) => {
    updateDraft((prev) => {
      const lines = [...(prev.lines || [])];
      if (!lines[index]) return prev;
      lines[index] = { ...lines[index], [field]: val };
      const total = lines.reduce((sum, l) => sum + (parseMoney(l.amount) || 0), 0);
      return {
        ...prev,
        lines,
        amount: total,
      };
    });
  };

  // Thêm một dòng thanh toán mới
  const handleAddDraftLine = () => {
    updateDraft((prev) => {
      const lines = [...(prev.lines || [])];
      lines.push({
        description: "",
        invoice_no: "",
        invoice_date: "",
        amount: 0,
        note: "",
      });
      return {
        ...prev,
        lines,
      };
    });
    showToast("＋ Đã thêm 1 dòng thanh toán mới");
  };

  // Xóa một dòng thanh toán
  const handleRemoveDraftLine = (index: number) => {
    updateDraft((prev) => {
      const lines = (prev.lines || []).filter((_, idx) => idx !== index);
      if (lines.length === 0) {
        lines.push({
          description: "",
          invoice_no: "",
          invoice_date: "",
          amount: 0,
          note: "",
        });
      }
      const total = lines.reduce((sum, l) => sum + (parseMoney(l.amount) || 0), 0);
      return {
        ...prev,
        lines,
        amount: total,
      };
    });
    showToast("✓ Đã xóa dòng thanh toán");
  };

  // Gõ / chọn NCC trong biểu mẫu A4
  const handlePayeeChangeInDraft = (name: string) => {
    const match = suppliers.find(
      (s) =>
        normName(s.name) === normName(name) ||
        (s.shortName && normName(s.shortName) === normName(name)) ||
        (s.code && normName(s.code) === normName(name))
    );
    updateDraft((prev) => ({
      ...prev,
      payee_name: name,
      beneficiary_id: match ? match.id : prev.beneficiary_id,
      address: match?.address ? match.address : prev.address,
      account_no: match?.bankAccount ? match.bankAccount : prev.account_no,
      bank: match?.bank ? match.bank : prev.bank,
    }));
  };

  // Chọn nhanh NCC từ Sidebar
  const handleSelectSupplierIntoDraft = (supId: number | string) => {
    const match = suppliers.find((s) => String(s.id) === String(supId));
    if (!match) return;
    updateDraft((prev) => ({
      ...prev,
      beneficiary_id: match.id,
      payee_name: match.name || match.shortName || prev.payee_name,
      address: match.address || prev.address || "",
      account_no: match.bankAccount || prev.account_no || "",
      bank: match.bank || prev.bank || "",
    }));
    showToast(`✓ Đã điền thông tin NCC: ${match.shortName || match.name}`);
  };

  // Bật/tắt chứng từ đính kèm
  const handleToggleDocInDraft = (docName: string) => {
    updateDraft((prev) => {
      const current = new Set(prev.documents || []);
      if (current.has(docName)) {
        current.delete(docName);
      } else {
        current.add(docName);
      }
      return {
        ...prev,
        documents: Array.from(current),
      };
    });
  };

  // In phiếu từ giao diện làm việc A4
  const handlePrintWorkspacePayment = () => {
    if (!localPaymentDraft) return;
    handlePrintSingle(localPaymentDraft);
  };

  // Xóa đề nghị khi đang mở trong A4
  const handleDeletePaymentInWorkspace = (id: number) => {
    if (readOnly) return;
    const target = paymentRequests.find((r) => r.id === id);
    if (!target) return;
    if (confirm(`Bạn có chắc muốn xóa đề nghị STT ${target.legacy_stt || target.id} (${target.payee_name || "Chưa có NCC"})?`)) {
      if (onMoveToTrash) {
        const label = `ĐNTT ${target.legacy_stt || target.id} - ${target.payee_name || "NCC"}`;
        onMoveToTrash("PAYMENT", label, target, `✓ Đã chuyển ${label} vào thùng rác`);
      }
      const next = paymentRequests.filter((r) => r.id !== id);
      onUpdateState({ paymentRequests: next });
      setActiveWorkspacePaymentId(null);
      setLocalPaymentDraft(null);
      setHasUnsavedChanges(false);
    }
  };

  const handleDeleteSelectedRequests = () => {
    if (readOnly) return;
    if (checkedIds.size === 0 && activeRequestId === null) {
      alert("Vui lòng tích chọn dòng cần xóa");
      return;
    }
    const toDelete = checkedIds.size > 0 ? checkedIds : new Set([activeRequestId!]);
    if (!confirm(`Bạn có chắc muốn xóa ${toDelete.size} dòng đề nghị thanh toán đã chọn?`))
      return;

    const selectedItems = paymentRequests.filter((r) => toDelete.has(r.id));
    if (onMoveToTrash && selectedItems.length > 0) {
      const label = `ĐNTT (${selectedItems.length} hồ sơ)`;
      onMoveToTrash("PAYMENT", label, selectedItems, `✓ Đã chuyển ${label} vào thùng rác`);
    }

    const next = paymentRequests.filter((r) => !toDelete.has(r.id));
    onUpdateState({ paymentRequests: next });
    setCheckedIds(new Set());
    if (activeRequestId && toDelete.has(activeRequestId)) {
      setActiveRequestId(next[0]?.id ?? null);
    }
  };

  const handleDeleteRequest = (id: number) => {
    if (readOnly) return;
    const target = paymentRequests.find((r) => r.id === id);
    if (!target) return;
    if (confirm(`Bạn có chắc muốn xóa đề nghị STT ${target.legacy_stt || target.id} (${target.payee_name || "Chưa có NCC"})?`)) {
      if (onMoveToTrash) {
        const label = `ĐNTT ${target.legacy_stt || target.id} - ${target.payee_name || "NCC"}`;
        onMoveToTrash("PAYMENT", label, target, `✓ Đã chuyển ${label} vào thùng rác`);
      }
      const next = paymentRequests.filter((r) => r.id !== id);
      onUpdateState({ paymentRequests: next });
      if (editModalReqId === id) setEditModalReqId(null);
      if (activeWorkspacePaymentId === id) {
        setActiveWorkspacePaymentId(null);
        setLocalPaymentDraft(null);
      }
      if (activeRequestId === id) setActiveRequestId(next[0]?.id ?? null);
      if (checkedIds.has(id)) {
        const nextChecked = new Set(checkedIds);
        nextChecked.delete(id);
        setCheckedIds(nextChecked);
      }
    }
  };

  // Keyboard navigation for Excel-like Tab / Enter
  const handleTableKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key === "Tab") {
      const editors = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>(
          ".cell-editor:not([disabled])"
        )
      );
      const target = e.target as HTMLElement;
      const idx = editors.indexOf(target as any);
      if (idx >= 0) {
        e.preventDefault();
        const step = e.shiftKey ? -1 : 1;
        const nextIdx = Math.max(0, Math.min(editors.length - 1, idx + step));
        const nextEl = editors[nextIdx];
        if (nextEl) {
          nextEl.focus();
          if (nextEl instanceof HTMLInputElement && nextEl.type !== "date") {
            nextEl.select();
          }
        }
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.matches("input:not([type=checkbox])")) {
        target.blur();
      }
    }
  };

  // Handle direct Excel paste on Payment table (sắp xếp thêm dòng mới lên trên cùng)
  const handlePaymentTablePaste = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
    if (readOnly) return;
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsedRows: PaymentRequestEntry[] = [];
    let maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt || r.id) || 0));

    for (const line of lines) {
      const parts = line.split("\t").map((p) => p.trim());
      if (parts.length === 0 || parts.every((p) => !p)) continue;
      const firstLower = parts[0].toLowerCase();
      if (
        firstLower === "stt" ||
        firstLower === "tt" ||
        firstLower.includes("nhà cung cấp") ||
        firstLower.includes("thụ hưởng") ||
        firstLower.includes("đề nghị thanh toán")
      ) {
        continue;
      }

      let startIdx = 0;
      if (/^\d+$/.test(parts[0]) && parts.length > 1) {
        startIdx = 1;
      }
      const cols = parts.slice(startIdx);

      const payee_name = cols[0] || "";
      let group_code = "";
      let group_id: number | string | undefined = undefined;
      let description = "";
      let item_name = "";
      let invoice_no = "";
      let invoice_date = "";
      let amount = "";

      if (cols.length >= 2) {
        const matchedGroup = paymentGroups.find(
          (g) => g.code.toLowerCase() === cols[1].toLowerCase() || g.name.toLowerCase() === cols[1].toLowerCase()
        );
        if (matchedGroup) {
          group_code = matchedGroup.code;
          group_id = matchedGroup.id;
        } else {
          description = cols[1];
        }
      }
      if (cols.length >= 3) {
        if (description) item_name = cols[2];
        else description = cols[2];
      }
      if (cols.length >= 4) {
        if (!item_name) item_name = cols[3];
        else invoice_no = cols[3];
      }
      if (cols.length >= 5) {
        if (!invoice_no) invoice_no = cols[4];
        else invoice_date = cols[4];
      }
      if (cols.length >= 6) {
        for (let i = 4; i < cols.length; i++) {
          const cleaned = cols[i].replace(/[.,\sđVND]/gi, "");
          if (/^\d+$/.test(cleaned) && Number(cleaned) > 0) {
            amount = cleaned;
            break;
          }
        }
      }

      // Lookup supplier details
      let address = "";
      let account_no = "";
      let bank = "";
      const sup = suppliers.find(
        (s) => s.name.toLowerCase() === payee_name.toLowerCase() || (s.shortName && s.shortName.toLowerCase() === payee_name.toLowerCase())
      );
      if (sup) {
        address = sup.address || "";
        account_no = sup.bankAccount || "";
        bank = sup.bank || "";
      }

      maxStt++;
      parsedRows.push({
        id: Date.now() + parsedRows.length + Math.floor(Math.random() * 1000),
        legacy_stt: String(maxStt).padStart(2, "0"),
        payee_name,
        group_id,
        group_code,
        description: description || `Thanh toán cho ${payee_name || "nhà cung cấp"}`,
        item_name: item_name || description,
        invoice_no: invoice_no || "Chưa có HĐ",
        invoice_date: invoice_date || localToday(),
        amount: amount || "0",
        currency: "VND",
        documents: [],
        request_date: localToday(),
        payment_type: "TT sau 100%",
        status: "Chưa thanh toán",
        isCompleted: false,
        doc_supplement: "",
        address,
        account_no,
        bank,
        created_by_name: "Trần Hải Hà",
        lines: [],
      });
    }

    if (parsedRows.length > 0) {
      e.preventDefault();
      onUpdateState({ paymentRequests: [...parsedRows, ...paymentRequests] });
      alert(`Đã dán trực tiếp ${parsedRows.length} đề nghị thanh toán từ Excel vào đầu bảng!`);
    }
  };

  // Open calendar picker
  const openCalendar = (currentVal: string, cb: (dateVal: string) => void) => {
    calendarCbRef.current = cb;
    if (calendarPickerRef.current) {
      const p = parsePrintDate(currentVal);
      if (p) {
        calendarPickerRef.current.value = `${p.y}-${p.m}-${p.d}`;
      } else {
        calendarPickerRef.current.value = localToday();
      }
      try {
        if (typeof calendarPickerRef.current.showPicker === "function") {
          calendarPickerRef.current.showPicker();
        } else {
          calendarPickerRef.current.click();
        }
      } catch {
        calendarPickerRef.current.click();
      }
    }
  };

  // Create request from PO / Contract
  const handleCreateFromPO = (po: PO, selectedPaymentPhase?: string, customAmount?: number) => {
    if (readOnly) return;
    const s = suppliers.find((x) => x.id === po.supplierId);
    const poTotal = po.items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const contractInfo = getPOContractInfo(po);
    const isContract = contractInfo.hasContract;
    const docTypeLabel = isContract ? "Hợp đồng" : "Đơn hàng PO";

    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt) || 0)) + 1;

    let amountToPay = poTotal;
    let phaseText = "";
    let matchedPayment: Payment | undefined = undefined;

    if (selectedPaymentPhase) {
      matchedPayment = po.payments?.find(
        (p) => String(p.id) === selectedPaymentPhase || p.phase === selectedPaymentPhase
      );
      if (matchedPayment) {
        amountToPay = matchedPayment.amount || (poTotal * matchedPayment.percent) / 100;
        phaseText = matchedPayment.phase;
      }
    } else if (customAmount !== undefined && customAmount > 0) {
      amountToPay = customAmount;
    }

    const customPct = poTotal > 0 ? Math.round((amountToPay / poTotal) * 100) : 100;
    const itemNames = po.items.map((i) => i.name).slice(0, 3).join(", ");
    const description = buildPOPaymentDescription(po, matchedPayment, customPct);
    const fallbackPaymentWithInv =
      matchedPayment ||
      (po.payments || []).find((p) => (p.invoiceNo && p.invoiceNo.trim()) || p.invoiceScanUrl);

    const newReq: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: String(maxStt).padStart(2, "0"),
      payee_name: s?.name || "",
      group_code: po.number,
      description,
      item_name: itemNames,
      invoice_no: fallbackPaymentWithInv?.invoiceNo || "",
      invoice_date: fallbackPaymentWithInv?.invoiceDate || "",
      invoice_scan_url: fallbackPaymentWithInv?.invoiceScanUrl,
      invoice_scan_name: fallbackPaymentWithInv?.invoiceScanName,
      amount: amountToPay,
      currency: "VND",
      documents: [],
      request_date: localToday(),
      payment_type: phaseText || "TT trước 100%",
      status: "Chưa thanh toán",
      isCompleted: false,
      address: s?.address || "",
      account_no: s?.bankAccount || "",
      bank: s?.bank || "",
      created_by_name: paymentTemplate.default_requester_name || "Trần Hải Hà",
      lines: [],
    };

    const nextGroups = [...paymentGroups];
    const existingGroup = nextGroups.find((g) => normName(g.code) === normName(po.number));
    if (!existingGroup) {
      const maxGId = Math.max(0, ...nextGroups.map((g) => Number(g.id) || 0)) + 1;
      nextGroups.push({
        id: maxGId,
        code: po.number,
        name: `${docTypeLabel} ${po.number} - ${s?.name || ""}`,
        payee_name: s?.name || "",
        total_amount: poTotal,
        currency: "VND",
        note: po.contractNote || po.note || "",
      });
      newReq.group_id = maxGId;
    } else {
      newReq.group_id = existingGroup.id;
      if (!existingGroup.total_amount || Number(existingGroup.total_amount) === 0) {
        existingGroup.total_amount = poTotal;
      }
    }

    const next = [newReq, ...paymentRequests];
    onUpdateState({ paymentRequests: next, paymentGroups: nextGroups });
    setActiveRequestId(maxId);
    setLocalPaymentDraft(JSON.parse(JSON.stringify(newReq)));
    setPrintOrientation("portrait");
    setActiveWorkspacePaymentId(maxId);
    setHasUnsavedChanges(false);
    setShowPOPickerModal(false);
    alert(
      `Đã lập Đề nghị thanh toán thành công từ ${docTypeLabel} ${po.number} với số tiền ${fmtMoney(amountToPay)} ₫!`
    );
  };

  // Link PO / Contract info into existing request
  const handleLinkDocToRequest = (reqId: number, po: PO, selectedPaymentPhase?: string) => {
    if (readOnly) return;
    const s = suppliers.find((x) => x.id === po.supplierId);
    const poTotal = po.items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const contractInfo = getPOContractInfo(po);
    const isContract = contractInfo.hasContract;
    const docTypeLabel = isContract ? "Hợp đồng" : "Đơn hàng PO";

    let amountToPay = poTotal;
    let phaseText = "";
    let matchedPayment: Payment | undefined = undefined;

    if (selectedPaymentPhase) {
      matchedPayment = po.payments?.find(
        (p) => String(p.id) === selectedPaymentPhase || p.phase === selectedPaymentPhase
      );
      if (matchedPayment) {
        amountToPay = matchedPayment.amount || (poTotal * matchedPayment.percent) / 100;
        phaseText = matchedPayment.phase;
      }
    }

    const customPct = poTotal > 0 ? Math.round((amountToPay / poTotal) * 100) : 100;
    const description = buildPOPaymentDescription(po, matchedPayment, customPct);

    const nextGroups = [...paymentGroups];
    let targetGroupId: number | undefined = undefined;
    const existingGroup = nextGroups.find((g) => normName(g.code) === normName(po.number));
    if (!existingGroup) {
      const maxGId = Math.max(0, ...nextGroups.map((g) => Number(g.id) || 0)) + 1;
      nextGroups.push({
        id: maxGId,
        code: po.number,
        name: `${docTypeLabel} ${po.number} - ${s?.name || ""}`,
        payee_name: s?.name || "",
        total_amount: poTotal,
        currency: "VND",
        note: po.contractNote || po.note || "",
      });
      targetGroupId = maxGId;
    } else {
      targetGroupId = Number(existingGroup.id);
      if (!existingGroup.total_amount || Number(existingGroup.total_amount) === 0) {
        existingGroup.total_amount = poTotal;
      }
    }

    const next = paymentRequests.map((r) => {
      if (r.id !== reqId) return r;
      return {
        ...r,
        group_code: po.number,
        group_id: targetGroupId,
        payee_name: s?.name || r.payee_name,
        amount: amountToPay,
        description,
        payment_type: phaseText || r.payment_type || "TT trước 100%",
        address: s?.address || r.address,
        account_no: s?.bankAccount || r.account_no,
        bank: s?.bank || r.bank,
      };
    });

    onUpdateState({ paymentRequests: next, paymentGroups: nextGroups });
    if (localPaymentDraft && localPaymentDraft.id === reqId) {
      setLocalPaymentDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          group_code: po.number,
          group_id: targetGroupId,
          payee_name: s?.name || prev.payee_name,
          amount: amountToPay,
          description,
          payment_type: phaseText || prev.payment_type || "TT trước 100%",
          address: s?.address || prev.address,
          account_no: s?.bankAccount || prev.account_no,
          bank: s?.bank || prev.bank,
          lines: [
            {
              description,
              invoice_no: prev.invoice_no || "",
              invoice_date: prev.invoice_date || "",
              amount: amountToPay,
              note: prev.doc_supplement || "",
            },
          ],
        };
      });
      setHasUnsavedChanges(true);
    }
    setLinkDocModalTargetReqId(null);
    alert(
      `Đã liên kết thành công thông tin & giá trị từ ${docTypeLabel} ${po.number} (Giá trị: ${fmtMoney(poTotal)} ₫) vào Đề nghị thanh toán!`
    );
  };

  // Print Handlers via Portal (Clean & Isolated)
  const handlePrintSingle = (req?: PaymentRequestEntry) => {
    const target = req || activeReq;
    if (!target) {
      alert("Vui lòng chọn một đề nghị thanh toán để in");
      return;
    }
    setPrintEntriesList([target]);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setIsPrinting(false);
      }, 500);
    }, 150);
  };

  const handlePrintChecked = () => {
    if (checkedIds.size === 0) {
      alert("Vui lòng tích chọn ít nhất 1 dòng đề nghị thanh toán để in");
      return;
    }
    const selectedList = paymentRequests.filter((r) => checkedIds.has(r.id));
    setPrintEntriesList(selectedList);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setIsPrinting(false);
      }, 500);
    }, 150);
  };

  const visibleCols = useMemo(() => {
    const active = columns.filter((c) => c.visible);
    // Pinned columns strictly first so they form a contiguous, non-breaking sticky block on the left
    const pinned = active.filter((c) => c.pinned);
    const unpinned = active.filter((c) => !c.pinned);
    return [...pinned, ...unpinned];
  }, [columns]);

  const { stickyLeftMap, lastPinnedId } = useMemo(() => {
    const map: Record<string, number> = {};
    let currentLeft = 46; // First column (checkbox + print) is exactly 46px
    let lastId: string | null = null;

    visibleCols.forEach((col) => {
      if (col.pinned) {
        map[col.id] = currentLeft;
        currentLeft += (col.width || col.minWidth || 120);
        lastId = col.id;
      }
    });

    return { stickyLeftMap: map, lastPinnedId: lastId };
  }, [visibleCols]);

  const renderTableCellContent = (colId: ColumnId, r: PaymentRequestEntry) => {
    switch (colId) {
      case "stt":
        return (
          <button
            type="button"
            className="payment-btn"
            style={{ width: "100%", padding: "2px 4px", fontSize: "11px", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={() => setActiveRequestId(r.id)}
            title="Bấm để kích hoạt dòng"
          >
            {r.legacy_stt || r.id}
          </button>
        );
      case "payee_name": {
        const matched = suppliers.find(
          (s) =>
            (r.beneficiary_id && s.id === r.beneficiary_id) ||
            normName(s.name) === normName(r.payee_name) ||
            (s.shortName && normName(s.shortName) === normName(r.payee_name))
        );
        const displayVal = r.payee_name !== undefined ? r.payee_name : (matched?.shortName || "");
        return (
          <input
            className="cell-editor"
            list="nccDataList"
            value={displayVal}
            onChange={(e) => handleEditRequest(r.id, "payee_name", e.target.value)}
            placeholder="Chọn hoặc nhập NCC..."
            title={matched?.name ? `${matched.name} (${displayVal})` : displayVal}
          />
        );
      }
      case "group_code":
        return (
          <input
            className="cell-editor"
            list="groupDataList"
            value={r.group_code || ""}
            onChange={(e) => handleEditRequest(r.id, "group_code", e.target.value)}
            placeholder="Mã nhóm / PO..."
          />
        );
      case "description":
        return (
          <AutoGrowTextarea
            className="cell-editor cell-editor-textarea"
            value={r.description || ""}
            onChange={(val) => handleEditRequest(r.id, "description", val)}
            placeholder="Nội dung chuyển tiền..."
            title={r.description || "Nội dung chuyển tiền..."}
          />
        );
      case "item_name":
        return (
          <AutoGrowTextarea
            className="cell-editor cell-editor-textarea"
            value={r.item_name || ""}
            onChange={(val) => {
              const patch: Partial<PaymentRequestEntry> = { item_name: val };
              if (r.lines && r.lines.length > 0) {
                const nextLines = [...r.lines];
                nextLines[0] = { ...nextLines[0], description: val };
                patch.lines = nextLines;
              }
              handleEditRequest(r.id, patch);
            }}
            placeholder="Tên hàng hóa / dịch vụ..."
            title={r.item_name || "Tên hàng hóa / dịch vụ..."}
          />
        );
      case "invoice_no": {
        const lineCount = r.lines?.length || 0;
        const activeScanUrl = r.invoice_scan_url || r.lines?.find((l) => l.invoice_scan_url)?.invoice_scan_url;
        const activeScanName = r.invoice_scan_name || r.lines?.find((l) => l.invoice_scan_url)?.invoice_scan_name;
        return (
          <div style={{ display: "flex", alignItems: "center", width: "100%", height: "100%", gap: "2px", paddingRight: "2px" }}>
            {lineCount > 1 ? (
              <button
                type="button"
                className="payment-btn"
                style={{
                  padding: "2px 5px",
                  fontSize: "11px",
                  background: "#f0fdf4",
                  color: "#166534",
                  borderColor: "#bbf7d0",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMultiInvoiceModalReqId(r.id);
                }}
                title="Bấm để xem và sửa chi tiết các hóa đơn"
              >
                📑 {lineCount} HĐ
              </button>
            ) : null}
            <input
              className="cell-editor"
              list="invoiceDataList"
              value={r.invoice_no || ""}
              onChange={(e) => {
                const val = e.target.value;
                const patch: Partial<PaymentRequestEntry> = { invoice_no: val };
                if (r.lines && r.lines.length === 1) {
                  const nextLines = [...r.lines];
                  nextLines[0] = { ...nextLines[0], invoice_no: val };
                  patch.lines = nextLines;
                }
                handleEditRequest(r.id, patch);
              }}
              placeholder="Số HĐ..."
              style={{ flex: 1, minWidth: "56px", padding: "0 4px" }}
            />
            <InvoiceScanControl
              compact
              readOnly={readOnly}
              scanUrl={activeScanUrl}
              scanName={activeScanName}
              invoiceNo={r.invoice_no}
              invoiceDate={r.invoice_date}
              entityCode={r.group_code || `DNTT-${r.legacy_stt || r.id}`}
              supplierName={r.payee_name}
              onUpdate={(scanUrl, scanName) => {
                const patch: Partial<PaymentRequestEntry> = {
                  invoice_scan_url: scanUrl,
                  invoice_scan_name: scanName,
                };
                if (r.lines && r.lines.length === 1) {
                  const nextLines = [...r.lines];
                  nextLines[0] = {
                    ...nextLines[0],
                    invoice_scan_url: scanUrl,
                    invoice_scan_name: scanName,
                  };
                  patch.lines = nextLines;
                }
                handleEditRequest(r.id, patch);
              }}
            />
            {lineCount <= 1 && (
              <button
                type="button"
                className="cell-date-btn"
                style={{ padding: "0 4px", fontSize: "11px", opacity: 0.7 }}
                title="Thêm nhiều hóa đơn cho đề nghị này"
                onClick={(e) => {
                  e.stopPropagation();
                  setMultiInvoiceModalReqId(r.id);
                }}
              >
                ＋
              </button>
            )}
          </div>
        );
      }
      case "invoice_date":
        return (
          <div className="cell-date-wrap">
            <input
              className="cell-editor"
              value={r.invoice_date || ""}
              placeholder="dd/mm/yyyy"
              onChange={(e) => {
                const val = e.target.value;
                const patch: Partial<PaymentRequestEntry> = { invoice_date: val };
                if (r.lines && r.lines.length === 1) {
                  const nextLines = [...r.lines];
                  nextLines[0] = { ...nextLines[0], invoice_date: val };
                  patch.lines = nextLines;
                }
                handleEditRequest(r.id, patch);
              }}
              onBlur={(e) => {
                const parsed = parseFlexibleDate(e.target.value);
                if (parsed !== e.target.value) {
                  const patch: Partial<PaymentRequestEntry> = { invoice_date: parsed };
                  if (r.lines && r.lines.length === 1) {
                    const nextLines = [...r.lines];
                    nextLines[0] = { ...nextLines[0], invoice_date: parsed };
                    patch.lines = nextLines;
                  }
                  handleEditRequest(r.id, patch);
                }
              }}
            />
            <button
              type="button"
              className="cell-date-btn"
              title="Chọn ngày từ lịch"
              onClick={() =>
                openCalendar(r.invoice_date || "", (val) => {
                  const patch: Partial<PaymentRequestEntry> = { invoice_date: val };
                  if (r.lines && r.lines.length === 1) {
                    const nextLines = [...r.lines];
                    nextLines[0] = { ...nextLines[0], invoice_date: val };
                    patch.lines = nextLines;
                  }
                  handleEditRequest(r.id, patch);
                })
              }
            >
              📅
            </button>
          </div>
        );
      case "amount":
        return (
          <MoneyInput
            className="cell-editor"
            style={{ textAlign: "right", fontWeight: 600 }}
            value={r.amount}
            onValueChange={(val) => {
              const patch: Partial<PaymentRequestEntry> = { amount: val };
              if (r.lines && r.lines.length === 1) {
                const nextLines = [...r.lines];
                nextLines[0] = { ...nextLines[0], amount: val };
                patch.lines = nextLines;
              }
              handleEditRequest(r.id, patch);
            }}
          />
        );
      case "currency":
        return (
          <select
            className="cell-editor"
            value={r.currency || "VND"}
            onChange={(e) => handleEditRequest(r.id, "currency", e.target.value)}
          >
            <option value="VND">VND</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        );
      case "documents":
        return (
          <button
            type="button"
            className="doc-pill-btn"
            onClick={() => setDocModalReqId(r.id)}
            title={(r.documents || []).join(", ") || "Chọn hồ sơ..."}
          >
            📎 {(r.documents || []).length} hồ sơ ▾
          </button>
        );
      case "request_date":
        return (
          <div className="cell-date-wrap">
            <input
              className="cell-editor"
              value={r.request_date || ""}
              placeholder="dd/mm/yyyy"
              onChange={(e) => handleEditRequest(r.id, "request_date", e.target.value)}
              onBlur={(e) => {
                const parsed = parseFlexibleDate(e.target.value);
                if (parsed !== e.target.value) {
                  handleEditRequest(r.id, "request_date", parsed);
                }
              }}
            />
            <button
              type="button"
              className="cell-date-btn"
              title="Chọn ngày từ lịch"
              onClick={() =>
                openCalendar(r.request_date || "", (val) =>
                  handleEditRequest(r.id, "request_date", val)
                )
              }
            >
              📅
            </button>
          </div>
        );
      case "payment_type":
        return (
          <select
            className="cell-editor"
            value={r.payment_type || "TT trước 100%"}
            onChange={(e) => handleEditRequest(r.id, "payment_type", e.target.value)}
          >
            {PAYMENT_TYPES.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>
        );
      case "status": {
        const curStatus = isPaymentCompleted(r) ? "Đã thanh toán" : "Chưa thanh toán";
        return (
          <select
            className={`cell-editor ${isPaymentCompleted(r) ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}`}
            value={curStatus}
            onChange={(e) => handleTogglePaid(r.id, e.target.value === "Đã thanh toán")}
          >
            {PAYMENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        );
      }
      case "doc_supplement":
        return (
          <AutoGrowTextarea
            className="cell-editor cell-editor-textarea"
            value={r.doc_supplement || ""}
            onChange={(val) => handleEditRequest(r.id, "doc_supplement", val)}
            placeholder="Ghi chú hồ sơ..."
            title={r.doc_supplement || "Ghi chú hồ sơ..."}
          />
        );
      case "address":
        return (
          <AutoGrowTextarea
            className="cell-editor cell-editor-textarea"
            value={r.address || ""}
            onChange={(val) => handleEditRequest(r.id, "address", val)}
            placeholder="Địa chỉ NCC..."
            title={r.address || "Địa chỉ NCC..."}
          />
        );
      case "account_no":
        return (
          <input
            className="cell-editor"
            value={r.account_no || ""}
            onChange={(e) => handleEditRequest(r.id, "account_no", e.target.value)}
            placeholder="Số tài khoản..."
          />
        );
      case "bank":
        return (
          <input
            className="cell-editor"
            list="bankDataList"
            value={r.bank || ""}
            onChange={(e) => handleEditRequest(r.id, "bank", e.target.value)}
            placeholder="Ngân hàng..."
          />
        );
      case "created_by_name":
        return (
          <input
            className="cell-editor"
            list="requesterDataList"
            value={r.created_by_name || ""}
            onChange={(e) => handleEditRequest(r.id, "created_by_name", e.target.value)}
            placeholder="Người tạo..."
          />
        );
      default:
        return null;
    }
  };

  // =========================================================================
  // MODAL: LIÊN KẾT HỢP ĐỒNG / PO VÀO ĐỀ NGHỊ THANH TOÁN
  // =========================================================================
  const renderLinkDocModal = () => {
    if (linkDocModalTargetReqId === null) return null;
    const targetReq = paymentRequests.find((r) => r.id === linkDocModalTargetReqId);

    return (
      <div className="payment-modal-overlay">
        <div className="payment-modal-card" style={{ maxWidth: "760px", width: "95%" }}>
          <div className="payment-modal-header">
            <h3>⚡ Liên kết Hợp đồng / PO vào Đề nghị thanh toán</h3>
            <button type="button" onClick={() => setLinkDocModalTargetReqId(null)}>✕</button>
          </div>

          <div style={{ fontSize: "12.5px", color: "#64748b", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div>
              Đang liên kết cho Đề nghị: <b>STT {targetReq?.legacy_stt || targetReq?.id}</b> -{" "}
              <b>{targetReq?.payee_name || "Chưa có NCC"}</b> (Số tiền hiện tại:{" "}
              <b>{fmtMoney(targetReq?.amount || 0)} ₫</b>)
            </div>
            <div>
              Khi chọn PO hoặc Hợp đồng dưới đây, hệ thống sẽ tự động cập nhật: <b>Mã HĐ/PO</b>, <b>Giá trị thanh toán</b>, <b>Tên & TK Ngân hàng NCC</b>, <b>Nội dung chuyển tiền</b>, và <b>Bảng chi tiết các mặt hàng</b>.
            </div>
          </div>

          {/* Document Type Tabs */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
            <button
              type="button"
              className={`payment-tab-btn ${poFilterType === "all" ? "active" : ""}`}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
                border: "1px solid #cbd5e1",
                background: poFilterType === "all" ? "#0284c7" : "#fff",
                color: poFilterType === "all" ? "#fff" : "#334155",
                fontWeight: 600,
              }}
              onClick={() => setPoFilterType("all")}
            >
              Tất cả ({pos.length})
            </button>
            <button
              type="button"
              className={`payment-tab-btn ${poFilterType === "po" ? "active" : ""}`}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
                border: "1px solid #cbd5e1",
                background: poFilterType === "po" ? "#0284c7" : "#fff",
                color: poFilterType === "po" ? "#fff" : "#334155",
                fontWeight: 600,
              }}
              onClick={() => setPoFilterType("po")}
            >
              Đơn hàng PO ({pos.filter((p) => !isPOContract(p)).length})
            </button>
            <button
              type="button"
              className={`payment-tab-btn ${poFilterType === "contract" ? "active" : ""}`}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
                border: "1px solid #cbd5e1",
                background: poFilterType === "contract" ? "#0284c7" : "#fff",
                color: poFilterType === "contract" ? "#fff" : "#334155",
                fontWeight: 600,
              }}
              onClick={() => setPoFilterType("contract")}
            >
              Hợp đồng ({pos.filter(isPOContract).length})
            </button>
          </div>

          {/* Search in modal */}
          <div>
            <input
              type="text"
              placeholder="🔍 Tìm nhanh theo Số PO/HĐ, Tên Nhà Cung Cấp, hoặc Nội dung..."
              value={poSearch}
              onChange={(e) => setPoSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Document list */}
          <div style={{ maxHeight: "380px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
            {pos
              .filter((po) => {
                const isContract = isPOContract(po);
                if (poFilterType === "po" && isContract) return false;
                if (poFilterType === "contract" && !isContract) return false;
                if (poSearch.trim()) {
                  const q = poSearch.toLowerCase();
                  const s = suppliers.find((x) => x.id === po.supplierId);
                  const matchNum = po.number.toLowerCase().includes(q);
                  const matchSup = s && (s.name.toLowerCase().includes(q) || (s.shortName && s.shortName.toLowerCase().includes(q)));
                  const matchNote = po.contractNote && po.contractNote.toLowerCase().includes(q);
                  const matchPR = po.prNumber && po.prNumber.toLowerCase().includes(q);
                  return matchNum || matchSup || matchNote || matchPR;
                }
                return true;
              })
              .map((po) => {
                const s = suppliers.find((x) => x.id === po.supplierId);
                const total = po.items.reduce((sum, item) => sum + item.qty * item.price, 0);
                const isContract = isPOContract(po);
                const selectedPhase = poSelectedMilestone[po.id];

                return (
                  <div
                    key={po.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      background: "#f8fafc",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: isContract ? "#eff6ff" : "#f0fdf4",
                              color: isContract ? "#1d4ed8" : "#15803d",
                              border: `1px solid ${isContract ? "#bfdbfe" : "#bbf7d0"}`,
                            }}
                          >
                            {isContract ? "HỢP ĐỒNG" : "ĐƠN HÀNG PO"}
                          </span>
                          <strong style={{ fontSize: "14px", color: "#0f172a" }}>{po.number}</strong>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>({po.date})</span>
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginTop: "3px" }}>
                          {s ? `${s.shortName || s.name}` : "Chưa chọn NCC"}
                        </div>
                        {po.contractNote && (
                          <div style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic", marginTop: "2px" }}>
                            {po.contractNote}
                          </div>
                        )}
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                          Giá trị gốc: <b>{fmtMoney(total)} ₫</b> ({po.items.length} mặt hàng)
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                        <button
                          type="button"
                          className="payment-btn btn-primary"
                          style={{
                            padding: "6px 14px",
                            fontSize: "12px",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                          onClick={() => {
                            if (linkDocModalTargetReqId !== null) {
                              handleLinkDocToRequest(linkDocModalTargetReqId, po, selectedPhase);
                            }
                          }}
                        >
                          ⚡ Liên kết vào đề nghị này
                        </button>
                      </div>
                    </div>

                    {/* Payment milestones selector if contract/PO has payments */}
                    {po.payments && po.payments.length > 0 && (
                      <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "6px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "12px" }}>
                        <span style={{ color: "#475569", fontWeight: 600 }}>Chọn đợt TT:</span>
                        <button
                          type="button"
                          className="payment-btn"
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            background: !selectedPhase ? "#0284c7" : "#fff",
                            color: !selectedPhase ? "#fff" : "#334155",
                            borderColor: !selectedPhase ? "#0284c7" : "#cbd5e1",
                          }}
                          onClick={() => {
                            setPoSelectedMilestone((prev) => {
                              const next = { ...prev };
                              delete next[po.id];
                              return next;
                            });
                          }}
                        >
                          100% ({fmtMoney(total)} ₫)
                        </button>
                        {po.payments.map((pm, pidx) => {
                          const pmAmt = pm.amount || (total * pm.percent) / 100;
                          const isChosen = selectedPhase === String(pm.id || pm.phase);
                          return (
                            <button
                              key={pidx}
                              type="button"
                              className="payment-btn"
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                background: isChosen ? "#0284c7" : "#fff",
                                color: isChosen ? "#fff" : "#0284c7",
                                borderColor: "#0284c7",
                                fontWeight: isChosen ? 700 : 500,
                              }}
                              onClick={() => {
                                setPoSelectedMilestone((prev) => ({
                                  ...prev,
                                  [po.id]: String(pm.id || pm.phase),
                                }));
                              }}
                            >
                              {pm.phase} ({pm.percent}%: {fmtMoney(pmAmt)} ₫)
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            {pos.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                Chưa có đơn hàng PO hoặc hợp đồng nào trong hệ thống mua hàng.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // =========================================================================
  // BẢN IN A4 WYSIWYG TRỰC QUAN CHO ĐỀ NGHỊ THANH TOÁN (MẪU SỐ 01 - TT)
  // =========================================================================
  const renderWYSIWYGPaymentWorkspace = () => {
    const draft = localPaymentDraft || paymentRequests.find((r) => r.id === activeWorkspacePaymentId);
    if (!draft) return null;

    const safeTpl = { ...DEFAULT_PAYMENT_TEMPLATE, ...(paymentTemplate || {}) };
    const dateParts = parsePrintDate(draft.request_date);
    const cur = String(draft.currency || "VND").toUpperCase();

    const lines: PaymentDetailLine[] = (draft.lines && draft.lines.length > 0)
      ? draft.lines
      : [
          {
            description: draft.item_name || draft.description || "",
            invoice_no: draft.invoice_no || "",
            invoice_date: draft.invoice_date || "",
            amount: draft.amount || 0,
            note: draft.doc_supplement || "",
          },
        ];

    const totalComputedAmount = lines.reduce((sum, l) => sum + (parseMoney(l.amount) || 0), 0);
    const words = moneyWords({ amount: totalComputedAmount, currency: cur });

    const requesterName = draft.created_by_name || safeTpl.default_requester_name || "Trần Hải Hà";
    const signer4Name = requesterName;
    const signSpaceHeight = safeTpl.sign_space_height && safeTpl.sign_space_height > 0
      ? safeTpl.sign_space_height
      : 120;

    const docsToDisplay = (draft.documents && draft.documents.length > 0)
      ? draft.documents.filter(Boolean).join(", ")
      : "Chưa chọn chứng từ đính kèm";

    const isPaid = draft.status === "Đã thanh toán" || Boolean(draft.isCompleted);

    return (
      <div className="payment-a4-workspace-wrapper no-print">
        {workspaceToast && (
          <div
            style={{
              position: "fixed",
              top: "20px",
              right: "24px",
              zIndex: 9999,
              background: "#0f172a",
              color: "#ffffff",
              padding: "10px 18px",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
              fontWeight: 600,
              fontSize: "13px",
            }}
          >
            {workspaceToast}
          </div>
        )}

        {/* 1. Thanh công cụ điều hướng trên cùng */}
        <div className="payment-workspace-topbar no-print">
          <div className="payment-topbar-left">
            <button
              type="button"
              className="btn-payment-back-list"
              onClick={handleBackToList}
              title="Quay lại danh sách Đề nghị thanh toán"
            >
              <ArrowLeft size={16} /> Danh sách ĐNTT
            </button>
            <div className="payment-topbar-title-block">
              <h2>
                GIẤY ĐỀ NGHỊ THANH TOÁN (Mẫu số 01-TT)
                <span className="payment-topbar-stt-badge">
                  STT #{draft.legacy_stt || draft.id}
                </span>
              </h2>
              <div className="payment-topbar-sub">
                Đơn vị thụ hưởng: <b>{draft.payee_name || "Chưa có NCC"}</b> · Mã PO/HĐ: <b>{draft.group_code || "—"}</b>
              </div>
            </div>
          </div>

          <div className="payment-topbar-right">
            {/* Chuyển đổi trạng thái thanh toán */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f8fafc", padding: "4px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Trạng thái:</span>
              <select
                value={isPaid ? "Đã thanh toán" : "Chưa thanh toán"}
                onChange={(e) => {
                  const nextPaid = e.target.value === "Đã thanh toán";
                  updateDraft((prev) => ({
                    ...prev,
                    status: e.target.value,
                    isCompleted: nextPaid,
                    paidAt: nextPaid ? (prev.paidAt || new Date().toISOString()) : undefined,
                  }));
                }}
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  border: "none",
                  background: "transparent",
                  color: isPaid ? "#15803d" : "#b45309",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="Chưa thanh toán">Chưa thanh toán</option>
                <option value="Đã thanh toán">Đã thanh toán</option>
              </select>
            </div>

            <button
              type="button"
              className={`btn-payment-topbar-save ${hasUnsavedChanges ? "has-unsaved" : ""}`}
              onClick={handleExplicitSavePayment}
              title="Lưu Đề nghị thanh toán (Ctrl + S)"
            >
              <Save size={16} /> Lưu ĐNTT (Ctrl+S)
            </button>

            <button
              type="button"
              className="btn-payment-topbar-print"
              onClick={handlePrintWorkspacePayment}
              title="In biểu mẫu ĐNTT (Mẫu số 01-TT)"
            >
              <Printer size={16} /> In phiếu ĐNTT
            </button>

            <button
              type="button"
              className="btn-payment-topbar-delete"
              onClick={() => handleDeletePaymentInWorkspace(draft.id)}
              title="Xóa đề nghị thanh toán này"
            >
              <Trash2 size={16} /> Xóa
            </button>
          </div>
        </div>

        {/* 2. Banner cảnh báo thay đổi chưa lưu */}
        {hasUnsavedChanges && (
          <div className="payment-unsaved-alert-banner no-print">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#9a3412" }}>
              <span style={{ fontSize: "18px" }}>💾</span>
              <div>
                <strong>Có thay đổi chưa lưu trên Đề nghị thanh toán này!</strong>
                <div style={{ fontSize: "11px", color: "#c2410c", marginTop: "1px" }}>
                  Hệ thống không tự động lưu dữ liệu đang gõ. Hãy bấm nút <strong>&quot;Lưu ĐNTT ngay&quot;</strong> hoặc ấn <strong>Ctrl + S</strong> để lưu lại.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-payment-topbar-save has-unsaved"
              onClick={handleExplicitSavePayment}
            >
              <Save size={15} /> Lưu ĐNTT ngay
            </button>
          </div>
        )}

        {/* 3. Vùng làm việc chính: Tờ A4 + Hộp công cụ Sidebar bên phải */}
        <div className="payment-workspace-inner">
          {/* Tờ giấy A4 Mẫu số 01 - TT */}
          <div className={`paper payment-paper-canvas a4-${printOrientation}`}>
            <div className="upper">{safeTpl.company_name}</div>
            <div className="model">{safeTpl.form_code}</div>
            <h1>{safeTpl.form_title}</h1>

            <div className="recipients">
              <strong>{safeTpl.recipient_label}</strong>
              <div style={{ whiteSpace: "pre-line" }}>{safeTpl.recipients}</div>
            </div>

            <div className="person">
              <div>- {safeTpl.label_requester}</div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <input
                  type="text"
                  className="sheet-inline-input bold-input"
                  value={draft.created_by_name || ""}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, created_by_name: e.target.value }))}
                  placeholder="Họ tên người đề nghị..."
                />
              </div>
              <div>- {safeTpl.label_department}</div>
              <div style={{ minWidth: "100px" }}>
                <b>{safeTpl.department_name}</b>
              </div>
            </div>

            <div className="intro">- {safeTpl.intro_text}</div>

            <div className="details">
              <div>+ {safeTpl.label_payee}</div>
              <div className="val">
                <input
                  type="text"
                  list="nccDataList"
                  className="sheet-inline-input bold-input"
                  value={draft.payee_name || ""}
                  onChange={(e) => handlePayeeChangeInDraft(e.target.value)}
                  placeholder="Tên đơn vị thụ hưởng..."
                />
              </div>
              <div>+ {safeTpl.label_address}</div>
              <div className="val">
                <input
                  type="text"
                  className="sheet-inline-input"
                  value={draft.address || ""}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Địa chỉ nhà cung cấp..."
                />
              </div>
              <div>+ {safeTpl.label_account}</div>
              <div className="val">
                <input
                  type="text"
                  className="sheet-inline-input bold-input"
                  value={draft.account_no || ""}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, account_no: e.target.value }))}
                  placeholder="Số tài khoản ngân hàng..."
                />
              </div>
              <div>+ {safeTpl.label_bank}</div>
              <div className="val">
                <input
                  type="text"
                  list="bankDataList"
                  className="sheet-inline-input bold-input"
                  value={draft.bank || ""}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, bank: e.target.value }))}
                  placeholder="Ngân hàng thụ hưởng..."
                />
              </div>
              <div>+ {safeTpl.label_description}</div>
              <div className="val">
                <AutoGrowTextarea
                  value={draft.description || ""}
                  onChange={(val) => updateDraft((prev) => ({ ...prev, description: val }))}
                  placeholder="Nội dung thanh toán..."
                  className="sheet-inline-input"
                  minRows={1}
                />
              </div>
            </div>

            <div className="person transfer">
              <div>- {safeTpl.deadline_label}</div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <input
                  type="text"
                  className="sheet-inline-input bold-input"
                  value={draft.due_date || safeTpl.deadline_val || ""}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, due_date: e.target.value }))}
                  placeholder="Thời hạn thanh toán..."
                />
              </div>
            </div>

            <div className="moneytitle">- {safeTpl.table_title}</div>

            <table>
              <thead>
                <tr>
                  <th style={{ width: "38px" }}>{safeTpl.col_stt}</th>
                  <th style={{ width: "175px" }}>{safeTpl.col_invoice}</th>
                  <th>{safeTpl.col_item}</th>
                  <th style={{ width: "135px" }}>{safeTpl.col_amount}</th>
                  <th style={{ width: "105px" }}>{safeTpl.col_note}</th>
                  <th className="no-print" style={{ width: "32px" }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, li) => (
                  <tr key={li}>
                    <td style={{ textAlign: "center" }}>{li + 1}</td>
                    <td style={{ padding: "4px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <input
                          type="text"
                          className="sheet-inline-input center"
                          value={l.invoice_no || ""}
                          onChange={(e) => updateDraftLine(li, "invoice_no", e.target.value)}
                          placeholder="Số HĐ..."
                        />
                        <input
                          type="text"
                          className="sheet-inline-input center"
                          style={{ fontSize: "12px", color: "#64748b" }}
                          value={l.invoice_date || ""}
                          onChange={(e) => updateDraftLine(li, "invoice_date", e.target.value)}
                          placeholder="Ngày HĐ..."
                        />
                      </div>
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      <AutoGrowTextarea
                        className="sheet-inline-input"
                        value={l.description || ""}
                        onChange={(val) => updateDraftLine(li, "description", val)}
                        placeholder="Nội dung hàng hóa / dịch vụ..."
                        minRows={1}
                      />
                    </td>
                    <td style={{ textAlign: "right", paddingRight: "6px" }}>
                      <MoneyInput
                        className="sheet-inline-input right bold-input"
                        value={l.amount}
                        onValueChange={(val) => updateDraftLine(li, "amount", val)}
                        placeholder="0"
                      />
                    </td>
                    <td style={{ padding: "4px" }}>
                      <input
                        type="text"
                        className="sheet-inline-input"
                        value={l.note || ""}
                        onChange={(e) => updateDraftLine(li, "note", e.target.value)}
                        placeholder="Ghi chú..."
                      />
                    </td>
                    <td className="no-print" style={{ textAlign: "center", padding: "2px" }}>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          className="btn-delete-line no-print"
                          onClick={() => handleRemoveDraftLine(li)}
                          title="Xóa dòng này"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="sum">
                  <td colSpan={3} style={{ textAlign: "center", fontWeight: "bold" }}>
                    {safeTpl.col_total}
                  </td>
                  <td style={{ textAlign: "right", paddingRight: "8px", fontWeight: "bold" }}>
                    {fmtMoney(totalComputedAmount)}
                  </td>
                  <td style={{ textAlign: "center" }}>{cur}</td>
                  <td className="no-print"></td>
                </tr>
              </tbody>
            </table>

            <div className="words">
              <div>- {safeTpl.label_money_words}</div>
              <div style={{ fontStyle: "italic", fontWeight: "bold" }}>{words}</div>
            </div>

            <div className="doclabel">- {safeTpl.label_docs}:</div>
            <div className="docs">{docsToDisplay}</div>

            <div className="date">
              {safeTpl.date_location}, ngày {dateParts ? dateParts.d : "...."} tháng {dateParts ? dateParts.m : "...."} năm {dateParts ? dateParts.y : "2026"}
            </div>

            <div className="sign">
              <div style={{ height: `${signSpaceHeight}px` }}>
                {safeTpl.sign1_title}
                <span>{safeTpl.sign1_name}</span>
              </div>
              <div style={{ height: `${signSpaceHeight}px` }}>
                {safeTpl.sign2_title}
                <span>{safeTpl.sign2_name}</span>
              </div>
              <div style={{ height: `${signSpaceHeight}px` }}>
                {safeTpl.sign3_title}
                <span>{safeTpl.sign3_name}</span>
              </div>
              <div style={{ height: `${signSpaceHeight}px` }}>
                {safeTpl.sign4_title}
                <span>{signer4Name}</span>
              </div>
            </div>
          </div>

          {/* Hộp công cụ bên phải (Sidebar Toolbox) */}
          <div className="payment-sidebar-toolbox no-print">
            {/* Card 1: Thao tác biểu mẫu */}
            <div className="payment-sidebar-card">
              <div className="payment-sidebar-card-title">
                📋 THAO TÁC BIỂU MẪU
              </div>
              <button
                type="button"
                className="btn-sidebar-payment-action btn-add-line"
                onClick={handleAddDraftLine}
                title="Thêm một dòng thanh toán mới vào bảng"
              >
                ＋ Thêm dòng thanh toán
              </button>
              <div style={{ marginTop: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "3px" }}>
                  Chọn NCC từ danh mục:
                </label>
                <select
                  className="payment-sidebar-select"
                  value={draft.beneficiary_id || ""}
                  onChange={(e) => handleSelectSupplierIntoDraft(e.target.value)}
                >
                  <option value="">-- Chọn NCC điền nhanh --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shortName || s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn-sidebar-payment-action btn-link-po"
                onClick={() => setLinkDocModalTargetReqId(draft.id)}
                title="Liên kết dữ liệu từ Đơn hàng PO hoặc Hợp đồng"
              >
                ⚡ Link từ HĐ / PO
              </button>
            </div>

            {/* Card 2: Chứng từ đính kèm (Checklist) */}
            <div className="payment-sidebar-card">
              <div className="payment-sidebar-card-title">
                📑 CHỨNG TỪ ĐÍNH KÈM
              </div>
              <div className="payment-sidebar-checklist">
                {[
                  "Hóa đơn GTGT",
                  "Hợp đồng kinh tế",
                  "Đơn mua hàng (PO)",
                  "BB giao nhận hàng",
                  "BB nghiệm thu & bàn giao",
                  "Bảng kê chi tiết",
                  "Đề nghị phê duyệt (ĐNPD)",
                ].map((docName) => {
                  const isChecked = (draft.documents || []).includes(docName);
                  return (
                    <label key={docName}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleDocInDraft(docName)}
                      />
                      <span>{docName}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Card 3: Trạng thái & Hạn thanh toán */}
            <div className="payment-sidebar-card">
              <div className="payment-sidebar-card-title">
                💰 TRẠNG THÁI & HẠN TT
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "2px" }}>
                  Trạng thái:
                </label>
                <select
                  className="payment-sidebar-select"
                  value={isPaid ? "Đã thanh toán" : "Chưa thanh toán"}
                  onChange={(e) => {
                    const nextPaid = e.target.value === "Đã thanh toán";
                    updateDraft((prev) => ({
                      ...prev,
                      status: e.target.value,
                      isCompleted: nextPaid,
                      paidAt: nextPaid ? (prev.paidAt || new Date().toISOString()) : undefined,
                    }));
                  }}
                >
                  <option value="Chưa thanh toán">Chưa thanh toán</option>
                  <option value="Đã thanh toán">Đã thanh toán</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "2px" }}>
                  Ngày đề nghị:
                </label>
                <input
                  type="text"
                  className="payment-sidebar-select"
                  value={draft.request_date || ""}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, request_date: e.target.value }))}
                  placeholder="dd/mm/yyyy"
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "2px" }}>
                  Hạn thanh toán:
                </label>
                <input
                  type="text"
                  className="payment-sidebar-select"
                  value={draft.due_date || ""}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, due_date: e.target.value }))}
                  placeholder="VD: Trong 15 ngày..."
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "2px" }}>
                  Loại thanh toán:
                </label>
                <select
                  className="payment-sidebar-select"
                  value={draft.payment_type || "TT trước 100%"}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, payment_type: e.target.value }))}
                >
                  {PAYMENT_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Card 4: Khổ in & In ấn */}
            <div className="payment-sidebar-card">
              <div className="payment-sidebar-card-title">
                📐 KHỔ IN & IN ẤN
              </div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#0369a1",
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  marginBottom: "4px",
                }}
              >
                <span>📄</span>
                <span>Khổ in: A4 Dọc (Chuẩn Mẫu 01-TT)</span>
              </div>
              <button
                type="button"
                className="btn-sidebar-payment-action btn-link-po"
                style={{ marginTop: "4px" }}
                onClick={handlePrintWorkspacePayment}
              >
                <Printer size={14} /> In giấy ĐNTT ngay
              </button>
            </div>

            {/* Card 5: Lưu dữ liệu */}
            <div className="payment-sidebar-card">
              <div className="payment-sidebar-card-title">
                💾 LƯU DỮ LIỆU
              </div>
              <button
                type="button"
                className={`btn-sidebar-payment-action btn-save-draft ${hasUnsavedChanges ? "has-unsaved" : ""}`}
                onClick={handleExplicitSavePayment}
              >
                <Save size={14} /> Lưu ĐNTT ngay
              </button>
              <div style={{ fontSize: "10.5px", color: hasUnsavedChanges ? "#c2410c" : "#15803d", textAlign: "center", fontWeight: 600 }}>
                {hasUnsavedChanges ? "⚠️ Có thay đổi chưa lưu" : "✓ Đã lưu mọi thay đổi"}
              </div>
              <div style={{ fontSize: "10px", color: "#94a3b8", textAlign: "center", marginTop: "2px" }}>
                Bấm phím <strong>Ctrl + S</strong> để lưu nhanh
              </div>
            </div>
          </div>
        </div>

        {/* Modal liên kết PO khi đang ở trong Workspace */}
        {linkDocModalTargetReqId !== null && renderLinkDocModal()}

        {/* Cổng in cô lập ra ngoài DOM */}
        {typeof document !== "undefined" && createPortal(
          <div id="paymentPrintPortal">
            <PaymentPrintSheet
              req={draft}
              tpl={paymentTemplate}
              suppliers={suppliers}
            />
          </div>,
          document.body
        )}
      </div>
    );
  };

  // Nếu đang mở biểu mẫu A4 của một đề nghị thanh toán: Hiển thị giao diện soạn thảo A4 WYSIWYG
  if (activeWorkspacePaymentId !== null && (localPaymentDraft || paymentRequests.some((r) => r.id === activeWorkspacePaymentId))) {
    return renderWYSIWYGPaymentWorkspace();
  }

  return (
    <section className={`content payment-management ${isWorkspaceExpanded ? "workspace-expanded" : ""}`}>
      {/* Hidden date picker */}
      <input
        type="date"
        ref={calendarPickerRef}
        style={{ position: "fixed", top: "-1000px", left: "-1000px", opacity: 0 }}
        onChange={(e) => {
          if (calendarCbRef.current && e.target.value) {
            calendarCbRef.current(parseFlexibleDate(e.target.value));
          }
        }}
      />

      {/* Stitch v2 Executive Page Header */}
      <div className="heading stitch-page-banner">
        <div>
          <div className="stitch-breadcrumb">
            <span>Tài chính & Kế toán Thanh toán</span>
            <span>/</span>
            <b>Đề nghị Thanh toán (ĐNTT)</b>
          </div>
          <h1>{t("payment.title")}</h1>
          <p className="stitch-subtitle">
            Quản lý hồ sơ thanh toán, đối chiếu hóa đơn GTGT, theo dõi công nợ Nhà cung cấp và xuất biểu mẫu 01-TT
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className="stitch-seg-group">
            <button
              type="button"
              className={`stitch-seg-btn ${isCardView ? "active" : ""}`}
              onClick={() => setUserMobileToggle(true)}
              title="Xem danh sách dưới dạng các thẻ Hồ sơ Đề nghị Thanh toán"
            >
              <LayoutGrid size={15} /> Theo Hồ Sơ ĐNTT <span className="stitch-count-pill">{paymentRequests.length}</span>
            </button>
            <button
              type="button"
              className={`stitch-seg-btn ${!isCardView ? "active" : ""}`}
              onClick={() => setUserMobileToggle(false)}
              title="Xem danh sách dưới dạng bảng tính kế toán"
            >
              <Table size={15} /> Bảng Kê Kế Toán <span className="stitch-count-pill">{paymentRequests.length}</span>
            </button>
          </div>

          <button
            type="button"
            className="btn btn-accent btn-md"
            onClick={() => {
              setPoFilterType("all");
              setPoSearch("");
              setShowPOPickerModal(true);
            }}
          >
            <FileText size={16} /> Lập ĐNTT từ PO / HĐ
          </button>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={isCardView ? handleAddNewFromCardView : handleAddRequestRow}
          >
            <Plus size={16} /> Thêm ĐNTT
          </button>
        </div>
      </div>

      {/* Stitch v2 Bento KPI Strip */}
      <div className="stitch-kpi-strip">
        <div className="stitch-kpi-card kpi-navy">
          <div className="stitch-kpi-icon">
            <FileText size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Tổng Hồ Sơ Đề Nghị Thanh Toán</small>
            <strong>
              {paymentRequests.length} <em>đề nghị</em>
            </strong>
            <span className="stitch-kpi-sub">
              Đang hiển thị: <b>{filteredRequests.length}</b> hồ sơ
            </span>
          </div>
        </div>

        <div className="stitch-kpi-card kpi-orange">
          <div className="stitch-kpi-icon">
            <Printer size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Chờ Đi Tiền / Bổ Sung Hồ Sơ</small>
            <strong>
              {paymentRequests.filter((r) => !isPaymentCompleted(r)).length} <em>hồ sơ đang mở</em>
            </strong>
            <span className="stitch-kpi-sub">
              Đã chọn in gộp: <b>{checkedIds.size}</b> đề nghị
            </span>
          </div>
        </div>

        <div className="stitch-kpi-card kpi-emerald">
          <div className="stitch-kpi-icon">
            <Check size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Đã Hoàn Tất Thanh Toán</small>
            <strong>
              {paymentRequests.filter((r) => isPaymentCompleted(r)).length} <em>hồ sơ hoàn tất</em>
            </strong>
            <span className="stitch-kpi-sub">
              Tổng tiền hiển thị:{" "}
              <b>
                {fmtMoney(
                  filteredRequests.reduce((s, r) => s + (Number(r.amount) || 0), 0)
                )}{" "}
                ₫
              </b>
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`payment-toolbar ${isPhoneScreen ? "payment-toolbar-mobile" : ""}`}>
        {!isPhoneScreen && (
          <>
            {isCardView ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={handleAddNewFromCardView}
                  title="Thêm một đề nghị thanh toán mới và chỉnh sửa"
                >
                  <Plus size={16} /> Thêm ĐNTT
                </button>
                <button
                  type="button"
                  className="btn btn-accent btn-md"
                  onClick={() => {
                    setPoFilterType("all");
                    setPoSearch("");
                    setShowPOPickerModal(true);
                  }}
                  title="Lập đề nghị thanh toán từ PO hoặc Hợp đồng"
                >
                  <FileText size={16} /> Từ PO/HĐ
                </button>
                <button
                  type="button"
                  className="btn btn-teal btn-md"
                  onClick={handlePrintChecked}
                  title="In biểu mẫu 01-TT cho các hồ sơ đã chọn"
                >
                  <Printer size={16} /> In ({checkedIds.size})
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => {
                    if (checkedIds.size === 0) return;
                    const next = paymentRequests.map((r) => {
                      if (!checkedIds.has(r.id)) return r;
                      const nextDone = !isPaymentCompleted(r);
                      return {
                        ...r,
                        isCompleted: nextDone,
                        status: nextDone ? "Đã thanh toán" : "Chưa thanh toán",
                        paidAt: nextDone ? (r.paidAt || new Date().toISOString()) : undefined,
                      };
                    });
                    onUpdateState({ paymentRequests: next });
                  }}
                  disabled={checkedIds.size === 0}
                  title="Đánh dấu đã thanh toán cho các hồ sơ đang chọn"
                >
                  <Check size={16} /> Đã TT ({checkedIds.size})
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-md"
                  onClick={handleDeleteSelectedRequests}
                  disabled={checkedIds.size === 0}
                  title="Xóa các hồ sơ đang chọn"
                >
                  <Trash2 size={16} /> Xóa ({checkedIds.size})
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={handleAddRequestRow}
                  title="Thêm một dòng đề nghị thanh toán mới vào bảng"
                >
                  <Plus size={16} /> Thêm dòng
                </button>
                <button
                  type="button"
                  className="btn btn-accent btn-md"
                  onClick={() => {
                    setPoFilterType("all");
                    setPoSearch("");
                    setShowPOPickerModal(true);
                  }}
                  title="Lập đề nghị thanh toán từ đơn đặt hàng PO hoặc Hợp đồng kinh tế"
                >
                  <FileText size={16} /> Từ PO/HĐ
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={async () => {
                    try {
                      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
                        const text = await navigator.clipboard.readText();
                        if (text && (text.includes("\t") || text.includes("\n"))) {
                          const fakeEvent = {
                            clipboardData: {
                              getData: () => text,
                            },
                          } as any;
                          handlePaymentTablePaste(fakeEvent);
                          return;
                        }
                      }
                    } catch {}
                    alert("Để dán dữ liệu từ Excel:\n1. Chọn và copy (Ctrl+C) các dòng trong Excel\n2. Bấm vào bảng kê thanh toán rồi nhấn phím Ctrl+V");
                  }}
                  title="Dán dữ liệu từ file Excel (hoặc bấm vào bảng rồi nhấn Ctrl+V)"
                >
                  <ClipboardPaste size={16} /> Dán Excel
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => setShowColumnConfigModal(true)}
                  title="Tùy chỉnh thứ tự các cột, ẩn hiện cột và chọn các cột cần cố định"
                >
                  <Settings size={15} /> Cột ({columns.filter((c) => c.visible).length}/{columns.length})
                </button>
                <button
                  type="button"
                  className="btn btn-teal btn-md"
                  onClick={handlePrintChecked}
                  title="In các đề nghị thanh toán đã chọn (Mẫu 01-TT)"
                >
                  <Printer size={16} /> In ({checkedIds.size})
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-md"
                  onClick={handleDeleteSelectedRequests}
                  title="Xóa các đề nghị thanh toán đã chọn"
                >
                  <Trash2 size={16} /> Xóa ({checkedIds.size})
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary btn-md btn-workspace-toggle ${isWorkspaceExpanded ? "active" : ""}`}
                  onClick={() => setIsWorkspaceExpanded(!isWorkspaceExpanded)}
                  title={isWorkspaceExpanded ? "Thu gọn về giao diện chuẩn" : "Mở rộng không gian làm việc (giống So sánh báo giá)"}
                >
                  {isWorkspaceExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {isWorkspaceExpanded ? "Thu gọn" : "Mở rộng"}
                </button>
              </>
            )}
          </>
        )}
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", width: isPhoneScreen ? "100%" : "250px" }}>
          <input
            placeholder="Tìm NCC, STT, nội dung, hóa đơn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", paddingRight: searchQuery ? "28px" : "10px" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title="Xóa tìm kiếm"
              style={{
                position: "absolute",
                right: "6px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: "13px",
                lineHeight: "1",
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: isPhoneScreen ? "100%" : "auto" }}
        >
          <option value="">{t("status.all")}</option>
          {PAYMENT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          style={{ width: isPhoneScreen ? "100%" : "auto" }}
        >
          <option value="">Tất cả nhóm</option>
          {paymentGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} ({g.name || g.payee_name || ""})
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`btn btn-secondary btn-md ${showHidden ? "active" : ""}`}
          onClick={toggleShowHidden}
          title={showHidden ? "Đang hiển thị cả các thẻ đã ẩn. Bấm để ẩn lại" : "Bấm để xem các thẻ thanh toán đã ẩn"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: showHidden ? "#fef3c7" : undefined,
            color: showHidden ? "#92400e" : undefined,
            borderColor: showHidden ? "#f59e0b" : undefined,
            fontWeight: showHidden ? 700 : 500,
          }}
        >
          {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
          <span>{showHidden ? `Đang hiện đã ẩn (${hiddenCount})` : `Hiện đã ẩn (${hiddenCount})`}</span>
        </button>

        {checkedIds.size > 0 && !isPhoneScreen && (
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={() => handleHideSelectedRequests(!showHidden)}
            title={showHidden ? "Hiện lại các phiếu đang chọn" : "Ẩn các phiếu đang chọn khỏi danh sách"}
            style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
          >
            {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
            <span>{showHidden ? "Hiện lại đã chọn" : "Ẩn đã chọn"} ({checkedIds.size})</span>
          </button>
        )}

        {!isPhoneScreen && !isCardView && (
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={() => setShowColumnConfigModal(true)}
            title="Tùy chỉnh thứ tự các cột, ẩn hiện cột và chọn các cột cần cố định"
          >
            <Settings size={15} />
            Cột ({columns.filter((c) => c.visible).length}/{columns.length})
          </button>
        )}

        {!isPhoneScreen && (
          <>
            {!isCardView && (
              <>
                <button className="btn btn-teal btn-md" onClick={handlePrintChecked} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <Printer size={15} /> In ({checkedIds.size})
                </button>
                <button
                  className="btn btn-danger btn-md"
                  onClick={handleDeleteSelectedRequests}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                >
                  <Trash2 size={15} /> Xóa ({checkedIds.size})
                </button>
              </>
            )}
          </>
        )}

        <span style={{ marginLeft: isPhoneScreen ? "0" : "auto", fontSize: "12px", color: "#64748b" }}>
          {filteredRequests.length} / {paymentRequests.length} đề nghị
        </span>
      </div>

      {/* Datalists for autocompletion from central suppliers and tables */}
      <datalist id="nccDataList">
        {suppliers.map((s) => (
          <option key={`sup-short-${s.id}`} value={s.shortName || s.name}>
            {s.name} {s.code ? `(${s.code})` : ""}
          </option>
        ))}
        {suppliers
          .filter((s) => s.shortName && s.name !== s.shortName)
          .map((s) => (
            <option key={`sup-full-${s.id}`} value={s.name}>
              {s.shortName}
            </option>
          ))}
      </datalist>

      <datalist id="bankDataList">
        {bankSuggestions.map((bn) => (
          <option key={bn} value={bn} />
        ))}
      </datalist>

      <datalist id="groupDataList">
        {groupSuggestions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <datalist id="itemDataList">
        {itemSuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      <datalist id="descDataList">
        {descSuggestions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <datalist id="invoiceDataList">
        {invoiceSuggestions.map((inv) => (
          <option key={inv} value={inv} />
        ))}
      </datalist>

      <datalist id="docSupplementDataList">
        {docSupplementSuggestions.map((ds) => (
          <option key={ds} value={ds} />
        ))}
      </datalist>

      <datalist id="requesterDataList">
        {requesterSuggestions.map((rq) => (
          <option key={rq} value={rq} />
        ))}
      </datalist>

      {/* Mobile Cards View */}
      {showMobileCards ? (
        <div className="mobile-cards-container">
          {filteredRequests.map((r) => {
            const isDone = isPaymentCompleted(r);
            const stClass = isDone ? "mb-badge-done" : "mb-badge-wait";
            const currentStatus = isDone ? "Đã thanh toán" : "Chưa thanh toán";

            const payee = r.payee_name || "Chưa có NCC";
            const grp = paymentGroups.find((g) => String(g.id) === String(r.group_id));
            const docs = (r.documents || []).filter(Boolean);
            const lines = (r.lines || []).filter((l) => l.description || l.amount);

            const isFlashing = highlightedRowId === r.id;
            const isUnlocked = unlockedReqIds.has(r.id);
            return (
              <div
                key={r.id}
                id={`payment-row-${r.id}`}
                className={`m-card ${isDone ? "m-card-done row-completed" : ""} ${isFlashing ? "row-highlight-flash" : ""} ${isItemHidden(r) ? "m-card-hidden" : ""} ${isUnlocked ? "m-card-unlocked" : ""}`}
                style={{
                  ...(isItemHidden(r) ? { opacity: 0.8, border: "1px dashed #f59e0b", background: "#fffdfa" } : {}),
                  ...(isUnlocked ? { border: "2px solid #0284c7", boxShadow: "0 0 0 3px rgba(2, 132, 199, 0.15), 0 6px 20px rgba(15, 23, 42, 0.08)", background: "#ffffff" } : {}),
                }}
                onClick={() => setActiveRequestId(r.id)}
              >
                <div className="m-card-header">
                  <div className="m-card-stt" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {!isPhoneScreen && (
                      <input
                        type="checkbox"
                        checked={checkedIds.has(r.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleCheck(r.id, e.target.checked);
                        }}
                        title="Tích chọn hồ sơ ĐNTT này"
                        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#0284c7" }}
                      />
                    )}
                    <button
                      type="button"
                      className={`completion-toggle-btn ${isDone ? "completed" : ""}`}
                      title={isDone ? "Đã thanh toán (Bấm để chuyển về Chưa thanh toán)" : "Chưa thanh toán (Bấm để đánh dấu Đã thanh toán & đồng bộ PO)"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleComplete(r);
                      }}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 2px", display: "inline-flex" }}
                    >
                      {isDone ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Circle size={18} className="text-slate-400" />}
                    </button>
                    <span>STT {r.legacy_stt || r.id}</span>
                    {isItemHidden(r) && (
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
                    {r.group_code && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          color: "#0369a1",
                          background: "#f0f9ff",
                          border: "1px solid #bae6fd",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        📦 {r.group_code}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUnlockReq(r.id);
                      }}
                      title={isUnlocked ? "Khóa lại & hoàn tất sửa trực tiếp" : "Mở khóa để sửa trực tiếp trên thẻ này"}
                      style={{
                        background: isUnlocked ? "#ecfdf5" : "#f1f5f9",
                        color: isUnlocked ? "#047857" : "#475569",
                        border: isUnlocked ? "1.5px solid #10b981" : "1px solid #cbd5e1",
                        borderRadius: "6px",
                        padding: "3px 8px",
                        fontSize: "11px",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        cursor: "pointer",
                        boxShadow: isUnlocked ? "0 0 0 2px rgba(16, 185, 129, 0.25)" : undefined,
                      }}
                    >
                      {isUnlocked ? <Lock size={12} className="text-emerald-600" /> : <Unlock size={12} />}
                      <span>{isUnlocked ? "Khóa lại" : "Sửa"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleHideRequest(r.id, isItemHidden(r));
                      }}
                      title={isItemHidden(r) ? "Hiện lại thẻ thanh toán này" : "Ẩn thẻ thanh toán này khỏi danh sách"}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px 4px",
                        color: isItemHidden(r) ? "#d97706" : "#94a3b8",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      {isItemHidden(r) ? <Eye size={17} /> : <EyeOff size={17} />}
                    </button>
                    {isPhoneScreen ? (
                      <span className={`m-badge ${stClass}`}>{currentStatus}</span>
                    ) : (
                      <select
                        className={`m-badge-select ${stClass}`}
                        value={currentStatus}
                        onChange={(e) => handleTogglePaid(r.id, e.target.value === "Đã thanh toán")}
                        title="Chuyển nhanh trạng thái"
                      >
                        {PAYMENT_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {isUnlocked && (
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#0369a1",
                      background: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "6px",
                      marginTop: "6px",
                    }}
                  >
                    <span>🔓 Đang sửa trực tiếp · Nhập nội dung rồi bấm "Khóa lại"</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUnlockReq(r.id);
                      }}
                      style={{
                        background: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "4px",
                        padding: "2px 8px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ✓ Khóa lại
                    </button>
                  </div>
                )}

                {/* Payee Name */}
                {isUnlocked ? (
                  <div style={{ marginTop: "8px" }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>🏢 Nhà cung cấp / Đơn vị thụ hưởng:</label>
                    <input
                      type="text"
                      className="inline-card-input"
                      value={r.payee_name || ""}
                      onChange={(e) => handleEditRequest(r.id, "payee_name", e.target.value)}
                      list="nccDataList"
                      placeholder="Nhập tên nhà cung cấp..."
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "13.5px",
                        fontWeight: 700,
                        color: "#0f172a",
                        border: "1.5px solid #0284c7",
                        borderRadius: "6px",
                        background: "#ffffff",
                        boxSizing: "border-box",
                        marginTop: "2px",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="m-card-payee"
                    onClick={() => !isPhoneScreen && handleOpenPaymentWorkspace(r.id)}
                    style={{ cursor: !isPhoneScreen ? "pointer" : "default" }}
                    title={!isPhoneScreen ? "Nhấp để chỉnh sửa đề nghị này" : undefined}
                  >
                    {payee}
                  </div>
                )}

                {/* Amount */}
                {isUnlocked && (!r.lines || r.lines.length === 0) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Số tiền:</label>
                    <input
                      type="text"
                      value={fmtMoney(r.amount)}
                      onChange={(e) => handleEditRequest(r.id, "amount", parseMoney(e.target.value))}
                      style={{
                        width: "180px",
                        padding: "5px 8px",
                        fontSize: "15px",
                        fontWeight: 800,
                        color: "#047857",
                        border: "1.5px solid #0284c7",
                        borderRadius: "6px",
                        textAlign: "right",
                        boxSizing: "border-box",
                      }}
                    />
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>{r.currency || "VND"}</span>
                  </div>
                ) : (
                  <div className="m-card-amount">
                    {fmtMoney(r.amount)} <small>{r.currency || "VND"}</small>
                  </div>
                )}

                {/* Description */}
                {isUnlocked ? (
                  <div style={{ marginTop: "6px" }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Nội dung thanh toán:</label>
                    <input
                      type="text"
                      value={r.description || ""}
                      onChange={(e) => handleEditRequest(r.id, "description", e.target.value)}
                      placeholder="Nội dung thanh toán..."
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12.5px",
                        border: "1.5px solid #0284c7",
                        borderRadius: "6px",
                        background: "#ffffff",
                        boxSizing: "border-box",
                        marginTop: "2px",
                      }}
                    />
                  </div>
                ) : (
                  <div className="m-card-desc">
                    {r.description || r.item_name || "Không có mô tả"}
                  </div>
                )}

                {/* Meta details */}
                {isUnlocked ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }} onClick={(e) => e.stopPropagation()}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>📅 Ngày đề nghị:</label>
                      <input
                        type="date"
                        value={r.request_date || ""}
                        onChange={(e) => handleEditRequest(r.id, "request_date", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "4px 6px",
                          fontSize: "12px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          boxSizing: "border-box",
                          marginTop: "2px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>🧾 Số hóa đơn:</label>
                      <input
                        type="text"
                        value={r.invoice_no || ""}
                        onChange={(e) => {
                          const inv = e.target.value;
                          const nextLines = [...(r.lines || [])];
                          if (nextLines.length === 1) nextLines[0] = { ...nextLines[0], invoice_no: inv };
                          handleEditRequest(r.id, { invoice_no: inv, ...(nextLines.length === 1 ? { lines: nextLines } : {}) });
                        }}
                        placeholder="Số HĐ..."
                        style={{
                          width: "100%",
                          padding: "4px 6px",
                          fontSize: "12px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          boxSizing: "border-box",
                          marginTop: "2px",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="m-card-meta">
                    {r.request_date && <div>📅 Ngày: <b>{r.request_date}</b></div>}
                    {grp && <div>📁 Nhóm HĐ: <b>{grp.code}</b></div>}
                    {(() => {
                      const matchedPO = pos.find(
                        (p) => normName(p.number) === normName(r.group_code || "")
                      );
                      const totalDocVal = matchedPO
                        ? matchedPO.items.reduce((s, it) => s + it.qty * it.price, 0)
                        : Number(grp?.total_amount) || 0;
                      if (totalDocVal > 0) {
                        return (
                          <div style={{ color: "#0369a1", fontSize: "11.5px", fontWeight: 600 }}>
                            🔗 Giá trị HĐ/PO: <b>{fmtMoney(totalDocVal)} ₫</b>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
                      <div>
                        🧾 HĐ: <b>{r.invoice_no || "Chưa nhập số HĐ"}</b>{" "}
                        {r.invoice_date && <span style={{ color: "#64748b" }}>({r.invoice_date})</span>}
                      </div>
                      <InvoiceScanControl
                        compact
                        readOnly={readOnly}
                        scanUrl={r.invoice_scan_url || r.lines?.find((l) => l.invoice_scan_url)?.invoice_scan_url}
                        scanName={r.invoice_scan_name || r.lines?.find((l) => l.invoice_scan_url)?.invoice_scan_name}
                        invoiceNo={r.invoice_no}
                        invoiceDate={r.invoice_date}
                        entityCode={r.group_code || `DNTT-${r.legacy_stt || r.id}`}
                        supplierName={r.payee_name}
                        onUpdate={(scanUrl, scanName) => {
                          const patch: Partial<PaymentRequestEntry> = {
                            invoice_scan_url: scanUrl,
                            invoice_scan_name: scanName,
                          };
                          if (r.lines && r.lines.length === 1) {
                            const nextLines = [...r.lines];
                            nextLines[0] = {
                              ...nextLines[0],
                              invoice_scan_url: scanUrl,
                              invoice_scan_name: scanName,
                            };
                            patch.lines = nextLines;
                          }
                          handleEditRequest(r.id, patch);
                        }}
                      />
                    </div>
                  </div>
                )}

                {docs.length > 0 && (
                  <div className="m-card-docs">
                    {docs.map((d, di) => (
                      <span key={di} className="m-doc-tag">📎 {d}</span>
                    ))}
                  </div>
                )}

                {lines.length > 0 && (
                  <div style={{ marginTop: "12px", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", background: "#f8fafc" }}>
                    <div style={{ padding: "6px 10px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 700, color: "#475569", display: "flex", justifyContent: "space-between" }}>
                      <span>DANH MỤC HÓA ĐƠN / HÀNG HÓA ({lines.length})</span>
                      <span>SỐ TIỀN ({r.currency || "VND"})</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <tbody>
                        {lines.slice(0, 3).map((l, li) => (
                          <tr key={li} style={{ borderBottom: li < Math.min(lines.length, 3) - 1 ? "1px solid #f1f5f9" : "none" }}>
                            <td style={{ padding: "6px 10px", fontWeight: 600, color: "#1e293b" }}>
                              <div style={{ lineHeight: 1.3 }}>{l.description || "Hàng hóa vật tư"}</div>
                              {l.invoice_no && (
                                <small style={{ color: "#64748b", fontSize: "10.5px" }}>HĐ: {l.invoice_no}</small>
                              )}
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 800, color: "#047857", whiteSpace: "nowrap" }}>
                              {fmtMoney(l.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {lines.length > 3 && (
                      <div
                        onClick={() => !isPhoneScreen && handleOpenPaymentWorkspace(r.id)}
                        style={{ padding: "5px 10px", fontSize: "11px", fontWeight: 700, color: "#0284c7", textAlign: "center", background: "#f1f5f9", cursor: "pointer" }}
                      >
                        + Xem thêm {lines.length - 3} hóa đơn / mặt hàng khác ➔
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile: Chỉ cho xem và có 1 tính năng duy nhất: Đánh dấu đã thanh toán */}
                {isPhoneScreen ? (
                  <div className="m-card-actions">
                    {isDone ? (
                      <button
                        type="button"
                        className="m-btn-mark-paid is-done"
                        onClick={() => handleTogglePaid(r.id, false)}
                        title="Chạm để chuyển lại trạng thái Chưa thanh toán"
                      >
                        <span className="m-btn-icon">✓</span>
                        <span>Đã thanh toán</span>
                        <small>(Chạm để hủy)</small>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="m-btn-mark-paid"
                        onClick={() => handleTogglePaid(r.id, true)}
                        title="Chạm để đánh dấu đề nghị này đã thanh toán xong"
                      >
                        <span className="m-btn-icon">✓</span>
                        <span>Đánh dấu đã thanh toán</span>
                      </button>
                    )}
                  </div>
                ) : (
                  /* Desktop Card Actions: Đầy đủ tính năng sửa, in, hồ sơ, xóa trên máy tính */
                  <div className="m-card-desktop-tools" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "4px", width: "100%", marginTop: "8px" }}>
                    <button
                      type="button"
                      className="m-btn-edit-card"
                      onClick={() => handleOpenPaymentWorkspace(r.id)}
                      title="Mở biểu mẫu A4 để soạn thảo và in ấn (WYSIWYG)"
                      style={{ width: "100%", height: "29px", padding: "0 2px", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "3px" }}
                    >
                      <Pencil size={12} /> Soạn A4
                    </button>
                    <button
                      type="button"
                      className={`m-btn-toggle-done ${isDone ? "is-done" : ""}`}
                      onClick={() => handleTogglePaid(r.id, !isDone)}
                      title={isDone ? "Bỏ đánh dấu đã thanh toán" : "Đánh dấu đã thanh toán"}
                      style={{ width: "100%", height: "29px", padding: "0 2px", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "2px" }}
                    >
                      {isDone ? <Check size={12} /> : null} {isDone ? "Đã TT" : "Đánh dấu TT"}
                    </button>
                    <button
                      type="button"
                      className="m-btn-icon-action"
                      onClick={() => setDocModalReqId(r.id)}
                      title="Hồ sơ chứng từ"
                      style={{ width: "100%", height: "29px", padding: "0 2px", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "3px" }}
                    >
                      <Paperclip size={12} /> Hồ sơ
                    </button>
                    <button
                      type="button"
                      className="m-btn-icon-action"
                      onClick={() => handlePrintSingle(r)}
                      title="In phiếu thanh toán này"
                      style={{ width: "100%", height: "29px", padding: "0 2px", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "3px" }}
                    >
                      <Printer size={12} /> In
                    </button>
                    <button
                      type="button"
                      className="m-btn-icon-action"
                      onClick={() => handleToggleHideRequest(r.id, isItemHidden(r))}
                      title={isItemHidden(r) ? "Hiện lại thẻ thanh toán này" : "Ẩn thẻ thanh toán này khỏi danh sách"}
                      style={{
                        width: "100%",
                        height: "29px",
                        padding: "0 2px",
                        fontSize: "11px",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "3px",
                        color: isItemHidden(r) ? "#b45309" : undefined,
                        background: isItemHidden(r) ? "#fef3c7" : undefined,
                      }}
                    >
                      {isItemHidden(r) ? <Eye size={12} /> : <EyeOff size={12} />} {isItemHidden(r) ? "Hiện" : "Ẩn"}
                    </button>
                    <button
                      type="button"
                      className="m-btn-icon-action btn-danger"
                      onClick={() => handleDeleteRequest(r.id)}
                      title="Xóa đề nghị thanh toán này"
                      style={{ width: "100%", height: "29px", padding: "0 2px", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "3px" }}
                    >
                      <Trash2 size={12} /> Xóa
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* On desktop: '+ Thêm đề nghị mới' interactive card */}
          {!isPhoneScreen && (
            <div
              className="m-card m-card-add-new"
              onClick={handleAddNewFromCardView}
              title="Nhấp để thêm đề nghị thanh toán mới ngay tại đây"
            >
              <div className="m-card-add-icon"><Plus size={28} /></div>
              <div className="m-card-add-title">Thêm đề nghị thanh toán mới</div>
              <div className="m-card-add-sub">
                Tạo phiếu nhanh chóng và mở form chỉnh sửa thẻ trực quan
              </div>
            </div>
          )}

          {filteredRequests.length === 0 && isPhoneScreen && (
            <div className="m-empty">Không tìm thấy đề nghị thanh toán nào</div>
          )}
        </div>
      ) : (
        /* Desktop Data Table */
        <div className="tablewrap advanced-table payment-advanced-table payment-table-container">
          <div className="payment-table-header">
            <span>DATA · Sửa trực tiếp từng ô (Cho phép co ngắn & xuống dòng · Nhấn Tab/Enter như Excel)</span>
            <span>Chọn STT → chọn dòng · Kéo thả tiêu đề cột để đổi thứ tự · Tự lưu</span>
          </div>
          <div className="payment-table-scroll">
            <table className="payment-grid">
              <thead>
                <tr>
                  <th
                    className="col-check-head"
                    style={{
                      width: "76px",
                      minWidth: "76px",
                      maxWidth: "82px",
                      textAlign: "center",
                      padding: "6px 2px",
                      boxSizing: "border-box",
                    }}
                    title="Cột thao tác: Hoàn thành, In phiếu, Chọn hàng loạt"
                  >
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                      <span title="Đánh dấu hoàn thành" style={{ fontSize: "12px", color: "#10b981", fontWeight: 700 }}>✓</span>
                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>In</span>
                      <input
                        type="checkbox"
                        style={{ margin: 0, cursor: "pointer" }}
                        checked={
                          filteredRequests.length > 0 &&
                          filteredRequests.every((r) => checkedIds.has(r.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCheckedIds(new Set(filteredRequests.map((r) => r.id)));
                          } else {
                            setCheckedIds(new Set());
                          }
                        }}
                      />
                    </div>
                  </th>

                  {visibleCols.map((col) => {
                    const isPinned = col.pinned;
                    const leftPx = stickyLeftMap[col.id];
                    const isLastPinned = col.id === lastPinnedId;
                    const colW = col.width || col.minWidth;

                    const style: React.CSSProperties = {
                      width: `${colW}px`,
                      minWidth: `${colW}px`,
                      textAlign: col.id === "amount" ? "right" : col.id === "stt" ? "center" : "left",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      position: "sticky",
                      top: 0,
                      boxSizing: "border-box",
                      ...(isPinned && leftPx !== undefined ? { left: `${leftPx}px` } : {}),
                    };

                    const classes = [
                      "draggable-head",
                      draggedColId === col.id ? "dragging" : "",
                      isPinned ? "pcol-frozen" : "",
                      isLastPinned ? "pcol-frozen-last" : "",
                    ].filter(Boolean).join(" ");

                    return (
                      <th
                        key={col.id}
                        className={classes}
                        style={style}
                        title={`${col.label} (${colW}px) · Kéo để đổi vị trí, kéo cạnh phải để chỉnh độ rộng`}
                        draggable
                        onDragStart={(e) => {
                          setDraggedColId(col.id);
                          e.dataTransfer.setData("text/plain", col.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedColId && draggedColId !== col.id) {
                            const next = [...columns];
                            const fromIdx = next.findIndex((c) => c.id === draggedColId);
                            const toIdx = next.findIndex((c) => c.id === col.id);
                            if (fromIdx >= 0 && toIdx >= 0) {
                              const [item] = next.splice(fromIdx, 1);
                              next.splice(toIdx, 0, item);
                              saveColumns(next);
                            }
                          }
                          setDraggedColId(null);
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: col.id === "amount" ? "flex-end" : col.id === "stt" ? "center" : "space-between",
                            gap: "4px",
                            paddingRight: "8px",
                            overflow: "hidden",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {getPaymentColLabel(col.id, col.label)}
                          </span>
                          {isPinned && (
                            <span title="Cột này đang được cố định bên trái" style={{ fontSize: "10.5px", color: "#0284c7", flexShrink: 0 }}>
                              📌
                            </span>
                          )}
                        </div>

                        {/* Drag-to-resize handle */}
                        <div
                          className={`col-resize-handle ${resizingColId === col.id ? "is-resizing" : ""}`}
                          onMouseDown={(e) => handleStartResize(col.id, e)}
                          onDoubleClick={(e) => handleDoubleClickResize(col.id, e)}
                          title="Kéo sang trái/phải để co dãn cột, nhấp đúp để đặt lại mặc định"
                        />
                      </th>
                    );
                  })}

                  <th
                    style={{
                      width: "68px",
                      minWidth: "68px",
                      maxWidth: "68px",
                      textAlign: "center",
                      padding: "6px 2px",
                      position: "sticky",
                      top: 0,
                      zIndex: 20,
                      background: "#f1f5f9",
                      borderBottom: "2px solid #94a3b8",
                      boxSizing: "border-box",
                    }}
                  >
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody onKeyDown={handleTableKeyDown} onPaste={handlePaymentTablePaste}>
                {filteredRequests.map((r) => {
                  const isChosen = activeRequestId === r.id;
                  const isDone = isPaymentCompleted(r);
                  const isFlashing = highlightedRowId === r.id;
                  const bg = isChosen ? "#eff6ff" : isDone ? "#f0fdf4" : "#ffffff";
                  return (
                    <tr
                      key={r.id}
                      id={`payment-row-${r.id}`}
                      className={`${isChosen ? "chosen" : ""} ${isDone ? "row-done row-completed" : ""} ${isFlashing ? "row-highlight-flash" : ""}`}
                      onClick={() => setActiveRequestId(r.id)}
                      onDoubleClick={() => handleOpenPaymentWorkspace(r.id)}
                      title="Nhấp đúp chuột để mở biểu mẫu in A4 (WYSIWYG)"
                    >
                      {/* Checkbox + In phiếu + Nút hoàn thành combined into 1 compact cell */}
                      <td
                        className="col-check-cell"
                        style={{
                          textAlign: "center",
                          width: "76px",
                          minWidth: "76px",
                          maxWidth: "82px",
                          background: bg,
                          padding: "6px 2px 2px",
                          whiteSpace: "nowrap",
                          boxSizing: "border-box",
                          verticalAlign: "top",
                        }}
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                          <button
                            type="button"
                            className={`completion-toggle-btn ${isDone ? "completed" : ""}`}
                            title={isDone ? "Đã thanh toán (Bấm để chuyển về Chưa thanh toán)" : "Chưa thanh toán (Bấm để đánh dấu Đã thanh toán & đồng bộ PO)"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleComplete(r);
                            }}
                            style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 1px", display: "inline-flex", lineHeight: 1 }}
                          >
                            {isDone ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-slate-400 hover:text-slate-600" />}
                          </button>
                          <button
                            type="button"
                            className="payment-btn"
                            style={{ padding: "2px 4px", fontSize: "11px", lineHeight: 1 }}
                            title="In phiếu này"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintSingle(r);
                            }}
                          >
                            ⎙
                          </button>
                          <button
                            type="button"
                            className="payment-btn"
                            style={{ padding: "2px 5px", fontSize: "11px", lineHeight: 1, color: "#0284c7", borderColor: "#bae6fd", background: "#f0f9ff", fontWeight: 700 }}
                            title="Mở biểu mẫu in A4 (WYSIWYG) để soạn thảo trực quan"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPaymentWorkspace(r.id);
                            }}
                          >
                            📄 Mở A4
                          </button>
                          <input
                            type="checkbox"
                            style={{ margin: 0, cursor: "pointer" }}
                            checked={checkedIds.has(r.id)}
                            onChange={(e) => {
                              const next = new Set(checkedIds);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              setCheckedIds(next);
                            }}
                          />
                        </div>
                      </td>

                      {/* Visible configured columns */}
                      {visibleCols.map((col) => {
                        const isPinned = col.pinned;
                        const leftPx = stickyLeftMap[col.id];
                        const isLastPinned = col.id === lastPinnedId;
                        const colW = col.width || col.minWidth;
                        const isMultilineCol = ["description", "address", "item_name", "doc_supplement"].includes(col.id);

                        const style: React.CSSProperties = {
                          width: `${colW}px`,
                          minWidth: `${colW}px`,
                          textAlign: col.id === "amount" ? "right" : col.id === "stt" ? "center" : "left",
                          overflow: isMultilineCol ? "visible" : "hidden",
                          whiteSpace: isMultilineCol ? "normal" : "nowrap",
                          wordBreak: isMultilineCol ? "break-word" : undefined,
                          overflowWrap: isMultilineCol ? "anywhere" : undefined,
                          boxSizing: "border-box",
                          verticalAlign: "top",
                          ...(isPinned && leftPx !== undefined ? { left: `${leftPx}px` } : {}),
                        };

                        const classes = [
                          isPinned ? "pcol-frozen" : "",
                          isLastPinned ? "pcol-frozen-last" : "",
                          isMultilineCol ? "pcol-multiline" : "",
                        ].filter(Boolean).join(" ");

                        return (
                          <td key={col.id} className={classes} style={style}>
                            {renderTableCellContent(col.id, r)}
                          </td>
                        );
                      })}

                      {/* Actions: Hide/Unhide & Delete */}
                      <td
                        style={{
                          textAlign: "center",
                          width: "68px",
                          minWidth: "68px",
                          maxWidth: "68px",
                          padding: "4px 2px 2px",
                          boxSizing: "border-box",
                          verticalAlign: "top",
                        }}
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", justifyContent: "center" }}>
                          <button
                            type="button"
                            className="payment-btn"
                            style={{
                              padding: "2px 5px",
                              fontSize: "11px",
                              color: isItemHidden(r) ? "#d97706" : "#64748b",
                              background: isItemHidden(r) ? "#fef3c7" : undefined,
                            }}
                            title={isItemHidden(r) ? "Hiện lại đề nghị này" : "Ẩn đề nghị này khỏi bảng"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleHideRequest(r.id, isItemHidden(r));
                            }}
                          >
                            {isItemHidden(r) ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          <button
                            type="button"
                            className="payment-btn btn-danger"
                            style={{ padding: "2px 6px", fontSize: "11px" }}
                            title="Xóa đề nghị này"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRequest(r.id);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + 2} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                      Không tìm thấy đề nghị thanh toán nào phù hợp
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Lines Box for Active Request (Desktop only - Mobile is strictly view-only) */}
      {!showMobileCards && activeReq && (
        <details className="payment-detail-box" open>
          <summary>
            Chi tiết nhiều hóa đơn / hàng hóa của dòng đang chọn (STT: {activeReq.legacy_stt || activeReq.id} - {activeReq.payee_name || "Chưa có tên"})
          </summary>
          <p style={{ margin: "4px 0 10px", fontSize: "12px", color: "#64748b" }}>
            Chọn STT trong bảng rồi chỉnh sửa các dòng chi tiết tại đây (Tên hàng hóa, Số hóa đơn, Ngày hóa đơn, Số tiền). Dòng đầu tiên sẽ tự động đồng bộ lên bảng DATA.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 115px 140px 140px 36px",
                gap: "8px",
                fontSize: "11.5px",
                fontWeight: 600,
                color: "#475569",
              }}
            >
              <div>Tên hàng hóa / dịch vụ</div>
              <div>Số hóa đơn</div>
              <div>Ngày hóa đơn</div>
              <div style={{ textAlign: "right" }}>Số tiền</div>
              <div></div>
            </div>

            {(activeReq.lines || []).map((line, lIdx) => (
              <div
                key={lIdx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 115px 140px 140px 36px",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <AutoGrowTextarea
                  className="cell-editor-textarea"
                  style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px", background: "#fff" }}
                  value={line.description || ""}
                  placeholder="Tên hàng hóa..."
                  onChange={(val) => {
                    const lines = [...(activeReq.lines || [])];
                    lines[lIdx] = { ...lines[lIdx], description: val };
                    const patch: Partial<PaymentRequestEntry> = { lines };
                    if (lIdx === 0) patch.item_name = val;
                    handleEditRequest(activeReq.id, patch);
                  }}
                />
                <input
                  list="invoiceDataList"
                  style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px" }}
                  value={line.invoice_no || ""}
                  placeholder="Số HĐ..."
                  onChange={(e) => {
                    const lines = [...(activeReq.lines || [])];
                    lines[lIdx] = { ...lines[lIdx], invoice_no: e.target.value };
                    const patch: Partial<PaymentRequestEntry> = { lines };
                    if (lIdx === 0) patch.invoice_no = e.target.value;
                    handleEditRequest(activeReq.id, patch);
                  }}
                />
                <div className="cell-date-wrap">
                  <input
                    style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px" }}
                    value={line.invoice_date || ""}
                    placeholder="dd/mm/yyyy"
                    onChange={(e) => {
                      const lines = [...(activeReq.lines || [])];
                      lines[lIdx] = { ...lines[lIdx], invoice_date: e.target.value };
                      const patch: Partial<PaymentRequestEntry> = { lines };
                      if (lIdx === 0) patch.invoice_date = e.target.value;
                      handleEditRequest(activeReq.id, patch);
                    }}
                    onBlur={(e) => {
                      const parsed = parseFlexibleDate(e.target.value);
                      if (parsed !== e.target.value) {
                        const lines = [...(activeReq.lines || [])];
                        lines[lIdx] = { ...lines[lIdx], invoice_date: parsed };
                        const patch: Partial<PaymentRequestEntry> = { lines };
                        if (lIdx === 0) patch.invoice_date = parsed;
                        handleEditRequest(activeReq.id, patch);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="cell-date-btn"
                    title="Chọn ngày"
                    onClick={() =>
                      openCalendar(line.invoice_date || "", (val) => {
                        const lines = [...(activeReq.lines || [])];
                        lines[lIdx] = { ...lines[lIdx], invoice_date: val };
                        const patch: Partial<PaymentRequestEntry> = { lines };
                        if (lIdx === 0) patch.invoice_date = val;
                        handleEditRequest(activeReq.id, patch);
                      })
                    }
                  >
                    📅
                  </button>
                </div>
                <MoneyInput
                  style={{
                    padding: "6px 8px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "5px",
                    fontSize: "12px",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                  value={line.amount}
                  placeholder="0"
                  onValueChange={(val) => {
                    const lines = [...(activeReq.lines || [])];
                    lines[lIdx] = { ...lines[lIdx], amount: val };
                    const totalAmt = lines.reduce(
                      (sum, it) => sum + (Number(it.amount) || 0),
                      0
                    );
                    handleEditRequest(activeReq.id, { lines, amount: totalAmt });
                  }}
                />
                <button
                  type="button"
                  className="payment-btn btn-danger"
                  style={{ padding: "4px 8px" }}
                  onClick={() => {
                    const lines = (activeReq.lines || []).filter(
                      (_, idx) => idx !== lIdx
                    );
                    handleEditRequest(activeReq.id, "lines", lines);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              className="payment-btn"
              style={{ alignSelf: "flex-start", marginTop: "4px" }}
              onClick={() => {
                const lines = [
                  ...(activeReq.lines || []),
                  { description: "", invoice_no: "", invoice_date: "", amount: 0 },
                ];
                handleEditRequest(activeReq.id, "lines", lines);
              }}
            >
              ＋ Thêm dòng hàng hóa
            </button>
          </div>
        </details>
      )}

      {/* MODAL 1: Document Attachment */}
      {docModalReqId !== null && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "540px" }}>
            <div className="payment-modal-header">
              <h3>📎 Hồ sơ / chứng từ đi kèm đề nghị</h3>
              <button type="button" onClick={() => setDocModalReqId(null)}>✕</button>
            </div>

            {(() => {
              const req = paymentRequests.find((r) => r.id === docModalReqId);
              if (!req) return null;
              const attached = new Set(req.documents || []);

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontSize: "13px", color: "#64748b" }}>
                    Phiếu STT: <b>{req.legacy_stt || req.id}</b> - {req.payee_name || "Chưa có tên"}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: "8px",
                      maxHeight: "300px",
                      overflowY: "auto",
                      padding: "4px",
                    }}
                  >
                    {customDocTypes.map((doc) => {
                      const isChecked = attached.has(doc);
                      return (
                        <label
                          key={doc}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            border: `1px solid ${isChecked ? "#bfdbfe" : "#e2e8f0"}`,
                            background: isChecked ? "#eff6ff" : "#ffffff",
                            cursor: "pointer",
                            fontSize: "12px",
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const nextDocs = new Set(attached);
                              if (e.target.checked) nextDocs.add(doc);
                              else nextDocs.delete(doc);
                              handleEditRequest(req.id, "documents", Array.from(nextDocs));
                            }}
                          />
                          <span>{doc}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Add custom document input */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      style={{ flex: 1, padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px" }}
                      placeholder="Nhập tên loại chứng từ khác..."
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newDocName.trim()) {
                          e.preventDefault();
                          const val = newDocName.trim();
                          if (!customDocTypes.includes(val)) {
                            setCustomDocTypes([...customDocTypes, val]);
                          }
                          const nextDocs = new Set(attached);
                          nextDocs.add(val);
                          handleEditRequest(req.id, "documents", Array.from(nextDocs));
                          setNewDocName("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="payment-btn"
                      onClick={() => {
                        if (newDocName.trim()) {
                          const val = newDocName.trim();
                          if (!customDocTypes.includes(val)) {
                            setCustomDocTypes([...customDocTypes, val]);
                          }
                          const nextDocs = new Set(attached);
                          nextDocs.add(val);
                          handleEditRequest(req.id, "documents", Array.from(nextDocs));
                          setNewDocName("");
                        }
                      }}
                    >
                      ＋ Thêm hồ sơ
                    </button>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      Đã chọn: <b>{attached.size}</b> hồ sơ
                    </span>
                    <button
                      type="button"
                      className="payment-btn btn-primary"
                      onClick={() => setDocModalReqId(null)}
                    >
                      Hoàn tất
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 2: PO / Contract Picker Modal */}
      {showPOPickerModal && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "760px", width: "95%" }}>
            <div className="payment-modal-header">
              <h3>⚡ Chọn PO / Hợp đồng để lập Đề nghị thanh toán</h3>
              <button type="button" onClick={() => setShowPOPickerModal(false)}>✕</button>
            </div>

            <div style={{ fontSize: "12.5px", color: "#64748b" }}>
              Hệ thống tự động điền Nhà cung cấp, số tiền, tài khoản ngân hàng, danh sách hàng hóa và tạo nhóm giải ngân theo mã PO / Hợp đồng.
            </div>

            {/* Document Type Tabs */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
              <button
                type="button"
                className={`payment-tab-btn ${poFilterType === "all" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: poFilterType === "all" ? "#0284c7" : "#fff",
                  color: poFilterType === "all" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => setPoFilterType("all")}
              >
                Tất cả ({pos.length})
              </button>
              <button
                type="button"
                className={`payment-tab-btn ${poFilterType === "po" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: poFilterType === "po" ? "#0284c7" : "#fff",
                  color: poFilterType === "po" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => setPoFilterType("po")}
              >
                🛒 Đơn mua hàng PO ({poOnlyCount})
              </button>
              <button
                type="button"
                className={`payment-tab-btn ${poFilterType === "contract" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: poFilterType === "contract" ? "#7c3aed" : "#fff",
                  color: poFilterType === "contract" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => setPoFilterType("contract")}
              >
                📑 Hợp đồng kinh tế ({contractCount})
              </button>
              <button
                type="button"
                style={{
                  marginLeft: "auto",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #059669",
                  background: "#ecfdf5",
                  color: "#059669",
                  fontWeight: 700,
                }}
                onClick={() => {
                  setShowPOPickerModal(false);
                  handleAddNewFromCardView();
                }}
                title="Tạo đề nghị thanh toán độc lập không theo PO / Hợp đồng"
              >
                + Tạo ĐNTT trực tiếp (nhập tay)
              </button>
            </div>

            <input
              placeholder="Tìm theo số PO, số hợp đồng, tên nhà cung cấp, hoặc tên mặt hàng..."
              value={poSearch}
              onChange={(e) => setPoSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
            />

            <div style={{ maxHeight: "420px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
              {pos
                .filter((p) => {
                  const isContract = isPOContract(p);
                  if (poFilterType === "po" && isContract) return false;
                  if (poFilterType === "contract" && !isContract) return false;
                  if (!poSearch) return true;
                  const s = suppliers.find((x) => x.id === p.supplierId);
                  const q = normName(poSearch);
                  const itemMatch = p.items.some(
                    (it) => normName(it.name).includes(q) || normName(it.spec || "").includes(q)
                  );
                  return (
                    normName(p.number).includes(q) ||
                    (s && (normName(s.name).includes(q) || normName(s.shortName || "").includes(q))) ||
                    itemMatch
                  );
                })
                .map((po) => {
                  const s = suppliers.find((x) => x.id === po.supplierId);
                  const total = po.items.reduce((sum, it) => sum + it.qty * it.price, 0);
                  const isContract = isPOContract(po);
                  const selectedPhase = poSelectedMilestone[po.id];

                  return (
                    <div
                      key={po.id}
                      style={{
                        padding: "12px 14px",
                        border: isContract ? "1px solid #e9d5ff" : "1px solid #e2e8f0",
                        borderRadius: "8px",
                        background: isContract ? "#faf5ff" : "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: isContract ? "#ede9fe" : "#e0f2fe",
                                color: isContract ? "#6b21a8" : "#0369a1",
                                border: `1px solid ${isContract ? "#d8b4fe" : "#bae6fd"}`,
                              }}
                            >
                              {isContract ? "📑 Hợp đồng" : "🛒 Đơn mua hàng PO"}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: "14px", color: isContract ? "#6b21a8" : "#0284c7" }}>
                              #{po.number}
                            </span>
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "4px" }}>
                            {s?.name || "Chưa rõ NCC"}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>
                            Ngày lập: <b>{dateVN(po.createdDate) || "---"}</b> · {po.items.length} mặt hàng
                            {po.items.length > 0 && ` (${po.items.map((i) => i.name).slice(0, 3).join(", ")}${po.items.length > 3 ? "..." : ""})`}
                          </div>
                        </div>

                        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                          <div style={{ fontWeight: 700, color: "#166534", fontSize: "15px" }}>
                            {fmtMoney(total)} ₫
                          </div>
                          <button
                            type="button"
                            className="payment-btn btn-primary"
                            onClick={() => handleCreateFromPO(po, selectedPhase)}
                          >
                            ⚡ Lập đề nghị {selectedPhase ? `(${selectedPhase})` : ""}
                          </button>
                        </div>
                      </div>

                      {/* Payment milestones selector if contract/PO has payments */}
                      {po.payments && po.payments.length > 0 && (
                        <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "6px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "12px" }}>
                          <span style={{ color: "#475569", fontWeight: 600 }}>Chọn đợt TT:</span>
                          <button
                            type="button"
                            className="payment-btn"
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              background: !selectedPhase ? "#0284c7" : "#fff",
                              color: !selectedPhase ? "#fff" : "#334155",
                              borderColor: !selectedPhase ? "#0284c7" : "#cbd5e1",
                            }}
                            onClick={() => {
                              setPoSelectedMilestone((prev) => {
                                const next = { ...prev };
                                delete next[po.id];
                                return next;
                              });
                            }}
                          >
                            100% ({fmtMoney(total)} ₫)
                          </button>
                          {po.payments.map((pm, pidx) => {
                            const pmAmt = pm.amount || (total * pm.percent) / 100;
                            const isChosen = selectedPhase === String(pm.id || pm.phase);
                            return (
                              <button
                                key={pidx}
                                type="button"
                                className="payment-btn"
                                style={{
                                  fontSize: "11px",
                                  padding: "2px 8px",
                                  background: isChosen ? "#0284c7" : "#fff",
                                  color: isChosen ? "#fff" : "#0284c7",
                                  borderColor: "#0284c7",
                                  fontWeight: isChosen ? 700 : 500,
                                }}
                                onClick={() => {
                                  setPoSelectedMilestone((prev) => ({
                                    ...prev,
                                    [po.id]: String(pm.id || pm.phase),
                                  }));
                                }}
                              >
                                {pm.phase} ({pm.percent}%: {fmtMoney(pmAmt)} ₫)
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              {pos.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                  Chưa có đơn hàng PO hoặc hợp đồng nào trong hệ thống mua hàng.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Link PO / Contract into existing Payment Request */}
      {renderLinkDocModal()}

      {/* MODAL: Tùy chỉnh cột hiển thị & Cố định cột */}
      {showColumnConfigModal && (
        <div className="payment-modal-overlay">
          <div
            className="payment-modal-card"
            style={{ maxWidth: "600px", width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>⚙️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px" }}>Tùy chỉnh cột hiển thị & Cố định cột</h3>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    Bật/tắt cột, sắp xếp thứ tự hiển thị và chọn các cột cần ghim cố định bên trái
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setShowColumnConfigModal(false)}>✕</button>
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", paddingRight: "4px" }}>
              {columns.map((col, idx) => (
                <div
                  key={col.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px",
                    background: col.visible ? (col.pinned ? "#f0f9ff" : "#f8fafc") : "#f1f5f9",
                    border: col.pinned ? "1px solid #7dd3fc" : "1px solid #e2e8f0",
                    borderRadius: "6px",
                    opacity: col.visible ? 1 : 0.65,
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={(e) => {
                        const next = columns.map((c, i) =>
                          i === idx ? { ...c, visible: e.target.checked } : c
                        );
                        saveColumns(next);
                      }}
                      id={`col-chk-${col.id}`}
                      style={{ cursor: "pointer" }}
                    />
                    <label
                      htmlFor={`col-chk-${col.id}`}
                      style={{
                        fontSize: "13px",
                        fontWeight: col.visible ? 600 : 400,
                        color: col.visible ? "#0f172a" : "#64748b",
                        cursor: "pointer",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.label}
                    </label>
                    {col.id === "stt" && (
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>(Mặc định ẩn)</span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    {/* Width input */}
                    <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "#64748b" }}>
                      <input
                        type="number"
                        min={50}
                        max={600}
                        step={5}
                        value={col.width === 0 ? "" : (col.width || col.minWidth)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const w = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                          const next = columns.map((c, i) => (i === idx ? { ...c, width: w } : c));
                          saveColumns(next);
                        }}
                        onBlur={(e) => {
                          const w = Math.max(50, parseInt(e.target.value, 10) || col.minWidth);
                          const next = columns.map((c, i) => (i === idx ? { ...c, width: w } : c));
                          saveColumns(next);
                        }}
                        style={{
                          width: "55px",
                          padding: "2px 4px",
                          fontSize: "11.5px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          textAlign: "right",
                        }}
                        title="Độ rộng cột (pixel)"
                      />
                      <span>px</span>
                    </div>

                    {/* Pin / Freeze Button */}
                    <button
                      type="button"
                      className="payment-btn"
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        background: col.pinned ? "#0284c7" : "#fff",
                        color: col.pinned ? "#fff" : "#475569",
                        borderColor: col.pinned ? "#0284c7" : "#cbd5e1",
                        fontWeight: 600,
                      }}
                      onClick={() => {
                        const next = columns.map((c, i) =>
                          i === idx ? { ...c, pinned: !c.pinned } : c
                        );
                        saveColumns(next);
                      }}
                      title={col.pinned ? "Bỏ cố định cột này" : "Cố định cột này khi cuộn ngang"}
                    >
                      {col.pinned ? "📌 Ghim" : "Ghim"}
                    </button>

                    {/* Move Up */}
                    <button
                      type="button"
                      className="payment-btn"
                      disabled={idx === 0}
                      style={{ padding: "2px 7px", fontSize: "12px", opacity: idx === 0 ? 0.3 : 1 }}
                      onClick={() => {
                        if (idx === 0) return;
                        const next = [...columns];
                        const temp = next[idx - 1];
                        next[idx - 1] = next[idx];
                        next[idx] = temp;
                        saveColumns(next);
                      }}
                      title="Di chuyển lên trên"
                    >
                      ↑
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      className="payment-btn"
                      disabled={idx === columns.length - 1}
                      style={{ padding: "2px 7px", fontSize: "12px", opacity: idx === columns.length - 1 ? 0.3 : 1 }}
                      onClick={() => {
                        if (idx === columns.length - 1) return;
                        const next = [...columns];
                        const temp = next[idx + 1];
                        next[idx + 1] = next[idx];
                        next[idx] = temp;
                        saveColumns(next);
                      }}
                      title="Di chuyển xuống dưới"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "12px", marginTop: "12px" }}>
              <button
                type="button"
                className="payment-btn"
                style={{ fontSize: "12px", color: "#64748b" }}
                onClick={() => saveColumns(DEFAULT_COLUMN_SETTINGS)}
              >
                ↺ Khôi phục mặc định
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                onClick={() => setShowColumnConfigModal(false)}
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Quản lý nhiều hóa đơn cho 1 đề nghị thanh toán */}
      {(() => {
        if (multiInvoiceModalReqId === null) return null;
        const multiReq = paymentRequests.find((r) => r.id === multiInvoiceModalReqId);
        if (!multiReq) return null;

        return (
          <div className="payment-modal-overlay">
            <div
              className="payment-modal-card"
              style={{ maxWidth: "1100px", width: "95%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="payment-modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px" }}>📑</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>
                      Danh sách Hóa đơn — {multiReq.payee_name || "Chưa có NCC"}
                    </h3>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      Đề nghị STT {multiReq.legacy_stt || multiReq.id} · Quản lý nhiều hóa đơn các ngày khác nhau cho cùng 1 đề nghị thanh toán
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setMultiInvoiceModalReqId(null)}>✕</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                    Chi tiết {multiReq.lines?.length || 0} hóa đơn:
                  </span>
                  <button
                    type="button"
                    className="payment-btn btn-primary"
                    style={{ fontSize: "12px", padding: "4px 10px" }}
                    onClick={() => {
                      const currentLines = multiReq.lines || [];
                      const nextLines = [
                        ...currentLines,
                        { description: multiReq.item_name || "", invoice_no: "", invoice_date: "", amount: 0 },
                      ];
                      handleEditRequest(multiReq.id, "lines", nextLines);
                    }}
                  >
                    ＋ Thêm hóa đơn
                  </button>
                </div>

                <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "8px 6px", textAlign: "center", width: "35px" }}>STT</th>
                        <th style={{ padding: "8px 6px", textAlign: "left", width: "130px" }}>Số hóa đơn</th>
                        <th style={{ padding: "8px 6px", textAlign: "left", width: "125px" }}>Ngày hóa đơn</th>
                        <th style={{ padding: "8px 6px", textAlign: "left", width: "170px" }}>Bản scan HĐ</th>
                        <th style={{ padding: "8px 6px", textAlign: "left" }}>Tên hàng / Dịch vụ</th>
                        <th style={{ padding: "8px 6px", textAlign: "right", width: "135px" }}>Số tiền (₫)</th>
                        <th style={{ padding: "8px 6px", textAlign: "center", width: "36px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(multiReq.lines || []).map((line, lIdx) => (
                        <tr key={lIdx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ textAlign: "center", color: "#64748b" }}>{lIdx + 1}</td>
                          <td style={{ padding: "4px" }}>
                            <input
                              className="payment-input"
                              style={{ width: "100%" }}
                              list="invoiceDataList"
                              value={line.invoice_no || ""}
                              placeholder="Số HĐ..."
                              onChange={(e) => {
                                const lines = [...(multiReq.lines || [])];
                                lines[lIdx] = { ...lines[lIdx], invoice_no: e.target.value };
                                const allNos = lines.map((x) => x.invoice_no).filter(Boolean).join(", ");
                                handleEditRequest(multiReq.id, { lines, invoice_no: allNos });
                              }}
                            />
                          </td>
                          <td style={{ padding: "4px" }}>
                            <div className="cell-date-wrap">
                              <input
                                className="payment-input"
                                style={{ width: "100%" }}
                                value={line.invoice_date || ""}
                                placeholder="dd/mm/yyyy"
                                onChange={(e) => {
                                  const lines = [...(multiReq.lines || [])];
                                  lines[lIdx] = { ...lines[lIdx], invoice_date: e.target.value };
                                  handleEditRequest(multiReq.id, "lines", lines);
                                }}
                                onBlur={(e) => {
                                  const p = parseFlexibleDate(e.target.value);
                                  if (p !== e.target.value) {
                                    const lines = [...(multiReq.lines || [])];
                                    lines[lIdx] = { ...lines[lIdx], invoice_date: p };
                                    handleEditRequest(multiReq.id, "lines", lines);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="cell-date-btn"
                                title="Chọn ngày"
                                onClick={() =>
                                  openCalendar(line.invoice_date || "", (val) => {
                                    const lines = [...(multiReq.lines || [])];
                                    lines[lIdx] = { ...lines[lIdx], invoice_date: val };
                                    handleEditRequest(multiReq.id, "lines", lines);
                                  })
                                }
                              >
                                📅
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: "4px" }}>
                            <InvoiceScanControl
                              compact
                              readOnly={readOnly}
                              scanUrl={line.invoice_scan_url || (lIdx === 0 ? multiReq.invoice_scan_url : undefined)}
                              scanName={line.invoice_scan_name || (lIdx === 0 ? multiReq.invoice_scan_name : undefined)}
                              invoiceNo={line.invoice_no || multiReq.invoice_no}
                              invoiceDate={line.invoice_date || multiReq.invoice_date}
                              entityCode={multiReq.group_code || `DNTT-${multiReq.legacy_stt || multiReq.id}`}
                              supplierName={multiReq.payee_name}
                              onUpdate={(scanUrl, scanName) => {
                                const lines = [...(multiReq.lines || [])];
                                lines[lIdx] = {
                                  ...lines[lIdx],
                                  invoice_scan_url: scanUrl,
                                  invoice_scan_name: scanName,
                                };
                                const patch: Partial<PaymentRequestEntry> = { lines };
                                if (lIdx === 0) {
                                  patch.invoice_scan_url = scanUrl;
                                  patch.invoice_scan_name = scanName;
                                }
                                handleEditRequest(multiReq.id, patch);
                              }}
                            />
                          </td>
                          <td style={{ padding: "4px" }}>
                            <input
                              className="payment-input"
                              style={{ width: "100%" }}
                              list="itemDataList"
                              value={line.description || ""}
                              placeholder="Tên hàng..."
                              onChange={(e) => {
                                const lines = [...(multiReq.lines || [])];
                                lines[lIdx] = { ...lines[lIdx], description: e.target.value };
                                handleEditRequest(multiReq.id, "lines", lines);
                              }}
                            />
                          </td>
                          <td style={{ padding: "4px", textAlign: "right" }}>
                            <MoneyInput
                              className="payment-input"
                              style={{ width: "100%", textAlign: "right", fontWeight: 600 }}
                              value={line.amount}
                              onValueChange={(val) => {
                                const lines = [...(multiReq.lines || [])];
                                lines[lIdx] = { ...lines[lIdx], amount: val };
                                const sumAmt = lines.reduce((s, it) => s + (Number(it.amount) || 0), 0);
                                handleEditRequest(multiReq.id, { lines, amount: sumAmt });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: "center", padding: "4px" }}>
                            <button
                              type="button"
                              className="payment-btn btn-danger"
                              style={{ padding: "2px 6px", fontSize: "11px" }}
                              title="Xóa hóa đơn này"
                              onClick={() => {
                                const lines = (multiReq.lines || []).filter((_, i) => i !== lIdx);
                                const sumAmt = lines.reduce((s, it) => s + (Number(it.amount) || 0), 0);
                                const allNos = lines.map((x) => x.invoice_no).filter(Boolean).join(", ");
                                handleEditRequest(multiReq.id, { lines, amount: sumAmt, invoice_no: allNos });
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(multiReq.lines || []).length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "16px", color: "#64748b" }}>
                            Chưa có hóa đơn nào. Bấm &quot;＋ Thêm hóa đơn&quot; ở trên để bắt đầu nhập.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f8fafc", fontWeight: "bold", borderTop: "2px solid #cbd5e1" }}>
                        <td colSpan={4} style={{ textAlign: "right", padding: "8px" }}>
                          Tổng cộng tiền ({multiReq.lines?.length || 0} hóa đơn):
                        </td>
                        <td style={{ textAlign: "right", padding: "8px", color: "#0d9488", fontSize: "13px" }}>
                          {fmtMoney(multiReq.amount)} ₫
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Tổng số tiền và danh sách số hóa đơn sẽ tự động cập nhật lên dòng đề nghị thanh toán.
                  </span>
                  <button
                    type="button"
                    className="payment-btn btn-primary"
                    onClick={() => setMultiInvoiceModalReqId(null)}
                  >
                    Đóng / Hoàn tất
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PORTAL PRINT CONTAINER - Completely isolated from app */}
      {typeof document !== "undefined" && isPrinting && createPortal(
        <div id="paymentPrintPortal">
          {(printEntriesList || []).map((req, idx) => (
            <PaymentPrintSheet
              key={req?.id || idx}
              req={req}
              tpl={paymentTemplate}
              suppliers={suppliers}
            />
          ))}
        </div>,
        document.body
      )}
    </section>
  );
}
