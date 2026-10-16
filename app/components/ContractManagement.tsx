"use client";

import React, { useState, useMemo } from "react";
import { Supplier, PO, PaymentGroup, PaymentRequestEntry } from "../types";
import { fmt, dateVN } from "../utils";
import VisualTimeline from "../VisualTimeline";
import DocumentManager from "../DocumentManager";
import { PAID_STATUSES, fmtMoney } from "../payment-utils";
import "../payment.css";

export interface ContractManagementProps {
  pos: PO[];
  suppliers: Supplier[];
  onOpenPO: (po: PO) => void;
  onUpdate: (po: PO) => void;
  onDelete?: (po: PO) => void;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
  paymentGroups?: PaymentGroup[];
  paymentRequests?: PaymentRequestEntry[];
  onUpdateState?: (patch: { paymentGroups?: PaymentGroup[] }) => void;
  onNavigateToPayment?: (filterGroupId?: number | string) => void;
}

export function ContractManagement({
  pos,
  suppliers,
  onOpenPO,
  onUpdate,
  onDelete,
  workspaceId,
  readOnly = false,
  onStatus,
  paymentGroups = [],
  paymentRequests = [],
  onUpdateState,
  onNavigateToPayment,
}: ContractManagementProps) {
  // Main tab switcher: PO Contracts vs Contract Groups
  const [mainTab, setMainTab] = useState<"pos" | "groups">("pos");

  // State for PO-contracts tab
  const [selectedId, setSelectedId] = useState(pos[0]?.id || 0);
  const [tab, setTab] = useState<"timeline" | "documents" | "invoices">("timeline");
  const [query, setQuery] = useState("");

  // State for Contract Groups tab
  const [groupSearch, setGroupSearch] = useState("");
  const [editingGroup, setEditingGroup] = useState<Partial<PaymentGroup> | null>(null);
  const [viewGroupDetails, setViewGroupDetails] = useState<{
    group: PaymentGroup;
    requests: PaymentRequestEntry[];
    budget: number;
    paid: number;
    pending: number;
    remaining: number;
  } | null>(null);

  // Group metrics and calculations linked with paymentRequests
  const groupMetrics = useMemo(() => {
    let totalCommitment = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const stats = paymentGroups.map((g) => {
      const budget = Number(g.total_amount) || 0;
      totalCommitment += budget;

      const matchedRequests = paymentRequests.filter(
        (r) =>
          (r.group_id && String(r.group_id) === String(g.id)) ||
          (r.group_code &&
            g.code &&
            r.group_code.trim().toLowerCase() === g.code.trim().toLowerCase())
      );

      let paid = 0;
      let pending = 0;
      for (const r of matchedRequests) {
        const amt = Number(r.amount) || 0;
        if (PAID_STATUSES.includes(r.status)) {
          paid += amt;
        } else if (r.status !== "Đã hủy" && r.status !== "Từ chối") {
          pending += amt;
        }
      }

      totalPaid += paid;
      totalPending += pending;
      const remaining = Math.max(0, budget - paid);
      const progress = budget > 0 ? Math.min(100, Math.round((paid / budget) * 100)) : 0;

      return {
        ...g,
        budget,
        paid,
        pending,
        remaining,
        progress,
        requestCount: matchedRequests.length,
        requests: matchedRequests,
      };
    });

    const totalRemaining = Math.max(0, totalCommitment - totalPaid);

    return {
      stats,
      totalCommitment,
      totalPaid,
      totalPending,
      totalRemaining,
    };
  }, [paymentGroups, paymentRequests]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groupMetrics.stats;
    const q = groupSearch.toLowerCase();
    return groupMetrics.stats.filter(
      (g) =>
        (g.code || "").toLowerCase().includes(q) ||
        (g.name || "").toLowerCase().includes(q) ||
        (g.payee_name || "").toLowerCase().includes(q) ||
        (g.note || "").toLowerCase().includes(q)
    );
  }, [groupMetrics.stats, groupSearch]);

  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editingGroup.code?.trim() || !editingGroup.name?.trim()) {
      alert("Vui lòng nhập Mã và Tên nhóm hợp đồng / đơn hàng!");
      return;
    }
    const nextGroups = [...paymentGroups];
    if (editingGroup.id) {
      const idx = nextGroups.findIndex((g) => g.id === editingGroup.id);
      if (idx >= 0) {
        nextGroups[idx] = {
          ...(nextGroups[idx] as PaymentGroup),
          code: editingGroup.code.trim(),
          name: editingGroup.name.trim(),
          payee_name: editingGroup.payee_name?.trim() || "",
          total_amount: Number(editingGroup.total_amount) || 0,
          currency: editingGroup.currency || "VND",
          note: editingGroup.note?.trim() || "",
        };
      }
    } else {
      const newId = Date.now();
      nextGroups.push({
        id: newId,
        code: editingGroup.code.trim(),
        name: editingGroup.name.trim(),
        payee_name: editingGroup.payee_name?.trim() || "",
        total_amount: Number(editingGroup.total_amount) || 0,
        currency: editingGroup.currency || "VND",
        note: editingGroup.note?.trim() || "",
      });
    }
    onUpdateState?.({ paymentGroups: nextGroups });
    setEditingGroup(null);
  };

  const handleDeleteGroup = (groupId: number) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa nhóm hợp đồng này?")) {
      const nextGroups = paymentGroups.filter((g) => g.id !== groupId);
      onUpdateState?.({ paymentGroups: nextGroups });
    }
  };

  // PO-contract calculations
  const selected = pos.find((p) => p.id === selectedId) || pos[0];
  const supplier = selected ? suppliers.find((s) => s.id === selected.supplierId) : undefined;
  const total = selected ? selected.items.reduce((n, i) => n + i.qty * i.price, 0) : 0;
  const delivered = selected ? selected.items.reduce((n, i) => n + i.deliveredQty, 0) : 0;
  const ordered = selected ? selected.items.reduce((n, i) => n + i.qty, 0) : 0;
  const docsDone = selected ? selected.docs.filter((d) => d.status === "Đã đủ").length : 0;
  const paid = selected
    ? selected.payments
        .filter((p) => p.status === "Đã thanh toán")
        .reduce((n, p) => n + p.amount, 0)
    : 0;

  const shown = pos.filter((p) => {
    const s = suppliers.find((x) => x.id === p.supplierId);
    return (p.number + (s?.name || ""))
      .toLowerCase()
      .includes(query.toLowerCase());
  });

  const events = selected
    ? [
        {
          date: selected.createdDate,
          title: "Phát hành hợp đồng / PO",
          note: `${selected.number} được gửi tới ${supplier?.name || "NCC"}`,
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
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <section className="content contract-page">
      <div className="heading">
        <div>
          <em>LIÊN THÔNG PO · HỒ SƠ · GIẢI NGÂN THANH TOÁN</em>
          <h1>Quản lý hợp đồng & Gói đơn hàng</h1>
          <p>Theo dõi tiến độ thực hiện hợp đồng theo PO và tổng hợp giải ngân theo nhóm nội dung hợp đồng.</p>
        </div>
        <div className="actions">
          {mainTab === "pos" ? (
            <>
              <button className="primary">＋ Tạo hợp đồng từ PO</button>
              {onDelete && selected && (
                <button className="danger-action" onClick={() => onDelete(selected)}>
                  🗑 Xóa hợp đồng
                </button>
              )}
            </>
          ) : (
            <>
              {!readOnly && (
                <button
                  className="primary"
                  onClick={() =>
                    setEditingGroup({
                      code: `HD-${new Date().getFullYear()}-${String(paymentGroups.length + 1).padStart(3, "0")}`,
                      name: "",
                      payee_name: "",
                      total_amount: 0,
                      currency: "VND",
                      note: "",
                    })
                  }
                >
                  ＋ Thêm nhóm hợp đồng / gói
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Sub-tab Bar */}
      <div className="payment-tabs" style={{ marginBottom: "16px" }}>
        <button
          className={`payment-tab-btn ${mainTab === "pos" ? "active" : ""}`}
          onClick={() => setMainTab("pos")}
        >
          <span>📋</span> Hợp đồng theo PO ({pos.length})
        </button>
        <button
          className={`payment-tab-btn ${mainTab === "groups" ? "active" : ""}`}
          onClick={() => setMainTab("groups")}
        >
          <span>📑</span> Nhóm nội dung hợp đồng & Đơn hàng ({paymentGroups.length})
        </button>
      </div>

      {/* TAB 1: PO CONTRACTS */}
      {mainTab === "pos" && (
        <>
          {!selected ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
              <h3>Chưa có PO để tạo hợp đồng</h3>
              <p>Vui lòng phát hành PO trong Quản lý PO để bắt đầu theo dõi tiến độ hợp đồng.</p>
            </div>
          ) : (
            <>
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
                        0
                      )
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
                      0
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
                    const s = suppliers.find((x) => x.id === po.supplierId);
                    const value = po.items.reduce((n, x) => n + x.qty * x.price, 0);
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
            </>
          )}
        </>
      )}

      {/* TAB 2: CONTRACT GROUPS / PO PACKAGES (NHÓM HỢP ĐỒNG & GIẢI NGÂN) */}
      {mainTab === "groups" && (
        <div className="payment-management">
          {/* Summary KPI Cards */}
          <div className="payment-summary-cards">
            <div className="payment-card card-primary">
              <span className="payment-card-label">Tổng nhóm HĐ / Gói</span>
              <span className="payment-card-value">{paymentGroups.length}</span>
              <span className="payment-card-sub">Quản lý theo gói thầu / hợp đồng</span>
            </div>
            <div className="payment-card">
              <span className="payment-card-label">Tổng giá trị cam kết</span>
              <span className="payment-card-value">{fmtMoney(groupMetrics.totalCommitment)} ₫</span>
              <span className="payment-card-sub">Tổng ngân sách hợp đồng</span>
            </div>
            <div className="payment-card card-success">
              <span className="payment-card-label">Đã giải ngân (Đã chi)</span>
              <span className="payment-card-value" style={{ color: "#10b981" }}>
                {fmtMoney(groupMetrics.totalPaid)} ₫
              </span>
              <span className="payment-card-sub">
                {groupMetrics.totalCommitment > 0
                  ? `Đạt ${Math.round((groupMetrics.totalPaid / groupMetrics.totalCommitment) * 100)}% kế hoạch`
                  : "Chưa phát sinh"}
              </span>
            </div>
            <div className="payment-card card-warning">
              <span className="payment-card-label">Đang giải quyết</span>
              <span className="payment-card-value" style={{ color: "#f59e0b" }}>
                {fmtMoney(groupMetrics.totalPending)} ₫
              </span>
              <span className="payment-card-sub">Chờ kế toán / đi tiền</span>
            </div>
            <div className="payment-card">
              <span className="payment-card-label">Còn lại cần giải ngân</span>
              <span className="payment-card-value">{fmtMoney(groupMetrics.totalRemaining)} ₫</span>
              <span className="payment-card-sub">Dư địa hợp đồng</span>
            </div>
          </div>

          {/* Search & Actions Toolbar */}
          <div className="payment-toolbar">
            <div className="payment-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="payment-input"
                placeholder="Tìm mã HĐ, tên nhóm gói, nhà cung cấp..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
              {groupSearch && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setGroupSearch("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="toolbar-actions" style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              {!readOnly && (
                <button
                  className="payment-btn payment-btn-primary"
                  onClick={() =>
                    setEditingGroup({
                      code: `HD-${new Date().getFullYear()}-${String(paymentGroups.length + 1).padStart(3, "0")}`,
                      name: "",
                      payee_name: "",
                      total_amount: 0,
                      currency: "VND",
                      note: "",
                    })
                  }
                >
                  ＋ Thêm nhóm hợp đồng mới
                </button>
              )}
            </div>
          </div>

          {/* Groups Data Table */}
          <div className="payment-table-container">
            <table className="payment-table">
              <thead>
                <tr>
                  <th style={{ width: 45, textAlign: "center" }}>STT</th>
                  <th style={{ width: 130 }}>Mã nhóm / HĐ</th>
                  <th style={{ minWidth: 220 }}>Tên nhóm hợp đồng / Gói thầu</th>
                  <th style={{ minWidth: 180 }}>Đối tác / NCC</th>
                  <th style={{ width: 130, textAlign: "right" }}>Giá trị HĐ</th>
                  <th style={{ width: 130, textAlign: "right" }}>Đã giải ngân</th>
                  <th style={{ width: 120, textAlign: "right" }}>Đang xử lý</th>
                  <th style={{ width: 130, textAlign: "right" }}>Còn lại</th>
                  <th style={{ width: 120, textAlign: "center" }}>Tiến độ</th>
                  <th style={{ width: 110, textAlign: "center" }}>Phiếu TT</th>
                  <th>Ghi chú</th>
                  {!readOnly && <th style={{ width: 85, textAlign: "center" }}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 11 : 12} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                      {groupSearch
                        ? "Không tìm thấy nhóm hợp đồng nào phù hợp với từ khóa."
                        : "Chưa có nhóm hợp đồng / gói đơn hàng nào. Bấm '＋ Thêm nhóm hợp đồng mới' để tạo."}
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((g, idx) => (
                    <tr key={g.id}>
                      <td style={{ textAlign: "center", color: "#64748b", fontWeight: 600 }}>{idx + 1}</td>
                      <td>
                        <strong style={{ color: "#0284c7", fontFamily: "monospace", fontSize: 13 }}>
                          {g.code}
                        </strong>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{g.name}</div>
                      </td>
                      <td>
                        <span style={{ color: "#334155" }}>{g.payee_name || "—"}</span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                        {fmtMoney(g.budget)} <small style={{ color: "#64748b" }}>{g.currency || "VND"}</small>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#10b981" }}>
                        {fmtMoney(g.paid)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#f59e0b" }}>
                        {fmtMoney(g.pending)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: g.remaining === 0 ? "#10b981" : "#475569" }}>
                        {fmtMoney(g.remaining)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: g.progress >= 100 ? "#10b981" : "#0284c7" }}>
                            {g.progress}%
                          </span>
                          <div
                            style={{
                              width: "70px",
                              height: "6px",
                              background: "#e2e8f0",
                              borderRadius: "4px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${g.progress}%`,
                                height: "100%",
                                background: g.progress >= 100 ? "#10b981" : "#0284c7",
                                borderRadius: "4px",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="payment-btn payment-btn-sm"
                          style={{
                            fontSize: "11.5px",
                            padding: "3px 8px",
                            color: g.requestCount > 0 ? "#0284c7" : "#94a3b8",
                            borderColor: g.requestCount > 0 ? "#bae6fd" : "#e2e8f0",
                            background: g.requestCount > 0 ? "#f0f9ff" : "#f8fafc",
                          }}
                          onClick={() => {
                            setViewGroupDetails({
                              group: g,
                              requests: g.requests,
                              budget: g.budget,
                              paid: g.paid,
                              pending: g.pending,
                              remaining: g.remaining,
                            });
                          }}
                          title="Bấm để xem danh sách phiếu đề nghị thanh toán của nhóm này"
                        >
                          ↗ {g.requestCount} phiếu
                        </button>
                      </td>
                      <td style={{ fontSize: "12px", color: "#64748b" }}>{g.note || "—"}</td>
                      {!readOnly && (
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                            <button
                              type="button"
                              className="payment-btn payment-btn-sm"
                              onClick={() => setEditingGroup(g)}
                              title="Sửa nhóm hợp đồng"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="payment-btn payment-btn-sm payment-btn-danger"
                              onClick={() => handleDeleteGroup(g.id)}
                              title="Xóa nhóm hợp đồng"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Quick Details Modal: Linked Payment Requests */}
          {viewGroupDetails && (
            <div className="payment-modal-backdrop" onClick={() => setViewGroupDetails(null)}>
              <div
                className="payment-modal"
                style={{ maxWidth: 860, width: "95%" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="payment-modal-header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>
                      📑 Chi tiết giải ngân: {viewGroupDetails.group.code} - {viewGroupDetails.group.name}
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                      Đối tác: <strong>{viewGroupDetails.group.payee_name || "Chưa xác định"}</strong> · Ngân sách:{" "}
                      <strong>{fmtMoney(viewGroupDetails.budget)} {viewGroupDetails.group.currency || "VND"}</strong>
                    </p>
                  </div>
                  <button
                    className="modal-close-btn"
                    onClick={() => setViewGroupDetails(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="payment-modal-body" style={{ maxHeight: "65vh", overflowY: "auto", padding: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "10px" }}>
                      <span style={{ fontSize: 11, color: "#166534", fontWeight: 600 }}>ĐÃ THANH TOÁN</span>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>{fmtMoney(viewGroupDetails.paid)} ₫</div>
                    </div>
                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "10px" }}>
                      <span style={{ fontSize: 11, color: "#92400e", fontWeight: 600 }}>ĐANG XỬ LÝ</span>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#b45309" }}>{fmtMoney(viewGroupDetails.pending)} ₫</div>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px" }}>
                      <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>CÒN LẠI</span>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{fmtMoney(viewGroupDetails.remaining)} ₫</div>
                    </div>
                  </div>

                  <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>
                    Danh sách phiếu đề nghị thanh toán ({viewGroupDetails.requests.length} phiếu):
                  </h4>

                  {viewGroupDetails.requests.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: 6 }}>
                      Chưa có phiếu thanh toán nào được gắn với nhóm hợp đồng này.
                    </div>
                  ) : (
                    <table className="payment-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 45, textAlign: "center" }}>STT</th>
                          <th style={{ width: 100 }}>Ngày ĐN</th>
                          <th style={{ width: 110 }}>Loại TT</th>
                          <th>Nội dung thanh toán</th>
                          <th style={{ width: 120, textAlign: "right" }}>Số tiền</th>
                          <th style={{ width: 140, textAlign: "center" }}>Trạng thái</th>
                          <th style={{ width: 110 }}>Người đề nghị</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewGroupDetails.requests.map((r, i) => (
                          <tr key={r.id}>
                            <td style={{ textAlign: "center", color: "#64748b" }}>{i + 1}</td>
                            <td>{r.request_date || "—"}</td>
                            <td><span className="payment-badge">{r.payment_type || "TT"}</span></td>
                            <td><strong>{r.description}</strong></td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                              {fmtMoney(r.amount)} <small>{r.currency || "VND"}</small>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span
                                className={`payment-badge ${
                                  PAID_STATUSES.includes(r.status)
                                    ? "status-done"
                                    : r.status === "Đã giao KT, chờ đi tiền"
                                    ? "status-transfer"
                                    : "status-processing"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td style={{ color: "#475569" }}>{r.created_by_name || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="payment-modal-footer" style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px" }}>
                  {onNavigateToPayment && (
                    <button
                      type="button"
                      className="payment-btn payment-btn-primary"
                      onClick={() => {
                        const gid = viewGroupDetails.group.id;
                        setViewGroupDetails(null);
                        onNavigateToPayment(gid);
                      }}
                    >
                      Mở trong Tab Thanh toán ↗
                    </button>
                  )}
                  <button
                    type="button"
                    className="payment-btn"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setViewGroupDetails(null)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal to Add / Edit Group */}
          {editingGroup && (
            <div className="payment-modal-backdrop" onClick={() => setEditingGroup(null)}>
              <div
                className="payment-modal"
                style={{ maxWidth: 580, width: "95%" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="payment-modal-header">
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    {editingGroup.id ? "✏️ Sửa nhóm hợp đồng / gói" : "＋ Thêm nhóm hợp đồng / gói mới"}
                  </h3>
                  <button
                    className="modal-close-btn"
                    onClick={() => setEditingGroup(null)}
                  >
                    ✕
                  </button>
                </div>
                <form onSubmit={handleSaveGroup}>
                  <div className="payment-modal-body" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Mã nhóm / Hợp đồng <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <input
                          type="text"
                          required
                          className="payment-input"
                          style={{ width: "100%" }}
                          placeholder="VD: HD-2024-001 hoặc GOI-01"
                          value={editingGroup.code || ""}
                          onChange={(e) => setEditingGroup({ ...editingGroup, code: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Loại tiền tệ
                        </label>
                        <select
                          className="payment-select"
                          style={{ width: "100%" }}
                          value={editingGroup.currency || "VND"}
                          onChange={(e) => setEditingGroup({ ...editingGroup, currency: e.target.value })}
                        >
                          <option value="VND">VND (Việt Nam Đồng)</option>
                          <option value="USD">USD (Đô la Mỹ)</option>
                          <option value="EUR">EUR (Euro)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                        Tên nhóm hợp đồng / Gói thầu <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="payment-input"
                        style={{ width: "100%" }}
                        placeholder="VD: Cung cấp thiết bị kiểm nghiệm HPLC và phụ tùng"
                        value={editingGroup.name || ""}
                        onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Nhà cung cấp / Đơn vị thực hiện
                        </label>
                        <input
                          type="text"
                          list="contract-suppliers-list"
                          className="payment-input"
                          style={{ width: "100%" }}
                          placeholder="Chọn hoặc nhập tên NCC"
                          value={editingGroup.payee_name || ""}
                          onChange={(e) => setEditingGroup({ ...editingGroup, payee_name: e.target.value })}
                        />
                        <datalist id="contract-suppliers-list">
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.name}>
                              {s.code} - {s.name}
                            </option>
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Tổng giá trị ngân sách
                        </label>
                        <input
                          type="number"
                          className="payment-input"
                          style={{ width: "100%" }}
                          placeholder="VD: 500000000"
                          value={editingGroup.total_amount || ""}
                          onChange={(e) => setEditingGroup({ ...editingGroup, total_amount: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                        Ghi chú
                      </label>
                      <textarea
                        rows={2}
                        className="payment-input"
                        style={{ width: "100%", resize: "vertical" }}
                        placeholder="Ghi chú điều khoản, số quyết định phê duyệt..."
                        value={editingGroup.note || ""}
                        onChange={(e) => setEditingGroup({ ...editingGroup, note: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="payment-modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px" }}>
                    <button
                      type="button"
                      className="payment-btn"
                      onClick={() => setEditingGroup(null)}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="payment-btn payment-btn-primary"
                    >
                      Lưu thông tin
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
