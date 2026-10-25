import { PR, PO, ApprovalRequest, PaymentRequestEntry, PaymentHandoverItem } from "../types";

export interface ResolvedDocFlow {
  prId?: number;
  prNumber?: string;
  hasCompare?: boolean;
  approvalId?: number;
  approvalNumber?: string;
  approvalStatus?: string;
  poId?: number;
  poNumber?: string;
  poStatus?: string;
  paymentCount?: number;
  hasPayment?: boolean;
  handoverCount?: number;
  hasHandover?: boolean;
}

export interface DocFlowDataContext {
  prs?: PR[];
  pos?: PO[];
  approvalRequests?: ApprovalRequest[];
  paymentRequests?: PaymentRequestEntry[];
  paymentHandovers?: PaymentHandoverItem[];
}

/**
 * Tự động giải quyết và truy vết luồng chứng từ xuyên suốt:
 * PR ⇄ So sánh giá ⇄ Đề nghị phê duyệt (ĐNPD) ⇄ Đơn mua hàng (PO) ⇄ Thanh toán ⇄ Bàn giao
 */
export function resolveDocFlow(
  target: {
    pr?: PR | null;
    prId?: number;
    prNumber?: string;
    po?: PO | null;
    poId?: number;
    poNumber?: string;
    approval?: ApprovalRequest | null;
    approvalId?: number;
    approvalNumber?: string;
  },
  ctx: DocFlowDataContext
): ResolvedDocFlow {
  const { prs = [], pos = [], approvalRequests = [], paymentRequests = [], paymentHandovers = [] } = ctx;

  let prId = target.prId ?? target.pr?.id;
  let prNumber = target.prNumber ?? target.pr?.number;
  let poId = target.poId ?? target.po?.id;
  let poNumber = target.poNumber ?? target.po?.number;
  let poStatus = target.po?.status;
  let approvalId = target.approvalId ?? target.approval?.id;
  let approvalNumber = target.approvalNumber ?? target.approval?.requestNumber;
  let approvalStatus = target.approval?.status;

  // 1. Nếu bắt đầu từ PO
  if (poId || poNumber) {
    const po = target.po || pos.find((p) => (poId !== undefined && p.id === poId) || (poNumber && p.number === poNumber));
    if (po) {
      poId = po.id;
      poNumber = po.number;
      poStatus = po.status;

      if (!prNumber && po.prNumber) {
        prNumber = po.prNumber;
      }

      // Tìm PR theo allocations hoặc prNumber
      if (!prId && prNumber) {
        const foundPR = prs.find((p) => p.number === prNumber || po.items?.some((it) => it.allocations?.some((al) => al.prId === p.id)));
        if (foundPR) {
          prId = foundPR.id;
          prNumber = foundPR.number;
        }
      }

      // Tìm ĐNPD liên kết với PO
      if (!approvalId) {
        const foundAppr = approvalRequests.find(
          (a) =>
            a.linkedPoId === po.id ||
            a.linkedPoNumber === po.number ||
            (prId !== undefined && a.prId === prId) ||
            (prNumber && a.prNumber === prNumber)
        );
        if (foundAppr) {
          approvalId = foundAppr.id;
          approvalNumber = foundAppr.requestNumber;
          approvalStatus = foundAppr.status;
        }
      }
    }
  }

  // 2. Nếu bắt đầu từ Approval (ĐNPD)
  if (approvalId || approvalNumber) {
    const appr =
      target.approval ||
      approvalRequests.find((a) => (approvalId !== undefined && a.id === approvalId) || (approvalNumber && a.requestNumber === approvalNumber));
    if (appr) {
      approvalId = appr.id;
      approvalNumber = appr.requestNumber;
      approvalStatus = appr.status;

      if (!prId && appr.prId) prId = appr.prId;
      if (!prNumber && appr.prNumber) prNumber = appr.prNumber;

      if (!poId && appr.linkedPoId) poId = appr.linkedPoId;
      if (!poNumber && appr.linkedPoNumber) poNumber = appr.linkedPoNumber;

      // Tìm PO liên kết nếu chưa có
      if (!poId && (appr.linkedPoNumber || prNumber)) {
        const foundPO = pos.find(
          (p) =>
            (appr.linkedPoNumber && p.number === appr.linkedPoNumber) ||
            (prNumber && p.prNumber === prNumber) ||
            (prId !== undefined && p.items?.some((it) => it.allocations?.some((al) => al.prId === prId)))
        );
        if (foundPO) {
          poId = foundPO.id;
          poNumber = foundPO.number;
          poStatus = foundPO.status;
        }
      }
    }
  }

  // 3. Nếu bắt đầu từ PR
  if (prId || prNumber) {
    const pr = target.pr || prs.find((p) => (prId !== undefined && p.id === prId) || (prNumber && p.number === prNumber));
    if (pr) {
      prId = pr.id;
      prNumber = pr.number;

      // Tìm ĐNPD
      if (!approvalId) {
        const foundAppr = approvalRequests.find((a) => a.prId === pr.id || a.prNumber === pr.number);
        if (foundAppr) {
          approvalId = foundAppr.id;
          approvalNumber = foundAppr.requestNumber;
          approvalStatus = foundAppr.status;
        }
      }

      // Tìm PO
      if (!poId) {
        const foundPO = pos.find(
          (p) => p.prNumber === pr.number || p.items?.some((it) => it.allocations?.some((al) => al.prId === pr.id))
        );
        if (foundPO) {
          poId = foundPO.id;
          poNumber = foundPO.number;
          poStatus = foundPO.status;
        }
      }
    }
  }

  // 4. Kiểm tra thanh toán & giao nhận cho PO
  let paymentCount = 0;
  let handoverCount = 0;

  if (poNumber) {
    // Đếm các đợt thanh toán liên quan
    paymentCount = paymentRequests.filter(
      (pm) => pm.description?.toLowerCase().includes(poNumber!.toLowerCase()) || pm.invoice_no?.toLowerCase().includes(poNumber!.toLowerCase())
    ).length;

    // Đếm biên bản giao nhận liên quan
    handoverCount = paymentHandovers.filter(
      (h) => h.source_number?.toLowerCase() === poNumber!.toLowerCase()
    ).length;
  }

  return {
    prId,
    prNumber,
    hasCompare: Boolean(prId),
    approvalId,
    approvalNumber,
    approvalStatus,
    poId,
    poNumber,
    poStatus,
    paymentCount,
    hasPayment: paymentCount > 0,
    handoverCount,
    hasHandover: handoverCount > 0,
  };
}
