"use client";

import React, { useState, useMemo, useEffect, useRef, ChangeEvent } from "react";
import {
  PO,
  Supplier,
  PaymentRequestEntry,
  PaymentGroup,
  PaymentBeneficiary,
  PaymentHandoverItem,
  PaymentPrintTemplate,
  PaymentDetailLine,
} from "../types";
import {
  DEFAULT_PAYMENT_TEMPLATE,
  PAID_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  DEFAULT_DOCS,
  fmtMoney,
  moneyWords,
  normName,
  localToday,
  parsePrintDate,
  printEntries,
} from "../payment-utils";
import "../payment.css";

const PHENIKAA_LOGO_SRC = "/phenikaa-pharma-logo.png";

const BANK_SUGGESTIONS = [
  "Vietcombank",
  "Techcombank",
  "BIDV",
  "Vietinbank",
  "MB Bank",
  "VPBank",
  "ACB",
  "Sacombank",
  "HDBank",
  "TPBank",
  "Agribank",
  "VIB",
  "SHB",
  "Eximbank",
  "MSB",
  "SeABank",
  "OCB",
  "Bac A Bank",
];

export function PaymentManagement({
  paymentRequests = [],
  paymentGroups = [],
  paymentBeneficiaries = [],
  paymentHandovers = [],
  paymentTemplate = DEFAULT_PAYMENT_TEMPLATE,
  pos = [],
  suppliers = [],
  onUpdateState,
  readOnly = false,
}: {
  paymentRequests?: PaymentRequestEntry[];
  paymentGroups?: PaymentGroup[];
  paymentBeneficiaries?: PaymentBeneficiary[];
  paymentHandovers?: PaymentHandoverItem[];
  paymentTemplate?: PaymentPrintTemplate;
  pos?: PO[];
  suppliers?: Supplier[];
  onUpdateState: (patch: {
    paymentRequests?: PaymentRequestEntry[];
    paymentGroups?: PaymentGroup[];
    paymentBeneficiaries?: PaymentBeneficiary[];
    paymentHandovers?: PaymentHandoverItem[];
    paymentTemplate?: PaymentPrintTemplate;
  }) => void;
  readOnly?: boolean;
}) {
  // Page Tab state
  const [activeTab, setActiveTab] = useState<
    "data" | "groups" | "handover" | "ncc" | "template"
  >("data");

  // Selection states
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [activeRequestId, setActiveRequestId] = useState<number | null>(
    paymentRequests[0]?.id ?? null
  );

  // Filter states for DATA page
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [freezeCol, setFreezeCol] = useState(2); // 2: STT, 3: NCC, 4: Group, 7: InvoiceNo, 8: InvoiceDate, 0: None

  // Handover selection & filter
  const [checkedHandovers, setCheckedHandovers] = useState<Set<number>>(new Set());
  const [handoverDeptFilter, setHandoverDeptFilter] = useState("");
  const [handoverSearch, setHandoverSearch] = useState("");

  // Modals state
  const [docModalReqId, setDocModalReqId] = useState<number | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [customDocTypes, setCustomDocTypes] = useState<string[]>(DEFAULT_DOCS);

  const [showPOPickerModal, setShowPOPickerModal] = useState(false);
  const [poSearch, setPoSearch] = useState("");

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteParsedRows, setPasteParsedRows] = useState<any[]>([]);

  // Preview Modals
  const [previewPaymentReq, setPreviewPaymentReq] = useState<PaymentRequestEntry | null>(null);
  const [previewHandoverDept, setPreviewHandoverDept] = useState<string | null>(null);
  const [previewHandoverItems, setPreviewHandoverItems] = useState<PaymentHandoverItem[]>([]);

  // Template form state
  const [tplForm, setTplForm] = useState<PaymentPrintTemplate>(
    paymentTemplate || DEFAULT_PAYMENT_TEMPLATE
  );

  useEffect(() => {
    if (paymentTemplate) {
      setTplForm(paymentTemplate);
    }
  }, [paymentTemplate]);

  // Keep activeRequestId valid
  useEffect(() => {
    if (activeRequestId === null && paymentRequests.length > 0) {
      setActiveRequestId(paymentRequests[0].id);
    }
  }, [paymentRequests, activeRequestId]);

  // Active Request
  const activeReq = useMemo(
    () => paymentRequests.find((r) => r.id === activeRequestId) || paymentRequests[0] || null,
    [paymentRequests, activeRequestId]
  );

  // Group calculations
  const groupTotalsMap = useMemo(() => {
    const map = new Map<string, { paid: number; pending: number; count: number }>();
    for (const g of paymentGroups) {
      map.set(String(g.id), { paid: 0, pending: 0, count: 0 });
    }
    for (const r of paymentRequests) {
      const gId = String(r.group_id || "");
      const amt = Number(String(r.amount || 0).replace(/,/g, "")) || 0;
      if (gId && map.has(gId)) {
        const item = map.get(gId)!;
        item.count += 1;
        if (PAID_STATUSES.includes(r.status)) {
          item.paid += amt;
        } else {
          item.pending += amt;
        }
      }
    }
    return map;
  }, [paymentGroups, paymentRequests]);

  // Metric summaries
  const metrics = useMemo(() => {
    let totalPaidVND = 0;
    let totalPendingVND = 0;
    let totalCount = paymentRequests.length;
    let paidCount = 0;

    for (const r of paymentRequests) {
      const amt = Number(String(r.amount || 0).replace(/,/g, "")) || 0;
      const cur = String(r.currency || "VND").toUpperCase();
      if (cur === "VND") {
        if (PAID_STATUSES.includes(r.status)) {
          totalPaidVND += amt;
          paidCount += 1;
        } else {
          totalPendingVND += amt;
        }
      }
    }

    return {
      totalCount,
      paidCount,
      totalPaidVND,
      totalPendingVND,
      handoverCount: paymentHandovers.length,
      groupsCount: paymentGroups.length,
    };
  }, [paymentRequests, paymentHandovers, paymentGroups]);

  // Combined Beneficiaries with Suppliers
  const allBeneficiaries = useMemo(() => {
    const list: PaymentBeneficiary[] = [...paymentBeneficiaries];
    const existingNames = new Set(list.map((b) => normName(b.name)));

    for (const s of suppliers) {
      if (!existingNames.has(normName(s.name))) {
        list.push({
          id: -s.id, // negative for supplier ref
          name: s.name,
          short_name: s.shortName || "",
          address: s.address,
          account_no: s.bankAccount,
          bank: s.bank,
        });
        existingNames.add(normName(s.name));
      }
    }
    return list;
  }, [paymentBeneficiaries, suppliers]);

  // Handover departments list
  const handoverDepts = useMemo(() => {
    const set = new Set<string>();
    for (const h of paymentHandovers) {
      const d = String(h.department || "").trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort();
  }, [paymentHandovers]);

  // Filtered requests for DATA table
  const filteredRequests = useMemo(() => {
    const q = normName(searchQuery);
    return paymentRequests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (groupFilter && String(r.group_id || "") !== String(groupFilter)) return false;
      if (q) {
        const text = [
          r.payee_name,
          r.group_code,
          r.description,
          r.item_name,
          r.invoice_no,
          r.legacy_stt,
          r.bank,
          r.account_no,
          r.amount,
        ]
          .join(" ")
          .toLowerCase();
        if (!normName(text).includes(q)) return false;
      }
      return true;
    });
  }, [paymentRequests, searchQuery, statusFilter, groupFilter]);

  // Handlers for Request edits
  const handleEditRequest = (id: number, key: keyof PaymentRequestEntry, val: any) => {
    if (readOnly) return;
    const next = paymentRequests.map((r) => {
      if (r.id === id) {
        const updated = { ...r, [key]: val };
        // Auto fill supplier info when payee_name changes
        if (key === "payee_name") {
          const match = allBeneficiaries.find(
            (b) =>
              normName(b.name) === normName(val) ||
              (b.short_name && normName(b.short_name) === normName(val))
          );
          if (match) {
            if (!updated.address && match.address) updated.address = match.address;
            if (!updated.account_no && match.account_no) updated.account_no = match.account_no;
            if (!updated.bank && match.bank) updated.bank = match.bank;
          }
        }
        // Auto fill group_code when group_id changes
        if (key === "group_id") {
          const g = paymentGroups.find((x) => String(x.id) === String(val));
          if (g) updated.group_code = g.code;
        }
        return updated;
      }
      return r;
    });
    onUpdateState({ paymentRequests: next });
  };

  const handleAddRequestRow = () => {
    if (readOnly) return;
    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt) || 0)) + 1;
    const newReq: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: String(maxStt).padStart(2, "0"),
      payee_name: "",
      group_code: "",
      description: "",
      item_name: "",
      invoice_no: "",
      invoice_date: "",
      amount: "0",
      currency: "VND",
      documents: ["ĐNTT", "Hóa đơn"],
      request_date: localToday(),
      payment_type: "TT trước 100%",
      status: "Đã giao KT, chờ đi tiền",
      address: "",
      account_no: "",
      bank: "",
      lines: [],
    };
    const next = [newReq, ...paymentRequests];
    onUpdateState({ paymentRequests: next });
    setActiveRequestId(maxId);
  };

  const handleDeleteSelectedRequests = () => {
    if (readOnly) return;
    if (checkedIds.size === 0 && activeRequestId === null) {
      alert("Vui lòng tích chọn dòng cần xóa");
      return;
    }
    const toDelete = checkedIds.size > 0 ? checkedIds : new Set([activeRequestId!]);
    if (!confirm(`Bạn có chắc muốn xóa ${toDelete.size} dòng đề nghị thanh toán đã chọn?`))
      return;

    const next = paymentRequests.filter((r) => !toDelete.has(r.id));
    onUpdateState({ paymentRequests: next });
    setCheckedIds(new Set());
    if (activeRequestId && toDelete.has(activeRequestId)) {
      setActiveRequestId(next[0]?.id ?? null);
    }
  };

  // Create request from PO
  const handleCreateFromPO = (po: PO) => {
    if (readOnly) return;
    const s = suppliers.find((x) => x.id === po.supplierId);
    const poTotal = po.items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt) || 0)) + 1;

    const itemNames = po.items.map((i) => i.name).slice(0, 3).join(", ");
    const lines: PaymentDetailLine[] = po.items.map((it) => ({
      description: it.name + (it.spec ? ` (${it.spec})` : ""),
      invoice_no: "",
      invoice_date: "",
      amount: it.qty * it.price,
    }));

    const newReq: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: String(maxStt).padStart(2, "0"),
      payee_name: s?.name || "",
      group_code: po.number,
      description: `Thanh toán tiền mua hàng theo đơn hàng PO ${po.number}`,
      item_name: itemNames,
      invoice_no: "",
      invoice_date: "",
      amount: poTotal,
      currency: "VND",
      documents: ["ĐNTT", "Hóa đơn", "Hợp đồng", "BB nghiệm thu"],
      request_date: localToday(),
      payment_type: "TT trước 100%",
      status: "Đã giao KT, chờ đi tiền",
      address: s?.address || "",
      account_no: s?.bankAccount || "",
      bank: s?.bank || "",
      lines,
    };

    // Also auto add to payment groups if not exists
    let nextGroups = [...paymentGroups];
    if (!nextGroups.some((g) => normName(g.code) === normName(po.number))) {
      const maxGId = Math.max(0, ...nextGroups.map((g) => Number(g.id) || 0)) + 1;
      nextGroups.push({
        id: maxGId,
        code: po.number,
        name: `Đơn hàng ${po.number} - ${s?.name || ""}`,
        payee_name: s?.name || "",
        total_amount: poTotal,
        currency: "VND",
      });
      newReq.group_id = maxGId;
    }

    const next = [newReq, ...paymentRequests];
    onUpdateState({ paymentRequests: next, paymentGroups: nextGroups });
    setActiveRequestId(maxId);
    setShowPOPickerModal(false);
    alert(`Đã lập Đề nghị thanh toán thành công từ PO ${po.number}!`);
  };

  // Handover actions
  const handleLoadExcelHandovers = async () => {
    if (readOnly) return;
    try {
      const res = await fetch("/handovers-data.json");
      if (!res.ok) throw new Error("Không thể tải file dữ liệu");
      const items: PaymentHandoverItem[] = await res.json();
      if (!Array.isArray(items) || items.length === 0) return;

      if (
        !confirm(
          `Bạn có muốn nạp ${items.length} danh mục vật tư Phenikaa gốc vào danh sách Bàn giao nội bộ?`
        )
      ) {
        return;
      }

      onUpdateState({ paymentHandovers: items });
      alert(`Đã nạp thành công ${items.length} vật tư bàn giao!`);
    } catch (e: any) {
      alert("Lỗi nạp dữ liệu: " + e.message);
    }
  };

  const handleAddHandoverRow = () => {
    if (readOnly) return;
    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    const newItem: PaymentHandoverItem = {
      id: maxId,
      department: handoverDeptFilter || "Phòng KHCU",
      item_name: "",
      unit: "Cái",
      quantity_doc: "1",
      quantity_pass: "1",
      quantity_fail: "",
      note: "",
      handover_date: localToday(),
      sender_name: "Trần Hải Hà",
      sender_dept: "Phòng KHCU",
      receiver_name: "",
    };
    onUpdateState({ paymentHandovers: [newItem, ...paymentHandovers] });
  };

  const handleEditHandover = (id: number, key: keyof PaymentHandoverItem, val: any) => {
    if (readOnly) return;
    const next = paymentHandovers.map((h) => (h.id === id ? { ...h, [key]: val } : h));
    onUpdateState({ paymentHandovers: next });
  };

  const handleDeleteHandover = (id: number) => {
    if (readOnly) return;
    if (!confirm("Bạn có chắc muốn xóa vật tư này?")) return;
    const next = paymentHandovers.filter((h) => h.id !== id);
    onUpdateState({ paymentHandovers: next });
  };

  const handleDeleteSelectedHandovers = () => {
    if (readOnly) return;
    if (checkedHandovers.size === 0) {
      alert("Vui lòng tích chọn các dòng vật tư cần xóa");
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa ${checkedHandovers.size} vật tư đã chọn?`)) return;
    const next = paymentHandovers.filter((h) => !checkedHandovers.has(h.id));
    onUpdateState({ paymentHandovers: next });
    setCheckedHandovers(new Set());
  };

  // Filtered handovers
  const filteredHandovers = useMemo(() => {
    const q = normName(handoverSearch);
    return paymentHandovers.filter((h) => {
      if (handoverDeptFilter && String(h.department || "").trim() !== handoverDeptFilter) {
        return false;
      }
      if (q) {
        const text = [h.department, h.item_name, h.unit, h.note].join(" ");
        if (!normName(text).includes(q)) return false;
      }
      return true;
    });
  }, [paymentHandovers, handoverDeptFilter, handoverSearch]);

  // Paste parsing from Excel
  const handleParsePaste = (text: string) => {
    setPasteText(text);
    if (!text.trim()) {
      setPasteParsedRows([]);
      return;
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parsed = lines.map((l, idx) => {
      const cols = l.split("\t");
      return {
        id: idx + 1,
        department: cols[0]?.trim() || handoverDeptFilter || "Phòng KHCU",
        item_name: cols[1]?.trim() || "",
        unit: cols[2]?.trim() || "Cái",
        quantity_doc: cols[3]?.trim() || "1",
        quantity_pass: cols[4]?.trim() || "",
        quantity_fail: cols[5]?.trim() || "",
        note: cols[6]?.trim() || "",
      };
    });
    setPasteParsedRows(parsed);
  };

  const handleApplyPaste = () => {
    if (readOnly || pasteParsedRows.length === 0) return;
    let maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0));
    const newItems: PaymentHandoverItem[] = pasteParsedRows.map((r) => {
      maxId++;
      return {
        id: maxId,
        department: r.department,
        item_name: r.item_name,
        unit: r.unit,
        quantity_doc: r.quantity_doc,
        quantity_pass: r.quantity_pass || r.quantity_doc,
        quantity_fail: r.quantity_fail,
        note: r.note,
        handover_date: localToday(),
        sender_name: "Trần Hải Hà",
        sender_dept: "Phòng KHCU",
      };
    });
    onUpdateState({ paymentHandovers: [...newItems, ...paymentHandovers] });
    setShowPasteModal(false);
    setPasteText("");
    setPasteParsedRows([]);
    alert(`Đã thêm thành công ${newItems.length} vật tư từ nội dung đã dán!`);
  };

  // Print Handover
  const handlePreviewHandover = () => {
    let itemsToPrint = [];
    if (checkedHandovers.size > 0) {
      itemsToPrint = paymentHandovers.filter((h) => checkedHandovers.has(h.id));
    } else if (handoverDeptFilter) {
      itemsToPrint = paymentHandovers.filter(
        (h) => String(h.department || "").trim() === handoverDeptFilter
      );
    } else {
      itemsToPrint = filteredHandovers;
    }

    if (itemsToPrint.length === 0) {
      alert("Vui lòng tích chọn vật tư hoặc chọn bộ phận nhận để xem trước biên bản");
      return;
    }

    setPreviewHandoverDept(itemsToPrint[0]?.department || "Bộ phận nhận");
    setPreviewHandoverItems(itemsToPrint);
  };

  // Direct trigger window.print
  const handlePrintDocument = () => {
    window.print();
  };

  return (
    <section className="content payment-management">
      {/* Top Heading */}
      <div className="heading">
        <div>
          <em>QUẢN LÝ TÀI CHÍNH · THANH TOÁN & BÀN GIAO</em>
          <h1>Đề nghị thanh toán (Mẫu 01 – TT) & Bàn giao</h1>
          <p>
            Theo dõi đề nghị chuyển khoản, nhóm giải ngân hợp đồng và biên bản bàn giao
            nội bộ Phenikaa.
          </p>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => setShowPOPickerModal(true)}>
            ⚡ Lập từ PO
          </button>
          <button
            className="btn"
            onClick={() => {
              if (activeReq) {
                setPreviewPaymentReq(activeReq);
              } else {
                alert("Vui lòng chọn 1 đề nghị thanh toán");
              }
            }}
          >
            ⎙ Xem trước Mẫu 01-TT
          </button>
          <button className="btn" onClick={handlePrintDocument}>
            🖨️ In trang / In PDF
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="payment-summary-cards">
        <div className="payment-card card-primary">
          <div className="payment-card-label">Tổng đề nghị thanh toán</div>
          <div className="payment-card-value">{metrics.totalCount} phiếu</div>
          <div className="payment-card-sub">
            {metrics.paidCount} phiếu đã giải ngân xong
          </div>
        </div>

        <div className="payment-card card-success">
          <div className="payment-card-label">Đã thanh toán (Hoàn tất)</div>
          <div className="payment-card-value">{fmtMoney(metrics.totalPaidVND)} ₫</div>
          <div className="payment-card-sub">Các phiếu đã chuyển tiền & đủ chứng từ</div>
        </div>

        <div className="payment-card card-warning">
          <div className="payment-card-label">Chờ kế toán / Đi tiền</div>
          <div className="payment-card-value">{fmtMoney(metrics.totalPendingVND)} ₫</div>
          <div className="payment-card-sub">Các phiếu đang chờ giải ngân</div>
        </div>

        <div className="payment-card card-info">
          <div className="payment-card-label">Hợp đồng & Bàn giao</div>
          <div className="payment-card-value">
            {metrics.groupsCount} HĐ · {metrics.handoverCount} VT
          </div>
          <div className="payment-card-sub">Theo dõi hợp đồng & biên bản giao nhận</div>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="payment-tabs">
        <button
          className={`payment-tab-btn ${activeTab === "data" ? "active" : ""}`}
          onClick={() => setActiveTab("data")}
        >
          📋 Bảng DATA · Thanh toán
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "groups" ? "active" : ""}`}
          onClick={() => setActiveTab("groups")}
        >
          📁 Nhóm hợp đồng / Đơn hàng
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "handover" ? "active" : ""}`}
          onClick={() => setActiveTab("handover")}
        >
          📦 Bàn giao nội bộ ({paymentHandovers.length})
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "ncc" ? "active" : ""}`}
          onClick={() => setActiveTab("ncc")}
        >
          🏢 Danh mục NCC / Thụ hưởng
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "template" ? "active" : ""}`}
          onClick={() => setActiveTab("template")}
        >
          ⚙️ Mẫu phiếu thanh toán (Mẫu 01-TT)
        </button>
      </div>

      {/* ===================== TAB 1: BẢNG DATA THANH TOÁN ===================== */}
      {activeTab === "data" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Toolbar */}
          <div className="payment-toolbar">
            <button className="payment-btn btn-primary" onClick={handleAddRequestRow}>
              ＋ Thêm đề nghị
            </button>
            <input
              placeholder="Tìm NCC, STT, nội dung, số HĐ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "240px" }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {PAYMENT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">Tất cả nhóm HĐ / PO</option>
              {paymentGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} ({g.name || g.payee_name || ""})
                </option>
              ))}
            </select>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "12px",
                color: "#1e3a5f",
                fontWeight: 600,
                background: "#f0f4f9",
                padding: "3px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
              }}
            >
              <span>📌 Cố định:</span>
              <select
                value={freezeCol}
                onChange={(e) => setFreezeCol(Number(e.target.value))}
                style={{
                  padding: "3px 6px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <option value="2">Cột STT</option>
                <option value="3">Đến NCC</option>
                <option value="4">Đến Nhóm PO</option>
                <option value="7">Đến Số HĐ</option>
                <option value="8">Đến Ngày HĐ</option>
                <option value="0">Không cố định</option>
              </select>
            </div>

            <button
              className="payment-btn"
              onClick={() => {
                if (activeReq) {
                  setPreviewPaymentReq(activeReq);
                } else {
                  alert("Vui lòng chọn 1 đề nghị thanh toán trong bảng");
                }
              }}
            >
              ⎙ Xem trước phiếu in
            </button>

            <button
              className="payment-btn btn-danger"
              onClick={handleDeleteSelectedRequests}
            >
              🗑️ Xóa dòng đã chọn
            </button>

            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
              {filteredRequests.length} / {paymentRequests.length} đề nghị
            </span>
          </div>

          {/* Datalists for autocompletion */}
          <datalist id="nccDataList">
            {allBeneficiaries.map((b) => (
              <option key={b.id} value={b.short_name || b.name}>
                {b.name}
              </option>
            ))}
          </datalist>

          <datalist id="bankDataList">
            {BANK_SUGGESTIONS.map((bn) => (
              <option key={bn} value={bn} />
            ))}
          </datalist>

          <datalist id="groupDataList">
            {paymentGroups.map((g) => (
              <option key={g.id} value={g.code}>
                {g.name}
              </option>
            ))}
          </datalist>

          {/* Data Table */}
          <div className="payment-table-container">
            <div className="payment-table-header">
              <span>DATA · Sửa trực tiếp từng ô (Tự động lưu vào hệ thống)</span>
              <span>Bấm vào STT để xem chi tiết nhiều hóa đơn bên dưới</span>
            </div>
            <div className="payment-table-scroll">
              <table className="payment-grid">
                <thead>
                  <tr>
                    <th style={{ width: "36px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredRequests.length > 0 &&
                          filteredRequests.every((r) => checkedIds.has(r.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCheckedIds(new Set(filteredRequests.map((r) => r.id)));
                          } else {
                            setCheckedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th
                      style={{ width: "55px", textAlign: "center" }}
                      className={freezeCol >= 2 ? "pcol-frozen pcol-rownum" : ""}
                    >
                      A · STT
                    </th>
                    <th
                      style={{ minWidth: "180px" }}
                      className={
                        freezeCol >= 3
                          ? `pcol-frozen ${freezeCol === 3 ? "pcol-frozen-last" : ""}`
                          : ""
                      }
                    >
                      B · NCC / Đơn vị thụ hưởng
                    </th>
                    <th
                      style={{ minWidth: "150px" }}
                      className={
                        freezeCol >= 4
                          ? `pcol-frozen ${freezeCol === 4 ? "pcol-frozen-last" : ""}`
                          : ""
                      }
                    >
                      C · Nhóm PO / HĐ
                    </th>
                    <th style={{ minWidth: "220px" }}>D · Nội dung TT</th>
                    <th style={{ minWidth: "180px" }}>E · Hàng hóa/DV</th>
                    <th
                      style={{ minWidth: "120px" }}
                      className={
                        freezeCol >= 7
                          ? `pcol-frozen ${freezeCol === 7 ? "pcol-frozen-last" : ""}`
                          : ""
                      }
                    >
                      F · Số HĐ
                    </th>
                    <th
                      style={{ minWidth: "110px" }}
                      className={
                        freezeCol >= 8
                          ? `pcol-frozen ${freezeCol === 8 ? "pcol-frozen-last" : ""}`
                          : ""
                      }
                    >
                      Ngày HĐ
                    </th>
                    <th style={{ minWidth: "130px", textAlign: "right" }}>G · Số tiền</th>
                    <th style={{ minWidth: "80px" }}>Tiền tệ</th>
                    <th style={{ minWidth: "140px" }}>H · Hồ sơ</th>
                    <th style={{ minWidth: "115px" }}>I · Ngày ĐNTT</th>
                    <th style={{ minWidth: "125px" }}>J · Loại TT</th>
                    <th style={{ minWidth: "160px" }}>K · Trạng thái</th>
                    <th style={{ minWidth: "140px" }}>L · Bổ sung HS</th>
                    <th style={{ minWidth: "170px" }}>M · Địa chỉ</th>
                    <th style={{ minWidth: "130px" }}>N · Số TK</th>
                    <th style={{ minWidth: "160px" }}>O · Ngân hàng</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r, idx) => {
                    const isChosen = activeRequestId === r.id;
                    const isDone = PAID_STATUSES.includes(r.status);
                    return (
                      <tr
                        key={r.id}
                        className={`${isChosen ? "chosen" : ""} ${isDone ? "row-done" : ""}`}
                        onClick={() => setActiveRequestId(r.id)}
                      >
                        {/* Checkbox */}
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={checkedIds.has(r.id)}
                            onChange={(e) => {
                              const s = new Set(checkedIds);
                              if (e.target.checked) s.add(r.id);
                              else s.delete(r.id);
                              setCheckedIds(s);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>

                        {/* STT */}
                        <td
                          className={`pcol-rownum ${freezeCol >= 2 ? "pcol-frozen" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveRequestId(r.id)}
                            title="Chọn dòng này để chỉnh sửa chi tiết bên dưới"
                          >
                            {r.legacy_stt || idx + 1}
                          </button>
                        </td>

                        {/* Payee / NCC */}
                        <td
                          className={
                            freezeCol >= 3
                              ? `pcol-frozen ${freezeCol === 3 ? "pcol-frozen-last" : ""}`
                              : ""
                          }
                        >
                          <input
                            list="nccDataList"
                            value={r.payee_name || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "payee_name", e.target.value)
                            }
                            placeholder="Tên NCC..."
                          />
                        </td>

                        {/* Group PO */}
                        <td
                          className={
                            freezeCol >= 4
                              ? `pcol-frozen ${freezeCol === 4 ? "pcol-frozen-last" : ""}`
                              : ""
                          }
                        >
                          <input
                            list="groupDataList"
                            value={r.group_code || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "group_code", e.target.value)
                            }
                            placeholder="Mã nhóm..."
                          />
                        </td>

                        {/* Description */}
                        <td>
                          <input
                            value={r.description || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "description", e.target.value)
                            }
                            placeholder="Nội dung chuyển tiền..."
                          />
                        </td>

                        {/* Item name */}
                        <td>
                          <input
                            value={r.item_name || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "item_name", e.target.value)
                            }
                            placeholder="Hàng hóa / Dịch vụ..."
                          />
                        </td>

                        {/* Invoice No */}
                        <td
                          className={
                            freezeCol >= 7
                              ? `pcol-frozen ${freezeCol === 7 ? "pcol-frozen-last" : ""}`
                              : ""
                          }
                        >
                          <input
                            value={r.invoice_no || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "invoice_no", e.target.value)
                            }
                            placeholder="Số HĐ..."
                          />
                        </td>

                        {/* Invoice Date */}
                        <td
                          className={
                            freezeCol >= 8
                              ? `pcol-frozen ${freezeCol === 8 ? "pcol-frozen-last" : ""}`
                              : ""
                          }
                        >
                          <input
                            type="text"
                            value={r.invoice_date || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "invoice_date", e.target.value)
                            }
                            placeholder="DD/MM/YYYY"
                          />
                        </td>

                        {/* Amount */}
                        <td style={{ textAlign: "right" }}>
                          <input
                            style={{ textAlign: "right", fontWeight: 600 }}
                            value={fmtMoney(r.amount)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/,/g, "");
                              handleEditRequest(r.id, "amount", raw);
                            }}
                          />
                        </td>

                        {/* Currency */}
                        <td>
                          <select
                            value={r.currency || "VND"}
                            onChange={(e) =>
                              handleEditRequest(r.id, "currency", e.target.value)
                            }
                          >
                            <option value="VND">VND</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </td>

                        {/* Documents */}
                        <td>
                          <button
                            type="button"
                            className="doc-pill-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocModalReqId(r.id);
                            }}
                          >
                            📁 {r.documents?.length ? r.documents.join(", ") : "Chọn hồ sơ"}
                          </button>
                        </td>

                        {/* Request Date */}
                        <td>
                          <input
                            type="date"
                            value={r.request_date || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "request_date", e.target.value)
                            }
                          />
                        </td>

                        {/* Payment Type */}
                        <td>
                          <select
                            value={r.payment_type || "TT trước 100%"}
                            onChange={(e) =>
                              handleEditRequest(r.id, "payment_type", e.target.value)
                            }
                          >
                            {PAYMENT_TYPES.map((pt) => (
                              <option key={pt} value={pt}>
                                {pt}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Status */}
                        <td>
                          <select
                            value={r.status || "Đã giao KT, chờ đi tiền"}
                            onChange={(e) =>
                              handleEditRequest(r.id, "status", e.target.value)
                            }
                          >
                            {PAYMENT_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Doc supplement */}
                        <td>
                          <input
                            value={r.doc_supplement || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "doc_supplement", e.target.value)
                            }
                          />
                        </td>

                        {/* Address */}
                        <td>
                          <input
                            value={r.address || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "address", e.target.value)
                            }
                          />
                        </td>

                        {/* Account No */}
                        <td>
                          <input
                            value={r.account_no || ""}
                            onChange={(e) =>
                              handleEditRequest(r.id, "account_no", e.target.value)
                            }
                          />
                        </td>

                        {/* Bank */}
                        <td>
                          <input
                            list="bankDataList"
                            value={r.bank || ""}
                            onChange={(e) => handleEditRequest(r.id, "bank", e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Lines Box for Active Request */}
          {activeReq && (
            <div className="payment-detail-box">
              <summary>
                🔍 Chi tiết nhiều hóa đơn / hàng hóa của phiếu:{" "}
                <b>{activeReq.payee_name || "Chưa có tên NCC"}</b> (STT:{" "}
                {activeReq.legacy_stt || activeReq.id})
              </summary>
              <div style={{ marginTop: "10px" }}>
                <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", border: "1px solid #e2e8f0" }}>
                        Tên hàng hóa / dịch vụ
                      </th>
                      <th
                        style={{
                          padding: "6px 8px",
                          border: "1px solid #e2e8f0",
                          width: "160px",
                        }}
                      >
                        Số hóa đơn
                      </th>
                      <th
                        style={{
                          padding: "6px 8px",
                          border: "1px solid #e2e8f0",
                          width: "140px",
                        }}
                      >
                        Ngày hóa đơn
                      </th>
                      <th
                        style={{
                          padding: "6px 8px",
                          border: "1px solid #e2e8f0",
                          width: "150px",
                          textAlign: "right",
                        }}
                      >
                        Số tiền
                      </th>
                      <th
                        style={{
                          padding: "6px 8px",
                          border: "1px solid #e2e8f0",
                          width: "50px",
                          textAlign: "center",
                        }}
                      >
                        Xóa
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeReq.lines || []).map((line, lIdx) => (
                      <tr key={lIdx}>
                        <td style={{ padding: "3px", border: "1px solid #e2e8f0" }}>
                          <input
                            style={{ width: "100%", border: 0, padding: "4px" }}
                            value={line.description || ""}
                            onChange={(e) => {
                              const lines = [...(activeReq.lines || [])];
                              lines[lIdx] = { ...lines[lIdx], description: e.target.value };
                              handleEditRequest(activeReq.id, "lines", lines);
                            }}
                            placeholder="Nhập tên hàng hóa..."
                          />
                        </td>
                        <td style={{ padding: "3px", border: "1px solid #e2e8f0" }}>
                          <input
                            style={{ width: "100%", border: 0, padding: "4px" }}
                            value={line.invoice_no || ""}
                            onChange={(e) => {
                              const lines = [...(activeReq.lines || [])];
                              lines[lIdx] = { ...lines[lIdx], invoice_no: e.target.value };
                              handleEditRequest(activeReq.id, "lines", lines);
                            }}
                            placeholder="Số HĐ..."
                          />
                        </td>
                        <td style={{ padding: "3px", border: "1px solid #e2e8f0" }}>
                          <input
                            style={{ width: "100%", border: 0, padding: "4px" }}
                            value={line.invoice_date || ""}
                            onChange={(e) => {
                              const lines = [...(activeReq.lines || [])];
                              lines[lIdx] = { ...lines[lIdx], invoice_date: e.target.value };
                              handleEditRequest(activeReq.id, "lines", lines);
                            }}
                            placeholder="DD/MM/YYYY"
                          />
                        </td>
                        <td style={{ padding: "3px", border: "1px solid #e2e8f0" }}>
                          <input
                            style={{
                              width: "100%",
                              border: 0,
                              padding: "4px",
                              textAlign: "right",
                            }}
                            value={fmtMoney(line.amount)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/,/g, "");
                              const lines = [...(activeReq.lines || [])];
                              lines[lIdx] = { ...lines[lIdx], amount: raw };
                              const totalAmt = lines.reduce(
                                (s, cur) => s + (Number(cur.amount) || 0),
                                0
                              );
                              handleEditRequest(activeReq.id, "lines", lines);
                              handleEditRequest(activeReq.id, "amount", totalAmt);
                            }}
                          />
                        </td>
                        <td
                          style={{
                            padding: "3px",
                            border: "1px solid #e2e8f0",
                            textAlign: "center",
                          }}
                        >
                          <button
                            type="button"
                            className="payment-btn btn-danger"
                            style={{ padding: "2px 6px" }}
                            onClick={() => {
                              const lines = (activeReq.lines || []).filter(
                                (_, idx) => idx !== lIdx
                              );
                              handleEditRequest(activeReq.id, "lines", lines);
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="payment-btn"
                  style={{ marginTop: "8px" }}
                  onClick={() => {
                    const lines = [
                      ...(activeReq.lines || []),
                      {
                        description: "",
                        invoice_no: "",
                        invoice_date: "",
                        amount: "0",
                      },
                    ];
                    handleEditRequest(activeReq.id, "lines", lines);
                  }}
                >
                  ＋ Thêm dòng chi tiết
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: NHÓM HỢP ĐỒNG / ĐƠN HÀNG ===================== */}
      {activeTab === "groups" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div className="payment-toolbar">
            <button
              className="payment-btn btn-primary"
              onClick={() => {
                const maxId = Math.max(0, ...paymentGroups.map((g) => Number(g.id) || 0)) + 1;
                const newG: PaymentGroup = {
                  id: maxId,
                  code: `HĐ-${maxId}`,
                  name: "",
                  payee_name: "",
                  total_amount: "0",
                  currency: "VND",
                };
                onUpdateState({ paymentGroups: [newG, ...paymentGroups] });
              }}
            >
              ＋ Thêm nhóm hợp đồng
            </button>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Có thể gõ mã nhóm trực tiếp tại cột "Nhóm PO" ở Bảng DATA để liên kết.
            </span>
          </div>

          <div className="payment-table-container">
            <div className="payment-table-header">
              <span>TIẾN ĐỘ GIẢI NGÂN THEO NHÓM HỢP ĐỒNG / ĐƠN HÀNG</span>
              <span>Số còn lại = Giá trị hợp đồng − Số tiền đã thanh toán</span>
            </div>
            <div className="payment-table-scroll">
              <table className="payment-grid" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: "120px" }}>Mã nhóm / PO</th>
                    <th style={{ minWidth: "240px" }}>Tên hợp đồng / Đơn hàng</th>
                    <th style={{ minWidth: "200px" }}>Đơn vị hưởng lợi</th>
                    <th style={{ width: "140px", textAlign: "right" }}>Giá trị HĐ</th>
                    <th style={{ width: "80px" }}>Tiền tệ</th>
                    <th style={{ width: "130px", textAlign: "right" }}>Đã trả</th>
                    <th style={{ width: "130px", textAlign: "right" }}>Chờ đi tiền</th>
                    <th style={{ width: "130px", textAlign: "right" }}>Còn lại</th>
                    <th style={{ width: "90px", textAlign: "center" }}>Số phiếu</th>
                    <th style={{ width: "70px", textAlign: "center" }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentGroups.map((g) => {
                    const stats = groupTotalsMap.get(String(g.id)) || {
                      paid: 0,
                      pending: 0,
                      count: 0,
                    };
                    const totalVal = Number(String(g.total_amount || 0).replace(/,/g, "")) || 0;
                    const remaining = totalVal - stats.paid;

                    return (
                      <tr key={g.id}>
                        <td>
                          <input
                            value={g.code || ""}
                            onChange={(e) => {
                              const next = paymentGroups.map((item) =>
                                item.id === g.id ? { ...item, code: e.target.value } : item
                              );
                              onUpdateState({ paymentGroups: next });
                            }}
                            placeholder="Mã..."
                          />
                        </td>
                        <td>
                          <input
                            value={g.name || ""}
                            onChange={(e) => {
                              const next = paymentGroups.map((item) =>
                                item.id === g.id ? { ...item, name: e.target.value } : item
                              );
                              onUpdateState({ paymentGroups: next });
                            }}
                            placeholder="Tên HĐ..."
                          />
                        </td>
                        <td>
                          <input
                            list="nccDataList"
                            value={g.payee_name || ""}
                            onChange={(e) => {
                              const next = paymentGroups.map((item) =>
                                item.id === g.id
                                  ? { ...item, payee_name: e.target.value }
                                  : item
                              );
                              onUpdateState({ paymentGroups: next });
                            }}
                            placeholder="ĐV thụ hưởng..."
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <input
                            style={{ textAlign: "right", fontWeight: 600 }}
                            value={fmtMoney(g.total_amount)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/,/g, "");
                              const next = paymentGroups.map((item) =>
                                item.id === g.id
                                  ? { ...item, total_amount: raw }
                                  : item
                              );
                              onUpdateState({ paymentGroups: next });
                            }}
                          />
                        </td>
                        <td>
                          <select
                            value={g.currency || "VND"}
                            onChange={(e) => {
                              const next = paymentGroups.map((item) =>
                                item.id === g.id
                                  ? { ...item, currency: e.target.value }
                                  : item
                              );
                              onUpdateState({ paymentGroups: next });
                            }}
                          >
                            <option value="VND">VND</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: "#166534" }}>
                          {fmtMoney(stats.paid)} {g.currency}
                        </td>
                        <td style={{ textAlign: "right", color: "#b45309" }}>
                          {fmtMoney(stats.pending)} {g.currency}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: remaining < 0 ? "#dc2626" : "#0f766e",
                          }}
                        >
                          {fmtMoney(remaining)} {g.currency}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              background: "#e0f2fe",
                              color: "#0369a1",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontWeight: 600,
                            }}
                          >
                            {stats.count} phiếu
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="payment-btn btn-danger"
                            style={{ padding: "2px 6px" }}
                            onClick={() => {
                              if (stats.count > 0) {
                                alert("Nhóm đang có phiếu thanh toán liên kết, không thể xóa!");
                                return;
                              }
                              if (!confirm(`Xóa nhóm hợp đồng ${g.code}?`)) return;
                              const next = paymentGroups.filter((item) => item.id !== g.id);
                              onUpdateState({ paymentGroups: next });
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 3: BÀN GIAO NỘI BỘ ===================== */}
      {activeTab === "handover" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div className="payment-toolbar">
            <button className="payment-btn btn-primary" onClick={handleAddHandoverRow}>
              ＋ Thêm dòng vật tư
            </button>
            <button
              className="payment-btn btn-success"
              onClick={() => setShowPasteModal(true)}
              title="Dán nhiều ô, nhiều cột trực tiếp từ file Excel"
            >
              📋 Dán từ Excel (Ctrl+V)
            </button>
            <button
              className="payment-btn"
              onClick={handleLoadExcelHandovers}
              title="Nạp 85 vật tư Phenikaa gốc từ kho dữ liệu mẫu"
            >
              📥 Nạp 85 vật tư mẫu
            </button>

            <select
              value={handoverDeptFilter}
              onChange={(e) => setHandoverDeptFilter(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              <option value="">-- Tất cả bộ phận nhận --</option>
              {handoverDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <input
              placeholder="Tìm vật tư, quy cách, ghi chú..."
              value={handoverSearch}
              onChange={(e) => setHandoverSearch(e.target.value)}
              style={{ width: "220px" }}
            />

            <button
              className="payment-btn"
              style={{ background: "#2563eb", color: "#fff", borderColor: "#2563eb" }}
              onClick={handlePreviewHandover}
            >
              👁️ Xem trước biên bản (Logo)
            </button>

            <button
              className="payment-btn btn-danger"
              onClick={handleDeleteSelectedHandovers}
            >
              🗑️ Xóa đã chọn ({checkedHandovers.size})
            </button>

            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
              {filteredHandovers.length} / {paymentHandovers.length} vật tư
            </span>
          </div>

          <div className="payment-table-container">
            <div className="payment-table-header">
              <span>DANH SÁCH VẬT TƯ BÀN GIAO NỘI BỘ (KHÔNG QUA KHO)</span>
              <span>Đơn vị giao mặc định: Phòng Cung Ứng (KHCU)</span>
            </div>
            <div className="payment-table-scroll">
              <table className="payment-grid" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: "36px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredHandovers.length > 0 &&
                          filteredHandovers.every((h) => checkedHandovers.has(h.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCheckedHandovers(
                              new Set(filteredHandovers.map((h) => h.id))
                            );
                          } else {
                            setCheckedHandovers(new Set());
                          }
                        }}
                      />
                    </th>
                    <th style={{ width: "50px", textAlign: "center" }}>STT</th>
                    <th style={{ width: "160px" }}>Bộ phận nhận</th>
                    <th style={{ minWidth: "280px" }}>Tên hàng hóa - Quy cách</th>
                    <th style={{ width: "80px" }}>ĐVT</th>
                    <th style={{ width: "95px", textAlign: "right" }}>SL chứng từ</th>
                    <th style={{ width: "85px", textAlign: "right" }}>SL Đạt</th>
                    <th style={{ width: "85px", textAlign: "right" }}>SL K.Đạt</th>
                    <th style={{ minWidth: "140px" }}>Ghi chú</th>
                    <th style={{ width: "115px" }}>Ngày giao</th>
                    <th style={{ width: "50px", textAlign: "center" }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHandovers.map((h, idx) => (
                    <tr key={h.id}>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={checkedHandovers.has(h.id)}
                          onChange={(e) => {
                            const s = new Set(checkedHandovers);
                            if (e.target.checked) s.add(h.id);
                            else s.delete(h.id);
                            setCheckedHandovers(s);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 600 }}>{idx + 1}</td>
                      <td>
                        <input
                          value={h.department || ""}
                          onChange={(e) =>
                            handleEditHandover(h.id, "department", e.target.value)
                          }
                          placeholder="Bộ phận..."
                        />
                      </td>
                      <td>
                        <input
                          value={h.item_name || ""}
                          onChange={(e) =>
                            handleEditHandover(h.id, "item_name", e.target.value)
                          }
                          placeholder="Tên hàng, quy cách..."
                        />
                      </td>
                      <td>
                        <input
                          value={h.unit || ""}
                          onChange={(e) => handleEditHandover(h.id, "unit", e.target.value)}
                          placeholder="ĐVT..."
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          style={{ textAlign: "right" }}
                          value={h.quantity_doc || ""}
                          onChange={(e) =>
                            handleEditHandover(h.id, "quantity_doc", e.target.value)
                          }
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          style={{ textAlign: "right" }}
                          value={h.quantity_pass || ""}
                          onChange={(e) =>
                            handleEditHandover(h.id, "quantity_pass", e.target.value)
                          }
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          style={{ textAlign: "right" }}
                          value={h.quantity_fail || ""}
                          onChange={(e) =>
                            handleEditHandover(h.id, "quantity_fail", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={h.note || ""}
                          onChange={(e) => handleEditHandover(h.id, "note", e.target.value)}
                          placeholder="Ghi chú..."
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={h.handover_date || ""}
                          onChange={(e) =>
                            handleEditHandover(h.id, "handover_date", e.target.value)
                          }
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="payment-btn btn-danger"
                          style={{ padding: "2px 6px" }}
                          onClick={() => handleDeleteHandover(h.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 4: DANH MỤC NCC ===================== */}
      {activeTab === "ncc" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div className="payment-toolbar">
            <button
              className="payment-btn btn-primary"
              onClick={() => {
                const maxId =
                  Math.max(0, ...paymentBeneficiaries.map((b) => Number(b.id) || 0)) + 1;
                const newB: PaymentBeneficiary = {
                  id: maxId,
                  name: "",
                  short_name: "",
                  address: "",
                  account_no: "",
                  bank: "",
                };
                onUpdateState({ paymentBeneficiaries: [newB, ...paymentBeneficiaries] });
              }}
            >
              ＋ Thêm Nhà cung cấp
            </button>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Danh mục dùng chung gợi ý tự động cho Bảng DATA đề nghị thanh toán.
            </span>
          </div>

          <div className="payment-table-container">
            <div className="payment-table-header">
              <span>DANH MỤC ĐƠN VỊ THỤ HƯỞNG & TÀI KHOẢN NGÂN HÀNG</span>
              <span>Tổng số: {allBeneficiaries.length} đơn vị</span>
            </div>
            <div className="payment-table-scroll">
              <table className="payment-grid" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: "50px", textAlign: "center" }}>ID</th>
                    <th style={{ minWidth: "260px" }}>Tên đơn vị thụ hưởng (đầy đủ)</th>
                    <th style={{ minWidth: "140px" }}>Tên viết tắt</th>
                    <th style={{ minWidth: "280px" }}>Địa chỉ</th>
                    <th style={{ minWidth: "170px" }}>Số tài khoản</th>
                    <th style={{ minWidth: "220px" }}>Ngân hàng</th>
                    <th style={{ width: "70px", textAlign: "center" }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentBeneficiaries.map((b) => (
                    <tr key={b.id}>
                      <td style={{ textAlign: "center", color: "#64748b" }}>{b.id}</td>
                      <td>
                        <input
                          value={b.name || ""}
                          onChange={(e) => {
                            const next = paymentBeneficiaries.map((item) =>
                              item.id === b.id ? { ...item, name: e.target.value } : item
                            );
                            onUpdateState({ paymentBeneficiaries: next });
                          }}
                          placeholder="Tên công ty / NCC..."
                        />
                      </td>
                      <td>
                        <input
                          value={b.short_name || ""}
                          onChange={(e) => {
                            const next = paymentBeneficiaries.map((item) =>
                              item.id === b.id ? { ...item, short_name: e.target.value } : item
                            );
                            onUpdateState({ paymentBeneficiaries: next });
                          }}
                          placeholder="Tên viết tắt..."
                        />
                      </td>
                      <td>
                        <input
                          value={b.address || ""}
                          onChange={(e) => {
                            const next = paymentBeneficiaries.map((item) =>
                              item.id === b.id ? { ...item, address: e.target.value } : item
                            );
                            onUpdateState({ paymentBeneficiaries: next });
                          }}
                          placeholder="Địa chỉ..."
                        />
                      </td>
                      <td>
                        <input
                          value={b.account_no || ""}
                          onChange={(e) => {
                            const next = paymentBeneficiaries.map((item) =>
                              item.id === b.id ? { ...item, account_no: e.target.value } : item
                            );
                            onUpdateState({ paymentBeneficiaries: next });
                          }}
                          placeholder="Số TK..."
                        />
                      </td>
                      <td>
                        <input
                          list="bankDataList"
                          value={b.bank || ""}
                          onChange={(e) => {
                            const next = paymentBeneficiaries.map((item) =>
                              item.id === b.id ? { ...item, bank: e.target.value } : item
                            );
                            onUpdateState({ paymentBeneficiaries: next });
                          }}
                          placeholder="Ngân hàng..."
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="payment-btn btn-danger"
                          style={{ padding: "2px 6px" }}
                          onClick={() => {
                            if (!confirm(`Xóa NCC ${b.name}?`)) return;
                            const next = paymentBeneficiaries.filter((item) => item.id !== b.id);
                            onUpdateState({ paymentBeneficiaries: next });
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 5: MẪU PHIẾU THANH TOÁN ===================== */}
      {activeTab === "template" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="payment-toolbar">
            <button
              className="payment-btn btn-primary"
              onClick={() => {
                onUpdateState({ paymentTemplate: tplForm });
                alert("Đã lưu cấu hình mẫu phiếu thành công!");
              }}
            >
              💾 Lưu cấu hình mẫu
            </button>
            <button
              className="payment-btn"
              onClick={() => {
                const sampleReq: PaymentRequestEntry = activeReq || {
                  id: 1,
                  legacy_stt: "01",
                  payee_name: "Công ty Cổ phần Công nghệ ABC",
                  address: "Hà Nội",
                  account_no: "19035678901234",
                  bank: "Techcombank",
                  description: "Thanh toán tiền mua nguyên phụ liệu theo HĐ đợt 1",
                  amount: "45000000",
                  currency: "VND",
                  documents: ["ĐNTT", "Hóa đơn", "Hợp đồng"],
                  request_date: localToday(),
                  payment_type: "TT trước 100%",
                  status: "Đã giao KT, chờ đi tiền",
                };
                setPreviewPaymentReq(sampleReq);
              }}
            >
              ⎙ In thử mẫu này
            </button>
            <button
              className="payment-btn btn-danger"
              onClick={() => {
                if (confirm("Khôi phục toàn bộ câu từ về mẫu ban đầu của Phenikaa?")) {
                  setTplForm(DEFAULT_PAYMENT_TEMPLATE);
                  onUpdateState({ paymentTemplate: DEFAULT_PAYMENT_TEMPLATE });
                }
              }}
            >
              ↺ Khôi phục gốc
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "16px",
            }}
          >
            {/* Box 1: Tiêu đề & Đơn vị */}
            <div className="payment-card">
              <h3 style={{ margin: "0 0 10px", fontSize: "14px", color: "#0369a1" }}>
                🏢 1. Tiêu đề & Đơn vị phát hành
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>
                  Tên công ty phát hành:
                  <input
                    style={{ width: "100%", marginTop: "3px" }}
                    value={tplForm.company_name}
                    onChange={(e) =>
                      setTplForm({ ...tplForm, company_name: e.target.value })
                    }
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>
                    Ký hiệu mẫu biểu:
                    <input
                      style={{ width: "100%", marginTop: "3px" }}
                      value={tplForm.form_code}
                      onChange={(e) => setTplForm({ ...tplForm, form_code: e.target.value })}
                    />
                  </label>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>
                    Địa danh ngày tháng:
                    <input
                      style={{ width: "100%", marginTop: "3px" }}
                      value={tplForm.date_location}
                      onChange={(e) =>
                        setTplForm({ ...tplForm, date_location: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>
                  Tiêu đề chính của phiếu:
                  <input
                    style={{ width: "100%", marginTop: "3px" }}
                    value={tplForm.form_title}
                    onChange={(e) => setTplForm({ ...tplForm, form_title: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* Box 2: Kính gửi & Bộ phận */}
            <div className="payment-card">
              <h3 style={{ margin: "0 0 10px", fontSize: "14px", color: "#0369a1" }}>
                👥 2. Kính gửi & Bộ phận đề nghị
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>
                  Đơn vị kính gửi (mỗi dòng một nơi nhận):
                  <textarea
                    rows={2}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px",
                      borderRadius: "5px",
                      border: "1px solid #cbd5e1",
                    }}
                    value={tplForm.recipients}
                    onChange={(e) => setTplForm({ ...tplForm, recipients: e.target.value })}
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>
                    Người đề nghị mặc định:
                    <input
                      style={{ width: "100%", marginTop: "3px" }}
                      value={tplForm.default_requester_name}
                      onChange={(e) =>
                        setTplForm({ ...tplForm, default_requester_name: e.target.value })
                      }
                    />
                  </label>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>
                    Bộ phận đề nghị:
                    <input
                      style={{ width: "100%", marginTop: "3px" }}
                      value={tplForm.department_name}
                      onChange={(e) =>
                        setTplForm({ ...tplForm, department_name: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>
                  Thời hạn chuyển tiền:
                  <input
                    style={{ width: "100%", marginTop: "3px" }}
                    value={tplForm.deadline_val}
                    onChange={(e) => setTplForm({ ...tplForm, deadline_val: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* Box 3: 4 Chữ ký */}
            <div className="payment-card" style={{ gridColumn: "1 / -1" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "14px", color: "#0369a1" }}>
                ✍️ 3. Họ tên và Chức danh 4 người ký
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>Ô 1 (Lãnh đạo duyệt):</label>
                  <input
                    style={{ width: "100%", marginTop: "3px" }}
                    value={tplForm.sign1_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign1_title: e.target.value })}
                  />
                  <input
                    style={{ width: "100%", marginTop: "4px" }}
                    value={tplForm.sign1_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign1_name: e.target.value })}
                    placeholder="Họ tên..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>Ô 2 (Kế toán trưởng):</label>
                  <input
                    style={{ width: "100%", marginTop: "3px" }}
                    value={tplForm.sign2_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign2_title: e.target.value })}
                  />
                  <input
                    style={{ width: "100%", marginTop: "4px" }}
                    value={tplForm.sign2_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign2_name: e.target.value })}
                    placeholder="Họ tên..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>Ô 3 (Trưởng bộ phận):</label>
                  <input
                    style={{ width: "100%", marginTop: "3px" }}
                    value={tplForm.sign3_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign3_title: e.target.value })}
                  />
                  <input
                    style={{ width: "100%", marginTop: "4px" }}
                    value={tplForm.sign3_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign3_name: e.target.value })}
                    placeholder="Họ tên..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>Ô 4 (Người đề nghị):</label>
                  <input
                    style={{ width: "100%", marginTop: "3px" }}
                    value={tplForm.sign4_title}
                    onChange={(e) => setTplForm({ ...tplForm, sign4_title: e.target.value })}
                  />
                  <input
                    style={{ width: "100%", marginTop: "4px" }}
                    value={tplForm.sign4_name}
                    onChange={(e) => setTplForm({ ...tplForm, sign4_name: e.target.value })}
                    placeholder="Để trống sẽ lấy theo người tạo"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CHỌN HỒ SƠ ĐÍNH KÈM ===================== */}
      {docModalReqId !== null && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "600px" }}>
            <div className="payment-modal-header">
              <h3>📂 Chọn hồ sơ, chứng từ đi kèm</h3>
              <button type="button" onClick={() => setDocModalReqId(null)}>
                ×
              </button>
            </div>
            {(() => {
              const req = paymentRequests.find((r) => r.id === docModalReqId);
              if (!req) return null;
              const curDocs = req.documents || [];
              return (
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                      maxHeight: "350px",
                      overflow: "auto",
                      padding: "4px",
                    }}
                  >
                    {customDocTypes.map((docName) => {
                      const checked = curDocs.includes(docName);
                      return (
                        <label
                          key={docName}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 10px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "6px",
                            background: checked ? "#eff6ff" : "#fff",
                            cursor: "pointer",
                            fontSize: "12.5px",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...curDocs, docName]
                                : curDocs.filter((d) => d !== docName);
                              handleEditRequest(req.id, "documents", next);
                            }}
                          />
                          <span>{docName}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "14px",
                      borderTop: "1px solid #e2e8f0",
                      paddingTop: "12px",
                    }}
                  >
                    <input
                      placeholder="Thêm loại hồ sơ khác..."
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="payment-btn btn-primary"
                      onClick={() => {
                        const trimmed = newDocName.trim();
                        if (trimmed && !customDocTypes.includes(trimmed)) {
                          setCustomDocTypes([...customDocTypes, trimmed]);
                          handleEditRequest(req.id, "documents", [...curDocs, trimmed]);
                          setNewDocName("");
                        }
                      }}
                    >
                      ＋ Thêm
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===================== MODAL: CHỌN PO TẠO ĐỀ NGHỊ TT ===================== */}
      {showPOPickerModal && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "750px" }}>
            <div className="payment-modal-header">
              <h3>⚡ Chọn đơn hàng (PO) để lập Đề nghị thanh toán</h3>
              <button type="button" onClick={() => setShowPOPickerModal(false)}>
                ×
              </button>
            </div>
            <div>
              <input
                placeholder="Tìm mã PO, nhà cung cấp, mặt hàng..."
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                style={{ width: "100%", marginBottom: "12px", padding: "8px" }}
              />
              <div style={{ maxHeight: "400px", overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: "12.5px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                      <th style={{ padding: "8px", borderBottom: "2px solid #cbd5e1" }}>
                        Mã PO
                      </th>
                      <th style={{ padding: "8px", borderBottom: "2px solid #cbd5e1" }}>
                        Nhà cung cấp
                      </th>
                      <th style={{ padding: "8px", borderBottom: "2px solid #cbd5e1" }}>
                        Số mặt hàng
                      </th>
                      <th
                        style={{
                          padding: "8px",
                          borderBottom: "2px solid #cbd5e1",
                          textAlign: "right",
                        }}
                      >
                        Tổng tiền
                      </th>
                      <th
                        style={{
                          padding: "8px",
                          borderBottom: "2px solid #cbd5e1",
                          textAlign: "center",
                        }}
                      >
                        Hành động
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos
                      .filter((po) => {
                        const s = suppliers.find((x) => x.id === po.supplierId);
                        const q = normName(poSearch);
                        if (!q) return true;
                        return normName(
                          `${po.number} ${s?.name || ""} ${po.items.map((i) => i.name).join(" ")}`
                        ).includes(q);
                      })
                      .map((po) => {
                        const s = suppliers.find((x) => x.id === po.supplierId);
                        const total = po.items.reduce((sum, i) => sum + i.qty * i.price, 0);
                        return (
                          <tr key={po.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "8px", fontWeight: 700, color: "#0284c7" }}>
                              {po.number}
                            </td>
                            <td style={{ padding: "8px" }}>{s?.name || "---"}</td>
                            <td style={{ padding: "8px" }}>{po.items.length} món</td>
                            <td style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>
                              {fmtMoney(total)} ₫
                            </td>
                            <td style={{ padding: "8px", textAlign: "center" }}>
                              <button
                                type="button"
                                className="payment-btn btn-primary"
                                style={{ padding: "4px 10px" }}
                                onClick={() => handleCreateFromPO(po)}
                              >
                                Chọn lập phiếu ➔
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: DÁN DỮ LIỆU TỪ EXCEL (HANDOVER) ===================== */}
      {showPasteModal && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "800px" }}>
            <div className="payment-modal-header">
              <h3>📋 Dán dữ liệu vật tư từ Excel (Ctrl+V)</h3>
              <button type="button" onClick={() => setShowPasteModal(false)}>
                ×
              </button>
            </div>
            <div>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px" }}>
                Sao chép các cột từ file Excel của bạn theo thứ tự:{" "}
                <b>Bộ phận | Tên hàng - Quy cách | ĐVT | SL chứng từ | SL Đạt | SL K.Đạt | Ghi chú</b>.
                Sau đó nhấn Ctrl+V vào ô dưới đây.
              </p>
              <textarea
                rows={5}
                placeholder="Dán dữ liệu Excel tại đây (Ctrl+V)..."
                value={pasteText}
                onChange={(e) => handleParsePaste(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                }}
              />

              {pasteParsedRows.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Xem trước ({pasteParsedRows.length} dòng):
                  </div>
                  <div style={{ maxHeight: "200px", overflow: "auto" }}>
                    <table style={{ width: "100%", fontSize: "11.5px", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                          <th style={{ padding: "4px 6px", border: "1px solid #cbd5e1" }}>
                            Bộ phận
                          </th>
                          <th style={{ padding: "4px 6px", border: "1px solid #cbd5e1" }}>
                            Tên vật tư
                          </th>
                          <th style={{ padding: "4px 6px", border: "1px solid #cbd5e1" }}>ĐVT</th>
                          <th style={{ padding: "4px 6px", border: "1px solid #cbd5e1" }}>SL</th>
                          <th style={{ padding: "4px 6px", border: "1px solid #cbd5e1" }}>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pasteParsedRows.slice(0, 10).map((r, i) => (
                          <tr key={i}>
                            <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0" }}>
                              {r.department}
                            </td>
                            <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0" }}>
                              {r.item_name}
                            </td>
                            <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0" }}>{r.unit}</td>
                            <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0" }}>
                              {r.quantity_doc}
                            </td>
                            <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0" }}>{r.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "14px",
                }}
              >
                <button
                  type="button"
                  className="payment-btn"
                  onClick={() => setShowPasteModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="payment-btn btn-primary"
                  disabled={pasteParsedRows.length === 0}
                  onClick={handleApplyPaste}
                >
                  Nhập {pasteParsedRows.length} dòng vào danh sách ➔
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: XEM TRƯỚC MẪU IN 01-TT ===================== */}
      {previewPaymentReq && (
        <div className="payment-modal-overlay">
          <div
            className="payment-modal-card"
            style={{ width: "820px", maxHeight: "96vh", padding: "16px" }}
          >
            <div className="payment-modal-header">
              <h3>📄 Xem trước Mẫu 01 – TT: Giấy đề nghị thanh toán chuyển khoản</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="payment-btn btn-primary"
                  onClick={handlePrintDocument}
                >
                  🖨️ In phiếu ngay
                </button>
                <button type="button" onClick={() => setPreviewPaymentReq(null)}>
                  ×
                </button>
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                background: "#f1f5f9",
                padding: "20px",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              {(() => {
                const x = previewPaymentReq;
                const tpl = tplForm;
                const date = parsePrintDate(x.request_date);
                const entries = printEntries(x);
                const requesterName =
                  (tpl.sign4_name && tpl.sign4_name.trim()) ||
                  x.created_by_name ||
                  tpl.default_requester_name ||
                  "Trần Hải Hà";

                const recipientLines = (
                  tpl.recipients ||
                  "- BAN LÃNH ĐẠO CÔNG TY\n- PHÒNG TÀI CHÍNH - KẾ TOÁN"
                )
                  .split("\n")
                  .filter(Boolean);

                return (
                  <div className="paper">
                    <div className="upper">{tpl.company_name}</div>
                    <div className="model">{tpl.form_code}</div>
                    <h1>{tpl.form_title}</h1>

                    <div className="recipients">
                      <strong>{tpl.recipient_label}</strong>
                      <div>
                        {recipientLines.map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                      </div>
                    </div>

                    <div className="person">
                      <span>{tpl.label_requester}</span>
                      <span>{requesterName}</span>
                      <span>{tpl.label_department}</span>
                      <span>{tpl.department_name}</span>
                    </div>

                    <div className="intro">{tpl.intro_text}</div>

                    <div className="details">
                      <span>
                        <b>{tpl.label_payee}</b>
                      </span>
                      <span className="val">
                        <b>{x.payee_name || ""}</b>
                      </span>

                      <span>
                        <b>{tpl.label_address}</b>
                      </span>
                      <span className="val">{x.address || ""}</span>

                      <span>
                        <b>{tpl.label_account}</b>
                      </span>
                      <span className="val">{x.account_no || ""}</span>

                      <span>
                        <b>{tpl.label_bank}</b>
                      </span>
                      <span className="val">{x.bank || ""}</span>

                      <span className="transfer">
                        <b>{tpl.label_description}</b>
                      </span>
                      <span className="val transfer">{x.description || ""}</span>
                    </div>

                    <div className="time">
                      {tpl.deadline_label} &nbsp; {tpl.deadline_val}
                    </div>

                    <div className="moneytitle">{tpl.table_title}</div>

                    <table>
                      <colgroup>
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "35%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "18%" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>{tpl.col_stt}</th>
                          <th>{tpl.col_invoice}</th>
                          <th>{tpl.col_item}</th>
                          <th>{tpl.col_amount}</th>
                          <th>{tpl.col_note}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((l, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{l.invoice_no || ""}</td>
                            <td style={{ textAlign: "left", paddingLeft: "6px" }}>
                              {l.description || ""}
                            </td>
                            <td>{fmtMoney(l.amount)}</td>
                            <td></td>
                          </tr>
                        ))}
                        <tr className="sum">
                          <td colSpan={3}>{tpl.col_total}</td>
                          <td>{fmtMoney(x.amount)}</td>
                          <td style={{ textAlign: "left", paddingLeft: "6px" }}>
                            {x.currency || "VND"}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="words">
                      <span>{tpl.label_money_words}</span>
                      <span>{moneyWords(x)}</span>
                    </div>

                    <div className="doclabel">
                      <b>{tpl.label_docs}</b>
                    </div>
                    <div className="docs">
                      <b>{(x.documents || []).join(", ")}</b>
                    </div>

                    <div className="date">
                      {tpl.date_location}, ngày {date.d} tháng {date.m} năm {date.y}
                    </div>

                    <div className="sign">
                      <div>
                        {tpl.sign1_title}
                        <span>{tpl.sign1_name}</span>
                      </div>
                      <div>
                        {tpl.sign2_title}
                        <span>{tpl.sign2_name}</span>
                      </div>
                      <div>
                        {tpl.sign3_title}
                        <span>{tpl.sign3_name}</span>
                      </div>
                      <div>
                        {tpl.sign4_title}
                        <span>{requesterName}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: XEM TRƯỚC BIÊN BẢN BÀN GIAO ===================== */}
      {previewHandoverItems.length > 0 && (
        <div className="payment-modal-overlay">
          <div
            className="payment-modal-card"
            style={{ width: "820px", maxHeight: "96vh", padding: "16px" }}
          >
            <div className="payment-modal-header">
              <h3>📦 Xem trước Biên bản bàn giao, nghiệm thu vật tư (Không qua kho)</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="payment-btn btn-primary"
                  onClick={handlePrintDocument}
                >
                  🖨️ In biên bản (2 bản)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewHandoverItems([]);
                    setPreviewHandoverDept(null);
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                background: "#f1f5f9",
                padding: "20px",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                alignItems: "center",
              }}
            >
              {[1, 2].map((copyNum) => (
                <div key={copyNum} className="handover-paper">
                  <table className="hb-box">
                    <tbody>
                      <tr>
                        <td className="hb-box-left">
                          <div className="hb-logo">
                            <img
                              src={PHENIKAA_LOGO_SRC}
                              alt="PHENIKAA PHARMA"
                              style={{
                                height: "36px",
                                width: "160px",
                                objectFit: "contain",
                                display: "block",
                                margin: "0 auto",
                              }}
                            />
                          </div>
                          <div className="hb-sender-dept">Bộ phận: Phòng Cung ứng</div>
                        </td>
                        <td className="hb-box-right">
                          <div className="hb-title-main">
                            BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,
                          </div>
                          <div className="hb-title-main">HÀNG HÓA</div>
                          <div className="hb-title-sub">
                            (Không qua kho) - Bản số {copyNum}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="hb-info">
                    <div className="hb-line">
                      Hôm nay, ngày&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;tháng&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;năm
                    </div>
                    <div className="hb-line">Tại Công ty CP Dược phẩm Phenikaa</div>
                    <div className="hb-line">
                      Địa chỉ: Lô đất CN2-10, KCN Công nghệ cao 2, KCNC Hòa Lạc, Hà Nội
                    </div>
                    <div className="hb-line">Chúng tôi gồm:</div>
                    <div className="hb-two-col">
                      <div>Ông (bà): Trần Hải Hà - Người giao hàng</div>
                      <div>Địa chỉ: Phòng KHCU</div>
                    </div>
                    <div className="hb-two-col">
                      <div>
                        Ông (bà): .................................................... Người nhận hàng
                      </div>
                      <div>Địa chỉ: {previewHandoverDept || "…………………"}</div>
                    </div>
                    <div className="hb-line">
                      Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư sau:
                    </div>
                  </div>

                  <table className="hb-table">
                    <thead>
                      <tr>
                        <th style={{ width: "35px" }}>STT</th>
                        <th>Tên hàng hóa - Quy cách</th>
                        <th style={{ width: "50px" }}>ĐVT</th>
                        <th style={{ width: "80px" }}>
                          SL theo
                          <br />
                          chứng từ
                        </th>
                        <th style={{ width: "75px" }}>
                          SL kiểm tra
                          <br />
                          Đạt
                        </th>
                        <th style={{ width: "75px" }}>
                          SL kiểm tra
                          <br />
                          K.Đạt
                        </th>
                        <th style={{ width: "75px" }}>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewHandoverItems.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td className="center">{idx + 1}</td>
                          <td className="left">{it.item_name || ""}</td>
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
                      Biên bản này được lập thành 02 bản, 01 bản giao cho người giao hàng; 01
                      bản giao cho người nhận hàng.
                    </div>
                    <div className="hb-sign-row">
                      <div className="hb-sign-col">Người giao hàng</div>
                      <div className="hb-sign-col">Người nhận hàng</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================== PRINT AREA FOR PHYSICAL PRINTER (A4) ===================== */}
      <div id="paymentPrintArea">
        {/* If previewing payment requests or printing checked */}
        {(() => {
          const reqsToPrint = previewPaymentReq
            ? [previewPaymentReq]
            : checkedIds.size > 0
            ? paymentRequests.filter((r) => checkedIds.has(r.id))
            : activeReq
            ? [activeReq]
            : [];

          if (activeTab !== "handover" && reqsToPrint.length > 0) {
            return reqsToPrint.map((x) => {
              const tpl = tplForm;
              const date = parsePrintDate(x.request_date);
              const entries = printEntries(x);
              const requesterName =
                (tpl.sign4_name && tpl.sign4_name.trim()) ||
                x.created_by_name ||
                tpl.default_requester_name ||
                "Trần Hải Hà";
              const recipientLines = (
                tpl.recipients ||
                "- BAN LÃNH ĐẠO CÔNG TY\n- PHÒNG TÀI CHÍNH - KẾ TOÁN"
              )
                .split("\n")
                .filter(Boolean);

              return (
                <div key={x.id} className="paper">
                  <div className="upper">{tpl.company_name}</div>
                  <div className="model">{tpl.form_code}</div>
                  <h1>{tpl.form_title}</h1>

                  <div className="recipients">
                    <strong>{tpl.recipient_label}</strong>
                    <div>
                      {recipientLines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                    </div>
                  </div>

                  <div className="person">
                    <span>{tpl.label_requester}</span>
                    <span>{requesterName}</span>
                    <span>{tpl.label_department}</span>
                    <span>{tpl.department_name}</span>
                  </div>

                  <div className="intro">{tpl.intro_text}</div>

                  <div className="details">
                    <span>
                      <b>{tpl.label_payee}</b>
                    </span>
                    <span className="val">
                      <b>{x.payee_name || ""}</b>
                    </span>

                    <span>
                      <b>{tpl.label_address}</b>
                    </span>
                    <span className="val">{x.address || ""}</span>

                    <span>
                      <b>{tpl.label_account}</b>
                    </span>
                    <span className="val">{x.account_no || ""}</span>

                    <span>
                      <b>{tpl.label_bank}</b>
                    </span>
                    <span className="val">{x.bank || ""}</span>

                    <span className="transfer">
                      <b>{tpl.label_description}</b>
                    </span>
                    <span className="val transfer">{x.description || ""}</span>
                  </div>

                  <div className="time">
                    {tpl.deadline_label} &nbsp; {tpl.deadline_val}
                  </div>

                  <div className="moneytitle">{tpl.table_title}</div>

                  <table>
                    <colgroup>
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "35%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "18%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{tpl.col_stt}</th>
                        <th>{tpl.col_invoice}</th>
                        <th>{tpl.col_item}</th>
                        <th>{tpl.col_amount}</th>
                        <th>{tpl.col_note}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((l, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{l.invoice_no || ""}</td>
                          <td style={{ textAlign: "left", paddingLeft: "6px" }}>
                            {l.description || ""}
                          </td>
                          <td>{fmtMoney(l.amount)}</td>
                          <td></td>
                        </tr>
                      ))}
                      <tr className="sum">
                        <td colSpan={3}>{tpl.col_total}</td>
                        <td>{fmtMoney(x.amount)}</td>
                        <td style={{ textAlign: "left", paddingLeft: "6px" }}>
                          {x.currency || "VND"}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="words">
                    <span>{tpl.label_money_words}</span>
                    <span>{moneyWords(x)}</span>
                  </div>

                  <div className="doclabel">
                    <b>{tpl.label_docs}</b>
                  </div>
                  <div className="docs">
                    <b>{(x.documents || []).join(", ")}</b>
                  </div>

                  <div className="date">
                    {tpl.date_location}, ngày {date.d} tháng {date.m} năm {date.y}
                  </div>

                  <div className="sign">
                    <div>
                      {tpl.sign1_title}
                      <span>{tpl.sign1_name}</span>
                    </div>
                    <div>
                      {tpl.sign2_title}
                      <span>{tpl.sign2_name}</span>
                    </div>
                    <div>
                      {tpl.sign3_title}
                      <span>{tpl.sign3_name}</span>
                    </div>
                    <div>
                      {tpl.sign4_title}
                      <span>{requesterName}</span>
                    </div>
                  </div>
                </div>
              );
            });
          }

          // Handover printing
          if (activeTab === "handover") {
            const items =
              previewHandoverItems.length > 0
                ? previewHandoverItems
                : checkedHandovers.size > 0
                ? paymentHandovers.filter((h) => checkedHandovers.has(h.id))
                : filteredHandovers;

            // Group by department
            const groupsByDept: Record<string, PaymentHandoverItem[]> = {};
            for (const it of items) {
              const d = String(it.department || "Chưa phân loại").trim();
              if (!groupsByDept[d]) groupsByDept[d] = [];
              groupsByDept[d].push(it);
            }

            return Object.entries(groupsByDept).map(([dept, deptItems]) => (
              <React.Fragment key={dept}>
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
                                  height: "36px",
                                  width: "160px",
                                  objectFit: "contain",
                                  display: "block",
                                  margin: "0 auto",
                                }}
                              />
                            </div>
                            <div className="hb-sender-dept">Bộ phận: Phòng Cung ứng</div>
                          </td>
                          <td className="hb-box-right">
                            <div className="hb-title-main">
                              BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,
                            </div>
                            <div className="hb-title-main">HÀNG HÓA</div>
                            <div className="hb-title-sub">
                              (Không qua kho) - Bản số {copyNum}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="hb-info">
                      <div className="hb-line">
                        Hôm nay, ngày&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;tháng&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;năm
                      </div>
                      <div className="hb-line">Tại Công ty CP Dược phẩm Phenikaa</div>
                      <div className="hb-line">
                        Địa chỉ: Lô đất CN2-10, KCN Công nghệ cao 2, KCNC Hòa Lạc, Hà Nội
                      </div>
                      <div className="hb-line">Chúng tôi gồm:</div>
                      <div className="hb-two-col">
                        <div>Ông (bà): Trần Hải Hà - Người giao hàng</div>
                        <div>Địa chỉ: Phòng KHCU</div>
                      </div>
                      <div className="hb-two-col">
                        <div>
                          Ông (bà): .................................................... Người nhận
                          hàng
                        </div>
                        <div>Địa chỉ: {dept}</div>
                      </div>
                      <div className="hb-line">
                        Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư sau:
                      </div>
                    </div>

                    <table className="hb-table">
                      <thead>
                        <tr>
                          <th style={{ width: "35px" }}>STT</th>
                          <th>Tên hàng hóa - Quy cách</th>
                          <th style={{ width: "50px" }}>ĐVT</th>
                          <th style={{ width: "80px" }}>
                            SL theo
                            <br />
                            chứng từ
                          </th>
                          <th style={{ width: "75px" }}>
                            SL kiểm tra
                            <br />
                            Đạt
                          </th>
                          <th style={{ width: "75px" }}>
                            SL kiểm tra
                            <br />
                            K.Đạt
                          </th>
                          <th style={{ width: "75px" }}>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptItems.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="center">{idx + 1}</td>
                            <td className="left">{it.item_name || ""}</td>
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
                        Biên bản này được lập thành 02 bản, 01 bản giao cho người giao hàng; 01
                        bản giao cho người nhận hàng.
                      </div>
                      <div className="hb-sign-row">
                        <div className="hb-sign-col">Người giao hàng</div>
                        <div className="hb-sign-col">Người nhận hàng</div>
                      </div>
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ));
          }

          return null;
        })()}
      </div>
    </section>
  );
}
