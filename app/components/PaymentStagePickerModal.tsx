"use client";

import React from "react";
import { CreditCard, Printer, Plus, Link2 } from "lucide-react";
import { PO, Payment, PaymentRequestEntry } from "../types";
import { fmt } from "../utils";

interface PaymentStagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: PO;
  paymentRequests?: PaymentRequestEntry[];
  onSelectStageToCreate: (payment: Payment) => void;
  onPrintExistingRequest: (requestId: number) => void;
  onAddAndCreateStage: () => void;
  onOpenLinkModal?: (payment: Payment) => void;
}

export function PaymentStagePickerModal({
  isOpen,
  onClose,
  po,
  paymentRequests = [],
  onSelectStageToCreate,
  onPrintExistingRequest,
  onAddAndCreateStage,
  onOpenLinkModal,
}: PaymentStagePickerModalProps) {
  if (!isOpen) return null;

  const payments = po.payments || [];

  return (
    <div
      className="payment-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="payment-modal-card"
        style={{
          background: "#ffffff",
          maxWidth: "560px",
          width: "100%",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
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
              <CreditCard size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                Đề nghị thanh toán · PO {po.number}
              </h3>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Chọn đợt thanh toán cần lập phiếu hoặc in lại ĐNTT đã lập
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

        {/* Stages list */}
        <div style={{ padding: "18px 20px", maxHeight: "65vh", overflowY: "auto" }}>
          {payments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 12px", color: "#64748b" }}>
              <p style={{ margin: "0 0 14px 0", fontSize: "13.5px" }}>
                Đơn hàng này chưa thiết lập đợt thanh toán nào.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddAndCreateStage();
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: "6px",
                  background: "#0284c7",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "13px",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Plus size={15} /> Tạo đợt thanh toán 100% & Mở bản in
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {payments.map((p, idx) => {
                const linkedReq = p.paymentRequestId
                  ? paymentRequests.find((r) => r.id === p.paymentRequestId)
                  : null;

                return (
                  <div
                    key={p.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: linkedReq ? "1.5px solid #bbf7d0" : "1.5px solid #bae6fd",
                      background: linkedReq ? "#f0fdf4" : "#f8fafc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            padding: "2px 7px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: linkedReq ? "#dcfce7" : "#e0f2fe",
                            color: linkedReq ? "#15803d" : "#0369a1",
                          }}
                        >
                          Đợt {idx + 1}
                        </span>
                        <b style={{ fontSize: "14px", color: "#0f172a" }}>{p.phase}</b>
                        <span style={{ fontSize: "12.5px", color: "#64748b" }}>
                          ({p.percent || 100}%)
                        </span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "4px" }}>
                        Số tiền: <b style={{ color: "#0284c7" }}>{fmt(p.amount)} ₫</b> · Hạn: {p.date || "Chưa đặt"}
                      </div>
                      {p.condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim()) && !linkedReq && (
                        <div style={{ fontSize: "11.5px", color: "#dc2626", marginTop: "3px", fontWeight: 600 }}>
                          ⚠️ Chưa có HĐ VAT (Bắt buộc với trả sau)
                        </div>
                      )}
                      {p.invoiceNo && (
                        <div style={{ fontSize: "11.5px", color: "#166534", marginTop: "2px" }}>
                          Số HĐ: <b>{p.invoiceNo}</b> {p.invoiceDate && `(${p.invoiceDate})`}
                        </div>
                      )}
                      {linkedReq && (
                        <div style={{ fontSize: "11.5px", color: "#16a34a", marginTop: "3px", fontWeight: 600 }}>
                          ✓ Đã lập ĐNTT #{linkedReq.legacy_stt || linkedReq.id} ({linkedReq.status})
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {linkedReq ? (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onPrintExistingRequest(linkedReq.id);
                          }}
                          style={{
                            height: "36px",
                            padding: "0 14px",
                            borderRadius: "6px",
                            border: "none",
                            background: "#0284c7",
                            color: "#ffffff",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                          title="Mở trực tiếp bản in Giấy đề nghị thanh toán"
                        >
                          <Printer size={15} /> In phiếu ĐNTT
                        </button>
                      ) : (
                        <>
                          {onOpenLinkModal && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenLinkModal(p);
                              }}
                              style={{
                                height: "36px",
                                padding: "0 12px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                background: "#f1f5f9",
                                color: "#0f172a",
                                fontSize: "12.5px",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Liên kết đợt thanh toán này với một Phiếu ĐNTT có sẵn"
                            >
                              <Link2 size={14} /> Liên kết ĐNTT
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const isPost = p.condition !== "advance";
                              const hasInv = Boolean(p.invoiceNo && p.invoiceNo.trim());
                              if (isPost && !hasInv) {
                                alert(
                                  `Đợt thanh toán "${p.phase}" là đợt trả sau, bắt buộc phải có thông tin Số hóa đơn GTGT trước khi lập ĐNTT.\n\n` +
                                  `Vui lòng nhập Số hóa đơn tại mục Đợt thanh toán của PO hoặc bấm nút "Liên kết ĐNTT" nếu đã có phiếu tự tạo!`
                                );
                                onClose();
                                setTimeout(() => {
                                  const el = document.getElementById(`invoice-no-input-${p.id}`);
                                  if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                                    el.focus();
                                  }
                                }, 200);
                                return;
                              }
                              onClose();
                              onSelectStageToCreate(p);
                            }}
                            style={{
                              height: "36px",
                              padding: "0 16px",
                              borderRadius: "6px",
                              border: "none",
                              background: p.condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim()) ? "#94a3b8" : "#16a34a",
                              color: "#ffffff",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              boxShadow: p.condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim()) ? "none" : "0 2px 6px rgba(22, 163, 74, 0.3)",
                            }}
                            title={
                              p.condition !== "advance" && (!p.invoiceNo || !p.invoiceNo.trim())
                                ? "Bắt buộc có Số hóa đơn GTGT đối với đợt trả sau"
                                : "Lập Đề nghị thanh toán và mở trực tiếp bản in Mẫu 01-TT"
                            }
                          >
                            <CreditCard size={15} /> Lập ĐNTT & In
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: "36px",
              padding: "0 16px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
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
