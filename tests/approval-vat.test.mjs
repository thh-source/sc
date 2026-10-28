import assert from "node:assert";
import test from "node:test";

// Mock helper functions based on ApprovalManagement.tsx
function computeSupplierTotal(req, colId) {
  let sum = 0;
  req.rows.forEach((row) => {
    const lines = row.supplierQuotes[colId] || [];
    lines.forEach((line) => {
      const effQty = Number(line.qty) || Number(row.qty) || 0;
      const unitPrice = Number(line.unitPrice) || 0;
      const amt = unitPrice > 0 ? unitPrice * effQty : Number(line.amount) || 0;
      sum += amt;
    });
  });
  return sum;
}

function computeSupplierVatAmount(req, colId) {
  if (req.vatMode !== "with_vat") return 0;
  if (req.vatCalculationType === "already_included") return 0;
  const rate = req.vatRate !== undefined ? req.vatRate : 10;
  const subtotal = computeSupplierTotal(req, colId);
  return Math.round(subtotal * (rate / 100));
}

function computeSupplierFinalTotal(req, colId) {
  const subtotal = computeSupplierTotal(req, colId);
  if (req.vatMode !== "with_vat") return subtotal;
  if (req.vatCalculationType === "already_included") return subtotal;
  return subtotal + computeSupplierVatAmount(req, colId);
}

test("Đề nghị phê duyệt: Chế độ chưa có VAT (Mặc định)", () => {
  const req = {
    vatMode: "without_vat",
    rows: [
      {
        qty: 10,
        supplierQuotes: {
          sup1: [{ unitPrice: 100000, qty: 10, amount: 1000000 }],
        },
      },
    ],
  };

  const subtotal = computeSupplierTotal(req, "sup1");
  const vat = computeSupplierVatAmount(req, "sup1");
  const total = computeSupplierFinalTotal(req, "sup1");

  assert.strictEqual(subtotal, 1000000);
  assert.strictEqual(vat, 0);
  assert.strictEqual(total, 1000000);
});

test("Đề nghị phê duyệt: Chế độ có VAT (VAT 10%)", () => {
  const req = {
    vatMode: "with_vat",
    vatRate: 10,
    vatCalculationType: "add_vat",
    rows: [
      {
        qty: 10,
        supplierQuotes: {
          sup1: [{ unitPrice: 100000, qty: 10, amount: 1000000 }],
        },
      },
    ],
  };

  const subtotal = computeSupplierTotal(req, "sup1");
  const vat = computeSupplierVatAmount(req, "sup1");
  const total = computeSupplierFinalTotal(req, "sup1");

  assert.strictEqual(subtotal, 1000000);
  assert.strictEqual(vat, 100000);
  assert.strictEqual(total, 1100000);
});

test("Đề nghị phê duyệt: Chế độ có VAT (VAT 8%)", () => {
  const req = {
    vatMode: "with_vat",
    vatRate: 8,
    vatCalculationType: "add_vat",
    rows: [
      {
        qty: 10,
        supplierQuotes: {
          sup1: [{ unitPrice: 100000, qty: 10, amount: 1000000 }],
        },
      },
    ],
  };

  const subtotal = computeSupplierTotal(req, "sup1");
  const vat = computeSupplierVatAmount(req, "sup1");
  const total = computeSupplierFinalTotal(req, "sup1");

  assert.strictEqual(subtotal, 1000000);
  assert.strictEqual(vat, 80000);
  assert.strictEqual(total, 1080000);
});

test("Đề nghị phê duyệt: Chế độ có VAT (Đơn giá đã gồm VAT)", () => {
  const req = {
    vatMode: "with_vat",
    vatCalculationType: "already_included",
    rows: [
      {
        qty: 10,
        supplierQuotes: {
          sup1: [{ unitPrice: 110000, qty: 10, amount: 1100000 }],
        },
      },
    ],
  };

  const subtotal = computeSupplierTotal(req, "sup1");
  const vat = computeSupplierVatAmount(req, "sup1");
  const total = computeSupplierFinalTotal(req, "sup1");

  assert.strictEqual(subtotal, 1100000);
  assert.strictEqual(vat, 0);
  assert.strictEqual(total, 1100000);
});
