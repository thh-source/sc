import React, { useState, useMemo } from "react";
import {
  Supplier,
  PO,
  POItem,
  PODoc,
  Payment,
  ApprovalRequest,
  isContractPO,
  calcPOItemSubtotal,
  calcPOItemTotal,
  calcPOTotal,
  formatPONumber,
} from "../types";
import { fmt, dateVN, makeId, generateShortName } from "../utils";
import { BANK_SUGGESTIONS } from "../payment-utils";
import { SupplierSearchCombobox } from "./SupplierSearchCombobox";
import VisualTimeline from "./VisualTimeline";
import DocumentManager from "./DocumentManager";

export function PODetail({
  po,
  suppliers,
  setSuppliers,
  onUpdate,
  onBack,
  workspaceId,
  readOnly = false,
  onStatus,
  onCreateHandover,
  onCreatePaymentRequest,
  onNavigateToPayment,
  onSave,
  onAddSupplier,
  approvalRequests = [],
  onDelete,
}: {
  po: PO;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onUpdate: (po: PO) => void;
  onBack: () => void;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
  onCreateHandover?: (po: PO) => void;
  onCreatePaymentRequest?: (po: PO, payment: Payment) => void;
  onNavigateToPayment?: (reqId?: number) => void;
  onSave?: () => Promise<void> | void;
  onAddSupplier?: (supplier: Supplier) => void;
  approvalRequests?: ApprovalRequest[];
  onDelete?: (po: PO) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

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

  const supplier = suppliers.find((s) => Number(s.id) === Number(po.supplierId));
  const items = po.items || [];
  const subtotal = items.reduce((s, i) => s + calcPOItemSubtotal(i), 0);
  const total = calcPOTotal(po);
  const totalVatAmount = total - subtotal;

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

  const handleConfirmBatchDelivery = () => {
    const selectedIds = items.filter((it) => batchSelected[it.id]).map((it) => it.id);
    if (selectedIds.length === 0) {
      alert("Vui lòng tích chọn ít nhất 1 mặt hàng để cập nhật giao hàng!");
      return;
    }

    const updatedItems: POItem[] = items.map((it) => {
      if (!batchSelected[it.id]) return it;
      const addQty = Math.max(0, Number(batchQty[it.id]) || 0);
      if (addQty <= 0) return it;
      const delivDate = batchItemDate[it.id] || batchDeliveryDate || new Date().toISOString().slice(0, 10);
      const prevDelivered = Number(it.deliveredQty) || 0;
      const nextDelivered = Math.min(Number(it.qty) || addQty, prevDelivered + addQty);
      const nextStatus: POItem["deliveryStatus"] =
        nextDelivered >= (Number(it.qty) || 0)
          ? "Đã giao"
          : nextDelivered > 0
          ? "Giao một phần"
          : "Chưa giao";
      const nextHistory = [
        ...(it.deliveryHistory || []),
        { date: delivDate, qty: addQty },
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
      updatedItems.every((i) => i.deliveryStatus === "Đã giao");
    const someDone = updatedItems.some(
      (i) => (Number(i.deliveredQty) || 0) > 0
    );
    const nextPoStatus = allDone
      ? "Đã giao đủ"
      : someDone
      ? "Đang giao hàng"
      : po.status;

    onUpdate({
      ...po,
      status: nextPoStatus,
      items: updatedItems,
    });
    setShowDeliveryModal(false);
    onStatus?.(`✓ Đã cập nhật giao hàng cho ${selectedIds.length} mặt hàng trong PO ${po.number}`);
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
      setTimeout(() => setSavedNotice(false), 3000);
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
        return updated;
      }),
    });
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
  return (
    <section className="content po-detail">
      <div className="heading">
        <div>
          <button className="back-link" onClick={onBack}>
            ← Quản lý PO
          </button>
          <em>{isContractPO(po) ? "HỢP ĐỒNG MUA HÀNG" : "ĐƠN MUA HÀNG"} · {po.number}</em>
          <h1>{supplier?.name || "Chưa chọn nhà cung cấp"}</h1>
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
                  width: "165px",
                  height: "30px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: "#0284c7",
                  padding: "2px 8px",
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
                  title="Tạo lại Số PO theo quy tắc: Tên viết tắt NCC - Ngày tạo PO (abcd-xyz)"
                  onClick={() =>
                    onUpdate({
                      ...po,
                      number: formatPONumber(supplier, po.createdDate),
                    })
                  }
                >
                  ↻ Tạo mã NCC-Ngày
                </button>
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
                {saving ? "⏳ Đang lưu..." : savedNotice ? "✓ Đã lưu thành công!" : "💾 Lưu đơn PO"}
              </button>
              <button
                type="button"
                className="po-save-back-btn"
                disabled={saving}
                onClick={() => void handleManualSave(true)}
                title="Lưu thông tin và quay lại danh sách PO"
              >
                ✓ Lưu & Quay lại
              </button>
            </>
          )}
          {onCreateHandover && (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => onCreateHandover(po)}
              title="Tạo biên bản bàn giao cho các mặt hàng trong đơn này"
            >
              🚚 Tạo biên bản bàn giao
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
              }}
              onClick={() => onDelete(po)}
              title="Chuyển đơn PO này vào thùng rác"
            >
              🗑 Xóa PO
            </button>
          )}
          <div className="po-total">
            <span>Giá trị PO (Sau VAT)</span>
            <b>{fmt(total)} ₫</b>
            <i>{po.status}</i>
          </div>
        </div>
      </div>
      <section className="common-note-card po-common-note">
        <label>
          <span>✎ Ghi chú chung PO</span>
          <textarea
            rows={3}
            value={po.note || ""}
            placeholder="Diễn giải tự do, điều kiện đặc biệt hoặc lưu ý thực hiện PO..."
            onChange={(e) => onUpdate({ ...po, note: e.target.value })}
          />
        </label>
      </section>
      <div className="po-tabs" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "4px", overflowX: "auto" }}>
          <a href="#supplier">Thông tin NCC</a>
          <a href="#documents">Hồ sơ & Hợp đồng</a>
          <a href="#payments">Thanh toán</a>
          <a href="#timeline">Timeline</a>
          <a href="#po-items">Danh sách hàng hóa & Giao hàng</a>
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
              style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
              disabled={saving}
              onClick={() => void handleManualSave(false)}
            >
              {saving ? "⏳ Đang lưu..." : "💾 Lưu thay đổi"}
            </button>
          </div>
        )}
      </div>
      <section id="supplier" className="po-section">
        <div className="section-heading">
          <div>
            <span>▱</span>
            <h2>Thông tin nhà cung cấp</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <small>
              Đồng bộ từ danh sách nhà cung cấp ·{" "}
              <b style={{ color: supplier?.code ? "#0284c7" : "#64748b" }}>
                {supplier?.code || "Chưa có mã NCC"}
              </b>
            </small>
            {!readOnly && (
              <button
                type="button"
                onClick={() => void handleManualSave(false)}
                style={{
                  height: "30px",
                  padding: "0 12px",
                  background: "#f0fdf4",
                  borderColor: "#86efac",
                  color: "#166534",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ✓ Lưu thông tin NCC
              </button>
            )}
          </div>
        </div>
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
        </div>
      </section>
      <div className="po-two-columns">
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
                    🗑 Xóa hết
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
                  📑 ＋ Thêm hợp đồng
                </button>
                <button
                  type="button"
                  style={{ cursor: "pointer", fontWeight: 600 }}
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
                  ＋ Thêm hồ sơ
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
                📑 ＋ Hợp đồng
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
                  ＋ {presetName}
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
                              🗑
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
                        🗑
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
        <section id="payments" className="po-section po-payment-section">
          <div className="section-heading">
            <div>
              <span>₫</span>
              <h2>Tiến độ thanh toán</h2>
            </div>
            <button type="button" onClick={handleAddPaymentStage}>
              ＋ Thêm đợt
            </button>
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
                  <button type="button" className="po-preset-pill" onClick={handleAddPaymentStage}>
                    ＋ Thêm đợt thủ công
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
                    >
                      🗑️ Xóa đợt
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
                          value={p.status}
                          onChange={(e) => handleUpdatePaymentStage(p.id, { status: e.target.value as Payment["status"] })}
                          style={{
                            fontWeight: 600,
                            color: p.status === "Đã thanh toán" ? "#16a34a" : p.status === "Đang xử lý" ? "#d97706" : "#475569"
                          }}
                        >
                          <option>Chưa thanh toán</option>
                          <option>Đang xử lý</option>
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
                      </div>
                    )}

                    {condition === "post" && (
                      <div className="po-condition-box-post">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <span style={{ fontSize: "14px" }}>📄</span>
                          <div>
                            <b>Quy định trả sau: Yêu cầu nhập hóa đơn đã xuất</b>
                            <p style={{ margin: "2px 0 0 0", color: "#14532d" }}>
                              Đợt thanh toán trả sau (sau giao hàng / công nợ). Yêu cầu nhập đầy đủ thông tin Hóa đơn GTGT do NCC đã phát hành trước khi giải ngân.
                            </p>
                          </div>
                        </div>
                        <div className="po-invoice-row">
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px", color: !p.invoiceNo ? "#b91c1c" : "#166534" }}>
                              Số HĐ GTGT đã xuất: {!p.invoiceNo && "(Cần nhập)"}
                            </span>
                            <input
                              placeholder="Ví dụ: 0012345, 1C24T..."
                              style={{ borderColor: !p.invoiceNo ? "#f87171" : "#86efac" }}
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
                      </div>
                    )}

                    {condition === "other" && (
                      <div className="po-condition-box-other">
                        <span style={{ fontWeight: 600 }}>Tùy chọn chứng từ hóa đơn:</span>
                        <div className="po-invoice-row">
                          <input
                            placeholder="Số hóa đơn (nếu có)..."
                            value={p.invoiceNo || ""}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceNo: e.target.value })}
                          />
                          <input
                            type="date"
                            value={p.invoiceDate || ""}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceDate: e.target.value })}
                          />
                          <input
                            placeholder="Ghi chú điều khoản thanh toán..."
                            value={p.note || ""}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { note: e.target.value })}
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
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            className="po-create-payment-req-btn"
                            onClick={() => onNavigateToPayment?.(p.paymentRequestId)}
                          >
                            👁️ Xem ĐNTT trong Quản lý thanh toán →
                          </button>
                          <button
                            type="button"
                            style={{ padding: "4px 8px", background: "transparent", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px", color: "#64748b", cursor: "pointer" }}
                            onClick={() => {
                              if (confirm("Bạn có muốn hủy liên kết ĐNTT này khỏi đợt thanh toán không?")) {
                                handleUpdatePaymentStage(p.id, { paymentRequestId: undefined });
                              }
                            }}
                            title="Hủy liên kết để có thể lập lại ĐNTT mới nếu cần"
                          >
                            Hủy liên kết
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          Chưa lập ĐNTT cho đợt này ({fmt(p.amount)} ₫).
                        </span>
                        {onCreatePaymentRequest && (
                          <button
                            type="button"
                            className="po-create-payment-req-btn"
                            onClick={() => onCreatePaymentRequest(po, p)}
                          >
                            💳 Lập Đề nghị thanh toán (ĐNTT)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
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

      {/* DANH SÁCH HÀNG HÓA TRONG PO (NẰM DƯỚI CÙNG GIAO DIỆN PO) */}
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
                }}
                title="Lấy danh sách hàng hóa & đơn giá từ Phiếu Đề nghị phê duyệt (ĐNPĐ)"
              >
                📥 Lấy hàng từ ĐNPĐ
              </button>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={openDeliveryPopup}
                style={{
                  height: "34px",
                  padding: "0 14px",
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
                title="Mở popup tích chọn hàng hóa giao bao nhiêu vào ngày nào (áp dụng ngày chung cho các hàng giao cùng đợt)"
              >
                🚚 Giao hàng
              </button>
            )}

            {onCreateHandover && (
              <button
                type="button"
                onClick={() => onCreateHandover(po)}
                style={{
                  height: "34px",
                  padding: "0 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  color: "#166534",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
                title="Tạo biên bản bàn giao từ các mặt hàng trong PO này"
              >
                📋 Lập biên bản bàn giao
              </button>
            )}

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
                }}
              >
                ＋ Thêm hàng hóa
              </button>
            )}
          </div>
        </div>

        <div className="delivery-table" style={{ overflowX: "auto" }}>
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
                      padding: "24px 12px",
                      color: "#64748b",
                      fontSize: "13px",
                    }}
                  >
                    Chưa có mặt hàng nào trong PO này. Bấm <b>"＋ Thêm hàng hóa"</b> hoặc <b>"📥 Lấy hàng từ ĐNPĐ"</b> ở góc trên bên phải để thêm.
                  </td>
                </tr>
              ) : (
                items.map((i, idx) => {
                  const rowTotal = calcPOItemTotal(i);
                  const delivQty = Number(i.deliveredQty) || 0;
                  const orderQty = Number(i.qty) || 0;
                  const isDone = orderQty > 0 && delivQty >= orderQty;
                  const isPartial = delivQty > 0 && delivQty < orderQty;
                  const historyList = i.deliveryHistory || [];
                  return (
                    <tr key={i.id}>
                      <td style={{ textAlign: "center", fontWeight: 600, color: "#64748b" }}>
                        {idx + 1}
                      </td>
                      <td>
                        <input
                          value={i.name || ""}
                          disabled={readOnly}
                          placeholder="Nhập tên hàng hóa / vật tư..."
                          style={{ width: "100%", fontWeight: 600 }}
                          onChange={(e) => {
                            const nextItems = items.map((x) =>
                              x.id === i.id ? { ...x, name: e.target.value } : x
                            );
                            onUpdate({ ...po, items: nextItems });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={i.qty ?? 0}
                          disabled={readOnly}
                          style={{ width: "100%", textAlign: "right", fontWeight: 600 }}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
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
                          value={i.price ?? 0}
                          disabled={readOnly}
                          style={{ width: "100%", textAlign: "right", fontWeight: 600 }}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
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
                              ? `⏳ Đã giao ${delivQty}/${orderQty}`
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
                            🗑
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
      </section>

      {/* POPUP GIAO HÀNG CHO PO */}
      {showDeliveryModal && (
        <div
          className="payment-modal-overlay"
          onClick={() => setShowDeliveryModal(false)}
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
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "10px",
              maxWidth: "880px",
              width: "100%",
              maxHeight: "88vh",
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
                  🚚 Cập nhật Giao hàng cho PO {po.number}
                </h3>
                <small style={{ color: "#64748b" }}>
                  Tích chọn các mặt hàng được giao, nhập số lượng giao và chọn ngày giao chung cho đợt giao hàng này
                </small>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliveryModal(false)}
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

            <div
              style={{
                padding: "12px 18px",
                background: "#eff6ff",
                borderBottom: "1px solid #bfdbfe",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <label style={{ fontWeight: 700, fontSize: "13px", color: "#1e3a8a" }}>
                  📅 Ngày giao hàng chung (áp dụng cho tất cả hàng tích chọn):
                </label>
                <input
                  type="date"
                  value={batchDeliveryDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setBatchDeliveryDate(newDate);
                    const nextDates: Record<number, string> = {};
                    items.forEach((it) => {
                      nextDates[it.id] = newDate;
                    });
                    setBatchItemDate(nextDates);
                  }}
                  style={{
                    height: "34px",
                    padding: "4px 10px",
                    fontSize: "13px",
                    fontWeight: 700,
                    border: "1px solid #60a5fa",
                    borderRadius: "6px",
                    background: "#fff",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    const nextSel: Record<number, boolean> = {};
                    items.forEach((it) => {
                      nextSel[it.id] = true;
                    });
                    setBatchSelected(nextSel);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: "#fff",
                    border: "1px solid #93c5fd",
                    borderRadius: "5px",
                    color: "#1d4ed8",
                    cursor: "pointer",
                  }}
                >
                  ☑️ Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setBatchSelected({})}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "5px",
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  Bỏ chọn hết
                </button>
              </div>
            </div>

            <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                    <th style={{ padding: "8px", width: "44px", textAlign: "center" }}>Chọn</th>
                    <th style={{ padding: "8px" }}>Tên hàng hóa</th>
                    <th style={{ padding: "8px", width: "70px", textAlign: "center" }}>ĐVT</th>
                    <th style={{ padding: "8px", width: "80px", textAlign: "right" }}>SL đặt</th>
                    <th style={{ padding: "8px", width: "90px", textAlign: "right" }}>Đã giao</th>
                    <th style={{ padding: "8px", width: "125px", textAlign: "right" }}>SL giao đợt này</th>
                    <th style={{ padding: "8px", width: "145px", textAlign: "center" }}>Ngày giao</th>
                    <th style={{ padding: "8px", width: "80px", textAlign: "center" }}>Đặt lại</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const checked = Boolean(batchSelected[it.id]);
                    const delivered = Number(it.deliveredQty) || 0;
                    const rem = Math.max(0, (Number(it.qty) || 0) - delivered);
                    return (
                      <tr
                        key={it.id}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          background: checked ? "#f0f9ff" : "#fff",
                        }}
                      >
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setBatchSelected((prev) => ({
                                ...prev,
                                [it.id]: e.target.checked,
                              }))
                            }
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ padding: "8px", fontWeight: 600 }}>
                          {it.name || "(Chưa nhập tên hàng)"}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>{it.unit}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>
                          {it.qty}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", color: delivered > 0 ? "#15803d" : "#64748b", fontWeight: 600 }}>
                          {delivered} (Còn: {rem})
                        </td>
                        <td style={{ padding: "8px", textAlign: "right" }}>
                          <input
                            type="number"
                            min="0"
                            max={it.qty}
                            disabled={!checked}
                            value={batchQty[it.id] ?? rem}
                            onChange={(e) =>
                              setBatchQty((prev) => ({
                                ...prev,
                                [it.id]: Number(e.target.value) || 0,
                              }))
                            }
                            style={{
                              width: "100%",
                              textAlign: "right",
                              fontWeight: 700,
                              padding: "4px 8px",
                              border: "1px solid #93c5fd",
                              borderRadius: "4px",
                              background: checked ? "#fff" : "#f1f5f9",
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          <input
                            type="date"
                            disabled={!checked}
                            value={batchItemDate[it.id] || batchDeliveryDate}
                            onChange={(e) =>
                              setBatchItemDate((prev) => ({
                                ...prev,
                                [it.id]: e.target.value,
                              }))
                            }
                            style={{
                              width: "100%",
                              padding: "4px 6px",
                              fontSize: "12px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              background: checked ? "#fff" : "#f1f5f9",
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          {delivered > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextItems = items.map((x) =>
                                  x.id === it.id
                                    ? {
                                        ...x,
                                        deliveredQty: 0,
                                        deliveryDate: "",
                                        deliveryStatus: "Chưa giao" as const,
                                        deliveryHistory: [],
                                      }
                                    : x
                                );
                                onUpdate({ ...po, items: nextItems });
                                setBatchQty((prev) => ({ ...prev, [it.id]: Number(it.qty) || 0 }));
                              }}
                              style={{
                                fontSize: "11px",
                                padding: "2px 6px",
                                background: "#fff5f5",
                                border: "1px solid #fca5a5",
                                color: "#dc2626",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                              title="Xóa lịch sử đã giao của dòng này về 0"
                            >
                              Xóa đã giao
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setShowDeliveryModal(false)}
                style={{
                  height: "36px",
                  padding: "0 16px",
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelivery}
                style={{
                  height: "36px",
                  padding: "0 18px",
                  background: "#0284c7",
                  border: "1px solid #0369a1",
                  color: "#fff",
                  borderRadius: "6px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✓ Xác nhận Giao hàng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP LẤY HÀNG HÓA TỪ ĐỀ NGHỊ PHÊ DUYỆT (ĐNPĐ) */}
      {showImportApprovalModal && (
        <div
          className="payment-modal-overlay"
          onClick={() => setShowImportApprovalModal(false)}
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
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "10px",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "80vh",
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
                        {req.prNumber || req.requestNumber} — {req.title}
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
                      }}
                    >
                      📥 Lấy hàng vào PO
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
            }}
          >
            ← Quay lại danh sách PO
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
                }}
                onClick={() => onDelete(po)}
              >
                🗑 Xóa đơn PO
              </button>
            )}
            <button
              type="button"
              className="po-save-btn"
              disabled={saving}
              onClick={() => void handleManualSave(false)}
            >
              {saving ? "⏳ Đang lưu..." : "💾 Lưu thông tin PO"}
            </button>
            <button
              type="button"
              className="po-save-back-btn"
              disabled={saving}
              onClick={() => void handleManualSave(true)}
            >
              ✓ Lưu & Quay lại danh sách
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

