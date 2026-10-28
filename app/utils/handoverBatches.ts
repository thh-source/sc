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
  isSynthetic?: boolean;             // Được tạo từ deliveryHistory hoặc deliveredQty
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
  hasSyntheticItems?: boolean;
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
 * Trích xuất và phân nhóm toàn bộ các đợt bàn giao đã thực hiện của một PO.
 * Tự động hợp nhất cả từ paymentHandovers VÀ po.items[].deliveryHistory hoặc po.items[].deliveredQty,
 * đảm bảo 100% các đợt giao hàng trước đó đều được hiển thị và quản lý.
 */

/**
 * Sắp xếp danh sách mặt hàng bàn giao theo đúng thứ tự dòng hàng trong PO gốc.
 * Giúp người giao nhận và thủ kho dễ dàng đối chiếu từng dòng từ trên xuống dưới.
 */
export function sortHandoversByPOLineOrder(
  handovers: PaymentHandoverItem[],
  poOrPos?: PO | PO[] | null
): PaymentHandoverItem[] {
  if (!handovers || handovers.length <= 1) return handovers || [];

  let targetPO: PO | undefined;

  if (poOrPos) {
    if (Array.isArray(poOrPos)) {
      const firstSource = (handovers[0]?.source_number || "").trim().toLowerCase();
      if (firstSource) {
        targetPO = poOrPos.find(
          (p) => (p.number || "").trim().toLowerCase() === firstSource
        );
      }
    } else {
      targetPO = poOrPos;
    }
  }

  // Nếu không có PO, sắp xếp theo item_order nếu có, hoặc giữ nguyên
  if (!targetPO || !targetPO.items || targetPO.items.length === 0) {
    return handovers.slice().sort((a, b) => {
      const orderA = a.item_order ?? 99999;
      const orderB = b.item_order ?? 99999;
      if (orderA !== orderB) return orderA - orderB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
  }

  const idOrderMap = new Map<number, number>();
  const nameOrderMap = new Map<string, number>();

  targetPO.items.forEach((it, idx) => {
    idOrderMap.set(Number(it.id), idx);
    const n = normName(it.name);
    if (n && !nameOrderMap.has(n)) {
      nameOrderMap.set(n, idx);
    }
  });

  const getOrder = (h: PaymentHandoverItem): number => {
    if (h.item_order !== undefined && h.item_order !== null && !isNaN(h.item_order)) {
      return h.item_order;
    }
    if (h.po_item_id !== undefined && h.po_item_id !== null && idOrderMap.has(Number(h.po_item_id))) {
      return idOrderMap.get(Number(h.po_item_id))!;
    }
    const n = normName(h.item_name);
    if (nameOrderMap.has(n)) {
      return nameOrderMap.get(n)!;
    }
    return 99999;
  };

  return handovers.slice().sort((a, b) => {
    const oA = getOrder(a);
    const oB = getOrder(b);
    if (oA !== oB) return oA - oB;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
}

export function getPODeliveryBatches(
  po: PO | null | undefined,
  paymentHandovers: PaymentHandoverItem[] = []
): PODeliveryBatch[] {
  if (!po || !po.number) return [];

  const cleanPoNum = po.number.trim().toLowerCase();
  const matchingHandovers = (paymentHandovers || []).filter(
    (h) => (h.source_number || "").trim().toLowerCase() === cleanPoNum
  );

  const combinedHandovers: PaymentHandoverItem[] = [...matchingHandovers];

  // 1. Kiểm tra po.items để bổ sung các đợt giao từ deliveryHistory chưa có trong paymentHandovers
  let synthCounter = 1;
  const items = po.items || [];

  for (const it of items) {
    const historyList = it.deliveryHistory || [];

    if (historyList.length > 0) {
      historyList.forEach((dh, idx) => {
        const dhDate = dh.date || "";
        const dhQty = Number(dh.qty) || 0;
        if (dhQty <= 0) return;

        // Kiểm tra xem đã có bản ghi trong paymentHandovers khớp với item này và ngày này chưa
        const alreadyInHandovers = combinedHandovers.some((h) => {
          const matchItem = h.po_item_id === it.id || normName(h.item_name) === normName(it.name);
          const matchDate = !dhDate || !h.handover_date || h.handover_date === dhDate;
          return matchItem && matchDate;
        });

        if (!alreadyInHandovers) {
          const synthBatchId = dh.batchId || `DH_${cleanPoNum}_${dhDate || "NODATE"}_${dh.receiverName || ""}`;
          combinedHandovers.push({
            id: -1 * (Number(it.id) * 1000 + (idx + 1) * 10 + (synthCounter++)),
            department: (po as any).department || "Phòng Cung ứng",
            item_name: it.name,
            unit: it.unit || "Cái",
            quantity_doc: String(dhQty),
            quantity_pass: String(dhQty),
            quantity_fail: "0",
            note: dh.note || dh.discrepancyReason || "",
            handover_date: dhDate || po.deliveryDate || new Date().toISOString().slice(0, 10),
            sender_name: dh.senderName || "Trần Hải Hà",
            sender_dept: "Phòng Cung ứng",
            receiver_name: dh.receiverName || "",
            source_type: "PO",
            source_number: po.number,
            specification: it.spec || "",
            po_item_id: it.id,
            batch_id: synthBatchId,
          });
        }
      });
    } else if ((Number(it.deliveredQty) || 0) > 0) {
      // Trường hợp có deliveredQty > 0 nhưng không có deliveryHistory và không có paymentHandovers
      const delivQty = Number(it.deliveredQty) || 0;
      const alreadyInHandovers = combinedHandovers.some(
        (h) => h.po_item_id === it.id || normName(h.item_name) === normName(it.name)
      );

      if (!alreadyInHandovers) {
        const defaultDate = it.deliveryDate || po.deliveryDate || po.date || new Date().toISOString().slice(0, 10);
        const synthBatchId = `DELIV_${cleanPoNum}_${defaultDate}`;
        combinedHandovers.push({
          id: -1 * (Number(it.id) * 1000 + 999),
          department: (po as any).department || "Phòng Cung ứng",
          item_name: it.name,
          unit: it.unit || "Cái",
          quantity_doc: String(delivQty),
          quantity_pass: String(delivQty),
          quantity_fail: "0",
          note: it.note || "",
          handover_date: defaultDate,
          sender_name: "Trần Hải Hà",
          sender_dept: "Phòng Cung ứng",
          receiver_name: "",
          source_type: "PO",
          source_number: po.number,
          specification: it.spec || "",
          po_item_id: it.id,
          batch_id: synthBatchId,
        });
      }
    }
  }

  if (combinedHandovers.length === 0) return [];

  // 2. Nhóm theo batch_id hoặc theo thuộc tính nhận dạng đợt
  const groupMap = new Map<string, PaymentHandoverItem[]>();
  for (const h of combinedHandovers) {
    const key = getHandoverGroupKey(h);
    const existing = groupMap.get(key) || [];
    existing.push(h);
    groupMap.set(key, existing);
  }

  // 3. Chuyển thành danh sách các nhóm đợt
  const rawBatches = Array.from(groupMap.entries()).map(([key, bItems]) => {
    bItems.sort((a, b) => Number(a.id) - Number(b.id));
    const first = bItems[0];
    const earliestDate = bItems.reduce((min, cur) => {
      const d = cur.handover_date || "";
      return (!min || (d && d < min)) ? d : min;
    }, first.handover_date || "");

    const minId = bItems.reduce((min, cur) => Math.min(min, Number(cur.id) || 0), Number(first.id) || 0);

    return {
      key,
      items: bItems,
      date: earliestDate || first.handover_date || "",
      department: first.department || "",
      senderName: first.sender_name || "",
      receiverName: first.receiver_name || "",
      minId,
    };
  });

  // 4. Sắp xếp các đợt theo trình tự thời gian tăng dần
  rawBatches.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.minId - b.minId;
  });

  // 5. Xây dựng chi tiết từng đợt
  const result: PODeliveryBatch[] = [];

  rawBatches.forEach((b, index) => {
    const batchNumber = index + 1;
    const batchLabel = `Đợt ${batchNumber}`;
    const batchId = b.items[0]?.batch_id || b.key;
    let hasSyntheticItems = false;

    const batchItems: PODeliveryBatchItem[] = b.items.map((h) => {
      const isSynthetic = Number(h.id) < 0;
      if (isSynthetic) hasSyntheticItems = true;

      // Tìm POItem tương ứng
      const matchedPOItem = items.find((it) => {
        if (h.po_item_id !== undefined && h.po_item_id !== null) {
          return Number(it.id) === Number(h.po_item_id);
        }
        return normName(it.name) === normName(h.item_name);
      });

      const quantityOrdered = matchedPOItem ? Math.max(0, Number(matchedPOItem.qty) || 0) : (Number(h.quantity_doc) || 0);

      // Tính tổng SL đã giao ở CÁC ĐỢT KHÁC (khác batch này)
      const otherHandovers = combinedHandovers.filter(
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
        isSynthetic,
      };
    });

    // Sắp xếp các dòng hàng theo đúng thứ tự xuất hiện trong PO gốc
    const poOrderMap = new Map((items || []).map((it, idx) => [it.id, idx]));
    const poNameMap = new Map((items || []).map((it, idx) => [normName(it.name), idx]));

    const getItemOrder = (bi: PODeliveryBatchItem) => {
      if (bi.handoverItem.item_order !== undefined && bi.handoverItem.item_order !== null) {
        return bi.handoverItem.item_order;
      }
      if (bi.poItemId !== undefined && poOrderMap.has(Number(bi.poItemId))) {
        return poOrderMap.get(Number(bi.poItemId))!;
      }
      const n = normName(bi.itemName);
      if (poNameMap.has(n)) {
        return poNameMap.get(n)!;
      }
      return 99999;
    };

    batchItems.sort((a, b) => getItemOrder(a) - getItemOrder(b));
    const sortedRawHandovers = sortHandoversByPOLineOrder(b.items, po);

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
      rawHandovers: sortedRawHandovers,
      hasSyntheticItems,
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

  // 3. Chuẩn bị danh sách handovers mới:
  // Nếu có synthetic items (id < 0) từ deliveryHistory, chuyển đổi thành real handovers
  let maxId = Math.max(0, ...allHandovers.map((h) => Number(h.id) || 0));

  const nextHandovers = [...allHandovers];

  for (const bItem of targetBatch.items) {
    const h = bItem.handoverItem;
    const update = updatedMap.get(Number(h.id));
    const newPass = update ? Math.max(0, Number(update.quantity_pass) || 0) : bItem.currentQuantityPass;
    const newNote = update && update.note !== undefined ? update.note.trim() : h.note;

    if (Number(h.id) < 0) {
      // Synthetic item: thêm mới vào allHandovers
      maxId++;
      nextHandovers.push({
        id: maxId,
        department: metadata?.department ?? h.department ?? "Phòng Cung ứng",
        item_name: h.item_name,
        unit: h.unit,
        quantity_doc: String(newPass),
        quantity_pass: String(newPass),
        quantity_fail: "0",
        note: newNote,
        handover_date: metadata?.handover_date ?? h.handover_date,
        sender_name: metadata?.sender_name ?? h.sender_name ?? "Trần Hải Hà",
        sender_dept: "Phòng Cung ứng",
        receiver_name: metadata?.receiver_name ?? h.receiver_name ?? "",
        source_type: h.source_type || "PO",
        source_number: po.number,
        specification: h.specification || "",
        po_item_id: h.po_item_id,
        batch_id: batchId,
        batch_number: targetBatch.batchNumber,
      });
    } else {
      // Existing item: cập nhật in place
      const idx = nextHandovers.findIndex((x) => Number(x.id) === Number(h.id));
      if (idx !== -1) {
        nextHandovers[idx] = {
          ...nextHandovers[idx],
          quantity_pass: String(newPass),
          quantity_doc: String(newPass),
          note: newNote,
          handover_date: metadata?.handover_date ?? nextHandovers[idx].handover_date,
          department: metadata?.department ?? nextHandovers[idx].department,
          receiver_name: metadata?.receiver_name ?? nextHandovers[idx].receiver_name,
          sender_name: metadata?.sender_name ?? nextHandovers[idx].sender_name,
          batch_id: nextHandovers[idx].batch_id || batchId,
          batch_number: nextHandovers[idx].batch_number || targetBatch.batchNumber,
        };
      }
    }
  }

  // 4. Tính toán lại trạng thái và số lượng đã giao của từng POItem
  const updatedPoItems = (po.items || []).map((it) => {
    const matchingBatchItem = targetBatch.items.find(
      (bi) => bi.poItemId === it.id || normName(bi.itemName) === normName(it.name)
    );

    // Cập nhật lại deliveryHistory
    let nextHistory = (it.deliveryHistory || []).map((dh) => {
      const isThisBatchLog =
        (dh.batchId && dh.batchId === batchId) ||
        dh.date === targetBatch.date ||
        (targetBatch.date && dh.date === targetBatch.date);

      if (isThisBatchLog && matchingBatchItem) {
        const up = updatedMap.get(Number(matchingBatchItem.handoverItem.id));
        const newQty = up ? Math.max(0, Number(up.quantity_pass) || 0) : matchingBatchItem.currentQuantityPass;
        return {
          ...dh,
          qty: newQty,
          note: up?.note ?? dh.note,
        };
      }
      return dh;
    });

    // Lấy số lượng đã giao từ nextHandovers
    const stat = calcPOItemDeliveryStats(it, po, nextHandovers);

    return {
      ...it,
      deliveredQty: stat.quantityDelivered,
      deliveryStatus: stat.deliveryStatus,
      deliveryHistory: nextHistory,
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

/**
 * HỦY / XÓA MỘT ĐỢT GIAO HÀNG (Dành cho trường hợp ấn nhầm hoặc muốn thu hồi đợt giao)
 * - Xóa sạch các bản ghi PaymentHandoverItem của đợt này
 * - Loại bỏ nhật ký đợt này khỏi deliveryHistory của PO items
 * - Tự động hoàn trả số lượng còn lại cho PO và chuyển lại trạng thái đơn hàng
 */
export function deletePOHandoverBatch(options: {
  po: PO;
  allHandovers: PaymentHandoverItem[];
  batchId: string;
}): {
  updatedPO: PO;
  updatedHandovers: PaymentHandoverItem[];
  deletedBatch?: PODeliveryBatch;
  error?: string;
} {
  const { po, allHandovers, batchId } = options;

  const existingBatches = getPODeliveryBatches(po, allHandovers);
  const targetBatch = existingBatches.find((b) => b.batchId === batchId);

  if (!targetBatch) {
    return {
      updatedPO: po,
      updatedHandovers: allHandovers,
      error: `Không tìm thấy đợt bàn giao mã ${batchId} để hủy!`,
    };
  }

  const cleanPoNum = (po.number || "").trim().toLowerCase();

  // 1. Lọc bỏ các bản ghi của đợt này khỏi allHandovers
  const nextHandovers = allHandovers.filter((h) => {
    const isThisPO = (h.source_number || "").trim().toLowerCase() === cleanPoNum;
    if (!isThisPO) return true;

    // Khớp theo batch_id
    if (h.batch_id && (h.batch_id === batchId || h.batch_id === targetBatch.batchId)) {
      return false;
    }

    // Khớp theo ID nằm trong rawHandovers của đợt này
    if (targetBatch.rawHandovers.some((th) => th.id === h.id)) {
      return false;
    }

    // Khớp theo ngày và thông tin đợt
    if (getHandoverGroupKey(h) === targetBatch.batchId) {
      return false;
    }

    return true;
  });

  // 2. Cập nhật lại từng PO item: xóa khỏi deliveryHistory và tính lại deliveredQty
  const updatedPoItems = (po.items || []).map((it) => {
    // Xóa entry khỏi deliveryHistory khớp theo batchId hoặc ngày đợt này
    const nextHistory = (it.deliveryHistory || []).filter((dh) => {
      if (dh.batchId && (dh.batchId === batchId || dh.batchId === targetBatch.batchId)) {
        return false;
      }
      if (dh.date && dh.date === targetBatch.date) {
        // Kiểm tra xem dòng hàng này có nằm trong targetBatch không
        const isItemInTargetBatch = targetBatch.items.some(
          (bi) => bi.poItemId === it.id || normName(bi.itemName) === normName(it.name)
        );
        if (isItemInTargetBatch) {
          return false;
        }
      }
      return true;
    });

    // Tính toán lại số lượng đã giao
    const stat = calcPOItemDeliveryStats(it, po, nextHandovers);

    let nextDelivered = stat.quantityDelivered;

    // Nếu không còn bản ghi handover nào cho PO này, dùng tổng từ remaining history
    const hasRemainingHandovers = nextHandovers.some(
      (h) => (h.source_number || "").trim().toLowerCase() === cleanPoNum
    );

    if (!hasRemainingHandovers) {
      const historySum = nextHistory.reduce((s, dh) => s + (Number(dh.qty) || 0), 0);
      nextDelivered = Math.min(Number(it.qty) || 0, Math.max(0, historySum));
    }

    const isFullyDeliv = nextDelivered >= (Number(it.qty) || 0) && (Number(it.qty) || 0) > 0;
    const nextDelivStatus = isFullyDeliv
      ? "Đã giao"
      : nextDelivered > 0
      ? "Giao một phần"
      : "Chưa giao";

    return {
      ...it,
      deliveredQty: nextDelivered,
      deliveryStatus: nextDelivStatus as any,
      deliveryHistory: nextHistory,
      deliveryDate: nextDelivered > 0 ? it.deliveryDate : "",
    };
  });

  // 3. Tính toán lại trạng thái tổng thể của PO
  const allDelivered =
    updatedPoItems.length > 0 &&
    updatedPoItems.every((it) => (Number(it.deliveredQty) || 0) >= (Number(it.qty) || 0));

  const someDelivered = updatedPoItems.some((it) => (Number(it.deliveredQty) || 0) > 0);

  let nextPoStatus = po.status;
  if (allDelivered) {
    nextPoStatus = "Đã giao đủ";
  } else if (someDelivered) {
    nextPoStatus = "Đang giao hàng";
  } else {
    // Không còn mặt hàng nào giao -> khôi phục trạng thái đang thực hiện
    nextPoStatus = "Đang thực hiện";
  }

  const updatedPO: PO = {
    ...po,
    items: updatedPoItems,
    status: nextPoStatus,
    isCompleted: allDelivered ? true : false,
  };

  return {
    updatedPO,
    updatedHandovers: nextHandovers,
    deletedBatch: targetBatch,
  };
}
