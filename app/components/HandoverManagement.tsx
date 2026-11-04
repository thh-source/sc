"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  FileText,
  ClipboardPaste,
  Printer,
  Receipt,
  Trash2,
  Settings,
  Minimize2,
  Maximize2,
  Table,
  LayoutGrid,
  Search,
  X,
  Check,
  Package,
} from "lucide-react";
import { PaymentHandoverItem, PR, PO, Supplier, PaymentRequestEntry } from "../types";
import { calcPODeliveryStats } from "../utils/paymentSync";
import { navigateTo } from "../utils/navigation";
import {
  normName,
  localToday,
  parsePrintDate,
  parseFlexibleDate,
  parseExcelText,
  PHENIKAA_PHARMA_LOGO_BASE64,
} from "../payment-utils";
import "../payment.css";
import { useIsMobile } from "../useIsMobile";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { useTranslation } from "../i18n";
import { addNewDepartment, getUnifiedDepartments } from "../utils/departments";
import { sortHandoversByPOLineOrder } from "../utils/handoverBatches";

const PHENIKAA_LOGO_SRC = PHENIKAA_PHARMA_LOGO_BASE64;

const UNIT_SUGGESTIONS = [
  "Cái",
  "Bộ",
  "Chiếc",
  "Mét",
  "Cuộn",
  "Thùng",
  "Hộp",
  "Bình",
  "Kg",
  "Lít",
  "Gói",
  "Tấm",
];

export type HandoverColumnId =
  | "stt"
  | "department"
  | "item_name"
  | "unit"
  | "quantity_doc"
  | "quantity_pass"
  | "quantity_fail"
  | "note"
  | "handover_date"
  | "sender_name"
  | "receiver_name";

export interface HandoverColumnSetting {
  id: HandoverColumnId;
  label: string;
  minWidth: number;
  width: number;
  visible: boolean;
  pinned: boolean;
  align?: "left" | "center" | "right";
}

export const DEFAULT_HANDOVER_COLUMN_SETTINGS: HandoverColumnSetting[] = [
  { id: "stt", label: "STT", minWidth: 45, width: 55, visible: true, pinned: true, align: "center" },
  { id: "department", label: "Bộ phận nhận", minWidth: 120, width: 170, visible: true, pinned: false, align: "left" },
  { id: "item_name", label: "Tên hàng hóa - Quy cách", minWidth: 180, width: 280, visible: true, pinned: false, align: "left" },
  { id: "unit", label: "ĐVT", minWidth: 60, width: 80, visible: true, pinned: false, align: "center" },
  { id: "quantity_doc", label: "SL chứng từ", minWidth: 70, width: 95, visible: true, pinned: false, align: "center" },
  { id: "quantity_pass", label: "SL Đạt", minWidth: 70, width: 95, visible: true, pinned: false, align: "center" },
  { id: "quantity_fail", label: "SL Hỏng", minWidth: 70, width: 95, visible: true, pinned: false, align: "center" },
  { id: "note", label: "Ghi chú", minWidth: 110, width: 170, visible: true, pinned: false, align: "left" },
  { id: "handover_date", label: "Ngày bàn giao", minWidth: 110, width: 130, visible: true, pinned: false, align: "left" },
  { id: "sender_name", label: "Bên giao", minWidth: 110, width: 140, visible: true, pinned: false, align: "left" },
  { id: "receiver_name", label: "Bên nhận", minWidth: 110, width: 140, visible: true, pinned: false, align: "left" },
];

export interface HandoverManagementProps {
  paymentHandovers: PaymentHandoverItem[];
  onUpdateHandovers?: (handovers: PaymentHandoverItem[]) => void;
  onUpdateState?: (patch: { paymentHandovers?: PaymentHandoverItem[] }) => void;
  readOnly?: boolean;
  prs?: PR[];
  pos?: PO[];
  suppliers?: Supplier[];
  initialSearchQuery?: string;
  paymentRequests?: PaymentRequestEntry[];
  onNavigateToPayment?: (req: PaymentRequestEntry) => void;
  onMoveToTrash?: (type: "HANDOVER", label: string, data: any, msg?: string) => void;
  autoOpenCreate?: boolean;
  onClearAutoCreate?: () => void;
}

export function HandoverManagement({
  paymentHandovers = [],
  onUpdateHandovers,
  onUpdateState,
  readOnly = false,
  prs = [],
  pos = [],
  suppliers = [],
  initialSearchQuery,
  paymentRequests = [],
  onNavigateToPayment,
  onMoveToTrash,
  autoOpenCreate = false,
  onClearAutoCreate,
}: HandoverManagementProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (autoOpenCreate) {
      openImportDocModal();
      onClearAutoCreate?.();
    }
  }, [autoOpenCreate]);

  const getHandoverColLabel = (id: string, fallback: string) => {
    switch (id) {
      case "stt": return t("table.stt");
      case "department": return t("table.receiver_dept");
      case "item_name": return t("table.item_name");
      case "unit": return t("table.unit");
      case "quantity_doc": return t("table.quantity");
      case "quantity_pass": return t("status.delivered");
      case "note": return t("table.notes");
      case "handover_date": return t("table.handover_date");
      case "sender_name": return t("table.sender");
      default: return fallback;
    }
  };

  const triggerUpdateHandovers = (next: PaymentHandoverItem[]) => {
    if (onUpdateHandovers) onUpdateHandovers(next);
    if (onUpdateState) onUpdateState({ paymentHandovers: next });
  };
  // Mặc định hiển thị theo Thẻ của từng Đợt bàn giao (có thể chuyển sang Bảng chi tiết từng vật tư)
  const isAutoMobile = useIsMobile(768);
  const [userMobileToggle, setUserMobileToggle] = useState<boolean | null>(true);
  const showMobileCards = userMobileToggle !== null ? userMobileToggle : true;
  const [expandedBatchKeys, setExpandedBatchKeys] = useState<Set<string>>(new Set());
  const [editingBatchKey, setEditingBatchKey] = useState<string | null>(null);

  // Column customization modal state & persistence
  const [showColumnConfigModal, setShowColumnConfigModal] = useState(false);

  const [columns, setColumns] = useState<HandoverColumnSetting[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const validIds = new Set(DEFAULT_HANDOVER_COLUMN_SETTINGS.map((d) => d.id));
        const saved = localStorage.getItem("scmh_handover_columns_v2");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const defaultMap = new Map(DEFAULT_HANDOVER_COLUMN_SETTINGS.map((d) => [d.id, d]));
            const validParsed = parsed.filter((p: any) => p && validIds.has(p.id));
            if (validParsed.length > 0) {
              const existingIds = new Set(validParsed.map((p: any) => p.id));
              const merged = validParsed.map((p: any) => {
                const def = defaultMap.get(p.id)!;
                return {
                  id: p.id,
                  label: def.label,
                  minWidth: def.minWidth,
                  width: Number(p.width) || def.width || def.minWidth,
                  visible: p.visible !== undefined ? p.visible : def.visible,
                  pinned: p.pinned !== undefined ? p.pinned : def.pinned,
                  align: def.align,
                };
              });
              const missing = DEFAULT_HANDOVER_COLUMN_SETTINGS.filter((d) => !existingIds.has(d.id));
              return [...merged, ...missing];
            }
          }
        }
      } catch {}
    }
    return DEFAULT_HANDOVER_COLUMN_SETTINGS;
  });

  const saveColumns = (newCols: HandoverColumnSetting[]) => {
    setColumns(newCols);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("scmh_handover_columns_v2", JSON.stringify(newCols));
      } catch {}
    }
  };

  const visibleCols = useMemo(() => {
    const active = columns.filter((c) => c.visible);
    const pinned = active.filter((c) => c.pinned);
    const unpinned = active.filter((c) => !c.pinned);
    return [...pinned, ...unpinned];
  }, [columns]);

  const { stickyLeftMap, lastPinnedId } = useMemo(() => {
    const map: Record<string, number> = {};
    let currentLeft = 44; // Fixed checkbox column width
    let lastId: string | null = null;
    visibleCols.forEach((col) => {
      if (col.pinned) {
        map[col.id] = currentLeft;
        currentLeft += (col.width || col.minWidth || 100);
        lastId = col.id;
      }
    });
    return { stickyLeftMap: map, lastPinnedId: lastId };
  }, [visibleCols]);

  const totalTableWidth = useMemo(() => {
    const colsSum = visibleCols.reduce(
      (sum, c) => sum + (c.width || c.minWidth || 100),
      0
    );
    return colsSum + 44 + 44; // Checkbox (44) + Delete (44)
  }, [visibleCols]);

  const resizingRef = useRef<{
    colId: HandoverColumnId;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [resizingColId, setResizingColId] = useState<HandoverColumnId | null>(null);

  const handleStartResize = (colId: HandoverColumnId, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const targetCol = columns.find((c) => c.id === colId);
    if (!targetCol) return;

    const startX = e.clientX;
    const startWidth = targetCol.width || targetCol.minWidth || 100;

    resizingRef.current = { colId, startX, startWidth };
    setResizingColId(colId);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = moveEvent.clientX - resizingRef.current.startX;
      const minW = targetCol.minWidth || 45;
      const nextWidth = Math.max(minW, Math.round(resizingRef.current.startWidth + delta));

      setColumns((prev) =>
        prev.map((c) => (c.id === resizingRef.current?.colId ? { ...c, width: nextWidth } : c))
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

  const handleDoubleClickResize = (colId: HandoverColumnId, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const def = DEFAULT_HANDOVER_COLUMN_SETTINGS.find((d) => d.id === colId);
    if (!def) return;
    const next = columns.map((c) => (c.id === colId ? { ...c, width: def.width || def.minWidth } : c));
    saveColumns(next);
  };

  // Selection states
  const [checkedHandovers, setCheckedHandovers] = useState<Set<number>>(new Set());
  const [handoverDeptFilter, setHandoverDeptFilter] = useState("");
  const [handoverSearch, setHandoverSearch] = useState(() => initialSearchQuery || "");

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setHandoverSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);

  // Modals
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTargetDept, setPasteTargetDept] = useState("");
  const [pasteTargetDate, setPasteTargetDate] = useState(localToday());
  const [pasteParsedRows, setPasteParsedRows] = useState<any[]>([]);

  // Import from PR / PO / Contract Modal
  const [showImportDocModal, setShowImportDocModal] = useState(false);
  const [importDocType, setImportDocType] = useState<"pr" | "po" | "contract">("pr");
  const [selectedDocId, setSelectedDocId] = useState<string | number>("");
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string | number>>(new Set());
  const [itemCustomQty, setItemCustomQty] = useState<Record<string | number, number>>({});
  const [importTargetDept, setImportTargetDept] = useState("");

  // Print states
  const [isPrinting, setIsPrinting] = useState(false);
  const [printItemsList, setPrintItemsList] = useState<PaymentHandoverItem[]>([]);
  const printTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (printTimerRef.current) clearTimeout(printTimerRef.current);
    };
  }, []);

  // Hidden date picker
  const calendarPickerRef = useRef<HTMLInputElement>(null);
  const calendarCbRef = useRef<((dateVal: string) => void) | null>(null);

  const [sysDepts, setSysDepts] = useState<string[]>(() => getUnifiedDepartments());

  useEffect(() => {
    const onDeptsUpdated = () => setSysDepts(getUnifiedDepartments());
    window.addEventListener("scm_departments_updated", onDeptsUpdated);
    return () => window.removeEventListener("scm_departments_updated", onDeptsUpdated);
  }, []);

  // Danh sách các phòng ban thống nhất toàn web
  const handoverDepts = useMemo(() => {
    const set = new Set<string>(sysDepts);
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi"));
  }, [sysDepts]);

  const handoverItemSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentHandovers.forEach((h) => {
      if (h.item_name?.trim()) set.add(h.item_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  const handoverSenderSuggestions = useMemo(() => {
    const set = new Set<string>(["Trần Hải Hà"]);
    paymentHandovers.forEach((h) => {
      if (h.sender_name?.trim()) set.add(h.sender_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  const handoverReceiverSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentHandovers.forEach((h) => {
      if (h.receiver_name?.trim()) set.add(h.receiver_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  const handoverNoteSuggestions = useMemo(() => {
    const defaults = ["Mới 100%", "Kèm CO/CQ", "Đầy đủ phụ kiện", "Đạt kiểm định", "Đạt nghiệm thu"];
    const set = new Set<string>(defaults);
    paymentHandovers.forEach((h) => {
      if (h.note?.trim()) set.add(h.note.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  // Filtered list (sắp xếp số thứ tự từ dưới lên trên, số to ở trên)
  const filteredHandovers = useMemo(() => {
    const q = normName(handoverSearch);
    const list = paymentHandovers.filter((h) => {
      if (handoverDeptFilter && String(h.department || "").trim() !== handoverDeptFilter) {
        return false;
      }
      if (q) {
        const text = [h.department, h.item_name, h.unit, h.note, h.receiver_name, h.sender_name].join(" ");
        if (!normName(text).includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }, [paymentHandovers, handoverDeptFilter, handoverSearch]);

  // Nhóm danh sách vật tư bàn giao thành các ĐỢT BÀN GIAO (Handover Batches)
  const handoverBatches = useMemo(() => {
    const groupMap = new Map<string, PaymentHandoverItem[]>();

    for (const h of filteredHandovers) {
      let key = "";
      if (h.batch_id && h.batch_id.trim()) {
        key = `BATCH__${h.batch_id.trim()}`;
      } else if (h.source_number && h.source_number.trim()) {
        const srcType = (h.source_type || "PO").trim().toUpperCase();
        const srcNum = h.source_number.trim().toUpperCase();
        const dateStr = (h.handover_date || "").trim();
        const deptStr = (h.department || "").trim().toLowerCase();
        key = `SRC__${srcType}__${srcNum}__${dateStr}__${deptStr}`;
      } else {
        const dateStr = (h.handover_date || "NO_DATE").trim();
        const deptStr = (h.department || "NO_DEPT").trim().toLowerCase();
        const recvStr = (h.receiver_name || "").trim().toLowerCase();
        const sendStr = (h.sender_name || "").trim().toLowerCase();
        key = `MANUAL__${dateStr}__${deptStr}__${recvStr}__${sendStr}`;
      }
      const arr = groupMap.get(key) || [];
      arr.push(h);
      groupMap.set(key, arr);
    }

    // Đếm số đợt theo từng chứng từ gốc để đánh số Đợt 1, Đợt 2...
    const rawGroups = Array.from(groupMap.entries()).map(([key, rawItems]) => {
      const sortedItems = sortHandoversByPOLineOrder(rawItems, pos);
      const first = sortedItems[0] || rawItems[0];
      const maxId = rawItems.reduce((m, it) => Math.max(m, Number(it.id) || 0), 0);
      const minId = rawItems.reduce((m, it) => Math.min(m, Number(it.id) || 0), Number(first?.id) || 0);
      const srcNum = (first?.source_number || "").trim();
      const srcType = (first?.source_type || (srcNum ? "PO" : "")).trim();
      const matchedPO = srcNum
        ? pos.find((p) => (p.number || "").trim().toLowerCase() === srcNum.toLowerCase())
        : undefined;
      const matchedSupplier = matchedPO
        ? suppliers.find((s) => Number(s.id) === Number(matchedPO.supplierId))
        : undefined;

      const totalDocQty = sortedItems.reduce((s, it) => s + (Number(it.quantity_doc) || 0), 0);
      const totalPassQty = sortedItems.reduce((s, it) => s + (Number(it.quantity_pass) || 0), 0);
      const totalFailQty = sortedItems.reduce((s, it) => s + (Number(it.quantity_fail) || 0), 0);

      return {
        batchKey: key,
        items: sortedItems,
        maxId,
        minId,
        date: first?.handover_date || "",
        department: first?.department || "Chưa chọn bộ phận",
        senderName: first?.sender_name || "Trần Hải Hà",
        receiverName: first?.receiver_name || "",
        sourceType: srcType,
        sourceNumber: srcNum,
        matchedPO,
        supplierName: matchedSupplier?.name || "",
        totalDocQty,
        totalPassQty,
        totalFailQty,
        batchNumber: first?.batch_number || 1,
      };
    });

    // Đánh số thứ tự đợt tăng dần theo ngày cho các đợt cùng chứng từ gốc
    const bySource = new Map<string, typeof rawGroups>();
    rawGroups.forEach((g) => {
      const sKey = g.sourceNumber ? g.sourceNumber.toUpperCase() : `__MANUAL__${g.batchKey}`;
      const list = bySource.get(sKey) || [];
      list.push(g);
      bySource.set(sKey, list);
    });
    bySource.forEach((list) => {
      if (list.length > 1) {
        list
          .slice()
          .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.minId - b.minId)
          .forEach((g, idx) => {
            g.batchNumber = idx + 1;
          });
      }
    });

    // Sắp xếp các đợt mới nhất lên đầu
    return rawGroups.sort((a, b) => b.maxId - a.maxId);
  }, [filteredHandovers, pos, suppliers]);



  // Open calendar
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


  const handleAddHandoverRow = () => {
    if (readOnly) return;
    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    const newItem: PaymentHandoverItem = {
      id: maxId,
      department: handoverDeptFilter || "Phòng Cung ứng",
      item_name: "",
      unit: "Cái",
      quantity_doc: "1",
      quantity_pass: "1",
      quantity_fail: "",
      note: "",
      handover_date: localToday(),
      sender_name: "Trần Hải Hà",
      sender_dept: "Phòng Cung ứng",
      receiver_name: "",
    };
    triggerUpdateHandovers([newItem, ...paymentHandovers]);
  };

  const handleEditHandover = (id: number, key: keyof PaymentHandoverItem, val: any) => {
    if (readOnly) return;
    const next = paymentHandovers.map((h) => (h.id === id ? { ...h, [key]: val } : h));
    triggerUpdateHandovers(next);
  };

  const handleDeleteHandover = (id: number) => {
    if (readOnly) return;
    const target = paymentHandovers.find((h) => h.id === id);
    if (!target) return;
    const itemName = (target as any).item_name || (target as any).itemName || `Vật tư #${id}`;
    const sourceNum = (target as any).source_number || (target as any).sourceNumber || target.department || "Bàn giao";
    if (!confirm(`Bạn có chắc muốn xóa mặt hàng "${itemName}"?`)) return;
    if (onMoveToTrash) {
      const label = `${itemName} (${sourceNum})`;
      onMoveToTrash("HANDOVER", label, target, `✓ Đã chuyển ${label} vào thùng rác`);
    }
    const next = paymentHandovers.filter((h) => h.id !== id);
    triggerUpdateHandovers(next);
  };

  const handleDeleteSelectedHandovers = () => {
    if (readOnly) return;
    if (checkedHandovers.size === 0) {
      alert("Vui lòng tích chọn các dòng vật tư cần xóa");
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa ${checkedHandovers.size} vật tư đã chọn?`)) return;
    const selectedItems = paymentHandovers.filter((h) => checkedHandovers.has(h.id));
    if (onMoveToTrash && selectedItems.length > 0) {
      const label = `Đợt bàn giao (${selectedItems.length} vật tư)`;
      onMoveToTrash("HANDOVER", label, selectedItems, `✓ Đã chuyển ${label} vào thùng rác`);
    }
    const next = paymentHandovers.filter((h) => !checkedHandovers.has(h.id));
    triggerUpdateHandovers(next);
    setCheckedHandovers(new Set());
  };

  // Direct paste on Handover table
  const handleHandoverTablePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (text && (text.includes("\t") || text.includes("\n"))) {
      e.preventDefault();
      const rows = parseExcelText(text, handoverDeptFilter, localToday());
      if (rows.length > 0) {
        let maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0));
        const newItems = rows.map((r) => {
          maxId++;
          return { ...r, id: maxId };
        });
        triggerUpdateHandovers([...newItems, ...paymentHandovers]);
        alert(`Đã dán trực tiếp ${rows.length} vật tư từ Excel vào bảng!`);
      }
    }
  };

  // Paste parsing Modal
  const handleParsePasteModal = (text: string, dept: string, date: string) => {
    setPasteText(text);
    if (!text.trim()) {
      setPasteParsedRows([]);
      return;
    }
    const rows = parseExcelText(text, dept, date);
    setPasteParsedRows(rows);
  };

  const handleApplyPasteModal = () => {
    if (readOnly || pasteParsedRows.length === 0) return;
    let maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0));
    const newItems: PaymentHandoverItem[] = pasteParsedRows.map((r) => {
      maxId++;
      return { ...r, id: maxId };
    });
    triggerUpdateHandovers([...newItems, ...paymentHandovers]);
    setShowPasteModal(false);
    setPasteText("");
    setPasteParsedRows([]);
    alert(`Đã thêm thành công ${newItems.length} vật tư vào danh sách bàn giao!`);
  };

  // Contract items list derived from POs
  const contractsList = useMemo(() => {
    return pos.filter(
      (p) =>
        p.number.startsWith("HĐ-") ||
        (p.contractNote && p.contractNote.trim().length > 0) ||
        (p.prNumber && p.prNumber.toLowerCase().includes("hợp đồng"))
    );
  }, [pos]);

  const availableDocs = useMemo(() => {
    const q = normName(docSearchQuery);
    if (importDocType === "pr") {
      return prs.filter((pr) => {
        if (!q) return true;
        const text = [
          pr.number,
          pr.department,
          pr.purpose,
          ...(pr.items || []).map((i) => i.name),
        ].join(" ");
        return normName(text).includes(q);
      });
    } else if (importDocType === "po") {
      return pos.filter((po) => {
        if (!q) return true;
        const s = suppliers.find((x) => x.id === po.supplierId);
        const text = [
          po.number,
          s?.name,
          po.prNumber,
          ...(po.items || []).map((i) => i.name),
        ].join(" ");
        return normName(text).includes(q);
      });
    } else {
      const list = contractsList.length > 0 ? contractsList : pos;
      return list.filter((c) => {
        if (!q) return true;
        const s = suppliers.find((x) => x.id === c.supplierId);
        const text = [
          c.number,
          s?.name,
          c.contractNote,
          ...(c.items || []).map((i) => i.name),
        ].join(" ");
        return normName(text).includes(q);
      });
    }
  }, [importDocType, docSearchQuery, prs, pos, suppliers, contractsList]);

  const activeDoc = useMemo(() => {
    if (!selectedDocId) return null;
    if (importDocType === "pr") {
      return prs.find((p) => p.id === Number(selectedDocId)) || null;
    } else {
      return pos.find((p) => p.id === Number(selectedDocId)) || null;
    }
  }, [selectedDocId, importDocType, prs, pos]);

  const activeDocItems = useMemo(() => {
    if (!activeDoc) return [];
    return activeDoc.items || [];
  }, [activeDoc]);

  const openImportDocModal = () => {
    let defType: "pr" | "po" | "contract" = "pr";
    if (prs.length === 0 && pos.length > 0) {
      defType = "po";
    }
    setImportDocType(defType);
    setDocSearchQuery("");

    let firstDoc = null;
    if (defType === "pr" && prs.length > 0) {
      firstDoc = prs[0];
    } else if (pos.length > 0) {
      firstDoc = pos[0];
    }

    if (firstDoc) {
      setSelectedDocId(firstDoc.id);
      const items = firstDoc.items || [];
      setSelectedItemIds(new Set(items.map((it) => it.id)));
      const qtyMap: Record<string | number, number> = {};
      items.forEach((it) => {
        qtyMap[it.id] = it.qty;
      });
      setItemCustomQty(qtyMap);
      setImportTargetDept(
        "department" in firstDoc && firstDoc.department
          ? firstDoc.department
          : handoverDeptFilter || "Phòng Cung ứng"
      );
    } else {
      setSelectedDocId("");
      setSelectedItemIds(new Set());
      setItemCustomQty({});
      setImportTargetDept(handoverDeptFilter || "Phòng Cung ứng");
    }

    setShowImportDocModal(true);
  };

  const handleSwitchImportType = (type: "pr" | "po" | "contract") => {
    setImportDocType(type);
    setDocSearchQuery("");
    let firstDoc = null;
    if (type === "pr") {
      firstDoc = prs[0] || null;
    } else if (type === "po") {
      firstDoc = pos[0] || null;
    } else {
      firstDoc = (contractsList.length > 0 ? contractsList[0] : pos[0]) || null;
    }

    if (firstDoc) {
      setSelectedDocId(firstDoc.id);
      const items = firstDoc.items || [];
      setSelectedItemIds(new Set(items.map((it) => it.id)));
      const qtyMap: Record<string | number, number> = {};
      items.forEach((it) => {
        qtyMap[it.id] = it.qty;
      });
      setItemCustomQty(qtyMap);
      setImportTargetDept(
        "department" in firstDoc && firstDoc.department
          ? firstDoc.department
          : handoverDeptFilter || "Phòng Cung ứng"
      );
    } else {
      setSelectedDocId("");
      setSelectedItemIds(new Set());
      setItemCustomQty({});
    }
  };

  const handleSelectDoc = (docIdVal: string | number) => {
    const dId = Number(docIdVal);
    setSelectedDocId(dId);
    let doc = null;
    if (importDocType === "pr") {
      doc = prs.find((p) => p.id === dId);
    } else {
      doc = pos.find((p) => p.id === dId);
    }
    if (doc) {
      const items = doc.items || [];
      const isPO = importDocType !== "pr" && "items" in doc;
      const stats = isPO ? calcPODeliveryStats(doc as PO, paymentHandovers) : null;
      const remainingItems = items.filter((it: any) => {
        if (!stats) return true;
        return (stats.itemsStats[it.id]?.quantityRemaining ?? it.qty) > 0;
      });
      setSelectedItemIds(new Set(remainingItems.map((it: any) => it.id)));
      const qtyMap: Record<string | number, number> = {};
      items.forEach((it: any) => {
        const rem = stats ? (stats.itemsStats[it.id]?.quantityRemaining ?? it.qty) : it.qty;
        qtyMap[it.id] = rem;
      });
      setItemCustomQty(qtyMap);
      if ("department" in doc && doc.department) {
        setImportTargetDept(doc.department);
      }
    }
  };

  const handleToggleSelectItem = (id: string | number) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllItems = () => {
    if (selectedItemIds.size === activeDocItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(activeDocItems.map((it) => it.id)));
    }
  };

  const handleConfirmImportItems = () => {
    if (readOnly) return;
    if (!activeDoc) {
      alert("Vui lòng chọn chứng từ nguồn.");
      return;
    }
    const chosenItems = activeDocItems.filter((it) => selectedItemIds.has(it.id));
    if (chosenItems.length === 0) {
      alert("Vui lòng tích chọn ít nhất 1 mặt hàng để nạp vào danh sách bàn giao.");
      return;
    }

    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    let curId = maxId;

    const docTypeLabel =
      importDocType === "pr"
        ? "PR"
        : importDocType === "contract"
        ? "Hợp đồng"
        : "PO";

    const docSupplier =
      "supplierId" in activeDoc && activeDoc.supplierId
        ? suppliers.find((s) => s.id === activeDoc.supplierId)
        : null;

    const suppPart = docSupplier?.name ? ` - NCC: ${docSupplier.name}` : "";

    const newHandovers: PaymentHandoverItem[] = chosenItems.map((it) => {
      const actualQty = itemCustomQty[it.id] !== undefined ? itemCustomQty[it.id] : it.qty;
      const specPart = it.spec ? ` (${it.spec})` : "";
      return {
        id: curId++,
        department:
          importTargetDept.trim() ||
          ("department" in activeDoc && activeDoc.department
            ? activeDoc.department
            : "Phòng Cung ứng"),
        item_name: it.name,
        unit: it.unit || "Cái",
        quantity_doc: String(it.qty),
        quantity_pass: String(actualQty),
        quantity_fail: "",
        note: "",
        handover_date: localToday(),
        sender_name: "Trần Hải Hà",
        sender_dept: "Phòng Cung ứng",
        receiver_name: "",
        source_type: docTypeLabel,
        source_number: activeDoc.number,
        specification: it.spec || "",
        po_item_id: it.id,
      };
    });

    triggerUpdateHandovers([...newHandovers, ...paymentHandovers]);
    setCheckedHandovers(new Set(newHandovers.map((h) => h.id)));
    setShowImportDocModal(false);
    alert(
      `Đã nạp thành công ${newHandovers.length} mặt hàng từ ${docTypeLabel} #${activeDoc.number} vào danh sách bàn giao!`
    );
  };

  // Create Payment Request (ĐNTT) from selected handover items or a specific batch
  const handleCreatePaymentRequestFromSelected = (customItems?: PaymentHandoverItem[]) => {
    if (readOnly) return;
    const chosen =
      Array.isArray(customItems) && customItems.length > 0
        ? customItems
        : paymentHandovers.filter((h) => checkedHandovers.has(h.id));
    if (chosen.length === 0) {
      alert("Vui lòng tích chọn ít nhất 1 đợt hoặc vật tư bàn giao để lập đề nghị thanh toán.");
      return;
    }

    // Detect primary source and supplier
    const firstSourceNumber = chosen[0]?.source_number;
    const firstSourceType = chosen[0]?.source_type || "PO";
    const matchedPO = firstSourceNumber ? pos.find((p) => p.number === firstSourceNumber) : undefined;

    let matchedSupplier = matchedPO ? suppliers.find((s) => s.id === matchedPO.supplierId) : undefined;
    if (!matchedSupplier) {
      for (const supp of suppliers) {
        if (chosen.some((c) => c.note && c.note.toLowerCase().includes(supp.name.toLowerCase()))) {
          matchedSupplier = supp;
          break;
        }
      }
    }

    // Build lines with prices from matched PO if available
    const lines = chosen.map((c) => {
      const poItem = matchedPO?.items?.find(
        (it) => it.name.trim().toLowerCase() === c.item_name.trim().toLowerCase()
      );
      const qty = Number(c.quantity_pass) || Number(c.quantity_doc) || 1;
      const unitPrice = poItem ? Number(poItem.price) || 0 : 0;
      const amount = unitPrice > 0 ? unitPrice * qty : 0;
      const noteParts = [
        `ĐVT: ${c.unit || "Cái"}`,
        `SL giao: ${qty}`,
        c.handover_date ? `Ngày BG: ${c.handover_date}` : "",
        c.department ? `Bộ phận: ${c.department}` : "",
      ].filter(Boolean);

      return {
        description: `${c.item_name}${c.unit ? ` (${qty} ${c.unit})` : ""}`,
        invoice_no: "",
        invoice_date: "",
        amount: amount,
        note: noteParts.join(" · "),
      };
    });

    const totalAmount = lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
    const existingRequests = paymentRequests || [];
    const maxId = Math.max(0, ...existingRequests.map((r) => Number(r.id) || 0)) + 1;
    const maxStt = Math.max(0, ...existingRequests.map((r) => Number(r.legacy_stt) || 0)) + 1;

    const sourceDesc = firstSourceNumber
      ? `${firstSourceType} #${firstSourceNumber}`
      : `Biên bản BG (${chosen.length} vật tư)`;

    const newReq: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: String(maxStt).padStart(2, "0"),
      payee_name: matchedSupplier ? matchedSupplier.name : "",
      group_code: "",
      description: `Thanh toán theo ${sourceDesc}`,
      item_name: chosen.map((c) => c.item_name).filter(Boolean).join(", "),
      invoice_no: "",
      invoice_date: "",
      amount: totalAmount > 0 ? totalAmount : "0",
      currency: "VND",
      documents: ["ĐNTT", "Biên bản bàn giao", "Hóa đơn điện tử GTGT"],
      request_date: localToday(),
      payment_type: "Chuyển khoản",
      status: "Đã giao KT, chờ đi tiền",
      address: matchedSupplier?.address || "",
      account_no: matchedSupplier?.bankAccount || "",
      bank: matchedSupplier?.bank || "",
      beneficiary_id: matchedSupplier?.id,
      created_by_name: chosen[0]?.sender_name || "Trần Hải Hà",
      lines: lines,
    };

    if (onNavigateToPayment) {
      onNavigateToPayment(newReq);
    }
  };

  // Print Handover Direct (2 copies) via Portal
  const handlePrintHandoverDirect = (customItems?: PaymentHandoverItem[]) => {
    const items = customItems || (
      checkedHandovers.size > 0
        ? paymentHandovers.filter((h) => checkedHandovers.has(h.id))
        : handoverDeptFilter
        ? paymentHandovers.filter((h) => String(h.department || "").trim() === handoverDeptFilter)
        : filteredHandovers
    );

    if (items.length === 0) {
      alert("Vui lòng chọn ít nhất 1 vật tư để in biên bản bàn giao");
      return;
    }

    setPrintItemsList(items);
    setIsPrinting(true);
    if (printTimerRef.current) clearTimeout(printTimerRef.current);
    printTimerRef.current = setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 250);
  };

  const renderTableCellContent = (colId: HandoverColumnId, h: PaymentHandoverItem) => {
    switch (colId) {
      case "stt":
        return (
          <span style={{ fontWeight: 600, color: "#64748b", fontSize: "11px", display: "block", textAlign: "center" }}>
            {h.id}
          </span>
        );
      case "department": {
        const currentDept = String(h.department || "").trim();
        const deptList = currentDept && !handoverDepts.includes(currentDept)
          ? [currentDept, ...handoverDepts]
          : handoverDepts;

        return (
          <select
            className="cell-editor cell-editor-select"
            value={currentDept}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__custom__") {
                const custom = window.prompt("Nhập tên bộ phận / phòng ban nhận mới để lưu vào hệ thống:", "");
                if (custom && custom.trim()) {
                  addNewDepartment(custom.trim());
                  handleEditHandover(h.id, "department", custom.trim());
                }
              } else {
                handleEditHandover(h.id, "department", val);
              }
            }}
            title={currentDept || "Chọn bộ phận nhận..."}
            style={{
              cursor: "pointer",
              color: currentDept ? "#1e293b" : "#94a3b8",
            }}
          >
            <option value="">-- Chọn bộ phận --</option>
            {deptList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="__custom__" style={{ color: "#2563eb", fontWeight: 600 }}>
              + Nhập bộ phận khác...
            </option>
          </select>
        );
      }
      case "item_name":
        return (
          <div>
            <AutoGrowTextarea
              className="cell-editor cell-editor-textarea"
              value={h.item_name || ""}
              onChange={(val) => handleEditHandover(h.id, "item_name", val)}
              placeholder="Tên hàng hóa - quy cách..."
              title={h.item_name || "Tên hàng hóa - quy cách..."}
            />
            {h.source_number && (
              <div style={{ marginTop: "3px" }}>
                <button
                  type="button"
                  className="doc-flow-badge doc-flow-po"
                  style={{ fontSize: "10px", padding: "1px 6px" }}
                  title={`Đơn hàng gốc: ${h.source_number}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const matchedPO = pos.find((p) => p.number === h.source_number);
                    if (matchedPO) {
                      navigateTo({ view: "po-detail", id: matchedPO.id });
                    } else {
                      navigateTo({ view: "po-list" });
                    }
                  }}
                >
                  <Package size={11} /> <span>{h.source_number}</span>
                </button>
              </div>
            )}
          </div>
        );
      case "unit":
        return (
          <input
            className="cell-editor"
            list="unitSuggestions"
            value={h.unit || ""}
            onChange={(e) => handleEditHandover(h.id, "unit", e.target.value)}
            placeholder="ĐVT..."
            style={{ textAlign: "center" }}
          />
        );
      case "quantity_doc":
        return (
          <input
            className="cell-editor"
            style={{ textAlign: "center" }}
            value={h.quantity_doc || ""}
            onChange={(e) => handleEditHandover(h.id, "quantity_doc", e.target.value)}
            placeholder="0"
          />
        );
      case "quantity_pass":
        return (
          <input
            className="cell-editor"
            style={{ textAlign: "center", fontWeight: 600, color: "#166534" }}
            value={h.quantity_pass || ""}
            onChange={(e) => handleEditHandover(h.id, "quantity_pass", e.target.value)}
            placeholder="0"
          />
        );
      case "quantity_fail":
        return (
          <input
            className="cell-editor"
            style={{ textAlign: "center", color: "#dc2626" }}
            value={h.quantity_fail || ""}
            onChange={(e) => handleEditHandover(h.id, "quantity_fail", e.target.value)}
            placeholder="0"
          />
        );
      case "note":
        return (
          <AutoGrowTextarea
            className="cell-editor cell-editor-textarea"
            value={h.note || ""}
            onChange={(val) => handleEditHandover(h.id, "note", val)}
            placeholder="Ghi chú..."
            title={h.note || "Ghi chú..."}
          />
        );
      case "handover_date":
        return (
          <div className="cell-date-wrap">
            <input
              className="cell-editor"
              value={h.handover_date || ""}
              onChange={(e) => handleEditHandover(h.id, "handover_date", e.target.value)}
              onBlur={(e) => {
                const parsed = parseFlexibleDate(e.target.value);
                if (parsed !== e.target.value) {
                  handleEditHandover(h.id, "handover_date", parsed);
                }
              }}
              placeholder="dd/mm/yyyy"
            />
            <button
              type="button"
              className="cell-date-btn"
              title="Chọn ngày từ lịch"
              onClick={() =>
                openCalendar(h.handover_date || "", (val) =>
                  handleEditHandover(h.id, "handover_date", val)
                )
              }
            >
              📅
            </button>
          </div>
        );
      case "sender_name":
        return (
          <AutoGrowTextarea
            className="cell-editor cell-editor-textarea"
            value={h.sender_name || "Trần Hải Hà"}
            onChange={(val) => handleEditHandover(h.id, "sender_name", val)}
            placeholder="Bên giao..."
            title={h.sender_name || "Bên giao..."}
          />
        );
      case "receiver_name":
        return (
          <AutoGrowTextarea
            className="cell-editor cell-editor-textarea"
            value={h.receiver_name || ""}
            onChange={(val) => handleEditHandover(h.id, "receiver_name", val)}
            placeholder="Bên nhận..."
            title={h.receiver_name || "Bên nhận..."}
          />
        );
      default:
        return null;
    }
  };

  return (
    <section className={`content payment-management handover-management ${isWorkspaceExpanded ? "workspace-expanded" : ""}`}>
      {/* Preload logo in DOM */}
      <img src={PHENIKAA_LOGO_SRC} alt="" style={{ display: "none" }} aria-hidden="true" />

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
            <span>Điều hành Kho & Nghiệm thu</span>
            <span>/</span>
            <b>Bàn giao & Kiểm định</b>
          </div>
          <h1>{t("handover.title")}</h1>
          <p className="stitch-subtitle">
            Kiểm soát số lượng hàng về theo chứng từ, nghiệm thu chất lượng (Đạt / Không đạt) và in Biên bản bàn giao A4
          </p>
        </div>
        <div className="actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div className="stitch-seg-group">
            <button
              type="button"
              className={`stitch-seg-btn ${showMobileCards ? "active" : ""}`}
              onClick={() => setUserMobileToggle(true)}
              title="Hiển thị dạng Thẻ theo từng Đợt bàn giao (Biên bản bàn giao)"
            >
              <LayoutGrid size={14} /> Theo Đợt Bàn Giao <b>{handoverBatches.length} đợt</b>
            </button>
            <button
              type="button"
              className={`stitch-seg-btn ${!showMobileCards ? "active" : ""}`}
              onClick={() => setUserMobileToggle(false)}
              title="Hiển thị dạng Bảng tính chi tiết từng dòng vật tư (hỗ trợ dán Excel)"
            >
              <Table size={14} /> Bảng Chi Tiết Vật Tư <b>{filteredHandovers.length}</b>
            </button>
          </div>
          <button
            className="btn btn-primary btn-md"
            onClick={openImportDocModal}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <FileText size={16} /> + Tạo Đợt Bàn Giao (Từ PR/PO/HĐ)
          </button>
        </div>
      </div>

      {/* Stitch v2 Bento KPI Strip */}
      <div className="stitch-kpi-strip">
        <div className="stitch-kpi-card kpi-navy">
          <div className="stitch-kpi-icon">
            <Package size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Tổng Số Đợt Bàn Giao</small>
            <strong>
              {handoverBatches.length} <em>đợt bàn giao</em>
            </strong>
            <span className="stitch-kpi-sub">
              Tổng cộng: <b>{filteredHandovers.length}</b> / {paymentHandovers.length} dòng vật tư
            </span>
          </div>
        </div>

        <div className="stitch-kpi-card kpi-emerald">
          <div className="stitch-kpi-icon">
            <Printer size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Đã Chọn In Biên Bản / Lập ĐNTT</small>
            <strong>
              {checkedHandovers.size} <em>mục đang tích</em>
            </strong>
            <span className="stitch-kpi-sub">
              Hỗ trợ in gộp Biên bản 2 liên & chuyển thẳng sang ĐNTT
            </span>
          </div>
        </div>

        <div className="stitch-kpi-card kpi-sky">
          <div className="stitch-kpi-icon">
            <Receipt size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Phòng Ban / Đơn Vị Tiếp Nhận</small>
            <strong>
              {handoverDepts.length} <em>đơn vị</em>
            </strong>
            <span className="stitch-kpi-sub">
              {handoverDeptFilter ? `Đang lọc: ${handoverDeptFilter}` : "Tất cả phòng ban trong hệ thống"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Toolbar */}
      <div className="payment-toolbar" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {!showMobileCards ? (
          <>
            <button className="btn btn-primary btn-md" onClick={handleAddHandoverRow}>
              <Plus size={16} /> Thêm dòng
            </button>
            <button
              className="btn btn-secondary btn-md"
              onClick={openImportDocModal}
              title="Nhập sản phẩm từ PR, PO hoặc Hợp đồng vào danh sách bàn giao"
            >
              <FileText size={16} /> Từ PR/PO/HĐ
            </button>
            <button
              className="btn btn-secondary btn-md"
              onClick={() => setShowPasteModal(true)}
              title="Dán danh sách vật tư từ file Excel (Ctrl+V)"
            >
              <ClipboardPaste size={16} /> Dán Excel
            </button>
            <button
              className="btn btn-teal btn-md"
              onClick={() => handlePrintHandoverDirect()}
              title="In biên bản bàn giao các vật tư đã chọn"
            >
              <Printer size={16} /> In biên bản {checkedHandovers.size > 0 ? `(${checkedHandovers.size})` : ""}
            </button>
            <button
              type="button"
              className="btn btn-accent btn-md"
              onClick={handleCreatePaymentRequestFromSelected}
              title={
                checkedHandovers.size > 0
                  ? `Lập Đề nghị thanh toán (ĐNTT) cho ${checkedHandovers.size} vật tư đã chọn`
                  : "Tích chọn ít nhất 1 vật tư để lập ĐNTT"
              }
              disabled={checkedHandovers.size === 0}
            >
              <Receipt size={16} /> Lập ĐNTT {checkedHandovers.size > 0 ? `(${checkedHandovers.size})` : ""}
            </button>
            <button className="btn btn-danger btn-md" onClick={handleDeleteSelectedHandovers}>
              <Trash2 size={16} /> Xóa {checkedHandovers.size > 0 ? `(${checkedHandovers.size})` : ""}
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
              className={`btn btn-secondary btn-md btn-workspace-toggle ${isWorkspaceExpanded ? "active" : ""}`}
              onClick={() => setIsWorkspaceExpanded(!isWorkspaceExpanded)}
              title={isWorkspaceExpanded ? "Thu gọn về giao diện chuẩn" : "Mở rộng không gian làm việc (giống So sánh báo giá)"}
            >
              {isWorkspaceExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              {isWorkspaceExpanded ? "Thu gọn" : "Mở rộng"}
            </button>
          </>
        ) : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary btn-md"
              
              onClick={openImportDocModal}
              title="Nhập sản phẩm từ PR, PO hoặc Hợp đồng vào danh sách bàn giao"
            >
              <FileText size={15} /> Từ PR/PO/HĐ
            </button>
            <button
              className="btn btn-teal btn-md"
              
              onClick={() => handlePrintHandoverDirect()}
              title="In biên bản bàn giao các vật tư đã chọn"
            >
              <Printer size={15} /> In ({checkedHandovers.size})
            </button>
            <button
              type="button"
              className="btn btn-accent btn-md"
              
              onClick={handleCreatePaymentRequestFromSelected}
              disabled={checkedHandovers.size === 0}
              title="Lập ĐNTT cho các vật tư đã chọn"
            >
              <Receipt size={15} /> Lập ĐNTT
            </button>
          </div>
        )}

        <select
          value={handoverDeptFilter}
          onChange={(e) => setHandoverDeptFilter(e.target.value)}
          style={{ width: "auto", minWidth: "185px" }}
        >
          <option value="">Tất cả phòng ban nhận</option>
          {handoverDepts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <input
          placeholder="Tìm vật tư, ĐVT, ghi chú, phòng ban..."
          value={handoverSearch}
          onChange={(e) => setHandoverSearch(e.target.value)}
          style={{ flex: 1, minWidth: "240px" }}
        />

        <span style={{ marginLeft: "auto", fontSize: "12.5px", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>
          {handoverBatches.length} đợt ({filteredHandovers.length} vật tư)
          {checkedHandovers.size > 0 && ` · Đã chọn: ${checkedHandovers.size}`}
        </span>
      </div>

      <datalist id="deptSuggestions">
        {handoverDepts.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <datalist id="unitSuggestions">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <datalist id="handoverItemSuggestions">
        {handoverItemSuggestions.map((it) => (
          <option key={it} value={it} />
        ))}
      </datalist>

      <datalist id="handoverSenderSuggestions">
        {handoverSenderSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <datalist id="handoverReceiverSuggestions">
        {handoverReceiverSuggestions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <datalist id="handoverNoteSuggestions">
        {handoverNoteSuggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {/* Handover Batch Cards View (Hiển thị Thẻ theo từng Đợt Bàn Giao) */}
      {showMobileCards ? (
        <div
          className="handover-batches-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(460px, 1fr))",
            gap: "16px",
            padding: "4px 0 24px",
          }}
        >
          {handoverBatches.map((batch, bIdx) => {
            const batchIds = batch.items.map((it) => it.id);
            const allChecked = batchIds.length > 0 && batchIds.every((id) => checkedHandovers.has(id));
            const someChecked = batchIds.some((id) => checkedHandovers.has(id));
            const isExpanded = expandedBatchKeys.has(batch.batchKey);
            const previewItems = isExpanded ? batch.items : batch.items.slice(0, 4);

            const toggleBatchCheck = (checked: boolean) => {
              const next = new Set(checkedHandovers);
              batchIds.forEach((id) => {
                if (checked) next.add(id);
                else next.delete(id);
              });
              setCheckedHandovers(next);
            };

            const toggleExpand = () => {
              setExpandedBatchKeys((prev) => {
                const next = new Set(prev);
                if (next.has(batch.batchKey)) next.delete(batch.batchKey);
                else next.add(batch.batchKey);
                return next;
              });
            };

            const handleDeleteBatch = () => {
              if (readOnly) return;
              if (
                !confirm(
                  `Bạn có chắc muốn xóa Đợt bàn giao "${batch.sourceNumber || batch.department}" gồm ${batch.items.length} mặt hàng không?`
                )
              ) {
                return;
              }
              if (onMoveToTrash && batch.items.length > 0) {
                const label = `Đợt bàn giao "${batch.sourceNumber || batch.department}" (${batch.items.length} mặt hàng)`;
                onMoveToTrash("HANDOVER", label, batch.items, `✓ Đã chuyển ${label} vào thùng rác`);
              }
              const removeSet = new Set(batchIds);
              triggerUpdateHandovers(paymentHandovers.filter((h) => !removeSet.has(h.id)));
              setCheckedHandovers((prev) => {
                const next = new Set(prev);
                batchIds.forEach((id) => next.delete(id));
                return next;
              });
            };

            return (
              <div
                key={batch.batchKey}
                className={`m-card handover-batch-card ${allChecked ? "m-card-checked" : ""}`}
                style={{
                  background: "#ffffff",
                  border: allChecked ? "2px solid #0284c7" : "1px solid #cbd5e1",
                  borderLeft: allChecked ? "5px solid #0284c7" : "5px solid #2B6DF8",
                  borderRadius: "14px",
                  padding: "16px 18px",
                  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.05)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Header của Đợt bàn giao */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allChecked && someChecked;
                      }}
                      onChange={(e) => toggleBatchCheck(e.target.checked)}
                      title="Chọn / Bỏ chọn toàn bộ các mặt hàng trong đợt bàn giao này"
                      style={{ marginTop: "3px" }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            color: "#ffffff",
                            background: "linear-gradient(135deg, #2B6DF8 0%, #1e40af 100%)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          ĐỢT BÀN GIAO #{handoverBatches.length - bIdx}
                        </span>
                        {batch.sourceNumber ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (batch.matchedPO) {
                                navigateTo({ view: "po-detail", id: batch.matchedPO.id });
                              } else {
                                navigateTo({ view: "po-list" });
                              }
                            }}
                            style={{
                              fontSize: "11.5px",
                              fontWeight: 800,
                              color: "#0369a1",
                              background: "#f0f9ff",
                              border: "1px solid #bae6fd",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            title="Mở xem chứng từ gốc"
                          >
                            📦 {batch.sourceType || "PO"}: {batch.sourceNumber}
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#475569",
                              background: "#f1f5f9",
                              padding: "2px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            📋 Bàn giao trực tiếp
                          </span>
                        )}
                        {batch.batchNumber > 1 && (
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#c2410c",
                              background: "#fff7ed",
                              border: "1px solid #fed7aa",
                              padding: "1px 7px",
                              borderRadius: "6px",
                            }}
                          >
                            Lần giao {batch.batchNumber}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginTop: "5px", lineHeight: 1.3 }}>
                        {batch.supplierName
                          ? batch.supplierName
                          : batch.sourceNumber
                          ? `Bàn giao theo ${batch.sourceType || "PO"} #${batch.sourceNumber}`
                          : `Đợt bàn giao về ${batch.department}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 700,
                        color: "#047857",
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        padding: "3px 9px",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      🏢 {batch.department}
                    </span>
                    <span style={{ fontSize: "11.5px", fontWeight: 600, color: "#64748b", whiteSpace: "nowrap" }}>
                      📅 {batch.date || "Chưa ghi ngày"}
                    </span>
                  </div>
                </div>

                {/* 3 Ô Tổng hợp Số lượng của cả Đợt Bàn Giao */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "8px",
                    background: "#f8fafc",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Số danh mục
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#2B6DF8", marginTop: "1px" }}>
                      {batch.items.length} <span style={{ fontSize: "11.5px", fontWeight: 600 }}>mặt hàng</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "center", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#047857", textTransform: "uppercase" }}>
                      Tổng SL Đạt / Chứng từ
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#059669", marginTop: "1px" }}>
                      {batch.totalPassQty} <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 600 }}>/ {batch.totalDocQty}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "10.5px", fontWeight: 700, color: batch.totalFailQty > 0 ? "#dc2626" : "#64748b", textTransform: "uppercase" }}>
                      SL Hỏng / Lỗi
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: batch.totalFailQty > 0 ? "#dc2626" : "#475569", marginTop: "1px" }}>
                      {batch.totalFailQty}
                    </div>
                  </div>
                </div>

                {/* Bảng danh sách các sản phẩm nằm trong Đợt Bàn Giao này */}
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "9px",
                    overflow: "hidden",
                    background: "#ffffff",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", color: "#334155", borderBottom: "1px solid #cbd5e1" }}>
                        <th style={{ width: "34px", padding: "6px 4px", textAlign: "center", fontWeight: 700 }}>#</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Danh mục vật tư trong đợt</th>
                        <th style={{ width: "54px", padding: "6px 4px", textAlign: "center", fontWeight: 700 }}>ĐVT</th>
                        <th style={{ width: "64px", padding: "6px 6px", textAlign: "right", fontWeight: 700 }}>Đạt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewItems.map((it, idx) => (
                        <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 4px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: "6px 8px", color: "#0f172a", fontWeight: 600 }}>
                            <div style={{ lineHeight: 1.3 }}>{it.item_name || "(Chưa nhập tên vật tư)"}</div>
                            {it.note && (
                              <div style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 500, marginTop: "1px" }}>
                                Ghi chú: {it.note}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "6px 4px", textAlign: "center", color: "#475569" }}>
                            {it.unit || "Cái"}
                          </td>
                          <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 800, color: "#059669" }}>
                            {it.quantity_pass || it.quantity_doc || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {batch.items.length > 4 && (
                    <button
                      type="button"
                      onClick={toggleExpand}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        background: "#f8fafc",
                        border: "none",
                        borderTop: "1px solid #e2e8f0",
                        color: "#0284c7",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded
                        ? "▲ Thu gọn danh sách vật tư"
                        : `▼ Xem thêm ${batch.items.length - 4} mặt hàng khác trong đợt này (Tổng ${batch.items.length} mục)`}
                    </button>
                  )}
                </div>

                {/* Thông tin Người giao - Người nhận */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", color: "#475569", flexWrap: "wrap", gap: "6px" }}>
                  <span>
                    👤 Bên giao: <b style={{ color: "#0f172a" }}>{batch.senderName || "Trần Hải Hà"}</b> · Bên nhận:{" "}
                    <b style={{ color: "#0f172a" }}>{batch.receiverName || "Chưa ghi tên"}</b>
                  </span>
                  <span style={{ color: "#64748b" }}>
                    Mã dòng: #{batch.minId}{batch.maxId !== batch.minId ? ` → #${batch.maxId}` : ""}
                  </span>
                </div>

                {/* Footer Thao tác của cả Đợt Bàn Giao */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    paddingTop: "8px",
                    borderTop: "1px solid #e2e8f0",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="stitch-action-pill pill-navy"
                    onClick={() => setEditingBatchKey(batch.batchKey)}
                    title="Mở xem & chỉnh sửa chi tiết đợt bàn giao này"
                  >
                    <span>✎ Chi tiết / Sửa đợt</span>
                  </button>

                  <button
                    type="button"
                    className="stitch-action-pill pill-emerald"
                    onClick={() => handlePrintHandoverDirect(batch.items)}
                    title="In Biên bản bàn giao A4 (2 liên) cho đợt bàn giao này"
                  >
                    <Printer size={13} />
                    <span>In biên bản ({batch.items.length})</span>
                  </button>

                  <button
                    type="button"
                    className="stitch-action-pill pill-orange"
                    onClick={() => handleCreatePaymentRequestFromSelected(batch.items)}
                    title="Lập Đề nghị thanh toán (ĐNTT) từ đợt bàn giao này"
                  >
                    <Receipt size={13} />
                    <span>Lập ĐNTT</span>
                  </button>

                  {!readOnly && (
                    <button
                      type="button"
                      className="btn-icon danger-ghost"
                      style={{ marginLeft: "auto" }}
                      onClick={handleDeleteBatch}
                      title="Xóa toàn bộ đợt bàn giao này"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {handoverBatches.length === 0 && (
            <div className="m-empty" style={{ gridColumn: "1 / -1" }}>
              Không tìm thấy đợt bàn giao nào khớp với bộ lọc hiện tại.
            </div>
          )}
        </div>
      ) : (
        /* Handover Data Table with direct paste support */
        <div className="payment-table-container" onPaste={handleHandoverTablePaste}>
        <div className="payment-table-header">
          <span>BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ (KHÔNG QUA KHO) · HỖ TRỢ DÁN CTRL+V TỪ EXCEL</span>
          <span>{checkedHandovers.size > 0 ? `Đang chọn ${checkedHandovers.size} vật tư để in, lập ĐNTT hoặc xóa` : "Tích chọn các vật tư muốn in biên bản hoặc lập ĐNTT"}</span>
        </div>
        <div className="payment-table-scroll">
          <table
            className="payment-grid"
            style={{
              tableLayout: "fixed",
              width: `${totalTableWidth}px`,
              minWidth: "100%",
            }}
          >
            <thead>
              <tr>
                {/* Fixed Checkbox Column */}
                <th
                  style={{
                    width: "44px",
                    minWidth: "44px",
                    maxWidth: "44px",
                    textAlign: "center",
                    position: "sticky",
                    left: 0,
                    top: 0,
                    zIndex: 25,
                    background: "#f1f5f9",
                    padding: "6px 2px",
                    borderRight: "1px solid #cbd5e1",
                    borderBottom: "2px solid #94a3b8",
                    boxSizing: "border-box",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ margin: 0, cursor: "pointer" }}
                    checked={
                      filteredHandovers.length > 0 &&
                      filteredHandovers.every((h) => checkedHandovers.has(h.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCheckedHandovers(new Set(filteredHandovers.map((h) => h.id)));
                      } else {
                        setCheckedHandovers(new Set());
                      }
                    }}
                  />
                </th>

                {/* Visible Configured Columns */}
                {visibleCols.map((col) => {
                  const isPinned = col.pinned;
                  const leftPx = stickyLeftMap[col.id];
                  const isLastPinned = col.id === lastPinnedId;
                  const colW = col.width || col.minWidth;

                  const thStyle: React.CSSProperties = {
                    width: `${colW}px`,
                    minWidth: `${colW}px`,
                    textAlign: col.align || "left",
                    position: "sticky",
                    top: 0,
                    zIndex: isPinned ? 24 : 5,
                    background: "#f1f5f9",
                    borderBottom: "2px solid #94a3b8",
                    borderRight: "1px solid #cbd5e1",
                    boxSizing: "border-box",
                    ...(isPinned && leftPx !== undefined ? { left: `${leftPx}px` } : {}),
                  };

                  const classes = [
                    isPinned ? "pcol-frozen" : "",
                    isLastPinned ? "pcol-frozen-last" : "",
                  ].filter(Boolean).join(" ");

                  return (
                    <th key={col.id} className={classes} style={thStyle} title={`${col.label} (${colW}px)`}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: col.align === "center" ? "center" : "space-between",
                          gap: "4px",
                          paddingRight: "8px",
                          overflow: "hidden",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {getHandoverColLabel(col.id, col.label)}
                        </span>
                      </div>
                      <div
                        className={`col-resize-handle ${resizingColId === col.id ? "is-resizing" : ""}`}
                        onMouseDown={(e) => handleStartResize(col.id, e)}
                        onDoubleClick={(e) => handleDoubleClickResize(col.id, e)}
                        title="Kéo sang trái/phải để co dãn cột, nhấp đúp để đặt lại mặc định"
                      />
                    </th>
                  );
                })}

                {/* Fixed Delete Column */}
                <th
                  style={{
                    width: "44px",
                    minWidth: "44px",
                    maxWidth: "44px",
                    textAlign: "center",
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#f1f5f9",
                    borderBottom: "2px solid #94a3b8",
                    boxSizing: "border-box",
                  }}
                >
                  Xóa
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHandovers.map((h, idx) => {
                const isChecked = checkedHandovers.has(h.id);
                const isEven = idx % 2 === 1;
                const rowBg = isChecked ? "#eff6ff" : (isEven ? "#f8fafc" : "#ffffff");
                return (
                  <tr key={h.id} className={isChecked ? "chosen" : ""}>
                    {/* Fixed Checkbox Cell */}
                    <td
                      style={{
                        width: "44px",
                        minWidth: "44px",
                        maxWidth: "44px",
                        textAlign: "center",
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        background: rowBg,
                        borderRight: "1px solid #cbd5e1",
                        boxSizing: "border-box",
                        verticalAlign: "top",
                        padding: "6px 2px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const next = new Set(checkedHandovers);
                          if (e.target.checked) next.add(h.id);
                          else next.delete(h.id);
                          setCheckedHandovers(next);
                        }}
                      />
                    </td>

                    {/* Visible Configured Columns */}
                    {visibleCols.map((col) => {
                      const isPinned = col.pinned;
                      const leftPx = stickyLeftMap[col.id];
                      const isLastPinned = col.id === lastPinnedId;
                      const colW = col.width || col.minWidth;
                      const isMultilineCol = ["item_name", "note", "sender_name", "receiver_name"].includes(col.id);

                      const style: React.CSSProperties = {
                        width: `${colW}px`,
                        minWidth: `${colW}px`,
                        textAlign: col.align || "left",
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
                          {renderTableCellContent(col.id, h)}
                        </td>
                      );
                    })}

                    {/* Fixed Delete Action */}
                    <td
                      style={{
                        width: "44px",
                        minWidth: "44px",
                        maxWidth: "44px",
                        textAlign: "center",
                        padding: "4px 2px 2px",
                        verticalAlign: "top",
                        boxSizing: "border-box",
                      }}
                    >
                      <button
                        type="button"
                        className="payment-btn btn-danger"
                        style={{ padding: "2px 6px" }}
                        onClick={() => handleDeleteHandover(h.id)}
                        title="Xóa dòng vật tư này"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredHandovers.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length + 2} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                    Chưa có vật tư bàn giao nào. Bấm "＋ Thêm dòng vật tư" hoặc "Dán từ Excel" để thêm dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )}

      {/* MODAL: Excel Paste for Handover */}
      {showPasteModal && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "1000px", width: "95vw" }}>
            <div className="payment-modal-header" style={{ padding: "16px 22px", margin: 0 }}>
              <h3 style={{ color: "#107c41" }}>📋 Dán danh sách vật tư từ file Excel</h3>
              <button type="button" onClick={() => setShowPasteModal(false)}>✕</button>
            </div>

            <div style={{ fontSize: "12.5px", color: "#475569", lineHeight: 1.5 }}>
              <b>Hướng dẫn:</b> Copy các ô hoặc cột từ file Excel (Ctrl+C), sau đó dán vào ô bên dưới (Ctrl+V).
              <br />
              • Hệ thống tự nhận diện các cột: <i>Tên hàng hóa - quy cách, ĐVT, Số lượng, Ghi chú</i>.
              <br />
              • Cột <b>SL kiểm tra - Đạt</b> sẽ mặc định bằng <b>SL chứng từ</b>.
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Bộ phận nhận (áp dụng cho đợt dán này):
                </label>
                <select
                  value={pasteTargetDept}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__ADD_NEW__") {
                      const name = window.prompt("Nhập tên / mã phòng ban mới để lưu vào hệ thống:", "");
                      if (name && name.trim()) {
                        addNewDepartment(name.trim());
                        setPasteTargetDept(name.trim());
                        handleParsePasteModal(pasteText, name.trim(), pasteTargetDate);
                      }
                      return;
                    }
                    setPasteTargetDept(val);
                    handleParsePasteModal(pasteText, val, pasteTargetDate);
                  }}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", boxSizing: "border-box" }}
                >
                  <option value="">-- Chọn phòng ban nhận --</option>
                  {handoverDepts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="__ADD_NEW__">＋ Thêm phòng ban mới...</option>
                </select>
              </div>
              <div style={{ width: "160px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Ngày bàn giao:
                </label>
                <input
                  type="date"
                  value={pasteTargetDate}
                  onChange={(e) => {
                    setPasteTargetDate(e.target.value);
                    handleParsePasteModal(pasteText, pasteTargetDept, e.target.value);
                  }}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Ô dán dữ liệu (Bấm vào đây rồi nhấn Ctrl+V):
              </label>
              <textarea
                rows={7}
                placeholder="Dán các dòng copy từ Excel vào đây..."
                value={pasteText}
                onChange={(e) =>
                  handleParsePasteModal(e.target.value, pasteTargetDept, pasteTargetDate)
                }
                style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
              />
            </div>

            {pasteParsedRows.length > 0 && (
              <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ padding: "6px 10px", background: "#f1f5f9", fontSize: "12px", fontWeight: 600 }}>
                  Xem trước dữ liệu nhận diện: {pasteParsedRows.length} vật tư
                </div>
                <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Tên vật tư</th>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>ĐVT</th>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>SL</th>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Phòng ban</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pasteParsedRows.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "4px 8px" }}>{r.item_name}</td>
                          <td style={{ padding: "4px 8px" }}>{r.unit}</td>
                          <td style={{ padding: "4px 8px" }}>{r.quantity_doc}</td>
                          <td style={{ padding: "4px 8px" }}>{r.department}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
              <button
                type="button"
                className="payment-btn"
                onClick={() => setShowPasteModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                style={{ background: "#107c41", borderColor: "#0b5c30" }}
                disabled={pasteParsedRows.length === 0}
                onClick={handleApplyPasteModal}
              >
                ✓ Chèn vào danh sách bàn giao ({pasteParsedRows.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Import from PR / PO / Contract */}
      {showImportDocModal && (
        <div className="payment-modal-overlay">
          <div
            className="payment-modal-card"
            style={{ maxWidth: "1240px", width: "96vw" }}
          >
            <div className="payment-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "22px" }}>📦</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a" }}>
                    Nhập sản phẩm từ PR, PO hoặc Hợp đồng vào Biên bản bàn giao
                  </h3>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Chọn chứng từ nguồn và tích chọn các mặt hàng cần đưa vào danh sách bàn giao
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportDocModal(false)}
                style={{ fontSize: "20px", cursor: "pointer", border: "none", background: "transparent" }}
              >
                ✕
              </button>
            </div>

            {/* Source Tab Selector */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
              <button
                type="button"
                className={`payment-tab-btn ${importDocType === "pr" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: importDocType === "pr" ? "#0284c7" : "#fff",
                  color: importDocType === "pr" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => handleSwitchImportType("pr")}
              >
                📋 Yêu cầu mua sắm PR ({prs.length})
              </button>
              <button
                type="button"
                className={`payment-tab-btn ${importDocType === "po" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: importDocType === "po" ? "#0284c7" : "#fff",
                  color: importDocType === "po" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => handleSwitchImportType("po")}
              >
                🛒 Đơn mua hàng PO ({pos.length})
              </button>
              <button
                type="button"
                className={`payment-tab-btn ${importDocType === "contract" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: importDocType === "contract" ? "#0284c7" : "#fff",
                  color: importDocType === "contract" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => handleSwitchImportType("contract")}
              >
                📑 Hợp đồng kinh tế ({contractsList.length > 0 ? contractsList.length : pos.length})
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
                  setShowImportDocModal(false);
                  handleAddHandoverRow();
                }}
                title="Thêm dòng bàn giao thủ công nhập tay"
              >
                + Thêm dòng nhập tay
              </button>
            </div>

            {/* Document Selection & Search */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Chọn {importDocType === "pr" ? "phiếu PR" : importDocType === "contract" ? "Hợp đồng" : "đơn PO"}:
                </label>
                <select
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  value={selectedDocId}
                  onChange={(e) => handleSelectDoc(e.target.value)}
                >
                  <option value="">-- Chọn chứng từ --</option>
                  {availableDocs.map((doc) => {
                    const s = "supplierId" in doc ? suppliers.find((x) => x.id === doc.supplierId) : null;
                    const subText = s ? s.name : "department" in doc ? doc.department : "";
                    const itemCount = doc.items?.length || 0;
                    return (
                      <option key={doc.id} value={doc.id}>
                        {doc.number} {subText ? `- ${subText}` : ""} ({itemCount} mặt hàng)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Bộ phận nhận bàn giao:
                </label>
                <select
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                  value={importTargetDept}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__ADD_NEW__") {
                      const name = window.prompt("Nhập tên / mã phòng ban mới để lưu vào hệ thống:", "");
                      if (name && name.trim()) {
                        addNewDepartment(name.trim());
                        setImportTargetDept(name.trim());
                      }
                      return;
                    }
                    setImportTargetDept(val);
                  }}
                >
                  <option value="">-- Chọn phòng ban nhận --</option>
                  {handoverDepts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="__ADD_NEW__">＋ Thêm phòng ban mới...</option>
                </select>
              </div>
            </div>

            {/* Document Details Box if selected */}
            {activeDoc && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", fontSize: "12px" }}>
                <div>
                  <span style={{ color: "#64748b" }}>Số chứng từ:</span> <b>{activeDoc.number}</b>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>
                    {"supplierId" in activeDoc ? "Nhà cung cấp:" : "Bộ phận yêu cầu:"}
                  </span>{" "}
                  <b>
                    {"supplierId" in activeDoc
                      ? suppliers.find((s) => s.id === activeDoc.supplierId)?.name || "Chưa rõ"
                      : "department" in activeDoc
                      ? activeDoc.department
                      : ""}
                  </b>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Ngày lập:</span>{" "}
                  <b>{"createdDate" in activeDoc ? activeDoc.createdDate : "date" in activeDoc ? activeDoc.date : ""}</b>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Số lượng mặt hàng:</span> <b>{activeDocItems.length} mục</b>
                </div>
              </div>
            )}

            {/* Items selection table */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>
                  Danh sách sản phẩm / vật tư trong chứng từ:
                </span>
                <span style={{ fontSize: "12px", color: selectedItemIds.size > 0 ? "#0284c7" : "#64748b", fontWeight: 600 }}>
                  Đã chọn: {selectedItemIds.size} / {activeDocItems.length} mặt hàng
                </span>
              </div>

              <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflowX: "auto", maxHeight: "260px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", position: "sticky", top: 0, zIndex: 2 }}>
                      <th style={{ padding: "6px 8px", width: "40px", textAlign: "center", borderBottom: "1px solid #cbd5e1" }}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.size === activeDocItems.length && activeDocItems.length > 0}
                          onChange={handleToggleSelectAllItems}
                          title="Chọn tất cả"
                        />
                      </th>
                      <th style={{ padding: "6px 8px", width: "40px", textAlign: "center", borderBottom: "1px solid #cbd5e1" }}>STT</th>
                      <th style={{ padding: "6px 8px", width: "80px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Mã hàng</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Tên sản phẩm, vật tư</th>
                      <th style={{ padding: "6px 8px", width: "140px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Quy cách</th>
                      <th style={{ padding: "6px 8px", width: "60px", textAlign: "center", borderBottom: "1px solid #cbd5e1" }}>ĐVT</th>
                      <th style={{ padding: "6px 8px", width: "80px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>SL chứng từ</th>
                      <th style={{ padding: "6px 8px", width: "110px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>SL bàn giao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDocItems.map((it, idx) => {
                      const isChecked = selectedItemIds.has(it.id);
                      const customQty = itemCustomQty[it.id] !== undefined ? itemCustomQty[it.id] : it.qty;
                      return (
                        <tr
                          key={it.id}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            background: isChecked ? "#f0f9ff" : "#fff",
                            cursor: "pointer",
                          }}
                          onClick={() => handleToggleSelectItem(it.id)}
                        >
                          <td style={{ textAlign: "center", padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectItem(it.id)}
                            />
                          </td>
                          <td style={{ textAlign: "center", color: "#64748b", padding: "6px 8px" }}>{idx + 1}</td>
                          <td style={{ padding: "6px 8px", color: "#0284c7", fontWeight: 600 }}>{it.code || "---"}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: "#0f172a" }}>{it.name}</td>
                          <td style={{ padding: "6px 8px", color: "#64748b" }}>{it.spec || "---"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>{it.unit || "Cái"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{it.qty}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={customQty}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setItemCustomQty((prev) => ({ ...prev, [it.id]: val }));
                              }}
                              style={{
                                width: "80px",
                                padding: "4px 6px",
                                textAlign: "right",
                                border: "1px solid #cbd5e1",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {activeDocItems.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                          {activeDoc ? "Chứng từ này không có mặt hàng nào." : "Vui lòng chọn chứng từ phía trên để xem danh sách mặt hàng."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                ℹ️ Các mặt hàng bàn giao sẽ tự động được gán thông tin nguồn (Số PR / PO / HĐ) vào mục ghi chú.
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="payment-btn"
                  onClick={() => setShowImportDocModal(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="payment-btn btn-primary"
                  style={{ background: "#0284c7", borderColor: "#0369a1" }}
                  disabled={selectedItemIds.size === 0}
                  onClick={handleConfirmImportItems}
                >
                  ✓ Nạp {selectedItemIds.size} mặt hàng vào danh sách bàn giao
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PORTAL PRINT CONTAINER - Completely isolated from app */}
      {typeof document !== "undefined" && isPrinting && createPortal(
        <div id="paymentPrintPortal">
          {(() => {
            const groupsByDept: Record<string, PaymentHandoverItem[]> = {};
            for (const it of printItemsList) {
              const d = String(it.department || "Chưa phân loại").trim();
              if (!groupsByDept[d]) groupsByDept[d] = [];
              groupsByDept[d].push(it);
            }

            return Object.entries(groupsByDept).map(([dept, deptItems]) => {
              const sortedDeptItems = sortHandoversByPOLineOrder(deptItems, pos);
              return (
              <React.Fragment key={dept}>
                {[1, 2].map((copyNum) => (
                  <div key={copyNum} className="handover-paper paper">
                    <table className="hb-box">
                      <tbody>
                        <tr>
                          <td className="hb-box-left">
                            <div className="hb-logo">
                              <img
                                src={PHENIKAA_LOGO_SRC}
                                alt="PHENIKAA PHARMA"
                                style={{
                                  height: "40px",
                                  width: "170px",
                                  objectFit: "contain",
                                  display: "block",
                                  margin: "0 auto",
                                }}
                              />
                            </div>
                            <div className="hb-sender-dept">Bộ phận: {dept && dept !== "Phòng Cung ứng" ? dept : "...................................................."}</div>
                          </td>
                          <td className="hb-box-right">
                            <div className="hb-title-main">
                              BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,
                            </div>
                            <div className="hb-title-main">HÀNG HÓA</div>
                            <div className="hb-title-sub">
                              (Không qua kho)
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="hb-info">
                      <div className="hb-line">
                        Hôm nay, ngày&nbsp;.....&nbsp;tháng&nbsp;.....&nbsp;năm 20.....
                      </div>
                      <div className="hb-line">Tại Công ty CP Dược phẩm Phenikaa</div>
                      <div className="hb-line">
                        Địa chỉ: Lô đất CN2-10, KCN Công nghệ cao 2, KCNC Hòa Lạc, Xã Hòa Lạc, TP Hà Nội
                      </div>
                      <div className="hb-line">Chúng tôi gồm:</div>
                      <div className="hb-two-col">
                        <div>Ông (bà): Trần Hải Hà - Người giao hàng</div>
                        <div>Địa chỉ: Phòng Cung ứng</div>
                      </div>
                      <div className="hb-two-col">
                        <div>
                          Ông (bà): .................................................... Người nhận
                          hàng
                        </div>
                        <div>Địa chỉ: {dept && dept !== "Phòng Cung ứng" ? dept : "...................................................."}</div>
                      </div>
                      <div className="hb-line">
                        Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư:
                      </div>
                    </div>

                    <table className="hb-table">
                      <thead>
                        <tr>
                          <th style={{ width: "40px" }}>STT</th>
                          <th>Tên hàng hóa - Quy cách</th>
                          <th style={{ width: "55px" }}>ĐVT</th>
                          <th style={{ width: "85px" }}>
                            SL theo
                            <br />
                            chứng từ
                          </th>
                          <th style={{ width: "80px" }}>
                            SL kiểm tra
                            <br />
                            Đạt
                          </th>
                          <th style={{ width: "80px" }}>
                            SL kiểm tra
                            <br />
                            K.Đạt
                          </th>
                          <th style={{ width: "80px" }}>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDeptItems.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="center">{idx + 1}</td>
                            <td className="left" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                              {it.item_name || ""}
                            </td>
                            <td className="center">{it.unit || ""}</td>
                            <td className="center">{it.quantity_doc || ""}</td>
                            <td className="center">{it.quantity_pass || ""}</td>
                            <td className="center">{it.quantity_fail || ""}</td>
                            <td className="center">{it.note || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="hb-footer">
                      <div className="hb-conclusion-title">Kết luận:</div>
                      <div className="hb-conclusion-body">
                        Biên bản này được lập thành 02 bản, 01 bản giao cho người giao hàng; 01
                        bản giao cho người nhận hàng.
                      </div>
                      <div className="hb-sign-row">
                        <div className="hb-sign-col">
                          Người giao hàng<br />
                          <i>(Ký, ghi rõ họ tên)</i>
                        </div>
                        <div className="hb-sign-col">
                          Người nhận hàng<br />
                          <i>(Ký, ghi rõ họ tên)</i>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </React.Fragment>
              );
            });
          })()}
        </div>,
        document.body
      )}

      {/* MODAL: Tùy chỉnh cột hiển thị & Cố định cột cho Bàn Giao */}
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
                  <h3 style={{ margin: 0, fontSize: "16px" }}>Tùy chỉnh cột Bảng Bàn Giao</h3>
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
                      id={`handover-col-chk-${col.id}`}
                      style={{ cursor: "pointer" }}
                    />
                    <label
                      htmlFor={`handover-col-chk-${col.id}`}
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
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    {/* Width input */}
                    <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "#64748b" }}>
                      <input
                        type="number"
                        min={45}
                        max={600}
                        step={5}
                        value={col.width || col.minWidth}
                        onChange={(e) => {
                          const w = Math.max(45, parseInt(e.target.value, 10) || col.minWidth);
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
                onClick={() => saveColumns(DEFAULT_HANDOVER_COLUMN_SETTINGS)}
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

      {/* POPUP XEM & SỬA CHI TIẾT TỪNG ĐỢT BÀN GIAO */}
      {editingBatchKey && (() => {
        const targetBatch = handoverBatches.find((b) => b.batchKey === editingBatchKey);
        if (!targetBatch) return null;
        const batchItemIds = new Set(targetBatch.items.map((i) => i.id));

        const updateBatchMetadata = (key: keyof PaymentHandoverItem, value: string) => {
          if (readOnly) return;
          const next = paymentHandovers.map((h) =>
            batchItemIds.has(h.id) ? { ...h, [key]: value } : h
          );
          triggerUpdateHandovers(next);
        };

        return (
          <div className="payment-modal-overlay" onClick={() => setEditingBatchKey(null)}>
            <div
              className="payment-modal-card"
              style={{ maxWidth: "1020px", width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="payment-modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px" }}>
                    📦 Chi tiết Đợt Bàn Giao {targetBatch.sourceNumber ? `· ${targetBatch.sourceType || "PO"} #${targetBatch.sourceNumber}` : `· ${targetBatch.department}`}
                  </h3>
                  <small>
                    Chỉnh sửa thông tin chung của đợt hoặc cập nhật số lượng nghiệm thu từng mặt hàng ({targetBatch.items.length} mặt hàng)
                  </small>
                </div>
                <button
                  type="button"
                  className="payment-modal-close"
                  onClick={() => setEditingBatchKey(null)}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Thông tin chung của Đợt bàn giao */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "12px",
                    background: "#f8fafc",
                    padding: "14px 16px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Bộ phận / Phòng ban nhận
                    </label>
                    <input
                      list="deptSuggestions"
                      value={targetBatch.department === "Chưa chọn bộ phận" ? "" : targetBatch.department}
                      onChange={(e) => updateBatchMetadata("department", e.target.value)}
                      placeholder="Chọn hoặc nhập phòng ban..."
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Ngày bàn giao (Áp dụng cả đợt)
                    </label>
                    <input
                      value={targetBatch.date || ""}
                      onChange={(e) => updateBatchMetadata("handover_date", e.target.value)}
                      placeholder="YYYY-MM-DD hoặc DD/MM/YYYY"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Người bàn giao (Bên giao)
                    </label>
                    <input
                      list="handoverSenderSuggestions"
                      value={targetBatch.senderName || ""}
                      onChange={(e) => updateBatchMetadata("sender_name", e.target.value)}
                      placeholder="Họ tên người giao..."
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Người tiếp nhận (Bên nhận)
                    </label>
                    <input
                      list="handoverReceiverSuggestions"
                      value={targetBatch.receiverName || ""}
                      onChange={(e) => updateBatchMetadata("receiver_name", e.target.value)}
                      placeholder="Họ tên người nhận..."
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>

                {/* Bảng chỉnh sửa các mặt hàng thuộc Đợt bàn giao */}
                <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", color: "#1e293b" }}>
                        <th style={{ width: "42px", padding: "10px 6px", textAlign: "center" }}>STT</th>
                        <th style={{ padding: "10px 10px", textAlign: "left" }}>Tên vật tư, hàng hóa - Quy cách</th>
                        <th style={{ width: "80px", padding: "10px 6px", textAlign: "center" }}>ĐVT</th>
                        <th style={{ width: "95px", padding: "10px 6px", textAlign: "center" }}>SL Chứng từ</th>
                        <th style={{ width: "95px", padding: "10px 6px", textAlign: "center" }}>SL Đạt</th>
                        <th style={{ width: "85px", padding: "10px 6px", textAlign: "center" }}>SL Hỏng</th>
                        <th style={{ width: "170px", padding: "10px 8px", textAlign: "left" }}>Ghi chú</th>
                        {!readOnly && <th style={{ width: "44px", padding: "10px 4px", textAlign: "center" }}>Xóa</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {targetBatch.items.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ textAlign: "center", fontWeight: 700, color: "#64748b" }}>{idx + 1}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              value={item.item_name || ""}
                              onChange={(e) => handleEditHandover(item.id, "item_name", e.target.value)}
                              placeholder="Tên hàng hóa..."
                              style={{ width: "100%", fontWeight: 600 }}
                            />
                          </td>
                          <td style={{ padding: "6px 4px" }}>
                            <input
                              list="unitSuggestions"
                              value={item.unit || ""}
                              onChange={(e) => handleEditHandover(item.id, "unit", e.target.value)}
                              style={{ width: "100%", textAlign: "center" }}
                            />
                          </td>
                          <td style={{ padding: "6px 4px" }}>
                            <input
                              value={item.quantity_doc || ""}
                              onChange={(e) => handleEditHandover(item.id, "quantity_doc", e.target.value)}
                              style={{ width: "100%", textAlign: "center", fontWeight: 600 }}
                            />
                          </td>
                          <td style={{ padding: "6px 4px" }}>
                            <input
                              value={item.quantity_pass || ""}
                              onChange={(e) => handleEditHandover(item.id, "quantity_pass", e.target.value)}
                              style={{ width: "100%", textAlign: "center", fontWeight: 800, color: "#059669" }}
                            />
                          </td>
                          <td style={{ padding: "6px 4px" }}>
                            <input
                              value={item.quantity_fail || ""}
                              onChange={(e) => handleEditHandover(item.id, "quantity_fail", e.target.value)}
                              style={{ width: "100%", textAlign: "center", color: "#dc2626", fontWeight: 700 }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              value={item.note || ""}
                              onChange={(e) => handleEditHandover(item.id, "note", e.target.value)}
                              placeholder="Ghi chú..."
                              style={{ width: "100%" }}
                            />
                          </td>
                          {!readOnly && (
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="btn-icon danger-ghost"
                                onClick={() => handleDeleteHandover(item.id)}
                                title="Xóa mặt hàng này khỏi đợt bàn giao"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  borderTop: "1px solid #e2e8f0",
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn btn-teal btn-md"
                    onClick={() => handlePrintHandoverDirect(targetBatch.items)}
                  >
                    <Printer size={15} /> In Biên bản Đợt này ({targetBatch.items.length} mục)
                  </button>
                  <button
                    type="button"
                    className="btn btn-accent btn-md"
                    onClick={() => {
                      setEditingBatchKey(null);
                      handleCreatePaymentRequestFromSelected(targetBatch.items);
                    }}
                  >
                    <Receipt size={15} /> Lập ĐNTT từ Đợt này
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={() => setEditingBatchKey(null)}
                >
                  <Check size={15} /> Hoàn tất & Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
