import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
// Add other imports as necessary

export function PRList({
  prs,
  onCreate,
  onOpen,
  onDelete,
}: {
  prs: PR[];
  onCreate: () => void;
  onOpen: (pr: PR) => void;
  onDelete?: (pr: PR) => void;
}) {
  const [q, setQ] = useState("");
  const shown = prs.filter((p) =>
    (p.number + p.department + p.purpose)
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <section className="content pr-page">
      <div className="heading">
        <div>
          <em>QUẢN LÝ ĐỀ NGHỊ MUA HÀNG</em>
          <h1>Danh sách PR</h1>
          <p>Theo dõi yêu cầu mua hàng và chuyển sang bước lấy báo giá.</p>
        </div>
        <button className="primary" onClick={onCreate}>
          ＋ Tạo PR mới
        </button>
      </div>
      <div className="pr-stats">
        <article>
          <span>Tổng số PR</span>
          <strong>{prs.length}</strong>
          <small>Trong danh sách hiện tại</small>
        </article>
        <article>
          <span>Chờ xử lý</span>
          <strong>{prs.filter((p) => p.status === "Chờ xử lý").length}</strong>
          <small>Cần tiếp tục thực hiện</small>
        </article>
        <article>
          <span>Đang lấy báo giá</span>
          <strong>
            {prs.filter((p) => p.status === "Đang lấy báo giá").length}
          </strong>
          <small>Đang so sánh nhà cung cấp</small>
        </article>
      </div>
      <div className="pr-panel">
        <div className="pr-toolbar">
          <label>
            ⌕
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm số PR, đơn vị, mục đích..."
            />
          </label>
          <span>{shown.length} yêu cầu mua hàng</span>
        </div>
        <div className="mobile-record-list">
          {shown.map((pr) => (
            <article key={pr.id}>
              <header><button onClick={() => onOpen(pr)}>{pr.number}</button><span className={`status ${pr.status === "Đã hoàn thành" ? "done" : pr.status.includes("PO") || pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}>{pr.status}</span></header>
              <h3>{pr.department}</h3>
              <p>{pr.purpose}</p>
              <dl><div><dt>Ngày PR</dt><dd>{dateVN(pr.date)}</dd></div><div><dt>Mặt hàng</dt><dd>{pr.items.length}</dd></div><div><dt>Dự kiến</dt><dd>{fmt(pr.items.reduce((sum, item) => sum + item.qty * item.estimate, 0))} ₫</dd></div></dl>
              <footer><button className="row-action" onClick={() => onOpen(pr)}>Mở PR</button>{onDelete && <button className="delete-action" onClick={() => onDelete(pr)}>Xóa</button>}</footer>
            </article>
          ))}
        </div>
        <div className="pr-table">
          <table>
            <thead>
              <tr>
                <th>Số PR</th>
                <th>Ngày PR</th>
                <th>Đơn vị</th>
                <th>Mục đích sử dụng</th>
                <th>Số mặt hàng</th>
                <th>Giá trị dự kiến</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <button className="pr-link" onClick={() => onOpen(pr)}>
                      {pr.number}
                    </button>
                  </td>
                  <td>{dateVN(pr.date)}</td>
                  <td>{pr.department}</td>
                  <td className="purpose-cell">{pr.purpose}</td>
                  <td className="center">{pr.items.length}</td>
                  <td className="money">
                    {fmt(pr.items.reduce((s, i) => s + i.qty * i.estimate, 0))}{" "}
                    ₫
                  </td>
                  <td>
                    <span
                      className={`status ${pr.status === "Đã hoàn thành" ? "done" : pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}
                    >
                      {pr.status}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="row-action" onClick={() => onOpen(pr)}>
                        Mở PR →
                      </button>
                      {onDelete && (
                        <button className="delete-action" onClick={() => onDelete(pr)}>
                          Xóa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

