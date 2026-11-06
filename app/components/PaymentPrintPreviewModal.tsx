"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, CreditCard, ExternalLink } from "lucide-react";
import { PaymentRequestEntry, PaymentPrintTemplate, Supplier } from "../types";
import { PaymentPrintSheet } from "./PaymentPrintSheet";
import { moneyWords, parsePrintDate, fmtMoney, normName, DEFAULT_PAYMENT_TEMPLATE } from "../payment-utils";
import "../payment.css";

interface PaymentPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentRequest: PaymentRequestEntry | null;
  paymentTemplate?: PaymentPrintTemplate;
  suppliers?: Supplier[];
  onNavigateToPaymentTab?: (id: number) => void;
  onUpdatePaymentRequest?: (updated: PaymentRequestEntry) => void;
}

export function PaymentPrintPreviewModal({
  isOpen,
  onClose,
  paymentRequest,
  paymentTemplate = DEFAULT_PAYMENT_TEMPLATE,
  suppliers = [],
  onNavigateToPaymentTab,
  onUpdatePaymentRequest,
}: PaymentPrintPreviewModalProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>(() => paymentRequest?.documents || []);
  const [customDocInput, setCustomDocInput] = useState("");

  useEffect(() => {
    setSelectedDocs(paymentRequest?.documents || []);
  }, [paymentRequest?.id, paymentRequest?.documents]);

  const toggleDoc = (docName: string) => {
    if (!paymentRequest) return;
    const exists = selectedDocs.includes(docName);
    const nextDocs = exists
      ? selectedDocs.filter((d) => d !== docName)
      : [...selectedDocs, docName];
    setSelectedDocs(nextDocs);
    if (onUpdatePaymentRequest) {
      onUpdatePaymentRequest({ ...paymentRequest, documents: nextDocs });
    }
  };

  const handleAddCustomDoc = () => {
    if (!customDocInput.trim() || !paymentRequest) return;
    const trimmed = customDocInput.trim();
    if (!selectedDocs.includes(trimmed)) {
      const nextDocs = [...selectedDocs, trimmed];
      setSelectedDocs(nextDocs);
      if (onUpdatePaymentRequest) {
        onUpdatePaymentRequest({ ...paymentRequest, documents: nextDocs });
      }
    }
    setCustomDocInput("");
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !paymentRequest) return null;

  const req = paymentRequest;
  const tpl = paymentTemplate;
  const dateParts = parsePrintDate(req.request_date);
  const cur = String(req.currency || "VND").toUpperCase();
  const words = moneyWords({ amount: req.amount, currency: cur });
  const lines =
    req.lines && req.lines.length > 0
      ? req.lines
      : [
          {
            description: req.item_name || req.description || "",
            invoice_no: req.invoice_no || "",
            invoice_date: req.invoice_date || "",
            amount: req.amount,
          },
        ];

  const reqNorm = normName(req.payee_name);
  const matchedSupplier = suppliers?.find(
    (s) =>
      (req.beneficiary_id && s.id === req.beneficiary_id) ||
      (s.shortName && normName(s.shortName) === reqNorm) ||
      (s.name && normName(s.name) === reqNorm) ||
      (s.code && normName(s.code) === reqNorm)
  );

  const fullPayeeName = matchedSupplier?.name || req.payee_name || "";
  const payeeAddress = req.address || matchedSupplier?.address || "";
  const payeeAccount = req.account_no || matchedSupplier?.bankAccount || "";
  const payeeBank = req.bank || matchedSupplier?.bank || "";

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 50);
  };

  return (
    <>
      <div
        className="payment-modal-overlay"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(4px)",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: "16px 8px",
          overflowY: "auto",
        }}
      >
        {/* Top Sticky Bar */}
        <div
          style={{
            maxWidth: "860px",
            width: "100%",
            background: "#ffffff",
            borderRadius: "10px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
            marginBottom: "16px",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                background: "#f0fdf4",
                color: "#16a34a",
                display: "grid",
                placeItems: "center",
              }}
            >
              <CreditCard size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Giấy đề nghị thanh toán #{req.legacy_stt || req.id}
                </h3>
                <span
                  style={{
                    padding: "2px 8px",
                    background: "#ecfdf5",
                    color: "#047857",
                    borderRadius: "12px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                  }}
                >
                  ✓ Đã lưu thành công
                </span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>
                NCC: <b style={{ color: "#0f172a" }}>{fullPayeeName}</b> · Số tiền:{" "}
                <b style={{ color: "#0284c7" }}>{fmtMoney(req.amount)} ₫</b> · PO: <b>{req.group_code || "---"}</b>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {onNavigateToPaymentTab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToPaymentTab(req.id);
                }}
                style={{
                  height: "38px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                title="Mở trong tab Quản lý thanh toán để duyệt hoặc chỉnh sửa chi tiết"
              >
                <ExternalLink size={14} /> Tab Thanh toán
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              style={{
                height: "38px",
                padding: "0 18px",
                borderRadius: "6px",
                border: "none",
                background: "#0284c7",
                color: "#ffffff",
                fontSize: "13.5px",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                boxShadow: "0 2px 8px rgba(2, 132, 199, 0.35)",
              }}
            >
              <Printer size={16} /> In phiếu ngay (Ctrl + P)
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                height: "38px",
                padding: "0 16px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <X size={16} /> Đóng
            </button>
          </div>
        </div>

        {/* Paper Container */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Document Selection Checklist (No Print) */}
        <div
          className="no-print"
          style={{
            maxWidth: "860px",
            width: "100%",
            background: "#ffffff",
            borderRadius: "10px",
            padding: "12px 18px",
            marginBottom: "16px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "16px" }}>📎</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                Hồ sơ đính kèm (Người dùng tự chọn theo thực tế):
              </span>
            </div>
            <span style={{ fontSize: "12px", color: selectedDocs.length > 0 ? "#15803d" : "#64748b", fontWeight: 600 }}>
              {selectedDocs.length > 0 ? `✓ Đã chọn ${selectedDocs.length} chứng từ` : "Chưa chọn hồ sơ nào (để trống khi in)"}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            {[
              "Hợp đồng / PO",
              "Biên bản bàn giao nghiệm thu",
              "Hóa đơn GTGT",
              "Báo giá",
              "Bản đề nghị thanh toán (ĐNTT)",
              "CO / CQ",
            ].map((docName) => {
              const isChecked = selectedDocs.includes(docName);
              return (
                <button
                  key={docName}
                  type="button"
                  onClick={() => toggleDoc(docName)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: "6px",
                    border: `1.5px solid ${isChecked ? "#0284c7" : "#cbd5e1"}`,
                    background: isChecked ? "#f0f9ff" : "#f8fafc",
                    color: isChecked ? "#0284c7" : "#475569",
                    fontWeight: isChecked ? 700 : 500,
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.15s ease",
                  }}
                  title={isChecked ? "Bấm để bỏ chọn hồ sơ này" : "Bấm để đính kèm hồ sơ này vào bản in"}
                >
                  <span style={{ fontSize: "13px" }}>{isChecked ? "☑" : "☐"}</span>
                  <span>{docName}</span>
                </button>
              );
            })}

            <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "4px" }}>
              <input
                type="text"
                placeholder="+ Thêm hồ sơ khác..."
                value={customDocInput}
                onChange={(e) => setCustomDocInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomDoc();
                  }
                }}
                style={{
                  height: "30px",
                  padding: "0 8px",
                  fontSize: "12px",
                  border: "1px dashed #94a3b8",
                  borderRadius: "6px",
                  width: "160px",
                }}
              />
              {customDocInput.trim() && (
                <button
                  type="button"
                  onClick={handleAddCustomDoc}
                  style={{
                    height: "30px",
                    padding: "0 8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "none",
                    background: "#0284c7",
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  Thêm
                </button>
              )}
            </div>
          </div>
        </div>

        <PaymentPrintSheet req={req} tpl={tpl} suppliers={suppliers} selectedDocs={selectedDocs} />
        </div>
      </div>

      {/* PORTAL PRINT CONTAINER - Isolated for Ctrl + P or print button */}
      {typeof document !== "undefined" && (isPrinting || true) && createPortal(
        <div id="paymentPrintPortal">
          <PaymentPrintSheet req={req} tpl={tpl} suppliers={suppliers} selectedDocs={selectedDocs} />
        </div>,
        document.body
      )}
    </>
  );
}
