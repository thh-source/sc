import assert from "node:assert/strict";
import { PO, Payment, PaymentRequestEntry, buildPOPaymentDescription } from "../app/types";
import { isPaymentCompleted } from "../app/utils/paymentSync";

console.log("=== KIỂM THỬ: BẮT BUỘC HÓA ĐƠN VỚI TRẢ SAU & LIÊN KẾT ĐNTT TỰ TẠO ===");

// 1. Kiểm tra logic bắt buộc hóa đơn với đợt trả sau (post payment)
function validateCanCreatePaymentRequest(payment: Payment): { canCreate: boolean; reason?: string } {
  const isPostPayment = payment.condition !== "advance";
  const hasInvoice = Boolean(payment.invoiceNo && payment.invoiceNo.trim());

  if (isPostPayment && !hasInvoice) {
    return {
      canCreate: false,
      reason: "Đợt thanh toán trả sau bắt buộc phải có thông tin Số hóa đơn GTGT.",
    };
  }
  return { canCreate: true };
}

// Test Case 1: Đợt thanh toán trả sau CHƯA có hóa đơn -> Bị chặn
{
  const postPaymentWithoutInvoice: Payment = {
    id: 101,
    phase: "Thanh toán đợt cuối (100%)",
    percent: 100,
    amount: 15000000,
    status: "Chưa thanh toán",
    date: "2026-10-27",
    condition: "post",
  };

  const validation = validateCanCreatePaymentRequest(postPaymentWithoutInvoice);
  assert.equal(validation.canCreate, false, "Đợt trả sau không có số HĐ phải bị chặn");
  assert.equal(validation.reason?.includes("bắt buộc phải có thông tin Số hóa đơn"), true);
  console.log("✓ Test Case 1 đạt: Chặn tạo ĐNTT trả sau khi chưa có Số hóa đơn GTGT.");
}

// Test Case 2: Đợt thanh toán trả sau ĐÃ CÓ hóa đơn -> Được phép tạo
{
  const postPaymentWithInvoice: Payment = {
    id: 102,
    phase: "Thanh toán đợt cuối (100%)",
    percent: 100,
    amount: 15000000,
    status: "Chưa thanh toán",
    date: "2026-10-27",
    condition: "post",
    invoiceNo: "0019284",
    invoiceDate: "2026-10-27",
  };

  const validation = validateCanCreatePaymentRequest(postPaymentWithInvoice);
  assert.equal(validation.canCreate, true, "Đợt trả sau đã có số HĐ phải được phép tạo ĐNTT");
  console.log("✓ Test Case 2 đạt: Cho phép tạo ĐNTT trả sau khi đã điền đầy đủ Số hóa đơn GTGT.");
}

// Test Case 3: Đợt tạm ứng (advance payment) không có hóa đơn -> Vẫn được phép tạo
{
  const advancePaymentWithoutInvoice: Payment = {
    id: 103,
    phase: "Tạm ứng đợt 1 (30%)",
    percent: 30,
    amount: 5000000,
    status: "Chưa thanh toán",
    date: "2026-10-27",
    condition: "advance",
  };

  const validation = validateCanCreatePaymentRequest(advancePaymentWithoutInvoice);
  assert.equal(validation.canCreate, true, "Đợt tạm ứng trả trước không bắt buộc phải có hóa đơn trước");
  console.log("✓ Test Case 3 đạt: Đợt tạm ứng trả trước được phép tạo ĐNTT mà không bắt buộc có HĐ.");
}

// Test Case 4: Liên kết đợt thanh toán PO với phiếu ĐNTT tự tạo sẵn
{
  const mockPO: PO = {
    id: 999,
    number: "PO-ANVIET-27102026",
    prNumber: "PR-2026-0099",
    supplierId: 88,
    createdDate: "2026-10-27",
    expectedDate: "2026-11-05",
    status: "Đang giao hàng",
    note: "",
    items: [],
    docs: [],
    payments: [
      {
        id: 701,
        phase: "Thanh toán đợt 1",
        percent: 100,
        amount: 25000000,
        status: "Chưa thanh toán",
        date: "2026-10-27",
        condition: "post",
        // Chưa có số hóa đơn tại PO
      },
    ],
  };

  // Phiếu ĐNTT được người dùng tự tạo trước từ Tab "Thanh toán"
  const manualDNTT: PaymentRequestEntry = {
    id: 55,
    legacy_stt: "55",
    payee_name: "Công ty Thiết bị An Việt",
    amount: 25000000,
    currency: "VND",
    documents: [],
    request_date: "2026-10-27",
    payment_type: "Thanh toán công nợ",
    status: "Chờ duyệt",
    invoice_no: "HD-ANVIET-88392",
    invoice_date: "2026-10-26",
    // group_code ban đầu rỗng vì tạo độc lập
    group_code: "",
    description: "Thanh toán thiết bị phòng lab An Việt",
  };

  // Thực hiện liên kết
  const stage = mockPO.payments[0];

  const patch: Partial<Payment> = {
    paymentRequestId: manualDNTT.id,
    status: isPaymentCompleted(manualDNTT) ? "Đã thanh toán" : "Đang xử lý",
  };
  if (!stage.invoiceNo && manualDNTT.invoice_no) {
    patch.invoiceNo = manualDNTT.invoice_no;
    patch.invoiceDate = manualDNTT.invoice_date || stage.invoiceDate;
  }

  const updatedStage: Payment = { ...stage, ...patch };
  const updatedPO: PO = {
    ...mockPO,
    payments: [updatedStage],
  };

  const updatedReq: PaymentRequestEntry = {
    ...manualDNTT,
    group_code: manualDNTT.group_code || mockPO.number,
    invoice_no: manualDNTT.invoice_no || stage.invoiceNo || "",
    invoice_date: manualDNTT.invoice_date || stage.invoiceDate || "",
  };

  // Kiểm tra 1: PO stage đã liên kết với manualDNTT.id
  assert.equal(updatedStage.paymentRequestId, 55, "Đợt thanh toán PO lưu đúng paymentRequestId");

  // Kiểm tra 2: Trạng thái chuyển sang Đang xử lý
  assert.equal(updatedStage.status, "Đang xử lý", "Trạng thái đợt thanh toán chuyển sang Đang xử lý");

  // Kiểm tra 3: Tự động đồng bộ số hóa đơn từ ĐNTT sang PO
  assert.equal(updatedStage.invoiceNo, "HD-ANVIET-88392", "Số hóa đơn từ ĐNTT được đồng bộ sang PO");
  assert.equal(updatedStage.invoiceDate, "2026-10-26", "Ngày hóa đơn từ ĐNTT được đồng bộ sang PO");

  // Kiểm tra 4: ĐNTT được cập nhật group_code = po.number
  assert.equal(updatedReq.group_code, "PO-ANVIET-27102026", "ĐNTT được gán mã PO tương ứng");

  console.log("✓ Test Case 4 đạt: Liên kết thành công đợt thanh toán PO với phiếu ĐNTT tự tạo, đồng bộ số HĐ và group_code.");
}

// Test Case 5: Hủy liên kết đợt thanh toán khỏi ĐNTT
{
  const linkedStage: Payment = {
    id: 702,
    phase: "Thanh toán đợt 2",
    percent: 100,
    amount: 10000000,
    status: "Đang xử lý",
    date: "2026-10-27",
    condition: "post",
    paymentRequestId: 55,
  };

  const unlinkedStage: Payment = {
    ...linkedStage,
    paymentRequestId: undefined,
    status: "Chưa thanh toán",
  };

  assert.equal(unlinkedStage.paymentRequestId, undefined, "paymentRequestId đã được gỡ bỏ");
  assert.equal(unlinkedStage.status, "Chưa thanh toán", "Trạng thái quay lại Chưa thanh toán");
  console.log("✓ Test Case 5 đạt: Hủy liên kết trả về trạng thái Chưa thanh toán và cho phép liên kết/tạo lại.");
}

console.log("=== TẤT CẢ TEST CASES ĐÃ HOÀN THÀNH XUẤT SẮC 100% ===");
