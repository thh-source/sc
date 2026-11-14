"use client";

import React, { useEffect } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BellPlus,
  Check,
  ExternalLink,
  FileCheck,
  Package,
  X,
} from "lucide-react";
import {
  ApprovalRequest,
  PO,
  PR,
  PaymentHandoverItem,
  PaymentRequestEntry,
  Supplier,
  calcPOItemTotal,
  calcPOTotal,
} from "../types";
import { fmtMoney, parseMoney } from "../payment-utils";
import { PipelineStage, WorkflowAlertTag, WorkflowRadarSummary } from "../utils/workflowRadar";
import { findLinkedPOForPayment } from "../utils/paymentSync";

export interface DashboardDrawerTarget {
  stage: PipelineStage;
  id: number;
}

interface DashboardDetailDrawerProps {
  target: DashboardDrawerTarget | null;
  onClose: () => void;
  prs: PR[];
  approvalRequests: ApprovalRequest[];
  pos: PO[];
  paymentHandovers: PaymentHandoverItem[];
  paymentRequests: PaymentRequestEntry[];
  suppliers: Supplier[];
  radar: WorkflowRadarSummary;
  onOpenTarget: (next: DashboardDrawerTarget) => void;
  onOpenModule: (stage: PipelineStage, id: number) => void;
  onQuickRemindTodo: (text: string, priority?: "high" | "normal") => void;
}

const LIFECYCLE_STEPS: Array<{ key: PipelineStage; step: number; label: string }> = [
  { key: "pr", step: 1, label: "Lập PR" },
  { key: "approval", step: 2, label: "So sánh & ĐNPD" },
  { key: "po", step: 3, label: "Phát hành PO" },
  { key: "handover", step: 4, label: "Bàn giao" },
  { key: "payment", step: 5, label: "Thanh toán" },
];

export function DashboardDetailDrawer({
  target,
  onClose,
  prs,
  approvalRequests,
  pos,
  paymentHandovers,
  paymentRequests,
  suppliers,
  radar,
  onOpenTarget,
  onOpenModule,
  onQuickRemindTodo,
}: DashboardDetailDrawerProps) {
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [target, onClose]);

  if (!target) return null;

  const currentStepIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === target.stage);

  let docCode = "";
  let docStatus = "";
  let partnerLabel = "";
  let timeLabel = "";
  let totalValueText = "—";
  let alerts: WorkflowAlertTag[] = [];
  let mentionPrefix = "";
  const docFlowLinks: Array<{ label: string; stage: PipelineStage; id: number }> = [];

  const pr = target.stage === "pr" ? prs.find((p) => p.id === target.id) : undefined;
  const appr = target.stage === "approval" ? approvalRequests.find((a) => a.id === target.id) : undefined;
  const po = target.stage === "po" ? pos.find((p) => p.id === target.id) : undefined;
  const handover = target.stage === "handover" ? paymentHandovers.find((h) => h.id === target.id) : undefined;
  const payment = target.stage === "payment" ? paymentRequests.find((p) => p.id === target.id) : undefined;

  if (pr) {
    docCode = pr.number || `PR-${pr.id}`;
    docStatus = pr.status || "Đang xử lý";
    partnerLabel = pr.department || "Chưa rõ bộ phận";
    timeLabel = pr.date || "—";
    const prTotal = (pr.items || []).reduce((sum, it) => sum + (Number(it.estimate) || 0), 0);
    totalValueText = prTotal > 0 ? `${fmtMoney(prTotal)} đ` : "—";
    alerts = radar.prs.find((x) => x.pr.id === pr.id)?.alerts || [];
    mentionPrefix = `#PR-${docCode}`;

    const linkedAppr = approvalRequests.find(
      (a) => a.prId === pr.id || (a.prNumber && a.prNumber === pr.number),
    );
    if (linkedAppr) {
      docFlowLinks.push({ label: linkedAppr.requestNumber, stage: "approval", id: linkedAppr.id });
    }
    const linkedPo = pos.find((p) => p.prNumber && p.prNumber === pr.number);
    if (linkedPo) {
      docFlowLinks.push({ label: linkedPo.number, stage: "po", id: linkedPo.id });
    }
  } else if (appr) {
    docCode = appr.requestNumber || `ĐNPD-${appr.id}`;
    docStatus = appr.status || "Nháp";
    partnerLabel = appr.recommendedSupplierName || appr.department || "—";
    timeLabel = appr.createdDate || "—";
    const selectedCol =
      appr.supplierColumns.find((c) => c.isSelected) || appr.supplierColumns[0];
    const apprTotal = selectedCol
      ? (appr.rows || []).reduce((sum, row) => {
          const lines = row.supplierQuotes?.[selectedCol.colId] || [];
          return sum + lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        }, 0)
      : 0;
    totalValueText = apprTotal > 0 ? `${fmtMoney(apprTotal)} đ` : "—";
    alerts = radar.approvals.find((x) => x.approval.id === appr.id)?.alerts || [];
    mentionPrefix = `@ĐNPD-${docCode}`;

    const linkedPr = prs.find(
      (p) => (appr.prId && p.id === appr.prId) || (appr.prNumber && p.number === appr.prNumber),
    );
    if (linkedPr) {
      docFlowLinks.push({ label: linkedPr.number, stage: "pr", id: linkedPr.id });
    }
    const linkedPo = pos.find(
      (p) =>
        (appr.linkedPoId && p.id === appr.linkedPoId) ||
        (appr.linkedPoNumber && p.number === appr.linkedPoNumber),
    );
    if (linkedPo) {
      docFlowLinks.push({ label: linkedPo.number, stage: "po", id: linkedPo.id });
    }
  } else if (po) {
    const sup = suppliers.find((s) => Number(s.id) === Number(po.supplierId));
    docCode = po.number || `PO-${po.id}`;
    docStatus = po.status || "Đang xử lý";
    partnerLabel = sup?.name || po.supplierName || po.supplier_name || "Chưa rõ NCC";
    timeLabel = po.expectedDate ? `Hạn giao: ${po.expectedDate}` : po.createdDate || "—";
    const total = calcPOTotal(po);
    totalValueText = total > 0 ? `${fmtMoney(total)} đ` : "—";
    alerts = radar.pos.find((x) => x.po.id === po.id)?.alerts || [];
    mentionPrefix = `@PO-${docCode}`;

    if (po.prNumber) {
      const linkedPr = prs.find((p) => p.number === po.prNumber);
      if (linkedPr) {
        docFlowLinks.push({ label: linkedPr.number, stage: "pr", id: linkedPr.id });
      }
      const linkedAppr = approvalRequests.find((a) => a.prNumber === po.prNumber);
      if (linkedAppr) {
        docFlowLinks.push({ label: linkedAppr.requestNumber, stage: "approval", id: linkedAppr.id });
      }
    }
  } else if (handover) {
    docCode = handover.batch_id || handover.source_number || `BG-${handover.id}`;
    docStatus = handover.status || (Number(handover.quantity_fail || 0) > 0 ? "Có hàng lỗi" : "Đang bàn giao");
    partnerLabel = `${handover.department || "Bộ phận nhận"}${handover.receiver_name ? ` (${handover.receiver_name})` : ""}`;
    timeLabel = handover.handover_date || "—";
    totalValueText = "—";
    alerts = radar.handovers.find((x) => x.handover.id === handover.id)?.alerts || [];
    mentionPrefix = `Bàn giao ${docCode}`;

    if (handover.source_number) {
      const linkedPo = pos.find((p) => p.number === handover.source_number);
      if (linkedPo) {
        docFlowLinks.push({ label: linkedPo.number, stage: "po", id: linkedPo.id });
      }
    }
  } else if (payment) {
    docCode = payment.group_code || `ĐNTT-${payment.id}`;
    docStatus = payment.status || "Chờ thanh toán";
    partnerLabel = payment.payee_name || "Chưa rõ đơn vị thụ hưởng";
    timeLabel = payment.due_date ? `Hạn TT: ${payment.due_date}` : payment.request_date || "—";
    const amt = parseMoney(payment.amount);
    totalValueText = amt > 0 ? `${fmtMoney(amt)} ${payment.currency === "VND" || !payment.currency ? "đ" : payment.currency}` : "—";
    alerts = radar.payments.find((x) => x.payment.id === payment.id)?.alerts || [];
    mentionPrefix = `ĐNTT ${docCode}`;

    const linkedPo = findLinkedPOForPayment(payment, pos);
    if (linkedPo?.po) {
      docFlowLinks.push({ label: linkedPo.po.number, stage: "po", id: linkedPo.po.id });
    }
  }

  const handoverBatchItems = handover
    ? handover.batch_id
      ? paymentHandovers.filter((h) => h.batch_id === handover.batch_id)
      : [handover]
    : [];

  return (
    <div className="dd-backdrop" onClick={onClose}>
      <div className="dd-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dd-header">
          <div className="dd-header-main">
            <div className="dd-title-row">
              <h3 className="dd-code">{docCode}</h3>
              <span className="dd-status-badge">{docStatus}</span>
            </div>
            <p className="dd-partner">{partnerLabel}</p>
          </div>
          <div className="dd-header-actions">
            <button
              type="button"
              className="dd-btn-remind"
              onClick={() =>
                onQuickRemindTodo(`Theo dõi xử lý ${mentionPrefix} (${partnerLabel})`, "normal")
              }
              title="Đưa vào To-Do List"
            >
              <BellPlus size={14} /> Nhắc việc
            </button>
            <button
              type="button"
              className="dd-btn-close"
              onClick={onClose}
              title="Đóng (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="dd-body">
          {/* 1. Document Lifecycle */}
          <div>
            <div className="dd-section-label">
              Tiến trình vòng đời chứng từ (Document Lifecycle)
            </div>
            <div className="dd-stepper">
              {LIFECYCLE_STEPS.map((st, idx) => {
                const isDone = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <React.Fragment key={st.key}>
                    <div
                      className={`dd-step ${isDone ? "is-done" : ""} ${
                        isCurrent ? "is-current" : ""
                      }`}
                    >
                      <span className="dd-step-circle">
                        {isDone ? <Check size={12} /> : st.step}
                      </span>
                      <span className="dd-step-text">{st.label}</span>
                    </div>
                    {idx < LIFECYCLE_STEPS.length - 1 && (
                      <div
                        className={`dd-step-line ${idx < currentStepIndex ? "is-done" : ""}`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 2. Radar Warning */}
          {alerts.length > 0 && (
            <div className="dd-alert-box">
              <div className="dd-alert-title">
                <AlertTriangle size={14} /> Cảnh báo Radar Quy trình:
              </div>
              <ul className="dd-alert-list">
                {alerts.map((al, i) => (
                  <li key={i}>{al.label}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Summary Metadata */}
          <div className="dd-summary-card">
            <div className="dd-summary-grid">
              <div>
                <div className="dd-meta-k">Đơn vị / Đối tác</div>
                <div className="dd-meta-v">{partnerLabel}</div>
              </div>
              <div>
                <div className="dd-meta-k">Mốc thời gian</div>
                <div className="dd-meta-v">{timeLabel}</div>
              </div>
            </div>
            <div className="dd-summary-total">
              <span className="dd-meta-k">Tổng giá trị chứng từ:</span>
              <span className="dd-total-amount">{totalValueText}</span>
            </div>
          </div>

          {/* 4. DocFlow Links */}
          {docFlowLinks.length > 0 && (
            <div>
              <div className="dd-section-label">
                Liên kết chuỗi chứng từ (DocFlow Links)
              </div>
              <div className="dd-docflow-row">
                {docFlowLinks.map((lnk) => (
                  <button
                    key={`${lnk.stage}-${lnk.id}`}
                    type="button"
                    className="dd-docflow-pill"
                    onClick={() => onOpenTarget({ stage: lnk.stage, id: lnk.id })}
                  >
                    {lnk.label} <ExternalLink size={11} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5A. PR Items */}
          {pr && (
            <div>
              <div className="dd-section-label">
                Danh mục vật tư yêu cầu ({(pr.items || []).length} dòng)
              </div>
              <div className="dd-table-wrap">
                <table className="dd-table">
                  <thead>
                    <tr>
                      <th>Mã VT</th>
                      <th>Tên hàng hóa / Quy cách</th>
                      <th className="dd-num">SL</th>
                      <th className="dd-num">Thành tiền dự kiến</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pr.items || []).map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td style={{ fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>
                          {item.code || `VT-${idx + 1}`}
                        </td>
                        <td>
                          <div style={{ fontWeight: 650 }}>{item.name}</div>
                          {item.spec && (
                            <div style={{ fontSize: "11px", color: "#64748b" }}>{item.spec}</div>
                          )}
                        </td>
                        <td className="dd-num">
                          {item.qty ?? item.quantity ?? 0} {item.unit}
                        </td>
                        <td className="dd-num" style={{ fontWeight: 700 }}>
                          {item.estimate ? `${fmtMoney(item.estimate)} đ` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5B. Approval Details */}
          {appr && (
            <>
              <div className="dd-payment-card">
                <div>
                  <span style={{ color: "#64748b" }}>NCC đề xuất:</span>{" "}
                  <b>{appr.recommendedSupplierName || "Chưa chọn"}</b>
                </div>
                {appr.deliveryTerms && (
                  <div>
                    <span style={{ color: "#64748b" }}>Giao hàng:</span> {appr.deliveryTerms}
                  </div>
                )}
                {appr.paymentTerms && (
                  <div>
                    <span style={{ color: "#64748b" }}>Thanh toán:</span> {appr.paymentTerms}
                  </div>
                )}
              </div>
              <div>
                <div className="dd-section-label">
                  Hạng mục trình duyệt ({(appr.rows || []).length} dòng)
                </div>
                <div className="dd-table-wrap">
                  <table className="dd-table">
                    <thead>
                      <tr>
                        <th>Mặt hàng</th>
                        <th className="dd-num">SL</th>
                        <th className="dd-num">Thành tiền đề xuất</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(appr.rows || []).map((row) => {
                        const selCol =
                          appr.supplierColumns.find((c) => c.isSelected) ||
                          appr.supplierColumns[0];
                        const lines = selCol ? row.supplierQuotes?.[selCol.colId] || [] : [];
                        const amt = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
                        return (
                          <tr key={row.rowId}>
                            <td>
                              <div style={{ fontWeight: 650 }}>{row.itemName}</div>
                              {row.spec && (
                                <div style={{ fontSize: "11px", color: "#64748b" }}>{row.spec}</div>
                              )}
                            </td>
                            <td className="dd-num">
                              {row.qty} {row.unit}
                            </td>
                            <td className="dd-num" style={{ fontWeight: 700 }}>
                              {amt > 0 ? `${fmtMoney(amt)} đ` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 5C. PO Delivery & PO_DOCS */}
          {po && (
            <>
              <div>
                <div className="dd-section-label">
                  <Package size={13} /> Tiến độ giao hàng ({(po.items || []).length} mặt hàng)
                </div>
                <div className="dd-table-wrap">
                  <table className="dd-table">
                    <thead>
                      <tr>
                        <th>Mặt hàng</th>
                        <th className="dd-num">Đã giao / Đặt</th>
                        <th className="dd-num">Thành tiền</th>
                        <th className="dd-num">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(po.items || []).map((item, idx) => {
                        const qty = Number(item.qty) || 0;
                        const deliv = Number(item.deliveredQty) || 0;
                        const statusLabel =
                          item.deliveryStatus ||
                          (deliv >= qty && qty > 0
                            ? "Đã giao"
                            : deliv > 0
                            ? "Giao một phần"
                            : "Chưa giao");
                        const pillCls =
                          statusLabel === "Đã giao"
                            ? "dd-pill dd-pill-ok"
                            : statusLabel === "Giao một phần"
                            ? "dd-pill dd-pill-info"
                            : "dd-pill dd-pill-muted";
                        return (
                          <tr key={item.id || idx}>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td className="dd-num">
                              {deliv}/{qty} {item.unit}
                            </td>
                            <td className="dd-num" style={{ fontWeight: 700 }}>
                              {fmtMoney(calcPOItemTotal(item))} đ
                            </td>
                            <td className="dd-num">
                              <span className={pillCls}>{statusLabel}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {(po.docs || []).length > 0 && (
                <div>
                  <div className="dd-section-label">
                    <FileCheck size={13} /> Checklist hồ sơ chứng từ PO (PO_DOCS)
                  </div>
                  <div className="dd-docs-grid">
                    {(po.docs || []).map((doc) => {
                      const ok = doc.status === "Đã đủ";
                      return (
                        <div key={doc.id} className="dd-doc-card">
                          <div style={{ minWidth: 0 }}>
                            <div className="dd-doc-name">{doc.name}</div>
                            <div className="dd-doc-note">
                              {doc.note || doc.contractNumber || "—"}
                            </div>
                          </div>
                          <span className={`dd-pill ${ok ? "dd-pill-ok" : "dd-pill-warn"}`}>
                            {doc.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 5D. Handover Details */}
          {handover && (
            <div>
              <div className="dd-section-label">
                Chi tiết kiểm đếm nghiệm thu ({handoverBatchItems.length} dòng)
              </div>
              <div className="dd-table-wrap">
                <table className="dd-table">
                  <thead>
                    <tr>
                      <th>Mặt hàng</th>
                      <th className="dd-num">SL chứng từ</th>
                      <th className="dd-num">SL đạt</th>
                      <th className="dd-num">K.Đạt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {handoverBatchItems.map((h) => (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 600 }}>{h.item_name}</td>
                        <td className="dd-num">{h.quantity_doc}</td>
                        <td className="dd-num" style={{ color: "#059669", fontWeight: 700 }}>
                          {h.quantity_pass}
                        </td>
                        <td className="dd-num" style={{ color: "#e11d48", fontWeight: 700 }}>
                          {h.quantity_fail || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5E. Payment Details */}
          {payment && (
            <div className="dd-payment-card">
              <div>
                <span style={{ color: "#64748b" }}>Đơn vị thụ hưởng:</span>{" "}
                <b>{payment.payee_name}</b>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Số tài khoản:</span>{" "}
                <b style={{ fontFamily: "monospace" }}>{payment.account_no || "—"}</b>
                {payment.bank ? ` — ${payment.bank}` : ""}
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Số hóa đơn GTGT:</span>{" "}
                <b style={{ color: "#2563eb" }}>{payment.invoice_no || "Chưa có"}</b>
                {payment.invoice_date ? ` (${payment.invoice_date})` : ""}
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Nội dung thanh toán:</span>{" "}
                {payment.description || "—"}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="dd-footer">
          <button type="button" className="dd-btn-close-footer" onClick={onClose}>
            Đóng ngăn kéo
          </button>
          <button
            type="button"
            className="dd-btn-open-module"
            onClick={() => onOpenModule(target.stage, target.id)}
          >
            Mở phân hệ {docCode} <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
