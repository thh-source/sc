"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BellPlus,
  Eye,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
  MessageSquarePlus,
  Package,
  Pencil,
  Plus,
  Truck,
  X,
} from "lucide-react";
import {
  ApprovalRequest,
  PO,
  PR,
  PaymentHandoverItem,
  PaymentRequestEntry,
  calcPOTotal,
} from "../types";
import { fmtMoney } from "../payment-utils";
import {
  PipelineStage,
  RadarFilter,
  WorkflowAlertTag,
  WorkflowRadarSummary,
} from "../utils/workflowRadar";

export interface WorkflowPipelineCardProps {
  radar: WorkflowRadarSummary;
  radarFilter: RadarFilter;
  activeStage: PipelineStage;
  onChangeStage: (stage: PipelineStage) => void;
  allPRs?: PR[];
  allApprovals?: ApprovalRequest[];
  allPOs?: PO[];
  onSelectPR?: (pr: PR) => void;
  onSelectApproval?: (id: number) => void;
  onSelectPO?: (po: PO) => void;
  onSelectHandover?: (handover: PaymentHandoverItem) => void;
  onSelectPayment?: (id: number) => void;
  onOpenDetailDrawer?: (stage: PipelineStage, id: number) => void;
  onCreateHandover?: () => void;
  onCreatePayment?: () => void;
  onToggleCompletePR?: (pr: PR) => void;
  onToggleCompleteApproval?: (appr: ApprovalRequest) => void;
  onToggleCompletePO?: (po: PO) => void;
  onToggleCompleteHandover?: (handover: PaymentHandoverItem) => void;
  onUpdateItemNote?: (stage: PipelineStage, id: number, note: string) => void;
  onQuickRemindTodo: (text: string, priority?: "high" | "normal") => void;
  editingInvoiceId: number | null;
  draftInvoiceNo: string;
  draftInvoiceDate: string;
  onDraftInvoiceNoChange: (val: string) => void;
  onDraftInvoiceDateChange: (val: string) => void;
  onStartEditInvoice: (req: PaymentRequestEntry) => void;
  onSaveInvoice: (req: PaymentRequestEntry) => void;
  onCancelEditInvoice: () => void;
  onRequestPaymentConfirm: (req: PaymentRequestEntry, action: "complete" | "revert") => void;
}

function renderAlertBadges(alerts: WorkflowAlertTag[]) {
  if (!alerts.length) return null;
  return (
    <div className="pipeline-alerts-row">
      {alerts.map((al, idx) => (
        <span key={idx} className={`pipeline-alert-tag sev-${al.severity}`}>
          {al.severity === "overdue" ? (
            <AlertTriangle size={11} />
          ) : (
            <Clock size={11} />
          )}
          {al.label}
        </span>
      ))}
    </div>
  );
}

function InlineNoteCell({
  stage,
  id,
  note,
  onSave,
}: {
  stage: PipelineStage;
  id: number;
  note?: string;
  onSave?: (stage: PipelineStage, id: number, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note || "");

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (note || "").trim()) {
      onSave?.(stage, id, trimmed);
    }
  };

  if (editing) {
    return (
      <div
        className="inline-note-editor"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            commit();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(note || "");
            setEditing(false);
          }
        }}
      >
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nhập ghi chú theo dõi..."
          className="inline-note-input"
        />
        <button
          type="button"
          className="inline-invoice-save-btn"
          title="Lưu ghi chú (Enter)"
          onMouseDown={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          className="inline-invoice-cancel-btn"
          title="Hủy (Esc)"
          onMouseDown={(e) => {
            e.preventDefault();
            setDraft(note || "");
            setEditing(false);
          }}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`inline-note-trigger ${note?.trim() ? "has-note" : "empty-note"}`}
      title={note?.trim() ? `Ghi chú: ${note} (bấm để sửa)` : "Bấm để gõ ghi chú theo dõi"}
      onClick={() => {
        setDraft(note || "");
        setEditing(true);
      }}
    >
      <MessageSquarePlus size={12} />
      <span>{note?.trim() || "Ghi chú..."}</span>
    </button>
  );
}

export function WorkflowPipelineCard(props: WorkflowPipelineCardProps) {
  const {
    radar,
    radarFilter,
    activeStage,
    onChangeStage,
    allPRs = [],
    allApprovals = [],
    allPOs = [],
    onSelectPR,
    onSelectApproval,
    onSelectPO,
    onSelectHandover,
    onSelectPayment,
    onOpenDetailDrawer,
    onCreateHandover,
    onCreatePayment,
    onToggleCompletePR,
    onToggleCompleteApproval,
    onToggleCompletePO,
    onToggleCompleteHandover,
    onUpdateItemNote,
    onQuickRemindTodo,
    editingInvoiceId,
    draftInvoiceNo,
    draftInvoiceDate,
    onDraftInvoiceNoChange,
    onDraftInvoiceDateChange,
    onStartEditInvoice,
    onSaveInvoice,
    onCancelEditInvoice,
    onRequestPaymentConfirm,
  } = props;

  const [tableQuery, setTableQuery] = useState("");
  const qNorm = tableQuery.trim().toLowerCase();

  const filterByRadar = (alerts: WorkflowAlertTag[], isDoneToday = false) => {
    if (radarFilter === "all") return true;
    if (isDoneToday) return false;
    return alerts.some((a) => a.category === radarFilter);
  };

  const prs = radar.prs
    .filter((x) => filterByRadar(x.alerts))
    .filter(
      (x) =>
        !qNorm ||
        `${x.pr.number} ${x.pr.department} ${x.pr.purpose} ${x.pr.note || ""}`
          .toLowerCase()
          .includes(qNorm),
    );
  const approvals = radar.approvals
    .filter((x) => filterByRadar(x.alerts))
    .filter(
      (x) =>
        !qNorm ||
        `${x.approval.requestNumber} ${x.approval.prNumber} ${x.approval.recommendedSupplierName} ${x.approval.department} ${x.approval.note || ""}`
          .toLowerCase()
          .includes(qNorm),
    );
  const pos = radar.pos
    .filter((x) => filterByRadar(x.alerts))
    .filter(
      (x) =>
        !qNorm ||
        `${x.po.number} ${x.po.prNumber} ${x.supplierName} ${x.po.note || ""}`
          .toLowerCase()
          .includes(qNorm),
    );
  const handovers = radar.handovers
    .filter((x) => filterByRadar(x.alerts))
    .filter(
      (x) =>
        !qNorm ||
        `${x.handover.batch_id || ""} ${x.handover.source_number || ""} ${x.handover.department} ${x.handover.item_name} ${x.handover.note || ""}`
          .toLowerCase()
          .includes(qNorm),
    );
  const payments = radar.payments
    .filter((x) => filterByRadar(x.alerts, x.isDoneToday))
    .filter(
      (x) =>
        !qNorm ||
        `${x.payment.group_code || ""} ${x.payment.payee_name} ${x.payment.description} ${x.payment.invoice_no || ""} ${x.payment.note || ""}`
          .toLowerCase()
          .includes(qNorm),
    );

  const stages: Array<{
    key: PipelineStage;
    label: string;
    count: number;
    hasOverdue: boolean;
    hasWarning: boolean;
  }> = [
    {
      key: "pr",
      label: "1. PR",
      count: prs.length,
      hasOverdue: prs.some((x) => x.alerts.some((a) => a.severity === "overdue")),
      hasWarning: prs.some((x) => x.alerts.some((a) => a.severity === "warning" || a.severity === "due_soon")),
    },
    {
      key: "approval",
      label: "2. ĐNPD",
      count: approvals.length,
      hasOverdue: approvals.some((x) => x.alerts.some((a) => a.severity === "overdue")),
      hasWarning: approvals.some((x) => x.alerts.some((a) => a.severity === "warning" || a.severity === "due_soon")),
    },
    {
      key: "po",
      label: "3. PO & Giao hàng",
      count: pos.length,
      hasOverdue: pos.some((x) => x.alerts.some((a) => a.severity === "overdue")),
      hasWarning: pos.some((x) => x.alerts.some((a) => a.severity === "warning" || a.severity === "due_soon")),
    },
    {
      key: "handover",
      label: "4. Bàn giao",
      count: handovers.length,
      hasOverdue: handovers.some((x) => x.alerts.some((a) => a.severity === "overdue")),
      hasWarning: handovers.some((x) => x.alerts.some((a) => a.severity === "warning" || a.severity === "due_soon")),
    },
    {
      key: "payment",
      label: "5. ĐNTT",
      count: payments.filter((x) => !x.isDoneToday).length,
      hasOverdue: payments.some((x) => !x.isDoneToday && x.alerts.some((a) => a.severity === "overdue")),
      hasWarning: payments.some((x) => !x.isDoneToday && x.alerts.some((a) => a.severity === "warning" || a.severity === "due_soon")),
    },
  ];

  return (
    <div className="dashboard-card pipeline-card">
      <div className="card-header pipeline-card-header">
        <div className="card-title-group">
          <span className="card-badge-icon badge-orange">
            <AlertCircle size={16} />
          </span>
          <div>
            <h2>Luồng Công việc Cần Theo dõi (5 Chặng)</h2>
            <p>Theo dõi điểm nghẽn, ghi chú trực tiếp và đánh dấu hoàn thành ngay tại trang chủ</p>
          </div>
        </div>
      </div>

      {/* 5-Stage Tabs + Inline Quick Search */}
      <div className="pipeline-tabs-toolbar">
        <div className="pipeline-stage-tabs" role="tablist">
          {stages.map((st) => (
            <button
              key={st.key}
              type="button"
              role="tab"
              aria-selected={activeStage === st.key}
              className={`pipeline-stage-tab ${activeStage === st.key ? "active" : ""}`}
              onClick={() => onChangeStage(st.key)}
            >
              {(st.hasOverdue || st.hasWarning) && (
                <span className={`stage-status-dot ${st.hasOverdue ? "dot-red" : "dot-amber"}`} />
              )}
              <span>{st.label}</span>
              <span className="queue-pill-count">{st.count}</span>
            </button>
          ))}
        </div>
        <div className="pipeline-search-box">
          <input
            type="text"
            value={tableQuery}
            onChange={(e) => setTableQuery(e.target.value)}
            placeholder="Lọc mã, nội dung, NCC..."
          />
          {tableQuery && (
            <button
              type="button"
              onClick={() => setTableQuery("")}
              className="pipeline-search-clear"
              title="Xóa lọc"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Stage 1: PR */}
      {activeStage === "pr" && (
        <div className="queue-table-wrap">
          {prs.length === 0 ? (
            <div className="queue-empty-state">
              <CheckCircle2 size={30} className="empty-icon-success" />
              <p>Không có PR nào bị tồn đọng trong bộ lọc hiện tại.</p>
            </div>
          ) : (
            <>
              <table className="queue-data-table">
                <thead>
                  <tr>
                    <th>Mã chứng từ</th>
                    <th>Nội dung / Đơn vị</th>
                    <th style={{ textAlign: "right" }}>Giá trị (VNĐ)</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú nhanh (Inline Note)</th>
                    <th style={{ textAlign: "right" }}>Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {prs.map(({ pr, alerts }) => {
                    const tagCode = pr.number.startsWith("PR-") ? pr.number : `PR-${pr.number}`;
                    const prTotal = (pr.items || []).reduce((s, it) => s + (Number(it.estimate) || 0), 0);
                    const linkedAppr = allApprovals.find(
                      (a) => a.prId === pr.id || (a.prNumber && a.prNumber === pr.number),
                    );
                    const linkedPo = allPOs.find((p) => p.prNumber && p.prNumber === pr.number);
                    const statusText = pr.status || "Chờ xử lý";
                    const statusCls =
                      statusText.includes("Chờ")
                        ? "pipeline-status-pill st-warn"
                        : statusText.includes("Đã tạo") || statusText.includes("Hoàn thành")
                          ? "pipeline-status-pill st-ok"
                          : "pipeline-status-pill";
                    return (
                      <tr key={pr.id}>
                        <td>
                          <button
                            type="button"
                            className="queue-code-link"
                            onClick={() => (onOpenDetailDrawer ? onOpenDetailDrawer("pr", pr.id) : onSelectPR?.(pr))}
                          >
                            {pr.number}
                          </button>
                          <div className="pipeline-code-meta">{pr.date || "—"}</div>
                          {linkedAppr && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer
                                  ? onOpenDetailDrawer("approval", linkedAppr.id)
                                  : onSelectApproval?.(linkedAppr.id)
                              }
                            >
                              ↳ {linkedAppr.requestNumber}
                            </button>
                          )}
                          {linkedPo && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer ? onOpenDetailDrawer("po", linkedPo.id) : onSelectPO?.(linkedPo)
                              }
                            >
                              ↳ {linkedPo.number}
                            </button>
                          )}
                        </td>
                        <td>
                          <div className="cell-purpose" title={pr.purpose}>
                            {pr.purpose || "—"}
                          </div>
                          <div className="cell-sub">{pr.department || "—"}</div>
                          {renderAlertBadges(alerts)}
                        </td>
                        <td className="pipeline-money-cell">
                          {prTotal > 0 ? `${fmtMoney(prTotal)} đ` : "—"}
                        </td>
                        <td>
                          <span className={statusCls}>{statusText}</span>
                        </td>
                        <td>
                          <InlineNoteCell stage="pr" id={pr.id} note={pr.note} onSave={onUpdateItemNote} />
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div className="pipeline-row-actions">
                            <button
                              type="button"
                              className="btn-row-complete"
                              title="Đánh dấu PR đã hoàn thành"
                              onClick={() => onToggleCompletePR?.(pr)}
                            >
                              <CheckCircle2 size={12} /> Xong
                            </button>
                            <button
                              type="button"
                              className="btn-row-remind"
                              title="Gắn vào To-Do hôm nay"
                              onClick={() =>
                                onQuickRemindTodo(
                                  `Xử lý #${tagCode} (${pr.department || ""})`,
                                  alerts.some((a) => a.severity === "overdue") ? "high" : "normal",
                                )
                              }
                            >
                              <BellPlus size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn-row-action"
                              onClick={() => (onOpenDetailDrawer ? onOpenDetailDrawer("pr", pr.id) : onSelectPR?.(pr))}
                            >
                              <Eye size={12} /> Chi tiết
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pipeline-table-footer">
                <span>
                  Hiển thị <b>{prs.length}</b> chứng từ trong giai đoạn <b>1. PR</b>
                </span>
                <span>Bấm vào mã chứng từ màu xanh để mở ngăn kéo chi tiết (Slide-over Drawer)</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stage 2: ĐNPD */}
      {activeStage === "approval" && (
        <div className="queue-table-wrap">
          {approvals.length === 0 ? (
            <div className="queue-empty-state">
              <CheckCircle2 size={30} className="empty-icon-success" />
              <p>Không có ĐNPD nào đang chờ duyệt hoặc chưa lên PO.</p>
            </div>
          ) : (
            <>
              <table className="queue-data-table">
                <thead>
                  <tr>
                    <th>Mã chứng từ</th>
                    <th>Nội dung / Đơn vị</th>
                    <th style={{ textAlign: "right" }}>Giá trị (VNĐ)</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú nhanh (Inline Note)</th>
                    <th style={{ textAlign: "right" }}>Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map(({ approval, alerts, missingPO }) => {
                    const tagCode = approval.requestNumber.startsWith("DNPD-")
                      ? approval.requestNumber
                      : `DNPD-${approval.requestNumber}`;
                    const selCol =
                      approval.supplierColumns?.find((c) => c.isSelected) || approval.supplierColumns?.[0];
                    const apprTotal = selCol
                      ? (approval.rows || []).reduce(
                          (sum, row) =>
                            sum +
                            (row.supplierQuotes?.[selCol.colId] || []).reduce(
                              (s, l) => s + (Number(l.amount) || 0),
                              0,
                            ),
                          0,
                        )
                      : 0;
                    const linkedPr = allPRs.find(
                      (p) =>
                        (approval.prId && p.id === approval.prId) ||
                        (approval.prNumber && p.number === approval.prNumber),
                    );
                    const linkedPo = allPOs.find(
                      (p) => approval.prNumber && p.prNumber === approval.prNumber,
                    );
                    const statusText = approval.status || "Nháp";
                    const statusCls =
                      statusText.includes("Chờ") || statusText === "Nháp"
                        ? "pipeline-status-pill st-warn"
                        : statusText.includes("Đã tạo") || statusText.includes("Đã duyệt")
                          ? "pipeline-status-pill st-ok"
                          : "pipeline-status-pill";
                    return (
                      <tr key={approval.id}>
                        <td>
                          <button
                            type="button"
                            className="queue-code-link link-purple"
                            onClick={() =>
                              onOpenDetailDrawer
                                ? onOpenDetailDrawer("approval", approval.id)
                                : onSelectApproval?.(approval.id)
                            }
                          >
                            {approval.requestNumber}
                          </button>
                          <div className="pipeline-code-meta">{approval.createdDate || "—"}</div>
                          {linkedPr && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer ? onOpenDetailDrawer("pr", linkedPr.id) : onSelectPR?.(linkedPr)
                              }
                            >
                              ↳ {linkedPr.number}
                            </button>
                          )}
                          {linkedPo && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer ? onOpenDetailDrawer("po", linkedPo.id) : onSelectPO?.(linkedPo)
                              }
                            >
                              ↳ {linkedPo.number}
                            </button>
                          )}
                        </td>
                        <td>
                          <div className="cell-purpose" title={selCol?.supplierName || approval.department}>
                            {selCol?.supplierName || approval.prNumber || approval.requestNumber}
                          </div>
                          <div className="cell-sub">{approval.department || "—"}</div>
                          {renderAlertBadges(alerts)}
                        </td>
                        <td className="pipeline-money-cell">
                          {apprTotal > 0 ? `${fmtMoney(apprTotal)} đ` : "—"}
                        </td>
                        <td>
                          <span className={statusCls}>{statusText}</span>
                        </td>
                        <td>
                          <InlineNoteCell
                            stage="approval"
                            id={approval.id}
                            note={approval.note}
                            onSave={onUpdateItemNote}
                          />
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div className="pipeline-row-actions">
                            <button
                              type="button"
                              className="btn-row-complete"
                              title="Đánh dấu ĐNPD đã hoàn thành"
                              onClick={() => onToggleCompleteApproval?.(approval)}
                            >
                              <CheckCircle2 size={12} /> Xong
                            </button>
                            <button
                              type="button"
                              className="btn-row-remind"
                              title="Gắn vào To-Do hôm nay"
                              onClick={() =>
                                onQuickRemindTodo(
                                  `${missingPO ? "Lên PO cho" : "Theo dõi duyệt"} @${tagCode}`,
                                  missingPO ? "high" : "normal",
                                )
                              }
                            >
                              <BellPlus size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn-row-action"
                              onClick={() =>
                                onOpenDetailDrawer
                                  ? onOpenDetailDrawer("approval", approval.id)
                                  : onSelectApproval?.(approval.id)
                              }
                            >
                              <Eye size={12} /> Chi tiết
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pipeline-table-footer">
                <span>
                  Hiển thị <b>{approvals.length}</b> chứng từ trong giai đoạn <b>2. ĐNPD</b>
                </span>
                <span>Bấm vào mã chứng từ màu xanh để mở ngăn kéo chi tiết (Slide-over Drawer)</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stage 3: PO & Delivery */}
      {activeStage === "po" && (
        <div className="queue-table-wrap">
          {pos.length === 0 ? (
            <div className="queue-empty-state">
              <CheckCircle2 size={30} className="empty-icon-success" />
              <p>Tất cả PO trong bộ lọc đều đã giao đủ và hoàn tất.</p>
            </div>
          ) : (
            <>
              <table className="queue-data-table">
                <thead>
                  <tr>
                    <th>Mã chứng từ</th>
                    <th>Nội dung / Đơn vị</th>
                    <th style={{ textAlign: "right" }}>Giá trị (VNĐ)</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú nhanh (Inline Note)</th>
                    <th style={{ textAlign: "right" }}>Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map(({ po, supplierName, deliveredPct, deliveredItems, totalItems, alerts }) => {
                    const tagCode = po.number.startsWith("PO-") ? po.number : `PO-${po.number}`;
                    const poTotal = calcPOTotal(po);
                    const summaryTitle =
                      totalItems > 0
                        ? `${totalItems} mặt hàng${po.items?.[0]?.name ? ` (${po.items[0].name})` : ""}`
                        : "Đơn mua hàng";
                    const linkedPr = allPRs.find((p) => po.prNumber && p.number === po.prNumber);
                    const linkedAppr = allApprovals.find(
                      (a) => (po.prNumber && a.prNumber === po.prNumber) || (linkedPr && a.prId === linkedPr.id),
                    );
                    const statusText = po.status || (deliveredPct > 0 ? "Đang giao hàng" : "Chờ giao");
                    const statusCls =
                      deliveredPct >= 100
                        ? "pipeline-status-pill st-ok"
                        : deliveredPct === 0
                          ? "pipeline-status-pill st-warn"
                          : "pipeline-status-pill";
                    return (
                      <tr key={po.id}>
                        <td>
                          <button
                            type="button"
                            className="queue-code-link link-blue"
                            onClick={() => (onOpenDetailDrawer ? onOpenDetailDrawer("po", po.id) : onSelectPO?.(po))}
                          >
                            {po.number}
                          </button>
                          <div className="pipeline-code-meta">
                            Hạn giao: {po.expectedDate || po.deliveryDate || "—"}
                          </div>
                          {linkedPr && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer ? onOpenDetailDrawer("pr", linkedPr.id) : onSelectPR?.(linkedPr)
                              }
                            >
                              ↳ {linkedPr.number}
                            </button>
                          )}
                          {linkedAppr && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer
                                  ? onOpenDetailDrawer("approval", linkedAppr.id)
                                  : onSelectApproval?.(linkedAppr.id)
                              }
                            >
                              ↳ {linkedAppr.requestNumber}
                            </button>
                          )}
                        </td>
                        <td>
                          <div className="cell-purpose" title={summaryTitle}>
                            {summaryTitle}
                          </div>
                          <div className="cell-sub">{supplierName}</div>
                          {renderAlertBadges(alerts)}
                        </td>
                        <td className="pipeline-money-cell">
                          {poTotal > 0 ? `${fmtMoney(poTotal)} đ` : "—"}
                        </td>
                        <td>
                          <span className={statusCls}>{statusText}</span>
                          <div className="pipeline-code-meta">
                            {deliveredItems}/{totalItems} món ({deliveredPct}%)
                          </div>
                        </td>
                        <td>
                          <InlineNoteCell stage="po" id={po.id} note={po.note} onSave={onUpdateItemNote} />
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div className="pipeline-row-actions">
                            <button
                              type="button"
                              className="btn-row-complete"
                              title="Đánh dấu PO đã hoàn thành"
                              onClick={() => onToggleCompletePO?.(po)}
                            >
                              <CheckCircle2 size={12} /> Xong
                            </button>
                            <button
                              type="button"
                              className="btn-row-remind"
                              title="Gắn vào To-Do hôm nay"
                              onClick={() =>
                                onQuickRemindTodo(
                                  `Theo dõi giao hàng @${tagCode} (${supplierName})`,
                                  alerts.some((a) => a.severity === "overdue") ? "high" : "normal",
                                )
                              }
                            >
                              <BellPlus size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn-row-action"
                              onClick={() => (onOpenDetailDrawer ? onOpenDetailDrawer("po", po.id) : onSelectPO?.(po))}
                            >
                              <Eye size={12} /> Chi tiết
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pipeline-table-footer">
                <span>
                  Hiển thị <b>{pos.length}</b> chứng từ trong giai đoạn <b>3. PO &amp; Giao hàng</b>
                </span>
                <span>Bấm vào mã chứng từ màu xanh để mở ngăn kéo chi tiết (Slide-over Drawer)</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stage 4: Handover */}
      {activeStage === "handover" && (
        <div className="queue-table-wrap">
          {handovers.length === 0 ? (
            <div className="queue-empty-state">
              <CheckCircle2 size={30} className="empty-icon-success" />
              <p>Không có phiếu bàn giao nào dở dang hoặc thiếu biên bản ký nhận.</p>
            </div>
          ) : (
            <>
              <table className="queue-data-table">
                <thead>
                  <tr>
                    <th>Mã chứng từ</th>
                    <th>Nội dung / Đơn vị</th>
                    <th style={{ textAlign: "right" }}>Giá trị (VNĐ)</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú nhanh (Inline Note)</th>
                    <th style={{ textAlign: "right" }}>Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {handovers.map(({ handover, qtyDoc, qtyPass, alerts }) => {
                    const displayCode = handover.batch_id || handover.source_number || `BG-${handover.id}`;
                    const linkedPo = allPOs.find(
                      (p) => handover.source_number && p.number === handover.source_number,
                    );
                    const isFull = qtyPass >= qtyDoc && qtyDoc > 0;
                    return (
                      <tr key={handover.id}>
                        <td>
                          <button
                            type="button"
                            className="queue-code-link"
                            onClick={() =>
                              onOpenDetailDrawer
                                ? onOpenDetailDrawer("handover", handover.id)
                                : onSelectHandover?.(handover)
                            }
                          >
                            {displayCode}
                          </button>
                          <div className="pipeline-code-meta">{handover.handover_date || "—"}</div>
                          {linkedPo && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer ? onOpenDetailDrawer("po", linkedPo.id) : onSelectPO?.(linkedPo)
                              }
                            >
                              ↳ {linkedPo.number}
                            </button>
                          )}
                        </td>
                        <td>
                          <div className="cell-purpose" title={handover.item_name}>
                            {handover.item_name} ({qtyPass}/{qtyDoc} {handover.unit})
                          </div>
                          <div className="cell-sub">{handover.department || "—"}</div>
                          {renderAlertBadges(alerts)}
                        </td>
                        <td className="pipeline-money-cell">—</td>
                        <td>
                          <span className={isFull ? "pipeline-status-pill st-ok" : "pipeline-status-pill st-warn"}>
                            {isFull ? "Đã đủ SL" : "Giao một phần"}
                          </span>
                        </td>
                        <td>
                          <InlineNoteCell
                            stage="handover"
                            id={handover.id}
                            note={handover.note}
                            onSave={onUpdateItemNote}
                          />
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div className="pipeline-row-actions">
                            <button
                              type="button"
                              className="btn-row-complete"
                              title="Đánh dấu Bàn giao đã hoàn thành"
                              onClick={() => onToggleCompleteHandover?.(handover)}
                            >
                              <CheckCircle2 size={12} /> Xong
                            </button>
                            <button
                              type="button"
                              className="btn-row-remind"
                              title="Gắn vào To-Do hôm nay"
                              onClick={() =>
                                onQuickRemindTodo(
                                  `Hoàn tất bàn giao ${handover.item_name} (${handover.department})`,
                                  alerts.some((a) => a.severity === "overdue") ? "high" : "normal",
                                )
                              }
                            >
                              <BellPlus size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn-row-action"
                              onClick={() =>
                                onOpenDetailDrawer
                                  ? onOpenDetailDrawer("handover", handover.id)
                                  : onSelectHandover
                                    ? onSelectHandover(handover)
                                    : onCreateHandover?.()
                              }
                            >
                              <Eye size={12} /> Chi tiết
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pipeline-table-footer">
                <span>
                  Hiển thị <b>{handovers.length}</b> chứng từ trong giai đoạn <b>4. Bàn giao</b>
                </span>
                <span>Bấm vào mã chứng từ màu xanh để mở ngăn kéo chi tiết (Slide-over Drawer)</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stage 5: Payment (ĐNTT) */}
      {activeStage === "payment" && (
        <div className="queue-table-wrap">
          {payments.length === 0 ? (
            <div className="queue-empty-state">
              <CheckCircle2 size={30} className="empty-icon-success" />
              <p>Không còn Đề nghị thanh toán nào cần xử lý.</p>
            </div>
          ) : (
            <>
              <table className="queue-data-table pending-payments-table">
                <thead>
                  <tr>
                    <th>Mã chứng từ</th>
                    <th>Nội dung / Đơn vị</th>
                    <th style={{ textAlign: "right" }}>Giá trị (VNĐ)</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú nhanh (Inline Note)</th>
                    <th style={{ textAlign: "right" }}>Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(({ payment: r, linkedPO, isDoneToday, alerts }) => {
                    const isEditing = editingInvoiceId === r.id;
                    const invoiceText = r.invoice_no?.trim() || "Chưa có HĐ";
                    const dateText = r.invoice_date?.trim() ? ` (${r.invoice_date.trim()})` : "";
                    const invoiceCombined = `${invoiceText}${dateText}`;
                    const displayCode = r.group_code || `ĐNTT-${r.legacy_stt || r.id}`;

                    return (
                      <tr
                        key={r.id}
                        className={isDoneToday ? "row-paid-today" : "row-unpaid"}
                        style={{
                          opacity: isDoneToday ? 0.78 : 1,
                        }}
                      >
                        <td>
                          <button
                            type="button"
                            className="queue-code-link"
                            onClick={() =>
                              onOpenDetailDrawer
                                ? onOpenDetailDrawer("payment", r.id)
                                : onSelectPayment
                                  ? onSelectPayment(r.id)
                                  : onCreatePayment?.()
                            }
                          >
                            {displayCode}
                          </button>
                          <div className="pipeline-code-meta">
                            Hạn TT: {r.due_date || r.request_date || "—"}
                          </div>
                          {linkedPO && (
                            <button
                              type="button"
                              className="pipeline-doc-sublink-btn"
                              onClick={() =>
                                onOpenDetailDrawer ? onOpenDetailDrawer("po", linkedPO.id) : onSelectPO?.(linkedPO)
                              }
                            >
                              ↳ {linkedPO.number}
                            </button>
                          )}
                        </td>

                        <td>
                          <div className="cell-purpose" title={r.description || r.item_name}>
                            {r.description || r.item_name || "Thanh toán"}
                          </div>
                          <div className="cell-sub">{r.payee_name || "Chưa rõ NCC"}</div>
                          {renderAlertBadges(alerts)}
                        </td>

                        <td className="pipeline-money-cell">
                          {fmtMoney(r.amount)} {r.currency === "VND" || !r.currency ? "đ" : r.currency}
                        </td>

                        <td>
                          <span className={isDoneToday ? "pipeline-status-pill st-ok" : "pipeline-status-pill st-warn"}>
                            {isDoneToday ? "Đã chi" : "Chờ chi"}
                          </span>
                          <div style={{ marginTop: 4 }}>
                            {isEditing ? (
                              <div
                                className="inline-invoice-editor-wrap"
                                onBlur={(e) => {
                                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                    onSaveInvoice(r);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    onSaveInvoice(r);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    onCancelEditInvoice();
                                  }
                                }}
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Số HĐ"
                                  value={draftInvoiceNo}
                                  onChange={(e) => onDraftInvoiceNoChange(e.target.value)}
                                  className="inline-invoice-input inline-invoice-input-no"
                                />
                                <input
                                  type="date"
                                  value={draftInvoiceDate}
                                  onChange={(e) => onDraftInvoiceDateChange(e.target.value)}
                                  className="inline-invoice-input inline-invoice-input-date"
                                />
                                <button
                                  type="button"
                                  className="inline-invoice-save-btn"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    onSaveInvoice(r);
                                  }}
                                  title="Lưu số hóa đơn"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="inline-invoice-cancel-btn"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    onCancelEditInvoice();
                                  }}
                                  title="Hủy"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <div
                                className={`compact-invoice-trigger ${r.invoice_no?.trim() ? "has-invoice" : "no-invoice"}`}
                                onClick={() => onStartEditInvoice(r)}
                                title="Bấm để nhập/sửa nhanh số và ngày hóa đơn"
                              >
                                <span>{invoiceCombined}</span>
                                <Pencil size={11} className="invoice-edit-icon" />
                              </div>
                            )}
                          </div>
                        </td>

                        <td>
                          <InlineNoteCell
                            stage="payment"
                            id={r.id}
                            note={r.note}
                            onSave={onUpdateItemNote}
                          />
                        </td>

                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div className="pipeline-row-actions">
                            <button
                              type="button"
                              className={isDoneToday ? "btn-row-complete" : "btn-row-complete"}
                              onClick={() => onRequestPaymentConfirm(r, isDoneToday ? "revert" : "complete")}
                              title={
                                isDoneToday
                                  ? "Đã thanh toán hôm nay. Bấm để hoàn tác nếu chuyển nhầm"
                                  : "Bấm để xác nhận đã hoàn thành thanh toán"
                              }
                            >
                              <CheckCircle2 size={12} /> {isDoneToday ? "Đã chi" : "Xác nhận chi"}
                            </button>
                            {!isDoneToday && (
                              <button
                                type="button"
                                className="btn-row-remind"
                                title="Gắn vào To-Do hôm nay"
                                onClick={() =>
                                  onQuickRemindTodo(
                                    `Thanh toán ${linkedPO ? `@${linkedPO.number.startsWith("PO-") ? linkedPO.number : `PO-${linkedPO.number}`}` : r.payee_name}: ${r.description || r.item_name || ""}`.trim(),
                                    alerts.some((a) => a.severity === "overdue") ? "high" : "normal",
                                  )
                                }
                              >
                                <BellPlus size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-row-action"
                              onClick={() =>
                                onOpenDetailDrawer
                                  ? onOpenDetailDrawer("payment", r.id)
                                  : onSelectPayment
                                    ? onSelectPayment(r.id)
                                    : onCreatePayment?.()
                              }
                            >
                              <Eye size={12} /> Chi tiết
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pipeline-table-footer">
                <span>
                  Hiển thị <b>{payments.length}</b> chứng từ trong giai đoạn <b>5. ĐNTT</b>
                </span>
                <span>Bấm vào mã chứng từ màu xanh để mở ngăn kéo chi tiết (Slide-over Drawer)</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
