"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PO, POItem, PR, Supplier, PaymentHandoverItem, isContractPO } from "../types";
import { localToday, normName } from "../payment-utils";
import { fmt, dateVN } from "../utils";
import { useIsMobile } from "../useIsMobile";

const DEFAULT_DEPARTMENT_SUGGESTIONS = [
  "Phòng Kỹ thuật",
  "Phòng Sản xuất",
  "Phòng QA/QC",
  "Phòng Cung ứng",
  "Phòng Kho vận / Kho",
  "Phòng R&D",
  "Phòng Hành chính - Nhân sự",
  "Phòng Kế toán",
  "Ban Quản lý Dự án",
  "Phòng Kinh doanh",
];

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
}

export function POHandoverPickerModal({
  po,
  isOpen,
  onClose,
  onConfirm,
  prs = [],
  suppliers = [],
  existingHandovers = [],
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

  // Department suggestions list
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    if (linkedPR?.department?.trim()) set.add(linkedPR.department.trim());
    DEFAULT_DEPARTMENT_SUGGESTIONS.forEach((d) => set.add(d));
    prs.forEach((p) => {
      if (p.department?.trim()) set.add(p.department.trim());
    });
    existingHandovers.forEach((h) => {
      if (h.department?.trim()) set.add(h.department.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [linkedPR, prs, existingHandovers]);

  // Form states
  const [department, setDepartment] = useState<string>("");
  const [handoverDate, setHandoverDate] = useState<string>("");
  const [senderName, setSenderName] = useState<string>("Trần Hải Hà");
  const [receiverName, setReceiverName] = useState<string>("");
  const [selectedMap, setSelectedMap] = useState<Record<number, boolean>>({});
  const [qtyDocMap, setQtyDocMap] = useState<Record<number, number>>({});
  const [qtyPassMap, setQtyPassMap] = useState<Record<number, number>>({});
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});

  // Reset when opening
  useEffect(() => {
    if (isOpen && po) {
      const today = localToday();
      const defaultDept = linkedPR?.department || "Phòng Cung ứng";
      setDepartment(defaultDept);
      setHandoverDate(today);
      setSenderName("Trần Hải Hà");
      setReceiverName("");

      const initSel: Record<number, boolean> = {};
      const initDoc: Record<number, number> = {};
      const initPass: Record<number, number> = {};
      const initNote: Record<number, string> = {};

      (po.items || []).forEach((it) => {
        const totalQty = Number(it.qty) || 0;
        const deliv = Number(it.deliveredQty) || 0;
        initSel[it.id] = true;
        initDoc[it.id] = totalQty;
        initPass[it.id] = deliv > 0 ? deliv : totalQty;
        initNote[it.id] = it.note || "";
      });

      setSelectedMap(initSel);
      setQtyDocMap(initDoc);
      setQtyPassMap(initPass);
      setNoteMap(initNote);
    }
  }, [isOpen, po, linkedPR]);

  if (!isOpen || !po) return null;

  const items = po.items || [];
  const selectedCount = items.filter((it) => selectedMap[it.id]).length;
  const docTypeLabel = isContractPO(po) ? "Hợp đồng" : "PO";

  const handleSelectAll = (val: boolean) => {
    const next: Record<number, boolean> = {};
    items.forEach((it) => {
      next[it.id] = val;
    });
    setSelectedMap(next);
  };

  const handleConfirm = () => {
    const chosenItems = items.filter((it) => selectedMap[it.id]);
    if (chosenItems.length === 0) {
      alert("Vui lòng chọn ít nhất 1 mặt hàng để bàn giao!");
      return;
    }
    const cleanDept = department.trim();
    if (!cleanDept) {
      alert("Vui lòng chọn hoặc nhập Bộ phận nhận bàn giao!");
      return;
    }

    const payloadItems: HandoverConfirmedItem[] = chosenItems.map((it) => {
      const qDoc = qtyDocMap[it.id] ?? Number(it.qty) ?? 0;
      const qPass = qtyPassMap[it.id] ?? Number(it.deliveredQty) ?? qDoc;
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
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.65)",
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          width: isMobile ? "100vw" : "min(860px, 96vw)",
          maxHeight: isMobile ? "92vh" : "88vh",
          borderRadius: isMobile ? "16px 16px 0 0" : "12px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)",
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
              <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc" }}>
                Bàn giao hàng hóa từ {docTypeLabel} {po.number}
              </h3>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                {supplier?.name ? `NCC: ${supplier.name}` : "Chọn mặt hàng và bộ phận tiếp nhận"}
                {po.prNumber ? ` · Theo ${po.prNumber}` : ""}
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

        {/* General Settings: Bộ phận nhận, Ngày bàn giao, Người giao/nhận */}
        <div
          style={{
            padding: "14px 18px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr",
            gap: "12px",
            flexShrink: 0,
          }}
        >
          {/* Bộ phận nhận bàn giao */}
          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
              🏢 Bộ phận nhận bàn giao <b style={{ color: "#dc2626" }}>*</b>:
            </label>
            <input
              type="text"
              list="handover-dept-options"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Chọn hoặc nhập bộ phận tiếp nhận..."
              style={{
                width: "100%",
                height: "38px",
                padding: "0 10px",
                fontSize: "13.5px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1.5px solid #93c5fd",
                background: "#ffffff",
                color: "#0f172a",
                outline: "none",
              }}
            />
            <datalist id="handover-dept-options">
              {departmentOptions.map((dept, idx) => (
                <option key={idx} value={dept} />
              ))}
            </datalist>
          </div>

          {/* Ngày bàn giao */}
          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
              📅 Ngày bàn giao:
            </label>
            <input
              type="date"
              value={handoverDate}
              onChange={(e) => setHandoverDate(e.target.value)}
              style={{
                width: "100%",
                height: "38px",
                padding: "0 10px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
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
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder="Họ tên người nhận (nếu có)..."
              style={{
                width: "100%",
                height: "38px",
                padding: "0 10px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
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
            Tích chọn mặt hàng bàn giao ({selectedCount}/{items.length} mặt hàng)
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
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
              ☑️ Chọn tất cả
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
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
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
              PO này chưa có mặt hàng nào.
            </div>
          ) : isMobile ? (
            /* Mobile Cards */
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((it, idx) => {
                const isChecked = Boolean(selectedMap[it.id]);
                const qDoc = qtyDocMap[it.id] ?? Number(it.qty) ?? 0;
                const qPass = qtyPassMap[it.id] ?? Number(it.deliveredQty) ?? qDoc;

                return (
                  <div
                    key={it.id}
                    style={{
                      border: `1.5px solid ${isChecked ? "#3b82f6" : "#e2e8f0"}`,
                      background: isChecked ? "#f0f9ff" : "#ffffff",
                      borderRadius: "8px",
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setSelectedMap((prev) => ({ ...prev, [it.id]: e.target.checked }))
                        }
                        style={{ width: "20px", height: "20px", marginTop: "2px", accentColor: "#0284c7" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                          {it.name}
                        </div>
                        {it.spec && <div style={{ fontSize: "11.5px", color: "#64748b" }}>{it.spec}</div>}
                        <div style={{ fontSize: "11.5px", color: "#475569", marginTop: "2px" }}>
                          ĐVT: <b>{it.unit || "Cái"}</b> · SL Đặt PO: <b>{it.qty}</b>
                          {it.deliveredQty > 0 ? ` · Đã giao: ${it.deliveredQty}` : ""}
                        </div>
                      </div>
                    </div>

                    {isChecked && (
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
                            SL Bàn giao thực tế:
                          </label>
                          <input
                            type="number"
                            value={qPass}
                            onChange={(e) =>
                              setQtyPassMap((prev) => ({ ...prev, [it.id]: Number(e.target.value) || 0 }))
                            }
                            style={{
                              width: "100%",
                              height: "36px",
                              textAlign: "right",
                              fontWeight: 700,
                              borderRadius: "6px",
                              border: "1.5px solid #16a34a",
                              padding: "0 8px",
                              color: "#166534",
                            }}
                          />
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
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "8px", width: "44px", textAlign: "center" }}>Chọn</th>
                  <th style={{ padding: "8px" }}>Tên hàng hóa / Quy cách</th>
                  <th style={{ padding: "8px", width: "70px", textAlign: "center" }}>ĐVT</th>
                  <th style={{ padding: "8px", width: "80px", textAlign: "right" }}>SL Đặt</th>
                  <th style={{ padding: "8px", width: "110px", textAlign: "right" }}>SL Chứng từ</th>
                  <th style={{ padding: "8px", width: "130px", textAlign: "right" }}>SL Bàn giao</th>
                  <th style={{ padding: "8px", width: "160px" }}>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const isChecked = Boolean(selectedMap[it.id]);
                  const qDoc = qtyDocMap[it.id] ?? Number(it.qty) ?? 0;
                  const qPass = qtyPassMap[it.id] ?? Number(it.deliveredQty) ?? qDoc;

                  return (
                    <tr
                      key={it.id}
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        background: isChecked ? "#f0f9ff" : "#ffffff",
                      }}
                    >
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSelectedMap((prev) => ({ ...prev, [it.id]: e.target.checked }))
                          }
                          style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#0284c7" }}
                        />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{it.name}</div>
                        {it.spec && <div style={{ fontSize: "11.5px", color: "#64748b" }}>{it.spec}</div>}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>{it.unit || "Cái"}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#64748b" }}>{it.qty}</td>
                      <td style={{ padding: "8px" }}>
                        <input
                          type="number"
                          disabled={!isChecked}
                          value={qDoc}
                          onChange={(e) =>
                            setQtyDocMap((prev) => ({ ...prev, [it.id]: Number(e.target.value) || 0 }))
                          }
                          style={{
                            width: "100%",
                            height: "32px",
                            textAlign: "right",
                            fontWeight: 600,
                            border: "1px solid #cbd5e1",
                            borderRadius: "4px",
                            padding: "0 6px",
                          }}
                        />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <input
                          type="number"
                          disabled={!isChecked}
                          value={qPass}
                          onChange={(e) =>
                            setQtyPassMap((prev) => ({ ...prev, [it.id]: Number(e.target.value) || 0 }))
                          }
                          style={{
                            width: "100%",
                            height: "32px",
                            textAlign: "right",
                            fontWeight: 700,
                            border: "1.5px solid #16a34a",
                            borderRadius: "4px",
                            padding: "0 6px",
                            color: "#166534",
                          }}
                        />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <input
                          type="text"
                          disabled={!isChecked}
                          value={noteMap[it.id] || ""}
                          placeholder="Ghi chú..."
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
            Đang chọn: <b style={{ color: "#0284c7" }}>{selectedCount}</b> mặt hàng
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: "38px",
                padding: "0 16px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontWeight: 600,
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleConfirm}
              style={{
                height: "38px",
                padding: "0 20px",
                borderRadius: "6px",
                border: "none",
                background: selectedCount > 0 ? "#16a34a" : "#cbd5e1",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "13.5px",
                cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: selectedCount > 0 ? "0 2px 8px rgba(22, 163, 74, 0.3)" : "none",
              }}
            >
              <span>✓ Xác nhận bàn giao ({selectedCount})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
