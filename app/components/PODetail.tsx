import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View, POItem, PODoc, Payment } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import VisualTimeline from "../VisualTimeline";
import DocumentManager from "../DocumentManager";
// Add other imports as necessary

export function PODetail({
  po,
  suppliers,
  setSuppliers,
  onUpdate,
  onBack,
  workspaceId,
  readOnly = false,
  onStatus,
}: {
  po: PO;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onUpdate: (po: PO) => void;
  onBack: () => void;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
}) {
  const supplier = suppliers.find((s) => s.id === po.supplierId)!;
  const total = po.items.reduce((s, i) => s + i.qty * i.price, 0);
  const supplierUpdate = (key: keyof Supplier, value: string) =>
    setSuppliers((list) =>
      list.map((s) => (s.id === supplier.id ? { ...s, [key]: value } : s)),
    );
  const itemUpdate = (id: number, key: keyof POItem, value: string | number) =>
    onUpdate({
      ...po,
      items: po.items.map((i) => (i.id === id ? { ...i, [key]: value } : i)),
    });
  const events = [
    ...po.items
      .filter((i) => i.deliveryDate)
      .map((i) => ({
        date: i.deliveryDate,
        title: `Giao hàng: ${i.name}`,
        note: `${i.deliveredQty}/${i.qty} ${i.unit} · ${i.deliveryStatus}`,
        kind: "delivery",
      })),
    ...po.payments
      .filter((p) => p.date)
      .map((p) => ({
        date: p.date,
        title: `Thanh toán: ${p.phase}`,
        note: `${fmt(p.amount)} ₫ · ${p.status}`,
        kind: "payment",
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="content po-detail">
      <div className="heading">
        <div>
          <button className="back-link" onClick={onBack}>
            ← Quản lý PO
          </button>
          <em>ĐƠN MUA HÀNG · {po.number}</em>
          <h1>{supplier?.name}</h1>
          <p>
            Từ {po.prNumber} · Tạo ngày {dateVN(po.createdDate)}
          </p>
        </div>
        <div className="po-total">
          <span>Giá trị PO</span>
          <b>{fmt(total)} ₫</b>
          <i>{po.status}</i>
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
      <div className="po-tabs">
        <a href="#supplier">Thông tin NCC</a>
        <a href="#delivery">Giao hàng</a>
        <a href="#documents">Hồ sơ</a>
        <a href="#payments">Thanh toán</a>
        <a href="#timeline">Timeline</a>
      </div>
      <section id="supplier" className="po-section">
        <div className="section-heading">
          <div>
            <span>▱</span>
            <h2>Thông tin nhà cung cấp</h2>
          </div>
          <small>Đồng bộ từ danh sách nhà cung cấp · {supplier.code}</small>
        </div>
        <div className="po-supplier-form">
          <label>
            Nhà cung cấp
            <select
              value={po.supplierId}
              onChange={(e) =>
                onUpdate({ ...po, supplierId: Number(e.target.value) })
              }
            >
              {suppliers.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số tài khoản
            <input
              value={supplier.bankAccount}
              onChange={(e) => supplierUpdate("bankAccount", e.target.value)}
            />
          </label>
          <label>
            Ngân hàng
            <input
              value={supplier.bank}
              onChange={(e) => supplierUpdate("bank", e.target.value)}
            />
          </label>
          <label>
            Người liên hệ
            <input
              value={supplier.contact}
              onChange={(e) => supplierUpdate("contact", e.target.value)}
            />
          </label>
          <label>
            Điện thoại
            <input
              value={supplier.phone}
              onChange={(e) => supplierUpdate("phone", e.target.value)}
            />
          </label>
          <label className="wide-field">
            Địa chỉ
            <input
              value={supplier.address}
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
        <div className="delivery-table">
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
              {po.items.map((i) => (
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
                    ...po.docs,
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
            {po.docs.map((d) => (
              <div key={d.id}>
                <input
                  value={d.name}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      docs: po.docs.map((x) =>
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
                      docs: po.docs.map((x) =>
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
                      docs: po.docs.map((x) =>
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
        <section id="payments" className="po-section">
          <div className="section-heading">
            <div>
              <span>₫</span>
              <h2>Tiến độ thanh toán</h2>
            </div>
            <button
              onClick={() =>
                onUpdate({
                  ...po,
                  payments: [
                    ...po.payments,
                    {
                      id: makeId(),
                      phase: "Đợt mới",
                      percent: 0,
                      amount: 0,
                      status: "Chưa thanh toán",
                      date: "",
                    },
                  ],
                })
              }
            >
              ＋ Thêm đợt
            </button>
          </div>
          <div className="payment-list">
            {po.payments.map((p) => (
              <div key={p.id}>
                <input
                  value={p.phase}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      payments: po.payments.map((x) =>
                        x.id === p.id ? { ...x, phase: e.target.value } : x,
                      ),
                    })
                  }
                />
                <label>
                  <input
                    type="number"
                    value={p.percent}
                    onChange={(e) =>
                      onUpdate({
                        ...po,
                        payments: po.payments.map((x) =>
                          x.id === p.id
                            ? {
                                ...x,
                                percent: Number(e.target.value),
                                amount: (total * Number(e.target.value)) / 100,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  %
                </label>
                <b>{fmt(p.amount)} ₫</b>
                <select
                  value={p.status}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      payments: po.payments.map((x) =>
                        x.id === p.id
                          ? {
                              ...x,
                              status: e.target.value as Payment["status"],
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option>Chưa thanh toán</option>
                  <option>Đang xử lý</option>
                  <option>Đã thanh toán</option>
                </select>
                <input
                  type="date"
                  value={p.date}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      payments: po.payments.map((x) =>
                        x.id === p.id ? { ...x, date: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
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
    </section>
  );
}

