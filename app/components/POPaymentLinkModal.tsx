"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Link2,
  Check,
  AlertCircle,
} from "lucide-react";
import { PO, Payment, PaymentRequestEntry } from "../types";
import { fmt } from "../utils";
import { normName } from "../payment-utils";
import { isPaymentCompleted } from "../utils/paymentSync";

interface POPaymentLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: PO;
  stage: Payment;
  paymentRequests: PaymentRequestEntry[];
  pos?: PO[];
  onConfirmLink: (request: PaymentRequestEntry) => void;
}

export function POPaymentLinkModal({
  isOpen,
  onClose,
  po,
  stage,
  paymentRequests = [],
  pos = [],
  onConfirmLink,
}: POPaymentLinkModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "po" | "supplier" | "unlinked">("all");

  const supplier = useMemo(() => {
    // Tìm NCC tương ứng với PO nếu có
    return null;
  }, []);

  // Tính toán số lượng cho từng tab
  const tabCounts = useMemo(() => {
    const cleanPoNum = normName(po.number);

    let matchPOCount = 0;
    let matchSupplierCount = 0;
    let unlinkedCount = 0;

    for (const r of paymentRequests) {
      if (normName(r.group_code || "") === cleanPoNum) {
        matchPOCount++;
      }
      if (
        (po.supplierId && r.beneficiary_id === po.supplierId) ||
        (r.payee_name && po.supplierId && normName(r.payee_name).includes(normName(po.number.split("-")[0] || "")))
      ) {
        matchSupplierCount++;
      }
      // ĐNTT tự tạo chưa gán số PO hoặc PO không tồn tại
      if (!r.group_code || !pos.some((p) => normName(p.number) === normName(r.group_code || ""))) {
        unlinkedCount++;
      }
    }

    return {
      all: paymentRequests.length,
      po: matchPOCount,
      supplier: matchSupplierCount,
      unlinked: unlinkedCount,
    };
  }, [paymentRequests, po, pos]);

  // Lọc danh sách ĐNTT
  const filteredRequests = useMemo(() => {
    const cleanPoNum = normName(po.number);
    const q = normName(searchQuery);

    return paymentRequests.filter((r) => {
      // 1. Lọc theo Tab
      if (filterTab === "po") {
        if (normName(r.group_code || "") !== cleanPoNum) return false;
      } else if (filterTab === "supplier") {
        const matchesSupplierId = po.supplierId && r.beneficiary_id === po.supplierId;
        const matchesSupplierText =
          r.payee_name && po.supplierId && normName(r.payee_name).includes(normName(po.number.split("-")[0] || ""));
        if (!matchesSupplierId && !matchesSupplierText) return false;
      } else if (filterTab === "unlinked") {
        const isLinkedToAnyPO = r.group_code && pos.some((p) => normName(p.number) === normName(r.group_code || ""));
        if (isLinkedToAnyPO) return false;
      }

      // 2. Lọc theo từ khóa tìm kiếm
      if (q) {
        const textTarget = [
          String(r.id),
          String(r.legacy_stt || ""),
          r.payee_name,
          r.group_code,
          r.invoice_no,
          r.description,
          r.item_name,
          r.status,
          String(r.amount),
        ]
          .filter(Boolean)
          .join(" ");

        if (!normName(textTarget).includes(q)) return false;
      }

      return true;
    });
  }, [paymentRequests, po, pos, filterTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="payment-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="payment-link-modal-card"
        style={{
          background: "#ffffff",
          maxWidth: "880px",
          width: "100%",
          maxHeight: "90vh",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            background: "#0f172a",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #334155",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#1e293b",
                color: "#38bdf8",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Link2 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                Liên kết Đợt thanh toán PO {po.number} với Phiếu ĐNTT có sẵn
              </h3>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Gắn đợt thanh toán với phiếu ĐNTT tự tạo độc lập để đồng bộ hóa đơn và trạng thái giải ngân
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              border: 0,
              background: "#1e293b",
              color: "#94a3b8",
              fontSize: "18px",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Current PO Stage Info Banner */}
        <div
          style={{
            padding: "12px 20px",
            background: "#f0fdf4",
            borderBottom: "1px solid #bbf7d0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "#bbf7d0",
                  color: "#166534",
                }}
              >
                Đợt đang chọn
              </span>
              <b style={{ fontSize: "14px", color: "#14532d" }}>{stage.phase}</b>
              <span style={{ fontSize: "12.5px", color: "#15803d" }}>({stage.percent || 100}%)</span>
              <span
                style={{
                  fontSize: "11.5px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: stage.condition === "advance" ? "#fef3c7" : "#dcfce7",
                  color: stage.condition === "advance" ? "#92400e" : "#166534",
                  fontWeight: 600,
                }}
              >
                {stage.condition === "advance" ? "Tạm ứng / Trả trước" : "Trả sau (Công nợ)"}
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#166534", marginTop: "3px" }}>
              Số tiền cần thanh toán: <b style={{ fontSize: "13px" }}>{fmt(stage.amount)} ₫</b>
              {stage.invoiceNo ? (
                <span style={{ marginLeft: "10px" }}>
                  · Số HĐ hiện tại: <b>{stage.invoiceNo}</b>
                </span>
              ) : (
                <span style={{ marginLeft: "10px", color: "#b91c1c", fontWeight: 600 }}>
                  · Chưa có Số HĐ tại PO (sẽ lấy từ ĐNTT nếu có)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Search & Tabs Controls */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          {/* Search box */}
          <div style={{ position: "relative", marginBottom: "12px" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
              }}
            />
            <input
              type="text"
              placeholder="Tìm theo mã ĐNTT (#ID), số PO, tên NCC, số hóa đơn VAT, nội dung thanh toán..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: "38px",
                padding: "0 12px 0 36px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                outline: "none",
                background: "#ffffff",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid",
                borderColor: filterTab === "all" ? "#0284c7" : "#cbd5e1",
                background: filterTab === "all" ? "#e0f2fe" : "#ffffff",
                color: filterTab === "all" ? "#0369a1" : "#475569",
              }}
            >
              Tất cả ĐNTT ({tabCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("po")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid",
                borderColor: filterTab === "po" ? "#0284c7" : "#cbd5e1",
                background: filterTab === "po" ? "#e0f2fe" : "#ffffff",
                color: filterTab === "po" ? "#0369a1" : "#475569",
              }}
            >
              Trùng PO "{po.number}" ({tabCounts.po})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("unlinked")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid",
                borderColor: filterTab === "unlinked" ? "#0284c7" : "#cbd5e1",
                background: filterTab === "unlinked" ? "#e0f2fe" : "#ffffff",
                color: filterTab === "unlinked" ? "#0369a1" : "#475569",
              }}
            >
              Phiếu tự tạo / Chưa gắn PO ({tabCounts.unlinked})
            </button>
            {tabCounts.supplier > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("supplier")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: filterTab === "supplier" ? "#0284c7" : "#cbd5e1",
                  background: filterTab === "supplier" ? "#e0f2fe" : "#ffffff",
                  color: filterTab === "supplier" ? "#0369a1" : "#475569",
                }}
              >
                Cùng NCC ({tabCounts.supplier})
              </button>
            )}
          </div>
        </div>

        {/* Requests List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {filteredRequests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "#64748b" }}>
              <AlertCircle size={36} style={{ color: "#94a3b8", marginBottom: "10px" }} />
              <p style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 600, color: "#334155" }}>
                Không tìm thấy phiếu Đề nghị thanh toán nào phù hợp
              </p>
              <p style={{ margin: 0, fontSize: "12.5px" }}>
                Bạn có thể đổi từ khóa tìm kiếm hoặc bấm tab "Tất cả ĐNTT".
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filteredRequests.map((r) => {
                const isExactAmount = Number(r.amount) === Number(stage.amount);
                const isCurrentlyLinked = stage.paymentRequestId === r.id;
                const isLinkedOtherPO =
                  r.group_code && normName(r.group_code) !== normName(po.number);

                return (
                  <div
                    key={r.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "8px",
                      border: isCurrentlyLinked
                        ? "2px solid #16a34a"
                        : isExactAmount
                        ? "1.5px solid #93c5fd"
                        : "1px solid #e2e8f0",
                      background: isCurrentlyLinked
                        ? "#f0fdf4"
                        : isExactAmount
                        ? "#f8fafc"
                        : "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "14px",
                      flexWrap: "wrap",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: "260px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 700,
                            background: "#0f172a",
                            color: "#ffffff",
                          }}
                        >
                          #{r.legacy_stt || r.id}
                        </span>
                        <b style={{ fontSize: "14px", color: "#0f172a" }}>{r.payee_name || "Chưa có NCC"}</b>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background:
                              isPaymentCompleted(r)
                                ? "#dcfce7"
                                : "#fef3c7",
                            color:
                              isPaymentCompleted(r)
                                ? "#166534"
                                : "#92400e",
                          }}
                        >
                          {isPaymentCompleted(r) ? "Đã thanh toán" : "Chưa thanh toán"}
                        </span>
                        {isCurrentlyLinked && (
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: "#dcfce7",
                              color: "#15803d",
                            }}
                          >
                            ✓ Đang liên kết đợt này
                          </span>
                        )}
                      </div>

                      {/* Details row */}
                      <div
                        style={{
                          fontSize: "12.5px",
                          color: "#475569",
                          marginTop: "6px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          Số tiền:{" "}
                          <b style={{ color: "#0284c7", fontSize: "13.5px" }}>{fmt(Number(r.amount) || 0)} ₫</b>
                          {isExactAmount && (
                            <span
                              style={{
                                marginLeft: "6px",
                                fontSize: "11px",
                                padding: "1px 6px",
                                borderRadius: "3px",
                                background: "#dcfce7",
                                color: "#166534",
                                fontWeight: 600,
                              }}
                            >
                              Khớp số tiền
                            </span>
                          )}
                        </span>
                        <span>Ngày lập: {r.request_date || "—"}</span>
                        <span>
                          Số HĐ VAT:{" "}
                          <b style={{ color: r.invoice_no ? "#166534" : "#dc2626" }}>
                            {r.invoice_no ? r.invoice_no : "Chưa có HĐ"}
                          </b>
                          {r.invoice_date && ` (${r.invoice_date})`}
                        </span>
                      </div>

                      {/* Context & Description */}
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        <span>
                          Nhóm PO / Hợp đồng:{" "}
                          <b style={{ color: r.group_code ? "#0f172a" : "#94a3b8" }}>
                            {r.group_code ? r.group_code : "(Phiếu tự tạo độc lập - Chưa gán PO)"}
                          </b>
                        </span>
                        {isLinkedOtherPO && (
                          <span style={{ color: "#d97706", marginLeft: "6px", fontWeight: 600 }}>
                            (Đang gán PO: {r.group_code})
                          </span>
                        )}
                      </div>

                      {(r.item_name || r.description) && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#334155",
                            marginTop: "4px",
                            background: "#f1f5f9",
                            padding: "4px 8px",
                            borderRadius: "4px",
                          }}
                        >
                          {r.item_name || r.description}
                        </div>
                      )}
                    </div>

                    {/* Action Column */}
                    <div>
                      {isCurrentlyLinked ? (
                        <button
                          type="button"
                          disabled
                          style={{
                            height: "38px",
                            padding: "0 14px",
                            borderRadius: "6px",
                            border: "1px solid #86efac",
                            background: "#dcfce7",
                            color: "#166534",
                            fontSize: "12.5px",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            cursor: "default",
                          }}
                        >
                          <Check size={15} /> Đã liên kết
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onConfirmLink(r)}
                          style={{
                            height: "38px",
                            padding: "0 16px",
                            borderRadius: "6px",
                            border: "none",
                            background: "#0284c7",
                            color: "#ffffff",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            boxShadow: "0 2px 4px rgba(2, 132, 199, 0.25)",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <Link2 size={15} /> Chọn liên kết
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 20px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            💡 Khi liên kết: Đợt thanh toán sẽ tự động nhận số hóa đơn từ ĐNTT (nếu có) và cập nhật số PO ({po.number}) vào phiếu ĐNTT.
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: "36px",
              padding: "0 16px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
