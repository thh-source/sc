import test from "node:test";
import assert from "node:assert/strict";

import { generateShortName } from "../app/utils/format.js";
import {
  createManualApproval,
  createApprovalFromPR,
  createApprovalFromCompare,
} from "../app/utils/approvalSamples.js";

const mockSuppliers = [
  {
    id: 101,
    code: "NCC-001",
    name: "CÔNG TY TNHH THIẾT BỊ KHOA HỌC KỸ THUẬT CHÂU GIANG",
    shortName: "",
    bankAccount: "123456",
    bank: "VCB",
    address: "Hà Nội",
    contact: "A",
    phone: "0901234567",
  },
  {
    id: 102,
    code: "NCC-002",
    name: "CÔNG TY CỔ PHẦN VẬT TƯ NAM ANH",
    shortName: "Nam Anh",
    bankAccount: "654321",
    bank: "TCB",
    address: "Hà Nội",
    contact: "B",
    phone: "0907654321",
  },
  {
    id: 103,
    code: "NCC-003",
    name: "CÔNG TY TNHH MINOX VIỆT NAM",
    shortName: "Minox",
    bankAccount: "999999",
    bank: "BIDV",
    address: "Bắc Ninh",
    contact: "C",
    phone: "0909999999",
  },
];

test("generateShortName trích xuất chính xác tên viết tắt không bị dính chữ công ty, thiết bị, vật tư", () => {
  assert.equal(
    generateShortName("CÔNG TY TNHH THIẾT BỊ KHOA HỌC KỸ THUẬT CHÂU GIANG"),
    "CHÂU GIANG"
  );
  assert.equal(
    generateShortName("CÔNG TY CỔ PHẦN VẬT TƯ NAM ANH"),
    "NAM ANH"
  );
  assert.equal(
    generateShortName("CÔNG TY TNHH MINOX VIỆT NAM"),
    "MINOX"
  );
});

test("createManualApproval: Tuyệt đối không tự ý bịa số PR giả định, nếu không có PR thì để trống", () => {
  const manualAppr = createManualApproval(5, mockSuppliers);

  // Số PR phải để trống
  assert.equal(manualAppr.prNumber, "");
  // Căn cứ theo PR số phải để trống
  assert.equal(manualAppr.noteRef, "");
  // Mã phiếu ĐNPD tăng dần chuẩn ĐNPD-xxx, không chứa chuỗi PR bịa
  assert.match(manualAppr.requestNumber, /^ĐNPD-\d{3}$/);
  assert.doesNotMatch(manualAppr.requestNumber, /PR2603/);
  assert.doesNotMatch(manualAppr.prNumber, /PR/);
});

test("createManualApproval: Cột phía trên ghi tên viết tắt, đề xuất phía dưới ghi tên đầy đủ", () => {
  const manualAppr = createManualApproval(0, mockSuppliers);

  // Cột 1 phía trên: ghi tên viết tắt
  assert.equal(manualAppr.supplierColumns[0].shortName, "CHÂU GIANG");
  // Tên pháp nhân đầy đủ của cột 1
  assert.equal(
    manualAppr.supplierColumns[0].supplierName,
    "CÔNG TY TNHH THIẾT BỊ KHOA HỌC KỸ THUẬT CHÂU GIANG"
  );

  // Đề xuất phía dưới: ghi tên đầy đủ của nhà cung cấp được chọn
  assert.equal(
    manualAppr.recommendedSupplierName,
    "CÔNG TY TNHH THIẾT BỊ KHOA HỌC KỸ THUẬT CHÂU GIANG"
  );
});

test("createApprovalFromPR: Giữ đúng số PR thực tế của yêu cầu mua sắm", () => {
  const mockPR = {
    id: 1,
    number: "PR-2026-088",
    department: "Phòng Kiểm nghiệm",
    createdDate: "28/10/2026",
    status: "Đã duyệt",
    items: [
      { id: 1, name: "Bình định mức", spec: "100ml", unit: "Cái", qty: 10, estimate: 100000 },
    ],
  };

  const apprFromPR = createApprovalFromPR(mockPR, mockSuppliers, 1);
  assert.equal(apprFromPR.prNumber, "PR-2026-088");
  assert.equal(apprFromPR.noteRef, "PR-2026-088");

  // Header cột so sánh phía trên: Tên viết tắt
  assert.equal(apprFromPR.supplierColumns[0].shortName, "CHÂU GIANG");
  // Phần đề xuất phía dưới: Tên đầy đủ
  assert.equal(
    apprFromPR.recommendedSupplierName,
    "CÔNG TY TNHH THIẾT BỊ KHOA HỌC KỸ THUẬT CHÂU GIANG"
  );
});
