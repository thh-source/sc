import React, { useState, useMemo, Fragment } from "react";
import {
  Plus,
  Search,
  Building2,
  Phone,
  CreditCard,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Supplier, PurchaseHistory } from "../types";
import { fmt, dateVN, priceStats } from "../utils";
import { BANK_SUGGESTIONS } from "../payment-utils";
import { useTranslation } from "../i18n";

export function SupplierManagement({
  suppliers,
  setSuppliers,
  onAdd,
  purchaseHistory,
}: {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onAdd: () => void;
  purchaseHistory: PurchaseHistory[];
}) {
  const { t } = useTranslation();
  const [supplierQuery, setSupplierQuery] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<"all" | "active" | "inactive" | "has_bank">("all");

  const bankOptions = useMemo(() => {
    const set = new Set<string>(BANK_SUGGESTIONS);
    suppliers.forEach((s) => {
      if (s.bank?.trim()) set.add(s.bank.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [suppliers]);

  const update = (id: number, key: keyof Supplier, value: string) =>
    setSuppliers((list) =>
      list.map((s) => (s.id === id ? { ...s, [key]: value } : s))
    );

  const supplierHistoryRows = (supplier: Supplier) =>
    purchaseHistory
      .filter(
        (row) =>
          row.supplierCode === supplier.code ||
          row.supplierName === supplier.name ||
          (supplier.shortName && row.supplierName === supplier.shortName)
      )
      .sort((a, b) =>
        (b.documentDate || b.accountingDate).localeCompare(
          a.documentDate || a.accountingDate
        )
      );

  const supplierStats = (supplier: Supplier) => {
    const rows = supplierHistoryRows(supplier);
    const stats = priceStats(rows);
    const topItems = [
      ...rows
        .reduce((map, row) => {
          const current = map.get(row.itemCode) || {
            code: row.itemCode,
            name: row.itemName,
            value: 0,
            count: 0,
          };
          current.value += row.value;
          current.count += 1;
          map.set(row.itemCode, current);
          return map;
        }, new Map<string, { code: string; name: string; value: number; count: number }>())
    ]
      .map(([, value]) => value)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      ...stats,
      itemCount: new Set(rows.map((row) => row.itemCode)).size,
      topItems,
    };
  };

  const normalizedSupplierQuery = supplierQuery.trim().toLowerCase();

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const matchQuery =
        !normalizedSupplierQuery ||
        [
          supplier.code,
          supplier.name,
          supplier.shortName,
          supplier.contact,
          supplier.phone,
          supplier.bank,
          supplier.bankAccount,
          supplier.address,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSupplierQuery);

      if (!matchQuery) return false;

      const rows = supplierHistoryRows(supplier);
      const hasTransactions = rows.length > 0;

      if (filterType === "active") return hasTransactions;
      if (filterType === "inactive") return !hasTransactions;
      if (filterType === "has_bank") return Boolean(supplier.bank?.trim() || supplier.bankAccount?.trim());

      return true;
    });
  }, [suppliers, normalizedSupplierQuery, filterType, purchaseHistory]);

  // Sinh avatar ký tự viết tắt đẹp mắt từ tên NCC
  const getAvatarInitials = (name: string, shortName?: string) => {
    if (shortName && shortName.trim()) {
      return shortName.trim().slice(0, 2).toUpperCase();
    }
    const clean = name.replace(/^(công ty|cty|tnhh|cổ phần|cp|doanh nghiệp|dn|văn phòng|vp)\s+/i, "");
    const parts = clean.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (clean.slice(0, 2) || "NC").toUpperCase();
  };

  // Màu gradient ngẫu nhiên ổn định theo tên
  const getAvatarGradient = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hues = [
      "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      "linear-gradient(135deg, #10b981, #047857)",
      "linear-gradient(135deg, #8b5cf6, #6d28d9)",
      "linear-gradient(135deg, #f59e0b, #d97706)",
      "linear-gradient(135deg, #06b6d4, #0e7490)",
      "linear-gradient(135deg, #ec4899, #be185d)",
    ];
    return hues[Math.abs(hash) % hues.length];
  };

  return (
    <section
      className="content supplier-page"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "16px 20px",
        gap: "12px",
        overflow: "hidden",
        backgroundColor: "#f8fafc",
      }}
    >
      {/* Stitch Command Toolbar */}
      <div
        className="stitch-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "10px 14px",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          flexWrap: "wrap",
        }}
      >
        {/* Search input with icon & clear button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#f1f5f9",
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            flex: "1 1 360px",
            maxWidth: "600px",
          }}
        >
          <Search size={16} style={{ color: "#64748b", flexShrink: 0 }} />
          <input
            type="text"
            value={supplierQuery}
            onChange={(e) => setSupplierQuery(e.target.value)}
            placeholder="Tìm theo tên NCC, viết tắt, mã số, ngân hàng, liên hệ, SĐT..."
            style={{
              border: "none",
              outline: "none",
              backgroundColor: "transparent",
              width: "100%",
              fontSize: "13px",
              color: "#0f172a",
            }}
          />
          {supplierQuery && (
            <button
              type="button"
              onClick={() => setSupplierQuery("")}
              style={{
                border: "none",
                background: "transparent",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setFilterType("all")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: filterType === "all" ? 700 : 500,
              backgroundColor: filterType === "all" ? "#0f172a" : "#f1f5f9",
              color: filterType === "all" ? "#ffffff" : "#475569",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Tất cả ({suppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("active")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: filterType === "active" ? 700 : 500,
              backgroundColor: filterType === "active" ? "#059669" : "#f1f5f9",
              color: filterType === "active" ? "#ffffff" : "#475569",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Có phát sinh mua
          </button>
          <button
            type="button"
            onClick={() => setFilterType("has_bank")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: filterType === "has_bank" ? 700 : 500,
              backgroundColor: filterType === "has_bank" ? "#2563eb" : "#f1f5f9",
              color: filterType === "has_bank" ? "#ffffff" : "#475569",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Có tài khoản NH
          </button>
        </div>

        {/* Right Action Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
            Hiển thị <b>{filteredSuppliers.length}</b> / {suppliers.length} NCC
          </span>
          <button
            type="button"
            className="primary"
            onClick={onAdd}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(37,99,235,0.25)",
              transition: "all 0.15s ease",
            }}
          >
            <Plus size={16} /> Thêm NCC mới
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div
        className="supplier-list-panel"
        style={{
          flex: 1,
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          overflow: "auto",
          minHeight: 0,
        }}
      >
        {/* Mobile Record List */}
        <div className="mobile-record-list">
          {filteredSuppliers.map((supplier) => {
            const stats = supplierStats(supplier);
            const isSelected = selectedSupplierId === supplier.id;
            const initials = getAvatarInitials(supplier.name, supplier.shortName);
            const avatarGrad = getAvatarGradient(supplier.name);

            return (
              <article
                key={supplier.id}
                className="mobile-supplier-card"
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: isSelected ? "1.5px solid #2563eb" : "1px solid #e2e8f0",
                  backgroundColor: isSelected ? "#f8fafc" : "#ffffff",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: avatarGrad,
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "13px",
                      flexShrink: 0,
                    }}
                  >
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                      onClick={() => setSelectedSupplierId(isSelected ? null : supplier.id)}
                      style={{
                        background: "none",
                        border: "none",
                        textAlign: "left",
                        padding: 0,
                        fontWeight: 700,
                        fontSize: "14px",
                        color: "#0f172a",
                        cursor: "pointer",
                        display: "block",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {supplier.name || "Chưa đặt tên NCC"}
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "#eff6ff",
                          color: "#1d4ed8",
                          padding: "1px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {supplier.code}
                      </span>
                      {supplier.shortName && (
                        <span style={{ fontSize: "11px", color: "#64748b" }}>
                          ({supplier.shortName})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "6px",
                    fontSize: "12px",
                    backgroundColor: "#f8fafc",
                    padding: "8px",
                    borderRadius: "6px",
                    margin: "6px 0",
                  }}
                >
                  <div>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>Giá trị PO:</span>
                    <b style={{ display: "block", color: "#0f172a" }}>{fmt(stats.totalValue)} ₫</b>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>Giao dịch:</span>
                    <b style={{ display: "block", color: "#059669" }}>
                      {stats.count} lượt · {stats.itemCount} mã
                    </b>
                  </div>
                </div>

                {supplier.phone && (
                  <div style={{ margin: "4px 0" }}>
                    <a
                      href={`tel:${supplier.phone}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "#0284c7",
                        fontSize: "12px",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      <Phone size={13} /> {supplier.phone}
                    </a>
                  </div>
                )}

                <footer style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px dashed #e2e8f0" }}>
                  <button
                    className="row-action"
                    onClick={() => setSelectedSupplierId(isSelected ? null : supplier.id)}
                    style={{
                      width: "100%",
                      padding: "6px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#2563eb",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                  >
                    {isSelected ? (
                      <>Thu gọn chi tiết <ChevronUp size={14} /></>
                    ) : (
                      <>Xem chi tiết & lịch sử <ChevronDown size={14} /></>
                    )}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>

        {/* Desktop Data Table */}
        <table className="supplier-list-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ backgroundColor: "#f8fafc" }}>
              <th
                className="cell-center"
                style={{
                  width: "100px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "2px solid #e2e8f0",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              >
                Mã NCC
              </th>
              <th
                className="cell-left"
                style={{
                  padding: "10px 14px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "2px solid #e2e8f0",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              >
                Tên Nhà Cung Cấp & Thông Tin
              </th>
              <th
                className="cell-left"
                style={{
                  width: "140px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "2px solid #e2e8f0",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              >
                Tên viết tắt
              </th>
              <th
                className="cell-left"
                style={{
                  width: "170px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "2px solid #e2e8f0",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              >
                Liên hệ / SĐT
              </th>
              <th
                className="cell-right"
                style={{
                  width: "140px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "2px solid #e2e8f0",
                  textAlign: "right",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              >
                Giá trị PO
              </th>
              <th
                className="cell-center"
                style={{
                  width: "110px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "2px solid #e2e8f0",
                  textAlign: "center",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              >
                Lượt mua
              </th>
              <th
                className="cell-center"
                style={{
                  width: "110px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "2px solid #e2e8f0",
                  textAlign: "center",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              >
                Số mặt hàng
              </th>
              <th
                className="cell-center"
                style={{
                  width: "100px",
                  padding: "10px 12px",
                  borderBottom: "2px solid #e2e8f0",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f8fafc",
                  zIndex: 2,
                }}
              ></th>
            </tr>
          </thead>
          <tbody>
            {!filteredSuppliers.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "40px 16px", color: "#64748b" }}>
                  <Building2 size={32} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Không tìm thấy nhà cung cấp nào phù hợp</p>
                  <small style={{ color: "#94a3b8" }}>Hãy thử thay đổi từ khóa hoặc bộ lọc tìm kiếm</small>
                </td>
              </tr>
            )}

            {filteredSuppliers.map((supplier) => {
              const stats = supplierStats(supplier);
              const isSelected = selectedSupplierId === supplier.id;
              const selectedRows = isSelected ? supplierHistoryRows(supplier) : [];
              const initials = getAvatarInitials(supplier.name, supplier.shortName);
              const avatarGrad = getAvatarGradient(supplier.name);

              return (
                <Fragment key={supplier.id}>
                  <tr
                    className={`supplier-row ${isSelected ? "selected" : ""}`}
                    style={{
                      backgroundColor: isSelected ? "#eff6ff" : "transparent",
                      borderBottom: "1px solid #f1f5f9",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    {/* Mã NCC */}
                    <td className="cell-center" style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          fontFamily: "monospace",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "#eff6ff",
                          color: "#1d4ed8",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          border: "1px solid #dbeafe",
                        }}
                      >
                        {supplier.code}
                      </span>
                    </td>

                    {/* Tên NCC & Chi tiết */}
                    <td className="cell-left" style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: avatarGrad,
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: "12px",
                            flexShrink: 0,
                            boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                          }}
                        >
                          {initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedSupplierId(isSelected ? null : supplier.id)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#1e3a8a",
                              fontWeight: 700,
                              fontSize: "13.5px",
                              textAlign: "left",
                              padding: 0,
                              cursor: "pointer",
                              display: "block",
                              lineHeight: 1.3,
                            }}
                          >
                            {supplier.name || "Chưa đặt tên NCC"}
                          </button>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                            {supplier.bank || supplier.bankAccount ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "11px",
                                  color: "#475569",
                                  backgroundColor: "#f8fafc",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid #e2e8f0",
                                }}
                              >
                                <CreditCard size={11} style={{ color: "#0284c7" }} />
                                {supplier.bank} {supplier.bankAccount ? `(${supplier.bankAccount})` : ""}
                              </span>
                            ) : (
                              <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                                Chưa cập nhật tài khoản
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Tên viết tắt */}
                    <td className="cell-left" style={{ padding: "10px 12px" }}>
                      {supplier.shortName ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#334155",
                            backgroundColor: "#f1f5f9",
                            padding: "2px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          {supplier.shortName}
                        </span>
                      ) : (
                        <span style={{ color: "#cbd5e1" }}>—</span>
                      )}
                    </td>

                    {/* Liên hệ & SĐT */}
                    <td className="cell-left" style={{ padding: "10px 12px" }}>
                      {supplier.contact || supplier.phone ? (
                        <div>
                          {supplier.contact && (
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>
                              {supplier.contact}
                            </div>
                          )}
                          {supplier.phone && (
                            <a
                              href={`tel:${supplier.phone}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontSize: "11px",
                                color: "#0284c7",
                                textDecoration: "none",
                                fontWeight: 500,
                              }}
                            >
                              <Phone size={10} /> {supplier.phone}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#cbd5e1" }}>—</span>
                      )}
                    </td>

                    {/* Giá trị PO */}
                    <td
                      className="money cell-right"
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 700,
                        color: stats.totalValue > 0 ? "#0f172a" : "#94a3b8",
                        fontSize: "13px",
                      }}
                    >
                      {fmt(stats.totalValue)} ₫
                    </td>

                    {/* Lượt mua */}
                    <td className="cell-center" style={{ padding: "10px 12px", textAlign: "center" }}>
                      {stats.count > 0 ? (
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            backgroundColor: "#ecfdf5",
                            color: "#047857",
                          }}
                        >
                          {stats.count} lượt
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>0</span>
                      )}
                    </td>

                    {/* Số mặt hàng */}
                    <td className="cell-center" style={{ padding: "10px 12px", textAlign: "center" }}>
                      {stats.itemCount > 0 ? (
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            backgroundColor: "#eff6ff",
                            color: "#1d4ed8",
                          }}
                        >
                          {stats.itemCount} mã
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>0</span>
                      )}
                    </td>

                    {/* Nút thao tác chi tiết */}
                    <td className="cell-center" style={{ padding: "10px 12px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedSupplierId(isSelected ? null : supplier.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "1px solid",
                          borderColor: isSelected ? "#93c5fd" : "#cbd5e1",
                          backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                          color: isSelected ? "#1d4ed8" : "#475569",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {isSelected ? "Thu gọn" : "Chi tiết"}
                        {isSelected ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Bento Drawer */}
                  {isSelected && (
                    <tr className="supplier-expanded-row">
                      <td colSpan={8} style={{ padding: "0 0 12px 0", borderBottom: "2px solid #bfdbfe" }}>
                        <div
                          style={{
                            background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
                            border: "1px solid #bfdbfe",
                            margin: "0 8px 8px",
                            borderRadius: "10px",
                            overflow: "hidden",
                            boxShadow: "0 4px 14px rgba(37,99,235,0.08)",
                          }}
                        >
                          <div style={{ padding: "16px 20px" }}>
                            {/* Drawer Top Header */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                                marginBottom: "14px",
                                borderBottom: "1px solid #e2e8f0",
                                paddingBottom: "10px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div
                                  style={{
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "8px",
                                    background: avatarGrad,
                                    color: "#ffffff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 800,
                                    fontSize: "14px",
                                  }}
                                >
                                  {initials}
                                </div>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                                      {supplier.name}
                                    </h3>
                                    <span
                                      style={{
                                        fontFamily: "monospace",
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        backgroundColor: "#dbeafe",
                                        color: "#1e40af",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {supplier.code}
                                    </span>
                                  </div>
                                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                                    Cập nhật thông tin chi tiết nhà cung cấp & tra cứu lịch sử mua hàng
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedSupplierId(null)}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  backgroundColor: "#ffffff",
                                  border: "1px solid #cbd5e1",
                                  color: "#64748b",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <X size={14} /> Đóng chi tiết
                              </button>
                            </div>

                            {/* Bento Mini KPI Cards */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: "10px",
                                marginBottom: "16px",
                              }}
                            >
                              <div
                                style={{
                                  backgroundColor: "#ffffff",
                                  padding: "12px 14px",
                                  borderRadius: "8px",
                                  border: "1px solid #e2e8f0",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                                }}
                              >
                                <small style={{ fontSize: "11px", color: "#64748b", display: "block" }}>
                                  Tổng giá trị mua
                                </small>
                                <b style={{ fontSize: "16px", color: "#1e3a8a", fontVariantNumeric: "tabular-nums" }}>
                                  {fmt(stats.totalValue)} ₫
                                </b>
                              </div>
                              <div
                                style={{
                                  backgroundColor: "#ffffff",
                                  padding: "12px 14px",
                                  borderRadius: "8px",
                                  border: "1px solid #e2e8f0",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                                }}
                              >
                                <small style={{ fontSize: "11px", color: "#64748b", display: "block" }}>
                                  Lượt nhập kho / PO
                                </small>
                                <b style={{ fontSize: "16px", color: "#047857" }}>
                                  {stats.count} lượt giao dịch
                                </b>
                              </div>
                              <div
                                style={{
                                  backgroundColor: "#ffffff",
                                  padding: "12px 14px",
                                  borderRadius: "8px",
                                  border: "1px solid #e2e8f0",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                                }}
                              >
                                <small style={{ fontSize: "11px", color: "#64748b", display: "block" }}>
                                  Số mặt hàng cung ứng
                                </small>
                                <b style={{ fontSize: "16px", color: "#b45309" }}>
                                  {stats.itemCount} mã hàng hóa
                                </b>
                              </div>
                            </div>

                            {/* Quick Top Items Strip */}
                            {!!stats.topItems.length && (
                              <div style={{ marginBottom: "16px" }}>
                                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "6px" }}>
                                  Mặt hàng cung cấp nhiều nhất:
                                </span>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                  {stats.topItems.map((item) => (
                                    <span
                                      key={item.code}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "3px 8px",
                                        borderRadius: "6px",
                                        fontSize: "11px",
                                        backgroundColor: "#f1f5f9",
                                        border: "1px solid #e2e8f0",
                                        color: "#334155",
                                      }}
                                    >
                                      <b style={{ color: "#2563eb" }}>{item.code}</b>
                                      <span>{item.name}</span>
                                      <strong style={{ color: "#0f172a", marginLeft: "4px" }}>
                                        {fmt(item.value)} ₫
                                      </strong>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Form Fields Grid */}
                            <div
                              style={{
                                backgroundColor: "#ffffff",
                                padding: "14px",
                                borderRadius: "8px",
                                border: "1px solid #e2e8f0",
                                marginBottom: "16px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                                <b style={{ fontSize: "12px", color: "#334155", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                  Chỉnh sửa thông tin nhà cung cấp
                                </b>
                                <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}>
                                  ✓ Tự động lưu khi gõ
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                  gap: "10px",
                                }}
                              >
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Mã nhà cung cấp
                                  </label>
                                  <input
                                    type="text"
                                    value={supplier.code}
                                    onChange={(e) => update(supplier.id, "code", e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                      fontFamily: "monospace",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Tên nhà cung cấp đầy đủ
                                  </label>
                                  <input
                                    type="text"
                                    value={supplier.name}
                                    onChange={(e) => update(supplier.id, "name", e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                      fontWeight: 600,
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Tên viết tắt (gọn trên bảng ĐNPD/PO)
                                  </label>
                                  <input
                                    type="text"
                                    value={supplier.shortName || ""}
                                    onChange={(e) => update(supplier.id, "shortName", e.target.value)}
                                    placeholder="Vd: Minox, Phacolab..."
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Người liên hệ
                                  </label>
                                  <input
                                    type="text"
                                    value={supplier.contact}
                                    onChange={(e) => update(supplier.id, "contact", e.target.value)}
                                    placeholder="Họ tên người đại diện..."
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Số điện thoại liên hệ
                                  </label>
                                  <input
                                    type="text"
                                    value={supplier.phone}
                                    onChange={(e) => update(supplier.id, "phone", e.target.value)}
                                    placeholder="09xx..."
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Số tài khoản ngân hàng
                                  </label>
                                  <input
                                    type="text"
                                    value={supplier.bankAccount}
                                    onChange={(e) => update(supplier.id, "bankAccount", e.target.value)}
                                    placeholder="Số tài khoản..."
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                      fontFamily: "monospace",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Tên ngân hàng thụ hưởng
                                  </label>
                                  <input
                                    type="text"
                                    list="supplierMgmtBankList"
                                    value={supplier.bank}
                                    onChange={(e) => update(supplier.id, "bank", e.target.value)}
                                    placeholder="Chọn hoặc nhập tên ngân hàng..."
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                    }}
                                  />
                                  <datalist id="supplierMgmtBankList">
                                    {bankOptions.map((bn) => (
                                      <option key={bn} value={bn} />
                                    ))}
                                  </datalist>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                                    Địa chỉ đăng ký kinh doanh / Văn phòng
                                  </label>
                                  <input
                                    type="text"
                                    value={supplier.address}
                                    onChange={(e) => update(supplier.id, "address", e.target.value)}
                                    placeholder="Địa chỉ trụ sở hoặc chi nhánh..."
                                    style={{
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: "13px",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      outline: "none",
                                    }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Purchase History Table */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                <b style={{ fontSize: "13px", color: "#0f172a" }}>
                                  Lịch sử phát sinh nhập kho ({selectedRows.length} chứng từ)
                                </b>
                              </div>
                              <div
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                  overflow: "auto",
                                  maxHeight: "320px",
                                  backgroundColor: "#ffffff",
                                }}
                              >
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                  <thead>
                                    <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#475569" }}>Ngày</th>
                                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#475569" }}>Chứng từ / PO</th>
                                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#475569" }}>Tên hàng hóa</th>
                                      <th style={{ padding: "8px 10px", textAlign: "right", color: "#475569" }}>Số lượng</th>
                                      <th style={{ padding: "8px 10px", textAlign: "right", color: "#475569" }}>Đơn giá</th>
                                      <th style={{ padding: "8px 10px", textAlign: "right", color: "#475569" }}>Thành tiền</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {!selectedRows.length ? (
                                      <tr>
                                        <td colSpan={6} style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>
                                          Chưa có lịch sử mua hàng với nhà cung cấp này
                                        </td>
                                      </tr>
                                    ) : (
                                      selectedRows.map((row) => (
                                        <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                            {dateVN(row.documentDate || row.accountingDate)}
                                          </td>
                                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                            <b style={{ color: "#2563eb" }}>{row.documentNo || row.invoiceNo || "Nhập kho"}</b>
                                            {row.warehouseName && (
                                              <small style={{ display: "block", color: "#94a3b8", fontSize: "10px" }}>
                                                {row.warehouseName}
                                              </small>
                                            )}
                                          </td>
                                          <td style={{ padding: "8px 10px" }}>
                                            <b>{row.itemName}</b>
                                            {row.description && (
                                              <small style={{ display: "block", color: "#64748b" }}>
                                                {row.description}
                                              </small>
                                            )}
                                          </td>
                                          <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                                            {fmt(row.quantity)} {row.unit}
                                          </td>
                                          <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                            {fmt(row.unitPrice)} ₫
                                          </td>
                                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                            {fmt(row.value)} ₫
                                          </td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
