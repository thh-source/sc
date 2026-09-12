import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
// Add other imports as necessary

export function Dashboard({
  prs,
  pos,
  suppliers,
  purchaseHistory,
  onPR,
  onPO,
  onCompare,
}: {
  prs: PR[];
  pos: PO[];
  suppliers: Supplier[];
  purchaseHistory: PurchaseHistory[];
  onPR: () => void;
  onPO: () => void;
  onCompare: () => void;
}) {
  const poValue = pos.reduce(
      (n, p) => n + p.items.reduce((s, i) => s + i.qty * i.price, 0),
      0,
    ),
    missingDocs = pos.reduce(
      (n, p) => n + p.docs.filter((d) => d.status !== "Đã đủ").length,
      0,
    ),
    pendingPayments = pos.reduce(
      (n, p) =>
        n + p.payments.filter((x) => x.status !== "Đã thanh toán").length,
      0,
    ),
    completed =
      prs.filter((p) => p.status === "Hoàn thành").length +
      pos.filter((p) => p.status === "Hoàn thành").length,
    doing =
      prs.filter((p) => p.status !== "Hoàn thành").length +
      pos.filter((p) => p.status !== "Hoàn thành").length,
    attention = missingDocs + pendingPayments,
    historyValue = purchaseHistory.reduce((n, row) => n + row.value, 0),
    historyItems = new Set(purchaseHistory.map((row) => row.itemCode)).size,
    historySuppliers = new Set(purchaseHistory.map((row) => row.supplierCode))
      .size,
    topHistorySuppliers = [...purchaseHistory
      .reduce((map, row) => {
        const current = map.get(row.supplierName) || 0;
        map.set(row.supplierName, current + row.value);
        return map;
      }, new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    progressTotal = completed + doing + attention,
    progressPercent = progressTotal
      ? Math.round((completed / progressTotal) * 100)
      : 0;
  const work = [
    {
      tone: "blue",
      icon: "▣",
      title: `${prs.filter((p) => p.status !== "Hoàn thành").length} PR đang xử lý`,
      text: "Kiểm tra yêu cầu và hoàn thiện báo giá",
      action: onPR,
      label: "Xem danh sách PR",
    },
    {
      tone: "orange",
      icon: "▰",
      title: `${pos.reduce((n, p) => n + p.items.filter((i) => i.deliveryStatus !== "Đã giao").length, 0)} mặt hàng chưa giao đủ`,
      text: "Cập nhật tiến độ giao hàng theo PO",
      action: onPO,
      label: "Theo dõi giao hàng",
    },
    {
      tone: "red",
      icon: "▧",
      title: `${missingDocs} hồ sơ còn thiếu`,
      text: "Hóa đơn, biên bản và hồ sơ thanh toán",
      action: onPO,
      label: "Kiểm tra hồ sơ",
    },
  ];
  return (
    <section className="content dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <em>TỔNG QUAN MUA HÀNG</em>
          <h1>Tổng quan hoạt động mua hàng</h1>
          <p>
            Theo dõi toàn bộ tiến độ PR, báo giá, PO và thanh toán tại một nơi.
          </p>
        </div>
        <button className="primary" onClick={onPR}>
          ＋ Tạo PR mới
        </button>
      </div>
      <div className="dashboard-kpis">
        <button onClick={onPR}>
          <i className="blue">▣</i>
          <span>
            Yêu cầu mua hàng<strong>{prs.length}</strong>
            <small>
              {prs.filter((p) => p.status === "Chờ xử lý").length} PR chờ xử lý
            </small>
          </span>
        </button>
        <button onClick={onCompare}>
          <i className="purple">⚖</i>
          <span>
            Đang so sánh giá
            <strong>
              {prs.filter((p) => p.status.includes("báo giá")).length}
            </strong>
            <small>Cần hoàn tất lựa chọn NCC</small>
          </span>
        </button>
        <button onClick={onPO}>
          <i className="green">▰</i>
          <span>
            Đơn mua hàng<strong>{pos.length}</strong>
            <small>
              {pos.filter((p) => p.status.includes("giao")).length} PO đang giao
            </small>
          </span>
        </button>
        <button onClick={onPO}>
          <i className="orange">₫</i>
          <span>
            Giá trị PO<strong>{fmt(poValue)} ₫</strong>
            <small>{pendingPayments} đợt chờ thanh toán</small>
          </span>
        </button>
        <button onClick={onCompare}>
          <i className="green">◎</i>
          <span>
            Lịch sử nhập kho<strong>{fmt(historyValue)} ₫</strong>
            <small>
              {purchaseHistory.length} dòng · {historyItems} mã ·{" "}
              {historySuppliers} NCC
            </small>
          </span>
        </button>
      </div>
      <div className="dashboard-grid">
        {!!topHistorySuppliers.length && (
          <section className="dashboard-panel">
            <div className="panel-title">
              <div>
                <h2>Top NCC theo lịch sử mua</h2>
                <p>Dữ liệu nhập kho T1-T7/2026 dùng để tham chiếu giá</p>
              </div>
              <span>{historySuppliers} NCC</span>
            </div>
            <div className="compact-history-list">
              {topHistorySuppliers.map(([name, value]) => (
                <article key={name}>
                  <b>{name}</b>
                  <span>{fmt(value)} ₫</span>
                </article>
              ))}
            </div>
          </section>
        )}
        <section className="dashboard-panel priority-panel">
          <div className="panel-title">
            <div>
              <h2>Công việc cần ưu tiên</h2>
              <p>Các hạng mục cần xử lý trong hôm nay</p>
            </div>
            <span>{work.length} việc</span>
          </div>
          <div className="priority-list">
            {work.map((w) => (
              <article key={w.title}>
                <i className={w.tone}>{w.icon}</i>
                <div>
                  <b>{w.title}</b>
                  <p>{w.text}</p>
                </div>
                <button onClick={w.action}>{w.label} →</button>
              </article>
            ))}
          </div>
        </section>
        <section className="dashboard-panel progress-panel">
          <div className="panel-title">
            <div>
              <h2>Tiến độ mua hàng</h2>
              <p>Tổng hợp theo trạng thái hiện tại</p>
            </div>
          </div>
          <div className="donut">
            <div
              style={{
                background: `conic-gradient(#168446 0 ${progressPercent}%,#f0b54a ${progressPercent}% ${Math.min(100, progressPercent + (doing / progressTotal || 0) * 100)}%,#e8edf3 0)`,
              }}
            >
              <strong>{progressPercent}%</strong>
              <span>Đúng tiến độ</span>
            </div>
          </div>
          <ul>
            <li>
              <i className="done" />
              <span>Đã hoàn thành</span>
              <b>{completed}</b>
            </li>
            <li>
              <i className="doing" />
              <span>Đang thực hiện</span>
              <b>{doing}</b>
            </li>
            <li>
              <i className="late" />
              <span>Cần chú ý</span>
              <b>{attention}</b>
            </li>
          </ul>
        </section>
      </div>
      <div className="dashboard-grid lower">
        <section className="dashboard-panel">
          <div className="panel-title">
            <div>
              <h2>PO gần đây</h2>
              <p>Tiến độ giao hàng và hồ sơ</p>
            </div>
            <button onClick={onPO}>Xem tất cả</button>
          </div>
          <div className="recent-po">
            {pos.map((po) => {
              const s = suppliers.find((x) => x.id === po.supplierId),
                done = po.items.filter(
                  (i) => i.deliveryStatus === "Đã giao",
                ).length;
              return (
                <article key={po.id} onClick={onPO}>
                  <div>
                    <b>{po.number}</b>
                    <span>{s?.name}</span>
                  </div>
                  <div>
                    <small>Giao hàng</small>
                    <span className="mini-progress">
                      <i
                        style={{ width: `${(done / po.items.length) * 100}%` }}
                      />
                    </span>
                    <b>
                      {done}/{po.items.length}
                    </b>
                  </div>
                  <i>{po.status}</i>
                </article>
              );
            })}
          </div>
        </section>
        <section className="dashboard-panel alert-panel">
          <div className="panel-title">
            <div>
              <h2>Cảnh báo nghiệp vụ</h2>
              <p>Các vấn đề cần kiểm tra</p>
            </div>
          </div>
          <div>
            <article>
              <i>!</i>
              <span>
                <b>{missingDocs} hồ sơ chưa đầy đủ</b>
                <small>Cần bổ sung trước thanh toán</small>
              </span>
            </article>
            <article>
              <i>₫</i>
              <span>
                <b>{pendingPayments} đợt thanh toán chờ xử lý</b>
                <small>Kiểm tra hạn và chứng từ</small>
              </span>
            </article>
            <article>
              <i>▱</i>
              <span>
                <b>
                  {suppliers.filter((s) => !s.bankAccount || !s.contact).length}{" "}
                  NCC thiếu thông tin
                </b>
                <small>Tài khoản hoặc người liên hệ</small>
              </span>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}

