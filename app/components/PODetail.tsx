import React, { useState, useMemo } from "react";
import { Supplier, PO, POItem, PODoc, Payment, isContractPO } from "../types";
import { fmt, dateVN, makeId, generateShortName } from "../utils";
import { BANK_SUGGESTIONS } from "../payment-utils";
import { SupplierSearchCombobox } from "./SupplierSearchCombobox";
import VisualTimeline from "./VisualTimeline";
import DocumentManager from "./DocumentManager";

export function PODetail({
  po,
  suppliers,
  setSuppliers,
  onUpdate,
  onBack,
  workspaceId,
  readOnly = false,
  onStatus,
  onCreateHandover,
  onCreatePaymentRequest,
  onNavigateToPayment,
  onSave,
  onAddSupplier,
}: {
  po: PO;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onUpdate: (po: PO) => void;
  onBack: () => void;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
  onCreateHandover?: (po: PO) => void;
  onCreatePaymentRequest?: (po: PO, payment: Payment) => void;
  onNavigateToPayment?: (reqId?: number) => void;
  onSave?: () => Promise<void> | void;
  onAddSupplier?: (supplier: Supplier) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const supplier = suppliers.find((s) => Number(s.id) === Number(po.supplierId));
  const items = po.items || [];
  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

  const bankOptions = useMemo(() => {
    const set = new Set<string>(BANK_SUGGESTIONS);
    suppliers.forEach((s) => {
      if (s.bank?.trim()) set.add(s.bank.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [suppliers]);

  const handleManualSave = async (andGoBack = false) => {
    setSaving(true);
    try {
      if (onSave) {
        await onSave();
      }
      setSavedNotice(true);
      onStatus?.(`✓ Đã lưu thông tin ${po.number}`);
      setTimeout(() => setSavedNotice(false), 3000);
      if (andGoBack) {
        onBack();
      }
    } finally {
      setSaving(false);
    }
  };

  const supplierUpdate = (key: keyof Supplier, value: string) => {
    if (!supplier) {
      const newId = makeId();
      const nextCode = `NCC-${String(suppliers.length + 1).padStart(3, "0")}`;
      const newSupp: Supplier = {
        id: newId,
        code: key === "code" ? value : nextCode,
        name: key === "name" ? value : "Nhà cung cấp mới",
        shortName: key === "shortName" ? value : "",
        bankAccount: key === "bankAccount" ? value : "",
        bank: key === "bank" ? value : "",
        address: key === "address" ? value : "",
        contact: key === "contact" ? value : "",
        phone: key === "phone" ? value : "",
      };
      setSuppliers((list) => [newSupp, ...list]);
      onUpdate({ ...po, supplierId: newId });
      return;
    }
    setSuppliers((list) =>
      list.map((s) => (Number(s.id) === Number(supplier.id) ? { ...s, [key]: value } : s)),
    );
  };
  const itemUpdate = (id: number, key: keyof POItem, value: string | number) =>
    onUpdate({
      ...po,
      items: items.map((i) => (i.id === id ? { ...i, [key]: value } : i)),
    });

  const payments = po.payments || [];
  const totalAllocatedPercent = payments.reduce((s, p) => s + (Number(p.percent) || 0), 0);
  const totalAllocatedAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const handleApplyPreset = (type: "1-post" | "1-advance" | "2-50-50" | "2-30-70" | "3-30-40-30") => {
    let newPayments: Payment[] = [];
    if (type === "1-post") {
      newPayments = [
        {
          id: makeId(),
          phase: "Thanh toán toàn bộ (Trả sau 100%)",
          percent: 100,
          amount: total,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "Thanh toán sau khi nhận đủ hàng và HĐ VAT",
        },
      ];
    } else if (type === "1-advance") {
      newPayments = [
        {
          id: makeId(),
          phase: "Tạm ứng toàn bộ (Trả trước 100%)",
          percent: 100,
          amount: total,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi giao hàng",
        },
      ];
    } else if (type === "2-50-50") {
      const p1 = Math.round(total * 0.5);
      newPayments = [
        {
          id: makeId(),
          phase: "Đợt 1: Tạm ứng (50%)",
          percent: 50,
          amount: p1,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Đợt 2: Quyết toán (50%)",
          percent: 50,
          amount: total - p1,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "",
        },
      ];
    } else if (type === "2-30-70") {
      const p1 = Math.round(total * 0.3);
      newPayments = [
        {
          id: makeId(),
          phase: "Đợt 1: Tạm ứng (30%)",
          percent: 30,
          amount: p1,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Đợt 2: Quyết toán (70%)",
          percent: 70,
          amount: total - p1,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "",
        },
      ];
    } else if (type === "3-30-40-30") {
      const p1 = Math.round(total * 0.3);
      const p2 = Math.round(total * 0.4);
      newPayments = [
        {
          id: makeId(),
          phase: "Đợt 1: Tạm ứng (30%)",
          percent: 30,
          amount: p1,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Đợt 2: Giao hàng (40%)",
          percent: 40,
          amount: p2,
          condition: "post",
          status: "Chưa thanh toán",
          date: "",
          note: "",
        },
        {
          id: makeId(),
          phase: "Đợt 3: Quyết toán (30%)",
          percent: 30,
          amount: total - p1 - p2,
          condition: "post",
          status: "Chưa thanh toán",
          date: po.expectedDate || "",
          note: "",
        },
      ];
    }
    onUpdate({ ...po, payments: newPayments });
  };

  const handleAddPaymentStage = () => {
    const allocatedPct = (po.payments || []).reduce((s, p) => s + (Number(p.percent) || 0), 0);
    const remPct = Math.max(0, 100 - allocatedPct);
    const remAmt = Math.round((total * remPct) / 100);
    const nextIdx = (po.payments || []).length + 1;
    const isFirst = nextIdx === 1;
    const newStage: Payment = {
      id: makeId(),
      phase: `Đợt ${nextIdx}: ${isFirst ? "Tạm ứng" : "Thanh toán đợt " + nextIdx}`,
      percent: remPct,
      amount: remAmt,
      condition: isFirst ? "advance" : "post",
      status: "Chưa thanh toán",
      date: "",
      note: isFirst ? "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng" : "",
    };
    onUpdate({
      ...po,
      payments: [...(po.payments || []), newStage],
    });
  };

  const handleRemovePaymentStage = (id: number) => {
    const stage = po.payments?.find((p) => p.id === id);
    if (stage?.paymentRequestId) {
      if (!confirm(`Đợt này đã liên kết với ĐNTT #${stage.paymentRequestId}. Bạn có chắc chắn muốn xóa không?`)) {
        return;
      }
    } else if (po.payments?.length === 1) {
      if (!confirm("Đây là đợt thanh toán duy nhất còn lại. Bạn có chắc muốn xóa không?")) {
        return;
      }
    }
    onUpdate({
      ...po,
      payments: (po.payments || []).filter((p) => p.id !== id),
    });
  };

  const handleUpdatePaymentStage = (id: number, patch: Partial<Payment>) => {
    onUpdate({
      ...po,
      payments: (po.payments || []).map((p) => {
        if (p.id !== id) return p;
        const updated: Payment = { ...p, ...patch };
        if (patch.percent !== undefined && patch.amount === undefined) {
          const pct = Number(patch.percent) || 0;
          updated.amount = Math.round((total * pct) / 100);
        } else if (patch.amount !== undefined && patch.percent === undefined) {
          const amt = Number(patch.amount) || 0;
          updated.percent = total > 0 ? Math.round((amt / total) * 100) : 0;
        }
        return updated;
      }),
    });
  };

  const events = [
    ...items
      .filter((i) => i.deliveryDate)
      .map((i) => ({
        date: i.deliveryDate,
        title: `Giao hàng: ${i.name}`,
        note: `${i.deliveredQty || 0}/${i.qty} ${i.unit} · ${i.deliveryStatus || ""}`,
        kind: "delivery",
      })),
    ...(po.payments || [])
      .filter((p) => p.date)
      .map((p) => ({
        date: p.date,
        title: `Thanh toán: ${p.phase}`,
        note: `${fmt(p.amount || 0)} ₫ · ${p.status}`,
        kind: "payment",
      })),
  ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return (
    <section className="content po-detail">
      <div className="heading">
        <div>
          <button className="back-link" onClick={onBack}>
            ← Quản lý PO
          </button>
          <em>{isContractPO(po) ? "HỢP ĐỒNG MUA HÀNG" : "ĐƠN MUA HÀNG"} · {po.number}</em>
          <h1>{supplier?.name || "Chưa chọn nhà cung cấp"}</h1>
          <p>
            {po.prNumber ? `Từ ${po.prNumber} · ` : ""}Tạo ngày {dateVN(po.createdDate)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {!readOnly && (
            <>
              <button
                type="button"
                className="po-save-btn"
                disabled={saving}
                onClick={() => void handleManualSave(false)}
                title="Lưu toàn bộ thông tin đơn hàng PO này"
              >
                {saving ? "⏳ Đang lưu..." : savedNotice ? "✓ Đã lưu thành công!" : "💾 Lưu đơn PO"}
              </button>
              <button
                type="button"
                className="po-save-back-btn"
                disabled={saving}
                onClick={() => void handleManualSave(true)}
                title="Lưu thông tin và quay lại danh sách PO"
              >
                ✓ Lưu & Quay lại
              </button>
            </>
          )}
          {onCreateHandover && (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => onCreateHandover(po)}
              title="Tạo biên bản bàn giao cho các mặt hàng trong đơn này"
            >
              🚚 Tạo biên bản bàn giao
            </button>
          )}
          <div className="po-total">
            <span>Giá trị PO</span>
            <b>{fmt(total)} ₫</b>
            <i>{po.status}</i>
          </div>
        </div>
      </div>
      <section className="common-note-card po-common-note">
        <label>
          <span>✎ Ghi chú chung PO</span>
          <textarea
            rows={3}
            value={po.note || ""}
            placeholder="Diễn giải tự do, điều kiện đặc biệt hoặc lưu ý thực hiện PO..."
            onChange={(e) => onUpdate({ ...po, note: e.target.value })}
          />
        </label>
      </section>
      <div className="po-tabs" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "4px", overflowX: "auto" }}>
          <a href="#supplier">Thông tin NCC</a>
          <a href="#delivery">Giao hàng</a>
          <a href="#documents">Hồ sơ</a>
          <a href="#payments">Thanh toán</a>
          <a href="#timeline">Timeline</a>
        </div>
        {!readOnly && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingRight: "4px" }}>
            {savedNotice && (
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#168446" }}>
                ✓ Đã lưu lúc {new Date().toLocaleTimeString("vi-VN")}
              </span>
            )}
            <button
              type="button"
              className="po-save-btn"
              style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
              disabled={saving}
              onClick={() => void handleManualSave(false)}
            >
              {saving ? "⏳ Đang lưu..." : "💾 Lưu thay đổi"}
            </button>
          </div>
        )}
      </div>
      <section id="supplier" className="po-section">
        <div className="section-heading">
          <div>
            <span>▱</span>
            <h2>Thông tin nhà cung cấp</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <small>
              Đồng bộ từ danh sách nhà cung cấp ·{" "}
              <b style={{ color: supplier?.code ? "#0284c7" : "#64748b" }}>
                {supplier?.code || "Chưa có mã NCC"}
              </b>
            </small>
            {!readOnly && (
              <button
                type="button"
                onClick={() => void handleManualSave(false)}
                style={{
                  height: "30px",
                  padding: "0 12px",
                  background: "#f0fdf4",
                  borderColor: "#86efac",
                  color: "#166534",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ✓ Lưu thông tin NCC
              </button>
            )}
          </div>
        </div>
        <div className="po-supplier-form">
          <div className="full-field" style={{ marginBottom: "2px" }}>
            <SupplierSearchCombobox
              suppliers={suppliers}
              selectedSupplierId={po.supplierId || ""}
              onSelectSupplier={(id) => onUpdate({ ...po, supplierId: Number(id) || 0 })}
              onAddSupplier={(newSupp) => {
                if (onAddSupplier) {
                  onAddSupplier(newSupp);
                } else {
                  setSuppliers((prev) => [newSupp, ...prev]);
                }
                onUpdate({ ...po, supplierId: newSupp.id });
              }}
              label="Chọn hoặc tìm kiếm Nhà cung cấp cho đơn hàng"
            />
          </div>
          <label className="wide-field">
            Tên đầy đủ nhà cung cấp
            <input
              value={supplier?.name || ""}
              placeholder="Nhập tên công ty / nhà cung cấp..."
              onChange={(e) => {
                const val = e.target.value;
                supplierUpdate("name", val);
                if (supplier && (!supplier.shortName || supplier.shortName === generateShortName(supplier.name))) {
                  supplierUpdate("shortName", generateShortName(val));
                }
              }}
            />
          </label>
          <label>
            Mã NCC / Tên viết tắt
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px" }}>
              <input
                value={supplier?.code || ""}
                placeholder="Mã NCC"
                title="Mã nhà cung cấp"
                onChange={(e) => supplierUpdate("code", e.target.value)}
              />
              <input
                value={supplier?.shortName || ""}
                placeholder="Tên viết tắt"
                title="Tên viết tắt"
                onChange={(e) => supplierUpdate("shortName", e.target.value)}
              />
            </div>
          </label>
          <label>
            Số tài khoản
            <input
              value={supplier?.bankAccount || ""}
              placeholder="Nhập số tài khoản ngân hàng..."
              onChange={(e) => supplierUpdate("bankAccount", e.target.value)}
            />
          </label>
          <label>
            Ngân hàng
            <input
              list="poDetailBankList"
              value={supplier?.bank || ""}
              placeholder="Chọn hoặc nhập tên ngân hàng..."
              onChange={(e) => supplierUpdate("bank", e.target.value)}
            />
            <datalist id="poDetailBankList">
              {bankOptions.map((bn) => (
                <option key={bn} value={bn} />
              ))}
            </datalist>
          </label>
          <label>
            Người liên hệ
            <input
              value={supplier?.contact || ""}
              placeholder="Tên người liên hệ..."
              onChange={(e) => supplierUpdate("contact", e.target.value)}
            />
          </label>
          <label>
            Điện thoại
            <input
              value={supplier?.phone || ""}
              placeholder="Số điện thoại liên hệ..."
              onChange={(e) => supplierUpdate("phone", e.target.value)}
            />
          </label>
          <label className="wide-field">
            Địa chỉ
            <input
              value={supplier?.address || ""}
              placeholder="Địa chỉ xuất hóa đơn / giao dịch của nhà cung cấp..."
              onChange={(e) => supplierUpdate("address", e.target.value)}
            />
          </label>
        </div>
      </section>
      <section id="delivery" className="po-section">
        <div className="section-heading">
          <div>
            <span>▰</span>
            <h2>Tiến độ giao hàng theo sản phẩm</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {onCreateHandover && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onCreateHandover(po)}
                title="Bàn giao các sản phẩm đã nhận"
              >
                🚚 Bàn giao hàng hóa
              </button>
            )}
            <label>
              Ngày dự kiến giao chung
              <input
                type="date"
                value={po.expectedDate}
                onChange={(e) =>
                  onUpdate({ ...po, expectedDate: e.target.value })
                }
              />
            </label>
          </div>
        </div>
        <div className="delivery-table">
          <div className="mobile-record-list">
            {items.map((i) => (
              <article key={i.id}>
                <header>
                  <b>{i.name}</b>
                  <span className={`status ${i.deliveryStatus === "Đã giao" ? "done" : i.deliveryStatus === "Giao một phần" ? "progress" : "waiting"}`}>
                    {i.deliveryStatus}
                  </span>
                </header>
                <p>Mã: <b>{i.code}</b> · {i.category}</p>
                <dl>
                  <div>
                    <dt>SL đặt</dt>
                    <dd>{i.qty} {i.unit}</dd>
                  </div>
                  <div>
                    <dt>Đã giao</dt>
                    <dd>
                      <input
                        type="number"
                        min="0"
                        max={i.qty}
                        value={i.deliveredQty}
                        onChange={(e) => itemUpdate(i.id, "deliveredQty", Number(e.target.value))}
                        style={{ width: "70px", padding: "4px 8px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>
                      <select
                        value={i.deliveryStatus}
                        onChange={(e) => itemUpdate(i.id, "deliveryStatus", e.target.value)}
                        style={{ padding: "4px 6px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                      >
                        <option>Chưa giao</option>
                        <option>Giao một phần</option>
                        <option>Đã giao</option>
                      </select>
                    </dd>
                  </div>
                  <div>
                    <dt>Ngày giao</dt>
                    <dd>
                      <input
                        type="date"
                        value={i.deliveryDate || ""}
                        onChange={(e) => itemUpdate(i.id, "deliveryDate", e.target.value)}
                        style={{ padding: "4px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Còn lại</dt>
                    <dd><b>{Math.max(0, i.qty - i.deliveredQty)} {i.unit}</b></dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <th>Mã hàng</th>
                <th>Tên sản phẩm</th>
                <th>Phân bổ PR nguồn</th>
                <th>SL đặt</th>
                <th>Đã giao</th>
                <th>Trạng thái</th>
                <th>Ngày giao gần nhất</th>
                <th>Còn lại</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td>
                  <td>
                    <b>{i.name}</b>
                    <small>{i.category}</small>
                  </td>
                  <td>
                    {i.allocations?.length ? (
                      <div className="allocation-list">
                        {i.allocations.map((allocation) => (
                          <span key={`${allocation.prId}:${allocation.prItemId}`}>
                            {allocation.prNumber}: <b>{allocation.qty} {i.unit}</b>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span>{po.prNumber}</span>
                    )}
                  </td>
                  <td>
                    {i.qty} {i.unit}
                  </td>
                  <td>
                    <input
                      className="delivery-qty"
                      type="number"
                      min="0"
                      max={i.qty}
                      value={i.deliveredQty}
                      onChange={(e) =>
                        itemUpdate(i.id, "deliveredQty", Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={i.deliveryStatus}
                      onChange={(e) =>
                        itemUpdate(i.id, "deliveryStatus", e.target.value)
                      }
                    >
                      <option>Chưa giao</option>
                      <option>Giao một phần</option>
                      <option>Đã giao</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={i.deliveryDate}
                      onChange={(e) =>
                        itemUpdate(i.id, "deliveryDate", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <b
                      className={
                        i.qty - i.deliveredQty > 0 ? "remaining" : "complete"
                      }
                    >
                      {i.qty - i.deliveredQty} {i.unit}
                    </b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="po-two-columns">
        <section id="documents" className="po-section">
          <div className="section-heading">
            <div>
              <span>▧</span>
              <h2>Hồ sơ cần thiết</h2>
            </div>
            <button
              onClick={() =>
                onUpdate({
                  ...po,
                  docs: [
                    ...(po.docs || []),
                    {
                      id: makeId(),
                      name: "Hồ sơ mới",
                      status: "Còn thiếu",
                      note: "",
                    },
                  ],
                })
              }
            >
              ＋ Thêm hồ sơ
            </button>
          </div>
          <div className="checklist">
            {(po.docs || []).map((d) => (
              <div key={d.id}>
                <input
                  value={d.name}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      docs: (po.docs || []).map((x) =>
                        x.id === d.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <select
                  value={d.status}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      docs: (po.docs || []).map((x) =>
                        x.id === d.id
                          ? { ...x, status: e.target.value as PODoc["status"] }
                          : x,
                      ),
                    })
                  }
                >
                  <option>Đã đủ</option>
                  <option>Còn thiếu</option>
                  <option>Chờ bổ sung</option>
                </select>
                <input
                  placeholder="Ghi chú"
                  value={d.note}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      docs: (po.docs || []).map((x) =>
                        x.id === d.id ? { ...x, note: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          {!readOnly && (
            <DocumentManager
              title={`File hồ sơ PO ${po.number}`}
              entityType="po"
              entityId={String(po.id)}
              workspaceId={workspaceId}
              readOnly={readOnly}
              onStatus={onStatus}
            />
          )}
        </section>
        <section id="payments" className="po-section po-payment-section">
          <div className="section-heading">
            <div>
              <span>₫</span>
              <h2>Tiến độ thanh toán</h2>
            </div>
            <button type="button" onClick={handleAddPaymentStage}>
              ＋ Thêm đợt
            </button>
          </div>

          {/* Quick preset selector & allocation KPI */}
          <div className="po-payment-summary-bar">
            <div className="po-payment-summary-kpis">
              <span>Tổng đơn: <b>{fmt(total)} ₫</b></span>
              <span>
                Phân bổ:{" "}
                <b style={{ color: totalAllocatedPercent === 100 ? "#16a34a" : totalAllocatedPercent > 100 ? "#dc2626" : "#d97706" }}>
                  {totalAllocatedPercent}% ({fmt(totalAllocatedAmount)} ₫)
                </b>
              </span>
              {totalAllocatedPercent === 100 && (
                <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "12px" }}>✓ Đã đủ 100%</span>
              )}
              {totalAllocatedPercent < 100 && (
                <span style={{ color: "#d97706", fontWeight: 600, fontSize: "12px" }}>⚠️ Thiếu {100 - totalAllocatedPercent}%</span>
              )}
              {totalAllocatedPercent > 100 && (
                <span style={{ color: "#dc2626", fontWeight: 600, fontSize: "12px" }}>⚠️ Vượt {totalAllocatedPercent - 100}%</span>
              )}
            </div>
          </div>

          <div className="po-payment-preset-bar">
            <span style={{ fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Mẫu thiết lập nhanh:</span>
            <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("1-post")} title="1 đợt trả sau 100% khi nhận hàng">
              📦 1 đợt Trả sau (100%)
            </button>
            <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("1-advance")} title="1 đợt trả trước 100% tạm ứng">
              ⚡ 1 đợt Trả trước (100%)
            </button>
            <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("2-50-50")} title="2 đợt: Tạm ứng 50% + Quyết toán 50%">
              ⚖️ 2 đợt (50% - 50%)
            </button>
            <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("2-30-70")} title="2 đợt: Tạm ứng 30% + Quyết toán 70%">
              💼 2 đợt (30% - 70%)
            </button>
            <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("3-30-40-30")} title="3 đợt: Tạm ứng 30% + Giao hàng 40% + Quyết toán 30%">
              🏗️ 3 đợt (30% - 40% - 30%)
            </button>
          </div>

          {/* Payment cards list */}
          <div className="po-payment-cards-list">
            {(!po.payments || po.payments.length === 0) && (
              <div style={{ textAlign: "center", padding: "20px 12px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#64748b" }}>
                <p style={{ margin: "0 0 10px 0" }}>Chưa có đợt thanh toán nào được cấu hình cho đơn hàng này.</p>
                <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                  <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("1-post")}>
                    Chọn 1 đợt trả sau (100%)
                  </button>
                  <button type="button" className="po-preset-pill" onClick={() => handleApplyPreset("2-50-50")}>
                    Chọn 2 đợt (50% - 50%)
                  </button>
                  <button type="button" className="po-preset-pill" onClick={handleAddPaymentStage}>
                    ＋ Thêm đợt thủ công
                  </button>
                </div>
              </div>
            )}

            {po.payments?.map((p, idx) => {
              const condition = p.condition || (idx === 0 && po.payments.length > 1 ? "advance" : "post");
              return (
                <div key={p.id} className="po-payment-card">
                  {/* Card Header */}
                  <div className="po-payment-card-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                      <span className="po-stage-badge">Đợt {idx + 1}</span>
                      <input
                        className="po-stage-title-input"
                        placeholder="Tên đợt thanh toán (VD: Tạm ứng, Giao hàng, Quyết toán...)"
                        value={p.phase}
                        onChange={(e) => handleUpdatePaymentStage(p.id, { phase: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="po-stage-del-btn"
                      onClick={() => handleRemovePaymentStage(p.id)}
                      title="Xóa đợt thanh toán này (cho phép giảm xuống 1 đợt duy nhất)"
                    >
                      🗑️ Xóa đợt
                    </button>
                  </div>

                  {/* Card Body */}
                  <div className="po-payment-card-body">
                    {/* Financial details & status */}
                    <div className="po-payment-grid">
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Tỷ lệ (%)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            style={{ width: "60px", textAlign: "right" }}
                            value={p.percent}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { percent: Number(e.target.value) })}
                          />
                          <span style={{ fontWeight: 600, color: "#475569" }}>%</span>
                          {p.percent !== 100 && (
                            <button
                              type="button"
                              style={{ padding: "2px 5px", fontSize: "10px", background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: "3px", cursor: "pointer" }}
                              onClick={() => handleUpdatePaymentStage(p.id, { percent: 100 })}
                              title="Đặt đợt này thành 100%"
                            >
                              100%
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Số tiền thanh toán (₫)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input
                            type="number"
                            style={{ width: "100%", fontWeight: 700, color: "#0f172a" }}
                            value={p.amount}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { amount: Number(e.target.value) })}
                          />
                          <span style={{ fontSize: "11px", color: "#0284c7", fontWeight: 600, whiteSpace: "nowrap" }}>
                            {fmt(p.amount)} ₫
                          </span>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Trạng thái
                        </label>
                        <select
                          value={p.status}
                          onChange={(e) => handleUpdatePaymentStage(p.id, { status: e.target.value as Payment["status"] })}
                          style={{
                            fontWeight: 600,
                            color: p.status === "Đã thanh toán" ? "#16a34a" : p.status === "Đang xử lý" ? "#d97706" : "#475569"
                          }}
                        >
                          <option>Chưa thanh toán</option>
                          <option>Đang xử lý</option>
                          <option>Đã thanh toán</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                          Hạn / Ngày TT
                        </label>
                        <input
                          type="date"
                          value={p.date}
                          onChange={(e) => handleUpdatePaymentStage(p.id, { date: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Condition Selector */}
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                        Điều kiện thanh toán:
                      </label>
                      <div className="po-condition-toggles">
                        <button
                          type="button"
                          className={`po-condition-btn ${condition === "advance" ? "active-advance" : ""}`}
                          onClick={() => handleUpdatePaymentStage(p.id, {
                            condition: "advance",
                            note: p.note || "Yêu cầu bổ sung hóa đơn VAT sau khi giao hàng"
                          })}
                        >
                          ⚡ Trả trước (Tạm ứng trước giao hàng)
                        </button>
                        <button
                          type="button"
                          className={`po-condition-btn ${condition === "post" ? "active-post" : ""}`}
                          onClick={() => handleUpdatePaymentStage(p.id, {
                            condition: "post",
                            note: p.note === "Yêu cầu bổ sung hóa đơn VAT sau khi giao hàng" ? "" : p.note
                          })}
                        >
                          📦 Trả sau (Sau khi nhận hàng & HĐ VAT)
                        </button>
                        <button
                          type="button"
                          className={`po-condition-btn ${condition === "other" ? "active-other" : ""}`}
                          onClick={() => handleUpdatePaymentStage(p.id, { condition: "other" })}
                        >
                          ⚙️ Khác
                        </button>
                      </div>
                    </div>

                    {/* Condition Requirements & Invoices */}
                    {condition === "advance" && (
                      <div className="po-condition-box-advance">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <span style={{ fontSize: "14px" }}>⚠️</span>
                          <div>
                            <b>Quy định trả trước: Yêu cầu bổ sung hóa đơn sau khi giao hàng</b>
                            <p style={{ margin: "2px 0 0 0", color: "#78350f" }}>
                              Đợt thanh toán trả trước (tạm ứng). NCC chưa xuất hóa đơn VAT tại thời điểm giải ngân đợt này.
                              Bắt buộc NCC phải bổ sung đầy đủ Hóa đơn GTGT sau khi hoàn tất giao hàng & nghiệm thu.
                            </p>
                          </div>
                        </div>
                        <div className="po-invoice-row">
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Số HĐ VAT bổ sung (nếu đã nhận):
                            </span>
                            <input
                              placeholder="Chờ NCC bổ sung sau giao hàng..."
                              value={p.invoiceNo || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceNo: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ngày HĐ VAT:
                            </span>
                            <input
                              type="date"
                              value={p.invoiceDate || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceDate: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ghi chú điều kiện / Hạn nợ HĐ:
                            </span>
                            <input
                              placeholder="Hạn bổ sung HĐ sau giao hàng..."
                              value={p.note || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { note: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {condition === "post" && (
                      <div className="po-condition-box-post">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <span style={{ fontSize: "14px" }}>📄</span>
                          <div>
                            <b>Quy định trả sau: Yêu cầu nhập hóa đơn đã xuất</b>
                            <p style={{ margin: "2px 0 0 0", color: "#14532d" }}>
                              Đợt thanh toán trả sau (sau giao hàng / công nợ). Yêu cầu nhập đầy đủ thông tin Hóa đơn GTGT do NCC đã phát hành trước khi giải ngân.
                            </p>
                          </div>
                        </div>
                        <div className="po-invoice-row">
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px", color: !p.invoiceNo ? "#b91c1c" : "#166534" }}>
                              Số HĐ GTGT đã xuất: {!p.invoiceNo && "(Cần nhập)"}
                            </span>
                            <input
                              placeholder="Ví dụ: 0012345, 1C24T..."
                              style={{ borderColor: !p.invoiceNo ? "#f87171" : "#86efac" }}
                              value={p.invoiceNo || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceNo: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ngày xuất hóa đơn:
                            </span>
                            <input
                              type="date"
                              value={p.invoiceDate || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceDate: e.target.value })}
                            />
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>
                              Ghi chú chứng từ kèm theo:
                            </span>
                            <input
                              placeholder="Biên bản giao hàng, phiếu nghiệm thu..."
                              value={p.note || ""}
                              onChange={(e) => handleUpdatePaymentStage(p.id, { note: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {condition === "other" && (
                      <div className="po-condition-box-other">
                        <span style={{ fontWeight: 600 }}>Tùy chọn chứng từ hóa đơn:</span>
                        <div className="po-invoice-row">
                          <input
                            placeholder="Số hóa đơn (nếu có)..."
                            value={p.invoiceNo || ""}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceNo: e.target.value })}
                          />
                          <input
                            type="date"
                            value={p.invoiceDate || ""}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { invoiceDate: e.target.value })}
                          />
                          <input
                            placeholder="Ghi chú điều khoản thanh toán..."
                            value={p.note || ""}
                            onChange={(e) => handleUpdatePaymentStage(p.id, { note: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Lập ĐNTT / Xem ĐNTT liên kết */}
                  <div className="po-payment-card-footer">
                    {p.paymentRequestId ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px", flexWrap: "wrap" }}>
                        <div className="po-payment-req-linked">
                          <span>✓ Đã liên kết Đề nghị thanh toán #{p.paymentRequestId}</span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            className="po-create-payment-req-btn"
                            onClick={() => onNavigateToPayment?.(p.paymentRequestId)}
                          >
                            👁️ Xem ĐNTT trong Quản lý thanh toán →
                          </button>
                          <button
                            type="button"
                            style={{ padding: "4px 8px", background: "transparent", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px", color: "#64748b", cursor: "pointer" }}
                            onClick={() => {
                              if (confirm("Bạn có muốn hủy liên kết ĐNTT này khỏi đợt thanh toán không?")) {
                                handleUpdatePaymentStage(p.id, { paymentRequestId: undefined });
                              }
                            }}
                            title="Hủy liên kết để có thể lập lại ĐNTT mới nếu cần"
                          >
                            Hủy liên kết
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          Chưa lập ĐNTT cho đợt này ({fmt(p.amount)} ₫).
                        </span>
                        {onCreatePaymentRequest && (
                          <button
                            type="button"
                            className="po-create-payment-req-btn"
                            onClick={() => onCreatePaymentRequest(po, p)}
                          >
                            💳 Lập Đề nghị thanh toán (ĐNTT)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <section id="timeline" className="po-section">
        <div className="section-heading">
          <div>
            <span>◷</span>
            <h2>Timeline giao hàng & thanh toán</h2>
          </div>
        </div>
        <div className="timeline">
          <VisualTimeline
            empty="Chưa có sự kiện giao hàng hoặc thanh toán."
            items={events.map((e, i) => ({
              id: i,
              date: e.date,
              title: e.title,
              note: e.note,
              status: e.kind === "payment" ? "done" : "doing",
            }))}
          />
        </div>
      </section>

      {!readOnly && (
        <div className="po-footer-actions">
          <button
            type="button"
            className="btn btn-outline btn-md"
            onClick={onBack}
            style={{
              height: "38px",
              padding: "0 16px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Quay lại danh sách PO
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {savedNotice && (
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#168446" }}>
                ✓ Đã lưu thành công!
              </span>
            )}
            <button
              type="button"
              className="po-save-btn"
              disabled={saving}
              onClick={() => void handleManualSave(false)}
            >
              {saving ? "⏳ Đang lưu..." : "💾 Lưu thông tin PO"}
            </button>
            <button
              type="button"
              className="po-save-back-btn"
              disabled={saving}
              onClick={() => void handleManualSave(true)}
            >
              ✓ Lưu & Quay lại danh sách
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

