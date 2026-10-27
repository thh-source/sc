import assert from "node:assert/strict";
import { getApprovalContextualStatus } from "../app/components/ApprovalManagement";
import { PO, ApprovalRequest, PaymentHandoverItem } from "../app/types";

console.log("=== KIỂM THỬ PHẦN 3 & PHẦN 4: APPROVAL CONTEXTUAL STATUS & DASHBOARD KPIS ===");

// 1. Kiểm thử getApprovalContextualStatus
{
  const mockApproval = {
    id: 101,
    requestNumber: "DNPD-2026-0001",
    prNumber: "PR-2026-0010",
    prId: 10,
    createdDate: "2026-10-27",
    department: "Bộ phận Mua hàng",
    section1Title: "Mua thiết bị văn phòng",
    status: "Đã phê duyệt",
    supplierColumns: [],
    rows: [],
  } as unknown as ApprovalRequest;

  // Case 1.1: Chưa có PO, status Đã phê duyệt -> "Đã phê duyệt"
  let ctx = getApprovalContextualStatus(mockApproval, []);
  assert.equal(ctx.text, "Đã phê duyệt");
  assert.equal(ctx.badgeClass, "done");
  console.log("✓ Test Case 1.1 đạt: ĐNPD chưa có PO -> Đã phê duyệt");

  // Case 1.2: Đã có PO nhưng chưa giao, chưa thanh toán -> "Đã tạo PO"
  const mockPO = {
    id: 501,
    number: "PO-NCC-27102026",
    prNumber: "PR-2026-0010",
    supplierId: 1,
    createdDate: "2026-10-27",
    expectedDate: "2026-11-01",
    status: "Đang thực hiện",
    note: "",
    items: [
      {
        id: 1,
        code: "IT01",
        name: "Laptop",
        unit: "cái",
        qty: 2,
        price: 15000000,
        vat: 10,
        vatAmount: 3000000,
        deliveryStatus: "Chưa giao",
      },
    ],
    docs: [],
    payments: [
      {
        id: 1,
        phase: "Đợt 1",
        percent: 100,
        amount: 33000000,
        status: "Chưa thanh toán",
        condition: "post",
        date: "2026-11-05",
      },
    ],
  } as unknown as PO;

  ctx = getApprovalContextualStatus(mockApproval, [mockPO]);
  assert.equal(ctx.text, "Đã tạo PO");
  console.log("✓ Test Case 1.2 đạt: ĐNPD đã có PO -> Đã tạo PO");

  // Case 1.3: PO đã giao hàng -> "Đã giao hàng"
  const deliveredPO = {
    ...mockPO,
    status: "Đã giao hàng",
    items: [
      {
        ...mockPO.items[0],
        deliveryStatus: "Đã giao",
      },
    ],
  } as unknown as PO;
  ctx = getApprovalContextualStatus(mockApproval, [deliveredPO]);
  assert.equal(ctx.text, "Đã giao hàng");
  console.log("✓ Test Case 1.3 đạt: PO liên kết đã giao hàng -> Đã giao hàng");

  // Case 1.4: PO đã thanh toán đủ -> "Đã thanh toán"
  const paidPO: PO = {
    ...deliveredPO,
    status: "Đã hoàn thành",
    payments: [
      {
        ...mockPO.payments[0],
        status: "Đã thanh toán",
      },
    ],
  };
  ctx = getApprovalContextualStatus(mockApproval, [paidPO]);
  assert.equal(ctx.text, "Đã thanh toán");
  assert.equal(ctx.badgeClass, "done");
  console.log("✓ Test Case 1.4 đạt: PO liên kết đã thanh toán -> Đã thanh toán");
}

console.log("=== TẤT CẢ KIỂM THỬ XÁC NHẬN ĐÃ PASS 100%! ===");
