import React from "react";
import { PaymentPrintTemplate, PaymentRequestEntry, Supplier } from "../types";
import { parsePrintDate, moneyWords, fmtMoney, normName } from "../payment-utils";

export interface PaymentPrintSheetProps {
  req: PaymentRequestEntry;
  tpl: PaymentPrintTemplate;
  suppliers?: Supplier[];
  selectedDocs?: string[];
  style?: React.CSSProperties;
  className?: string;
  isDraft?: boolean;
}

/**
 * PaymentPrintSheet - Nguồn biểu mẫu in duy nhất (Single Source of Truth)
 * cho Giấy đề nghị thanh toán (Mẫu số 01 - TT).
 * Dùng chung đồng nhất cho:
 * 1. In từ Tab Đề nghị thanh toán (PaymentManagement)
 * 2. In từ Đơn mua hàng PO / Modal xem trước (PaymentPrintPreviewModal)
 * 3. Xem trước và in mẫu thử trong Cài đặt Mẫu in (PrintTemplatesManagement)
 */
export const PaymentPrintSheet: React.FC<PaymentPrintSheetProps> = ({
  req,
  tpl,
  suppliers = [],
  selectedDocs,
  style,
  className = "paper",
  isDraft = false,
}) => {
  const dateParts = parsePrintDate(req.request_date);
  const cur = String(req.currency || "VND").toUpperCase();
  const words = moneyWords({ amount: req.amount, currency: cur });

  const lines = (req.lines && req.lines.length > 0)
    ? req.lines
    : [
        {
          description: req.item_name || req.description || "",
          invoice_no: req.invoice_no || "",
          invoice_date: req.invoice_date || "",
          amount: req.amount,
          note: req.doc_supplement || "",
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

  // Chuẩn hóa tên người đề nghị: nếu trống hoặc là "Phòng Cung ứng" -> fallback về default_requester_name ("Trần Hải Hà")
  const isGenericDepartment =
    !req.created_by_name ||
    req.created_by_name.trim().toLowerCase() === "phòng cung ứng" ||
    req.created_by_name.trim().toLowerCase() === "cung ứng";

  const requesterName = isGenericDepartment
    ? (tpl.default_requester_name || "Trần Hải Hà")
    : req.created_by_name.trim();

  // Người ký vị trí số 4: Ưu tiên sign4_name từ mẫu in nếu đã cấu hình, nếu không dùng requesterName
  const signer4Name = (tpl.sign4_name && tpl.sign4_name.trim())
    ? tpl.sign4_name.trim()
    : requesterName;

  const docsToDisplay = (selectedDocs && selectedDocs.length > 0
    ? selectedDocs
    : (req.documents || [])
  ).filter(Boolean).join(", ");

  const signSpaceHeight = tpl.sign_space_height && tpl.sign_space_height > 0
    ? tpl.sign_space_height
    : 130;

  return (
    <div
      className={className}
      style={{
        breakAfter: "page",
        pageBreakAfter: "always",
        ...style,
      }}
    >
      {isDraft && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-30deg)",
            fontSize: "42px",
            fontWeight: "bold",
            color: "rgba(239, 68, 68, 0.15)",
            border: "4px dashed rgba(239, 68, 68, 0.25)",
            padding: "16px 32px",
            borderRadius: "12px",
            pointerEvents: "none",
            zIndex: 1,
            whiteSpace: "nowrap",
          }}
        >
          {tpl.draft_warning || "BẢN NHÁP – CHƯA XÁC NHẬN TIỀN TỆ"}
        </div>
      )}

      <div className="upper">{tpl.company_name}</div>
      <div className="model">{tpl.form_code}</div>
      <h1>{tpl.form_title}</h1>

      <div className="recipients">
        <strong>{tpl.recipient_label}</strong>
        <div style={{ whiteSpace: "pre-line" }}>{tpl.recipients}</div>
      </div>

      <div className="person">
        <div>- {tpl.label_requester}</div>
        <div><b>{requesterName}</b></div>
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
              <td style={{ textAlign: "right", paddingRight: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(l.amount)}</td>
              <td style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{l.note || ""}</td>
            </tr>
          ))}
          <tr className="sum">
            <td colSpan={3} style={{ textAlign: "center", fontWeight: "bold" }}>{tpl.col_total}</td>
            <td style={{ textAlign: "right", paddingRight: "8px", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(req.amount)}</td>
            <td style={{ textAlign: "center" }}>{cur}</td>
          </tr>
        </tbody>
      </table>

      <div className="words">
        <div>- {tpl.label_money_words}</div>
        <div>{words}</div>
      </div>

      <div className="doclabel">- {tpl.label_docs}:</div>
      <div className="docs">{docsToDisplay}</div>

      <div className="date">
        {tpl.date_location}, ngày {dateParts ? dateParts.d : "...."} tháng {dateParts ? dateParts.m : "...."} năm {dateParts ? dateParts.y : "2026"}
      </div>

      <div className="sign">
        <div style={{ height: `${signSpaceHeight}px` }}>{tpl.sign1_title}<span>{tpl.sign1_name}</span></div>
        <div style={{ height: `${signSpaceHeight}px` }}>{tpl.sign2_title}<span>{tpl.sign2_name}</span></div>
        <div style={{ height: `${signSpaceHeight}px` }}>{tpl.sign3_title}<span>{tpl.sign3_name}</span></div>
        <div style={{ height: `${signSpaceHeight}px` }}>{tpl.sign4_title}<span>{signer4Name}</span></div>
      </div>
    </div>
  );
};
export default PaymentPrintSheet;
