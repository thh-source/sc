"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PO, POItem, PR, Supplier, PaymentHandoverItem, isContractPO } from "../types";
import { localToday, normName } from "../payment-utils";
import { fmt, dateVN } from "../utils";
import { useIsMobile } from "../useIsMobile";
import { addNewDepartment, getUnifiedDepartments } from "../utils/departments";
import { calcPODeliveryStats, PODeliveryStats, POItemDeliveryStats } from "../utils/paymentSync";
import { POHandoverBatchSection } from "./POHandoverBatchSection";
import { PODeliveryBatch } from "../utils/handoverBatches";

export interface HandoverConfirmedItem {
  item: POItem;
  qtyDoc: number;
  qtyPass: number;
  department: string;
  note: string;
  handoverDate: string;
  senderName: string;
  receiverName: string;
}

interface POHandoverPickerModalProps {
  po: PO | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    items: HandoverConfirmedItem[];
    department: string;
    handoverDate: string;
    senderName: string;
    receiverName: string;
  }) => void;
  prs?: PR[];
  suppliers?: Supplier[];
  existingHandovers?: PaymentHandoverItem[];
  onOpenExistingHandoverPreview?: (po: PO) => void;
  onUpdateHandovers?: (handovers: PaymentHandoverItem[]) => void;
  onUpdatePO?: (po: PO) => void;
  onPrintBatch?: (batch: PODeliveryBatch) => void;
}

export function POHandoverPickerModal({
  po,
  isOpen,
  onClose,
  onConfirm,
  prs = [],
  suppliers = [],
  existingHandovers = [],
  onOpenExistingHandoverPreview,
  onUpdateHandovers,
  onUpdatePO,
  onPrintBatch,
}: POHandoverPickerModalProps) {
  const isMobile = useIsMobile(768);

  const linkedPR = useMemo(() => {
    if (!po?.prNumber) return null;
    return prs.find((p) => p.number === po.prNumber) || null;
  }, [po?.prNumber, prs]);

  const supplier = useMemo(() => {
    if (!po?.supplierId) return null;
    return suppliers.find((s) => Number(s.id) === Number(po.supplierId)) || null;
  }, [po?.supplierId, suppliers]);

  const [sysDepts, setSysDepts] = useState<string[]>(() => getUnifiedDepartments());

  useEffect(() => {
    const onDeptsUpdated = () => setSysDepts(getUnifiedDepartments());
    window.addEventListener("scm_departments_updated", onDeptsUpdated);
    return () => window.removeEventListener("scm_departments_updated", onDeptsUpdated);
  }, []);

  // Department suggestions list (loại bỏ Phòng Cung ứng vì Cung ứng là bên giao)
  const departmentOptions = useMemo(() => {
    const set = new Set<string>(sysDepts.filter((d) => d !== "Phòng Cung ứng"));
    if (linkedPR?.department?.trim() && linkedPR.department.trim() !== "Phòng Cung ứng") {
      set.add(linkedPR.department.trim());
    }
    return Array.from(set).filter(Boolean);
  }, [sysDepts, linkedPR]);

  // Form states
  const [department, setDepartment] = useState<string>("");
  const [handoverDate, setHandoverDate] = useState<string>("");
  const [senderName, setSenderName] = useState<string>("Trần Hải Hà");
  const [receiverName, setReceiverName] = useState<string>("");
  const [selectedMap, setSelectedMap] = useState<Record<number, boolean>>({});
  const [qtyDocMap, setQtyDocMap] = useState<Record<number, number>>({});
  const [qtyPassMap, setQtyPassMap] = useState<Record<number, number>>({});
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});

  // 1. Cơ chế tính toán Số lượng còn lại (Remaining Quantity Tracking)
  const deliveryStats: PODeliveryStats | null = useMemo(() => {
    if (!po) return null;
    return calcPODeliveryStats(po, existingHandovers);
  }, [po, existingHandovers]);

  const isFullyDelivered = deliveryStats?.isFullyDelivered ?? false;

  // Lọc các biên bản đã bàn giao từ PO này
  const existingHandoversForThisPO = useMemo(() => {
    if (!po?.number) return [];
    const cleanNum = po.number.trim().toLowerCase();
    return existingHandovers.filter(
      (h) => (h.source_number || "").trim().toLowerCase() === cleanNum
    );
  }, [po?.number, existingHandovers]);

  // Reset & Khởi tạo khi mở modal
  useEffect(() => {
    if (isOpen && po && deliveryStats) {
      const today = localToday();
      const defaultDept = (linkedPR?.department && linkedPR.department.trim() !== "Phòng Cung ứng")
        ? linkedPR.department.trim()
        : "";
      setDepartment(defaultDept);
      setHandoverDate(today);
      setSenderName("Trần Hải Hà");
      setReceiverName("");

      const initSel: Record<number, boolean> = {};
      const initDoc: Record<number, number> = {};
      const initPass: Record<number, number> = {};
      const initNote: Record<number, string> = {};

      (po.items || []).forEach((it) => {
        const stat = deliveryStats.itemsStats[it.id];
        const rem = stat ? stat.quantityRemaining : Math.max(0, Number(it.qty) || 0);

        // Chỉ tích chọn các mặt hàng còn hàng cần giao (rem > 0)
        initSel[it.id] = rem > 0;
        initDoc[it.id] = rem > 0 ? rem : Number(it.qty) || 0;
        // Mặc định điền sẵn bằng đúng quantity_remaining
        initPass[it.id] = rem;
        initNote[it.id] = "";
      });

      setSelectedMap(initSel);
      setQtyDocMap(initDoc);
      setQtyPassMap(initPass);
      setNoteMap(initNote);
    }
  }, [isOpen, po, linkedPR, deliveryStats]);

  if (!isOpen || !po) return null;

  const items = po.items || [];
  const selectedCount = items.filter((it) => selectedMap[it.id] && (deliveryStats?.itemsStats[it.id]?.quantityRemaining ?? 0) > 0).length;
  const isFromPR = po.id < 0 || po.status === "PR";
  const docTypeLabel = isContractPO(po) ? "Hợp đồng" : isFromPR ? "PR" : "PO";

  // Kiểm tra có dòng nào đã chọn nhưng số lượng không hợp lệ hay không
  const isAnySelectedInvalid = items.some((it) => {
    if (!selectedMap[it.id]) return false;
    const stat = deliveryStats?.itemsStats[it.id];
    const rem = stat ? stat.quantityRemaining : 0;
    if (rem <= 0) return true; // Không được chọn hàng đã giao đủ
    const qPass = qtyPassMap[it.id];
    return qPass === undefined || qPass === null || isNaN(qPass) || qPass < 1 || qPass > rem;
  });

  const isButtonDisabled = isFullyDelivered || selectedCount === 0 || isAnySelectedInvalid;

  const handleSelectAllRemaining = (val: boolean) => {
    const next: Record<number, boolean> = {};
    items.forEach((it) => {
      const stat = deliveryStats?.itemsStats[it.id];
      const rem = stat ? stat.quantityRemaining : 0;
      // Chỉ cho phép chọn các mặt hàng còn hàng cần giao (rem > 0)
      if (rem > 0) {
        next[it.id] = val;
      } else {
        next[it.id] = false;
      }
    });
    setSelectedMap(next);
  };

  const handleConfirm = () => {
    if (isFullyDelivered) {
      alert("Đơn hàng này đã được bàn giao đủ toàn bộ số lượng (100%). Không thể tạo thêm đợt bàn giao mới!");
      return;
    }

    const chosenItems = items.filter(
      (it) => selectedMap[it.id] && (deliveryStats?.itemsStats[it.id]?.quantityRemaining ?? 0) > 0
    );

    // BẮT BUỘC sắp xếp theo đúng thứ tự xuất hiện của dòng hàng trong PO gốc
    const poOrderMap = new Map((po.items || []).map((it, idx) => [it.id, idx]));
    chosenItems.sort((a, b) => (poOrderMap.get(a.id) ?? 9999) - (poOrderMap.get(b.id) ?? 9999));

    if (chosenItems.length === 0) {
      alert("Vui lòng chọn ít nhất 1 mặt hàng còn thiếu để bàn giao!");
      return;
    }

    const cleanDept = department.trim();
    if (!cleanDept || cleanDept === "Phòng Cung ứng") {
      alert("Vui lòng chọn hoặc nhập Bộ phận sử dụng nhận bàn giao (Bộ phận nhận không thể là Phòng Cung ứng)!");
      return;
    }

    // Validation chặn cứng: kiểm tra từng mặt hàng
    for (const it of chosenItems) {
      const stat = deliveryStats?.itemsStats[it.id];
      const rem = stat ? stat.quantityRemaining : 0;
      const qPass = qtyPassMap[it.id] ?? rem;
      if (qPass <= 0) {
        alert(`Số lượng bàn giao của "${it.name}" phải lớn hơn 0!`);
        return;
      }
      if (qPass > rem) {
        alert(
          `Số lượng bàn giao của "${it.name}" (${qPass} ${it.unit || "cái"}) vượt quá số lượng còn lại (${rem} ${it.unit || "cái"})!`
        );
        return;
      }
    }

    const payloadItems: HandoverConfirmedItem[] = chosenItems.map((it) => {
      const stat = deliveryStats?.itemsStats[it.id];
      const rem = stat ? stat.quantityRemaining : Number(it.qty) || 0;
      const qPass = Math.min(rem, Math.max(1, qtyPassMap[it.id] ?? rem));
      const qDoc = qtyDocMap[it.id] ?? qPass;
      return {
        item: it,
        qtyDoc: qDoc,
        qtyPass: qPass,
        department: cleanDept,
        note: noteMap[it.id] || "",
        handoverDate: handoverDate || localToday(),
        senderName: senderName || "Trần Hải Hà",
        receiverName: receiverName || "",
      };
    });

    onConfirm({
      items: payloadItems,
      department: cleanDept,
      handoverDate: handoverDate || localToday(),
      senderName: senderName || "Trần Hải Hà",
      receiverName: receiverName || "",
    });
    onClose();
  };

  return (
    <div
      className="po-handover-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : "16px",
      }}
    >
      <div
        className="po-handover-modal-card"
        style={{
          background: "#ffffff",
          width: isMobile ? "100vw" : "min(1280px, 96vw)",
          maxHeight: isMobile ? "94vh" : "90vh",
          borderRadius: isMobile ? "16px 16px 0 0" : "12px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px",
            background: "#0f172a",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>📋</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Lập Phiếu Bàn Giao Nội Bộ (Không qua kho)</span>
                <span style={{ fontSize: "12px", background: "#1e3a8a", color: "#bfdbfe", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                  {docTypeLabel} {po.number}
                </span>
              </h3>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Nhân viên mua hàng (Phòng Cung ứng) bàn giao trực tiếp cho Bộ phận sử dụng · Tự động đẩy dữ liệu sang <b>Tab Bàn giao</b>
                {linkedPR?.department ? ` · Đơn vị yêu cầu (PR): ${linkedPR.department}` : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "6px",
              border: 0,
              background: "#1e293b",
              color: "#94a3b8",
              fontSize: "20px",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Cảnh báo khi PO đã hoàn thành 100% */}
        {isFullyDelivered ? (
          <div
            style={{
              padding: "12px 18px",
              background: "#fef2f2",
              borderBottom: "1.5px solid #fecaca",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "22px" }}>🛡️</span>
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#991b1b" }}>
                  Đơn hàng này đã được bàn giao đủ toàn bộ số lượng (100%).
                </div>
                <div style={{ fontSize: "12px", color: "#b91c1c" }}>
                  Tất cả {deliveryStats?.totalItems} mặt hàng trong PO đã hoàn tất giao nhận. Không thể tạo thêm đợt bàn giao mới để chống giao vượt và tránh tạo dòng trùng lặp.
                </div>
              </div>
            </div>
            {existingHandoversForThisPO.length > 0 && onOpenExistingHandoverPreview && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenExistingHandoverPreview(po);
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  background: "#ffffff",
                  border: "1.5px solid #dc2626",
                  color: "#b91c1c",
                  borderRadius: "6px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>📄 Xem lại biên bản đã giao</span>
              </button>
            )}
          </div>
        ) : (
          /* Thanh tiến độ PO tổng thể */
          <div
            style={{
              padding: "10px 18px",
              background: "#f0fdf4",
              borderBottom: "1px solid #bbf7d0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
              fontSize: "12.5px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", fontWeight: 600 }}>
              <span>📦</span>
              <span>
                Tiến độ giao hàng: Đã giao <b>{deliveryStats?.totalQuantityDelivered}/{deliveryStats?.totalQuantityOrdered}</b> sản phẩm ({deliveryStats?.overallProgressPercent}%) · Còn thiếu <b>{deliveryStats?.totalQuantityRemaining}</b> sản phẩm ({deliveryStats ? deliveryStats.totalItems - deliveryStats.fullyDeliveredItemsCount : 0} mặt hàng).
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "120px",
                  height: "8px",
                  background: "#dcfce7",
                  borderRadius: "999px",
                  overflow: "hidden",
                  border: "1px solid #86efac",
                }}
              >
                <div
                  style={{
                    width: `${deliveryStats?.overallProgressPercent || 0}%`,
                    height: "100%",
                    background: "#16a34a",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <b style={{ color: "#166534", fontSize: "12px" }}>{deliveryStats?.overallProgressPercent}%</b>
            </div>
          </div>
        )}

        {/* General Settings: Bộ phận nhận, Ngày bàn giao, Người giao/nhận */}
        <div
          style={{
            padding: "12px 18px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr",
            gap: "12px",
            flexShrink: 0,
          }}
        >
          {/* Bộ phận sử dụng nhận bàn giao */}
          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
              🏢 Bộ phận sử dụng nhận bàn giao <b style={{ color: "#dc2626" }}>*</b>:
            </label>
            <select
              value={department}
              disabled={isFullyDelivered}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__ADD_NEW__") {
                  const name = window.prompt("Nhập tên / mã bộ phận mới để lưu vào hệ thống:", "");
                  if (name && name.trim()) {
                    addNewDepartment(name.trim());
                    setDepartment(name.trim());
                  }
                  return;
                }
                setDepartment(val);
              }}
              style={{
                width: "100%",
                height: "38px",
                padding: "0 10px",
                fontSize: "13.5px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1.5px solid #93c5fd",
                background: isFullyDelivered ? "#f1f5f9" : "#ffffff",
                color: "#0f172a",
                outline: "none",
                cursor: isFullyDelivered ? "not-allowed" : "pointer",
              }}
            >
              <option value="">-- Chọn bộ phận tiếp nhận --</option>
              {departmentOptions.map((dept, idx) => (
                <option key={idx} value={dept}>
                  {dept}
                </option>
              ))}
              <option value="__ADD_NEW__">＋ Thêm bộ phận / phòng ban mới...</option>
            </select>
          </div>

          {/* Ngày bàn giao */}
          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
              📅 Ngày bàn giao:
            </label>
            <input
              type="date"
              value={handoverDate}
              disabled={isFullyDelivered}
              onChange={(e) => setHandoverDate(e.target.value)}
              style={{
                width: "100%",
                height: "38px",
                padding: "0 10px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: isFullyDelivered ? "#f1f5f9" : "#ffffff",
                color: "#0f172a",
              }}
            />
          </div>

          {/* Người nhận bàn giao */}
          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
              👤 Người nhận đại diện:
            </label>
            <input
              type="text"
              value={receiverName}
              disabled={isFullyDelivered}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder="Họ tên người nhận (nếu có)..."
              style={{
                width: "100%",
                height: "38px",
                padding: "0 10px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: isFullyDelivered ? "#f1f5f9" : "#ffffff",
              }}
            />
          </div>
        </div>

        {/* Toolbar: Select All / Deselect All + Counter */}
        <div
          style={{
            padding: "8px 18px",
            background: "#eff6ff",
            borderBottom: "1px solid #bfdbfe",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a8a" }}>
            Tích chọn mặt hàng bàn giao đợt này ({selectedCount}/{items.filter((it) => (deliveryStats?.itemsStats[it.id]?.quantityRemaining ?? 0) > 0).length} mặt hàng còn thiếu)
          </div>
          {!isFullyDelivered && (
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => handleSelectAllRemaining(true)}
                style={{
                  height: "30px",
                  padding: "0 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#ffffff",
                  border: "1px solid #93c5fd",
                  borderRadius: "5px",
                  color: "#1d4ed8",
                  cursor: "pointer",
                }}
              >
                ☑️ Chọn tất cả còn thiếu
              </button>
              <button
                type="button"
                onClick={() => handleSelectAllRemaining(false)}
                style={{
                  height: "30px",
                  padding: "0 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                Bỏ chọn
              </button>
            </div>
          )}
        </div>

        {/* Main List of Items */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "12px 14px" : "14px 18px",
            background: "#ffffff",
          }}
        >
          {/* Thống kê từng đợt bàn giao trong PO và cho phép chỉnh sửa số lượng */}
          {onUpdateHandovers && onUpdatePO && (
            <div style={{ marginBottom: "16px" }}>
              <POHandoverBatchSection
                po={po}
                paymentHandovers={existingHandovers}
                onUpdateHandovers={onUpdateHandovers}
                onUpdatePO={onUpdatePO}
                onPrintBatch={onPrintBatch}
              />
            </div>
          )}
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
              PO này chưa có mặt hàng nào.
            </div>
          ) : isMobile ? (
            /* Mobile Cards */
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((it) => {
                const stat = deliveryStats?.itemsStats[it.id];
                const rem = stat ? stat.quantityRemaining : 0;
                const ordered = stat ? stat.quantityOrdered : (Number(it.qty) || 0);
                const delivered = stat ? stat.quantityDelivered : (Number(it.deliveredQty) || 0);
                const isItemDone = stat ? stat.isFullyDelivered : rem === 0;
                const isChecked = Boolean(selectedMap[it.id]) && !isItemDone;
                const qDoc = qtyDocMap[it.id] ?? rem;
                const qPass = qtyPassMap[it.id] ?? rem;
                const isOverLimit = qPass > rem;
                const isUnderLimit = qPass < 1;

                return (
                  <div
                    key={it.id}
                    style={{
                      border: `1.5px solid ${isItemDone ? "#86efac" : isChecked ? "#3b82f6" : "#e2e8f0"}`,
                      background: isItemDone ? "#f8fafc" : isChecked ? "#f0f9ff" : "#ffffff",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      opacity: isItemDone ? 0.75 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isItemDone || isFullyDelivered}
                        onChange={(e) =>
                          setSelectedMap((prev) => ({ ...prev, [it.id]: e.target.checked }))
                        }
                        style={{
                          width: "20px",
                          height: "20px",
                          marginTop: "2px",
                          accentColor: "#0284c7",
                          cursor: isItemDone ? "not-allowed" : "pointer",
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                          {it.name}
                        </div>
                        {it.spec && <div style={{ fontSize: "11.5px", color: "#64748b" }}>{it.spec}</div>}

                        {/* Status Badge */}
                        <div style={{ marginTop: "4px" }}>
                          {isItemDone ? (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#15803d",
                                background: "#dcfce7",
                                border: "1px solid #86efac",
                                padding: "2px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              ✓ Đã giao đủ ({delivered}/{ordered} {it.unit || "Cái"})
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: delivered > 0 ? "#b45309" : "#0369a1",
                                background: delivered > 0 ? "#fef3c7" : "#e0f2fe",
                                border: `1px solid ${delivered > 0 ? "#fde68a" : "#bae6fd"}`,
                                padding: "2px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              {delivered > 0
                                ? `⏳ Đã giao ${delivered}/${ordered} · Còn thiếu: ${rem} ${it.unit || "Cái"}`
                                : `📦 Chưa giao · Cần giao: ${rem} ${it.unit || "Cái"}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isChecked && !isItemDone && (
                      <div
                        style={{
                          marginTop: "8px",
                          paddingTop: "8px",
                          borderTop: "1px dashed #cbd5e1",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "8px",
                        }}
                      >
                        <div>
                          <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                            SL Chứng từ:
                          </label>
                          <input
                            type="number"
                            value={qDoc}
                            onChange={(e) =>
                              setQtyDocMap((prev) => ({ ...prev, [it.id]: Number(e.target.value) || 0 }))
                            }
                            style={{
                              width: "100%",
                              height: "36px",
                              textAlign: "right",
                              fontWeight: 700,
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              padding: "0 8px",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", color: "#166534", fontWeight: 700 }}>
                            SL Giao đợt này (Tối đa {rem}):
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={rem}
                            value={qPass}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setQtyPassMap((prev) => ({ ...prev, [it.id]: val }));
                            }}
                            onBlur={() => {
                              const current = qtyPassMap[it.id];
                              if (current === undefined || isNaN(current) || current < 1) {
                                setQtyPassMap((prev) => ({ ...prev, [it.id]: 1 }));
                              } else if (current > rem) {
                                setQtyPassMap((prev) => ({ ...prev, [it.id]: rem }));
                              }
                            }}
                            style={{
                              width: "100%",
                              height: "36px",
                              textAlign: "right",
                              fontWeight: 700,
                              borderRadius: "6px",
                              border: isOverLimit || isUnderLimit ? "1.5px solid #ef4444" : "1.5px solid #16a34a",
                              padding: "0 8px",
                              color: isOverLimit || isUnderLimit ? "#ef4444" : "#166534",
                            }}
                          />
                          {isOverLimit && (
                            <div style={{ color: "#ef4444", fontSize: "10.5px", fontWeight: 700, marginTop: "2px" }}>
                              ⚠ Vượt quá SL còn lại ({rem})
                            </div>
                          )}
                          {isUnderLimit && (
                            <div style={{ color: "#ef4444", fontSize: "10.5px", fontWeight: 700, marginTop: "2px" }}>
                              ⚠ Tối thiểu 1 {it.unit}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop Table */
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1.5px solid #e2e8f0" }}>
                  <th style={{ padding: "10px", width: "48px", textAlign: "center" }}>Chọn</th>
                  <th style={{ padding: "10px", minWidth: "260px" }}>Tên hàng hóa / Quy cách</th>
                  <th style={{ padding: "10px", width: "70px", textAlign: "center" }}>ĐVT</th>
                  <th style={{ padding: "10px", width: "95px", textAlign: "right" }}>SL Đặt PO</th>
                  <th style={{ padding: "10px", width: "110px", textAlign: "right" }}>Đã giao lũy kế</th>
                  <th style={{ padding: "10px", width: "100px", textAlign: "right" }}>Còn lại</th>
                  <th style={{ padding: "10px", width: "140px", textAlign: "right" }}>SL Giao đợt này</th>
                  <th style={{ padding: "10px", minWidth: "160px" }}>Ghi chú đợt giao</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const stat = deliveryStats?.itemsStats[it.id];
                  const rem = stat ? stat.quantityRemaining : 0;
                  const ordered = stat ? stat.quantityOrdered : (Number(it.qty) || 0);
                  const delivered = stat ? stat.quantityDelivered : (Number(it.deliveredQty) || 0);
                  const isItemDone = stat ? stat.isFullyDelivered : rem === 0;
                  const isChecked = Boolean(selectedMap[it.id]) && !isItemDone;
                  const qDoc = qtyDocMap[it.id] ?? rem;
                  const qPass = qtyPassMap[it.id] ?? rem;
                  const isOverLimit = qPass > rem;
                  const isUnderLimit = qPass < 1;

                  return (
                    <tr
                      key={it.id}
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        background: isItemDone ? "#f8fafc" : isChecked ? "#f0f9ff" : "#ffffff",
                        opacity: isItemDone ? 0.75 : 1,
                      }}
                    >
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isItemDone || isFullyDelivered}
                          onChange={(e) =>
                            setSelectedMap((prev) => ({ ...prev, [it.id]: e.target.checked }))
                          }
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: isItemDone || isFullyDelivered ? "not-allowed" : "pointer",
                            accentColor: "#0284c7",
                          }}
                        />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{it.name}</div>
                        {it.spec && <div style={{ fontSize: "11.5px", color: "#64748b" }}>{it.spec}</div>}
                        <div style={{ marginTop: "3px" }}>
                          {isItemDone ? (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "10.5px",
                                fontWeight: 700,
                                color: "#15803d",
                                background: "#dcfce7",
                                border: "1px solid #86efac",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              ✓ Đã giao đủ (100%)
                            </span>
                          ) : delivered > 0 ? (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "10.5px",
                                fontWeight: 700,
                                color: "#b45309",
                                background: "#fef3c7",
                                border: "1px solid #fde68a",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              ⏳ Giao một phần ({delivered}/{ordered})
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "10.5px",
                                fontWeight: 600,
                                color: "#0369a1",
                                background: "#e0f2fe",
                                border: "1px solid #bae6fd",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              📦 Chưa giao
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>{it.unit || "Cái"}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 600, color: "#475569" }}>
                        {ordered}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: delivered > 0 ? "#15803d" : "#94a3b8" }}>
                        {delivered}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: rem > 0 ? "#b45309" : "#15803d" }}>
                        {rem > 0 ? rem : <span style={{ color: "#16a34a" }}>0</span>}
                      </td>
                      <td style={{ padding: "8px" }}>
                        {isItemDone ? (
                          <div style={{ textAlign: "right", color: "#94a3b8", fontSize: "12px", fontStyle: "italic" }}>
                            Đã hoàn tất
                          </div>
                        ) : (
                          <div>
                            <input
                              type="number"
                              disabled={!isChecked || isFullyDelivered}
                              min={1}
                              max={rem}
                              value={qPass}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setQtyPassMap((prev) => ({ ...prev, [it.id]: val }));
                              }}
                              onBlur={() => {
                                const current = qtyPassMap[it.id];
                                if (current === undefined || isNaN(current) || current < 1) {
                                  setQtyPassMap((prev) => ({ ...prev, [it.id]: 1 }));
                                } else if (current > rem) {
                                  setQtyPassMap((prev) => ({ ...prev, [it.id]: rem }));
                                }
                              }}
                              style={{
                                width: "100%",
                                height: "32px",
                                textAlign: "right",
                                fontWeight: 700,
                                border: isOverLimit || isUnderLimit ? "1.5px solid #ef4444" : "1.5px solid #16a34a",
                                borderRadius: "4px",
                                padding: "0 6px",
                                color: isOverLimit || isUnderLimit ? "#ef4444" : "#166534",
                                background: !isChecked ? "#f1f5f9" : "#ffffff",
                              }}
                            />
                            {isOverLimit && isChecked && (
                              <div style={{ color: "#ef4444", fontSize: "10.5px", fontWeight: 700, marginTop: "2px", textAlign: "right" }}>
                                ⚠ Tối đa {rem} {it.unit}
                              </div>
                            )}
                            {isUnderLimit && isChecked && (
                              <div style={{ color: "#ef4444", fontSize: "10.5px", fontWeight: 700, marginTop: "2px", textAlign: "right" }}>
                                ⚠ Tối thiểu 1 {it.unit}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "8px" }}>
                        <input
                          type="text"
                          disabled={!isChecked || isItemDone || isFullyDelivered}
                          value={noteMap[it.id] || ""}
                          placeholder={isItemDone ? "Đã giao đủ" : "Ghi chú đợt giao..."}
                          onChange={(e) =>
                            setNoteMap((prev) => ({ ...prev, [it.id]: e.target.value }))
                          }
                          style={{
                            width: "100%",
                            height: "32px",
                            fontSize: "12px",
                            border: "1px solid #cbd5e1",
                            borderRadius: "4px",
                            padding: "0 6px",
                            background: !isChecked || isItemDone ? "#f1f5f9" : "#ffffff",
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "12px 18px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            gap: "10px",
          }}
        >
          <div style={{ fontSize: "12.5px", color: "#475569" }}>
            {isFullyDelivered ? (
              <span style={{ color: "#16a34a", fontWeight: 700 }}>
                ✓ Đơn hàng đã bàn giao đủ 100%. Không có mặt hàng nào cần giao tiếp.
              </span>
            ) : (
              <span>
                Đang chọn: <b style={{ color: "#0284c7" }}>{selectedCount}</b> mặt hàng còn thiếu để bàn giao đợt này
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", width: isMobile ? "100%" : "auto" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: isMobile ? "44px" : "38px",
                padding: "0 16px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontWeight: 600,
                color: "#475569",
                cursor: "pointer",
                flex: isMobile ? "0 0 75px" : undefined,
              }}
            >
              {isFullyDelivered ? "Đóng" : "Hủy"}
            </button>
            <button
              type="button"
              disabled={isButtonDisabled}
              onClick={handleConfirm}
              style={{
                height: isMobile ? "44px" : "38px",
                padding: isMobile ? "0 14px" : "0 20px",
                borderRadius: "8px",
                border: "none",
                background: isButtonDisabled ? "#94a3b8" : "#16a34a",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "13.5px",
                cursor: isButtonDisabled ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                boxShadow: isButtonDisabled ? "none" : "0 2px 8px rgba(22, 163, 74, 0.3)",
                flex: isMobile ? 1 : undefined,
              }}
            >
              {isFullyDelivered ? (
                <span>✓ Đã bàn giao đủ 100%</span>
              ) : isAnySelectedInvalid ? (
                <span>⚠ Vui lòng kiểm tra lại số lượng</span>
              ) : (
                <span>✓ Tạo phiếu & Chuyển sang tab Bàn giao ({selectedCount})</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
