import test from "node:test";
import assert from "node:assert/strict";

// Import modules
import {
  getPODeliveryBatches,
  updatePOHandoverBatch,
  deletePOHandoverBatch,
  generateHandoverBatchId,
  sortHandoversByPOLineOrder,
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
  const res = deletePOHandoverBatch({
    po: samplePO,
    allHandovers: sampleHandovers,
    batchId: "BATCH_PO001_D2",
  });

  assert.equal(res.error, undefined, "Không được có lỗi khi hủy đợt");
  assert.ok(res.deletedBatch, "Phải trả về thông tin đợt đã xóa");
  assert.equal(res.deletedBatch.batchLabel, "Đợt 2");

  const batch2Items = res.updatedHandovers.filter((h) => h.batch_id === "BATCH_PO001_D2");
  assert.equal(batch2Items.length, 0, "Các item của Đợt 2 phải bị xóa khỏi handovers");
  assert.equal(res.updatedHandovers.length, 2);

  const item1 = res.updatedPO.items.find((i) => i.id === 1);
  assert.equal(item1.deliveredQty, 40);
  assert.equal(item1.deliveryStatus, "Giao một phần");

  const item2 = res.updatedPO.items.find((i) => i.id === 2);
  assert.equal(item2.deliveredQty, 30);
  assert.equal(item2.deliveryStatus, "Giao một phần");

  assert.equal(res.updatedPO.status, "Đang giao hàng");
});

test("deletePOHandoverBatch reverts PO to 'Đang thực hiện' when all deliveries are cancelled", () => {
  const afterB2PO = {
    ...samplePO,
    items: [
      { id: 1, name: "Xi măng", qty: 100, deliveredQty: 40, deliveryStatus: "Giao một phần" },
      { id: 2, name: "Thép", qty: 50, deliveredQty: 30, deliveryStatus: "Giao một phần" },
    ],
  };
  const onlyB1Handovers = sampleHandovers.slice(0, 2);

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

  assert.equal(res.updatedPO.status, "Đang thực hiện");
  assert.equal(res.updatedPO.isCompleted, false);
});

test("sortHandoversByPOLineOrder sorts items strictly by PO line sequence (CHAUGIANG-28102026 test case)", () => {
  // Case described by user:
  // PO CHAUGIANG-28102026 has:
  // 1: Bình định mức thủy tinh nâu 100ml
  // 2: Bình định mức thủy tinh nâu 20ml, isolab
  // 3: Cốc đốt 250ml
  // 4: Chai thủy tinh trắng miệng rộng 250ml
  // 5: Bình tam giác có nút 250ml nhám 29
  const poChauGiang = {
    id: 999,
    number: "CHAUGIANG-28102026",
    items: [
      { id: 101, name: "Bình định mức thủy tinh nâu 100ml", qty: 10 },
      { id: 102, name: "Bình định mức thủy tinh nâu 20ml, isolab", qty: 15 },
      { id: 103, name: "Cốc đốt 250ml", qty: 20 },
      { id: 104, name: "Chai thủy tinh trắng miệng rộng 250ml", qty: 30 },
      { id: 105, name: "Bình tam giác có nút 250ml nhám 29", qty: 25 },
    ],
  };

  // Scrambled handovers in database or from user input:
  const scrambledHandovers = [
    {
      id: 50,
      source_number: "CHAUGIANG-28102026",
      item_name: "Chai thủy tinh trắng miệng rộng 250ml",
      po_item_id: 104,
      quantity_pass: "30",
    },
    {
      id: 51,
      source_number: "CHAUGIANG-28102026",
      item_name: "Bình tam giác có nút 250ml nhám 29",
      po_item_id: 105,
      quantity_pass: "25",
    },
    {
      id: 52,
      source_number: "CHAUGIANG-28102026",
      item_name: "Bình định mức thủy tinh nâu 20ml, isolab",
      po_item_id: 102,
      quantity_pass: "15",
    },
    {
      id: 53,
      source_number: "CHAUGIANG-28102026",
      item_name: "Bình định mức thủy tinh nâu 100ml",
      po_item_id: 101,
      quantity_pass: "10",
    },
  ];

  const sorted = sortHandoversByPOLineOrder(scrambledHandovers, poChauGiang);

  // Verification:
  assert.equal(sorted.length, 4);
  assert.equal(sorted[0].item_name, "Bình định mức thủy tinh nâu 100ml", "Dòng 1 phải là Bình định mức nâu 100ml");
  assert.equal(sorted[1].item_name, "Bình định mức thủy tinh nâu 20ml, isolab", "Dòng 2 phải là Bình định mức nâu 20ml, isolab");
  assert.equal(sorted[2].item_name, "Chai thủy tinh trắng miệng rộng 250ml", "Dòng 3 phải là Chai thủy tinh trắng");
  assert.equal(sorted[3].item_name, "Bình tam giác có nút 250ml nhám 29", "Dòng 4 phải là Bình tam giác có nút 250ml");

  // Also test matching by item name when po_item_id is missing (legacy records)
  const legacyWithoutPoItemId = [
    { id: 60, source_number: "CHAUGIANG-28102026", item_name: "Bình tam giác có nút 250ml nhám 29" },
    { id: 61, source_number: "CHAUGIANG-28102026", item_name: "Bình định mức thủy tinh nâu 100ml" },
  ];
  const sortedLegacy = sortHandoversByPOLineOrder(legacyWithoutPoItemId, poChauGiang);
  assert.equal(sortedLegacy[0].item_name, "Bình định mức thủy tinh nâu 100ml");
  assert.equal(sortedLegacy[1].item_name, "Bình tam giác có nút 250ml nhám 29");
});
