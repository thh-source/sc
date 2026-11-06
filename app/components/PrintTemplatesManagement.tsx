"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { PaymentPrintTemplate, PaymentRequestEntry, PaymentDetailLine, PaymentHandoverItem, Supplier } from "../types";
import {
  DEFAULT_PAYMENT_TEMPLATE,
  fmtMoney,
  moneyWords,
  localToday,
  parsePrintDate,
  PHENIKAA_PHARMA_LOGO_BASE64,
} from "../payment-utils";
import "../payment.css";

const PHENIKAA_LOGO_SRC = PHENIKAA_PHARMA_LOGO_BASE64;

export interface PrintTemplatesManagementProps {
  paymentTemplate?: PaymentPrintTemplate;
  onUpdateTemplate?: (template: PaymentPrintTemplate) => void;
  onUpdateState?: (patch: { paymentTemplate?: PaymentPrintTemplate }) => void;
  sampleRequest?: PaymentRequestEntry | null;
  suppliers?: Supplier[];
  readOnly?: boolean;
}

export function PrintTemplatesManagement({
  paymentTemplate = DEFAULT_PAYMENT_TEMPLATE,
  onUpdateTemplate,
  onUpdateState,
  sampleRequest,
  suppliers = [],
  readOnly = false,
}: PrintTemplatesManagementProps) {
  const [selectedTpl, setSelectedTpl] = useState<"01-TT" | "handover">("01-TT");
  const [tplForm, setTplForm] = useState<PaymentPrintTemplate>(
    paymentTemplate || DEFAULT_PAYMENT_TEMPLATE
  );

  useEffect(() => {
    if (paymentTemplate) {
      setTplForm(paymentTemplate);
    }
  }, [paymentTemplate]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printType, setPrintType] = useState<"01-TT" | "handover">("01-TT");
  const printTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (printTimerRef.current) clearTimeout(printTimerRef.current);
    };
  }, []);

  const sampleReq: PaymentRequestEntry = useMemo(() => {
    if (sampleRequest) return sampleRequest;
    return {
      id: 999,
      legacy_stt: "01",
      payee_name: "Công ty Cổ phần Công nghệ và Giải pháp ABC",
      address: "Số 123 Đường Cầu Giấy, P. Dịch Vọng, Q. Cầu Giấy, TP. Hà Nội",
      account_no: "19035678901234",
      bank: "Techcombank - Chi nhánh Thăng Long",
      description: "Thanh toán tiền vật tư, nguyên phụ liệu sản xuất theo HĐ đợt 1",
      item_name: "Nguyên phụ liệu dược phẩm lô A-01",
      invoice_no: "HD-001289",
      invoice_date: "15/10/2026",
      payment_type: "Chuyển khoản",
      status: "Done",
      request_date: localToday(),
      amount: "45000000",
      currency: "VND",
      documents: ["Hóa đơn điện tử GTGT", "Biên bản nghiệm thu", "Hợp đồng mua bán"],
      lines: [
        { description: "Nguyên phụ liệu dược phẩm lô A-01", invoice_no: "HD-001289", invoice_date: "15/10/2026", amount: 25000000, note: "" },
        { description: "Bao bì và tá dược GMP", invoice_no: "HD-001290", invoice_date: "16/10/2026", amount: 20000000, note: "" },
      ],
      created_by_name: tplForm.default_requester_name || "Trần Hải Hà",
    };
  }, [sampleRequest, tplForm.default_requester_name]);

  const sampleHandoverItems: PaymentHandoverItem[] = useMemo(() => [
    { id: 1, department: "Sản xuất", item_name: "Van bi inox vi sinh DN25", unit: "Cái", quantity_doc: 4, quantity_pass: 4, quantity_fail: 0, note: "Mới 100%", handover_date: localToday() },
    { id: 2, department: "Sản xuất", item_name: "Gioăng cao su EPDM chịu nhiệt", unit: "Bộ", quantity_doc: 10, quantity_pass: 10, quantity_fail: 0, note: "Kèm CO/CQ", handover_date: localToday() },
    { id: 3, department: "Sản xuất", item_name: "Cảm biến áp suất 0-10 bar", unit: "Chiếc", quantity_doc: 2, quantity_pass: 2, quantity_fail: 0, note: "Đạt kiểm định", handover_date: localToday() },
  ], []);

  const fullPayeeName = useMemo(() => {
    const raw = sampleReq.payee_name || "";
    const pNameNorm = raw.trim().toLowerCase();
    const matchedSupplier = suppliers?.find(
      (s) =>
        (s.shortName && s.shortName.trim().toLowerCase() === pNameNorm) ||
        (s.name && s.name.trim().toLowerCase() === pNameNorm) ||
        (s.code && s.code.trim().toLowerCase() === pNameNorm)
    );
    return matchedSupplier?.name || raw;
  }, [sampleReq.payee_name, suppliers]);

  const handleSave = () => {
    if (readOnly) return;
    if (onUpdateTemplate) onUpdateTemplate(tplForm);
    if (onUpdateState) onUpdateState({ paymentTemplate: tplForm });
    alert("Đã lưu cấu hình mẫu phiếu thành công!");
  };

  const handleReset = () => {
    if (readOnly) return;
    if (confirm("Khôi phục toàn bộ trường về mẫu mặc định chuẩn của Phenikaa?")) {
      setTplForm(DEFAULT_PAYMENT_TEMPLATE);
      if (onUpdateTemplate) onUpdateTemplate(DEFAULT_PAYMENT_TEMPLATE);
      if (onUpdateState) onUpdateState({ paymentTemplate: DEFAULT_PAYMENT_TEMPLATE });
    }
  };

  const handlePrintSample = (type: "01-TT" | "handover") => {
    setPrintType(type);
    setIsPrinting(true);
    if (printTimerRef.current) clearTimeout(printTimerRef.current);
    printTimerRef.current = setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  const dateParts = parsePrintDate(sampleReq.request_date);
  const cur = String(sampleReq.currency || "VND").toUpperCase();
  const words = moneyWords({ amount: sampleReq.amount, currency: cur });
  const lines: PaymentDetailLine[] = (sampleReq.lines && sampleReq.lines.length > 0) ? sampleReq.lines : [
    { description: sampleReq.description || sampleReq.item_name || "", invoice_no: sampleReq.invoice_no || "", invoice_date: sampleReq.invoice_date || "", amount: sampleReq.amount, note: "" },
  ];

  return (
    <section className="content payment-management">
      {/* Top Heading */}
      <div className="heading">
        <div>
          <em>QUẢN TRỊ BIỂU MẪU · CẤU HÌNH & XEM THỬ</em>
          <h1>Quản lý & Tùy biến mẫu phiếu in</h1>
          <p>
            Chỉnh sửa toàn bộ tiêu đề, nhãn trường, câu chữ, chức danh và họ tên 4 người ký. Mọi thay đổi sẽ tự động áp dụng khi xuất bản in PDF và máy in.
          </p>
        </div>
        <div className="actions">
          <button className="payment-btn btn-primary" onClick={handleSave}>
            💾 Lưu cấu hình mẫu
          </button>
          <button className="payment-btn" onClick={() => handlePrintSample(selectedTpl)}>
            ⎙ In thử mẫu này
          </button>
          <button className="payment-btn btn-danger" onClick={handleReset}>
            ↺ Khôi phục gốc
          </button>
        </div>
      </div>

      {/* Template Selector Tabs */}
      <div className="payment-tabs">
        <button
          className={`payment-tab-btn ${selectedTpl === "01-TT" ? "active" : ""}`}
          onClick={() => setSelectedTpl("01-TT")}
        >
          📄 Mẫu 01 – TT: Giấy đề nghị thanh toán
        </button>
        <button
          className={`payment-tab-btn ${selectedTpl === "handover" ? "active" : ""}`}
          onClick={() => setSelectedTpl("handover")}
        >
          📦 Biên bản bàn giao, nghiệm thu vật tư (02 bản)
        </button>
      </div>

      {/* TEMPLATE 1: MẪU 01-TT */}
      {selectedTpl === "01-TT" && (
        <div className="tpl-container">
          {/* Cột trái: Form cấu hình chi tiết */}
          <div className="tpl-form-col" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* 1. Tiêu đề & Đơn vị */}
            <div className="tpl-card">
              <h3>🏢 1. Tiêu đề & Đơn vị phát hành</h3>
              <div className="tpl-field">
                <label>Tên đơn vị / Công ty (Dòng trên cùng bên trái)</label>
                <input
                  value={tplForm.company_name}
                  onChange={(e) => setTplForm({ ...tplForm, company_name: e.target.value })}
                  placeholder="CÔNG TY CỔ PHẦN DƯỢC PHẨM PHENIKAA"
                />
              </div>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Ký hiệu mẫu</label>
                  <input
                    value={tplForm.form_code}
                    onChange={(e) => setTplForm({ ...tplForm, form_code: e.target.value })}
                    placeholder="Mẫu số 01 – TT"
                  />
                </div>
                <div className="tpl-field">
                  <label>Địa danh (Ví dụ: Hà Nội)</label>
                  <input
                    value={tplForm.date_location}
                    onChange={(e) => setTplForm({ ...tplForm, date_location: e.target.value })}
                    placeholder="Hà Nội"
                  />
                </div>
              </div>
              <div className="tpl-field">
                <label>Tiêu đề chính của văn bản</label>
                <input
                  value={tplForm.form_title}
                  onChange={(e) => setTplForm({ ...tplForm, form_title: e.target.value })}
                  placeholder="GIẤY ĐỀ NGHỊ THANH TOÁN BẰNG CHUYỂN KHOẢN"
                />
              </div>
            </div>

            {/* 2. Nhãn các trường nội dung */}
            <div className="tpl-card">
              <h3>🏷️ 2. Nhãn các trường nội dung</h3>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Nhãn phần Kính gửi</label>
                  <input
                    value={tplForm.recipient_label}
                    onChange={(e) => setTplForm({ ...tplForm, recipient_label: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Nội dung Kính gửi mặc định</label>
                  <input
                    value={tplForm.recipients}
                    onChange={(e) => setTplForm({ ...tplForm, recipients: e.target.value })}
                  />
                </div>
              </div>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Nhãn người đề nghị</label>
                  <input
                    value={tplForm.label_requester}
                    onChange={(e) => setTplForm({ ...tplForm, label_requester: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Họ tên người đề nghị mặc định</label>
                  <input
                    value={tplForm.default_requester_name}
                    onChange={(e) =>
                      setTplForm({ ...tplForm, default_requester_name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Nhãn bộ phận</label>
                  <input
                    value={tplForm.label_department}
                    onChange={(e) => setTplForm({ ...tplForm, label_department: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Tên bộ phận mặc định</label>
                  <input
                    value={tplForm.department_name}
                    onChange={(e) => setTplForm({ ...tplForm, department_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Nhãn đơn vị hưởng lợi</label>
                  <input
                    value={tplForm.label_payee}
                    onChange={(e) => setTplForm({ ...tplForm, label_payee: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Nhãn số tài khoản</label>
                  <input
                    value={tplForm.label_account}
                    onChange={(e) => setTplForm({ ...tplForm, label_account: e.target.value })}
                  />
                </div>
              </div>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Nhãn ngân hàng</label>
                  <input
                    value={tplForm.label_bank}
                    onChange={(e) => setTplForm({ ...tplForm, label_bank: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Nhãn nội dung chuyển tiền</label>
                  <input
                    value={tplForm.label_description}
                    onChange={(e) => setTplForm({ ...tplForm, label_description: e.target.value })}
                  />
                </div>
              </div>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Nhãn thời hạn chuyển tiền</label>
                  <input
                    value={tplForm.deadline_label}
                    onChange={(e) => setTplForm({ ...tplForm, deadline_label: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Giá trị thời hạn mặc định</label>
                  <input
                    value={tplForm.deadline_val}
                    onChange={(e) => setTplForm({ ...tplForm, deadline_val: e.target.value })}
                  />
                </div>
              </div>
              <div className="tpl-field">
                <label>Nhãn số tiền bằng chữ</label>
                <input
                  value={tplForm.label_money_words}
                  onChange={(e) => setTplForm({ ...tplForm, label_money_words: e.target.value })}
                />
              </div>
              <div className="tpl-field">
                <label>Nhãn chứng từ đi kèm</label>
                <input
                  value={tplForm.label_docs}
                  onChange={(e) => setTplForm({ ...tplForm, label_docs: e.target.value })}
                />
              </div>
            </div>

            {/* 3. 4 Chữ ký */}
            <div className="tpl-card">
              <h3>✍️ 3. Cấu hình 4 chức danh & người ký</h3>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Ký 1 (Trái): Chức danh</label>
                  <input
                    value={tplForm.sign1_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign1_title: e.target.value })}
                  />
                  <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                  <input
                    value={tplForm.sign1_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign1_name: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Ký 2: Chức danh</label>
                  <input
                    value={tplForm.sign2_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign2_title: e.target.value })}
                  />
                  <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                  <input
                    value={tplForm.sign2_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign2_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="tpl-grid-2">
                <div className="tpl-field">
                  <label>Ký 3: Chức danh</label>
                  <input
                    value={tplForm.sign3_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign3_title: e.target.value })}
                  />
                  <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                  <input
                    value={tplForm.sign3_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign3_name: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Ký 4 (Phải): Chức danh</label>
                  <input
                    value={tplForm.sign4_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign4_title: e.target.value })}
                  />
                  <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                  <input
                    value={tplForm.sign4_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign4_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="tpl-field" style={{ marginTop: "10px" }}>
                <label>Khoảng trống vùng ký (Chiều cao px, mặc định 130px)</label>
                <input
                  type="number"
                  min="60"
                  max="300"
                  value={tplForm.sign_space_height ?? 130}
                  onChange={(e) => setTplForm({ ...tplForm, sign_space_height: Number(e.target.value) || 130 })}
                />
              </div>
            </div>

            {/* Bottom action buttons */}
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button className="payment-btn btn-primary" onClick={handleSave}>
                💾 Lưu cấu hình mẫu phiếu
              </button>
              <button className="payment-btn" onClick={() => handlePrintSample("01-TT")}>
                ⎙ In thử ngay
              </button>
              <button className="payment-btn btn-danger" onClick={handleReset}>
                ↺ Khôi phục mẫu gốc
              </button>
            </div>
          </div>

          {/* Cột phải: Live scaled preview paper */}
          <div className="tpl-preview-box">
            <div className="tpl-preview-header">
              <span>👁️ Xem trước trực tiếp bản in A4 (Mẫu 01-TT)</span>
              <button
                type="button"
                className="payment-btn"
                style={{ padding: "4px 10px", fontSize: "11px" }}
                onClick={() => handlePrintSample("01-TT")}
              >
                ⎙ In thử
              </button>
            </div>
            <div className="tpl-preview-wrap">
              <div className="tpl-preview-scale">
                <PaymentPrintSheet req={sampleReq} tpl={tplForm} suppliers={suppliers} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE 2: BIÊN BẢN BÀN GIAO */}
      {selectedTpl === "handover" && (
        <div className="tpl-container">
          <div className="tpl-form-col" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="tpl-card">
              <h3>🏢 Thông tin biểu mẫu Biên bản bàn giao</h3>
              <div className="tpl-field">
                <label>Tên đơn vị</label>
                <input value={tplForm.company_name} readOnly disabled style={{ background: "#f8fafc" }} />
              </div>
              <div className="tpl-field">
                <label>Bộ phận giao hàng</label>
                <input value="Phòng Cung ứng" readOnly disabled style={{ background: "#f8fafc" }} />
              </div>
              <div className="tpl-field">
                <label>Người giao hàng mặc định</label>
                <input
                  value={tplForm.default_requester_name || "Trần Hải Hà"}
                  onChange={(e) => setTplForm({ ...tplForm, default_requester_name: e.target.value })}
                />
              </div>
              <div className="tpl-field">
                <label>Địa chỉ công ty / nhà máy</label>
                <input
                  value="Lô đất CN2-10, KCN Công nghệ cao 2, KCNC Hòa Lạc, Xã Hòa Lạc, TP Hà Nội"
                  readOnly
                  disabled
                  style={{ background: "#f8fafc" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button className="payment-btn btn-primary" onClick={handleSave}>
                💾 Lưu cấu hình
              </button>
              <button className="payment-btn" onClick={() => handlePrintSample("handover")}>
                ⎙ In thử biên bản này (2 bản)
              </button>
            </div>
          </div>

          <div className="tpl-preview-box">
            <div className="tpl-preview-header">
              <span>👁️ Xem trước trực tiếp Biên bản bàn giao (02 bản kèm Logo)</span>
              <button
                type="button"
                className="payment-btn"
                style={{ padding: "4px 10px", fontSize: "11px" }}
                onClick={() => handlePrintSample("handover")}
              >
                ⎙ In thử
              </button>
            </div>
            <div className="tpl-preview-wrap">
              <div className="tpl-preview-scale">
                {[1, 2].map((copyNum) => (
                  <div key={copyNum} className="handover-paper paper" style={{ marginBottom: "16px" }}>
                    <table className="hb-box">
                      <tbody>
                        <tr>
                          <td className="hb-box-left">
                            <div className="hb-logo">
                              <img
                                src={PHENIKAA_LOGO_SRC}
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
                            <div className="hb-sender-dept">Bộ phận: Sản xuất</div>
                          </td>
                          <td className="hb-box-right">
                            <div className="hb-title-main">BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,</div>
                            <div className="hb-title-main">HÀNG HÓA</div>
                            <div className="hb-title-sub">(Không qua kho)</div>
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
                      <div className="hb-line">Chúng tôi gồm:</div>
                      <div className="hb-two-col">
                        <div>Ông (bà): {tplForm.default_requester_name || "Trần Hải Hà"} - Người giao hàng</div>
                        <div>Địa chỉ: Phòng Cung ứng</div>
                      </div>
                      <div className="hb-two-col">
                        <div>Ông (bà): .................................................... Người nhận hàng</div>
                        <div>Địa chỉ: Sản xuất</div>
                      </div>
                      <div className="hb-line">Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư:</div>
                    </div>

                    <table className="hb-table">
                      <thead>
                        <tr>
                          <th style={{ width: "40px" }}>STT</th>
                          <th>Tên hàng hóa - Quy cách</th>
                          <th style={{ width: "55px" }}>ĐVT</th>
                          <th style={{ width: "85px" }}>SL theo<br />chứng từ</th>
                          <th style={{ width: "80px" }}>SL kiểm tra<br />Đạt</th>
                          <th style={{ width: "80px" }}>SL kiểm tra<br />K.Đạt</th>
                          <th style={{ width: "80px" }}>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sampleHandoverItems.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="center">{idx + 1}</td>
                            <td className="left" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                              {it.item_name || ""}
                            </td>
                            <td className="center">{it.unit || ""}</td>
                            <td className="center">{it.quantity_doc || ""}</td>
                            <td className="center">{it.quantity_pass || ""}</td>
                            <td className="center">{it.quantity_fail || ""}</td>
                            <td className="center">{it.note || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="hb-footer">
                      <div className="hb-conclusion-title">Kết luận:</div>
                      <div className="hb-conclusion-body">
                        Biên bản này được lập thành 02 bản, 01 bản giao cho người giao hàng; 01 bản giao cho người nhận hàng.
                      </div>
                      <div className="hb-sign-row">
                        <div className="hb-sign-col">
                          Người giao hàng<br />
                          <i>(Ký, ghi rõ họ tên)</i>
                        </div>
                        <div className="hb-sign-col">
                          Người nhận hàng<br />
                          <i>(Ký, ghi rõ họ tên)</i>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PORTAL PRINT CONTAINER - Completely isolated from app */}
      {typeof document !== "undefined" && isPrinting && createPortal(
        <div id="paymentPrintPortal">
          {printType === "01-TT" ? (
            <PaymentPrintSheet req={sampleReq} tpl={tplForm} suppliers={suppliers} />
          ) : (
            <div>
              {[1, 2].map((copyNum) => (
                <div key={copyNum} className="handover-paper paper">
                  <table className="hb-box">
                    <tbody>
                      <tr>
                        <td className="hb-box-left">
                          <div className="hb-logo">
                            <img
                              src={PHENIKAA_LOGO_SRC}
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
                          <div className="hb-sender-dept">Bộ phận: Sản xuất</div>
                        </td>
                        <td className="hb-box-right">
                          <div className="hb-title-main">BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,</div>
                          <div className="hb-title-main">HÀNG HÓA</div>
                          <div className="hb-title-sub">(Không qua kho)</div>
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
                    <div className="hb-line">Chúng tôi gồm:</div>
                    <div className="hb-two-col">
                      <div>Ông (bà): {tplForm.default_requester_name || "Trần Hải Hà"} - Người giao hàng</div>
                      <div>Địa chỉ: Phòng Cung ứng</div>
                    </div>
                    <div className="hb-two-col">
                      <div>Ông (bà): .................................................... Người nhận hàng</div>
                      <div>Địa chỉ: Sản xuất</div>
                    </div>
                    <div className="hb-line">Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư:</div>
                  </div>

                  <table className="hb-table">
                    <thead>
                      <tr>
                        <th style={{ width: "40px" }}>STT</th>
                        <th>Tên hàng hóa - Quy cách</th>
                        <th style={{ width: "55px" }}>ĐVT</th>
                        <th style={{ width: "85px" }}>SL theo<br />chứng từ</th>
                        <th style={{ width: "80px" }}>SL kiểm tra<br />Đạt</th>
                        <th style={{ width: "80px" }}>SL kiểm tra<br />K.Đạt</th>
                        <th style={{ width: "80px" }}>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampleHandoverItems.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td className="center">{idx + 1}</td>
                          <td className="left" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                            {it.item_name || ""}
                          </td>
                          <td className="center">{it.unit || ""}</td>
                          <td className="center">{it.quantity_doc || ""}</td>
                          <td className="center">{it.quantity_pass || ""}</td>
                          <td className="center">{it.quantity_fail || ""}</td>
                          <td className="center">{it.note || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="hb-footer">
                    <div className="hb-conclusion-title">Kết luận:</div>
                    <div className="hb-conclusion-body">
                      Biên bản này được lập thành 02 bản, 01 bản giao cho người giao hàng; 01 bản giao cho người nhận hàng.
                    </div>
                    <div className="hb-sign-row">
                      <div className="hb-sign-col">
                        Người giao hàng<br />
                        <i>(Ký, ghi rõ họ tên)</i>
                      </div>
                      <div className="hb-sign-col">
                        Người nhận hàng<br />
                        <i>(Ký, ghi rõ họ tên)</i>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </section>
  );
}
