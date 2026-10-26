import { PO, POItem, Payment, PaymentRequestEntry, PR, ApprovalRequest, PaymentHandoverItem } from "../types";
import { PAID_STATUSES, normName } from "../payment-utils";

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
export function isPOCompleted(
  po: PO | null | undefined,
  paymentHandovers?: PaymentHandoverItem[]
): boolean {
  if (!po) return false;
  if (
    po.isCompleted === true ||
    po.status === "Đã hoàn thành" ||
    po.status === "Hoàn thành" ||
    po.status === "Đã giao đủ"
  ) {
    return true;
  }
  const items = po.items || [];
  if (items.length === 0) return false;
  if (paymentHandovers && paymentHandovers.length > 0) {
    const stats = calcPODeliveryStats(po, paymentHandovers);
    return stats.isFullyDelivered;
  }
  return items.every((it) => it.deliveryStatus === "Đã giao");
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


export interface POItemDeliveryStats {
  itemId: number;
  itemName: string;
  unit: string;
  quantityOrdered: number;    // quantity_ordered: Số lượng đặt mua theo PO
  quantityDelivered: number;  // quantity_delivered: Tổng số lượng lũy kế đã được bàn giao qua các đợt trước đó
  quantityRemaining: number;  // quantity_remaining = max(0, quantity_ordered - quantity_delivered)
  isFullyDelivered: boolean;  // quantityRemaining === 0 && quantityOrdered > 0
  deliveryStatus: "Chưa giao" | "Giao một phần" | "Đã giao";
}

export interface PODeliveryStats {
  poNumber: string;
  totalItems: number;
  fullyDeliveredItemsCount: number;
  partialItemsCount: number;
  undeliveredItemsCount: number;
  totalQuantityOrdered: number;
  totalQuantityDelivered: number;
  totalQuantityRemaining: number;
  isFullyDelivered: boolean;       // Tất cả mặt hàng trong PO đã giao đủ 100%
  overallProgressPercent: number;  // Tiến độ phần trăm tổng thể 0 - 100%
  itemsStats: Record<number, POItemDeliveryStats>;
}

export function calcPOItemDeliveryStats(
  it: POItem,
  po: PO,
  paymentHandovers: PaymentHandoverItem[] = []
): POItemDeliveryStats {
  const quantityOrdered = Math.max(0, Number(it.qty) || 0);

  // Lọc các bản ghi bàn giao liên kết với PO này
  const poNum = (po.number || "").trim().toLowerCase();
  const matchingHandovers = (paymentHandovers || []).filter((h) => {
    const hSource = (h.source_number || "").trim().toLowerCase();
    if (!hSource || hSource !== poNum) return false;
    if (h.po_item_id !== undefined && h.po_item_id !== null) {
      return Number(h.po_item_id) === Number(it.id);
    }
    return normName(h.item_name) === normName(it.name);
  });

  const sumHandovers = matchingHandovers.reduce((sum, h) => {
    const pass = Number(h.quantity_pass);
    const doc = Number(h.quantity_doc);
    const validQty = !isNaN(pass) && pass > 0 ? pass : !isNaN(doc) && doc > 0 ? doc : 0;
    return sum + validQty;
  }, 0);

  // Nguồn dữ liệu số lượng đã giao:
  // - Nếu có bản ghi trong paymentHandovers liên kết với PO này, lấy tổng từ các phiếu bàn giao
  // - Nếu chưa có phiếu nào trong paymentHandovers, fallback vào it.deliveredQty đã lưu
  const rawDelivered = matchingHandovers.length > 0
    ? sumHandovers
    : Math.max(0, Number(it.deliveredQty) || 0);

  // Chống giao vượt quá: số lượng đã giao không thể vượt quá số lượng đặt mua
  const quantityDelivered = Math.min(quantityOrdered, rawDelivered);
  const quantityRemaining = Math.max(0, quantityOrdered - quantityDelivered);
  const isFullyDelivered = quantityOrdered > 0 && quantityRemaining === 0;

  const deliveryStatus: "Chưa giao" | "Giao một phần" | "Đã giao" =
    isFullyDelivered
      ? "Đã giao"
      : quantityDelivered > 0
      ? "Giao một phần"
      : "Chưa giao";

  return {
    itemId: it.id,
    itemName: it.name,
    unit: it.unit || "Cái",
    quantityOrdered,
    quantityDelivered,
    quantityRemaining,
    isFullyDelivered,
    deliveryStatus,
  };
}

export function calcPODeliveryStats(
  po: PO | null | undefined,
  paymentHandovers: PaymentHandoverItem[] = []
): PODeliveryStats {
  if (!po || !po.items || po.items.length === 0) {
    return {
      poNumber: po?.number || "",
      totalItems: 0,
      fullyDeliveredItemsCount: 0,
      partialItemsCount: 0,
      undeliveredItemsCount: 0,
      totalQuantityOrdered: 0,
      totalQuantityDelivered: 0,
      totalQuantityRemaining: 0,
      isFullyDelivered: false,
      overallProgressPercent: 0,
      itemsStats: {},
    };
  }

  const itemsStats: Record<number, POItemDeliveryStats> = {};
  let fullyDeliveredItemsCount = 0;
  let partialItemsCount = 0;
  let undeliveredItemsCount = 0;
  let totalQuantityOrdered = 0;
  let totalQuantityDelivered = 0;

  for (const it of po.items) {
    const stat = calcPOItemDeliveryStats(it, po, paymentHandovers);
    itemsStats[it.id] = stat;
    totalQuantityOrdered += stat.quantityOrdered;
    totalQuantityDelivered += stat.quantityDelivered;

    if (stat.isFullyDelivered) {
      fullyDeliveredItemsCount++;
    } else if (stat.quantityDelivered > 0) {
      partialItemsCount++;
    } else {
      undeliveredItemsCount++;
    }
  }

  const totalQuantityRemaining = Math.max(0, totalQuantityOrdered - totalQuantityDelivered);
  const isFullyDelivered = po.items.length > 0 && fullyDeliveredItemsCount === po.items.length;
  const overallProgressPercent =
    totalQuantityOrdered > 0
      ? Math.min(100, Math.round((totalQuantityDelivered / totalQuantityOrdered) * 100))
      : 0;

  return {
    poNumber: po.number,
    totalItems: po.items.length,
    fullyDeliveredItemsCount,
    partialItemsCount,
    undeliveredItemsCount,
    totalQuantityOrdered,
    totalQuantityDelivered,
    totalQuantityRemaining,
    isFullyDelivered,
    overallProgressPercent,
    itemsStats,
  };
}
