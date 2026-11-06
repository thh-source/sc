"use client";

import React, { useState, useRef, useEffect, useMemo, ChangeEvent } from "react";
import { PO, POItem, PODeliveryLog, PaymentHandoverItem } from "../types";
import { POHandoverBatchSection } from "./POHandoverBatchSection";
import { fmt, dateVN } from "../utils";
import { useIsMobile } from "../useIsMobile";

const DISCREPANCY_PRESETS = [
  { id: "missing", label: "📦 Giao thiếu (hẹn bù sau)", color: "#b45309", bg: "#fef3c7" },
  { id: "damaged", label: "💔 Hàng hỏng / móp méo", color: "#b91c1c", bg: "#fee2e2" },
  { id: "wrong_spec", label: "📐 Sai quy cách / chủng loại", color: "#9333ea", bg: "#f3e8ff" },
  { id: "lacking_docs", label: "📄 Thiếu CO/CQ / Hóa đơn", color: "#0369a1", bg: "#e0f2fe" },
  { id: "excess", label: "➕ Giao dư (theo kiện)", color: "#15803d", bg: "#dcfce7" },
  { id: "partial", label: "⏳ Giao từng phần theo tiến độ", color: "#334155", bg: "#f1f5f9" },
];

export interface DeliveryConfirmPayload {
  selectedItems: {
    id: number;
    qty: number;
    date: string;
    reason?: string;
    note?: string;
  }[];
  senderName: string;
  receiverName: string;
  uploadedPhotoNames: string[];
  signatureDataUrl?: string;
  createHandoverAfter?: boolean;
}

interface PODeliveryModalProps {
  po: PO;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: DeliveryConfirmPayload) => void;
  workspaceId?: string;
  onStatus?: (msg: string) => void;
  hasHandoverFeature?: boolean;
  paymentHandovers?: PaymentHandoverItem[];
  onUpdateHandovers?: (handovers: PaymentHandoverItem[]) => void;
  onUpdatePO?: (po: PO) => void;
}

export function PODeliveryModal({
  po,
  isOpen,
  onClose,
  onConfirm,
  workspaceId,
  onStatus,
  hasHandoverFeature = true,
  paymentHandovers = [],
  onUpdateHandovers,
  onUpdatePO,
}: PODeliveryModalProps) {
  const isAutoMobile = useIsMobile(768);
  const [userViewMode, setUserViewMode] = useState<"mobile" | "table" | null>(null);
  const isMobile = userViewMode ? userViewMode === "mobile" : isAutoMobile;

  const items = po.items || [];
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Form State
  const [sharedDate, setSharedDate] = useState<string>(todayStr);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [itemQtys, setItemQtys] = useState<Record<number, number>>({});
  const [itemDates, setItemDates] = useState<Record<number, string>>({});
  const [itemReasons, setItemReasons] = useState<Record<number, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});

  // Signature & Parties
  const [senderName, setSenderName] = useState<string>("");
  const [receiverName, setReceiverName] = useState<string>("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");
  const [showSignatureDrawer, setShowSignatureDrawer] = useState<boolean>(false);
  const [isSignatureFullscreen, setIsSignatureFullscreen] = useState<boolean>(false);

  // Photos & Attachments
  const [uploadedPhotos, setUploadedPhotos] = useState<{ id: string; name: string; url?: string }[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);

  // Filter & Search
  const [filterMode, setFilterMode] = useState<"all" | "remaining" | "checked">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Bottom Sheet for Discrepancy Reason
  const [activeReasonItemId, setActiveReasonItemId] = useState<number | null>(null);

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      const initSel: Record<number, boolean> = {};
      const initQ: Record<number, number> = {};
      const initD: Record<number, string> = {};
      const initR: Record<number, string> = {};
      const initN: Record<number, string> = {};

      items.forEach((it) => {
        const delivered = Number(it.deliveredQty) || 0;
        const totalQty = Number(it.qty) || 0;
        const rem = Math.max(0, totalQty - delivered);
        initSel[it.id] = rem > 0;
        initQ[it.id] = rem > 0 ? rem : totalQty;
        initD[it.id] = todayStr;
        initR[it.id] = "";
        initN[it.id] = "";
      });

      setSelectedIds(initSel);
      setItemQtys(initQ);
      setItemDates(initD);
      setItemReasons(initR);
      setItemNotes(initN);
      setSharedDate(todayStr);
    }
  }, [isOpen, items, todayStr]);

  // Canvas Signature
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureDataUrl(canvas.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl("");
  };

  // Upload Photo direct to /api/files
  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    onStatus?.(`Đang tải ${files.length} ảnh chứng từ / hàng hóa...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "po");
      formData.append("entityId", String(po.id));
      if (workspaceId) formData.append("workspaceId", workspaceId);
      formData.append("documentType", "Biên bản giao nhận");
      formData.append("status", "Đã nhận");
      formData.append("note", `Ảnh giao nhận PO ${po.number} - ngày ${sharedDate}`);

      try {
        const res = await fetch("/api/files", { method: "POST", body: formData });
        if (res.ok) {
          const data = (await res.json()) as { id?: string | number };
          setUploadedPhotos((prev) => [
            ...prev,
            { id: String(data?.id || Date.now()), name: file.name, url: URL.createObjectURL(file) },
          ]);
        }
      } catch (err) {
        console.error("Lỗi tải ảnh:", err);
      }
    }
    setIsUploadingPhoto(false);
    onStatus?.(`✓ Đã lưu ảnh đính kèm`);
    e.target.value = "";
  };

  // Filtering items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const delivered = Number(it.deliveredQty) || 0;
      const orderQty = Number(it.qty) || 0;
      const rem = Math.max(0, orderQty - delivered);
      const isChecked = Boolean(selectedIds[it.id]);

      if (filterMode === "remaining" && rem <= 0) return false;
      if (filterMode === "checked" && !isChecked) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (it.name || "").toLowerCase();
        const code = (it.code || "").toLowerCase();
        const spec = (it.spec || "").toLowerCase();
        return name.includes(q) || code.includes(q) || spec.includes(q);
      }
      return true;
    });
  }, [items, selectedIds, filterMode, searchQuery]);

  // Totals & KPI
  const { checkedCount, totalDeliveryQty, totalDeliveryValue } = useMemo(() => {
    let count = 0;
    let qtySum = 0;
    let valSum = 0;
    items.forEach((it) => {
      if (selectedIds[it.id]) {
        const q = Number(itemQtys[it.id]) || 0;
        if (q > 0) {
          count++;
          qtySum += q;
          const price = Number(it.price) || 0;
          const vat = Number(it.vatRate) || 0;
          valSum += Math.round(q * price * (1 + vat / 100));
        }
      }
    });
    return { checkedCount: count, totalDeliveryQty: qtySum, totalDeliveryValue: valSum };
  }, [items, selectedIds, itemQtys]);

  const handleApplySharedDate = (newDate: string) => {
    setSharedDate(newDate);
    const nextDates: Record<number, string> = {};
    items.forEach((it) => {
      nextDates[it.id] = newDate;
    });
    setItemDates(nextDates);
  };

  const handleSelectAll = (val: boolean) => {
    const next: Record<number, boolean> = {};
    items.forEach((it) => {
      next[it.id] = val;
    });
    setSelectedIds(next);
  };

  const handleStepQty = (id: number, delta: number) => {
    setItemQtys((prev) => {
      const current = Number(prev[id]) || 0;
      const nextVal = Math.max(0, current + delta);
      return { ...prev, [id]: nextVal };
    });
    setSelectedIds((prev) => ({ ...prev, [id]: true }));
  };

  const handleFillRemaining = (it: POItem) => {
    const delivered = Number(it.deliveredQty) || 0;
    const orderQty = Number(it.qty) || 0;
    const rem = Math.max(0, orderQty - delivered);
    setItemQtys((prev) => ({ ...prev, [it.id]: rem }));
    setSelectedIds((prev) => ({ ...prev, [it.id]: true }));
  };

  const handleConfirmAction = (createHandoverAfter = false) => {
    const chosenList = items
      .filter((it) => selectedIds[it.id])
      .map((it) => ({
        id: it.id,
        qty: Number(itemQtys[it.id]) || 0,
        date: itemDates[it.id] || sharedDate || todayStr,
        reason: itemReasons[it.id],
        note: itemNotes[it.id],
      }))
      .filter((it) => it.qty > 0);

    if (chosenList.length === 0) {
      alert("Vui lòng tích chọn và nhập số lượng giao (> 0) cho ít nhất 1 mặt hàng!");
      return;
    }

    onConfirm({
      selectedItems: chosenList,
      senderName,
      receiverName,
      uploadedPhotoNames: uploadedPhotos.map((p) => p.name),
      signatureDataUrl: signatureDataUrl || undefined,
      createHandoverAfter,
    });
    onClose();
  };

  if (!isOpen) return null;

  const activeReasonItem = items.find((i) => i.id === activeReasonItemId);

  return (
    <div
      className="po-delivery-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : "16px",
      }}
    >
      <div
        className="po-delivery-modal-card"
        style={{
          background: "#ffffff",
          width: isMobile ? "100vw" : "min(1260px, 96vw)",
          height: isMobile ? "100dvh" : "90vh",
          maxHeight: isMobile ? "100dvh" : "920px",
          borderRadius: isMobile ? 0 : "12px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)",
          position: "relative",
        }}
      >
        {/* TOP HEADER */}
        <div
          style={{
            padding: isMobile ? "12px 14px" : "14px 20px",
            background: "#0f172a",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>🚚</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ fontSize: isMobile ? "15px" : "17px", color: "#f8fafc" }}>
                  Giao/Nhận hàng PO {po.number}
                </strong>
                <span
                  style={{
                    background: "#1e293b",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    color: "#94a3b8",
                  }}
                >
                  {items.length} mặt hàng
                </span>
              </div>
              <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "2px" }}>
                {po.supplierId ? `NCC: #${po.supplierId}` : "Nhập số lượng thực nhận tại hiện trường"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* View Mode Toggle */}
            <button
              type="button"
              onClick={() => setUserViewMode(isMobile ? "table" : "mobile")}
              style={{
                height: "32px",
                padding: "0 10px",
                fontSize: "11.5px",
                fontWeight: 600,
                background: "#1e293b",
                border: "1px solid #334155",
                color: "#e2e8f0",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              title="Chuyển chế độ hiển thị Thẻ di động hoặc Bảng chi tiết"
            >
              {isMobile ? "🖥 Dạng Bảng" : "📱 Dạng Thẻ"}
            </button>
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
        </div>

        {/* SHARED DELIVERY DATE & QUICK ACTION STRIP */}
        <div
          style={{
            padding: "10px 14px",
            background: "#f1f5f9",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
              📅 Ngày giao nhận:
            </label>
            <input
              type="date"
              value={sharedDate}
              onChange={(e) => handleApplySharedDate(e.target.value)}
              style={{
                height: "36px",
                padding: "0 10px",
                fontSize: "13px",
                fontWeight: 700,
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              style={{
                height: "34px",
                padding: "0 10px",
                fontSize: "12px",
                fontWeight: 600,
                background: "#ffffff",
                border: "1px solid #94a3b8",
                borderRadius: "6px",
                color: "#0284c7",
                cursor: "pointer",
              }}
            >
              ☑️ Chọn tất cả
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              style={{
                height: "34px",
                padding: "0 10px",
                fontSize: "12px",
                fontWeight: 600,
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              Bỏ chọn
            </button>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div
          style={{
            padding: "8px 14px",
            background: "#ffffff",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          <div style={{ position: "relative", flex: "1 1 180px" }}>
            <input
              type="text"
              placeholder="🔍 Tìm theo tên hoặc mã hàng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px 0 30px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                outline: "none",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "13px",
                color: "#94a3b8",
              }}
            >
              🔍
            </span>
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "4px", overflowX: "auto" }}>
            {(
              [
                { id: "all", label: "Tất cả" },
                { id: "remaining", label: "Chưa giao đủ" },
                { id: "checked", label: `Đã chọn (${checkedCount})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                style={{
                  height: "32px",
                  padding: "0 10px",
                  fontSize: "11.5px",
                  fontWeight: filterMode === f.id ? 700 : 500,
                  borderRadius: "20px",
                  border: filterMode === f.id ? "1px solid #0284c7" : "1px solid #e2e8f0",
                  background: filterMode === f.id ? "#eff6ff" : "#f8fafc",
                  color: filterMode === f.id ? "#0284c7" : "#475569",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* MAIN BODY: MOBILE CARDS OR DESKTOP TABLE */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "10px 12px 100px" : "14px 18px",
            background: "#f8fafc",
          }}
        >
          {/* Lịch sử các đợt giao hàng trước đó và cho phép sửa / hủy đợt nếu ấn nhầm */}
          {onUpdateHandovers && onUpdatePO && (
            <div style={{ marginBottom: "14px" }}>
              <POHandoverBatchSection
                po={po}
                paymentHandovers={paymentHandovers}
                onUpdateHandovers={onUpdateHandovers}
                onUpdatePO={onUpdatePO}
              />
            </div>
          )}
          {filteredItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 16px",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              Không tìm thấy mặt hàng nào phù hợp với bộ lọc.
            </div>
          ) : isMobile ? (
            /* ============================================================ */
            /* 1. MOBILE CARD-BASED UI (< 768px)                            */
            /* ============================================================ */
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredItems.map((it, idx) => {
                const isChecked = Boolean(selectedIds[it.id]);
                const orderQty = Number(it.qty) || 0;
                const delivered = Number(it.deliveredQty) || 0;
                const rem = Math.max(0, orderQty - delivered);
                const currentQty = itemQtys[it.id] ?? rem;
                const isOverLimit = currentQty > rem;
                const percentDone = orderQty > 0 ? Math.min(100, Math.round((delivered / orderQty) * 100)) : 0;
                const isFullyDelivered = orderQty > 0 && delivered >= orderQty;
                const reasonTag = itemReasons[it.id];

                return (
                  <div
                    key={it.id}
                    className={`po-mobile-item-card ${isOverLimit ? "is-over-limit" : ""} ${
                      isChecked ? "is-checked" : ""
                    }`}
                    style={{
                      background: "#ffffff",
                      borderRadius: "10px",
                      border: isOverLimit
                        ? "1.5px solid #ef4444"
                        : isChecked
                        ? "1.5px solid #3b82f6"
                        : "1px solid #e2e8f0",
                      boxShadow: isChecked
                        ? "0 4px 12px rgba(59, 130, 246, 0.12)"
                        : "0 1px 4px rgba(0,0,0,0.04)",
                      padding: "12px 14px",
                      position: "relative",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {/* Header: Checkbox + Name + Unit Badge */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                      }}
                    >
                      <label
                        style={{
                          minWidth: "44px",
                          minHeight: "44px",
                          display: "grid",
                          placeItems: "center",
                          margin: "-6px 0 0 -6px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSelectedIds((prev) => ({ ...prev, [it.id]: e.target.checked }))
                          }
                          style={{
                            width: "22px",
                            height: "22px",
                            cursor: "pointer",
                            accentColor: "#0284c7",
                          }}
                        />
                      </label>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#64748b",
                              background: "#f1f5f9",
                              padding: "1px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            #{idx + 1}
                          </span>
                          {it.code && (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#0284c7",
                                background: "#eff6ff",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              {it.code}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#334155",
                              background: "#e2e8f0",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              marginLeft: "auto",
                            }}
                          >
                            ĐVT: {it.unit || "Cái"}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: "14.5px",
                            fontWeight: 700,
                            color: "#0f172a",
                            marginTop: "4px",
                            lineHeight: "1.35",
                          }}
                        >
                          {it.name || (it as any).itemName || (it as any).item_name || (it as any).productName || "(Chưa có tên hàng)"}
                        </div>
                        {it.spec && (
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                            Quy cách: {it.spec}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress & Status Strip */}
                    <div
                      style={{
                        margin: "10px 0 8px",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: "#f8fafc",
                        border: "1px solid #f1f5f9",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ color: "#475569" }}>
                          Đặt: <b>{orderQty}</b>
                        </span>
                        <span style={{ color: delivered > 0 ? "#15803d" : "#64748b" }}>
                          Đã giao: <b>{delivered}</b> ({percentDone}%)
                        </span>
                        <span style={{ color: rem > 0 ? "#b45309" : "#15803d" }}>
                          Còn lại: <b>{rem}</b>
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div
                        style={{
                          height: "5px",
                          borderRadius: "4px",
                          background: "#e2e8f0",
                          overflow: "hidden",
                          marginTop: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: `${percentDone}%`,
                            height: "100%",
                            background: percentDone >= 100 ? "#22c55e" : "#0284c7",
                            transition: "width 0.2s ease",
                          }}
                        />
                      </div>
                    </div>

                    {/* Quick Stepper & Numeric Input (Touch-friendly 44px) */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "10px",
                        opacity: isChecked ? 1 : 0.6,
                      }}
                    >
                      <button
                        type="button"
                        disabled={!isChecked || currentQty <= 0}
                        onClick={() => handleStepQty(it.id, -1)}
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          fontSize: "20px",
                          fontWeight: 700,
                          color: "#334155",
                          cursor: isChecked && currentQty > 0 ? "pointer" : "not-allowed",
                          display: "grid",
                          placeItems: "center",
                          userSelect: "none",
                        }}
                      >
                        −
                      </button>

                      <div style={{ flex: 1, position: "relative" }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={!isChecked}
                          value={currentQty}
                          onFocus={(e) => {
                            e.target.select();
                            e.target.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            setItemQtys((prev) => ({ ...prev, [it.id]: Number(val) || 0 }));
                            setSelectedIds((prev) => ({ ...prev, [it.id]: true }));
                          }}
                          style={{
                            width: "100%",
                            height: "44px",
                            textAlign: "center",
                            fontSize: "17px",
                            fontWeight: 800,
                            borderRadius: "8px",
                            border: isOverLimit ? "2px solid #ef4444" : "1.5px solid #93c5fd",
                            background: isOverLimit ? "#fef2f2" : "#ffffff",
                            color: isOverLimit ? "#dc2626" : "#0f172a",
                            outline: "none",
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            right: "10px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#94a3b8",
                            pointerEvents: "none",
                          }}
                        >
                          {it.unit || "Cái"}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={!isChecked}
                        onClick={() => handleStepQty(it.id, 1)}
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          fontSize: "20px",
                          fontWeight: 700,
                          color: "#0284c7",
                          cursor: isChecked ? "pointer" : "not-allowed",
                          display: "grid",
                          placeItems: "center",
                          userSelect: "none",
                        }}
                      >
                        ＋
                      </button>
                    </div>

                    {/* Quick Fill Chips: "Đủ còn lại" & "= 0" */}
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                      <button
                        type="button"
                        disabled={!isChecked}
                        onClick={() => handleFillRemaining(it)}
                        style={{
                          flex: 1,
                          height: "32px",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          borderRadius: "6px",
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          cursor: isChecked ? "pointer" : "not-allowed",
                        }}
                      >
                        Giao đủ còn lại ({rem})
                      </button>
                      <button
                        type="button"
                        disabled={!isChecked}
                        onClick={() => {
                          setItemQtys((prev) => ({ ...prev, [it.id]: 0 }));
                          setSelectedIds((prev) => ({ ...prev, [it.id]: true }));
                        }}
                        style={{
                          width: "60px",
                          height: "32px",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                          background: "#ffffff",
                          color: "#64748b",
                          cursor: isChecked ? "pointer" : "not-allowed",
                        }}
                      >
                        = 0
                      </button>
                    </div>

                    {/* Instant Over-Delivery Warning */}
                    {isOverLimit && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "6px 10px",
                          background: "#fee2e2",
                          border: "1px solid #fca5a5",
                          borderRadius: "6px",
                          color: "#991b1b",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span>⚠️</span>
                        <span>
                          Vượt quá SL còn lại (+{currentQty - rem} {it.unit}). Vui lòng chọn lý do!
                        </span>
                      </div>
                    )}

                    {/* Discrepancy Reason / Note Trigger Button */}
                    <div style={{ marginTop: "10px", display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => setActiveReasonItemId(it.id)}
                        style={{
                          flex: 1,
                          minHeight: "38px",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: reasonTag ? "1px solid #cbd5e1" : "1px dashed #cbd5e1",
                          background: reasonTag ? "#f8fafc" : "#ffffff",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: reasonTag ? "#0f172a" : "#64748b",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span>{reasonTag ? `📝 Lý do: ${reasonTag}` : "📝 Báo lệch / Ghi chú..."}</span>
                        <span style={{ color: "#0284c7" }}>❯</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ============================================================ */
            /* 2. DESKTOP UPGRADED TABLE VIEW (>= 768px)                   */
            /* ============================================================ */
            <div style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px", width: "46px", textAlign: "center" }}>Chọn</th>
                    <th style={{ padding: "10px" }}>Tên hàng hóa / Quy cách</th>
                    <th style={{ padding: "10px", width: "70px", textAlign: "center" }}>ĐVT</th>
                    <th style={{ padding: "10px", width: "80px", textAlign: "right" }}>SL Đặt</th>
                    <th style={{ padding: "10px", width: "90px", textAlign: "right" }}>Đã giao</th>
                    <th style={{ padding: "10px", width: "160px", textAlign: "center" }}>SL Giao đợt này</th>
                    <th style={{ padding: "10px", width: "130px", textAlign: "center" }}>Ngày giao</th>
                    <th style={{ padding: "10px", minWidth: "140px" }}>Lý do sai lệch / Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => {
                    const isChecked = Boolean(selectedIds[it.id]);
                    const orderQty = Number(it.qty) || 0;
                    const delivered = Number(it.deliveredQty) || 0;
                    const rem = Math.max(0, orderQty - delivered);
                    const currentQty = itemQtys[it.id] ?? rem;
                    const isOverLimit = currentQty > rem;

                    return (
                      <tr
                        key={it.id}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          background: isOverLimit ? "#fff1f2" : isChecked ? "#f0f9ff" : "#ffffff",
                        }}
                      >
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setSelectedIds((prev) => ({ ...prev, [it.id]: e.target.checked }))
                            }
                            style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#0284c7" }}
                          />
                        </td>
                        <td style={{ padding: "10px" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{it.name}</div>
                          {it.spec && <div style={{ fontSize: "11.5px", color: "#64748b" }}>{it.spec}</div>}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center" }}>{it.unit}</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{orderQty}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: delivered > 0 ? "#15803d" : "#64748b", fontWeight: 600 }}>
                          {delivered} (còn {rem})
                        </td>
                        <td style={{ padding: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                            <button
                              type="button"
                              disabled={!isChecked || currentQty <= 0}
                              onClick={() => handleStepQty(it.id, -1)}
                              style={{
                                width: "32px",
                                height: "34px",
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              disabled={!isChecked}
                              value={currentQty === 0 ? "" : currentQty}
                              onChange={(e) => {
                                const val = e.target.value === "" ? 0 : (Number(e.target.value) || 0);
                                setItemQtys((prev) => ({ ...prev, [it.id]: val }));
                                setSelectedIds((prev) => ({ ...prev, [it.id]: true }));
                              }}
                              style={{
                                width: "70px",
                                height: "34px",
                                textAlign: "right",
                                fontWeight: 700,
                                padding: "0 6px",
                                border: isOverLimit ? "2px solid #ef4444" : "1px solid #cbd5e1",
                                borderRadius: "4px",
                              }}
                            />
                            <button
                              type="button"
                              disabled={!isChecked}
                              onClick={() => handleStepQty(it.id, 1)}
                              style={{
                                width: "32px",
                                height: "34px",
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontWeight: 700,
                                color: "#0284c7",
                              }}
                            >
                              ＋
                            </button>
                          </div>
                          {isOverLimit && (
                            <div style={{ fontSize: "10.5px", color: "#dc2626", fontWeight: 600, textAlign: "center", marginTop: "2px" }}>
                              Vượt SL (+{currentQty - rem})
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          <input
                            type="date"
                            disabled={!isChecked}
                            value={itemDates[it.id] ?? sharedDate}
                            onChange={(e) =>
                              setItemDates((prev) => ({ ...prev, [it.id]: e.target.value }))
                            }
                            style={{
                              height: "32px",
                              padding: "0 6px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              fontSize: "12px",
                            }}
                          />
                        </td>
                        <td style={{ padding: "10px" }}>
                          <button
                            type="button"
                            onClick={() => setActiveReasonItemId(it.id)}
                            style={{
                              width: "100%",
                              height: "32px",
                              padding: "0 8px",
                              border: "1px solid #cbd5e1",
                              background: "#fff",
                              borderRadius: "4px",
                              fontSize: "12px",
                              textAlign: "left",
                              cursor: "pointer",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {itemReasons[it.id] || itemNotes[it.id] || "Chọn lý do / Ghi chú..."}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* STICKY BOTTOM ACTION BAR (Thumb-friendly One-Handed Usability) */}
        {/* ============================================================ */}
        <div
          className="po-sticky-bottom-bar"
          style={{
            position: isMobile ? "fixed" : "static",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            padding: "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))",
            boxShadow: isMobile ? "0 -4px 16px rgba(15, 23, 42, 0.08)" : "none",
            zIndex: 100,
            flexShrink: 0,
          }}
        >
          {/* Summary KPI Strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              fontWeight: 700,
              color: "#334155",
              marginBottom: "8px",
              paddingBottom: "6px",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <span>
              Đã kiểm: <b style={{ color: "#0284c7" }}>{checkedCount}</b> / {items.length} mặt hàng
            </span>
            <span>
              Tổng SL: <b style={{ color: "#0f172a" }}>{totalDeliveryQty}</b>
            </span>
            <span>
              Giá trị: <b style={{ color: "#16a34a" }}>{fmt(totalDeliveryValue)} ₫</b>
            </span>
          </div>

          {/* Action Buttons Row */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Camera / Photo Upload */}
            <label
              style={{
                height: "46px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: uploadedPhotos.length > 0 ? "#ecfdf5" : "#ffffff",
                color: uploadedPhotos.length > 0 ? "#15803d" : "#334155",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
              title="Chụp ảnh chứng từ hoặc kiện hàng tại hiện trường"
            >
              <span>📷</span>
              <span>Ảnh ({uploadedPhotos.length})</span>
              <input
                type="file"
                hidden
                accept="image/*"
                capture="environment"
                multiple
                disabled={isUploadingPhoto}
                onChange={handlePhotoUpload}
              />
            </label>

            {/* Signature Drawer Trigger */}
            <button
              type="button"
              onClick={() => setShowSignatureDrawer(true)}
              style={{
                height: "46px",
                padding: "0 12px",
                borderRadius: "8px",
                border: signatureDataUrl ? "1.5px solid #22c55e" : "1px solid #cbd5e1",
                background: signatureDataUrl ? "#f0fdf4" : "#ffffff",
                color: signatureDataUrl ? "#15803d" : "#334155",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>✍️</span>
              <span>{signatureDataUrl ? "Đã ký ✓" : "Ký nhận"}</span>
            </button>

            {/* Confirm Receiving Button */}
            <button
              type="button"
              onClick={() => handleConfirmAction(false)}
              style={{
                flex: 1,
                height: "46px",
                borderRadius: "8px",
                border: "none",
                background: "#0284c7",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.28)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <span>✓ Xác nhận nhận hàng</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SLIDE-UP BOTTOM SHEET: DISCREPANCY REASON & PER-ITEM NOTE    */}
        {/* ============================================================ */}
        {activeReasonItemId !== null && activeReasonItem && (
          <div
            className="po-bottom-sheet-overlay"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.5)",
              zIndex: 200,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              className="po-bottom-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#ffffff",
                width: "100%",
                maxHeight: "85%",
                borderTopLeftRadius: "16px",
                borderTopRightRadius: "16px",
                padding: "16px 18px calc(16px + env(safe-area-inset-bottom, 0px))",
                boxShadow: "0 -10px 25px rgba(0,0,0,0.2)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "15px", color: "#0f172a" }}>
                    📝 Báo lệch & Ghi chú mặt hàng
                  </h4>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    {activeReasonItem.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveReasonItemId(null)}
                  style={{
                    border: 0,
                    background: "#f1f5f9",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    fontSize: "16px",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Quick Preset Pills */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "6px" }}>
                  Chọn nhanh lý do sai lệch:
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {DISCREPANCY_PRESETS.map((preset) => {
                    const isSelected = itemReasons[activeReasonItem.id] === preset.label;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setItemReasons((prev) => ({
                            ...prev,
                            [activeReasonItem.id]: isSelected ? "" : preset.label,
                          }))
                        }
                        style={{
                          minHeight: "40px",
                          padding: "6px 12px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: 700,
                          border: isSelected ? `2px solid ${preset.color}` : "1px solid #cbd5e1",
                          background: isSelected ? preset.bg : "#ffffff",
                          color: isSelected ? preset.color : "#334155",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Note */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
                  Chi tiết tình trạng hàng hóa / ghi chú thêm:
                </label>
                <textarea
                  rows={3}
                  value={itemNotes[activeReasonItem.id] || ""}
                  onChange={(e) =>
                    setItemNotes((prev) => ({ ...prev, [activeReasonItem.id]: e.target.value }))
                  }
                  placeholder="Ví dụ: Vỏ thùng bị rách góc, hàng bên trong nguyên vẹn. NCC cam kết đổi kiện nếu lỗi..."
                  style={{
                    width: "100%",
                    fontSize: "14px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Per-item Delivery Date */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  Ngày giao riêng cho mặt hàng này:
                </label>
                <input
                  type="date"
                  value={itemDates[activeReasonItem.id] ?? sharedDate}
                  onChange={(e) =>
                    setItemDates((prev) => ({ ...prev, [activeReasonItem.id]: e.target.value }))
                  }
                  style={{
                    height: "36px",
                    padding: "0 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setActiveReasonItemId(null)}
                style={{
                  height: "44px",
                  borderRadius: "8px",
                  background: "#0284c7",
                  color: "#ffffff",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  border: 0,
                  cursor: "pointer",
                  marginTop: "6px",
                }}
              >
                Xong
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* SLIDE-UP DRAWER: SIGNATURE & PARTIES (Touch Signature Pad)  */}
        {/* ============================================================ */}
        {showSignatureDrawer && (
          <div
            className="po-signature-overlay"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.65)",
              zIndex: 300,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              className="po-signature-drawer"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#ffffff",
                width: "100%",
                maxHeight: "92%",
                borderTopLeftRadius: "16px",
                borderTopRightRadius: "16px",
                padding: "16px 18px calc(16px + env(safe-area-inset-bottom, 0px))",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>
                    ✍️ Người ký & Biên bản giao nhận
                  </h4>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    Ký xác nhận trực tiếp trên màn hình cảm ứng điện thoại
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSignatureDrawer(false)}
                  style={{
                    border: 0,
                    background: "#f1f5f9",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    fontSize: "16px",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Two parties input */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
                    Người giao hàng (Tài xế / NCC):
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Họ tên người giao..."
                    style={{
                      width: "100%",
                      height: "40px",
                      padding: "0 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
                    Người nhận hàng (Thủ kho / BP tiếp nhận):
                  </label>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Họ tên người nhận..."
                    style={{
                      width: "100%",
                      height: "40px",
                      padding: "0 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>

              {/* Canvas Signature Pad */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                    Ký nhận bên dưới (vẽ bằng tay):
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={clearSignature}
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "#dc2626",
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        borderRadius: "4px",
                        padding: "3px 8px",
                        cursor: "pointer",
                      }}
                    >
                      Xóa ký lại
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    border: "1.5px dashed #94a3b8",
                    borderRadius: "8px",
                    background: "#f8fafc",
                    touchAction: "none",
                    position: "relative",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={isMobile ? 340 : 540}
                    height={160}
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerLeave={stopDrawing}
                    style={{
                      width: "100%",
                      height: "160px",
                      cursor: "crosshair",
                      display: "block",
                    }}
                  />
                  {!signatureDataUrl && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "#94a3b8",
                        fontSize: "13px",
                        pointerEvents: "none",
                      }}
                    >
                      ✍️ Dùng ngón tay ký tại đây
                    </div>
                  )}
                </div>
              </div>

              {/* Photos Gallery Preview if any */}
              {uploadedPhotos.length > 0 && (
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    Ảnh đã chụp ({uploadedPhotos.length}):
                  </div>
                  <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                    {uploadedPhotos.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          overflow: "hidden",
                          flexShrink: 0,
                          position: "relative",
                        }}
                      >
                        {p.url ? (
                          <img src={p.url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: "18px" }}>
                            📄
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signature Drawer CTA Buttons */}
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowSignatureDrawer(false)}
                  style={{
                    flex: 1,
                    height: "44px",
                    borderRadius: "8px",
                    background: "#0284c7",
                    color: "#ffffff",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    border: 0,
                    cursor: "pointer",
                  }}
                >
                  Lưu chữ ký & Đóng
                </button>
                {hasHandoverFeature && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignatureDrawer(false);
                      handleConfirmAction(true);
                    }}
                    style={{
                      height: "44px",
                      padding: "0 14px",
                      borderRadius: "8px",
                      background: "#16a34a",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 700,
                      border: 0,
                      cursor: "pointer",
                    }}
                    title="Xác nhận giao hàng và chuyển sang lập Biên bản bàn giao ngay"
                  >
                    📋 Lưu & Lập Biên bản
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================================================================== */
/* INLINE MOBILE CARD LIST FOR #po-items SECTION ON MOBILE (< 768px)     */
/* ===================================================================== */
export function POItemsMobileCards({
  po,
  items,
  readOnly = false,
  onUpdateItem,
  onDeleteItem,
  onOpenDeliveryPopup,
}: {
  po: PO;
  items: POItem[];
  readOnly?: boolean;
  onUpdateItem: (id: number, patch: Partial<POItem>) => void;
  onDeleteItem: (id: number) => void;
  onOpenDeliveryPopup?: () => void;
}) {
  const [filterMode, setFilterMode] = useState<"all" | "remaining" | "done">("all");
  const [search, setSearch] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const deliv = Number(it.deliveredQty) || 0;
      const total = Number(it.qty) || 0;
      const isDone = total > 0 && deliv >= total;

      if (filterMode === "remaining" && isDone) return false;
      if (filterMode === "done" && !isDone) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (it.name || "").toLowerCase().includes(q) || (it.code || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, filterMode, search]);

  return (
    <div className="po-mobile-cards-wrap" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Mobile Search & Filter */}
      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="🔍 Tìm nhanh hàng hóa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 140px",
            height: "36px",
            padding: "0 10px",
            fontSize: "13px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
          }}
        />
        <div style={{ display: "flex", gap: "4px" }}>
          {(
            [
              { id: "all", label: "Tất cả" },
              { id: "remaining", label: "Cần giao" },
              { id: "done", label: "Đã đủ" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setFilterMode(m.id)}
              style={{
                height: "32px",
                padding: "0 8px",
                fontSize: "11px",
                fontWeight: filterMode === m.id ? 700 : 500,
                borderRadius: "16px",
                border: filterMode === m.id ? "1px solid #0284c7" : "1px solid #cbd5e1",
                background: filterMode === m.id ? "#eff6ff" : "#fff",
                color: filterMode === m.id ? "#0284c7" : "#475569",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.map((i, idx) => {
        const orderQty = Number(i.qty) || 0;
        const delivQty = Number(i.deliveredQty) || 0;
        const rem = Math.max(0, orderQty - delivQty);
        const isDone = orderQty > 0 && delivQty >= orderQty;
        const isPartial = delivQty > 0 && delivQty < orderQty;
        const isExpanded = expandedId === i.id;
        const price = Number(i.price) || 0;
        const vatRate = Number(i.vatRate) || 0;
        const rowTotal = Math.round(orderQty * price * (1 + vatRate / 100));

        return (
          <div
            key={i.id}
            style={{
              background: "#ffffff",
              border: `1.5px solid ${isDone ? "#bbf7d0" : isPartial ? "#fed7aa" : "#e2e8f0"}`,
              borderRadius: "10px",
              padding: "12px 14px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            {/* Header: Name + Badge */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : i.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "8px",
                cursor: "pointer",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#64748b",
                      background: "#f1f5f9",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    #{idx + 1}
                  </span>
                  {i.code && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#0284c7",
                        background: "#eff6ff",
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {i.code}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#334155",
                      background: "#e2e8f0",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    {i.unit || "Cái"}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "14.5px",
                    fontWeight: 700,
                    color: "#0f172a",
                    marginTop: "4px",
                    lineHeight: "1.3",
                  }}
                >
                  {i.name || (i as any).itemName || (i as any).item_name || (i as any).productName || "(Chưa có tên hàng)"}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#1d4ed8" }}>
                  {fmt(rowTotal)} ₫
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                  {isExpanded ? "▲ Thu gọn" : "▼ Chi tiết"}
                </div>
              </div>
            </div>

            {/* Delivery Status Strip */}
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: "6px",
                background: isDone ? "#f0fdf4" : isPartial ? "#fffbeb" : "#f8fafc",
                border: `1px solid ${isDone ? "#bbf7d0" : isPartial ? "#fde68a" : "#e2e8f0"}`,
                fontSize: "12px",
              }}
            >
              <div>
                <span style={{ color: "#475569" }}>
                  Đặt: <b>{orderQty}</b> ·{" "}
                </span>
                <span style={{ color: isDone ? "#15803d" : "#b45309", fontWeight: 700 }}>
                  Đã giao: {delivQty}
                </span>
                <span style={{ color: "#64748b" }}> (còn {rem})</span>
              </div>

              {onOpenDeliveryPopup && !readOnly && (
                <button
                  type="button"
                  onClick={onOpenDeliveryPopup}
                  style={{
                    height: "30px",
                    padding: "0 10px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    borderRadius: "5px",
                    border: "1px solid #93c5fd",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    cursor: "pointer",
                  }}
                >
                  🚚 Giao hàng
                </button>
              )}
            </div>

            {/* Expanded Fields: Spec, Price, VAT, Note, Delete */}
            {isExpanded && (
              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "12px",
                  borderTop: "1px dashed #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div>
                  <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Tên hàng hóa:</label>
                  <input
                    value={i.name || ""}
                    disabled={readOnly}
                    onChange={(e) => onUpdateItem(i.id, { name: e.target.value })}
                    style={{
                      width: "100%",
                      height: "36px",
                      padding: "0 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Số lượng:</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={i.qty === 0 ? "" : i.qty}
                      disabled={readOnly}
                      onChange={(e) => onUpdateItem(i.id, { qty: e.target.value === "" ? 0 : (Number(e.target.value) || 0) })}
                      style={{
                        width: "100%",
                        height: "36px",
                        textAlign: "right",
                        fontWeight: 700,
                        padding: "0 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Đơn giá (₫):</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={i.price === 0 ? "" : i.price}
                      disabled={readOnly}
                      onChange={(e) => onUpdateItem(i.id, { price: e.target.value === "" ? 0 : (Number(e.target.value) || 0) })}
                      style={{
                        width: "100%",
                        height: "36px",
                        textAlign: "right",
                        fontWeight: 700,
                        padding: "0 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>ĐVT:</label>
                    <input
                      value={i.unit || ""}
                      disabled={readOnly}
                      onChange={(e) => onUpdateItem(i.id, { unit: e.target.value })}
                      style={{
                        width: "100%",
                        height: "36px",
                        textAlign: "center",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>VAT (%):</label>
                    <select
                      value={i.vatRate ?? 0}
                      disabled={readOnly}
                      onChange={(e) => onUpdateItem(i.id, { vatRate: Number(e.target.value) || 0 })}
                      style={{
                        width: "100%",
                        height: "36px",
                        textAlign: "center",
                        fontWeight: 700,
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={8}>8%</option>
                      <option value={10}>10%</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Ghi chú:</label>
                  <input
                    value={i.note || ""}
                    disabled={readOnly}
                    placeholder="Ghi chú mặt hàng..."
                    onChange={(e) => onUpdateItem(i.id, { note: e.target.value })}
                    style={{
                      width: "100%",
                      height: "36px",
                      padding: "0 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                </div>

                {/* Delivery History List if any */}
                {(i.deliveryHistory || []).length > 0 && (
                  <div style={{ background: "#f8fafc", padding: "8px", borderRadius: "6px", fontSize: "11px" }}>
                    <b>Lịch sử các đợt giao:</b>
                    {(i.deliveryHistory || []).map((h, hIdx) => (
                      <div key={hIdx} style={{ marginTop: "2px", color: "#334155" }}>
                        • 📅 {dateVN(h.date)}: Giao <b>{h.qty}</b> {i.unit}
                        {h.discrepancyReason && <span style={{ color: "#b45309" }}> ({h.discrepancyReason})</span>}
                        {h.senderName && <span> - Bên giao: {h.senderName}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {!readOnly && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(i.id)}
                      style={{
                        height: "34px",
                        padding: "0 12px",
                        background: "#fee2e2",
                        border: "1px solid #fca5a5",
                        borderRadius: "6px",
                        color: "#dc2626",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      🗑 Xóa mặt hàng này
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
