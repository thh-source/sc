import React, { useState, useEffect, useMemo } from "react";
import { ProductCatalog } from "./ProductCatalog";
import { SupplierManagement } from "./SupplierManagement";
import { Boxes, Building2, Layers, TrendingUp, ShoppingBag, Banknote, ShieldCheck } from "lucide-react";
import type { Item, Supplier, PO, PurchaseHistory } from "../types";
import { fmt } from "../utils";

export interface CatalogManagementProps {
  initialTab?: "products" | "suppliers";
  products: Item[];
  setProducts: React.Dispatch<React.SetStateAction<Item[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  pos: PO[];
  purchaseHistory: PurchaseHistory[];
  onCreatePR: () => void;
  onAddSupplier: () => void;
  onNavigate?: (route: any) => void;
}

export function CatalogManagement({
  initialTab = "products",
  products,
  setProducts,
  suppliers,
  setSuppliers,
  pos,
  purchaseHistory,
  onCreatePR,
  onAddSupplier,
  onNavigate,
}: CatalogManagementProps) {
  const [activeTab, setActiveTab] = useState<"products" | "suppliers">(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: "products" | "suppliers") => {
    setActiveTab(tab);
    onNavigate?.({ view: "catalog", tab });
  };

  // Tính toán KPI cho Hàng hóa
  const productKpis = useMemo(() => {
    const categoriesCount = new Set(products.map((p) => p.category).filter(Boolean)).size;
    const historyItemCodes = new Set([
      ...purchaseHistory.map((h) => h.itemCode),
      ...pos.flatMap((po) => po.items.map((i) => i.code)),
    ]);
    const withHistoryCount = products.filter((p) => historyItemCodes.has(p.code)).length;
    const estimatedValueSum = products.reduce((sum, p) => sum + (Number(p.estimate) || 0), 0);

    return {
      total: products.length,
      categoriesCount,
      withHistoryCount,
      estimatedValueSum,
    };
  }, [products, pos, purchaseHistory]);

  // Tính toán KPI cho Nhà cung cấp
  const supplierKpis = useMemo(() => {
    const withBankCount = suppliers.filter((s) => s.bank?.trim() || s.bankAccount?.trim()).length;
    const historySupplierCodes = new Set([
      ...purchaseHistory.map((h) => h.supplierCode).filter(Boolean),
      ...purchaseHistory.map((h) => h.supplierName).filter(Boolean),
      ...pos.map((p) => p.supplierId).filter(Boolean),
    ]);
    const activeCount = suppliers.filter(
      (s) => historySupplierCodes.has(s.code) || historySupplierCodes.has(s.name) || historySupplierCodes.has(s.id)
    ).length;

    // Tổng tiền PO
    const totalPOValue = pos.reduce((sum, p) => {
      const poSum = (p.items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
      return sum + poSum;
    }, 0);

    return {
      total: suppliers.length,
      withBankCount,
      activeCount,
      totalPOValue,
    };
  }, [suppliers, pos, purchaseHistory]);

  return (
    <div
      className="catalog-management-container"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        backgroundColor: "#f8fafc",
      }}
    >
      {/* Stitch v2 Command Header Bar */}
      <div
        className="catalog-header-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              backgroundColor: activeTab === "products" ? "#eff6ff" : "#ecfdf5",
              color: activeTab === "products" ? "#2563eb" : "#059669",
              transition: "all 0.2s ease",
            }}
          >
            {activeTab === "products" ? <Boxes size={18} /> : <Building2 size={18} />}
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <b style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                {activeTab === "products" ? "Danh mục Hàng hóa & Vật tư" : "Danh bạ Nhà cung cấp"}
              </b>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "1px 8px",
                  borderRadius: "999px",
                  backgroundColor: activeTab === "products" ? "#dbeafe" : "#d1fae5",
                  color: activeTab === "products" ? "#1e40af" : "#065f46",
                }}
              >
                {activeTab === "products" ? `${products.length} mã` : `${suppliers.length} đối tác`}
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {activeTab === "products"
                ? "Tra cứu đơn giá dự kiến, thông số kỹ thuật và so sánh lịch sử mua theo PO"
                : "Quản lý thông tin thanh toán, mã số thuế, đầu mối liên hệ và lịch sử giao dịch"}
            </span>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div
          className="catalog-subtabs-nav"
          style={{
            display: "inline-flex",
            backgroundColor: "#f1f5f9",
            padding: "3px",
            borderRadius: "10px",
            gap: "4px",
            border: "1px solid #e2e8f0",
          }}
        >
          <button
            type="button"
            className={`catalog-tab-btn ${activeTab === "products" ? "active" : ""}`}
            onClick={() => handleTabChange("products")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "products" ? "#ffffff" : "transparent",
              color: activeTab === "products" ? "#1e40af" : "#64748b",
              boxShadow:
                activeTab === "products"
                  ? "0 2px 6px rgba(37,99,235,0.12), 0 1px 2px rgba(0,0,0,0.05)"
                  : "none",
              transition: "all 0.15s ease",
            }}
          >
            <Boxes
              size={15}
              style={{ color: activeTab === "products" ? "#2563eb" : "inherit" }}
            />
            <span>Hàng hóa</span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                backgroundColor: activeTab === "products" ? "#eff6ff" : "#e2e8f0",
                color: activeTab === "products" ? "#1d4ed8" : "#64748b",
                padding: "1px 7px",
                borderRadius: "999px",
              }}
            >
              {products.length}
            </span>
          </button>

          <button
            type="button"
            className={`catalog-tab-btn ${activeTab === "suppliers" ? "active" : ""}`}
            onClick={() => handleTabChange("suppliers")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "suppliers" ? "#ffffff" : "transparent",
              color: activeTab === "suppliers" ? "#065f46" : "#64748b",
              boxShadow:
                activeTab === "suppliers"
                  ? "0 2px 6px rgba(5,150,105,0.12), 0 1px 2px rgba(0,0,0,0.05)"
                  : "none",
              transition: "all 0.15s ease",
            }}
          >
            <Building2
              size={15}
              style={{ color: activeTab === "suppliers" ? "#059669" : "inherit" }}
            />
            <span>Nhà cung cấp</span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                backgroundColor: activeTab === "suppliers" ? "#ecfdf5" : "#e2e8f0",
                color: activeTab === "suppliers" ? "#047857" : "#64748b",
                padding: "1px 7px",
                borderRadius: "999px",
              }}
            >
              {suppliers.length}
            </span>
          </button>
        </div>
      </div>

      {/* Stitch v2 Bento KPI Summary Strip */}
      <div
        className="stitch-kpi-strip no-print"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "10px",
          padding: "10px 18px",
          backgroundColor: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {activeTab === "products" ? (
          <>
            <div className="stitch-kpi-card kpi-navy" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <Boxes size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>Tổng hàng hóa</small>
                <strong>{productKpis.total} mã</strong>
                <span className="stitch-kpi-sub">Đang quản lý trong hệ thống</span>
              </div>
            </div>

            <div className="stitch-kpi-card kpi-sky" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <Layers size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>Nhóm phân loại</small>
                <strong>{productKpis.categoriesCount} nhóm</strong>
                <span className="stitch-kpi-sub">Nguyên liệu, bao bì, hóa chất...</span>
              </div>
            </div>

            <div className="stitch-kpi-card kpi-emerald" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <ShoppingBag size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>Đã phát sinh mua</small>
                <strong>{productKpis.withHistoryCount} mã hàng</strong>
                <span className="stitch-kpi-sub">Có lịch sử nhập kho / PO</span>
              </div>
            </div>

            <div className="stitch-kpi-card kpi-orange" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <TrendingUp size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>Biến động đơn giá</small>
                <strong>Theo dõi real-time</strong>
                <span className="stitch-kpi-sub">So sánh từng lần mua</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="stitch-kpi-card kpi-emerald" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <Building2 size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>Tổng đối tác NCC</small>
                <strong>{supplierKpis.total} nhà cung cấp</strong>
                <span className="stitch-kpi-sub">Được chuẩn hóa danh bạ</span>
              </div>
            </div>

            <div className="stitch-kpi-card kpi-navy" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <Banknote size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>Giá trị đơn hàng PO</small>
                <strong>{fmt(supplierKpis.totalPOValue)} ₫</strong>
                <span className="stitch-kpi-sub">Tổng phát sinh từ các đơn PO</span>
              </div>
            </div>

            <div className="stitch-kpi-card kpi-sky" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <ShoppingBag size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>NCC có giao dịch</small>
                <strong>{supplierKpis.activeCount} đối tác</strong>
                <span className="stitch-kpi-sub">Đã xuất hiện trong PO / Nhập kho</span>
              </div>
            </div>

            <div className="stitch-kpi-card kpi-orange" style={{ margin: 0, padding: "10px 14px" }}>
              <div className="stitch-kpi-icon" style={{ width: 34, height: 34 }}>
                <ShieldCheck size={18} />
              </div>
              <div className="stitch-kpi-body">
                <small>Đã có tài khoản NH</small>
                <strong>{supplierKpis.withBankCount} / {supplierKpis.total} NCC</strong>
                <span className="stitch-kpi-sub">Sẵn sàng thanh toán chuyển khoản</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tab Body */}
      <div className="catalog-tab-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeTab === "products" ? (
          <ProductCatalog
            products={products}
            setProducts={setProducts}
            pos={pos}
            suppliers={suppliers}
            purchaseHistory={purchaseHistory}
            onCreatePR={onCreatePR}
          />
        ) : (
          <SupplierManagement
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            onAdd={onAddSupplier}
            purchaseHistory={purchaseHistory}
          />
        )}
      </div>
    </div>
  );
}
