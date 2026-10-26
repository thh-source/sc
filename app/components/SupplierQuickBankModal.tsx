"use client";

import React, { useState } from "react";
import { X, Building2, CreditCard, MapPin, Check, AlertCircle } from "lucide-react";
import { Supplier } from "../types";

interface SupplierQuickBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier;
  onConfirm: (info: {
    bankAccount: string;
    bank: string;
    address: string;
    saveToCatalog: boolean;
  }) => void;
}

export function SupplierQuickBankModal({
  isOpen,
  onClose,
  supplier,
  onConfirm,
}: SupplierQuickBankModalProps) {
  const [bankAccount, setBankAccount] = useState(supplier.bankAccount || "");
  const [bank, setBank] = useState(supplier.bank || "");
  const [address, setAddress] = useState(supplier.address || "");
  const [saveToCatalog, setSaveToCatalog] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankAccount.trim()) {
      setErrorMsg("Vui lòng nhập Số tài khoản ngân hàng của NCC");
      return;
    }
    if (!bank.trim()) {
      setErrorMsg("Vui lòng nhập Tên ngân hàng & Chi nhánh của NCC");
      return;
    }
    if (!address.trim()) {
      setErrorMsg("Vui lòng nhập Địa chỉ của NCC");
      return;
    }

    onConfirm({
      bankAccount: bankAccount.trim(),
      bank: bank.trim(),
      address: address.trim(),
      saveToCatalog,
    });
  };

  return (
    <div
      className="payment-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="payment-modal-card"
        style={{
          background: "#ffffff",
          maxWidth: "540px",
          width: "100%",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            background: "#0f172a",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#1e293b",
                color: "#38bdf8",
                display: "grid",
                placeItems: "center",
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                Bổ sung thông tin thanh toán NCC
              </h3>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Cần thiết để lập Giấy đề nghị thanh toán (Mẫu 01-TT)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              border: 0,
              background: "#1e293b",
              color: "#94a3b8",
              fontSize: "18px",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
          {/* Supplier Info Box */}
          <div
            style={{
              padding: "10px 14px",
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "13px",
              color: "#0369a1",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <Building2 size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              Nhà cung cấp: <b>{supplier.name}</b> {supplier.code ? `(${supplier.code})` : ""}
              <div style={{ fontSize: "11.5px", color: "#0284c7", marginTop: "2px" }}>
                Hệ thống nhận thấy NCC này chưa có đủ Số tài khoản, Ngân hàng hoặc Địa chỉ để in phiếu. Vui lòng bổ sung nhanh dưới đây:
              </div>
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: "8px 12px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                marginBottom: "14px",
                fontSize: "12.5px",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Số tài khoản ngân hàng <b style={{ color: "#dc2626" }}>*</b>:
              </label>
              <input
                type="text"
                placeholder="VD: 19033458921019 hoặc 0451000..."
                value={bankAccount}
                onChange={(e) => {
                  setBankAccount(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  fontSize: "13.5px",
                  borderRadius: "6px",
                  border: "1.5px solid #cbd5e1",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Ngân hàng & Chi nhánh <b style={{ color: "#dc2626" }}>*</b>:
              </label>
              <input
                type="text"
                placeholder="VD: Techcombank - CN Ba Đình, Vietcombank - CN Thăng Long..."
                value={bank}
                onChange={(e) => {
                  setBank(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  fontSize: "13.5px",
                  borderRadius: "6px",
                  border: "1.5px solid #cbd5e1",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Địa chỉ NCC <b style={{ color: "#dc2626" }}>*</b>:
              </label>
              <input
                type="text"
                placeholder="VD: Số 123 đường Giải Phóng, P. Đồng Tâm, Q. Hai Bà Trưng, Hà Nội"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  fontSize: "13.5px",
                  borderRadius: "6px",
                  border: "1.5px solid #cbd5e1",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                background: "#f8fafc",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
              }}
            >
              <input
                type="checkbox"
                id="saveCatalogCheck"
                checked={saveToCatalog}
                onChange={(e) => setSaveToCatalog(e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
              />
              <label
                htmlFor="saveCatalogCheck"
                style={{ fontSize: "12.5px", color: "#334155", cursor: "pointer", fontWeight: 500 }}
              >
                Cập nhật thông tin này vào Danh mục NCC để tự động áp dụng cho các lần sau
              </label>
            </div>
          </div>

          {/* Footer Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "20px",
              paddingTop: "14px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                height: "38px",
                padding: "0 16px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#475569",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              style={{
                height: "38px",
                padding: "0 20px",
                borderRadius: "6px",
                border: "none",
                background: "#0284c7",
                color: "#ffffff",
                fontSize: "13.5px",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 8px rgba(2, 132, 199, 0.35)",
              }}
            >
              <Check size={16} /> Xác nhận & Mở bản in ĐNTT
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
