"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Supplier } from "../types";
import { normName } from "../payment-utils";
import { generateShortName, makeId } from "../utils";

export interface SupplierSearchComboboxProps {
  suppliers: Supplier[];
  selectedSupplierId: number | "";
  onSelectSupplier: (id: number | "") => void;
  onAddSupplier?: (supplier: Supplier) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
}

export function SupplierSearchCombobox({
  suppliers,
  selectedSupplierId,
  onSelectSupplier,
  onAddSupplier,
  required = false,
  label = "Nhà cung cấp / Đối tác",
  placeholder = "Gõ tên, mã hoặc MST để tìm nhà cung cấp...",
}: SupplierSearchComboboxProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  // Form state for detailed quick add modal
  const [newSuppName, setNewSuppName] = useState("");
  const [newSuppCode, setNewSuppCode] = useState("");
  const [newSuppPhone, setNewSuppPhone] = useState("");
  const [newSuppAddress, setNewSuppAddress] = useState("");
  const [newSuppBank, setNewSuppBank] = useState("");
  const [newSuppBankAccount, setNewSuppBankAccount] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find currently selected supplier
  const selectedSupplier = useMemo(() => {
    if (!selectedSupplierId) return null;
    return suppliers.find((s) => s.id === Number(selectedSupplierId)) || null;
  }, [selectedSupplierId, suppliers]);

  // Filtered suppliers based on query
  const filteredSuppliers = useMemo(() => {
    const q = normName(query);
    if (!q) return suppliers.slice(0, 30);
    const results: Supplier[] = [];
    for (let i = 0; i < suppliers.length; i++) {
      if (results.length >= 30) break;
      const s = suppliers[i];
      if (
        normName(s.name).includes(q) ||
        normName(s.shortName || "").includes(q) ||
        normName(s.code).includes(q) ||
        normName(s.phone || "").includes(q) ||
        normName(s.address || "").includes(q)
      ) {
        results.push(s);
      }
    }
    return results;
  }, [query, suppliers]);

  // Check if query exactly matches an existing supplier
  const hasExactMatch = useMemo(() => {
    if (!query.trim()) return true;
    const q = normName(query);
    return suppliers.some((s) => normName(s.name) === q || normName(s.shortName || "") === q);
  }, [query, suppliers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle Quick Add directly from typed query
  const handleQuickAddFromQuery = (nameToCreate: string) => {
    const trimmed = nameToCreate.trim();
    if (!trimmed) return;

    const newId = makeId();
    const nextCode = `NCC-${String(suppliers.length + 1).padStart(3, "0")}`;
    const newSupp: Supplier = {
      id: newId,
      code: nextCode,
      name: trimmed,
      shortName: generateShortName(trimmed),
      bankAccount: "",
      bank: "",
      address: "",
      contact: "",
      phone: "",
    };

    onAddSupplier?.(newSupp);
    onSelectSupplier(newId);
    setQuery("");
    setIsOpen(false);
  };

  // Open detailed quick add modal
  const openDetailedModal = () => {
    const nameVal = query.trim();
    setNewSuppName(nameVal);
    setNewSuppCode(`NCC-${String(suppliers.length + 1).padStart(3, "0")}`);
    setNewSuppPhone("");
    setNewSuppAddress("");
    setNewSuppBank("");
    setNewSuppBankAccount("");
    setShowQuickAddModal(true);
    setIsOpen(false);
  };

  // Save detailed new supplier
  const handleSaveDetailedSupplier = () => {
    if (!newSuppName.trim()) {
      alert("Vui lòng nhập tên nhà cung cấp.");
      return;
    }
    const newId = makeId();
    const codeVal = newSuppCode.trim() || `NCC-${String(suppliers.length + 1).padStart(3, "0")}`;
    const nameVal = newSuppName.trim();
    const newSupp: Supplier = {
      id: newId,
      code: codeVal,
      name: nameVal,
      shortName: generateShortName(nameVal),
      bankAccount: newSuppBankAccount.trim(),
      bank: newSuppBank.trim(),
      address: newSuppAddress.trim(),
      contact: "",
      phone: newSuppPhone.trim(),
    };

    onAddSupplier?.(newSupp);
    onSelectSupplier(newId);
    setShowQuickAddModal(false);
    setQuery("");
  };

  return (
    <div style={{ position: "relative" }} ref={containerRef}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569" }}>
            {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
          </label>
          <button
            type="button"
            className="payment-btn"
            style={{ padding: "1px 6px", fontSize: "11px", color: "#0284c7", borderColor: "#bae6fd", background: "#f0f9ff" }}
            onClick={openDetailedModal}
            title="Thêm nhanh nhà cung cấp mới vào hệ thống"
          >
            ＋ Thêm NCC mới
          </button>
        </div>
      )}

      {selectedSupplier ? (
        // Selected Supplier Card View
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 10px",
            border: "1px solid #93c5fd",
            background: "#eff6ff",
            borderRadius: "6px",
            gap: "8px",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "#dbeafe",
                  color: "#1e40af",
                  padding: "1px 6px",
                  borderRadius: "4px",
                }}
              >
                {selectedSupplier.code}
              </span>
              <span style={{ fontWeight: 600, fontSize: "13px", color: "#1e3a8a" }}>
                {selectedSupplier.name}
              </span>
              {selectedSupplier.shortName && (
                <span style={{ fontSize: "12px", color: "#64748b" }}>({selectedSupplier.shortName})</span>
              )}
            </div>
            {(selectedSupplier.phone || selectedSupplier.bank || selectedSupplier.bankAccount) && (
              <div style={{ fontSize: "11.5px", color: "#475569", marginTop: "3px" }}>
                {selectedSupplier.phone && <span>📞 {selectedSupplier.phone} </span>}
                {selectedSupplier.bank && (
                  <span>
                    🏦 {selectedSupplier.bank} - TK: <b>{selectedSupplier.bankAccount || "---"}</b>
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="payment-btn"
            style={{
              padding: "4px 8px",
              fontSize: "11.5px",
              background: "#fff",
              color: "#dc2626",
              borderColor: "#fca5a5",
              whiteSpace: "nowrap",
            }}
            onClick={() => {
              onSelectSupplier("");
              setQuery("");
              setTimeout(() => {
                inputRef.current?.focus();
                setIsOpen(true);
              }, 50);
            }}
            title="Đổi hoặc chọn nhà cung cấp khác"
          >
            ✕ Đổi NCC
          </button>
        </div>
      ) : (
        // Search Input & Dropdown
        <div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              ref={inputRef}
              type="text"
              className="payment-input"
              style={{ width: "100%", fontSize: "13px", padding: "8px 10px" }}
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!hasExactMatch && query.trim()) {
                    handleQuickAddFromQuery(query);
                  } else if (filteredSuppliers.length > 0) {
                    onSelectSupplier(filteredSuppliers[0].id);
                    setQuery("");
                    setIsOpen(false);
                  }
                }
              }}
            />
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "4px",
                maxHeight: "260px",
                overflowY: "auto",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                zIndex: 9999,
              }}
            >
              {/* Option to create new supplier from typed query */}
              {query.trim().length > 0 && (
                <div
                  style={{
                    padding: "9px 12px",
                    background: "#f0fdf4",
                    borderBottom: "1px solid #bbf7d0",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => handleQuickAddFromQuery(query)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#dcfce7")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#f0fdf4")}
                >
                  <span style={{ fontSize: "12.5px", color: "#166534", fontWeight: 600 }}>
                    ＋ Thêm nhanh NCC mới: <b>"{query.trim()}"</b>
                  </span>
                  <span style={{ fontSize: "11px", color: "#15803d" }}>(Nhấn để tạo)</span>
                </div>
              )}

              {/* List of matching suppliers */}
              {filteredSuppliers.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid #f1f5f9",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => {
                    onSelectSupplier(s.id);
                    setQuery("");
                    setIsOpen(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#0369a1",
                          background: "#e0f2fe",
                          padding: "1px 5px",
                          borderRadius: "4px",
                        }}
                      >
                        {s.code}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{s.name}</span>
                      {s.shortName && (
                        <span style={{ fontSize: "11.5px", color: "#64748b" }}>({s.shortName})</span>
                      )}
                    </div>
                    {(s.phone || s.bank || s.address) && (
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        {s.phone && <span>📞 {s.phone} · </span>}
                        {s.bank && <span>🏦 {s.bank} · </span>}
                        {s.address && <span>📍 {s.address}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {filteredSuppliers.length === 0 && !query.trim() && (
                <div style={{ padding: "12px", textAlign: "center", color: "#64748b", fontSize: "12.5px" }}>
                  Chưa có nhà cung cấp nào. Hãy gõ tên để thêm mới!
                </div>
              )}

              {/* Action to open detailed add modal */}
              <div
                style={{
                  padding: "8px 12px",
                  background: "#fafafa",
                  borderTop: "1px solid #e2e8f0",
                  textAlign: "center",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "#0284c7",
                  fontWeight: 600,
                }}
                onClick={openDetailedModal}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fafafa")}
              >
                ＋ Mở form nhập chi tiết thông tin nhà cung cấp mới...
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUICK ADD SUPPLIER DETAILED MODAL */}
      {showQuickAddModal && (
        <div
          className="payment-modal-overlay"
          style={{ zIndex: 10000 }}
          onClick={() => setShowQuickAddModal(false)}
        >
          <div
            className="payment-modal-card"
            style={{ maxWidth: 500, width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <h3 style={{ margin: 0, fontSize: 16 }}>＋ Thêm mới nhà cung cấp / đối tác</h3>
              <button
                type="button"
                className="payment-modal-close"
                onClick={() => setShowQuickAddModal(false)}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  Tên nhà cung cấp <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="payment-input"
                  style={{ width: "100%" }}
                  value={newSuppName}
                  onChange={(e) => setNewSuppName(e.target.value)}
                  placeholder="VD: Công ty TNHH Thiết Bị Khoa Học Alpha"
                  autoFocus
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                    Mã NCC
                  </label>
                  <input
                    type="text"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={newSuppCode}
                    onChange={(e) => setNewSuppCode(e.target.value)}
                    placeholder="VD: NCC-001"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                    Số điện thoại / MST
                  </label>
                  <input
                    type="text"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={newSuppPhone}
                    onChange={(e) => setNewSuppPhone(e.target.value)}
                    placeholder="VD: 0912345678"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  Địa chỉ
                </label>
                <input
                  type="text"
                  className="payment-input"
                  style={{ width: "100%" }}
                  value={newSuppAddress}
                  onChange={(e) => setNewSuppAddress(e.target.value)}
                  placeholder="VD: Số 10 Đại Cồ Việt, Hai Bà Trưng, Hà Nội"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                    Ngân hàng
                  </label>
                  <input
                    type="text"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={newSuppBank}
                    onChange={(e) => setNewSuppBank(e.target.value)}
                    placeholder="VD: Vietcombank CN Hà Nội"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                    Số tài khoản ngân hàng
                  </label>
                  <input
                    type="text"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={newSuppBankAccount}
                    onChange={(e) => setNewSuppBankAccount(e.target.value)}
                    placeholder="VD: 0011001234567"
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                borderTop: "1px solid #e2e8f0",
                paddingTop: 12,
                marginTop: 6,
              }}
            >
              <button
                type="button"
                className="payment-btn"
                onClick={() => setShowQuickAddModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                onClick={handleSaveDetailedSupplier}
              >
                ✓ Lưu & Chọn nhà cung cấp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
