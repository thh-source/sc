"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, CreditCard, ExternalLink } from "lucide-react";
import { PaymentRequestEntry, PaymentPrintTemplate, Supplier } from "../types";
import { moneyWords, parsePrintDate, fmtMoney, normName, DEFAULT_PAYMENT_TEMPLATE } from "../payment-utils";
import "../payment.css";

interface PaymentPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentRequest: PaymentRequestEntry | null;
  paymentTemplate?: PaymentPrintTemplate;
  suppliers?: Supplier[];
  onNavigateToPaymentTab?: (id: number) => void;
}

export function PaymentPrintPreviewModal({
  isOpen,
  onClose,
  paymentRequest,
  paymentTemplate = DEFAULT_PAYMENT_TEMPLATE,
  suppliers = [],
  onNavigateToPaymentTab,
}: PaymentPrintPreviewModalProps) {
  const [isPrinting, setIsPrinting] = useState(false);

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

  const renderPaper = () => (
    <div className="paper" style={{ breakAfter: "page", pageBreakAfter: "always", margin: "0 auto 20px" }}>
      <div className="upper">{tpl.company_name}</div>
      <div className="model">{tpl.form_code}</div>
      <h1>{tpl.form_title}</h1>
      <div className="recipients">
        <strong>{tpl.recipient_label}</strong>
        <div style={{ whiteSpace: "pre-line" }}>{tpl.recipients}</div>
      </div>

      <div className="person">
        <div>- {tpl.label_requester}</div>
        <div><b>{req.created_by_name || tpl.default_requester_name}</b></div>
        <div>- {tpl.label_department}</div>
        <div><b>{tpl.department_name}</b></div>
      </div>

      <div className="intro">- {tpl.intro_text}</div>

      <div className="details">
        <div>+ {tpl.label_payee}</div>
        <div className="val"><b>{fullPayeeName}</b></div>
        <div>+ {tpl.label_address}</div>
        <div className="val">{payeeAddress}</div>
        <div>+ {tpl.label_account}</div>
        <div className="val"><b>{payeeAccount}</b></div>
        <div>+ {tpl.label_bank}</div>
        <div className="val"><b>{payeeBank}</b></div>
        <div>+ {tpl.label_description}</div>
        <div className="val">{req.description || ""}</div>
      </div>

      <div className="person transfer">
        <div>- {tpl.deadline_label}</div>
        <div><b>{tpl.deadline_val}</b></div>
      </div>

      <div className="moneytitle">- {tpl.table_title}</div>

      <table>
        <thead>
          <tr>
            <th style={{ width: "36px" }}>{tpl.col_stt}</th>
            <th style={{ width: "170px" }}>{tpl.col_invoice}</th>
            <th>{tpl.col_item}</th>
            <th style={{ width: "135px" }}>{tpl.col_amount}</th>
            <th style={{ width: "90px" }}>{tpl.col_note}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, li) => (
            <tr key={li}>
              <td style={{ textAlign: "center" }}>{li + 1}</td>
              <td style={{ textAlign: "center", wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal", padding: "6px 6px" }}>
                {l.invoice_no ? `${l.invoice_no}${l.invoice_date ? " (" + l.invoice_date + ")" : ""}` : ""}
              </td>
              <td style={{ textAlign: "left", paddingLeft: "8px", paddingRight: "8px", wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal", padding: "6px 8px" }}>
                {l.description}
              </td>
              <td style={{ textAlign: "right", paddingRight: "8px", whiteSpace: "nowrap" }}>{fmtMoney(l.amount)}</td>
              <td style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{l.note || ""}</td>
            </tr>
          ))}
          <tr className="sum">
            <td colSpan={3} style={{ textAlign: "center", fontWeight: "bold" }}>{tpl.col_total}</td>
            <td style={{ textAlign: "right", paddingRight: "8px", fontWeight: "bold", whiteSpace: "nowrap" }}>{fmtMoney(req.amount)}</td>
            <td style={{ textAlign: "center" }}>{cur}</td>
          </tr>
        </tbody>
      </table>

      <div className="words">
        <div>- {tpl.label_money_words}</div>
        <div><b>{words}</b></div>
      </div>

      <div className="doclabel">- {tpl.label_docs}:</div>
      <div className="docs">{(req.documents || []).join(", ") || "Hợp đồng / PO, Biên bản bàn giao nghiệm thu, Hóa đơn GTGT"}</div>

      <div className="date">
        {tpl.date_location}, ngày {dateParts ? dateParts.d : "...."} tháng {dateParts ? dateParts.m : "...."} năm {dateParts ? dateParts.y : "2026"}
      </div>

      <div className="sign">
        <div className="c">
          <div className="t">{tpl.sign1_title}</div>
          <div className="s">{tpl.sign1_name}</div>
        </div>
        <div className="c">
          <div className="t">{tpl.sign2_title}</div>
          <div className="s">{tpl.sign2_name}</div>
        </div>
        <div className="c">
          <div className="t">{tpl.sign3_title}</div>
          <div className="s">{tpl.sign3_name}</div>
        </div>
        <div className="c">
          <div className="t">{tpl.sign4_title}</div>
          <div className="s">{tpl.sign4_name || req.created_by_name || tpl.default_requester_name}</div>
        </div>
      </div>
    </div>
  );

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
          {renderPaper()}
        </div>
      </div>

      {/* PORTAL PRINT CONTAINER - Isolated for Ctrl + P or print button */}
      {typeof document !== "undefined" && (isPrinting || true) && createPortal(
        <div id="paymentPrintPortal">
          {renderPaper()}
        </div>,
        document.body
      )}
    </>
  );
}
