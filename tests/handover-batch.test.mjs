import test from "node:test";
import assert from "node:assert/strict";

// Import modules
import {
  getPODeliveryBatches,
  updatePOHandoverBatch,
  deletePOHandoverBatch,
  generateHandoverBatchId,
} from "../app/utils/handoverBatches.js";

// Mock PO with both items delivered in 2 batches
const samplePO = {
  id: 101,
  number: "PO-2026-001",
  status: "Đang giao hàng",
  items: [
    {
      id: 1,
      name: "Xi măng Vicem Hà Tiên",
      qty: 100,
      deliveredQty: 60,
      deliveryStatus: "Giao một phần",
      unit: "Bao",
      price: 90000,
      deliveryDate: "2026-10-25",
    },
    {
      id: 2,
      name: "Thép Hòa Phát phi 10",
      qty: 50,
      deliveredQty: 50,
      deliveryStatus: "Đã giao",
      unit: "Cây",
      price: 150000,
      deliveryDate: "2026-10-25",
    },
  ],
};

const sampleHandovers = [
  // Đợt 1: Xi măng 40, Thép 30
  {
    id: 1,
    source_number: "PO-2026-001",
    department: "Phòng Xây Dựng",
    item_name: "Xi măng Vicem Hà Tiên",
    unit: "Bao",
    quantity_doc: "40",
    quantity_pass: "40",
    quantity_fail: "0",
    handover_date: "2026-10-20",
    receiver_name: "Nguyễn Văn A",
    sender_name: "Trần Hải Hà",
    po_item_id: 1,
    batch_id: "BATCH_PO001_D1",
    batch_number: 1,
  },
  {
    id: 2,
    source_number: "PO-2026-001",
    department: "Phòng Xây Dựng",
    item_name: "Thép Hòa Phát phi 10",
    unit: "Cây",
    quantity_doc: "30",
    quantity_pass: "30",
    quantity_fail: "0",
    handover_date: "2026-10-20",
    receiver_name: "Nguyễn Văn A",
    sender_name: "Trần Hải Hà",
    po_item_id: 2,
    batch_id: "BATCH_PO001_D1",
    batch_number: 1,
  },
  // Đợt 2: Xi măng 20, Thép 20
  {
    id: 3,
    source_number: "PO-2026-001",
    department: "Phòng Kỹ Thuật",
    item_name: "Xi măng Vicem Hà Tiên",
    unit: "Bao",
    quantity_doc: "20",
    quantity_pass: "20",
    quantity_fail: "0",
    handover_date: "2026-10-25",
    receiver_name: "Lê Văn B",
    sender_name: "Trần Hải Hà",
    po_item_id: 1,
    batch_id: "BATCH_PO001_D2",
    batch_number: 2,
  },
  {
    id: 4,
    source_number: "PO-2026-001",
    department: "Phòng Kỹ Thuật",
    item_name: "Thép Hòa Phát phi 10",
    unit: "Cây",
    quantity_doc: "20",
    quantity_pass: "20",
    quantity_fail: "0",
    handover_date: "2026-10-25",
    receiver_name: "Lê Văn B",
    sender_name: "Trần Hải Hà",
    po_item_id: 2,
    batch_id: "BATCH_PO001_D2",
    batch_number: 2,
  },
];

test("getPODeliveryBatches groups into Đợt 1 and Đợt 2 with accurate stats", () => {
  const batches = getPODeliveryBatches(samplePO, sampleHandovers);

  assert.equal(batches.length, 2, "Phải có đúng 2 đợt bàn giao");

  // Check Batch 1
  const b1 = batches[0];
  assert.equal(b1.batchNumber, 1);
  assert.equal(b1.batchLabel, "Đợt 1");
  assert.equal(b1.date, "2026-10-20");
  assert.equal(b1.receiverName, "Nguyễn Văn A");
  assert.equal(b1.totalQuantity, 70); // 40 + 30
  assert.equal(b1.itemCount, 2);

  const b1Xm = b1.items.find((i) => i.poItemId === 1);
  assert.ok(b1Xm);
  assert.equal(b1Xm.quantityOrdered, 100);
  assert.equal(b1Xm.deliveredFromOtherBatches, 20);
  assert.equal(b1Xm.maxAllowedInThisBatch, 80);
  assert.equal(b1Xm.currentQuantityPass, 40);

  // Check Batch 2
  const b2 = batches[1];
  assert.equal(b2.batchNumber, 2);
  assert.equal(b2.batchLabel, "Đợt 2");
  assert.equal(b2.date, "2026-10-25");
  assert.equal(b2.receiverName, "Lê Văn B");
  assert.equal(b2.totalQuantity, 40); // 20 + 20
});

test("getPODeliveryBatches automatically discovers batches from deliveryHistory when paymentHandovers is empty", () => {
  const poFromDeliveryModal = {
    id: 202,
    number: "PO-2026-MODAL",
    status: "Đang giao hàng",
    items: [
      {
        id: 11,
        name: "Cáp điện Cadivi",
        qty: 50,
        deliveredQty: 20,
        deliveryStatus: "Giao một phần",
        unit: "Mét",
        deliveryHistory: [
          {
            date: "2026-10-26",
            qty: 20,
            note: "Giao đợt 1 tại công trường",
            receiverName: "Kỹ sư C",
          },
        ],
      },
    ],
  };

  // paymentHandovers is completely empty!
  const batches = getPODeliveryBatches(poFromDeliveryModal, []);

  assert.equal(batches.length, 1, "Phải tự động phát hiện được 1 đợt từ deliveryHistory");
  assert.equal(batches[0].batchLabel, "Đợt 1");
  assert.equal(batches[0].date, "2026-10-26");
  assert.equal(batches[0].receiverName, "Kỹ sư C");
  assert.equal(batches[0].totalQuantity, 20);
  assert.equal(batches[0].items[0].currentQuantityPass, 20);
  assert.equal(batches[0].items[0].isSynthetic, true);
});

test("updatePOHandoverBatch modifies batch quantity and updates PO status", () => {
  const res = updatePOHandoverBatch({
    po: samplePO,
    allHandovers: sampleHandovers,
    batchId: "BATCH_PO001_D1",
    updatedItems: [{ id: 1, quantity_pass: 60, note: "Bàn giao thêm 20 bao" }],
  });

  assert.equal(res.error, undefined, "Không được có lỗi");

  const updatedH1 = res.updatedHandovers.find((h) => h.id === 1);
  assert.equal(updatedH1.quantity_pass, "60");
  assert.equal(updatedH1.note, "Bàn giao thêm 20 bao");

  const updatedPoItem1 = res.updatedPO.items.find((i) => i.id === 1);
  assert.equal(updatedPoItem1.deliveredQty, 80); // 60 + 20
  assert.equal(updatedPoItem1.deliveryStatus, "Giao một phần");
});

test("deletePOHandoverBatch cancels mistaken batch and returns quantities to PO", () => {
  // Let's cancel Batch 2 (BATCH_PO001_D2: Xi măng 20, Thép 20)
  const res = deletePOHandoverBatch({
    po: samplePO,
    allHandovers: sampleHandovers,
    batchId: "BATCH_PO001_D2",
  });

  assert.equal(res.error, undefined, "Không được có lỗi khi hủy đợt");
  assert.ok(res.deletedBatch, "Phải trả về thông tin đợt đã xóa");
  assert.equal(res.deletedBatch.batchLabel, "Đợt 2");

  // Batch 2 should be gone from handovers
  const batch2Items = res.updatedHandovers.filter((h) => h.batch_id === "BATCH_PO001_D2");
  assert.equal(batch2Items.length, 0, "Các item của Đợt 2 phải bị xóa khỏi handovers");

  // Remaining handovers should only have Batch 1
  assert.equal(res.updatedHandovers.length, 2);

  // In PO items:
  // Xi măng was 40 (Batch 1) + 20 (Batch 2). Now after cancelling Batch 2, it must be 40!
  const item1 = res.updatedPO.items.find((i) => i.id === 1);
  assert.equal(item1.deliveredQty, 40);
  assert.equal(item1.deliveryStatus, "Giao một phần");

  // Thép was 30 (Batch 1) + 20 (Batch 2). Now after cancelling Batch 2, it must be 30!
  const item2 = res.updatedPO.items.find((i) => i.id === 2);
  assert.equal(item2.deliveredQty, 30);
  assert.equal(item2.deliveryStatus, "Giao một phần");

  // PO status should remain "Đang giao hàng" because Batch 1 still delivered part
  assert.equal(res.updatedPO.status, "Đang giao hàng");
});

test("deletePOHandoverBatch reverts PO to 'Đang thực hiện' when all deliveries are cancelled", () => {
  // Now cancel the remaining Batch 1
  const afterB2PO = {
    ...samplePO,
    items: [
      { id: 1, name: "Xi măng", qty: 100, deliveredQty: 40, deliveryStatus: "Giao một phần" },
      { id: 2, name: "Thép", qty: 50, deliveredQty: 30, deliveryStatus: "Giao một phần" },
    ],
  };
  const onlyB1Handovers = sampleHandovers.slice(0, 2); // Only batch 1

  const res = deletePOHandoverBatch({
    po: afterB2PO,
    allHandovers: onlyB1Handovers,
    batchId: "BATCH_PO001_D1",
  });

  assert.equal(res.error, undefined);
  assert.equal(res.updatedHandovers.length, 0);

  const it1 = res.updatedPO.items.find((i) => i.id === 1);
  const it2 = res.updatedPO.items.find((i) => i.id === 2);
  assert.equal(it1.deliveredQty, 0);
  assert.equal(it1.deliveryStatus, "Chưa giao");
  assert.equal(it2.deliveredQty, 0);
  assert.equal(it2.deliveryStatus, "Chưa giao");

  // All deliveries cancelled -> PO status reverts to "Đang thực hiện"
  assert.equal(res.updatedPO.status, "Đang thực hiện");
  assert.equal(res.updatedPO.isCompleted, false);
});
