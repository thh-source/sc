// app/components/SupplierPickerModal.tsx
"use client";

import React, { useState } from "react";
import { Building2, Search, Plus, Check, X } from "lucide-react";
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
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 96vw)",
          padding: 0,
          overflow: "hidden",
          borderRadius: "16px",
          border: "1px solid #cbd5e1",
        }}
      >
        {/* Stitch v2 Deep Navy Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #2B6DF8 0%, #1442B0 100%)",
            padding: "18px 22px",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                display: "grid",
                placeItems: "center",
                color: "#fdba74",
              }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#ffffff" }}>
                Chọn Nhà Cung Cấp Tham Gia Báo Giá ({availableSuppliers.length} NCC)
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#bfdbfe" }}>
                Chọn từ danh mục chuẩn hoặc gõ tên mới để khởi tạo tức thì
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#ffffff",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "#f8fafc",
              border: "1.5px solid #cbd5e1",
              borderRadius: "10px",
              padding: "0 14px",
              height: "44px",
            }}
          >
            <Search size={17} style={{ color: "#64748b", flexShrink: 0 }} />
            <input
              autoFocus
              placeholder="Gõ tên công ty, tên viết tắt hoặc mã NCC để lọc nhanh..."
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              style={{
                border: 0,
                outline: 0,
                background: "transparent",
                width: "100%",
                fontSize: "14px",
                color: "#0f172a",
                fontWeight: 500,
              }}
            />
          </div>

          <div
            style={{
              maxHeight: "360px",
              minHeight: "180px",
              overflowY: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              background: "#ffffff",
            }}
          >
            {filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelectSupplier(s.id)}
                style={{
                  padding: "11px 14px",
                  cursor: "pointer",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: "#eff6ff",
                        color: "#2B6DF8",
                        border: "1px solid #bfdbfe",
                        padding: "2px 7px",
                        borderRadius: "5px",
                      }}
                    >
                      {s.code}
                    </span>
                    <b style={{ fontSize: "13.5px", color: "#0f172a" }}>{s.shortName || s.name}</b>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      marginTop: "3px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                    {s.bankAccount ? ` • STK: ${s.bankAccount} (${s.bank || "NH"})` : ""}
                  </div>
                </div>
                <span
                  style={{
                    padding: "5px 11px",
                    borderRadius: "7px",
                    background: "linear-gradient(135deg, #2B6DF8 0%, #1e40af 100%)",
                    color: "#ffffff",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    boxShadow: "0 2px 6px rgba(12, 50, 111, 0.2)",
                  }}
                >
                  <Check size={13} /> Chọn
                </span>
              </div>
            ))}

            {!exactMatch && supplierSearch.trim() && (
              <div
                onClick={handleCreateNew}
                style={{
                  padding: "13px 14px",
                  cursor: "pointer",
                  background: "#fff7ed",
                  color: "#c2410c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px dashed #fdba74",
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#ffedd5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff7ed")}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Plus size={16} /> Tạo nhanh & Chọn NCC mới: <b>{supplierSearch}</b>
                </span>
                <span
                  style={{
                    background: "linear-gradient(135deg, #e65100 0%, #f97316 100%)",
                    color: "#ffffff",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                  }}
                >
                  + Thêm ngay
                </span>
              </div>
            )}

            {filtered.length === 0 && !supplierSearch.trim() && (
              <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                Tất cả NCC đã có trong bảng so sánh.
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div
          style={{
            padding: "12px 22px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 0,
          }}
        >
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            Hiển thị <b>{filtered.length}</b> nhà cung cấp khả dụng
          </span>
          <button className="ghost" onClick={onClose}>
            Đóng (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
