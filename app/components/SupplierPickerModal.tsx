// app/components/SupplierPickerModal.tsx
"use client";

import React, { useState } from "react";
import { Supplier } from "../types";
import { makeId, generateShortName } from "../utils";

export interface SupplierPickerModalProps {
  availableSuppliers: Supplier[];
  onSelectSupplier: (supplierId: number) => void;
  onCreateAndSelectSupplier: (newSupplier: Supplier) => void;
  onClose: () => void;
}

export function SupplierPickerModal({
  availableSuppliers,
  onSelectSupplier,
  onCreateAndSelectSupplier,
  onClose,
}: SupplierPickerModalProps) {
  const [supplierSearch, setSupplierSearch] = useState("");

  const q = supplierSearch.toLowerCase().trim();
  const filtered = availableSuppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.shortName && s.shortName.toLowerCase().includes(q)),
  );
  const exactMatch = availableSuppliers.find(
    (s) =>
      s.name.toLowerCase() === q ||
      (s.shortName && s.shortName.toLowerCase() === q),
  );

  const handleCreateNew = () => {
    const newName = supplierSearch.trim();
    if (!newName) return;
    const newCode = `NCC-${String(Date.now()).slice(-4)}`;
    const newSupplier: Supplier = {
      id: makeId(),
      code: newCode,
      name: newName,
      shortName: generateShortName(newName),
      bank: "",
      bankAccount: "",
      address: "",
      contact: "",
      phone: "",
    };
    onCreateAndSelectSupplier(newSupplier);
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <i>▱</i>
        <h2>Chọn nhà cung cấp</h2>
        <p>Chọn nhà cung cấp từ danh mục dùng chung để thêm cột Giá và Ghi chú.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px" }}>
          <input
            autoFocus
            placeholder="Gõ tên nhà cung cấp để tìm hoặc tạo mới..."
            value={supplierSearch}
            onChange={(e) => setSupplierSearch(e.target.value)}
            style={{ padding: "10px", fontSize: "15px" }}
          />
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              border: "1px solid #ddd",
              borderRadius: "4px",
              background: "#fff",
              minHeight: "150px",
            }}
          >
            {filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelectSupplier(s.id)}
                style={{
                  padding: "12px 10px",
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e6f2ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <b>{s.shortName || s.name}</b>{" "}
                <small style={{ color: "#666" }}>
                  ({s.code}) - {s.name}
                </small>
              </div>
            ))}

            {!exactMatch && supplierSearch.trim() && (
              <div
                onClick={handleCreateNew}
                style={{
                  padding: "12px 10px",
                  cursor: "pointer",
                  background: "#f0fdf4",
                  color: "#166534",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#dcfce7")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#f0fdf4")}
              >
                + Tạo mới NCC: <b>{supplierSearch}</b>
              </div>
            )}

            {filtered.length === 0 && !supplierSearch.trim() && (
              <div style={{ padding: "10px", color: "#999" }}>
                Tất cả NCC đã có trong bảng.
              </div>
            )}
          </div>
        </div>

        <div>
          <button className="ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
