"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PO, PaymentHandoverItem } from "../types";
import {
  getPODeliveryBatches,
  updatePOHandoverBatch,
  deletePOHandoverBatch,
  PODeliveryBatch,
  UpdateBatchItemPayload,
} from "../utils/handoverBatches";
import { dateVN } from "../utils";
import { useIsMobile } from "../useIsMobile";

interface POHandoverBatchSectionProps {
  po: PO | null;
  paymentHandovers: PaymentHandoverItem[];
  onUpdateHandovers: (updatedHandovers: PaymentHandoverItem[]) => void;
  onUpdatePO: (updatedPO: PO) => void;
  onPrintBatch?: (batch: PODeliveryBatch) => void;
  readOnly?: boolean;
  defaultExpandedBatchId?: string | null;
  alwaysShowEmptyNotice?: boolean;
}

export function POHandoverBatchSection({
  po,
  paymentHandovers,
  onUpdateHandovers,
  onUpdatePO,
  onPrintBatch,
  readOnly = false,
  defaultExpandedBatchId = null,
  alwaysShowEmptyNotice = false,
}: POHandoverBatchSectionProps) {
  const isMobile = useIsMobile(768);

  // Lấy danh sách các đợt bàn giao của PO (kết hợp cả paymentHandovers và deliveryHistory)
  const batches = useMemo(() => {
    return getPODeliveryBatches(po, paymentHandovers);
  }, [po, paymentHandovers]);

  // Đợt đang được chọn để xem/sửa danh mục
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(defaultExpandedBatchId);

  // Form state cho đợt đang mở
  const [editQtyMap, setEditQtyMap] = useState<Record<number, number>>({});
  const [editNoteMap, setEditNoteMap] = useState<Record<number, string>>({});
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  const activeBatch = useMemo(() => {
    if (!selectedBatchId) return null;
    return batches.find((b) => b.batchId === selectedBatchId) || null;
  }, [batches, selectedBatchId]);

  // Khởi tạo giá trị khi chọn một đợt
  useEffect(() => {
    if (activeBatch) {
      const qMap: Record<number, number> = {};
      const nMap: Record<number, string> = {};
      activeBatch.items.forEach((it) => {
        qMap[it.handoverItem.id] = it.currentQuantityPass;
        nMap[it.handoverItem.id] = it.note || "";
      });
      setEditQtyMap(qMap);
      setEditNoteMap(nMap);
      setSaveSuccessMsg(null);
      setSaveErrorMsg(null);
    }
  }, [selectedBatchId]);

  if (!po) return null;

  if (batches.length === 0) {
    if (!alwaysShowEmptyNotice) return null;
    return (
      <div
        style={{
          margin: "12px 0",
          padding: "12px 16px",
          borderRadius: "8px",
          border: "1px dashed #cbd5e1",
          background: "#f8fafc",
          color: "#64748b",
          fontSize: "12.5px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>📦</span>
        <span>Chưa có đợt giao nhận / bàn giao nào được ghi nhận cho đơn hàng #{po.number}.</span>
      </div>
    );
  }

  // Kiểm tra có lỗi validation trong form đợt đang mở không
  const hasValidationError = Boolean(
    activeBatch &&
      activeBatch.items.some((it) => {
        const val = editQtyMap[it.handoverItem.id];
        if (val === undefined || isNaN(val) || val < 0) return true;
        if (val > it.maxAllowedInThisBatch) return true;
        return false;
      })
  );

  // Kiểm tra có thay đổi so với dữ liệu gốc không
  const hasChanges = Boolean(
    activeBatch &&
      activeBatch.items.some((it) => {
        const currentVal = editQtyMap[it.handoverItem.id];
        const currentNote = editNoteMap[it.handoverItem.id] ?? "";
        return (
          currentVal !== it.currentQuantityPass ||
          currentNote.trim() !== (it.note || "").trim()
        );
      })
  );

  const handleSelectBatch = (batchId: string) => {
    if (selectedBatchId === batchId) {
      setSelectedBatchId(null);
    } else {
      setSelectedBatchId(batchId);
    }
  };

  const handleResetBatch = () => {
    if (activeBatch) {
      const qMap: Record<number, number> = {};
      const nMap: Record<number, string> = {};
      activeBatch.items.forEach((it) => {
        qMap[it.handoverItem.id] = it.currentQuantityPass;
        nMap[it.handoverItem.id] = it.note || "";
      });
      setEditQtyMap(qMap);
      setEditNoteMap(nMap);
      setSaveErrorMsg(null);
      setSaveSuccessMsg(null);
    }
  };

  // LƯU CHỈNH SỬA SỐ LƯỢNG ĐỢT
  const handleSaveActiveBatch = () => {
    if (!po || !activeBatch || readOnly || hasValidationError) return;

    const payloadItems: UpdateBatchItemPayload[] = activeBatch.items.map((it) => ({
      id: it.handoverItem.id,
      quantity_pass: editQtyMap[it.handoverItem.id] ?? it.currentQuantityPass,
      note: editNoteMap[it.handoverItem.id] ?? it.note,
    }));

    const result = updatePOHandoverBatch({
      po,
      allHandovers: paymentHandovers,
      batchId: activeBatch.batchId,
      updatedItems: payloadItems,
    });

    if (result.error) {
      setSaveErrorMsg(result.error);
      setSaveSuccessMsg(null);
      return;
    }

    onUpdateHandovers(result.updatedHandovers);
    onUpdatePO(result.updatedPO);

    setSaveErrorMsg(null);
    setSaveSuccessMsg(`✓ Đã cập nhật thành công số lượng bàn giao ${activeBatch.batchLabel}!`);
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 4000);
  };

  // HỦY / XÓA ĐỢT GIAO HÀNG (DO ẤN NHẦM HOẶC MUỐN THU HỒI)
  const handleDeleteBatch = (batchToDelete: PODeliveryBatch) => {
    if (!po || readOnly) return;

    const confirmed = window.confirm(
      `⚠️ BẠN CÓ CHẮC CHẮN MUỐN HỦY / XÓA ${batchToDelete.batchLabel}?\n\n` +
      `• Ngày bàn giao: ${dateVN(batchToDelete.date)}\n` +
      `• Bộ phận nhận: ${batchToDelete.department || "Chưa ghi"}\n` +
      `• Tổng số lượng: ${batchToDelete.totalQuantity} sản phẩm (${batchToDelete.itemCount} dòng hàng)\n\n` +
      `👉 Thao tác này sẽ hoàn trả số lượng đã giao của đợt này về PO và tự động cập nhật lại tiến độ đơn hàng.`
    );

    if (!confirmed) return;

    const result = deletePOHandoverBatch({
      po,
      allHandovers: paymentHandovers,
      batchId: batchToDelete.batchId,
    });

    if (result.error) {
      setSaveErrorMsg(result.error);
      setSaveSuccessMsg(null);
      return;
    }

    onUpdateHandovers(result.updatedHandovers);
    onUpdatePO(result.updatedPO);

    if (selectedBatchId === batchToDelete.batchId) {
      setSelectedBatchId(null);
    }
    setSaveErrorMsg(null);
    setSaveSuccessMsg(`✓ Đã hủy thành công ${batchToDelete.batchLabel}. Số lượng đã được hoàn trả về PO!`);
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 4500);
  };

  return (
    <div
      className="po-handover-batch-section"
      style={{
        margin: "12px 0",
        borderRadius: "10px",
        border: "1.5px solid #cbd5e1",
        background: "#ffffff",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {/* Header thống kê các đợt bàn giao */}
      <div
        style={{
          padding: "10px 14px",
          background: "#f1f5f9",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>📦</span>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
            Lịch sử & Thống kê các đợt giao hàng trong PO ({batches.length} đợt)
          </span>
          <span
            style={{
              fontSize: "11.5px",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "12px",
              background: "#dbeafe",
              color: "#1d4ed8",
            }}
          >
            Đã giao: {batches.reduce((sum, b) => sum + b.totalQuantity, 0)} SP
          </span>
        </div>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          💡 <i>Bấm vào từng đợt để xem danh mục, sửa số lượng hoặc hủy đợt nếu ấn nhầm</i>
        </div>
      </div>

      {/* Thông báo Thành công / Lỗi ở cấp Section */}
      {saveSuccessMsg && (
        <div
          style={{
            margin: "8px 14px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            color: "#166534",
            fontSize: "12.5px",
            fontWeight: 600,
          }}
        >
          {saveSuccessMsg}
        </div>
      )}

      {saveErrorMsg && (
        <div
          style={{
            margin: "8px 14px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "12.5px",
            fontWeight: 600,
          }}
        >
          ⚠️ {saveErrorMsg}
        </div>
      )}

      {/* Danh sách thẻ các đợt bàn giao */}
      <div
        style={{
          padding: "10px 14px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : `repeat(auto-fit, minmax(250px, 1fr))`,
          gap: "10px",
          background: "#f8fafc",
          borderBottom: activeBatch ? "1px solid #cbd5e1" : "none",
        }}
      >
        {batches.map((batch) => {
          const isSelected = selectedBatchId === batch.batchId;
          return (
            <div
              key={batch.batchId}
              onClick={() => handleSelectBatch(batch.batchId)}
              style={{
                cursor: "pointer",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1.5px solid ${isSelected ? "#2563eb" : "#cbd5e1"}`,
                background: isSelected ? "#eff6ff" : "#ffffff",
                boxShadow: isSelected
                  ? "0 4px 12px rgba(37, 99, 235, 0.15)"
                  : "0 1px 2px rgba(0,0,0,0.04)",
                transition: "all 0.2s ease",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "13.5px",
                    color: isSelected ? "#1d4ed8" : "#0f172a",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span>🏷️</span> {batch.batchLabel}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: isSelected ? "#bfdbfe" : "#e2e8f0",
                      color: isSelected ? "#1e40af" : "#475569",
                    }}
                  >
                    {batch.totalQuantity} SP · {batch.itemCount} dòng
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBatch(batch);
                      }}
                      title={`Hủy / Xóa ${batch.batchLabel}`}
                      style={{
                        padding: "2px 6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        borderRadius: "4px",
                        border: "1px solid #fca5a5",
                        background: "#fff5f5",
                        color: "#dc2626",
                        cursor: "pointer",
                      }}
                    >
                      🗑️ Hủy
                    </button>
                  )}
                </div>
              </div>

              <div style={{ fontSize: "11.5px", color: "#475569", display: "flex", flexDirection: "column", gap: "2px" }}>
                <div>
                  📅 <b>Ngày:</b> {dateVN(batch.date)}
                </div>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  🏢 <b>Bộ phận:</b> {batch.department || "Chưa ghi"}
                </div>
                {batch.receiverName && (
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    👤 <b>Người nhận:</b> {batch.receiverName}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: "8px",
                  paddingTop: "6px",
                  borderTop: `1px dashed ${isSelected ? "#93c5fd" : "#e2e8f0"}`,
                  fontSize: "11px",
                  fontWeight: 600,
                  color: isSelected ? "#1d4ed8" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{isSelected ? "▲ Đang mở xem & chỉnh sửa" : "▼ Bấm để xem & sửa số lượng"}</span>
                {isSelected && <span>✏️</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Panel chi tiết và chỉnh sửa số lượng của đợt đang mở */}
      {activeBatch && (
        <div
          style={{
            padding: isMobile ? "12px 10px" : "14px 16px",
            background: "#ffffff",
          }}
        >
          {/* Header của panel đợt */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "12px",
              paddingBottom: "8px",
              borderBottom: "1.5px solid #e2e8f0",
            }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>📋</span> Danh mục hàng hóa {activeBatch.batchLabel} ({dateVN(activeBatch.date)}) - {activeBatch.department}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                Chỉnh sửa số lượng bàn giao thực tế của đợt này hoặc bấm nút Hủy đợt nếu ấn nhầm.
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDeleteBatch(activeBatch)}
                  style={{
                    padding: "5px 12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#fef2f2",
                    border: "1.5px solid #f87171",
                    borderRadius: "6px",
                    color: "#dc2626",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  title="Hủy đợt giao này và hoàn trả lại số lượng cho PO"
                >
                  <span>🗑️ Hủy đợt này</span>
                </button>
              )}
              {onPrintBatch && (
                <button
                  type="button"
                  onClick={() => onPrintBatch(activeBatch)}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    color: "#334155",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span>🖨️ In biên bản</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBatchId(null)}
                style={{
                  padding: "5px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          {/* Bảng danh mục sản phẩm của đợt */}
          {isMobile ? (
            /* Mobile View: thẻ từng sản phẩm */
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {activeBatch.items.map((it, idx) => {
                const currentVal = editQtyMap[it.handoverItem.id] ?? it.currentQuantityPass;
                const isOver = currentVal > it.maxAllowedInThisBatch;

                return (
                  <div
                    key={it.handoverItem.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1.5px solid ${isOver ? "#ef4444" : "#e2e8f0"}`,
                      background: isOver ? "#fff5f5" : "#ffffff",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a" }}>
                      {idx + 1}. {it.itemName}
                    </div>
                    {it.spec && <div style={{ fontSize: "11px", color: "#64748b" }}>{it.spec}</div>}

                    <div style={{ marginTop: "6px", fontSize: "11.5px", color: "#475569", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <div>Tổng đặt PO: <b>{it.quantityOrdered}</b> {it.unit}</div>
                      <div>Đợt khác đã giao: <b>{it.deliveredFromOtherBatches}</b> {it.unit}</div>
                      <div style={{ color: "#166534", fontWeight: 600 }}>Tối đa đợt này: <b>{it.maxAllowedInThisBatch}</b> {it.unit}</div>
                    </div>

                    <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a", minWidth: "105px" }}>
                        SL Bàn giao:
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={it.maxAllowedInThisBatch}
                        placeholder="0"
                        disabled={readOnly}
                        value={currentVal === 0 ? "" : currentVal}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : (Number(e.target.value) || 0);
                          setEditQtyMap((prev) => ({ ...prev, [it.handoverItem.id]: val }));
                        }}
                        style={{
                          flex: 1,
                          height: "36px",
                          textAlign: "right",
                          fontWeight: 700,
                          fontSize: "14px",
                          borderRadius: "6px",
                          padding: "0 8px",
                          border: isOver ? "2px solid #ef4444" : "1.5px solid #3b82f6",
                          color: isOver ? "#ef4444" : "#0f172a",
                        }}
                      />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>{it.unit}</span>
                    </div>

                    {isOver && (
                      <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: 700, color: "#ef4444", textAlign: "right" }}>
                        ⚠️ Vượt quá mức tối đa ({it.maxAllowedInThisBatch} {it.unit})
                      </div>
                    )}

                    <div style={{ marginTop: "6px" }}>
                      <input
                        type="text"
                        placeholder="Ghi chú đợt giao..."
                        disabled={readOnly}
                        value={editNoteMap[it.handoverItem.id] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditNoteMap((prev) => ({ ...prev, [it.handoverItem.id]: val }));
                        }}
                        style={{
                          width: "100%",
                          height: "32px",
                          fontSize: "12px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          padding: "0 8px",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop View: Bảng dữ liệu */
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1.5px solid #cbd5e1" }}>
                    <th style={{ padding: "8px", width: "40px", textAlign: "center" }}>STT</th>
                    <th style={{ padding: "8px", minWidth: "220px" }}>Tên hàng hóa / Quy cách</th>
                    <th style={{ padding: "8px", width: "65px", textAlign: "center" }}>ĐVT</th>
                    <th style={{ padding: "8px", width: "85px", textAlign: "right" }}>Tổng PO</th>
                    <th style={{ padding: "8px", width: "95px", textAlign: "right" }}>Đợt khác đã giao</th>
                    <th style={{ padding: "8px", width: "95px", textAlign: "right", color: "#166534" }}>Tối đa đợt này</th>
                    <th style={{ padding: "8px", width: "140px", textAlign: "right", color: "#1d4ed8" }}>
                      SL Bàn giao đợt này ✏️
                    </th>
                    <th style={{ padding: "8px", minWidth: "150px" }}>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBatch.items.map((it, idx) => {
                    const currentVal = editQtyMap[it.handoverItem.id] ?? it.currentQuantityPass;
                    const isOver = currentVal > it.maxAllowedInThisBatch;

                    return (
                      <tr
                        key={it.handoverItem.id}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          background: isOver ? "#fff5f5" : idx % 2 === 0 ? "#ffffff" : "#fbfcfe",
                        }}
                      >
                        <td style={{ padding: "8px", textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                        <td style={{ padding: "8px" }}>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>{it.itemName}</div>
                          {it.spec && <div style={{ fontSize: "11px", color: "#64748b" }}>{it.spec}</div>}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", color: "#475569" }}>{it.unit}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 600, color: "#475569" }}>
                          {it.quantityOrdered}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", color: "#64748b" }}>
                          {it.deliveredFromOtherBatches}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: "#166534" }}>
                          {it.maxAllowedInThisBatch}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <input
                            type="number"
                            min={0}
                            max={it.maxAllowedInThisBatch}
                            placeholder="0"
                            disabled={readOnly}
                            value={currentVal === 0 ? "" : currentVal}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : (Number(e.target.value) || 0);
                              setEditQtyMap((prev) => ({ ...prev, [it.handoverItem.id]: val }));
                            }}
                            style={{
                              width: "100%",
                              height: "32px",
                              textAlign: "right",
                              fontWeight: 700,
                              fontSize: "13px",
                              borderRadius: "4px",
                              padding: "0 6px",
                              border: isOver ? "2px solid #ef4444" : "1.5px solid #3b82f6",
                              color: isOver ? "#ef4444" : "#0f172a",
                              background: isOver ? "#fef2f2" : "#ffffff",
                            }}
                          />
                          {isOver && (
                            <div style={{ color: "#ef4444", fontSize: "10px", fontWeight: 700, marginTop: "2px" }}>
                              ⚠ Tối đa {it.maxAllowedInThisBatch}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="text"
                            placeholder="Ghi chú đợt giao..."
                            disabled={readOnly}
                            value={editNoteMap[it.handoverItem.id] || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditNoteMap((prev) => ({ ...prev, [it.handoverItem.id]: val }));
                            }}
                            style={{
                              width: "100%",
                              height: "32px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              border: "1px solid #cbd5e1",
                              padding: "0 6px",
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Action buttons cho đợt */}
          {!readOnly && (
            <div
              style={{
                marginTop: "14px",
                paddingTop: "10px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "12px", color: hasChanges ? "#2563eb" : "#64748b", fontWeight: 600 }}>
                {hasChanges
                  ? "✎ Có thay đổi số lượng/ghi chú chưa lưu."
                  : "Dữ liệu đợt này đang trùng khớp với hệ thống."}
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => handleDeleteBatch(activeBatch)}
                  style={{
                    height: "34px",
                    padding: "0 14px",
                    fontSize: "12px",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1.5px solid #f87171",
                    background: "#fef2f2",
                    color: "#dc2626",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                  title="Hủy đợt giao này và hoàn trả lại số lượng cho PO"
                >
                  <span>🗑️ Hủy đợt này</span>
                </button>

                {hasChanges && (
                  <button
                    type="button"
                    onClick={handleResetBatch}
                    style={{
                      height: "34px",
                      padding: "0 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      color: "#475569",
                      cursor: "pointer",
                    }}
                  >
                    Khôi phục
                  </button>
                )}

                <button
                  type="button"
                  disabled={!hasChanges || hasValidationError}
                  onClick={handleSaveActiveBatch}
                  style={{
                    height: "34px",
                    padding: "0 16px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "none",
                    background: !hasChanges || hasValidationError ? "#94a3b8" : "#16a34a",
                    color: "#ffffff",
                    cursor: !hasChanges || hasValidationError ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    boxShadow: hasChanges && !hasValidationError ? "0 2px 6px rgba(22, 163, 74, 0.3)" : "none",
                  }}
                >
                  <span>💾 Lưu số lượng {activeBatch.batchLabel}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
