import test from "node:test";
import assert from "node:assert/strict";

// Import modules
import {
  getPODeliveryBatches,
  updatePOHandoverBatch,
  generateHandoverBatchId,
} from "../app/utils/handoverBatches.js";

// Mock PO
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

// Existing handovers: Đợt 1 (2026-10-20) and Đợt 2 (2026-10-25)
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

  // In Batch 1, for Xi măng:
  // Ordered = 100. Other batches (Batch 2) has delivered 20.
  // maxAllowedInThisBatch = 100 - 20 = 80.
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

test("updatePOHandoverBatch modifies batch quantity and updates PO status", () => {
  // User changes Batch 1 Xi măng from 40 to 60 (total will be 60 + 20 = 80 <= 100)
  const res = updatePOHandoverBatch({
    po: samplePO,
    allHandovers: sampleHandovers,
    batchId: "BATCH_PO001_D1",
    updatedItems: [{ id: 1, quantity_pass: 60, note: "Bàn giao thêm 20 bao" }],
  });

  assert.equal(res.error, undefined, "Không được có lỗi");

  // Check updated handovers
  const updatedH1 = res.updatedHandovers.find((h) => h.id === 1);
  assert.equal(updatedH1.quantity_pass, "60");
  assert.equal(updatedH1.note, "Bàn giao thêm 20 bao");

  // Check updated PO
  const updatedPoItem1 = res.updatedPO.items.find((i) => i.id === 1);
  assert.equal(updatedPoItem1.deliveredQty, 80); // 60 + 20
  assert.equal(updatedPoItem1.deliveryStatus, "Giao một phần");
});

test("updatePOHandoverBatch rejects quantities exceeding PO order limit", () => {
  // In Batch 1, Xi măng maxAllowed is 80 (because Batch 2 has 20 and total PO is 100).
  // If user tries to set 85 (total would be 85 + 20 = 105 > 100), it must fail!
  const res = updatePOHandoverBatch({
    po: samplePO,
    allHandovers: sampleHandovers,
    batchId: "BATCH_PO001_D1",
    updatedItems: [{ id: 1, quantity_pass: 85 }],
  });

  assert.ok(res.error, "Phải báo lỗi khi số lượng vượt quá mức tối đa cho phép");
  assert.match(res.error, /vượt quá số lượng tối đa/i);
});

test("updatePOHandoverBatch completes PO when all items reach 100%", () => {
  // If user sets Batch 1 Xi măng to 80 (80 + 20 = 100 = 100%), and Thép is already 30 + 20 = 50 = 50%
  const res = updatePOHandoverBatch({
    po: samplePO,
    allHandovers: sampleHandovers,
    batchId: "BATCH_PO001_D1",
    updatedItems: [{ id: 1, quantity_pass: 80 }],
  });

  assert.equal(res.error, undefined);
  const it1 = res.updatedPO.items.find((i) => i.id === 1);
  const it2 = res.updatedPO.items.find((i) => i.id === 2);
  assert.equal(it1.deliveredQty, 100);
  assert.equal(it1.deliveryStatus, "Đã giao");
  assert.equal(it2.deliveredQty, 50);
  assert.equal(it2.deliveryStatus, "Đã giao");
  assert.equal(res.updatedPO.status, "Đã giao đủ");
});
