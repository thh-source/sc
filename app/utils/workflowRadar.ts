import {
  PR,
  PO,
  Supplier,
  ApprovalRequest,
  PaymentRequestEntry,
  PaymentHandoverItem,
  getPOContractInfo,
} from "../types";
import {
  isPRCompleted,
  isApprovalCompleted,
  isPOCompleted,
  isHandoverCompleted,
  isPaymentCompleted,
  isPaymentPaidToday,
  calcPODeliveryStats,
  findLinkedPOForPayment,
} from "./paymentSync";

export type RadarFilter = "all" | "overdue" | "due_soon" | "missing_docs";
export type PipelineStage = "pr" | "approval" | "po" | "handover" | "payment";

export type AlertSeverity = "overdue" | "due_soon" | "warning" | "info";

export interface WorkflowAlertTag {
  label: string;
  severity: AlertSeverity;
  category: "overdue" | "due_soon" | "missing_docs";
}

export interface PRRadarItem {
  pr: PR;
  daysOpen: number;
  hasApproval: boolean;
  hasPO: boolean;
  alerts: WorkflowAlertTag[];
}

export interface ApprovalRadarItem {
  approval: ApprovalRequest;
  daysOpen: number;
  missingPO: boolean;
  alerts: WorkflowAlertTag[];
}

export interface PORadarItem {
  po: PO;
  supplierName: string;
  deliveredPct: number;
  deliveredItems: number;
  totalItems: number;
  daysToExpected: number | null;
  hasDueMilestone: boolean;
  alerts: WorkflowAlertTag[];
}

export interface HandoverRadarItem {
  handover: PaymentHandoverItem;
  qtyDoc: number;
  qtyPass: number;
  qtyFail: number;
  alerts: WorkflowAlertTag[];
}

export interface PaymentRadarItem {
  payment: PaymentRequestEntry;
  linkedPO?: PO;
  isDoneToday: boolean;
  daysToDue: number | null;
  alerts: WorkflowAlertTag[];
}

export interface WorkflowRadarSummary {
  todayStr: string;
  prs: PRRadarItem[];
  approvals: ApprovalRadarItem[];
  pos: PORadarItem[];
  handovers: HandoverRadarItem[];
  payments: PaymentRadarItem[];
  counts: {
    overdue: number;
    dueSoon: number;
    missingDocs: number;
    totalActionable: number;
  };
}

function parseIsoDayMs(raw?: string): number | null {
  if (!raw) return null;
  const s = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = new Date(`${s}T00:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function diffDaysFromToday(dateStr: string | undefined, todayMs: number): number | null {
  const targetMs = parseIsoDayMs(dateStr);
  if (targetMs === null) return null;
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function buildWorkflowRadar(params: {
  prs?: PR[];
  pos?: PO[];
  approvalRequests?: ApprovalRequest[];
  paymentRequests?: PaymentRequestEntry[];
  paymentHandovers?: PaymentHandoverItem[];
  suppliers?: Supplier[];
  todayStr?: string;
}): WorkflowRadarSummary {
  const todayStr = params.todayStr || new Date().toISOString().slice(0, 10);
  const todayMs = parseIsoDayMs(todayStr) ?? new Date().setHours(0, 0, 0, 0);

  const prsList = params.prs || [];
  const posList = params.pos || [];
  const approvalsList = params.approvalRequests || [];
  const paymentsList = params.paymentRequests || [];
  const handoversList = params.paymentHandovers || [];
  const suppliersList = params.suppliers || [];

  // 1. PR stage
  const prItems: PRRadarItem[] = prsList
    .filter((pr) => !pr.is_hidden && !pr.isHidden && !isPRCompleted(pr))
    .map((pr) => {
      const prNumNorm = (pr.number || "").trim().toLowerCase();
      const hasApproval = approvalsList.some(
        (a) => a.prId === pr.id || (prNumNorm && (a.prNumber || "").trim().toLowerCase() === prNumNorm),
      );
      const hasPO = posList.some((p) => prNumNorm && (p.prNumber || "").trim().toLowerCase() === prNumNorm);
      const diff = diffDaysFromToday(pr.date, todayMs);
      const daysOpen = diff !== null ? Math.max(0, -diff) : 0;
      const alerts: WorkflowAlertTag[] = [];

      if (!hasApproval && !hasPO && daysOpen >= 3) {
        alerts.push({
          label: `Chưa báo giá/ĐNPD (${daysOpen} ngày)`,
          severity: daysOpen >= 7 ? "overdue" : "due_soon",
          category: daysOpen >= 7 ? "overdue" : "due_soon",
        });
      } else if (!hasApproval && !hasPO) {
        alerts.push({
          label: "Chờ hỏi giá / ĐNPD",
          severity: "info",
          category: "missing_docs",
        });
      }
      if (!pr.scan_file_url?.trim()) {
        alerts.push({
          label: "Thiếu scan PR",
          severity: "warning",
          category: "missing_docs",
        });
      }
      return { pr, daysOpen, hasApproval, hasPO, alerts };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen || (b.pr.id || 0) - (a.pr.id || 0));

  // 2. Approval (ĐNPD) stage: include pending approvals + approved ones missing PO
  const approvalItems: ApprovalRadarItem[] = approvalsList
    .filter((appr) => {
      if (appr.is_hidden || appr.isHidden) return false;
      if (!isApprovalCompleted(appr)) return true;
      if (appr.status === "Đã phê duyệt" && !appr.isCompleted) {
        const prNumNorm = (appr.prNumber || "").trim().toLowerCase();
        const hasPO = prNumNorm
          ? posList.some((p) => (p.prNumber || "").trim().toLowerCase() === prNumNorm)
          : false;
        return !hasPO;
      }
      return false;
    })
    .map((approval) => {
      const prNumNorm = (approval.prNumber || "").trim().toLowerCase();
      const hasPO = prNumNorm
        ? posList.some((p) => (p.prNumber || "").trim().toLowerCase() === prNumNorm)
        : false;
      const missingPO = approval.status === "Đã phê duyệt" && !hasPO;
      const diff = diffDaysFromToday(approval.createdDate, todayMs);
      const daysOpen = diff !== null ? Math.max(0, -diff) : 0;
      const alerts: WorkflowAlertTag[] = [];

      if (missingPO) {
        alerts.push({
          label: "Đã duyệt, chưa lên PO",
          severity: "warning",
          category: "missing_docs",
        });
      } else if (daysOpen >= 3) {
        alerts.push({
          label: `Chờ duyệt ${daysOpen} ngày`,
          severity: daysOpen >= 7 ? "overdue" : "due_soon",
          category: daysOpen >= 7 ? "overdue" : "due_soon",
        });
      }
      return { approval, daysOpen, missingPO, alerts };
    })
    .sort((a, b) => Number(b.missingPO) - Number(a.missingPO) || b.daysOpen - a.daysOpen);

  // 3. PO stage
  const poItems: PORadarItem[] = posList
    .filter((po) => !po.is_hidden && !po.isHidden && !isPOCompleted(po, handoversList))
    .map((po) => {
      const sup = suppliersList.find((s) => s.id === po.supplierId);
      const supplierName = sup?.shortName || sup?.name || po.supplierName || "Chưa rõ NCC";
      const stats = calcPODeliveryStats(po, handoversList);
      const daysToExpected = diffDaysFromToday(po.expectedDate || po.deliveryDate, todayMs);
      const contractInfo = getPOContractInfo(po);
      const alerts: WorkflowAlertTag[] = [];

      if (daysToExpected !== null) {
        if (daysToExpected < 0) {
          alerts.push({
            label: `Quá hạn giao ${Math.abs(daysToExpected)} ngày`,
            severity: "overdue",
            category: "overdue",
          });
        } else if (daysToExpected <= 3) {
          alerts.push({
            label: daysToExpected === 0 ? "Hạn giao hôm nay" : `Còn ${daysToExpected} ngày giao`,
            severity: "due_soon",
            category: "due_soon",
          });
        }
      }

      const hasDueMilestone = (po.payments || []).some((p) => {
        if (p.status === "Đã thanh toán") return false;
        const d = diffDaysFromToday(p.date, todayMs);
        return d !== null && d <= 3;
      });
      if (hasDueMilestone) {
        alerts.push({
          label: "Có đợt TT đến hạn",
          severity: "due_soon",
          category: "due_soon",
        });
      }

      if (
        (contractInfo.hasContract && contractInfo.contractDoc && contractInfo.contractDoc.status !== "Đã đủ") ||
        (po.docs || []).some((d) => d.status !== "Đã đủ")
      ) {
        alerts.push({
          label: "Thiếu chứng từ PO / HĐ",
          severity: "warning",
          category: "missing_docs",
        });
      }

      return {
        po,
        supplierName,
        deliveredPct: stats.overallProgressPercent,
        deliveredItems: stats.fullyDeliveredItemsCount,
        totalItems: stats.totalItems,
        daysToExpected,
        hasDueMilestone,
        alerts,
      };
    })
    .sort((a, b) => {
      const score = (x: PORadarItem) =>
        x.alerts.some((t) => t.severity === "overdue") ? 3 : x.alerts.some((t) => t.severity === "due_soon") ? 2 : 1;
      return score(b) - score(a) || (b.po.id || 0) - (a.po.id || 0);
    });

  // 4. Handover stage
  const handoverItems: HandoverRadarItem[] = handoversList
    .filter((h) => {
      if (h.is_hidden || h.isHidden || h.isCompleted === true) return false;
      const failQty = Number(h.quantity_fail) || 0;
      return !isHandoverCompleted(h) || failQty > 0 || !h.handover_scan_url?.trim();
    })
    .map((handover) => {
      const qtyDoc = Number(handover.quantity_doc) || 0;
      const qtyPass = Number(handover.quantity_pass) || 0;
      const qtyFail = Number(handover.quantity_fail) || 0;
      const alerts: WorkflowAlertTag[] = [];

      if (qtyFail > 0) {
        alerts.push({
          label: `Không đạt: ${qtyFail} ${handover.unit || ""}`.trim(),
          severity: "overdue",
          category: "overdue",
        });
      }
      if (!isHandoverCompleted(handover)) {
        alerts.push({
          label: `Chưa nghiệm thu đủ (${qtyPass}/${qtyDoc})`,
          severity: "due_soon",
          category: "due_soon",
        });
      }
      if (!handover.handover_scan_url?.trim()) {
        alerts.push({
          label: "Thiếu scan ký nhận",
          severity: "warning",
          category: "missing_docs",
        });
      }
      return { handover, qtyDoc, qtyPass, qtyFail, alerts };
    })
    .sort((a, b) => b.qtyFail - a.qtyFail || (b.handover.id || 0) - (a.handover.id || 0));

  // 5. Payment stage
  const paymentItems: PaymentRadarItem[] = paymentsList
    .filter((r) => !r.is_hidden && !r.isHidden && (!isPaymentCompleted(r) || isPaymentPaidToday(r, todayStr)))
    .map((payment) => {
      const isDoneToday = isPaymentCompleted(payment);
      const linkedPO = findLinkedPOForPayment(payment, posList)?.po;
      const daysToDue = isDoneToday ? null : diffDaysFromToday(payment.due_date, todayMs);
      const alerts: WorkflowAlertTag[] = [];

      if (!isDoneToday) {
        if (daysToDue !== null) {
          if (daysToDue < 0) {
            alerts.push({
              label: `Quá hạn TT ${Math.abs(daysToDue)} ngày`,
              severity: "overdue",
              category: "overdue",
            });
          } else if (daysToDue <= 3) {
            alerts.push({
              label: daysToDue === 0 ? "Đến hạn TT hôm nay" : `Hạn TT còn ${daysToDue} ngày`,
              severity: "due_soon",
              category: "due_soon",
            });
          }
        }
        if (!payment.invoice_no?.trim()) {
          alerts.push({
            label: "Thiếu số HĐ",
            severity: "warning",
            category: "missing_docs",
          });
        }
        if (!payment.invoice_scan_url?.trim()) {
          alerts.push({
            label: "Thiếu scan HĐ",
            severity: "warning",
            category: "missing_docs",
          });
        }
        if (payment.doc_supplement?.trim()) {
          alerts.push({
            label: "Cần bổ sung chứng từ",
            severity: "warning",
            category: "missing_docs",
          });
        }
      }

      return { payment, linkedPO, isDoneToday, daysToDue, alerts };
    })
    .sort((a, b) => {
      if (a.isDoneToday !== b.isDoneToday) return a.isDoneToday ? 1 : -1;
      const score = (x: PaymentRadarItem) =>
        x.alerts.some((t) => t.severity === "overdue") ? 3 : x.alerts.some((t) => t.severity === "due_soon") ? 2 : 1;
      return score(b) - score(a) || (b.payment.id || 0) - (a.payment.id || 0);
    });

  // Count unique items matching each radar bucket
  const allAlertLists = [
    ...prItems.map((x) => x.alerts),
    ...approvalItems.map((x) => x.alerts),
    ...poItems.map((x) => x.alerts),
    ...handoverItems.map((x) => x.alerts),
    ...paymentItems.filter((x) => !x.isDoneToday).map((x) => x.alerts),
  ];

  const overdue = allAlertLists.filter((list) => list.some((t) => t.category === "overdue")).length;
  const dueSoon = allAlertLists.filter((list) => list.some((t) => t.category === "due_soon")).length;
  const missingDocs = allAlertLists.filter((list) => list.some((t) => t.category === "missing_docs")).length;
  const totalActionable =
    prItems.length +
    approvalItems.length +
    poItems.length +
    handoverItems.length +
    paymentItems.filter((x) => !x.isDoneToday).length;

  return {
    todayStr,
    prs: prItems,
    approvals: approvalItems,
    pos: poItems,
    handovers: handoverItems,
    payments: paymentItems,
    counts: { overdue, dueSoon, missingDocs, totalActionable },
  };
}
