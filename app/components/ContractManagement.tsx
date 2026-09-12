import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import VisualTimeline from "../VisualTimeline";
import DocumentManager from "../DocumentManager";
// Add other imports as necessary

export function ContractManagement({
  pos,
  suppliers,
  onOpenPO,
  onUpdate,
  onDelete,
  workspaceId,
  readOnly = false,
  onStatus,
}: {
  pos: PO[];
  suppliers: Supplier[];
  onOpenPO: (po: PO) => void;
  onUpdate: (po: PO) => void;
  onDelete?: (po: PO) => void;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(pos[0]?.id || 0),
    [tab, setTab] = useState<"timeline" | "documents" | "invoices">("timeline"),
    [query, setQuery] = useState("");
  const selected = pos.find((p) => p.id === selectedId) || pos[0];
  if (!selected)
    return (
      <section className="content">
        <h1>Quản lý hợp đồng</h1>
        <p>Chưa có PO để tạo hợp đồng.</p>
      </section>
    );
  const supplier = suppliers.find((s) => s.id === selected.supplierId),
    total = selected.items.reduce((n, i) => n + i.qty * i.price, 0),
    delivered = selected.items.reduce((n, i) => n + i.deliveredQty, 0),
    ordered = selected.items.reduce((n, i) => n + i.qty, 0),
    docsDone = selected.docs.filter((d) => d.status === "Đã đủ").length,
    paid = selected.payments
      .filter((p) => p.status === "Đã thanh toán")
      .reduce((n, p) => n + p.amount, 0);
  const shown = pos.filter((p) => {
    const s = suppliers.find((x) => x.id === p.supplierId);
    return (p.number + (s?.name || ""))
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  const events = [
    {
      date: selected.createdDate,
      title: "Phát hành hợp đồng / PO",
      note: `${selected.number} được gửi tới ${supplier?.name}`,
      state: "done",
    },
    ...selected.payments.map((p) => ({
      date: p.date,
      title: `Thanh toán ${p.phase}`,
      note: `${fmt(p.amount)} ₫ · ${p.status}`,
      state: p.status === "Đã thanh toán" ? "done" : "upcoming",
    })),
    ...selected.items
      .filter((i) => i.deliveryDate)
      .map((i) => ({
        date: i.deliveryDate,
        title: `Giao ${i.name}`,
        note: `${i.deliveredQty}/${i.qty} ${i.unit} · ${i.deliveryStatus}`,
        state: i.deliveryStatus === "Đã giao" ? "done" : "warning",
      })),
    ...(selected.expectedDate
      ? [
          {
            date: selected.expectedDate,
            title: "Hạn hoàn tất giao hàng",
            note: `Còn ${Math.max(0, ordered - delivered)} đơn vị chưa giao`,
            state: "warning",
          },
        ]
      : []),
  ]
    .filter((event) => event.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="content contract-page">
      <div className="heading">
        <div>
          <em>LIÊN THÔNG PO · HỒ SƠ · THANH TOÁN</em>
          <h1>Quản lý hợp đồng</h1>
          <p>Theo dõi nghĩa vụ giao hàng, hóa đơn và hồ sơ theo từng PO.</p>
        </div>
        <div className="actions">
          <button className="primary">＋ Tạo hợp đồng từ PO</button>
          {onDelete && (
            <button className="danger-action" onClick={() => onDelete(selected)}>
              🗑 Xóa hợp đồng
            </button>
          )}
        </div>
      </div>
      <div className="contract-kpis">
        <article>
          <span>Tổng hợp đồng</span>
          <b>{pos.length}</b>
          <small>
            {pos.filter((p) => p.status !== "Hoàn thành").length} đang thực hiện
          </small>
        </article>
        <article>
          <span>Tổng giá trị</span>
          <b>
            {fmt(
              pos.reduce(
                (n, p) => n + p.items.reduce((s, i) => s + i.qty * i.price, 0),
                0,
              ),
            )}{" "}
            ₫
          </b>
          <small>Liên thông từ PO</small>
        </article>
        <article className="warn">
          <span>Sắp đến hạn giao</span>
          <b>{pos.filter((p) => p.expectedDate).length}</b>
          <small>Trong 7 ngày tới</small>
        </article>
        <article className="danger">
          <span>Hồ sơ còn thiếu</span>
          <b>
            {pos.reduce(
              (n, p) => n + p.docs.filter((d) => d.status !== "Đã đủ").length,
              0,
            )}
          </b>
          <small>Cần bổ sung trước thanh toán</small>
        </article>
      </div>
      <div className="contract-layout">
        <aside className="contract-list">
          <div className="contract-search">
            ⌕
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm hợp đồng, PO, NCC..."
            />
          </div>
          {shown.map((po) => {
            const s = suppliers.find((x) => x.id === po.supplierId),
              value = po.items.reduce((n, x) => n + x.qty * x.price, 0);
            return (
              <button
                className={po.id === selected.id ? "selected" : ""}
                key={po.id}
                onClick={() => setSelectedId(po.id)}
              >
                <div>
                  <strong>HĐ-{po.number}</strong>
                  <i>{po.status}</i>
                </div>
                <b>{s?.name}</b>
                <span>Liên kết {po.number}</span>
                <footer>
                  <small>{dateVN(po.createdDate)}</small>
                  <strong>{fmt(value)} ₫</strong>
                </footer>
              </button>
            );
          })}
        </aside>
        <div className="contract-detail">
          <div className="contract-hero">
            <div>
              <span>HĐ-{selected.number}</span>
              <h2>Hợp đồng cung cấp hàng hóa</h2>
              <p>
                {supplier?.code} · {supplier?.name}
              </p>
            </div>
            <div>
              <button onClick={() => onOpenPO(selected)}>
                Mở PO liên kết ↗
              </button>
              <strong>{fmt(total)} ₫</strong>
              <small>
                {selected.expectedDate
                  ? `Hạn giao ${dateVN(selected.expectedDate)}`
                  : "Chưa thiết lập hạn giao"}
              </small>
            </div>
          </div>
          <section className="common-note-card contract-common-note">
            <label>
              <span>✎ Ghi chú chung hợp đồng</span>
              <textarea
                rows={3}
                value={selected.contractNote || ""}
                placeholder="Diễn giải tự do về điều khoản, phụ lục hoặc lưu ý của hợp đồng..."
                onChange={(e) =>
                  onUpdate({ ...selected, contractNote: e.target.value })
                }
              />
            </label>
          </section>
          {selected.expectedDate && (
            <div className="deadline-alert">
              <i>!</i>
              <div>
                <b>Sắp đến hạn giao hàng</b>
                <p>
                  Hạn giao dự kiến {dateVN(selected.expectedDate)} · Còn{" "}
                  {Math.max(0, ordered - delivered)} đơn vị chưa giao. Cần xác
                  nhận tiến độ với nhà cung cấp.
                </p>
              </div>
              <button onClick={() => onOpenPO(selected)}>
                Cập nhật giao hàng
              </button>
            </div>
          )}
          <div className="contract-progress">
            <article>
              <span>Giao hàng</span>
              <b>{ordered ? Math.round((delivered / ordered) * 100) : 0}%</b>
              <div>
                <i
                  style={{
                    width: `${ordered ? (delivered / ordered) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                {delivered}/{ordered} đơn vị đã giao
              </small>
            </article>
            <article>
              <span>Hồ sơ</span>
              <b>
                {selected.docs.length
                  ? Math.round((docsDone / selected.docs.length) * 100)
                  : 0}
                %
              </b>
              <div>
                <i
                  style={{
                    width: `${selected.docs.length ? (docsDone / selected.docs.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                {docsDone}/{selected.docs.length} hồ sơ đầy đủ
              </small>
            </article>
            <article>
              <span>Thanh toán</span>
              <b>{total ? Math.round((paid / total) * 100) : 0}%</b>
              <div>
                <i style={{ width: `${total ? (paid / total) * 100 : 0}%` }} />
              </div>
              <small>
                {fmt(paid)} / {fmt(total)} ₫
              </small>
            </article>
          </div>
          <div className="contract-tabs">
            <button
              className={tab === "timeline" ? "active" : ""}
              onClick={() => setTab("timeline")}
            >
              Timeline
            </button>
            <button
              className={tab === "documents" ? "active" : ""}
              onClick={() => setTab("documents")}
            >
              Hồ sơ ({selected.docs.length})
            </button>
            <button
              className={tab === "invoices" ? "active" : ""}
              onClick={() => setTab("invoices")}
            >
              Hóa đơn
            </button>
          </div>
          {tab === "timeline" && (
            <div className="contract-timeline">
              <VisualTimeline
                empty="Chưa có mốc giao hàng hoặc thanh toán."
                items={events.map((e, i) => ({
                  id: i,
                  date: e.date,
                  title: e.title,
                  note: e.note,
                  status:
                    e.state === "done"
                      ? "done"
                      : e.state === "warning"
                        ? "late"
                        : "todo",
                }))}
              />
            </div>
          )}
          {tab === "documents" && (
            <div className="contract-docs">
              <div className="contract-doc-requirements">
                {selected.docs.map((d) => (
                  <article key={d.id}>
                    <i className={d.status === "Đã đủ" ? "ok" : "missing"}>
                      {d.status === "Đã đủ" ? "✓" : "!"}
                    </i>
                    <div>
                      <b>{d.name}</b>
                      <p>{d.note || "Không có ghi chú"}</p>
                    </div>
                    <span className={d.status === "Đã đủ" ? "ok" : "missing"}>
                      {d.status}
                    </span>
                    <small>
                      {d.status !== "Đã đủ" ? "Chưa hoàn thiện" : "Đã kiểm tra"}
                    </small>
                  </article>
                ))}
              </div>
              {!readOnly && (
                <DocumentManager
                  title={`File hợp đồng HĐ-${selected.number}`}
                  entityType="contract"
                  entityId={String(selected.id)}
                  workspaceId={workspaceId}
                  readOnly={readOnly}
                  onStatus={onStatus}
                />
              )}
            </div>
          )}
          {tab === "invoices" && (
            <div className="invoice-table empty-state">
              Chưa có dữ liệu hóa đơn. Hóa đơn sẽ hiển thị sau khi được cập nhật
              vào PO.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

