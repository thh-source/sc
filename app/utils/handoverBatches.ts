import { PO, POItem, PaymentHandoverItem } from "../types";
import { normName } from "../payment-utils";
import { calcPOItemDeliveryStats } from "./paymentSync";

export interface PODeliveryBatchItem {
  handoverItem: PaymentHandoverItem;
  poItem?: POItem;
  poItemId?: number;
  itemName: string;
  spec?: string;
  unit: string;
  quantityOrdered: number;          // Số lượng đặt mua ban đầu theo PO
  deliveredFromOtherBatches: number; // Tổng số lượng đã giao ở các đợt khác
  maxAllowedInThisBatch: number;     // Tối đa có thể giao đợt này = max(0, quantityOrdered - deliveredFromOtherBatches)
  currentQuantityPass: number;       // Số lượng bàn giao hiện tại của đợt này
  quantityDoc: number;               // Số lượng chứng từ
  note: string;                      // Ghi chú
}

export interface PODeliveryBatch {
  batchId: string;
  batchNumber: number; // 1, 2, 3...
  batchLabel: string;  // "Đợt 1", "Đợt 2"...
  date: string;
  department: string;
  senderName: string;
  receiverName: string;
  totalQuantity: number;
  itemCount: number;
  items: PODeliveryBatchItem[];
  rawHandovers: PaymentHandoverItem[];
}

/**
 * Tạo batch_id chuẩn cho một đợt bàn giao mới
 */
export function generateHandoverBatchId(poNumber: string, batchIndex: number = 1): string {
  const cleanNum = (poNumber || "PO").replace(/[^a-zA-Z0-9_-]/g, "");
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `BATCH_${cleanNum}_D${batchIndex}_${time}_${rand}`;
}

/**
 * Trả về group key dùng để phân nhóm một bản ghi bàn giao thành các đợt
 */
function getHandoverGroupKey(h: PaymentHandoverItem): string {
  if (h.batch_id && h.batch_id.trim()) {
    return `ID_${h.batch_id.trim()}`;
  }
  const dateStr = (h.handover_date || "").trim();
  const deptStr = (h.department || "").trim().toLowerCase();
  const recvStr = (h.receiver_name || "").trim().toLowerCase();
  const sendStr = (h.sender_name || "").trim().toLowerCase();
  return `LEGACY_${dateStr}__${deptStr}__${recvStr}__${sendStr}`;
}

/**
 * Kiểm tra xem 2 bản ghi bàn giao có cùng chỉ đến 1 mặt hàng trong PO hay không
 */
function isSamePOItem(a: PaymentHandoverItem, b: PaymentHandoverItem): boolean {
  if (a.po_item_id && b.po_item_id) {
    return Number(a.po_item_id) === Number(b.po_item_id);
  }
  return normName(a.item_name) === normName(b.item_name);
}

/**
 * Trích xuất và phân nhóm toàn bộ các đợt bàn giao đã thực hiện của một PO
 */
export function getPODeliveryBatches(
  po: PO | null | undefined,
  paymentHandovers: PaymentHandoverItem[] = []
): PODeliveryBatch[] {
  if (!po || !po.number) return [];

  const cleanPoNum = po.number.trim().toLowerCase();
  const poHandovers = paymentHandovers.filter(
    (h) => (h.source_number || "").trim().toLowerCase() === cleanPoNum
  );

  if (poHandovers.length === 0) return [];

  // 1. Nhóm theo batch_id hoặc theo thuộc tính nhận dạng đợt
  const groupMap = new Map<string, PaymentHandoverItem[]>();
  for (const h of poHandovers) {
    const key = getHandoverGroupKey(h);
    const existing = groupMap.get(key) || [];
    existing.push(h);
    groupMap.set(key, existing);
  }

  // 2. Chuyển thành danh sách các nhóm
  const rawBatches = Array.from(groupMap.entries()).map(([key, items]) => {
    // Sắp xếp các item theo ID tăng dần
    items.sort((a, b) => Number(a.id) - Number(b.id));
    const first = items[0];
    const earliestDate = items.reduce((min, cur) => {
      const d = cur.handover_date || "";
      return (!min || (d && d < min)) ? d : min;
    }, first.handover_date || "");

    const minId = items.reduce((min, cur) => Math.min(min, Number(cur.id) || 0), Number(first.id) || 0);

    return {
      key,
      items,
      date: earliestDate || first.handover_date || "",
      department: first.department || "",
      senderName: first.sender_name || "",
      receiverName: first.receiver_name || "",
      minId,
    };
  });

  // 3. Sắp xếp các đợt theo trình tự thời gian (ngày sớm nhất trước, nếu cùng ngày thì theo minId)
  rawBatches.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.minId - b.minId;
  });

  // 4. Xây dựng chi tiết từng đợt
  const result: PODeliveryBatch[] = [];

  rawBatches.forEach((b, index) => {
    const batchNumber = index + 1;
    const batchLabel = `Đợt ${batchNumber}`;
    const batchId = b.items[0]?.batch_id || b.key;

    const batchItems: PODeliveryBatchItem[] = b.items.map((h) => {
      // Tìm POItem tương ứng
      const matchedPOItem = (po.items || []).find((it) => {
        if (h.po_item_id !== undefined && h.po_item_id !== null) {
          return Number(it.id) === Number(h.po_item_id);
        }
        return normName(it.name) === normName(h.item_name);
      });

      const quantityOrdered = matchedPOItem ? Math.max(0, Number(matchedPOItem.qty) || 0) : (Number(h.quantity_doc) || 0);

      // Tính tổng SL đã giao ở CÁC ĐỢT KHÁC (khác batch này)
      const otherHandovers = poHandovers.filter(
        (oh) => getHandoverGroupKey(oh) !== b.key && isSamePOItem(oh, h)
      );

      const deliveredFromOtherBatches = otherHandovers.reduce((sum, oh) => {
        const pass = Number(oh.quantity_pass);
        const doc = Number(oh.quantity_doc);
        const valid = !isNaN(pass) && pass > 0 ? pass : !isNaN(doc) && doc > 0 ? doc : 0;
        return sum + valid;
      }, 0);

      const maxAllowedInThisBatch = Math.max(0, quantityOrdered - deliveredFromOtherBatches);
      const currentQuantityPass = Number(h.quantity_pass) || 0;
      const quantityDoc = Number(h.quantity_doc) || currentQuantityPass;

      return {
        handoverItem: h,
        poItem: matchedPOItem,
        poItemId: matchedPOItem?.id ?? h.po_item_id,
        itemName: h.item_name || matchedPOItem?.name || "",
        spec: h.specification || matchedPOItem?.spec || "",
        unit: h.unit || matchedPOItem?.unit || "Cái",
        quantityOrdered,
        deliveredFromOtherBatches,
        maxAllowedInThisBatch,
        currentQuantityPass,
        quantityDoc,
        note: h.note || "",
      };
    });

    const totalQuantity = batchItems.reduce((sum, it) => sum + (Number(it.currentQuantityPass) || 0), 0);

    result.push({
      batchId,
      batchNumber,
      batchLabel,
      date: b.date,
      department: b.department,
      senderName: b.senderName,
      receiverName: b.receiverName,
      totalQuantity,
      itemCount: batchItems.length,
      items: batchItems,
      rawHandovers: b.items,
    });
  });

  return result;
}

export interface UpdateBatchItemPayload {
  id: number;                // ID của PaymentHandoverItem
  quantity_pass: number;     // Số lượng bàn giao mới
  note?: string;             // Ghi chú mới (nếu có)
}

export interface UpdateBatchMetadataPayload {
  handover_date?: string;
  department?: string;
  receiver_name?: string;
  sender_name?: string;
}

/**
 * Cập nhật số lượng bàn giao của một đợt, validate chống vượt quá số lượng PO,
 * và tính toán lại toàn bộ PO items và trạng thái đơn hàng.
 */
export function updatePOHandoverBatch(options: {
  po: PO;
  allHandovers: PaymentHandoverItem[];
  batchId: string;
  updatedItems: UpdateBatchItemPayload[];
  metadata?: UpdateBatchMetadataPayload;
}): {
  updatedPO: PO;
  updatedHandovers: PaymentHandoverItem[];
  error?: string;
} {
  const { po, allHandovers, batchId, updatedItems, metadata } = options;

  // 1. Lấy thông tin đợt bàn giao hiện tại
  const existingBatches = getPODeliveryBatches(po, allHandovers);
  const targetBatch = existingBatches.find((b) => b.batchId === batchId);

  if (!targetBatch) {
    return {
      updatedPO: po,
      updatedHandovers: allHandovers,
      error: `Không tìm thấy đợt bàn giao với mã ${batchId}!`,
    };
  }

  // 2. Validate từng dòng hàng
  const updatedMap = new Map<number, UpdateBatchItemPayload>(
    updatedItems.map((u) => [Number(u.id), u])
  );

  for (const bItem of targetBatch.items) {
    const update = updatedMap.get(Number(bItem.handoverItem.id));
    if (!update) continue;

    const newPass = Number(update.quantity_pass);
    if (isNaN(newPass) || newPass < 0) {
      return {
        updatedPO: po,
        updatedHandovers: allHandovers,
        error: `Số lượng bàn giao của "${bItem.itemName}" không thể nhỏ hơn 0!`,
      };
    }

    if (newPass > bItem.maxAllowedInThisBatch) {
      return {
        updatedPO: po,
        updatedHandovers: allHandovers,
        error: `Số lượng bàn giao của "${bItem.itemName}" (${newPass} ${bItem.unit}) vượt quá số lượng tối đa có thể giao đợt này (${bItem.maxAllowedInThisBatch} ${bItem.unit})!`,
      };
    }
  }

  // 3. Tạo danh sách handovers mới đã cập nhật
  const nextHandovers = allHandovers.map((h) => {
    const update = updatedMap.get(Number(h.id));
    if (!update) {
      // Nếu có metadata cập nhật cho cả đợt
      if (metadata && targetBatch.rawHandovers.some((th) => th.id === h.id)) {
        return {
          ...h,
          handover_date: metadata.handover_date ?? h.handover_date,
          department: metadata.department ?? h.department,
          receiver_name: metadata.receiver_name ?? h.receiver_name,
          sender_name: metadata.sender_name ?? h.sender_name,
        };
      }
      return h;
    }

    const newPass = Math.max(0, Number(update.quantity_pass) || 0);
    const nextNote = update.note !== undefined ? update.note.trim() : h.note;

    return {
      ...h,
      quantity_pass: String(newPass),
      quantity_doc: String(newPass), // Đồng bộ số lượng chứng từ thực tế
      note: nextNote,
      handover_date: metadata?.handover_date ?? h.handover_date,
      department: metadata?.department ?? h.department,
      receiver_name: metadata?.receiver_name ?? h.receiver_name,
      sender_name: metadata?.sender_name ?? h.sender_name,
      batch_id: h.batch_id || batchId,
      batch_number: h.batch_number || targetBatch.batchNumber,
    };
  });

  // 4. Tính toán lại trạng thái và số lượng đã giao của từng POItem
  const updatedPoItems = (po.items || []).map((it) => {
    const stat = calcPOItemDeliveryStats(it, po, nextHandovers);
    return {
      ...it,
      deliveredQty: stat.quantityDelivered,
      deliveryStatus: stat.deliveryStatus,
      // Cập nhật lại deliveryHistory nếu có đợt này
      deliveryHistory: (it.deliveryHistory || []).map((dh) => {
        if (dh.date === targetBatch.date) {
          const matchingBatchItem = targetBatch.items.find(
            (bi) => bi.poItemId === it.id || normName(bi.itemName) === normName(it.name)
          );
          if (matchingBatchItem) {
            const up = updatedMap.get(Number(matchingBatchItem.handoverItem.id));
            if (up) {
              return {
                ...dh,
                qty: Number(up.quantity_pass) || 0,
                note: up.note ?? dh.note,
              };
            }
          }
        }
        return dh;
      }),
    };
  });

  // 5. Tính toán trạng thái tổng thể của PO
  const allDelivered =
    updatedPoItems.length > 0 &&
    updatedPoItems.every((it) => (Number(it.deliveredQty) || 0) >= (Number(it.qty) || 0));

  const someDelivered = updatedPoItems.some((it) => (Number(it.deliveredQty) || 0) > 0);

  let nextPoStatus = po.status;
  if (allDelivered) {
    nextPoStatus = "Đã giao đủ";
  } else if (someDelivered) {
    nextPoStatus = "Đang giao hàng";
  } else if (po.status === "Đã giao đủ" || po.status === "Đang giao hàng") {
    nextPoStatus = "Đang thực hiện";
  }

  const updatedPO: PO = {
    ...po,
    items: updatedPoItems,
    status: nextPoStatus,
    isCompleted: allDelivered ? true : po.isCompleted && allDelivered,
  };

  return {
    updatedPO,
    updatedHandovers: nextHandovers,
  };
}
