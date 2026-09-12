import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
// Add other imports as necessary

export function POList({
  pos,
  suppliers,
  onOpen,
  onDelete,
}: {
  pos: PO[];
  suppliers: Supplier[];
  onOpen: (po: PO) => void;
  onDelete?: (po: PO) => void;
}) {
  const [q, setQ] = useState("");
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
              0,
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
              0,
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
                <header><button onClick={() => onOpen(po)}>{po.number}</button><span className="status progress">{po.status}</span></header>
                <h3>{supplier?.name || "Chưa có nhà cung cấp"}</h3>
                <p>{po.prNumber} · {dateVN(po.createdDate)}</p>
                <dl><div><dt>Giá trị</dt><dd>{fmt(total)} ₫</dd></div><div><dt>Giao hàng</dt><dd>{delivered}/{po.items.length}</dd></div></dl>
                <footer><button className="row-action" onClick={() => onOpen(po)}>Quản lý PO</button>{onDelete && <button className="delete-action" onClick={() => onDelete(po)}>Xóa</button>}</footer>
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
                    (i) => i.deliveryStatus === "Đã giao",
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
                          <button className="delete-action" onClick={() => onDelete(po)}>
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
    </section>
  );
}

