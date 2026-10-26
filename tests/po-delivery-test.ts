import assert from "node:assert/strict";
import { PO, PaymentHandoverItem } from "../app/types";
import { calcPODeliveryStats, calcPOItemDeliveryStats } from "../app/utils/paymentSync";

console.log("--- BẮT ĐẦU KIỂM THỬ NGHIỆP VỤ BÀN GIAO THEO ĐỢT & CHỐNG GIAO VƯỢT QUÁ ---");

// 1. Tạo 1 PO có 2 mặt hàng (Món A: số lượng 10; Món B: số lượng 5)
const testPO: PO = {
  id: 101,
  number: "PO-TEST-001",
  prNumber: "PR-2026-001",
  supplierId: 1,
  createdDate: "2026-10-26",
  expectedDate: "2026-10-30",
  status: "Đang xử lý",
  items: [
    {
      id: 1,
      code: "ITEM-A",
      name: "Hóa chất Món A",
      spec: "Chai 1L",
      unit: "Chai",
      qty: 10,
      price: 100000,
      deliveryStatus: "Chưa giao",
      deliveredQty: 0,
      deliveryDate: "",
    },
    {
      id: 2,
      code: "ITEM-B",
      name: "Vật tư Món B",
      spec: "Hộp 10 cái",
      unit: "Hộp",
      qty: 5,
      price: 200000,
      deliveryStatus: "Chưa giao",
      deliveredQty: 0,
      deliveryDate: "",
    },
  ],
  docs: [],
  payments: [],
  note: "",
};

let paymentHandovers: PaymentHandoverItem[] = [];

// Kiểm tra ban đầu:
console.log("\n[Bước 1] Kiểm tra ban đầu trước khi bàn giao:");
let stats = calcPODeliveryStats(testPO, paymentHandovers);
assert.equal(stats.isFullyDelivered, false, "PO ban đầu chưa được hoàn thành");
assert.equal(stats.totalQuantityOrdered, 15, "Tổng SL đặt phải là 15");
assert.equal(stats.totalQuantityDelivered, 0, "Tổng SL đã giao ban đầu phải là 0");
assert.equal(stats.totalQuantityRemaining, 15, "Tổng SL còn thiếu ban đầu phải là 15");
assert.equal(stats.itemsStats[1].quantityRemaining, 10, "Món A còn thiếu 10");
assert.equal(stats.itemsStats[2].quantityRemaining, 5, "Món B còn thiếu 5");
console.log("✓ Bước 1 đạt chuẩn: Món A còn 10, Món B còn 5, PO chưa giao.");

// 2. Lần 1: Bàn giao 6 Món A và 5 Món B
console.log("\n[Bước 2] Thực hiện bàn giao Lần 1: 6 Món A và 5 Món B:");
const handover1: PaymentHandoverItem = {
  id: 1,
  department: "Phòng Cung ứng",
  item_name: "Hóa chất Món A",
  unit: "Chai",
  quantity_doc: 6,
  quantity_pass: 6,
  quantity_fail: 0,
  note: "Giao đợt 1",
  handover_date: "2026-10-26",
  source_type: "PO",
  source_number: "PO-TEST-001",
  po_item_id: 1,
};

const handover2: PaymentHandoverItem = {
  id: 2,
  department: "Phòng Cung ứng",
  item_name: "Vật tư Món B",
  unit: "Hộp",
  quantity_doc: 5,
  quantity_pass: 5,
  quantity_fail: 0,
  note: "Giao đủ đợt 1",
  handover_date: "2026-10-26",
  source_type: "PO",
  source_number: "PO-TEST-001",
  po_item_id: 2,
};

paymentHandovers.push(handover1, handover2);

stats = calcPODeliveryStats(testPO, paymentHandovers);
assert.equal(stats.isFullyDelivered, false, "PO sau lần 1 chưa giao đủ (Món A còn thiếu)");
assert.equal(stats.totalQuantityDelivered, 11, "Tổng SL đã giao sau lần 1 phải là 6+5=11");
assert.equal(stats.totalQuantityRemaining, 4, "Tổng SL còn thiếu sau lần 1 phải là 4");
assert.equal(stats.itemsStats[1].quantityDelivered, 6, "Món A đã giao 6");
assert.equal(stats.itemsStats[1].quantityRemaining, 4, "Món A còn thiếu 4");
assert.equal(stats.itemsStats[1].isFullyDelivered, false, "Món A chưa giao đủ");
assert.equal(stats.itemsStats[2].quantityDelivered, 5, "Món B đã giao 5");
assert.equal(stats.itemsStats[2].quantityRemaining, 0, "Món B còn lại 0");
assert.equal(stats.itemsStats[2].isFullyDelivered, true, "Món B đã giao đủ 100%");
console.log("✓ Bước 2 đạt chuẩn: Món A đã giao 6 (còn 4). Món B đã giao đủ 5 (còn 0, hoàn tất 100%).");

// 3. Lần 2: Bấm bàn giao Lần 2 từ PO đó
console.log("\n[Bước 3] Kiểm tra điều kiện khi mở Modal Bàn giao Lần 2:");
// Kiểm tra Món B không được giao thêm:
assert.equal(stats.itemsStats[2].quantityRemaining, 0, "Món B remaining = 0 => không được chọn giao thêm!");
// Món A chỉ được giao tối đa 4:
assert.equal(stats.itemsStats[1].quantityRemaining, 4, "Món A chỉ được giao tối đa 4 sản phẩm còn lại!");

console.log("Thực hiện bàn giao nốt 4 Món A:");
const handover3: PaymentHandoverItem = {
  id: 3,
  department: "Phòng Cung ứng",
  item_name: "Hóa chất Món A",
  unit: "Chai",
  quantity_doc: 4,
  quantity_pass: 4,
  quantity_fail: 0,
  note: "Giao nốt đợt 2",
  handover_date: "2026-10-26",
  source_type: "PO",
  source_number: "PO-TEST-001",
  po_item_id: 1,
};

paymentHandovers.push(handover3);

// 4. Sau khi giao nốt 4 Món A:
console.log("\n[Bước 4] Kiểm tra trạng thái PO sau khi giao nốt 4 Món A:");
stats = calcPODeliveryStats(testPO, paymentHandovers);
assert.equal(stats.isFullyDelivered, true, "PO bây giờ PHẢI là Đã giao đủ 100%!");
assert.equal(stats.totalQuantityDelivered, 15, "Tổng SL đã giao phải là 15");
assert.equal(stats.totalQuantityRemaining, 0, "Tổng SL còn lại phải là 0");
assert.equal(stats.overallProgressPercent, 100, "Tiến độ phải là 100%");
assert.equal(stats.itemsStats[1].isFullyDelivered, true, "Món A đã giao đủ 100%");
assert.equal(stats.itemsStats[2].isFullyDelivered, true, "Món B đã giao đủ 100%");
console.log("✓ Bước 4 đạt chuẩn: PO chuyển sang trạng thái Đã giao đủ (100%), không còn mặt hàng thiếu.");

// 5. Kiểm tra chống giao vượt quá (Chống spam/trùng lặp):
console.log("\n[Bước 5] Kiểm tra cơ chế chống giao vượt quá (Clamping):");
const extraHandover: PaymentHandoverItem = {
  id: 4,
  department: "Phòng Cung ứng",
  item_name: "Hóa chất Món A",
  unit: "Chai",
  quantity_doc: 10,
  quantity_pass: 10, // Cố tình thêm thừa
  quantity_fail: 0,
  note: "Cố tình tạo thừa",
  handover_date: "2026-10-26",
  source_type: "PO",
  source_number: "PO-TEST-001",
  po_item_id: 1,
};
const spammedHandovers = [...paymentHandovers, extraHandover];
const clampedStats = calcPODeliveryStats(testPO, spammedHandovers);
assert.equal(clampedStats.itemsStats[1].quantityDelivered, 10, "Số lượng đã giao bị giới hạn tối đa bằng 10, không bị đội lên 20!");
assert.equal(clampedStats.itemsStats[1].quantityRemaining, 0, "Số lượng còn lại vẫn là 0!");
assert.equal(clampedStats.isFullyDelivered, true, "PO vẫn được khóa ở trạng thái hoàn thành 100%!");
console.log("✓ Bước 5 đạt chuẩn: Cơ chế Clamping hoạt động hoàn hảo, chặn đứng mọi rủi ro số lượng bị đội lên.");

console.log("\n=======================================================");
console.log("🎉 TẤT CẢ 5 BƯỚC KIỂM THỬ ĐÃ THÀNH CÔNG RỰC RỠ 100%!");
console.log("=======================================================");
