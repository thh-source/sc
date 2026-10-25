import { PO, Payment, PaymentRequestEntry, PR, ApprovalRequest, PaymentHandoverItem } from "../types";
import { PAID_STATUSES } from "../payment-utils";

/**
 * Kiểm tra xem một khoản đề nghị thanh toán đã hoàn thành chưa
 */
export function isPaymentCompleted(r: PaymentRequestEntry | null | undefined): boolean {
  if (!r) return false;
  return r.isCompleted === true || PAID_STATUSES.includes(r.status);
}

/**
 * Kiểm tra xem một đơn hàng PO đã hoàn thành chưa
 */
export function isPOCompleted(po: PO | null | undefined): boolean {
  if (!po) return false;
  if (po.isCompleted === true || po.status === "Đã hoàn thành" || po.status === "Hoàn thành") {
    return true;
  }
  const items = po.items || [];
  return items.length > 0 && items.every((it) => it.deliveryStatus === "Đã giao");
}

/**
 * Kiểm tra xem một PR đã hoàn thành chưa
 */
export function isPRCompleted(pr: PR | null | undefined): boolean {
  if (!pr) return false;
  return pr.isCompleted === true || pr.status === "Hoàn thành";
}

/**
 * Kiểm tra xem một ĐNPD đã hoàn thành chưa
 */
export function isApprovalCompleted(appr: ApprovalRequest | null | undefined): boolean {
  if (!appr) return false;
  return appr.isCompleted === true || appr.status === "Đã tạo PO" || appr.status === "Đã phê duyệt";
}

/**
 * Kiểm tra xem một bàn giao đã hoàn thành chưa
 */
export function isHandoverCompleted(h: PaymentHandoverItem | null | undefined): boolean {
  if (!h) return false;
  if (h.isCompleted === true) return true;
  const pass = Number(h.quantity_pass) || 0;
  const doc = Number(h.quantity_doc) || 0;
  return doc > 0 && pass >= doc;
}

/**
 * Tra cứu PO liên kết và đợt thanh toán (milestone) tương ứng của một đề nghị thanh toán
 */
export function findLinkedPOForPayment(
  r: PaymentRequestEntry,
  pos: PO[] = []
): { po: PO; milestone?: Payment } | null {
  if (!pos || pos.length === 0) return null;

  // 1. Khớp trực tiếp qua trường paymentRequestId trên các đợt thanh toán của PO
  for (const po of pos) {
    const milestone = (po.payments || []).find((p) => p.paymentRequestId === r.id);
    if (milestone) return { po, milestone };
  }

  // 2. Khớp qua group_code = po.number
  if (r.group_code) {
    const cleanGroup = r.group_code.trim().toLowerCase();
    const po = pos.find((p) => p.number.trim().toLowerCase() === cleanGroup);
    if (po) {
      const milestone =
        (po.payments || []).find(
          (p) => p.paymentRequestId === r.id || p.amount === Number(r.amount)
        ) || (po.payments || [])[0];
      return { po, milestone };
    }
  }

  // 3. Khớp qua số PO xuất hiện trong description, item_name hoặc lines
  const combinedText = [
    r.description,
    r.item_name,
    r.group_code,
    ...(r.lines || []).map((l) => `${l.description || ""} ${l.invoice_no || ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const po of pos) {
    if (po.number && combinedText.includes(po.number.toLowerCase())) {
      const milestone =
        (po.payments || []).find(
          (p) => p.paymentRequestId === r.id || p.amount === Number(r.amount)
        ) || (po.payments || [])[0];
      return { po, milestone };
    }
  }

  return null;
}

/**
 * Đồng bộ trạng thái hoàn thành giữa Đề nghị thanh toán và PO liên kết
 * - Khi đánh dấu Hoàn thành: cập nhật đợt thanh toán PO sang "Đã thanh toán"
 * - Khi bỏ đánh dấu: rollback đợt thanh toán PO về "Chưa thanh toán"
 */
export function syncPaymentCompletionToPO(
  req: PaymentRequestEntry,
  willComplete: boolean,
  pos: PO[] = []
): {
  updatedReq: PaymentRequestEntry;
  updatedPOs: PO[];
  linkedPO?: PO;
} {
  const updatedReq: PaymentRequestEntry = {
    ...req,
    isCompleted: willComplete,
    status: willComplete ? "Đã thanh toán" : "Đang xử lý",
    paidAt: willComplete ? (req.paidAt || new Date().toISOString()) : undefined,
  };

  let linkedPO: PO | undefined;

  const updatedPOs = pos.map((po) => {
    const isDirectMatch = (po.payments || []).some(
      (p) => p.paymentRequestId === req.id || (p.amount === Number(req.amount) && req.group_code === po.number)
    );
    const isCodeMatch =
      Boolean(req.group_code && po.number && req.group_code.trim().toLowerCase() === po.number.trim().toLowerCase()) ||
      Boolean(po.number && (req.description || "").toLowerCase().includes(po.number.toLowerCase()));

    if (!isDirectMatch && !isCodeMatch) return po;

    linkedPO = po;

    // Cập nhật các đợt thanh toán trong PO
    let matchedMilestone = false;
    const nextPayments = (po.payments || []).map((p) => {
      const isTarget =
        p.paymentRequestId === req.id ||
        (!matchedMilestone && p.amount === Number(req.amount) && isCodeMatch) ||
        (!matchedMilestone && !p.paymentRequestId && isCodeMatch);

      if (isTarget) {
        matchedMilestone = true;
        return {
          ...p,
          paymentRequestId: req.id,
          status: willComplete ? ("Đã thanh toán" as const) : ("Chưa thanh toán" as const),
        };
      }
      return p;
    });

    // Nếu tất cả đợt trong PO đã thanh toán và hàng đã giao đủ -> chuyển PO sang Đã hoàn thành
    const allPaid = nextPayments.length > 0 && nextPayments.every((p) => p.status === "Đã thanh toán");
    const allDelivered = (po.items || []).length > 0 && (po.items || []).every((it) => it.deliveryStatus === "Đã giao");

    let nextStatus = po.status;
    if (willComplete && allPaid && allDelivered) {
      nextStatus = "Đã hoàn thành";
    } else if (!willComplete && po.status === "Đã hoàn thành") {
      nextStatus = "Đang thực hiện";
    }

    return {
      ...po,
      payments: nextPayments,
      status: nextStatus,
      isCompleted: willComplete && allPaid && allDelivered ? true : (po.isCompleted && willComplete),
    };
  });

  return { updatedReq, updatedPOs, linkedPO };
}

/**
 * Kiểm tra xem một khoản thanh toán đã được thanh toán trong ngày hôm nay hay chưa
 */
export function isPaymentPaidToday(r: PaymentRequestEntry | null | undefined, todayStr?: string): boolean {
  if (!r || !r.paidAt) return false;
  const targetDate = todayStr || new Date().toISOString().slice(0, 10);
  return r.paidAt.slice(0, 10) === targetDate;
}
