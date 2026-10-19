import React, { useState } from "react";
import { Supplier, PO, PR, Item } from "../types";
import { fmt, dateVN, makeId } from "../utils";
import "../payment.css";

interface DraftPOItem {
  id: number;
  code: string;
  category: string;
  name: string;
  desc: string;
  spec: string;
  unit: string;
  qty: number;
  price: number;
}

export function POList({
  pos,
  suppliers,
  onOpen,
  onDelete,
  prs = [],
  products = [],
  onCreatePO,
  readOnly = false,
}: {
  pos: PO[];
  suppliers: Supplier[];
  onOpen: (po: PO) => void;
  onDelete?: (po: PO) => void;
  prs?: PR[];
  products?: Item[];
  onCreatePO?: (po: PO, openDetail?: boolean, sourcePrId?: number) => void;
  readOnly?: boolean;
}) {
  const [q, setQ] = useState("");

  // Create Direct PO Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draftNumber, setDraftNumber] = useState("");
  const [draftSupplierId, setDraftSupplierId] = useState<number | "">("");
  const [draftPrId, setDraftPrId] = useState<number | "">("");
  const [draftPrNumber, setDraftPrNumber] = useState("Mua trực tiếp");
  const [draftCreatedDate, setDraftCreatedDate] = useState("");
  const [draftExpectedDate, setDraftExpectedDate] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftItems, setDraftItems] = useState<DraftPOItem[]>([]);
  const [itemError, setItemError] = useState("");

  const resetDraft = () => {
    const currentYear = new Date().getFullYear();
    const poNum = `PO-${currentYear}-${String(pos.length + 1).padStart(4, "0")}`;
    setDraftNumber(poNum);
    setDraftSupplierId(suppliers[0]?.id || "");
    setDraftPrId("");
    setDraftPrNumber("Mua trực tiếp");
    setDraftCreatedDate(new Date().toISOString().slice(0, 10));
    setDraftExpectedDate("");
    setDraftNote("Tạo trực tiếp không qua so sánh báo giá");
    setDraftItems([
      {
        id: makeId(),
        code: "VT-01",
        category: "Vật tư chung",
        name: "",
        desc: "",
        spec: "",
        unit: "Cái",
        qty: 1,
        price: 0,
      },
    ]);
    setItemError("");
  };

  const handleSelectPR = (prIdVal: string) => {
    if (!prIdVal) {
      setDraftPrId("");
      setDraftPrNumber("Mua trực tiếp");
      return;
    }
    const prId = Number(prIdVal);
    setDraftPrId(prId);
    const foundPR = prs.find((p) => p.id === prId);
    if (foundPR) {
      setDraftPrNumber(foundPR.number);
      if (foundPR.items && foundPR.items.length > 0) {
        setDraftItems(
          foundPR.items.map((it, idx) => ({
            id: makeId(),
            code: it.code || `VT-${String(idx + 1).padStart(2, "0")}`,
            category: it.category || "Vật tư chung",
            name: it.name,
            desc: it.desc || "",
            spec: it.spec || "",
            unit: it.unit || "Cái",
            qty: it.qty || 1,
            price: it.estimate || 0,
          }))
        );
      }
    }
  };

  const draftTotal = draftItems.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
    0
  );

  const handleSavePO = (openDetail: boolean) => {
    if (!draftNumber.trim()) {
      setItemError("Vui lòng nhập số PO.");
      return;
    }
    if (!draftSupplierId) {
      setItemError("Vui lòng chọn nhà cung cấp.");
      return;
    }
    if (draftItems.length === 0) {
      setItemError("Đơn hàng phải có ít nhất 1 mặt hàng.");
      return;
    }
    const invalidItem = draftItems.find(
      (it) => !it.name.trim() || Number(it.qty) <= 0
    );
    if (invalidItem) {
      setItemError("Mỗi dòng hàng cần có tên mặt hàng và số lượng > 0.");
      return;
    }

    const supplierIdNum = Number(draftSupplierId);
    const newPO: PO = {
      id: makeId(),
      number: draftNumber.trim(),
      prNumber: draftPrNumber.trim() || "Mua trực tiếp",
      supplierId: supplierIdNum,
      createdDate: draftCreatedDate || new Date().toISOString().slice(0, 10),
      expectedDate: draftExpectedDate || "",
      status: "Mới tạo",
      items: draftItems.map((item, idx) => ({
        id: item.id || makeId(),
        code: item.code || `VT-${String(idx + 1).padStart(2, "0")}`,
        category: item.category || "Hàng hóa",
        name: item.name.trim(),
        desc: item.desc || "",
        spec: item.spec || "",
        unit: item.unit.trim() || "Cái",
        qty: Number(item.qty) || 1,
        estimate: Number(item.price) || 0,
        price: Number(item.price) || 0,
        deliveryStatus: "Chưa giao",
        deliveredQty: 0,
        deliveryDate: "",
      })),
      docs: [
        {
          id: makeId(),
          name: "Hợp đồng / PO xác nhận",
          status: "Chờ bổ sung",
          note: "",
        },
        {
          id: makeId(),
          name: "Hóa đơn VAT",
          status: "Còn thiếu",
          note: "",
        },
        {
          id: makeId(),
          name: "Biên bản giao nhận",
          status: "Còn thiếu",
          note: "",
        },
      ],
      payments: [
        {
          id: makeId(),
          phase: "Tạm ứng",
          percent: 50,
          amount: Math.round(draftTotal * 0.5),
          status: "Chưa thanh toán",
          date: "",
        },
        {
          id: makeId(),
          phase: "Quyết toán / Hoàn tất",
          percent: 50,
          amount: draftTotal - Math.round(draftTotal * 0.5),
          status: "Chưa thanh toán",
          date: "",
        },
      ],
      note: draftNote.trim(),
      contractNote: "",
    };

    const sourcePrId = typeof draftPrId === "number" ? draftPrId : undefined;
    onCreatePO?.(newPO, openDetail, sourcePrId);
    setShowCreateModal(false);
  };

  const shown = pos.filter((po) => {
    const s = suppliers.find((x) => x.id === po.supplierId);
    return (po.number + po.prNumber + (s?.name || ""))
      .toLowerCase()
      .includes(q.toLowerCase());
  });

  return (
    <section className="content po-list-page">
      <div className="heading">
        <div>
          <em>THEO DÕI ĐƠN MUA HÀNG</em>
          <h1>Quản lý PO</h1>
          <p>Kiểm soát giao hàng, hồ sơ và thanh toán theo từng đơn mua.</p>
        </div>
        {!readOnly && onCreatePO && (
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                resetDraft();
                setShowCreateModal(true);
              }}
            >
              ＋ Tạo đơn PO mới
            </button>
          </div>
        )}
      </div>

      <div className="po-kpis">
        <article>
          <span>Tổng PO</span>
          <b>{pos.length}</b>
        </article>
        <article>
          <span>Đang giao hàng</span>
          <b>{pos.filter((p) => p.status.includes("giao")).length}</b>
        </article>
        <article>
          <span>Hồ sơ còn thiếu</span>
          <b>
            {pos.reduce(
              (n, p) => n + p.docs.filter((d) => d.status !== "Đã đủ").length,
              0
            )}
          </b>
        </article>
        <article>
          <span>Chờ thanh toán</span>
          <b>
            {pos.reduce(
              (n, p) =>
                n +
                p.payments.filter((x) => x.status !== "Đã thanh toán").length,
              0
            )}
          </b>
        </article>
      </div>

      <div className="po-list-panel">
        <div className="pr-toolbar">
          <label>
            ⌕
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm số PO, PR hoặc nhà cung cấp..."
            />
          </label>
          <span>{shown.length} đơn mua hàng</span>
        </div>

        <div className="mobile-record-list">
          {shown.map((po) => {
            const supplier = suppliers.find((s) => s.id === po.supplierId),
              total = po.items.reduce((sum, item) => sum + item.qty * item.price, 0),
              delivered = po.items.filter((item) => item.deliveryStatus === "Đã giao").length;
            return (
              <article key={po.id}>
                <header>
                  <button onClick={() => onOpen(po)}>{po.number}</button>
                  <span className="status progress">{po.status}</span>
                </header>
                <h3>{supplier?.name || "Chưa có nhà cung cấp"}</h3>
                <p>
                  {po.prNumber} · {dateVN(po.createdDate)}
                </p>
                <dl>
                  <div>
                    <dt>Giá trị</dt>
                    <dd>{fmt(total)} ₫</dd>
                  </div>
                  <div>
                    <dt>Giao hàng</dt>
                    <dd>
                      {delivered}/{po.items.length}
                    </dd>
                  </div>
                </dl>
                <footer>
                  <button className="row-action" onClick={() => onOpen(po)}>
                    Quản lý PO
                  </button>
                  {onDelete && (
                    <button className="delete-action" onClick={() => onDelete(po)}>
                      Xóa
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        <div className="pr-table">
          <table>
            <thead>
              <tr>
                <th>Số PO</th>
                <th>PR nguồn</th>
                <th>Nhà cung cấp</th>
                <th>Ngày tạo</th>
                <th>Ngày dự kiến giao</th>
                <th>Giá trị PO</th>
                <th>Giao hàng</th>
                <th>Hồ sơ</th>
                <th>Thanh toán</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((po) => {
                const s = suppliers.find((x) => x.id === po.supplierId),
                  delivered = po.items.filter(
                    (i) => i.deliveryStatus === "Đã giao"
                  ).length,
                  docs = po.docs.filter((d) => d.status === "Đã đủ").length,
                  paid = po.payments
                    .filter((p) => p.status === "Đã thanh toán")
                    .reduce((n, p) => n + p.amount, 0),
                  total = po.items.reduce((n, i) => n + i.qty * i.price, 0);
                return (
                  <tr key={po.id}>
                    <td>
                      <button className="pr-link" onClick={() => onOpen(po)}>
                        {po.number}
                      </button>
                    </td>
                    <td>{po.prNumber}</td>
                    <td>
                      <b>{s?.name}</b>
                      <small className="supplier-code">{s?.code}</small>
                    </td>
                    <td>{dateVN(po.createdDate)}</td>
                    <td>{dateVN(po.expectedDate)}</td>
                    <td className="money">{fmt(total)} ₫</td>
                    <td>
                      <span className="mini-progress">
                        <i
                          style={{
                            width: `${po.items.length ? (delivered / po.items.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <small>
                        {delivered}/{po.items.length} mặt hàng
                      </small>
                    </td>
                    <td>
                      <span
                        className={
                          docs === po.docs.length
                            ? "status done"
                            : "status waiting"
                        }
                      >
                        {docs}/{po.docs.length} đủ
                      </span>
                    </td>
                    <td>
                      <b>{total ? Math.round((paid / total) * 100) : 0}%</b>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="row-action" onClick={() => onOpen(po)}>
                          Quản lý →
                        </button>
                        {onDelete && (
                          <button
                            className="delete-action"
                            onClick={() => onDelete(po)}
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE DIRECT PO MODAL */}
      {showCreateModal && (
        <div
          className="payment-modal-overlay"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="payment-modal-card"
            style={{ maxWidth: 900, width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>
                  ＋ Tạo đơn mua hàng (PO) mới
                </h3>
                <small style={{ color: "#64748b" }}>
                  Tạo trực tiếp không qua luồng so sánh báo giá
                </small>
              </div>
              <button
                type="button"
                className="payment-modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxHeight: "75vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {/* General Form */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Số PO <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftNumber}
                    onChange={(e) => setDraftNumber(e.target.value)}
                    placeholder="VD: PO-2026-0001"
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Nhà cung cấp <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <select
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftSupplierId}
                    onChange={(e) =>
                      setDraftSupplierId(Number(e.target.value) || "")
                    }
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Nguồn PR (Tùy chọn)
                  </label>
                  <select
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftPrId}
                    onChange={(e) => handleSelectPR(e.target.value)}
                  >
                    <option value="">Mua trực tiếp (Không qua PR)</option>
                    {prs.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.number} - {pr.department || "PR"} (
                        {pr.items?.length || 0} mục)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Ngày tạo đơn
                  </label>
                  <input
                    type="date"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftCreatedDate}
                    onChange={(e) => setDraftCreatedDate(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Hạn hoàn tất giao hàng
                  </label>
                  <input
                    type="date"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftExpectedDate}
                    onChange={(e) => setDraftExpectedDate(e.target.value)}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Ghi chú PO
                  </label>
                  <input
                    type="text"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder="Ghi chú về đơn hàng, điều khoản giao hàng..."
                  />
                </div>
              </div>

              {/* Items Section */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: 14, color: "#1e293b" }}>
                    Danh sách mặt hàng ({draftItems.length})
                  </h4>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {products && products.length > 0 && (
                      <select
                        className="payment-input"
                        style={{ fontSize: 12, maxWidth: 220 }}
                        value=""
                        onChange={(e) => {
                          const prodId = Number(e.target.value);
                          const prod = products.find((p) => p.id === prodId);
                          if (prod) {
                            setDraftItems((prev) => [
                              ...prev,
                              {
                                id: makeId(),
                                code:
                                  prod.code ||
                                  `VT-${String(prev.length + 1).padStart(2, "0")}`,
                                category: prod.category || "Hàng hóa",
                                name: prod.name,
                                desc: prod.desc || "",
                                spec: prod.spec || "",
                                unit: prod.unit || "Cái",
                                qty: 1,
                                price: prod.estimate || 0,
                              },
                            ]);
                          }
                        }}
                      >
                        <option value="">＋ Thêm từ danh mục vật tư...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} - {p.name} ({p.unit})
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="payment-btn"
                      onClick={() =>
                        setDraftItems((prev) => [
                          ...prev,
                          {
                            id: makeId(),
                            code: `VT-${String(prev.length + 1).padStart(2, "0")}`,
                            category: "Vật tư",
                            name: "",
                            desc: "",
                            spec: "",
                            unit: "Cái",
                            qty: 1,
                            price: 0,
                          },
                        ])
                      }
                    >
                      ＋ Thêm dòng hàng
                    </button>
                  </div>
                </div>

                {/* Items Table */}
                <div
                  style={{
                    overflowX: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: "#f8fafc",
                          borderBottom: "1px solid #cbd5e1",
                        }}
                      >
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            width: 35,
                          }}
                        >
                          STT
                        </th>
                        <th style={{ padding: "8px 6px", textAlign: "left" }}>
                          Tên mặt hàng <span style={{ color: "#ef4444" }}>*</span>
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "left",
                            width: 140,
                          }}
                        >
                          Quy cách
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            width: 65,
                          }}
                        >
                          ĐVT
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                            width: 75,
                          }}
                        >
                          Số lượng
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                            width: 110,
                          }}
                        >
                          Đơn giá (₫)
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                            width: 110,
                          }}
                        >
                          Thành tiền
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            width: 40,
                          }}
                        ></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftItems.map((item, idx) => {
                        const lineTotal =
                          (Number(item.qty) || 0) * (Number(item.price) || 0);
                        return (
                          <tr
                            key={item.id}
                            style={{ borderBottom: "1px solid #f1f5f9" }}
                          >
                            <td
                              style={{
                                textAlign: "center",
                                color: "#64748b",
                              }}
                            >
                              {idx + 1}
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="text"
                                required
                                className="payment-input"
                                style={{ width: "100%" }}
                                value={item.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, name: val } : it
                                    )
                                  );
                                }}
                                placeholder="Nhập tên mặt hàng..."
                              />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="text"
                                className="payment-input"
                                style={{ width: "100%" }}
                                value={item.spec}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, spec: val } : it
                                    )
                                  );
                                }}
                                placeholder="Quy cách..."
                              />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="text"
                                className="payment-input"
                                style={{
                                  width: "100%",
                                  textAlign: "center",
                                }}
                                value={item.unit}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, unit: val } : it
                                    )
                                  );
                                }}
                              />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="number"
                                min="1"
                                className="payment-input"
                                style={{
                                  width: "100%",
                                  textAlign: "right",
                                }}
                                value={item.qty}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, qty: val } : it
                                    )
                                  );
                                }}
                              />
                            </td>
                            <td style={{ padding: "4px" }}>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                className="payment-input"
                                style={{
                                  width: "100%",
                                  textAlign: "right",
                                }}
                                value={item.price}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, price: val } : it
                                    )
                                  );
                                }}
                              />
                            </td>
                            <td
                              style={{
                                padding: "6px 8px",
                                textAlign: "right",
                                fontWeight: 600,
                                color: "#0f172a",
                              }}
                            >
                              {fmt(lineTotal)} ₫
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {draftItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftItems((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    )
                                  }
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    fontSize: 16,
                                    padding: "2px 6px",
                                  }}
                                  title="Xóa dòng"
                                >
                                  🗑
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr
                        style={{
                          background: "#f8fafc",
                          fontWeight: 700,
                          borderTop: "2px solid #cbd5e1",
                        }}
                      >
                        <td
                          colSpan={4}
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                          }}
                        >
                          TỔNG GIÁ TRỊ ĐƠN HÀNG (PO):
                        </td>
                        <td
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                          }}
                        >
                          {draftItems.reduce(
                            (s, it) => s + (Number(it.qty) || 0),
                            0
                          )}
                        </td>
                        <td></td>
                        <td
                          style={{
                            padding: "8px 8px",
                            textAlign: "right",
                            color: "#0284c7",
                            fontSize: 13,
                          }}
                        >
                          {fmt(draftTotal)} ₫
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Quick info note */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#166534",
                }}
              >
                ℹ️ Đơn PO sau khi tạo sẽ tự động khởi tạo hồ sơ nghiệm thu tiêu chuẩn (Hợp đồng/PO, Hóa đơn VAT, Biên bản giao nhận) và 2 mốc giải ngân (Tạm ứng 50%, Hoàn tất 50%). Bạn có thể tùy chỉnh lại bất cứ lúc nào trong trang Chi tiết PO.
              </div>

              {itemError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ⚠ {itemError}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              className="payment-modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                borderTop: "1px solid #e2e8f0",
                paddingTop: 12,
              }}
            >
              <button
                type="button"
                className="payment-btn"
                onClick={() => setShowCreateModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="payment-btn"
                onClick={() => handleSavePO(false)}
              >
                ✓ Lưu đơn PO
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                onClick={() => handleSavePO(true)}
              >
                ✓ Lưu & Mở chi tiết PO →
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
