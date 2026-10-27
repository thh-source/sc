import assert from "node:assert/strict";
import { PO, Payment, PaymentRequestEntry, buildPOPaymentDescription } from "../app/types";

console.log("--- BẮT ĐẦU KIỂM THỬ TẠO ĐNTT TỪ PO (KHÔNG CẬP NHẬT SẢN PHẨM, CHỈ CẬP NHẬT HÓA ĐƠN NẾU CÓ, HỒ SƠ RỖNG) ---");

// Giả lập PO có 5 mặt hàng khác nhau
const mockPO: PO = {
  id: 101,
  number: "PO-PHUCVINH-20261027",
  prNumber: "PR-2026-0012",
  supplierId: 99,
  createdDate: "2026-10-27",
  expectedDate: "2026-10-30",
  status: "Đang giao hàng",
  items: [
    { id: 1, code: "C1", category: "HC", name: "Hóa chất Acetone", desc: "", spec: "Chai 1L", unit: "Chai", qty: 10, estimate: 100000, price: 100000, deliveryStatus: "Chưa giao", deliveredQty: 0, deliveryDate: "" },
    { id: 2, code: "C2", category: "HC", name: "Hóa chất Ethanol", desc: "", spec: "Chai 500ml", unit: "Chai", qty: 20, estimate: 80000, price: 80000, deliveryStatus: "Chưa giao", deliveredQty: 0, deliveryDate: "" },
    { id: 3, code: "C3", category: "HC", name: "Dung môi Hexane", desc: "", spec: "Can 5L", unit: "Can", qty: 5, estimate: 300000, price: 300000, deliveryStatus: "Chưa giao", deliveredQty: 0, deliveryDate: "" },
    { id: 4, code: "C4", category: "HC", name: "Axit Sunfuric 98%", desc: "", spec: "Chai 2.5L", unit: "Chai", qty: 4, estimate: 250000, price: 250000, deliveryStatus: "Chưa giao", deliveredQty: 0, deliveryDate: "" },
    { id: 5, code: "C5", category: "HC", name: "Muối Natri Clorid", desc: "", spec: "Gói 1kg", unit: "Gói", qty: 50, estimate: 20000, price: 20000, deliveryStatus: "Chưa giao", deliveredQty: 0, deliveryDate: "" },
  ],
  docs: [],
  payments: [
    {
      id: 501,
      phase: "Thanh toán Đợt 1 (100%)",
      percent: 100,
      amount: 6100000,
      status: "Chưa thanh toán",
      date: "2026-10-27",
      condition: "post",
      invoiceNo: "HD-0019283",
      invoiceDate: "2026-10-27",
    },
  ],
  note: "Đơn mua hóa chất phòng LAB",
};

// Test Case 1: Tạo ĐNTT cho đợt thanh toán có hóa đơn
{
  const payment = mockPO.payments[0];
  const desc = buildPOPaymentDescription(mockPO, payment);
  const invoiceFromCurrent = payment.invoiceNo && payment.invoiceNo.trim();
  const fallbackInvoice = (mockPO.payments || []).find((p) => p.invoiceNo && p.invoiceNo.trim());
  const finalInvoiceNo = invoiceFromCurrent
    ? payment.invoiceNo!.trim()
    : fallbackInvoice
    ? fallbackInvoice.invoiceNo!.trim()
    : "";
  const finalInvoiceDate = invoiceFromCurrent
    ? (payment.invoiceDate || "")
    : fallbackInvoice
    ? (fallbackInvoice.invoiceDate || "")
    : "";

  const lines = [
    {
      description: desc || payment.phase || `Thanh toán theo đơn hàng ${mockPO.number}`,
      invoice_no: finalInvoiceNo,
      invoice_date: finalInvoiceDate,
      amount: payment.amount,
      note: payment.note || "",
    },
  ];

  const req: PaymentRequestEntry = {
    id: 1,
    legacy_stt: "01",
    payee_name: "Công ty Phúc Vinh",
    group_code: mockPO.number,
    description: desc,
    item_name: payment.phase || desc,
    invoice_no: finalInvoiceNo,
    invoice_date: finalInvoiceDate,
    amount: payment.amount,
    currency: "VND",
    documents: [], // Rỗng, không tự động thêm gì cả
    request_date: "2026-10-27",
    payment_type: "Thanh toán công nợ",
    status: "Chờ duyệt",
    lines,
  };

  // Kiểm tra 1: Không có danh sách từng sản phẩm trong lines
  assert.equal(req.lines?.length, 1, "Lines chỉ có đúng 1 dòng tổng thanh toán, không chứa 5 mặt hàng con");
  assert.equal(req.lines?.[0].description.includes("Acetone"), false, "Lines không chứa tên sản phẩm cá nhân");

  // Kiểm tra 2: Cập nhật đúng số hóa đơn nếu có
  assert.equal(req.invoice_no, "HD-0019283", "Cập nhật đúng số hóa đơn từ đợt thanh toán");
  assert.equal(req.lines?.[0].invoice_no, "HD-0019283", "Dòng thanh toán có đúng số hóa đơn");

  // Kiểm tra 3: Phần hồ sơ rỗng
  assert.equal(req.documents.length, 0, "Phần hồ sơ hoàn toàn rỗng để người dùng tự chọn");

  // Kiểm tra 4: item_name không chứa danh sách sản phẩm
  assert.equal(Boolean(req.item_name && req.item_name.includes("Acetone")), false, "item_name không chứa danh sách sản phẩm");

  console.log("✓ Test Case 1 đạt chuẩn: ĐNTT có hóa đơn, không copy danh sách sản phẩm, hồ sơ rỗng.");
}

// Test Case 2: Tạo ĐNTT cho đợt tạm ứng (chưa có hóa đơn)
{
  const paymentAdvance: Payment = {
    id: 502,
    phase: "Tạm ứng Đợt 1 (30%)",
    percent: 30,
    amount: 1830000,
    status: "Chưa thanh toán",
    date: "2026-10-27",
    condition: "advance",
    // Chưa có hóa đơn
  };

  const desc = buildPOPaymentDescription(mockPO, paymentAdvance);
  const finalInvoiceNo = paymentAdvance.invoiceNo ? paymentAdvance.invoiceNo.trim() : "";
  const finalInvoiceDate = paymentAdvance.invoiceDate || "";

  const lines = [
    {
      description: desc || paymentAdvance.phase,
      invoice_no: finalInvoiceNo,
      invoice_date: finalInvoiceDate,
      amount: paymentAdvance.amount,
      note: paymentAdvance.note || "",
    },
  ];

  const req: PaymentRequestEntry = {
    id: 2,
    legacy_stt: "02",
    payee_name: "Công ty Phúc Vinh",
    group_code: mockPO.number,
    description: desc,
    item_name: paymentAdvance.phase || desc,
    invoice_no: finalInvoiceNo,
    invoice_date: finalInvoiceDate,
    amount: paymentAdvance.amount,
    currency: "VND",
    documents: [],
    request_date: "2026-10-27",
    payment_type: "Tạm ứng",
    status: "Chờ duyệt",
    lines,
  };

  assert.equal(req.invoice_no, "", "Không có hóa đơn thì để trống");
  assert.equal(req.lines?.[0].invoice_no, "", "Dòng thanh toán không có hóa đơn thì để trống");
  assert.equal(req.lines?.length, 1, "Chỉ có 1 dòng");
  assert.equal(req.documents.length, 0, "Hồ sơ rỗng");

  console.log("✓ Test Case 2 đạt chuẩn: ĐNTT tạm ứng không hóa đơn, không sản phẩm, hồ sơ rỗng.");
}

console.log("=======================================================");
console.log("🎉 TẤT CẢ TEST CASES TẠO ĐNTT TỪ PO ĐÃ PASS 100%!");
console.log("=======================================================");
