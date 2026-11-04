import React, { useState, useMemo, useEffect } from "react";
import { Plus, ArrowRight, Trash2, Truck, Search, CheckCircle2, Circle, Pencil, RotateCcw, CreditCard, Eye, ClipboardCheck } from "lucide-react";
import { Supplier, PO, PR, Item, ApprovalRequest, PaymentRequestEntry, PaymentHandoverItem, getPOContractInfo, formatPONumber, generatePOCode, isPONumberExists, TrashItem, calcPOTotal } from "../types";
import { fmt, dateVN, makeId } from "../utils";
import { SupplierSearchCombobox } from "./SupplierSearchCombobox";
import { TreeProductPickerModal, SelectedItemData } from "./TreeProductPickerModal";
import { normName } from "../payment-utils";
import { cleanExcelNumber, parseExcelClipboard } from "../utils/approvalSamples";
import { useTranslation } from "../i18n";
import { DocFlowLinks } from "./DocFlowLinks";
import { resolveDocFlow } from "../utils/docFlow";
import { isPOCompleted, calcPODeliveryStats } from "../utils/paymentSync";
import "../payment.css";

interface DraftPOItem {
  id: number;
  code: string;
  category: string;
  name: string;
  desc: string;
  spec: string;
  unit: string;
  qty: number;
  price: number;
  vatRate?: number;
}

export function POList({
  pos,
  suppliers,
  onOpen,
  onDelete,
  prs = [],
  products = [],
  approvalRequests = [],
  paymentRequests = [],
  paymentHandovers = [],
  onCreatePO,
  onAddSupplier,
  onAddProduct,
  onCreateHandover,
  onCreatePaymentRequest,
  onNavigate,
  onToggleComplete,
  onUpdatePO,
  trash = [],
  readOnly = false,
  autoOpenCreate = false,
  onClearAutoCreate,
}: {
  pos: PO[];
  suppliers: Supplier[];
  onOpen: (po: PO) => void;
  onDelete?: (po: PO) => void;
  prs?: PR[];
  products?: Item[];
  approvalRequests?: ApprovalRequest[];
  paymentRequests?: PaymentRequestEntry[];
  paymentHandovers?: PaymentHandoverItem[];
  onCreatePO?: (po: PO, openDetail?: boolean, sourcePrId?: number) => void;
  onAddSupplier?: (supplier: Supplier) => void;
  onAddProduct?: (product: Item) => void;
  onCreateHandover?: (po: PO) => void;
  onCreatePaymentRequest?: (po: PO) => void;
  onNavigate?: (route: any) => void;
  onToggleComplete?: (po: PO) => void;
  onUpdatePO?: (po: PO, oldNumber?: string) => void;
  trash?: TrashItem[];
  readOnly?: boolean;
  autoOpenCreate?: boolean;
  onClearAutoCreate?: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");

  // Create Direct PO Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (autoOpenCreate) {
      resetDraft();
      setShowCreateModal(true);
      onClearAutoCreate?.();
    }
  }, [autoOpenCreate]);
  const [editingPONumberModal, setEditingPONumberModal] = useState<PO | null>(null);
  const [editNewNumber, setEditNewNumber] = useState("");

  const handleOpenEditNumber = (targetPO: PO) => {
    setEditingPONumberModal(targetPO);
    setEditNewNumber(targetPO.number || "");
  };
  const [draftNumber, setDraftNumber] = useState("");
  const [draftNumberManual, setDraftNumberManual] = useState(false);
  const [draftSupplierId, setDraftSupplierId] = useState<number | "">("");
  const [draftPrId, setDraftPrId] = useState<number | "">("");
  const [draftPrNumber, setDraftPrNumber] = useState("Mua trực tiếp");
  const [draftCreatedDate, setDraftCreatedDate] = useState("");
  const [draftExpectedDate, setDraftExpectedDate] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [showDraftNote, setShowDraftNote] = useState(false);
  const [draftVatRate, setDraftVatRate] = useState<number>(10);
  const [draftItems, setDraftItems] = useState<DraftPOItem[]>([]);
  const [itemError, setItemError] = useState("");
  const [customProductInput, setCustomProductInput] = useState("");
  const [showTreePickerModal, setShowTreePickerModal] = useState(false);
  const [inlineProductQuery, setInlineProductQuery] = useState("");
  const [showInlineDropdown, setShowInlineDropdown] = useState(false);

  const selectedPR = useMemo(() => {
    if (!draftPrId) return null;
    return prs.find((p) => p.id === Number(draftPrId)) || null;
  }, [draftPrId, prs]);

  const handleSelectItemsFromTree = (items: SelectedItemData[]) => {
    setDraftItems((prev) => {
      const cleanPrev = prev.filter((it) => it.name.trim() !== "");
      const newItems: DraftPOItem[] = items.map((it, idx) => ({
        id: makeId(),
        code: it.code || `VT-${String(cleanPrev.length + idx + 1).padStart(2, "0")}`,
        category: it.category || "Hàng hóa",
        name: it.name,
        desc: "",
        spec: it.spec || "",
        unit: it.unit || "Cái",
        qty: it.qty || 1,
        price: it.price || 0,
      }));
      return [...cleanPrev, ...newItems];
    });

    if (!draftPrId && items[0]?.sourcePrId) {
      setDraftPrId(items[0].sourcePrId);
      if (items[0].sourcePrNumber) {
        setDraftPrNumber(items[0].sourcePrNumber);
      }
    }
  };

  const filteredInlineProducts = useMemo(() => {
    const q = normName(inlineProductQuery);
    const results: {
      name: string;
      spec?: string;
      unit: string;
      qty: number;
      price: number;
      source: string;
      sourcePrId?: number;
      sourcePrNumber?: string;
    }[] = [];
    const seenNames = new Set<string>();

    if (selectedPR && selectedPR.items) {
      for (let i = 0; i < selectedPR.items.length; i++) {
        if (results.length >= 15) break;
        const it = selectedPR.items[i];
        const nName = normName(it.name);
        if (
          !q ||
          nName.includes(q) ||
          normName(it.spec || "").includes(q) ||
          normName(it.code || "").includes(q)
        ) {
          seenNames.add(nName);
          results.push({
            name: it.name,
            spec: it.spec,
            unit: it.unit || "Cái",
            qty: it.qty || 1,
            price: it.estimate || 0,
            source: `PR #${selectedPR.number}`,
            sourcePrId: selectedPR.id,
            sourcePrNumber: selectedPR.number,
          });
        }
      }
    }

    for (let i = 0; i < products.length; i++) {
      if (results.length >= 15) break;
      const p = products[i];
      const nName = normName(p.name);
      if (seenNames.has(nName)) continue;

      if (
        !q ||
        nName.includes(q) ||
        normName(p.spec || "").includes(q) ||
        normName(p.code || "").includes(q) ||
        normName(p.category || "").includes(q)
      ) {
        seenNames.add(nName);
        results.push({
          name: p.name,
          spec: p.spec,
          unit: p.unit || "Cái",
          qty: 1,
          price: p.estimate || 0,
          source: p.category || "Danh mục chung",
        });
      }
    }

    return results;
  }, [inlineProductQuery, selectedPR, products]);

  const resetDraft = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setDraftNumber(generatePOCode(null, todayStr, pos, trash));
    setDraftNumberManual(false);
    setDraftSupplierId("");
    setDraftPrId("");
    setDraftPrNumber("Mua trực tiếp");
    setDraftCreatedDate(todayStr);
    setDraftExpectedDate("");
    setDraftNote("");
    setShowDraftNote(false);
    setDraftVatRate(10);
    setCustomProductInput("");
    setDraftItems([
      {
        id: makeId(),
        code: "VT-01",
        category: "Vật tư chung",
        name: "",
        desc: "",
        spec: "",
        unit: "Cái",
        qty: 1,
        price: 0,
      },
    ]);
    setItemError("");
  };

  const DRAFT_PO_EDITABLE_FIELDS = ["name", "spec", "unit", "qty", "price"] as const;
  type DraftPOEditableField = (typeof DRAFT_PO_EDITABLE_FIELDS)[number];

  const handleDraftItemPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowIdx: number,
    startField: DraftPOEditableField
  ) => {
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text) return;

    const matrix = parseExcelClipboard(text);
    if (matrix.length === 0) return;

    const isMultiCell =
      matrix.length > 1 || (matrix[0] && matrix[0].length > 1);
    const isNumField = startField === "qty" || startField === "price";

    if (!isMultiCell) {
      if (isNumField && matrix[0]?.[0] !== undefined) {
        e.preventDefault();
        const cleaned = cleanExcelNumber(matrix[0][0]);
        setDraftItems((prev) =>
          prev.map((it, i) =>
            i === startRowIdx ? { ...it, [startField]: cleaned } : it
          )
        );
      }
      return;
    }

    e.preventDefault();
    const startColIdx = DRAFT_PO_EDITABLE_FIELDS.indexOf(startField);
    if (startColIdx === -1) return;

    setDraftItems((prev) => {
      const next = prev.map((it) => ({ ...it }));
      const neededRows = startRowIdx + matrix.length;
      while (next.length < neededRows) {
        const nextIdx = next.length + 1;
        next.push({
          id: makeId() + next.length * 13 + Math.floor(Math.random() * 1000),
          code: `VT-${String(nextIdx).padStart(2, "0")}`,
          category: "Vật tư chung",
          name: "",
          desc: "",
          spec: "",
          unit: "Cái",
          qty: 1,
          price: 0,
        });
      }

      for (let r = 0; r < matrix.length; r++) {
        const targetRow = next[startRowIdx + r];
        if (!targetRow) continue;
        const rowCells = matrix[r];
        for (let c = 0; c < rowCells.length; c++) {
          const targetField = DRAFT_PO_EDITABLE_FIELDS[startColIdx + c];
          if (!targetField) break;
          const cellVal = rowCells[c];
          if (targetField === "qty" || targetField === "price") {
            targetRow[targetField] = cleanExcelNumber(cellVal);
          } else {
            targetRow[targetField] = cellVal;
          }
        }
      }
      return next;
    });
  };

  const handleSelectPR = (prIdVal: string) => {
    if (!prIdVal) {
      setDraftPrId("");
      setDraftPrNumber("Mua trực tiếp");
      return;
    }
    const prId = Number(prIdVal);
    setDraftPrId(prId);
    const foundPR = prs.find((p) => p.id === prId);
    if (foundPR) {
      setDraftPrNumber(foundPR.number);
      // If user had no custom items or just 1 blank item, load items from PR
      const hasOnlyBlank = draftItems.length === 0 || (draftItems.length === 1 && !draftItems[0].name.trim());
      if (hasOnlyBlank && foundPR.items && foundPR.items.length > 0) {
        setDraftItems(
          foundPR.items.map((it, idx) => ({
            id: makeId(),
            code: it.code || `VT-${String(idx + 1).padStart(2, "0")}`,
            category: it.category || "Vật tư chung",
            name: it.name,
            desc: it.desc || "",
            spec: it.spec || "",
            unit: it.unit || "Cái",
            qty: it.qty || 1,
            price: it.estimate || 0,
          }))
        );
      }
    }
  };

  const handleAddCustomProduct = (nameInput: string) => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const existing = products.find((p) => normName(p.name) === normName(trimmed));
    if (existing) {
      setDraftItems((prev) => [
        ...prev.filter((x) => x.name.trim() !== ""),
        {
          id: makeId(),
          code: existing.code || `VT-${String(prev.length + 1).padStart(2, "0")}`,
          category: existing.category || "Hàng hóa",
          name: existing.name,
          desc: existing.desc || "",
          spec: existing.spec || "",
          unit: existing.unit || "Cái",
          qty: 1,
          price: existing.estimate || 0,
        },
      ]);
    } else {
      const newId = makeId();
      const nextCode = `VT-${String(products.length + 1).padStart(2, "0")}`;
      const newProd: Item = {
        id: newId,
        code: nextCode,
        category: "Vật tư",
        name: trimmed,
        desc: "",
        spec: "",
        unit: "Cái",
        qty: 1,
        estimate: 0,
      };
      onAddProduct?.(newProd);
      setDraftItems((prev) => [
        ...prev.filter((x) => x.name.trim() !== ""),
        {
          id: makeId(),
          code: nextCode,
          category: "Vật tư",
          name: trimmed,
          desc: "",
          spec: "",
          unit: "Cái",
          qty: 1,
          price: 0,
        },
      ]);
    }
    setCustomProductInput("");
  };

  const draftSubtotal = draftItems.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
    0
  );
  const draftVatAmount = Math.round(draftSubtotal * (draftVatRate / 100));
  const draftTotal = draftSubtotal + draftVatAmount;

  const handleSavePO = (openDetail: boolean) => {
    if (!draftNumber.trim()) {
      setItemError("Vui lòng nhập số PO.");
      return;
    }
    if (!draftSupplierId) {
      setItemError("Vui lòng chọn nhà cung cấp.");
      return;
    }
    if (draftItems.length === 0) {
      setItemError("Đơn hàng phải có ít nhất 1 mặt hàng.");
      return;
    }
    const invalidItem = draftItems.find(
      (it) => !it.name.trim() || Number(it.qty) <= 0
    );
    if (invalidItem) {
      setItemError("Mỗi dòng hàng cần có tên mặt hàng và số lượng > 0.");
      return;
    }

    const supplierIdNum = Number(draftSupplierId);
    const newPO: PO = {
      id: makeId(),
      number: draftNumber.trim(),
      prNumber: draftPrNumber.trim() || "Mua trực tiếp",
      supplierId: supplierIdNum,
      createdDate: draftCreatedDate || new Date().toISOString().slice(0, 10),
      expectedDate: draftExpectedDate || "",
      status: "Mới tạo",
      items: draftItems.map((item, idx) => ({
        id: item.id || makeId(),
        code: item.code || `VT-${String(idx + 1).padStart(2, "0")}`,
        category: item.category || "Hàng hóa",
        name: item.name.trim(),
        desc: item.desc || "",
        spec: item.spec || "",
        unit: item.unit.trim() || "Cái",
        qty: Number(item.qty) || 1,
        estimate: Number(item.price) || 0,
        price: Number(item.price) || 0,
        vatRate: draftVatRate,
        deliveryStatus: "Chưa giao",
        deliveredQty: 0,
        deliveryDate: "",
      })),
      docs: [],
      payments: [
        {
          id: makeId(),
          phase: "Tạm ứng (50%)",
          percent: 50,
          amount: Math.round(draftTotal * 0.5),
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Quyết toán / Hoàn tất (50%)",
          percent: 50,
          amount: draftTotal - Math.round(draftTotal * 0.5),
          condition: "post",
          status: "Chưa thanh toán",
          date: "",
          note: `Thanh toán số tiền còn lại sau thuế VAT (${draftVatRate}%)`,
        },
      ],
      note: draftNote.trim(),
      contractNote: "",
    };

    const sourcePrId = typeof draftPrId === "number" ? draftPrId : undefined;
    onCreatePO?.(newPO, openDetail, sourcePrId);
    setShowCreateModal(false);
  };

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "done">("all");

  const poKpiStats = useMemo(() => {
    const allPos = (pos || []).filter(Boolean);
    const totalCount = allPos.length;
    let doneCount = 0;
    let totalValue = 0;
    let paidValue = 0;
    allPos.forEach((p) => {
      if (isPOCompleted(p, paymentHandovers)) doneCount += 1;
      const val = calcPOTotal(p);
      totalValue += val;
      const paid = (p.payments || [])
        .filter((pm) => pm.status === "Đã thanh toán")
        .reduce((n, pm) => n + (Number(pm.amount) || 0), 0);
      paidValue += Math.min(val, paid);
    });
    return {
      totalCount,
      doneCount,
      activeCount: totalCount - doneCount,
      totalValue,
      paidValue,
    };
  }, [pos, paymentHandovers]);

  const shown = (pos || [])
    .filter((po) => {
      if (!po) return false;
      const isDone = isPOCompleted(po, paymentHandovers);
      if (statusFilter === "active" && isDone) return false;
      if (statusFilter === "done" && !isDone) return false;
      const s = suppliers.find((x) => Number(x.id) === Number(po.supplierId));
      const itemNames = (po.items || []).map((it) => it.name || "").join(" ");
      return ((po.number || "") + (po.prNumber || "") + (s?.name || "") + " " + itemNames)
        .toLowerCase()
        .includes(q.toLowerCase());
    })
    .sort((a, b) => {
      // Giữ nguyên thứ tự mới ở trên, cũ ở dưới (không đẩy PO hoàn tất xuống dưới)
      return (b.createdDate || "").localeCompare(a.createdDate || "") || (b.id - a.id);
    });

  return (
    <section className="content po-list-page">
      {/* Stitch v2 Executive Page Header */}
      <div className="heading stitch-page-banner">
        <div>
          <div className="stitch-breadcrumb">
            <span>Điều hành Thu mua</span>
            <span>/</span>
            <b>Đơn Mua Hàng (PO)</b>
          </div>
          <h1>{t("po.title")}</h1>
          <p className="stitch-subtitle">
            Quản lý tập trung hợp đồng, đơn đặt hàng (PO), tiến độ nhận hàng thực tế và quyết toán công nợ NCC
          </p>
        </div>
        {!readOnly && onCreatePO && (
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                resetDraft();
                setShowCreateModal(true);
              }}
            >
              <Plus size={16} /> Lập Đơn Mua Hàng (PO)
            </button>
          </div>
        )}
      </div>

      {/* Stitch v2 Bento KPI Summary Strip */}
      <div className="stitch-kpi-strip">
        <div className="stitch-kpi-card kpi-navy">
          <div className="stitch-kpi-icon">
            <CreditCard size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Tổng Đơn Mua Hàng (PO)</small>
            <strong>
              {poKpiStats.totalCount} <em>đơn hàng</em>
            </strong>
            <span className="stitch-kpi-sub">
              Tổng giá trị: <b>{fmt(poKpiStats.totalValue)} ₫</b>
            </span>
          </div>
        </div>

        <div className="stitch-kpi-card kpi-orange">
          <div className="stitch-kpi-icon">
            <Truck size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Đang Thực Hiện & Giao Hàng</small>
            <strong>
              {poKpiStats.activeCount} <em>đơn đang mở</em>
            </strong>
            <span className="stitch-kpi-sub">
              Theo dõi giao hàng & chứng từ nghiệm thu
            </span>
          </div>
        </div>

        <div className="stitch-kpi-card kpi-emerald">
          <div className="stitch-kpi-icon">
            <CheckCircle2 size={20} />
          </div>
          <div className="stitch-kpi-body">
            <small>Đã Hoàn Thành & Quyết Toán</small>
            <strong>
              {poKpiStats.doneCount} <em>đơn hoàn tất</em>
            </strong>
            <span className="stitch-kpi-sub">
              Đã thanh toán: <b>{fmt(poKpiStats.paidValue)} ₫</b>
            </span>
          </div>
        </div>
      </div>

      <div className="po-list-panel">
        <div className="pr-toolbar stitch-filter-bar">
          <div className="stitch-seg-group">
            <button
              type="button"
              className={`stitch-seg-btn ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              Tất cả <b>{poKpiStats.totalCount}</b>
            </button>
            <button
              type="button"
              className={`stitch-seg-btn ${statusFilter === "active" ? "active" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              Đang thực hiện <b>{poKpiStats.activeCount}</b>
            </button>
            <button
              type="button"
              className={`stitch-seg-btn ${statusFilter === "done" ? "active" : ""}`}
              onClick={() => setStatusFilter("done")}
            >
              Đã hoàn thành <b>{poKpiStats.doneCount}</b>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", position: "relative" }}>
              <Search size={16} style={{ color: "var(--slate-400)", position: "absolute", left: "12px", pointerEvents: "none" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("po.search_placeholder")}
                style={{ paddingLeft: "36px", minWidth: "280px" }}
              />
            </label>
            <span className="stitch-count-pill">
              Hiển thị <b>{shown.length}</b> / {poKpiStats.totalCount} đơn PO
            </span>
          </div>
        </div>

        <div className="mobile-record-list">
          {shown.map((po) => {
            const supplier = suppliers.find((s) => Number(s.id) === Number(po.supplierId));
            const items = po.items || [];
            const total = calcPOTotal(po);
            const deliveryStats = calcPODeliveryStats(po, paymentHandovers);
            const delivered = deliveryStats.fullyDeliveredItemsCount;
            const paid = (po.payments || [])
              .filter((p) => p.status === "Đã thanh toán")
              .reduce((n, p) => n + (Number(p.amount) || 0), 0);
            const isFullyPaid = total > 0 && paid >= total;
            const flow = resolveDocFlow({ po }, { prs, pos, approvalRequests, paymentRequests, paymentHandovers });
            const isDone = isPOCompleted(po, paymentHandovers);
            return (
              <article key={po.id} className={isDone ? "row-completed" : ""}>
                <header>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    {onToggleComplete && (
                      <button
                        type="button"
                        className="completion-toggle-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleComplete(po);
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
                    <button onClick={() => onOpen(po)}>{po.number}</button>
                    {!readOnly && onUpdatePO && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditNumber(po);
                        }}
                        style={{ marginLeft: 4, background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: "2px" }}
                        title="Chỉnh sửa mã Số PO này"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    {pos.filter((p) => p.number && p.number.trim().toLowerCase() === (po.number || "").trim().toLowerCase()).length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditNumber(po);
                        }}
                        style={{
                          marginLeft: 4,
                          padding: "1px 5px",
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "#b45309",
                          background: "#fef3c7",
                          border: "1px solid #fde68a",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                        title="Số PO này đang trùng với đơn khác! Bấm để sửa mã"
                      >
                        ⚠ Trùng
                      </button>
                    )}
                  </div>
                  <span className={`status ${isDone ? "done" : "progress"}`}>
                    {isDone ? "Đã hoàn thành" : po.status || "Đang xử lý"}
                  </span>
                </header>
                <div style={{ marginTop: "6px" }}>
                  <h3 style={{ fontSize: "14.5px", fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>
                    {supplier?.name || "Chưa có nhà cung cấp"}
                  </h3>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {po.prNumber ? `Căn cứ ${po.prNumber}` : "Đơn mua trực tiếp"} · {dateVN(po.createdDate)}
                  </div>
                </div>

                {/* Tổng tiền nổi bật font to */}
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "10px 0 6px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Giá trị đơn hàng:</span>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "#1d4ed8" }}>
                    {fmt(total)} <span style={{ fontSize: "13px", fontWeight: 600 }}>₫</span>
                  </span>
                </div>

                {/* Danh sách mặt hàng chính trong PO */}
                {items.length > 0 && (
                  <div style={{ margin: "6px 0 8px", padding: "8px 10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span>📦 Mặt hàng ({items.length}):</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      {items.slice(0, 2).map((it, itIdx) => (
                        <div key={it.id || itIdx} style={{ fontSize: "12px", color: "#1e293b", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, paddingRight: "6px" }}>
                            • {it.name || (it as any).itemName || (it as any).item_name || (it as any).productName || "(Chưa có tên hàng)"}
                          </span>
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500, flexShrink: 0 }}>
                            {it.qty} {it.unit || "Cái"}
                          </span>
                        </div>
                      ))}
                      {items.length > 2 && (
                        <div style={{ fontSize: "11px", color: "#0284c7", fontWeight: 600, marginTop: "2px" }}>
                          +{items.length - 2} mặt hàng khác...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Thanh tiến độ % giao hàng */}
                <div style={{ margin: "8px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                    <span style={{ color: "#475569" }}>Giao hàng:</span>
                    <span style={{ fontWeight: 700, color: deliveryStats.isFullyDelivered ? "#15803d" : "#0369a1" }}>
                      {deliveryStats.isFullyDelivered
                        ? "✓ Đã giao đủ 100%"
                        : `${deliveryStats.overallProgressPercent}% (${delivered}/${items.length} mặt hàng)`}
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "7px",
                      background: "#f1f5f9",
                      borderRadius: "999px",
                      overflow: "hidden",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        width: `${deliveryStats.overallProgressPercent}%`,
                        height: "100%",
                        background: deliveryStats.isFullyDelivered ? "#16a34a" : "#2563eb",
                        borderRadius: "999px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>

                {/* Trạng thái thanh toán */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                    padding: "6px 8px",
                    background: "#f8fafc",
                    borderRadius: "6px",
                    marginBottom: "10px",
                  }}
                >
                  <span style={{ color: "#64748b" }}>Thanh toán:</span>
                  {isFullyPaid ? (
                    <span style={{ color: "#166534", fontWeight: 700, fontSize: "11px", background: "#dcfce7", padding: "2px 8px", borderRadius: "4px" }}>
                      ✓ Đã thanh toán 100%
                    </span>
                  ) : paid > 0 ? (
                    <span style={{ color: "#0369a1", fontWeight: 600, fontSize: "11px", background: "#e0f2fe", padding: "2px 8px", borderRadius: "4px" }}>
                      Đã TT {total > 0 ? Math.round((paid / total) * 100) : 0}%
                    </span>
                  ) : (
                    <span style={{ color: "#64748b", fontSize: "11.5px" }}>Chưa thanh toán</span>
                  )}
                </div>
                <footer className="m-card-footer">
                  <button
                    type="button"
                    className="m-action-btn m-btn-primary"
                    onClick={() => onOpen(po)}
                    title="Mở xem chi tiết PO"
                  >
                    <Eye size={17} />
                    <span>Mở PO</span>
                  </button>
                  {onCreateHandover && (
                    <button
                      type="button"
                      className={`m-action-btn ${deliveryStats.isFullyDelivered ? "m-btn-outline-success" : "m-btn-success"}`}
                      onClick={() => onCreateHandover(po)}
                      title={deliveryStats.isFullyDelivered ? "Đơn hàng đã bàn giao đủ 100% (Bấm để xem biên bản)" : "Tạo biên bản bàn giao hàng hóa"}
                    >
                      <ClipboardCheck size={17} />
                      <span>{deliveryStats.isFullyDelivered ? "Đã bàn giao NB" : "Bàn giao nội bộ"}</span>
                    </button>
                  )}
                  {onCreatePaymentRequest && (
                    <button
                      type="button"
                      className="m-action-btn m-btn-outline-primary"
                      onClick={() => onCreatePaymentRequest(po)}
                      title="Lập Đề nghị thanh toán (ĐNTT)"
                    >
                      <CreditCard size={17} />
                      <span>ĐNTT</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      className="m-action-btn m-btn-danger"
                      onClick={() => onDelete(po)}
                      title="Xóa PO"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        <div className="pr-table" style={{ width: "100%", overflowX: "auto", overflowY: "visible", maxHeight: "none" }}>
          <table style={{ width: "100%", minWidth: "1080px", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ width: "150px", whiteSpace: "nowrap" }}>{t("table.po_number")}</th>
                <th style={{ minWidth: "220px" }}>{t("table.supplier")}</th>
                <th style={{ width: "115px", whiteSpace: "nowrap" }}>{t("table.created_date")}</th>
                <th style={{ width: "115px", whiteSpace: "nowrap" }}>{t("table.expected_delivery")}</th>
                <th style={{ width: "135px", whiteSpace: "nowrap", textAlign: "right" }}>{t("table.po_value")}</th>
                <th style={{ width: "175px", whiteSpace: "nowrap", textAlign: "center" }}>Giao hàng &amp; Thanh toán</th>
                <th style={{ width: "105px", whiteSpace: "nowrap", textAlign: "center" }}>{t("table.documents")}</th>
                <th style={{ width: "230px", minWidth: "230px", textAlign: "right", paddingRight: "16px" }}>{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((po) => {
                const s = suppliers.find((x) => Number(x.id) === Number(po.supplierId));
                const items = po.items || [];
                const docs = po.docs || [];
                const payments = po.payments || [];
                const contractInfo = getPOContractInfo(po);
                const deliveryStats = calcPODeliveryStats(po, paymentHandovers);
                const delivered = deliveryStats.fullyDeliveredItemsCount;
                const docsCount = docs.filter((d) => d.status === "Đã đủ").length;
                const paid = payments
                  .filter((p) => p.status === "Đã thanh toán")
                  .reduce((n, p) => n + (Number(p.amount) || 0), 0);
                const total = calcPOTotal(po);
                const flow = resolveDocFlow({ po }, { prs, pos, approvalRequests, paymentRequests, paymentHandovers });
                const isDone = isPOCompleted(po, paymentHandovers);

                // Tính toán trạng thái thanh toán hiển thị tại Dòng 2
                const isFullyPaid = total > 0 && paid >= total;
                let paymentStatusBadge: React.ReactNode = null;
                if (isFullyPaid) {
                  paymentStatusBadge = (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#166534",
                        background: "#dcfce7",
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      ✓ Đã TT
                    </span>
                  );
                } else if (paid > 0) {
                  const paidStages = payments.filter((p) => p.status === "Đã thanh toán");
                  const lastPaid = paidStages[paidStages.length - 1];
                  const paidPct = Math.round((paid / total) * 100);
                  const stageText = lastPaid?.phase ? lastPaid.phase.replace(/Thanh toán/gi, "TT").trim() : `Đợt ${paidStages.length}`;
                  paymentStatusBadge = (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#0369a1",
                        background: "#e0f2fe",
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      Đã TT {stageText} - {paidPct}%
                    </span>
                  );
                } else {
                  paymentStatusBadge = (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "11px",
                        color: "#64748b",
                        background: "#f1f5f9",
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      Chưa thanh toán
                    </span>
                  );
                }

                return (
                  <tr key={po.id} className={isDone ? "row-completed" : ""}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        {onToggleComplete && (
                          <button
                            type="button"
                            className="completion-toggle-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleComplete(po);
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
                        <button className="pr-link" onClick={() => onOpen(po)}>
                          {po.number}
                        </button>
                        {!readOnly && onUpdatePO && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditNumber(po);
                            }}
                            style={{
                              marginLeft: 6,
                              padding: "2px 4px",
                              background: "none",
                              border: "none",
                              color: "#64748b",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                            title="Chỉnh sửa mã Số PO này"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        {pos.filter((p) => p.number && p.number.trim().toLowerCase() === (po.number || "").trim().toLowerCase()).length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditNumber(po);
                            }}
                            style={{
                              marginLeft: 6,
                              padding: "1px 6px",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              color: "#b45309",
                              background: "#fef3c7",
                              border: "1px solid #fde68a",
                              borderRadius: 4,
                              cursor: "pointer",
                            }}
                            title="Số PO này đang trùng với đơn khác! Bấm để sửa mã"
                          >
                            ⚠ Trùng mã
                          </button>
                        )}
                      </div>
                      {contractInfo.hasContract && (
                        <div style={{ marginTop: "3px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "10.5px",
                              fontWeight: 600,
                              color: "#6d28d9",
                              background: "#f3e8ff",
                              border: "1px solid #d8b4fe",
                              padding: "1px 6px",
                              borderRadius: "4px",
                            }}
                            title={`Hợp đồng số: ${contractInfo.contractNumber || "Chưa nhập số"} · Ngày: ${dateVN(contractInfo.contractDate)}`}
                          >
                            📑 HĐ: {contractInfo.contractNumber || "Có HĐ"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <b style={{ color: "#0f172a", fontSize: "13.5px" }}>{s?.name || "Chưa có NCC"}</b>
                        {s?.code && <small className="supplier-code">{s.code}</small>}
                        {po.prNumber && (
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#0369a1", background: "#f0f9ff", border: "1px solid #bae6fd", padding: "1px 7px", borderRadius: "6px" }}>
                            PR: {po.prNumber}
                          </span>
                        )}
                      </div>
                      {items.length > 0 && (
                        <div style={{ marginTop: "4px", fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                          <span style={{ background: "#f1f5f9", color: "#334155", padding: "1px 7px", borderRadius: "6px", fontWeight: 600 }}>
                            📦 {items.slice(0, 2).map((it) => it.name || (it as any).itemName || "Mặt hàng").join(", ")}
                            {items.length > 2 ? ` (+${items.length - 2} mục)` : ""}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: "#334155" }}>{dateVN(po.createdDate)}</td>
                    <td style={{ whiteSpace: "nowrap", color: "#475569" }}>{dateVN(po.expectedDate)}</td>
                    <td className="money" style={{ whiteSpace: "nowrap", textAlign: "right", fontSize: "13.5px", fontWeight: 800, color: "#2B6DF8" }}>{fmt(total)} ₫</td>
                    <td style={{ textAlign: "center", minWidth: "175px" }}>
                      {/* Dòng 1: Tiến độ giao hàng */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", marginBottom: "5px" }}>
                        <span className="mini-progress" style={{ margin: "0 auto 2px", width: "120px", height: "7px", borderRadius: "999px", background: "#e2e8f0" }}>
                          <i
                            style={{
                              width: `${deliveryStats.overallProgressPercent}%`,
                              background: deliveryStats.isFullyDelivered ? "#16a34a" : "#2563eb",
                              borderRadius: "999px",
                            }}
                          />
                        </span>
                        <small style={{ color: deliveryStats.isFullyDelivered ? "#15803d" : "#334155", fontWeight: 700, fontSize: "11px" }}>
                          {deliveryStats.isFullyDelivered ? (
                            "✓ Giao đủ 100%"
                          ) : (
                            `Giao ${delivered}/${items.length} (${deliveryStats.overallProgressPercent}%)`
                          )}
                        </small>
                      </div>

                      {/* Dòng 2: Trạng thái thanh toán thực tế */}
                      <div style={{ marginTop: "2px" }}>
                        {paymentStatusBadge}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {docs.length === 0 ? (
                        <span style={{ fontSize: "11.5px", color: "#94a3b8", background: "#f8fafc", padding: "3px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          Chưa đính kèm
                        </span>
                      ) : (
                        <span
                          className={
                            docsCount === docs.length
                              ? "status done"
                              : "status waiting"
                          }
                        >
                          {docsCount}/{docs.length} đủ
                        </span>
                      )}
                    </td>
                    <td style={{ width: "260px", minWidth: "260px", paddingRight: "16px" }}>
                      <div className="row-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", flexWrap: "nowrap" }}>
                        <button
                          type="button"
                          className="stitch-action-pill pill-navy"
                          onClick={() => onOpen(po)}
                          title="Mở chi tiết Đơn mua hàng (PO)"
                        >
                          <span>Chi tiết</span>
                          <ArrowRight size={13} />
                        </button>
                        {onCreateHandover && (
                          <button
                            type="button"
                            className="stitch-action-pill pill-emerald"
                            onClick={() => onCreateHandover(po)}
                            title="Tạo biên bản bàn giao cho PO này"
                          >
                            <ClipboardCheck size={13} />
                            <span>Bàn giao nội bộ</span>
                          </button>
                        )}
                        {onCreatePaymentRequest && (
                          <button
                            type="button"
                            className="stitch-action-pill pill-sky"
                            onClick={() => onCreatePaymentRequest(po)}
                            title="Lập Đề nghị thanh toán (ĐNTT) và mở ngay bản in Mẫu 01-TT"
                          >
                            <CreditCard size={13} />
                            <span>ĐNTT</span>
                          </button>
                        )}
                        {onDelete && (
                          <button
                            className="btn-icon danger-ghost"
                            onClick={() => onDelete(po)}
                            title="Xóa PO"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE DIRECT PO MODAL */}
      {showCreateModal && (
        <div className="payment-modal-overlay">
          <div
            className="payment-modal-card"
            style={{ maxWidth: 1260, width: "96vw", maxHeight: "90vh" }}
          >
            <div className="payment-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>
                  ＋ Tạo đơn mua hàng (PO) mới
                </h3>
                <small style={{ color: "#64748b" }}>
                  Tạo trực tiếp không qua luồng so sánh báo giá
                </small>
              </div>
              <button
                type="button"
                className="payment-modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxHeight: "75vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {/* General Form */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Số PO (Tự động: Tên viết tắt NCC - Ngày tạo, có thể sửa) <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      required
                      className="payment-input"
                      style={{
                        flex: 1,
                        fontWeight: 700,
                        color: isPONumberExists(draftNumber.trim(), pos, trash) ? "#dc2626" : "#0284c7",
                        border: isPONumberExists(draftNumber.trim(), pos, trash) ? "1px solid #ef4444" : "1px solid #cbd5e1",
                        background: isPONumberExists(draftNumber.trim(), pos, trash) ? "#fef2f2" : "#fff",
                      }}
                      value={draftNumber}
                      onChange={(e) => {
                        setDraftNumber(e.target.value);
                        setDraftNumberManual(true);
                      }}
                      placeholder="VD: MERCK-24102026"
                    />
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "0 10px", fontSize: 11.5, background: "#f8fafc", border: "1px solid #cbd5e1", whiteSpace: "nowrap" }}
                      title="Gợi ý lại mã duy nhất tự động"
                      onClick={() => {
                        const chosenSup = suppliers.find((s) => Number(s.id) === Number(draftSupplierId));
                        setDraftNumber(generatePOCode(chosenSup, draftCreatedDate, pos, trash));
                        setDraftNumberManual(false);
                      }}
                    >
                      <RotateCcw size={12} /> Tự động
                    </button>
                  </div>
                  {isPONumberExists(draftNumber.trim(), pos, trash) && (
                    <div style={{ color: "#ef4444", fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                      ⚠ Số PO này đã tồn tại, vui lòng chọn số khác!
                    </div>
                  )}
                </div>

                <div>
                  <SupplierSearchCombobox
                    suppliers={suppliers}
                    selectedSupplierId={draftSupplierId}
                    onSelectSupplier={(id) => {
                      setDraftSupplierId(id);
                      const chosenSup = suppliers.find((s) => Number(s.id) === Number(id));
                      if (!draftNumberManual) {
                        setDraftNumber(generatePOCode(chosenSup, draftCreatedDate, pos, trash));
                      }
                    }}
                    onAddSupplier={onAddSupplier}
                    required
                    label="Nhà cung cấp"
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Nguồn PR (Tùy chọn)
                  </label>
                  <select
                    className="payment-input"
                    style={{
                      width: "100%",
                      borderColor: selectedPR ? "#0284c7" : "#cbd5e1",
                      background: selectedPR ? "#f0f9ff" : "#fff",
                      fontWeight: selectedPR ? 600 : 400,
                    }}
                    value={draftPrId}
                    onChange={(e) => handleSelectPR(e.target.value)}
                  >
                    <option value="">Mua trực tiếp (Không qua PR)</option>
                    {prs.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.number} - {pr.department || "PR"} (
                        {pr.items?.length || 0} mặt hàng)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPR && (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                      fontSize: "12px",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: "#166534" }}>
                        🔗 Đã liên kết với {selectedPR.number} ({selectedPR.department || "PR"}):
                      </span>{" "}
                      <span style={{ color: "#334155" }}>
                        Danh sách chọn mặt hàng bên dưới sẽ lọc theo {selectedPR.items?.length || 0} mặt hàng của PR này
                      </span>
                    </div>
                    <button
                      type="button"
                      className="payment-btn"
                      style={{
                        padding: "3px 8px",
                        fontSize: "11px",
                        background: "#fff",
                        color: "#166534",
                        borderColor: "#86efac",
                        fontWeight: 600,
                      }}
                      onClick={() => {
                        if (selectedPR.items && selectedPR.items.length > 0) {
                          setDraftItems(
                            selectedPR.items.map((it, idx) => ({
                              id: makeId(),
                              code: it.code || `VT-${String(idx + 1).padStart(2, "0")}`,
                              category: it.category || "Vật tư",
                              name: it.name,
                              desc: it.desc || "",
                              spec: it.spec || "",
                              unit: it.unit || "Cái",
                              qty: it.qty || 1,
                              price: it.estimate || 0,
                            }))
                          );
                        }
                      }}
                    >
                      📥 Nạp nhanh toàn bộ {selectedPR.items?.length || 0} mặt hàng từ PR
                    </button>
                  </div>
                )}

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Ngày tạo đơn
                  </label>
                  <input
                    type="date"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftCreatedDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraftCreatedDate(val);
                      if (!draftNumberManual) {
                        const chosenSup = suppliers.find((s) => Number(s.id) === Number(draftSupplierId));
                        setDraftNumber(generatePOCode(chosenSup, val, pos, trash));
                      }
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Hạn hoàn tất giao hàng
                  </label>
                  <input
                    type="date"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftExpectedDate}
                    onChange={(e) => setDraftExpectedDate(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Thuế suất VAT
                  </label>
                  <select
                    className="payment-input"
                    style={{ width: "100%", fontWeight: 600 }}
                    value={draftVatRate}
                    onChange={(e) => setDraftVatRate(Number(e.target.value))}
                  >
                    <option value={10}>10% - Thuế GTGT chuẩn (10%)</option>
                    <option value={8}>8% - Thuế GTGT ưu đãi (8%)</option>
                    <option value={5}>5% - Thuế GTGT 5%</option>
                    <option value={0}>0% - Không chịu thuế / Miễn thuế (0%)</option>
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  {showDraftNote || draftNote.trim() ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
                          Ghi chú PO
                        </label>
                        <button
                          type="button"
                          onClick={() => { setDraftNote(""); setShowDraftNote(false); }}
                          style={{ background: "transparent", border: 0, color: "#64748b", fontSize: "11px", cursor: "pointer" }}
                        >
                          ✕ Ẩn ghi chú
                        </button>
                      </div>
                      <input
                        type="text"
                        className="payment-input"
                        style={{ width: "100%" }}
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        placeholder="Ghi chú về đơn hàng, điều khoản giao hàng..."
                      />
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowDraftNote(true)}
                        style={{
                          padding: "5px 12px",
                          borderRadius: "6px",
                          border: "1px dashed #cbd5e1",
                          background: "#f8fafc",
                          color: "#475569",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Plus size={13} /> Thêm Ghi chú chung PO
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Section */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, color: "#1e293b" }}>
                      Danh sách mặt hàng ({draftItems.length})
                    </h4>
                    {selectedPR && (
                      <span style={{ fontSize: 11.5, color: "#0369a1", fontWeight: 600 }}>
                        (Chỉ hiển thị mặt hàng & số lượng thuộc PR #{selectedPR.number})
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {/* TREE PICKER BUTTON */}
                    <button
                      type="button"
                      className="payment-btn"
                      style={{
                        background: "#0284c7",
                        borderColor: "#0369a1",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "12px",
                        padding: "6px 14px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                      onClick={() => setShowTreePickerModal(true)}
                      title="Mở cây thư mục theo Phòng ban → Phiếu PR hoặc Danh mục sản phẩm để tích chọn"
                    >
                      <span>🌲 Duyệt Cây thư mục PR & Danh mục</span>
                    </button>

                    {/* INLINE FAST-SEARCH COMBOBOX */}
                    <div style={{ position: "relative" }}>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <input
                          type="text"
                          className="payment-input"
                          style={{ fontSize: 12, width: 230 }}
                          placeholder="Gõ tìm nhanh sản phẩm..."
                          value={inlineProductQuery}
                          onFocus={() => setShowInlineDropdown(true)}
                          onChange={(e) => {
                            setInlineProductQuery(e.target.value);
                            setShowInlineDropdown(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && inlineProductQuery.trim()) {
                              e.preventDefault();
                              handleAddCustomProduct(inlineProductQuery.trim());
                              setInlineProductQuery("");
                              setShowInlineDropdown(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="payment-btn payment-btn-sm"
                          style={{
                            padding: "5px 9px",
                            fontSize: "11.5px",
                            background: "#f0fdf4",
                            color: "#166534",
                            borderColor: "#bbf7d0",
                            fontWeight: 600,
                          }}
                          onClick={() => {
                            if (inlineProductQuery.trim()) {
                              handleAddCustomProduct(inlineProductQuery.trim());
                              setInlineProductQuery("");
                              setShowInlineDropdown(false);
                            }
                          }}
                          title="Thêm mặt hàng này vào danh sách đơn hàng"
                        >
                          ＋ Thêm
                        </button>
                      </div>

                      {showInlineDropdown && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            marginTop: "4px",
                            width: "330px",
                            maxHeight: "270px",
                            overflowY: "auto",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                            zIndex: 9999,
                          }}
                        >
                          <div
                            style={{
                              padding: "6px 10px",
                              background: "#f1f5f9",
                              borderBottom: "1px solid #e2e8f0",
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "#475569",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span>Gợi ý nhanh ({filteredInlineProducts.length})</span>
                            <button
                              type="button"
                              style={{ border: 0, background: "none", color: "#64748b", cursor: "pointer", fontSize: "11px" }}
                              onClick={() => setShowInlineDropdown(false)}
                            >
                              ✕ Đóng
                            </button>
                          </div>

                          {filteredInlineProducts.map((p, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: "7px 10px",
                                borderBottom: "1px solid #f1f5f9",
                                cursor: "pointer",
                                fontSize: "12px",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                              onClick={() => {
                                setDraftItems((prev) => [
                                  ...prev.filter((x) => x.name.trim() !== ""),
                                  {
                                    id: makeId(),
                                    code: `VT-${String(prev.length + 1).padStart(2, "0")}`,
                                    category: "Hàng hóa",
                                    name: p.name,
                                    desc: "",
                                    spec: p.spec || "",
                                    unit: p.unit || "Cái",
                                    qty: p.qty || 1,
                                    price: p.price || 0,
                                  },
                                ]);
                                if (!draftPrId && p.sourcePrId) {
                                  setDraftPrId(p.sourcePrId);
                                  if (p.sourcePrNumber) setDraftPrNumber(p.sourcePrNumber);
                                }
                                setInlineProductQuery("");
                                setShowInlineDropdown(false);
                              }}
                            >
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>{p.name}</div>
                              <div style={{ fontSize: "11px", color: "#64748b", display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                                <span>{p.source}</span>
                                <span>SL: {p.qty} {p.unit} · {fmt(p.price)} ₫</span>
                              </div>
                            </div>
                          ))}

                          {filteredInlineProducts.length === 0 && (
                            <div style={{ padding: "12px", textAlign: "center", fontSize: "12px", color: "#64748b" }}>
                              Không tìm thấy sản phẩm.
                              {inlineProductQuery.trim() && (
                                <button
                                  type="button"
                                  className="payment-btn payment-btn-sm"
                                  style={{ marginTop: "6px", width: "100%", background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}
                                  onClick={() => {
                                    handleAddCustomProduct(inlineProductQuery.trim());
                                    setInlineProductQuery("");
                                    setShowInlineDropdown(false);
                                  }}
                                >
                                  ＋ Thêm mới "{inlineProductQuery.trim()}"
                                </button>
                              )}
                            </div>
                          )}

                          <div
                            style={{
                              padding: "6px 10px",
                              background: "#f8fafc",
                              borderTop: "1px solid #e2e8f0",
                              textAlign: "center",
                            }}
                          >
                            <button
                              type="button"
                              style={{
                                border: 0,
                                background: "none",
                                color: "#0284c7",
                                fontWeight: 600,
                                fontSize: "11.5px",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                setShowInlineDropdown(false);
                                setShowTreePickerModal(true);
                              }}
                            >
                              🌲 Mở Cây thư mục PR & Danh mục đầy đủ →
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="payment-btn"
                      onClick={() =>
                        setDraftItems((prev) => [
                          ...prev,
                          {
                            id: makeId(),
                            code: `VT-${String(prev.length + 1).padStart(2, "0")}`,
                            category: "Vật tư",
                            name: "",
                            desc: "",
                            spec: "",
                            unit: "Cái",
                            qty: 1,
                            price: 0,
                          },
                        ])
                      }
                    >
                      ＋ Thêm dòng trống
                    </button>
                  </div>
                </div>

                {/* Items Table */}
                <div
                  style={{
                    overflowX: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: "#f8fafc",
                          borderBottom: "1px solid #cbd5e1",
                        }}
                      >
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            width: 35,
                          }}
                        >
                          STT
                        </th>
                        <th style={{ padding: "8px 6px", textAlign: "left" }}>
                          Tên mặt hàng <span style={{ color: "#ef4444" }}>*</span>
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "left",
                            width: 140,
                          }}
                        >
                          Quy cách
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            width: 65,
                          }}
                        >
                          ĐVT
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                            width: 75,
                          }}
                        >
                          Số lượng
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                            width: 110,
                          }}
                        >
                          Đơn giá (₫)
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                            width: 110,
                          }}
                        >
                          Thành tiền
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            width: 40,
                          }}
                        ></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftItems.map((item, idx) => {
                        const lineTotal =
                          (Number(item.qty) || 0) * (Number(item.price) || 0);
                        return (
                          <tr
                            key={item.id}
                            style={{ borderBottom: "1px solid #f1f5f9" }}
                          >
                            <td
                              style={{
                                textAlign: "center",
                                color: "#64748b",
                              }}
                            >
                              {idx + 1}
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="text"
                                required
                                className="payment-input"
                                style={{ width: "100%" }}
                                list={`po-item-datalist-${idx}`}
                                value={item.name}
                                onPaste={(e) => handleDraftItemPaste(e, idx, "name")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (selectedPR) {
                                    const matched = selectedPR.items?.find(
                                      (x) => normName(x.name) === normName(val)
                                    );
                                    if (matched) {
                                      setDraftItems((prev) =>
                                        prev.map((it, i) =>
                                          i === idx
                                            ? {
                                                ...it,
                                                name: matched.name,
                                                spec: matched.spec || it.spec,
                                                unit: matched.unit || it.unit,
                                                qty: matched.qty || it.qty,
                                                price: matched.estimate || it.price,
                                              }
                                            : it
                                        )
                                      );
                                      return;
                                    }
                                  } else {
                                    const matched = products?.find(
                                      (p) => normName(p.name) === normName(val)
                                    );
                                    if (matched) {
                                      setDraftItems((prev) =>
                                        prev.map((it, i) =>
                                          i === idx
                                            ? {
                                                ...it,
                                                name: matched.name,
                                                spec: matched.spec || it.spec,
                                                unit: matched.unit || it.unit,
                                                price: matched.estimate || it.price,
                                              }
                                            : it
                                        )
                                      );
                                      return;
                                    }
                                  }
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, name: val } : it
                                    )
                                  );
                                }}
                                placeholder={
                                  selectedPR
                                    ? "Chọn hoặc gõ tên hàng trong PR..."
                                    : "Nhập hoặc chọn tên hàng..."
                                }
                              />
                              <datalist id={`po-item-datalist-${idx}`}>
                                {selectedPR
                                  ? selectedPR.items?.map((it) => (
                                      <option key={it.id} value={it.name}>
                                        SL: {it.qty} {it.unit} {it.spec ? `(${it.spec})` : ""}
                                      </option>
                                    ))
                                  : products.map((p) => (
                                      <option key={p.id} value={p.name}>
                                        {p.code} - {p.unit}
                                      </option>
                                    ))}
                              </datalist>
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="text"
                                className="payment-input"
                                style={{ width: "100%" }}
                                value={item.spec}
                                onPaste={(e) => handleDraftItemPaste(e, idx, "spec")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, spec: val } : it
                                    )
                                  );
                                }}
                                placeholder="Quy cách..."
                              />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="text"
                                className="payment-input"
                                style={{
                                  width: "100%",
                                  textAlign: "center",
                                }}
                                value={item.unit}
                                onPaste={(e) => handleDraftItemPaste(e, idx, "unit")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, unit: val } : it
                                    )
                                  );
                                }}
                              />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="number"
                                min="1"
                                className="payment-input"
                                style={{
                                  width: "100%",
                                  textAlign: "right",
                                }}
                                value={item.qty}
                                onPaste={(e) => handleDraftItemPaste(e, idx, "qty")}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, qty: val } : it
                                    )
                                  );
                                }}
                              />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                className="payment-input"
                                style={{
                                  width: "100%",
                                  textAlign: "right",
                                }}
                                value={item.price}
                                onPaste={(e) => handleDraftItemPaste(e, idx, "price")}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, price: val } : it
                                    )
                                  );
                                }}
                              />
                            </td>
                            <td
                              style={{
                                padding: "6px 8px",
                                textAlign: "right",
                                fontWeight: 600,
                                color: "#0f172a",
                              }}
                            >
                              {fmt(lineTotal)} ₫
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {draftItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftItems((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    )
                                  }
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    fontSize: 16,
                                    padding: "2px 6px",
                                  }}
                                  title="Xóa dòng"
                                >
                                  🗑
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr
                        style={{
                          background: "#f8fafc",
                          fontWeight: 600,
                          borderTop: "2px solid #cbd5e1",
                          color: "#475569",
                        }}
                      >
                        <td
                          colSpan={4}
                          style={{
                            padding: "6px 12px",
                            textAlign: "right",
                          }}
                        >
                          Tổng tiền hàng trước VAT:
                        </td>
                        <td
                          style={{
                            padding: "6px 6px",
                            textAlign: "right",
                          }}
                        >
                          {draftItems.reduce(
                            (s, it) => s + (Number(it.qty) || 0),
                            0
                          )}
                        </td>
                        <td></td>
                        <td
                          style={{
                            padding: "6px 8px",
                            textAlign: "right",
                            fontSize: 13,
                            color: "#0f172a",
                          }}
                        >
                          {fmt(draftSubtotal)} ₫
                        </td>
                        <td></td>
                      </tr>
                      <tr
                        style={{
                          background: "#f8fafc",
                          fontWeight: 600,
                          color: "#0284c7",
                        }}
                      >
                        <td
                          colSpan={6}
                          style={{
                            padding: "4px 12px",
                            textAlign: "right",
                          }}
                        >
                          Tiền thuế VAT ({draftVatRate}%):
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            textAlign: "right",
                            fontSize: 13,
                          }}
                        >
                          +{fmt(draftVatAmount)} ₫
                        </td>
                        <td></td>
                      </tr>
                      <tr
                        style={{
                          background: "#f0fdf4",
                          fontWeight: 800,
                          borderTop: "1px solid #bbf7d0",
                        }}
                      >
                        <td
                          colSpan={6}
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            color: "#166534",
                            fontSize: 13,
                          }}
                        >
                          TỔNG THANH TOÁN (SAU VAT):
                        </td>
                        <td
                          style={{
                            padding: "8px 8px",
                            textAlign: "right",
                            color: "#15803d",
                            fontSize: 15,
                          }}
                        >
                          {fmt(draftTotal)} ₫
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Quick info note */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#166534",
                }}
              >
                ℹ️ Đơn PO sau khi tạo mặc định không gắn sẵn hồ sơ để bạn tự thêm trong mục Hồ sơ khi cần. Bạn có thể tùy chỉnh các đợt thanh toán và hồ sơ bất cứ lúc nào trong trang Chi tiết PO.
              </div>

              {itemError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ⚠ {itemError}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              className="payment-modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                borderTop: "1px solid #e2e8f0",
                paddingTop: 12,
              }}
            >
              <button
                type="button"
                className="payment-btn"
                onClick={() => setShowCreateModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="payment-btn"
                onClick={() => handleSavePO(false)}
              >
                ✓ Lưu đơn PO
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                onClick={() => handleSavePO(true)}
              >
                ✓ Lưu & Mở chi tiết PO →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TREE PRODUCT PICKER MODAL */}
      <TreeProductPickerModal
        isOpen={showTreePickerModal}
        onClose={() => setShowTreePickerModal(false)}
        prs={prs}
        products={products}
        selectedPRId={draftPrId}
        existingItemNames={draftItems.map((it) => it.name)}
        onSelectItems={handleSelectItemsFromTree}
        onAddProduct={onAddProduct}
        title="Tạo đơn PO: Chọn sản phẩm theo Cây thư mục PR & Danh mục"
      />
            {editingPONumberModal && renderEditPONumberModal()}
</section>
  );

  function renderEditPONumberModal() {
    if (!editingPONumberModal) return null;
    const sup = suppliers.find((s) => Number(s.id) === Number(editingPONumberModal.supplierId));
    const isDupEdit = isPONumberExists(editNewNumber.trim(), pos, trash, editingPONumberModal.id);
    const subtotal = (editingPONumberModal.items || []).reduce((s, i) => s + (i.qty * i.price), 0);
    const vat = (editingPONumberModal.items || []).reduce((s, i) => s + Math.round(i.qty * i.price * ((i.vatRate || 0) / 100)), 0);
    const total = subtotal + vat;

    return (
      <div
        className="backdrop no-print"
        style={{ zIndex: 10000 }}
        onClick={() => setEditingPONumberModal(null)}
      >
        <div
          className="modal-panel"
          style={{ width: "min(500px, 95vw)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h3 className="modal-title">✏️ Chỉnh sửa mã Số PO</h3>
              <p className="modal-desc">
                Cập nhật mã PO và đồng bộ liên kết chứng từ toàn hệ thống
              </p>
            </div>
            <button
              type="button"
              className="btn-close"
              onClick={() => setEditingPONumberModal(null)}
            >
              ×
            </button>
          </div>

          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#64748b" }}>Nhà cung cấp: </span>
                <strong style={{ color: "#0f172a" }}>{sup?.name || "Chưa có NCC"}</strong>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#64748b" }}>Ngày tạo PO: </span>
                <strong>{dateVN(editingPONumberModal.createdDate)}</strong>
                <span style={{ color: "#64748b", marginLeft: 12 }}>Tổng giá trị: </span>
                <strong style={{ color: "#0284c7" }}>{fmt(total)} ₫</strong>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Mã PO hiện tại: </span>
                <code style={{ background: "#e2e8f0", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                  {editingPONumberModal.number}
                </code>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Số PO mới: <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  className="payment-input"
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 700,
                    color: isDupEdit ? "#dc2626" : "#0284c7",
                    border: `1px solid ${isDupEdit ? "#ef4444" : "#cbd5e1"}`,
                    background: isDupEdit ? "#fef2f2" : "#fff",
                  }}
                  value={editNewNumber}
                  onChange={(e) => setEditNewNumber(e.target.value)}
                  placeholder="VD: PHUCVINH-26102026-02"
                />
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "0 10px", fontSize: 12, background: "#f8fafc", border: "1px solid #cbd5e1", whiteSpace: "nowrap" }}
                  title="Gợi ý mã chuẩn tự động tránh trùng lặp"
                  onClick={() => {
                    const autoCode = generatePOCode(sup, editingPONumberModal.createdDate, pos, trash, editingPONumberModal.id);
                    setEditNewNumber(autoCode);
                  }}
                >
                  <RotateCcw size={13} /> Gợi ý mã
                </button>
              </div>

              {isDupEdit ? (
                <div style={{ color: "#ef4444", fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                  ⚠ Số PO này đã tồn tại, vui lòng chọn số khác!
                </div>
              ) : (
                <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 4 }}>
                  Mã PO nên theo định dạng [Tên NCC]-[ddMMyyyy] hoặc có thêm hậu tố (-02, -03) nếu tạo nhiều đơn trong ngày.
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setEditingPONumberModal(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!editNewNumber.trim() || isDupEdit || editNewNumber.trim() === editingPONumberModal.number}
                style={{
                  background: !editNewNumber.trim() || isDupEdit || editNewNumber.trim() === editingPONumberModal.number ? "#94a3b8" : "#0284c7",
                  borderColor: !editNewNumber.trim() || isDupEdit || editNewNumber.trim() === editingPONumberModal.number ? "#94a3b8" : "#0284c7",
                  cursor: !editNewNumber.trim() || isDupEdit || editNewNumber.trim() === editingPONumberModal.number ? "not-allowed" : "pointer",
                }}
                onClick={() => {
                  if (!editNewNumber.trim() || isDupEdit) return;
                  const updated = { ...editingPONumberModal, number: editNewNumber.trim() };
                  onUpdatePO?.(updated, editingPONumberModal.number);
                  setEditingPONumberModal(null);
                }}
              >
                Lưu thay đổi mã PO
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

}