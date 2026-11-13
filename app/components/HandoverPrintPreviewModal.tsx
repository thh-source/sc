"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Truck, ExternalLink } from "lucide-react";
import { PO, PaymentHandoverItem } from "../types";
import { PHENIKAA_PHARMA_LOGO_BASE64, parsePrintDate } from "../payment-utils";
import { sortHandoversByPOLineOrder } from "../utils/handoverBatches";
import "../payment.css";

interface HandoverPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PaymentHandoverItem[];
  po?: PO | null;
  department?: string;
  handoverDate?: string;
  senderName?: string;
  receiverName?: string;
  onNavigateToHandoverTab?: () => void;
}

export function HandoverPrintPreviewModal({
  isOpen,
  onClose,
  items,
  po,
  department,
  handoverDate,
  senderName = "Trần Hải Hà",
  receiverName = "",
  onNavigateToHandoverTab,
}: HandoverPrintPreviewModalProps) {
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

  if (!isOpen || !items || items.length === 0) return null;

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 50);
  };

  const sortedItems = React.useMemo(() => {
    return sortHandoversByPOLineOrder(items, po);
  }, [items, po]);

  const totalDocQty = sortedItems.reduce((acc, it) => acc + (Number(it.quantity_doc) || 0), 0);
  const totalPassQty = sortedItems.reduce((acc, it) => acc + (Number(it.quantity_pass) || 0), 0);
  const totalFailQty = sortedItems.reduce((acc, it) => acc + (Number(it.quantity_fail) || 0), 0);

  const rawDept = department || items[0]?.department || "";
  const effectiveDept = (rawDept && rawDept.trim() !== "Phòng Cung ứng")
    ? rawDept.trim()
    : "....................................................";
  const effectiveDate = handoverDate || items[0]?.handover_date || new Date().toISOString().slice(0, 10);
  const parsedDate = parsePrintDate(effectiveDate);
  const curYear = parsedDate?.y || new Date().getFullYear().toString();
  const curMonth = parsedDate?.m || (new Date().getMonth() + 1).toString().padStart(2, "0");
  const curDay = parsedDate?.d || new Date().getDate().toString().padStart(2, "0");

  const renderPaperContent = (copyIndex: number) => (
    <div key={copyIndex} className="handover-paper paper" style={{ marginBottom: "24px" }}>
      <table className="hb-box">
        <tbody>
          <tr>
            <td className="hb-box-left" style={{ textAlign: "center", verticalAlign: "middle" }}>
              <div className="hb-logo">
                <img
                  src={PHENIKAA_PHARMA_LOGO_BASE64}
                  alt="PHENIKAA PHARMA"
                  style={{
                    height: "40px",
                    width: "170px",
                    objectFit: "contain",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
              </div>
              
            </td>
            <td className="hb-box-right">
              <div className="hb-title-main">
                BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,
              </div>
              <div className="hb-title-main">HÀNG HÓA</div>
              <div className="hb-title-sub">
                (Không qua kho)
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="hb-info">
        <div className="hb-line">
          Hôm nay, ngày&nbsp;.....&nbsp;tháng&nbsp;.....&nbsp;năm 20.....
        </div>
        <div className="hb-line">Tại Công ty CP Dược phẩm Phenikaa</div>
        <div className="hb-line">
          Địa chỉ: Lô đất CN2-10, KCN Công nghệ cao 2, KCNC Hòa Lạc, Xã Hòa Lạc, TP Hà Nội
        </div>
        <div className="hb-line" style={{ fontWeight: 700, marginTop: "4px" }}>Chúng tôi gồm:</div>
        <div className="hb-line" style={{ marginTop: "3px" }}>
          Ông (bà): <b>{senderName}</b> - Người giao hàng&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Đơn vị: <b>Phòng Cung ứng</b>
        </div>
        <div className="hb-line" style={{ marginTop: "3px" }}>
          Ông (bà): <b>{receiverName ? receiverName : "...................................................."}</b> - Người nhận hàng&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Bộ phận: <b>{effectiveDept}</b>
        </div>
        <div className="hb-line">
          Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư:
        </div>
      </div>

      <table className="hb-table">
        <thead>
          <tr>
            <th style={{ width: "38px" }}>STT</th>
            <th>Tên hàng hóa - Quy cách</th>
            <th style={{ width: "55px" }}>ĐVT</th>
            <th style={{ width: "85px" }}>
              SL theo
              <br />
              chứng từ
            </th>
            <th style={{ width: "80px" }}>
              SL kiểm tra
              <br />
              Đạt
            </th>
            <th style={{ width: "80px" }}>
              SL kiểm tra
              <br />
              K.Đạt
            </th>
            <th style={{ width: "95px" }}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((it, idx) => (
            <tr key={it.id || idx}>
              <td className="center">{idx + 1}</td>
              <td className="left" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                <b>{it.item_name}</b>
              </td>
              <td className="center">{it.unit || "Cái"}</td>
              <td className="center">{it.quantity_doc || ""}</td>
              <td className="center" style={{ fontWeight: 700, color: "#16a34a" }}>
                {it.quantity_pass || ""}
              </td>
              <td className="center" style={{ color: it.quantity_fail ? "#dc2626" : undefined }}>
                {it.quantity_fail || "0"}
              </td>
              <td className="left" style={{ fontSize: "12px" }}>{it.note || ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: "#fafafa" }}>
            <td colSpan={2} className="center" style={{ textAlign: "center", padding: "4px" }}>
              TỔNG CỘNG ({sortedItems.length} mặt hàng)
            </td>
            <td className="center" style={{ textAlign: "center", padding: "4px" }}>-</td>
            <td className="center" style={{ textAlign: "center", padding: "4px", fontWeight: 800 }}>{totalDocQty}</td>
            <td className="center" style={{ textAlign: "center", padding: "4px", fontWeight: 800, color: "#16a34a" }}>{totalPassQty}</td>
            <td className="center" style={{ textAlign: "center", padding: "4px", fontWeight: 800, color: totalFailQty > 0 ? "#dc2626" : undefined }}>{totalFailQty}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div className="hb-footer">
        <div className="hb-conclusion-title">Kết luận:</div>
        <div className="hb-conclusion-body">
          Biên bản này được lập thành 02 bản có giá trị pháp lý như nhau, 01 bản giao cho người giao hàng; 01 bản giao cho người nhận hàng.
        </div>
        <div className="hb-sign-row">
          <div className="hb-sign-col">
            <b>Người giao hàng</b><br />
            <i>(Ký, ghi rõ họ tên)</i>
            <div style={{ marginTop: "55px", fontWeight: 700 }}>{senderName}</div>
          </div>
          <div className="hb-sign-col">
            <b>Người nhận hàng</b><br />
            <i>(Ký, ghi rõ họ tên)</i>
            <div style={{ marginTop: "55px", fontWeight: 700 }}>{receiverName || ""}</div>
          </div>
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
        {/* Top Control Header Card */}
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
                background: "#ecfdf5",
                color: "#059669",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Truck size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Biên bản bàn giao & Nghiệm thu
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
                PO: <b style={{ color: "#0284c7" }}>{po?.number || items[0]?.source_number}</b> · Nhận: <b>{effectiveDept}</b> · {items.length} mặt hàng
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {onNavigateToHandoverTab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToHandoverTab();
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
                title="Chuyển đến tab Bàn giao để xem toàn bộ lịch sử"
              >
                <ExternalLink size={14} /> Tab Bàn giao
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
              <Printer size={16} /> In biên bản (Ctrl + P)
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

        {/* Paper Container - 02 standard copies */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {renderPaperContent(1)}
          {renderPaperContent(2)}
        </div>
      </div>

      {/* PORTAL PRINT CONTAINER - Isolated for Ctrl + P or print button */}
      {typeof document !== "undefined" && (isPrinting || true) && createPortal(
        <div id="paymentPrintPortal">
          {renderPaperContent(1)}
          {renderPaperContent(2)}
        </div>,
        document.body
      )}
    </>
  );
}
