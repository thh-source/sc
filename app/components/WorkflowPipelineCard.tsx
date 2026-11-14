"use client";

import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
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
  onSelectPR?: (pr: PR) => void;
  onSelectApproval?: (id: number) => void;
  onSelectPO?: (po: PO) => void;
  onSelectHandover?: (handover: PaymentHandoverItem) => void;
  onSelectPayment?: (id: number) => void;
  onCreateHandover?: () => void;
  onCreatePayment?: () => void;
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

export function WorkflowPipelineCard(props: WorkflowPipelineCardProps) {
  const {
    radar,
    radarFilter,
    activeStage,
    onChangeStage,
    onSelectPR,
    onSelectApproval,
    onSelectPO,
    onSelectHandover,
    onSelectPayment,
    onCreateHandover,
    onCreatePayment,
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

  const filterByRadar = (alerts: WorkflowAlertTag[], isDoneToday = false) => {
    if (radarFilter === "all") return true;
    if (isDoneToday) return false;
    return alerts.some((a) => a.category === radarFilter);
  };

  const prs = radar.prs.filter((x) => filterByRadar(x.alerts));
  const approvals = radar.approvals.filter((x) => filterByRadar(x.alerts));
  const pos = radar.pos.filter((x) => filterByRadar(x.alerts));
  const handovers = radar.handovers.filter((x) => filterByRadar(x.alerts));
  const payments = radar.payments.filter((x) => filterByRadar(x.alerts, x.isDoneToday));

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
            <p>Theo dõi điểm nghẽn, hạn giao hàng, thiếu chứng từ và thanh toán theo từng bước</p>
          </div>
        </div>
      </div>

      {/* 5-Stage Tabs */}
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

      {/* Stage 1: PR */}
      {activeStage === "pr" && (
        <div className="queue-table-wrap">
          {prs.length === 0 ? (
            <div className="queue-empty-state">
              <CheckCircle2 size={30} className="empty-icon-success" />
              <p>Không có PR nào bị tồn đọng trong bộ lọc hiện tại.</p>
            </div>
          ) : (
            <table className="queue-data-table">
              <thead>
                <tr>
                  <th>Mã PR</th>
                  <th>Bộ phận / Ngày</th>
                  <th>Mục đích & Cảnh báo</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {prs.map(({ pr, alerts }) => {
                  const tagCode = pr.number.startsWith("PR-") ? pr.number : `PR-${pr.number}`;
                  return (
                    <tr key={pr.id}>
                      <td>
                        <button
                          type="button"
                          className="queue-code-link"
                          onClick={() => onSelectPR?.(pr)}
                        >
                          {pr.number}
                        </button>
                      </td>
                      <td>
                        <div className="cell-strong">{pr.department || "—"}</div>
                        <div className="cell-sub">{pr.date || "—"} · {pr.items?.length || 0} món</div>
                      </td>
                      <td>
                        <div className="cell-purpose" title={pr.purpose}>
                          {pr.purpose || "—"}
                        </div>
                        {renderAlertBadges(alerts)}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="pipeline-row-actions">
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
                            <Plus size={12} /> Nhắc việc
                          </button>
                          <button
                            type="button"
                            className="btn-row-action"
                            onClick={() => onSelectPR?.(pr)}
                          >
                            Báo giá <ArrowRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            <table className="queue-data-table">
              <thead>
                <tr>
                  <th>Số ĐNPD</th>
                  <th>PR / Bộ phận</th>
                  <th>Trạng thái & Cảnh báo</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map(({ approval, alerts, missingPO }) => {
                  const tagCode = approval.requestNumber.startsWith("DNPD-")
                    ? approval.requestNumber
                    : `DNPD-${approval.requestNumber}`;
                  return (
                    <tr key={approval.id}>
                      <td>
                        <button
                          type="button"
                          className="queue-code-link link-purple"
                          onClick={() => onSelectApproval?.(approval.id)}
                        >
                          <FileCheck size={12} /> {approval.requestNumber}
                        </button>
                      </td>
                      <td>
                        <div className="cell-strong">{approval.department || "—"}</div>
                        <div className="cell-sub">
                          {approval.prNumber ? `PR: ${approval.prNumber} · ` : ""}
                          {approval.createdDate || "—"}
                        </div>
                      </td>
                      <td>
                        <span className="status-pill status-wait">{approval.status || "Nháp"}</span>
                        {renderAlertBadges(alerts)}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="pipeline-row-actions">
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
                            <Plus size={12} /> Nhắc việc
                          </button>
                          <button
                            type="button"
                            className="btn-row-action"
                            onClick={() => onSelectApproval?.(approval.id)}
                          >
                            Mở ĐNPD <ArrowRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            <table className="queue-data-table">
              <thead>
                <tr>
                  <th>Số PO</th>
                  <th>Nhà cung cấp</th>
                  <th>Tiến độ giao & Cảnh báo</th>
                  <th>Hạn giao</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pos.map(({ po, supplierName, deliveredPct, deliveredItems, totalItems, alerts }) => {
                  const tagCode = po.number.startsWith("PO-") ? po.number : `PO-${po.number}`;
                  return (
                    <tr key={po.id}>
                      <td>
                        <button
                          type="button"
                          className="queue-code-link link-blue"
                          onClick={() => onSelectPO?.(po)}
                        >
                          <Package size={12} /> {po.number}
                        </button>
                      </td>
                      <td>
                        <div className="cell-strong">{supplierName}</div>
                        <div className="cell-sub">{po.department || (po.prNumber ? `PR: ${po.prNumber}` : "")}</div>
                      </td>
                      <td>
                        <div className="delivery-progress-cell">
                          <div className="delivery-bar-bg">
                            <div
                              className="delivery-bar-fill"
                              style={{ width: `${deliveredPct}%` }}
                            />
                          </div>
                          <span className="delivery-pct-text">
                            {deliveredItems}/{totalItems} món ({deliveredPct}%)
                          </span>
                        </div>
                        {renderAlertBadges(alerts)}
                      </td>
                      <td className="cell-date">{po.expectedDate || po.deliveryDate || "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="pipeline-row-actions">
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
                            <Plus size={12} /> Nhắc việc
                          </button>
                          <button
                            type="button"
                            className="btn-row-action"
                            onClick={() => onSelectPO?.(po)}
                          >
                            Chi tiết <ArrowRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            <table className="queue-data-table">
              <thead>
                <tr>
                  <th>Nguồn / Ngày</th>
                  <th>Bộ phận nhận</th>
                  <th>Hàng hóa & Cảnh báo</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {handovers.map(({ handover, qtyDoc, qtyPass, alerts }) => (
                  <tr key={handover.id}>
                    <td>
                      <button
                        type="button"
                        className="queue-code-link"
                        onClick={() => onSelectHandover?.(handover)}
                      >
                        <Truck size={12} /> {handover.source_number || `BG-${handover.id}`}
                      </button>
                      <div className="cell-sub">{handover.handover_date || "—"}</div>
                    </td>
                    <td className="cell-strong">{handover.department || "—"}</td>
                    <td>
                      <div className="cell-purpose" title={handover.item_name}>
                        {handover.item_name} ({qtyPass}/{qtyDoc} {handover.unit})
                      </div>
                      {renderAlertBadges(alerts)}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div className="pipeline-row-actions">
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
                          <Plus size={12} /> Nhắc việc
                        </button>
                        <button
                          type="button"
                          className="btn-row-action"
                          onClick={() => (onSelectHandover ? onSelectHandover(handover) : onCreateHandover?.())}
                        >
                          Xử lý <ArrowRight size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <table className="queue-data-table pending-payments-table">
              <thead>
                <tr>
                  <th>PO / Thụ hưởng</th>
                  <th>Nội dung & Cảnh báo</th>
                  <th style={{ textAlign: "right" }}>Số tiền</th>
                  <th>Số HĐ (Ngày HĐ)</th>
                  <th style={{ textAlign: "center" }}>Xác nhận</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(({ payment: r, linkedPO, isDoneToday, alerts }) => {
                  const isEditing = editingInvoiceId === r.id;
                  const invoiceText = r.invoice_no?.trim() || "Chưa có HĐ";
                  const dateText = r.invoice_date?.trim() ? ` (${r.invoice_date.trim()})` : "";
                  const invoiceCombined = `${invoiceText}${dateText}`;

                  return (
                    <tr
                      key={r.id}
                      className={isDoneToday ? "row-paid-today" : "row-unpaid"}
                      style={{
                        opacity: isDoneToday ? 0.78 : 1,
                        backgroundColor: isDoneToday ? "#f0fdf4" : undefined,
                      }}
                    >
                      <td>
                        {linkedPO ? (
                          <button
                            type="button"
                            className="queue-code-link"
                            onClick={() => onSelectPO?.(linkedPO)}
                          >
                            <Package size={12} /> {linkedPO.number}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="queue-code-link"
                            onClick={() => (onSelectPayment ? onSelectPayment(r.id) : onCreatePayment?.())}
                          >
                            <CreditCard size={12} /> {r.group_code || `ĐNTT #${r.legacy_stt || r.id}`}
                          </button>
                        )}
                        <div className="cell-sub">{r.payee_name || "Chưa rõ NCC"}</div>
                      </td>

                      <td>
                        <div className="cell-purpose" title={r.description || r.item_name}>
                          {r.description || r.item_name || "Thanh toán"}
                        </div>
                        {renderAlertBadges(alerts)}
                      </td>

                      <td className="cell-money font-semibold" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtMoney(r.amount)} {r.currency || "VND"}
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>
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
                      </td>

                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div className="pipeline-row-actions" style={{ justifyContent: "center" }}>
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
                              <Plus size={12} />
                            </button>
                          )}
                          {isDoneToday ? (
                            <button
                              type="button"
                              className="payment-status-badge status-paid"
                              onClick={() => onRequestPaymentConfirm(r, "revert")}
                              title="Đã thanh toán hôm nay. Bấm để hoàn tác nếu chuyển nhầm"
                            >
                              <CheckCircle2 size={13} /> Đã TT
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="payment-status-badge status-unpaid"
                              onClick={() => onRequestPaymentConfirm(r, "complete")}
                              title="Bấm để xác nhận đã thanh toán"
                            >
                              <Clock size={13} /> Chờ TT
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
