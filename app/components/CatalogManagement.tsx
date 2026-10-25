import React, { useState, useEffect } from "react";
import { ProductCatalog } from "./ProductCatalog";
import { SupplierManagement } from "./SupplierManagement";
import { Boxes, Building2, Layers } from "lucide-react";
import type { Item, Supplier, PO, PurchaseHistory } from "../types";

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

  return (
    <div
      className="catalog-management-container"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Top Sub-tabs Switcher */}
      <div
        className="catalog-header-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              backgroundColor: "#eff6ff",
              color: "#2563eb",
            }}
          >
            <Layers size={17} />
          </span>
          <div>
            <b style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Danh mục
            </b>
            <span
              style={{
                marginLeft: "8px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              Quản lý tập trung Hàng hóa vật tư & Nhà cung cấp
            </span>
          </div>
        </div>

        <div
          className="catalog-subtabs-nav"
          style={{
            display: "inline-flex",
            backgroundColor: "#f1f5f9",
            padding: "3px",
            borderRadius: "8px",
            gap: "3px",
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
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "products" ? "#ffffff" : "transparent",
              color: activeTab === "products" ? "#0f172a" : "#64748b",
              boxShadow:
                activeTab === "products"
                  ? "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)"
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
                fontWeight: 700,
                backgroundColor: activeTab === "products" ? "#eff6ff" : "#e2e8f0",
                color: activeTab === "products" ? "#1d4ed8" : "#64748b",
                padding: "1px 6px",
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
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "suppliers" ? "#ffffff" : "transparent",
              color: activeTab === "suppliers" ? "#0f172a" : "#64748b",
              boxShadow:
                activeTab === "suppliers"
                  ? "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)"
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
                fontWeight: 700,
                backgroundColor: activeTab === "suppliers" ? "#ecfdf5" : "#e2e8f0",
                color: activeTab === "suppliers" ? "#047857" : "#64748b",
                padding: "1px 6px",
                borderRadius: "999px",
              }}
            >
              {suppliers.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Body */}
      <div className="catalog-tab-body" style={{ flex: 1, minHeight: 0 }}>
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
