import React, { useState, useMemo, Fragment } from "react";
import {
  Plus,
  FilePlus,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  Layers,
  Filter,
} from "lucide-react";
import { Item, Supplier, PurchaseHistory, PO } from "../types";
import { fmt, dateVN, emptyItem } from "../utils";
import { useTranslation } from "../i18n";

export function ProductCatalog({
  products,
  setProducts,
  pos,
  suppliers,
  purchaseHistory,
  onCreatePR,
}: {
  products: Item[];
  setProducts: React.Dispatch<React.SetStateAction<Item[]>>;
  pos: PO[];
  suppliers: Supplier[];
  purchaseHistory: PurchaseHistory[];
  onCreatePR: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [filterType, setFilterType] = useState<"all" | "has_history" | "price_changed" | "no_history">("all");
  const [expanded, setExpanded] = useState<number | null>(products[0]?.id || null);

  const categories = useMemo(() => {
    return [
      "Tất cả",
      ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
    ];
  }, [products]);

  // Compute purchase history for a given product
  const getProductHistory = (product: Item) => {
    const fromHistory = purchaseHistory
      .filter((row) => row.itemCode === product.code)
      .map((row) => ({
        date: row.documentDate || row.accountingDate,
        po: row.documentNo || row.invoiceNo || "Nhập kho",
        supplier: row.supplierName || "—",
        qty: row.quantity,
        price: row.unitPrice,
        source: "Nhập kho",
      }));

    const fromPOs = pos.flatMap((po) =>
      po.items
        .filter((i) => i.code === product.code)
        .map((i) => ({
          date: po.createdDate,
          po: po.number,
          supplier:
            suppliers.find((s) => s.id === po.supplierId)?.name || "—",
          qty: i.qty,
          price: i.price,
          source: "PO",
        }))
    );

    return [...fromHistory, ...fromPOs].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "")
    );
  };

  const normalizedQuery = query.trim().toLowerCase();

  const shown = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (category !== "Tất cả" && p.category !== category) return false;

      // Search query
      if (
        normalizedQuery &&
        ![p.code, p.name, p.spec, p.desc, p.unit, p.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }

      // Quick filter pills
      if (filterType !== "all") {
        const h = getProductHistory(p);
        if (filterType === "has_history" && h.length === 0) return false;
        if (filterType === "no_history" && h.length > 0) return false;
        if (filterType === "price_changed") {
          if (h.length < 2) return false;
          if (h[0].price === h[1].price) return false;
        }
      }

      return true;
    });
  }, [products, category, normalizedQuery, filterType, purchaseHistory, pos]);

  // Category color mapper for subtle enterprise badges
  const getCategoryBadgeStyle = (cat?: string) => {
    if (!cat) return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };
    const hash = cat.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const hues = [
      { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" }, // Blue
      { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" }, // Emerald
      { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" }, // Purple
      { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" }, // Orange
      { bg: "#fdf2f8", text: "#be185d", border: "#fbcfe8" }, // Pink
      { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4" }, // Teal
    ];
    return hues[hash % hues.length];
  };

  return (
    <section
      className="content product-page"
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
      {/* ── COMMAND TOOLBAR ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          backgroundColor: "#ffffff",
          padding: "10px 14px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          flexShrink: 0,
        }}
      >
        {/* Search Input */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#f8fafc",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "7px 12px",
            flex: "1 1 260px",
            maxWidth: "380px",
          }}
        >
          <Search size={16} style={{ color: "#64748b", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên vật tư, quy cách, ĐVT, phân loại..."
            style={{
              border: "none",
              outline: "none",
              backgroundColor: "transparent",
              width: "100%",
              fontSize: "13px",
              color: "#0f172a",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
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

        {/* Category Dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Layers size={15} style={{ color: "#64748b" }} />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#f8fafc",
              fontSize: "13px",
              fontWeight: 500,
              color: "#1e293b",
              cursor: "pointer",
              outline: "none",
              maxWidth: "200px",
            }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "Tất cả" ? "Tất cả phân loại" : c}
              </option>
            ))}
          </select>
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
            Tất cả ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("has_history")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: filterType === "has_history" ? 700 : 500,
              backgroundColor: filterType === "has_history" ? "#059669" : "#f1f5f9",
              color: filterType === "has_history" ? "#ffffff" : "#475569",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Đã từng mua
          </button>
          <button
            type="button"
            onClick={() => setFilterType("price_changed")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: filterType === "price_changed" ? 700 : 500,
              backgroundColor: filterType === "price_changed" ? "#d97706" : "#f1f5f9",
              color: filterType === "price_changed" ? "#ffffff" : "#475569",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Có biến động giá
          </button>
          <button
            type="button"
            onClick={() => setFilterType("no_history")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: filterType === "no_history" ? 700 : 500,
              backgroundColor: filterType === "no_history" ? "#64748b" : "#f1f5f9",
              color: filterType === "no_history" ? "#ffffff" : "#475569",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Chưa phát sinh mua
          </button>
        </div>

        {/* Counter and Action Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginLeft: "auto",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
            Hiển thị <b style={{ color: "#0f172a" }}>{shown.length}</b> / {products.length} hàng hóa
          </span>

          <button
            type="button"
            onClick={() =>
              setProducts((p) => [
                ...p,
                { ...emptyItem(p.length), category: "Hàng hóa mới" },
              ])
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
          >
            <Plus size={15} style={{ color: "#2563eb" }} /> Thêm hàng
          </button>

          <button
            type="button"
            onClick={onCreatePR}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(37,99,235,0.25)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
          >
            <FilePlus size={15} /> Tạo PR
          </button>
        </div>
      </div>

      {/* ── PRODUCTS TABLE (DESKTOP) ── */}
      <div
        className="product-table-panel"
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          overflow: "auto",
          position: "relative",
        }}
      >
        <table
          className="product-list-table"
          style={{
            width: "100%",
            minWidth: "1050px",
            borderCollapse: "separate",
            borderSpacing: 0,
            textAlign: "left",
            fontSize: "13px",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f8fafc" }}>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  minWidth: "220px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                TÊN VẬT TƯ HÀNG HÓA
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  width: "140px",
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                PHÂN LOẠI
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  minWidth: "120px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                QUY CÁCH
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  width: "70px",
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                ĐVT
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  width: "130px",
                  textAlign: "right",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                ĐƠN GIÁ DỰ KIẾN
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  minWidth: "200px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                LẦN MUA GẦN NHẤT
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  width: "110px",
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                BIẾN ĐỘNG GIÁ
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "#f8fafc",
                  borderBottom: "2px solid #cbd5e1",
                  padding: "10px 14px",
                  width: "110px",
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                THAO TÁC
              </th>
            </tr>
          </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "48px 16px",
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    <Package size={36} style={{ color: "#cbd5e1", margin: "0 auto 8px" }} />
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "#334155" }}>
                      Không tìm thấy mặt hàng nào phù hợp
                    </div>
                    <div style={{ fontSize: "12px", marginTop: "4px" }}>
                      Thử điều chỉnh từ khóa tìm kiếm hoặc bỏ chọn các bộ lọc phân loại
                    </div>
                  </td>
                </tr>
              ) : (
                shown.map((p) => {
                  const h = getProductHistory(p);
                  const latest = h[0];
                  const previous = h[1];
                  const change =
                    latest && previous && previous.price > 0
                      ? Math.round(
                          ((latest.price - previous.price) / previous.price) * 100
                        )
                      : 0;
                  const isExp = expanded === p.id;
                  const catStyle = getCategoryBadgeStyle(p.category);

                  // Compute summary stats for the expanded drawer
                  const prices = h.map((x) => x.price).filter((pr) => pr > 0);
                  const minPrice = prices.length ? Math.min(...prices) : 0;
                  const maxPrice = prices.length ? Math.max(...prices) : 0;
                  const totalQty = h.reduce((acc, x) => acc + (x.qty || 0), 0);

                  return (
                    <Fragment key={p.id}>
                      <tr
                        style={{
                          borderBottom: isExp ? "none" : "1px solid #f1f5f9",
                          backgroundColor: isExp ? "#f8fafc" : "#ffffff",
                          transition: "background-color 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!isExp) e.currentTarget.style.backgroundColor = "#f8fafc";
                        }}
                        onMouseLeave={(e) => {
                          if (!isExp) e.currentTarget.style.backgroundColor = "#ffffff";
                        }}
                      >
                        {/* Item Name & Spec */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "13px", lineHeight: "1.3" }}>
                            {p.name || (p as any).itemName || (p as any).item_name || "Hàng hóa mới"}
                          </div>
                          {(p.desc || p.spec) && (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#64748b",
                                marginTop: "3px",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {p.desc || p.spec}
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td style={{ padding: "12px 14px", textAlign: "center", verticalAlign: "middle" }}>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "3px 8px",
                              borderRadius: "6px",
                              backgroundColor: catStyle.bg,
                              color: catStyle.text,
                              border: `1px solid ${catStyle.border}`,
                              maxWidth: "130px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={p.category}
                          >
                            {p.category || "Chưa phân loại"}
                          </span>
                        </td>

                        {/* Specification */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: "12px", color: "#334155" }}>
                            {p.spec || "—"}
                          </span>
                        </td>

                        {/* Unit */}
                        <td style={{ padding: "12px 14px", textAlign: "center", verticalAlign: "middle" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 7px",
                              fontSize: "11px",
                              fontWeight: 600,
                              borderRadius: "4px",
                              backgroundColor: "#f1f5f9",
                              color: "#475569",
                              border: "1px solid #e2e8f0",
                            }}
                          >
                            {p.unit || "—"}
                          </span>
                        </td>

                        {/* Estimated Price */}
                        <td
                          style={{
                            padding: "12px 14px",
                            textAlign: "right",
                            verticalAlign: "middle",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 700,
                            color: "#0f172a",
                            fontSize: "13px",
                          }}
                        >
                          {fmt(p.estimate)} <span style={{ fontSize: "10px", color: "#64748b" }}>₫</span>
                        </td>

                        {/* Last Purchase */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          {latest ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                    color: "#0f172a",
                                  }}
                                >
                                  {latest.po}
                                </span>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    padding: "1px 5px",
                                    borderRadius: "4px",
                                    backgroundColor: latest.source === "PO" ? "#eff6ff" : "#f0fdf4",
                                    color: latest.source === "PO" ? "#1d4ed8" : "#15803d",
                                    border: `1px solid ${latest.source === "PO" ? "#bfdbfe" : "#bbf7d0"}`,
                                  }}
                                >
                                  {latest.source}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#64748b",
                                  maxWidth: "240px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={`${dateVN(latest.date)} · ${latest.supplier}`}
                              >
                                {dateVN(latest.date)} · {latest.supplier}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>
                              Chưa phát sinh mua
                            </span>
                          )}
                        </td>

                        {/* Price Trend */}
                        <td style={{ padding: "12px 14px", textAlign: "center", verticalAlign: "middle" }}>
                          {latest && previous ? (
                            change > 0 ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  backgroundColor: "#fff1f2",
                                  color: "#e11d48",
                                  border: "1px solid #fecdd3",
                                }}
                              >
                                <TrendingUp size={12} /> +{change}%
                              </span>
                            ) : change < 0 ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  backgroundColor: "#ecfdf5",
                                  color: "#059669",
                                  border: "1px solid #a7f3d0",
                                }}
                              >
                                <TrendingDown size={12} /> {change}%
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  backgroundColor: "#f8fafc",
                                  color: "#64748b",
                                  border: "1px solid #e2e8f0",
                                }}
                              >
                                <Minus size={12} /> 0%
                              </span>
                            )
                          ) : (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "12px 14px", textAlign: "center", verticalAlign: "middle" }}>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : p.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "5px 9px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              backgroundColor: isExp ? "#e0e7ff" : "#f1f5f9",
                              color: isExp ? "#3730a3" : "#334155",
                              border: `1px solid ${isExp ? "#c7d2fe" : "#cbd5e1"}`,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isExp ? (
                              <>
                                Thu gọn <ChevronUp size={13} />
                              </>
                            ) : (
                              <>
                                Lịch sử giá <ChevronDown size={13} />
                              </>
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* ── EXPANDED BENTO DRAWER ── */}
                      {isExp && (
                        <tr style={{ backgroundColor: "#f8fafc" }}>
                          <td
                            colSpan={9}
                            style={{
                              padding: "0 16px 20px 16px",
                              borderBottom: "2px solid #e2e8f0",
                            }}
                          >
                            <div
                              style={{
                                backgroundColor: "#ffffff",
                                borderRadius: "10px",
                                border: "1px solid #cbd5e1",
                                padding: "16px",
                                marginTop: "4px",
                                boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                              }}
                            >
                              {/* Drawer Header */}
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "10px",
                                  paddingBottom: "12px",
                                  borderBottom: "1px solid #f1f5f9",
                                  marginBottom: "14px",
                                }}
                              >
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <h4
                                      style={{
                                        margin: 0,
                                        fontSize: "14px",
                                        fontWeight: 700,
                                        color: "#0f172a",
                                      }}
                                    >
                                      Lịch sử giao dịch & Biến động giá: {p.name}
                                    </h4>
                                  </div>
                                  <p
                                    style={{
                                      margin: "3px 0 0",
                                      fontSize: "12px",
                                      color: "#64748b",
                                    }}
                                  >
                                    Tổng hợp tất cả lần nhập kho và đơn đặt hàng PO thực tế của mặt hàng này
                                  </p>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <button
                                    type="button"
                                    onClick={onCreatePR}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      padding: "6px 12px",
                                      borderRadius: "6px",
                                      backgroundColor: "#eff6ff",
                                      color: "#1d4ed8",
                                      border: "1px solid #bfdbfe",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <FilePlus size={14} /> Lập PR cho mặt hàng này
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpanded(null)}
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      backgroundColor: "#f1f5f9",
                                      color: "#64748b",
                                      border: "1px solid #e2e8f0",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Đóng ✕
                                  </button>
                                </div>
                              </div>

                              {/* Mini Bento Metric Strip */}
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
                                    backgroundColor: "#f8fafc",
                                    padding: "10px 14px",
                                    borderRadius: "8px",
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                                    LẦN MUA GẦN NHẤT
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 800,
                                      color: "#0f172a",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {latest ? `${fmt(latest.price)} ₫` : "—"}
                                  </div>
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                    {latest ? `${dateVN(latest.date)} · ${latest.po}` : "Chưa có giao dịch"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    backgroundColor: "#f8fafc",
                                    padding: "10px 14px",
                                    borderRadius: "8px",
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  <div style={{ fontSize: "11px", color: "#047857", fontWeight: 600 }}>
                                    ĐƠN GIÁ THẤP NHẤT
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 800,
                                      color: "#047857",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {minPrice ? `${fmt(minPrice)} ₫` : "—"}
                                  </div>
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                    Đơn giá tối ưu từng mua
                                  </div>
                                </div>

                                <div
                                  style={{
                                    backgroundColor: "#f8fafc",
                                    padding: "10px 14px",
                                    borderRadius: "8px",
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  <div style={{ fontSize: "11px", color: "#b45309", fontWeight: 600 }}>
                                    ĐƠN GIÁ CAO NHẤT
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 800,
                                      color: "#b45309",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {maxPrice ? `${fmt(maxPrice)} ₫` : "—"}
                                  </div>
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                    Đỉnh giá cao nhất ghi nhận
                                  </div>
                                </div>

                                <div
                                  style={{
                                    backgroundColor: "#f8fafc",
                                    padding: "10px 14px",
                                    borderRadius: "8px",
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  <div style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600 }}>
                                    TỔNG LƯỢNG ĐÃ MUA
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 800,
                                      color: "#2563eb",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {fmt(totalQty)} <span style={{ fontSize: "11px" }}>{p.unit}</span>
                                  </div>
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                    {h.length} lần phát sinh nhập
                                  </div>
                                </div>
                              </div>

                              {/* Price History Table */}
                              <div
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                  overflow: "hidden",
                                }}
                              >
                                <table
                                  style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                    fontSize: "12px",
                                  }}
                                >
                                  <thead>
                                    <tr
                                      style={{
                                        backgroundColor: "#f8fafc",
                                        borderBottom: "1px solid #e2e8f0",
                                        color: "#475569",
                                        fontWeight: 600,
                                        fontSize: "11px",
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      <th style={{ padding: "8px 12px", width: "95px" }}>NGÀY GHI NHẬN</th>
                                      <th style={{ padding: "8px 12px", width: "110px" }}>SỐ CHỨNG TỪ / PO</th>
                                      <th style={{ padding: "8px 12px" }}>NHÀ CUNG CẤP</th>
                                      <th style={{ padding: "8px 12px", width: "90px", textAlign: "center" }}>NGUỒN</th>
                                      <th style={{ padding: "8px 12px", width: "90px", textAlign: "right" }}>SỐ LƯỢNG</th>
                                      <th style={{ padding: "8px 12px", width: "110px", textAlign: "right" }}>ĐƠN GIÁ</th>
                                      <th style={{ padding: "8px 12px", width: "120px", textAlign: "right" }}>THÀNH TIỀN</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {h.length === 0 ? (
                                      <tr>
                                        <td
                                          colSpan={7}
                                          style={{
                                            padding: "24px 12px",
                                            textAlign: "center",
                                            color: "#64748b",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          Chưa có lịch sử mua hàng cho mặt hàng này.
                                        </td>
                                      </tr>
                                    ) : (
                                      h.map((x, i) => (
                                        <tr
                                          key={i}
                                          style={{
                                            borderBottom: i === h.length - 1 ? "none" : "1px solid #f1f5f9",
                                            backgroundColor: i === 0 ? "#fbfcfe" : "#ffffff",
                                          }}
                                        >
                                          <td style={{ padding: "8px 12px", color: "#334155" }}>
                                            {dateVN(x.date)}
                                          </td>
                                          <td style={{ padding: "8px 12px" }}>
                                            <b style={{ fontFamily: "monospace", color: "#1e40af" }}>
                                              {x.po}
                                            </b>
                                          </td>
                                          <td style={{ padding: "8px 12px", color: "#0f172a", fontWeight: 500 }}>
                                            {x.supplier}
                                          </td>
                                          <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                            <span
                                              style={{
                                                fontSize: "10px",
                                                fontWeight: 600,
                                                padding: "1px 6px",
                                                borderRadius: "4px",
                                                backgroundColor: x.source === "PO" ? "#eff6ff" : "#f0fdf4",
                                                color: x.source === "PO" ? "#1d4ed8" : "#15803d",
                                              }}
                                            >
                                              {x.source}
                                            </span>
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 12px",
                                              textAlign: "right",
                                              fontWeight: 600,
                                              color: "#0f172a",
                                            }}
                                          >
                                            {x.qty} <span style={{ color: "#64748b", fontSize: "11px" }}>{p.unit}</span>
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 12px",
                                              textAlign: "right",
                                              fontWeight: 700,
                                              color: "#0f172a",
                                              fontVariantNumeric: "tabular-nums",
                                            }}
                                          >
                                            {fmt(x.price)} ₫
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 12px",
                                              textAlign: "right",
                                              fontWeight: 700,
                                              color: "#2563eb",
                                              fontVariantNumeric: "tabular-nums",
                                            }}
                                          >
                                            {fmt(x.qty * x.price)} ₫
                                          </td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
      </div>

      {/* ── MOBILE RECORD CARDS ── */}
      <div className="mobile-record-list" style={{ display: "none" }}>
        {shown.map((p) => {
          const h = getProductHistory(p);
          const latest = h[0];
          const previous = h[1];
          const change =
            latest && previous && previous.price > 0
              ? Math.round(((latest.price - previous.price) / previous.price) * 100)
              : 0;
          const isExp = expanded === p.id;
          const catStyle = getCategoryBadgeStyle(p.category);

          return (
            <div
              key={p.id}
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "14px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                    {p.name}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    backgroundColor: catStyle.bg,
                    color: catStyle.text,
                  }}
                >
                  {p.category || "Chưa phân loại"}
                </span>
              </div>

              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "10px" }}>
                {p.spec || p.desc || "Chưa có quy cách mô tả"}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  backgroundColor: "#f8fafc",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <span style={{ color: "#64748b", fontSize: "11px" }}>Đơn vị tính: </span>
                  <b style={{ color: "#0f172a" }}>{p.unit}</b>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontSize: "11px" }}>Đơn giá DK: </span>
                  <b style={{ color: "#0f172a" }}>{fmt(p.estimate)} ₫</b>
                </div>
                {latest && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>Mua gần nhất: </span>
                    <b style={{ color: "#0f172a" }}>{latest.po}</b> ({fmt(latest.price)} ₫)
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  {latest && previous && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: change <= 0 ? "#059669" : "#e11d48",
                      }}
                    >
                      {change <= 0 ? "↓" : "↑"} {Math.abs(change)}% so với lần trước
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(isExp ? null : p.id)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    backgroundColor: isExp ? "#e0e7ff" : "#f1f5f9",
                    color: isExp ? "#3730a3" : "#334155",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {isExp ? "Thu gọn ▴" : `Lịch sử (${h.length}) ▾`}
                </button>
              </div>

              {isExp && (
                <div style={{ marginTop: "12px", borderTop: "1px dashed #cbd5e1", paddingTop: "10px" }}>
                  {h.length === 0 ? (
                    <small style={{ color: "#64748b" }}>Chưa có lịch sử mua hàng</small>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {h.slice(0, 5).map((row, idx) => (
                        <div
                          key={idx}
                          style={{
                            fontSize: "11px",
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "4px 0",
                            borderBottom: "1px dashed #f1f5f9",
                          }}
                        >
                          <span>{dateVN(row.date)} · {row.po} ({row.source})</span>
                          <b style={{ color: "#0f172a" }}>{fmt(row.price)} ₫ ({row.qty} {p.unit})</b>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
