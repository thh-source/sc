"use client";

import React, { useEffect } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BellPlus,
  Check,
  CheckCircle2,
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

  // Resolve active entity + metadata
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

  // Group handover items in the same batch if applicable
  const handoverBatchItems = handover
    ? handover.batch_id
      ? paymentHandovers.filter((h) => h.batch_id === handover.batch_id)
      : [handover]
    : [];

  return (
    <div
      className="fixed inset-0 z-[9990] flex justify-end bg-slate-900/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[540px] h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[17px] font-bold text-blue-600 m-0 truncate">{docCode}</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                {docStatus}
              </span>
            </div>
            <p className="text-[12.5px] text-slate-500 mt-1 mb-0 truncate">{partnerLabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                onQuickRemindTodo(`Theo dõi xử lý ${mentionPrefix} (${partnerLabel})`, "normal")
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              title="Đưa vào To-Do List"
            >
              <BellPlus size={14} /> Nhắc việc
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer border-0 bg-transparent"
              title="Đóng (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 1. Document Lifecycle Stepper */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              Tiến trình vòng đời chứng từ (Document Lifecycle)
            </div>
            <div className="flex items-center justify-between gap-1">
              {LIFECYCLE_STEPS.map((st, idx) => {
                const isDone = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <React.Fragment key={st.key}>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-bold ${
                          isDone
                            ? "bg-emerald-600 text-white"
                            : isCurrent
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {isDone ? <Check size={12} /> : st.step}
                      </span>
                      <span
                        className={`text-[11.5px] whitespace-nowrap ${
                          isCurrent
                            ? "font-bold text-blue-600"
                            : isDone
                            ? "font-semibold text-slate-700"
                            : "text-slate-400"
                        }`}
                      >
                        {st.label}
                      </span>
                    </div>
                    {idx < LIFECYCLE_STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-[2px] min-w-[10px] ${
                          idx < currentStepIndex ? "bg-emerald-500" : "bg-slate-200"
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 2. Radar Warning Box */}
          {alerts.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-800 mb-1">
                <AlertTriangle size={14} /> Cảnh báo Radar Quy trình:
              </div>
              <ul className="m-0 pl-4 text-[12px] text-amber-800 space-y-0.5">
                {alerts.map((al, i) => (
                  <li key={i}>{al.label}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Summary Metadata Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-500">Đơn vị / Đối tác</div>
                <div className="text-[13px] font-semibold text-slate-800 mt-0.5">
                  {partnerLabel}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Mốc thời gian</div>
                <div className="text-[13px] font-semibold text-slate-800 mt-0.5">
                  {timeLabel}
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[12px] text-slate-500">Tổng giá trị chứng từ:</span>
              <span className="text-[14.5px] font-bold text-slate-900 tabular-nums">
                {totalValueText}
              </span>
            </div>
          </div>

          {/* 4. DocFlow Links */}
          {docFlowLinks.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Liên kết chuỗi chứng từ (DocFlow Links)
              </div>
              <div className="flex flex-wrap gap-2">
                {docFlowLinks.map((lnk) => (
                  <button
                    key={`${lnk.stage}-${lnk.id}`}
                    type="button"
                    onClick={() => onOpenTarget({ stage: lnk.stage, id: lnk.id })}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                  >
                    {lnk.label} <ExternalLink size={11} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Stage-Specific Details */}
          {/* 5A. PR Items */}
          {pr && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Danh mục vật tư yêu cầu ({(pr.items || []).length} dòng)
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                      <th className="py-2 px-2.5">Mã VT</th>
                      <th className="py-2 px-2.5">Tên hàng hóa / Quy cách</th>
                      <th className="py-2 px-2.5 text-right">SL</th>
                      <th className="py-2 px-2.5 text-right">Thành tiền dự kiến</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(pr.items || []).map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-500">
                          {item.code || `VT-${idx + 1}`}
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="font-semibold text-slate-800">{item.name}</div>
                          {item.spec && (
                            <div className="text-[11px] text-slate-500">{item.spec}</div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-700">
                          {item.qty ?? item.quantity ?? 0} {item.unit}
                        </td>
                        <td className="py-2 px-2.5 text-right font-semibold text-slate-800 whitespace-nowrap tabular-nums">
                          {item.estimate ? `${fmtMoney(item.estimate)} đ` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5B. Approval Request Details */}
          {appr && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 p-3 text-[12px] space-y-1.5">
                <div>
                  <span className="text-slate-500">NCC đề xuất:</span>{" "}
                  <b className="text-slate-800">{appr.recommendedSupplierName || "Chưa chọn"}</b>
                </div>
                {appr.deliveryTerms && (
                  <div>
                    <span className="text-slate-500">Giao hàng:</span>{" "}
                    <span className="text-slate-700">{appr.deliveryTerms}</span>
                  </div>
                )}
                {appr.paymentTerms && (
                  <div>
                    <span className="text-slate-500">Thanh toán:</span>{" "}
                    <span className="text-slate-700">{appr.paymentTerms}</span>
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Hạng mục trình duyệt ({(appr.rows || []).length} dòng)
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                        <th className="py-2 px-2.5">Mặt hàng</th>
                        <th className="py-2 px-2.5 text-right">SL</th>
                        <th className="py-2 px-2.5 text-right">Thành tiền đề xuất</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(appr.rows || []).map((row) => {
                        const selCol =
                          appr.supplierColumns.find((c) => c.isSelected) ||
                          appr.supplierColumns[0];
                        const lines = selCol ? row.supplierQuotes?.[selCol.colId] || [] : [];
                        const amt = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
                        return (
                          <tr key={row.rowId}>
                            <td className="py-2 px-2.5">
                              <div className="font-semibold text-slate-800">{row.itemName}</div>
                              {row.spec && (
                                <div className="text-[11px] text-slate-500">{row.spec}</div>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-700">
                              {row.qty} {row.unit}
                            </td>
                            <td className="py-2 px-2.5 text-right font-semibold text-slate-800 tabular-nums">
                              {amt > 0 ? `${fmtMoney(amt)} đ` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5C. PO Delivery Progress & PO_DOCS Checklist */}
          {po && (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <Package size={13} /> Tiến độ giao hàng ({(po.items || []).length} mặt hàng)
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                        <th className="py-2 px-2.5">Mặt hàng</th>
                        <th className="py-2 px-2.5 text-right">Đã giao / Đặt</th>
                        <th className="py-2 px-2.5 text-right">Thành tiền</th>
                        <th className="py-2 px-2.5 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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
                        const badgeCls =
                          statusLabel === "Đã giao"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : statusLabel === "Giao một phần"
                            ? "bg-sky-50 text-sky-700 border-sky-200"
                            : "bg-slate-100 text-slate-600 border-slate-200";
                        return (
                          <tr key={item.id || idx}>
                            <td className="py-2 px-2.5 font-medium text-slate-800">
                              {item.name}
                            </td>
                            <td className="py-2 px-2.5 text-right whitespace-nowrap tabular-nums text-slate-700">
                              {deliv}/{qty} {item.unit}
                            </td>
                            <td className="py-2 px-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-slate-800">
                              {fmtMoney(calcPOItemTotal(item))} đ
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold border whitespace-nowrap ${badgeCls}`}
                              >
                                {statusLabel}
                              </span>
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
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <FileCheck size={13} /> Checklist hồ sơ chứng từ PO (PO_DOCS)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(po.docs || []).map((doc) => {
                      const ok = doc.status === "Đã đủ";
                      return (
                        <div
                          key={doc.id}
                          className="rounded-xl border border-slate-200 p-2.5 flex items-center justify-between gap-2 bg-white"
                        >
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-slate-800 truncate">
                              {doc.name}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {doc.note || doc.contractNumber || "—"}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${
                              ok
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5D. Handover Details */}
          {handover && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Chi tiết kiểm đếm nghiệm thu ({handoverBatchItems.length} dòng)
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                      <th className="py-2 px-2.5">Mặt hàng</th>
                      <th className="py-2 px-2.5 text-right">SL chứng từ</th>
                      <th className="py-2 px-2.5 text-right">SL đạt</th>
                      <th className="py-2 px-2.5 text-right">K.Đạt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {handoverBatchItems.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2 px-2.5 font-medium text-slate-800">
                          {h.item_name}
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums text-slate-700">
                          {h.quantity_doc}
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums font-semibold text-emerald-600">
                          {h.quantity_pass}
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums font-semibold text-rose-600">
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
            <div className="rounded-xl border border-slate-200 p-3.5 text-[12.5px] space-y-2 bg-white">
              <div>
                <span className="text-slate-500">Đơn vị thụ hưởng:</span>{" "}
                <b className="text-slate-800">{payment.payee_name}</b>
              </div>
              <div>
                <span className="text-slate-500">Số tài khoản:</span>{" "}
                <b className="text-slate-800 font-mono">{payment.account_no || "—"}</b>
                {payment.bank ? <span className="text-slate-600"> — {payment.bank}</span> : null}
              </div>
              <div>
                <span className="text-slate-500">Số hóa đơn GTGT:</span>{" "}
                <span className="text-blue-600 font-semibold">{payment.invoice_no || "Chưa có"}</span>
                {payment.invoice_date ? <span className="text-slate-500"> ({payment.invoice_date})</span> : null}
              </div>
              <div>
                <span className="text-slate-500">Nội dung thanh toán:</span>{" "}
                <span className="text-slate-700">{payment.description || "—"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Đóng ngăn kéo
          </button>
          <button
            type="button"
            onClick={() => onOpenModule(target.stage, target.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12.5px] font-semibold bg-blue-600 text-white hover:bg-blue-700 border-0 cursor-pointer"
          >
            Mở phân hệ {docCode} <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
