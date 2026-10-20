"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { PR, Item } from "../types";
import { fmt } from "../utils";
import { normName } from "../payment-utils";

export interface SelectedItemData {
  id?: number | string;
  name: string;
  spec?: string;
  unit: string;
  qty: number;
  price: number;
  code?: string;
  category?: string;
  sourcePrNumber?: string;
  sourcePrId?: number;
}

export interface TreeProductPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  prs?: PR[];
  products?: Item[];
  selectedPRId?: number | string;
  existingItemNames?: string[];
  onSelectItems: (items: SelectedItemData[]) => void;
  onAddProduct?: (newProduct: Item) => void;
  title?: string;
}

export function TreeProductPickerModal({
  isOpen,
  onClose,
  prs = [],
  products = [],
  selectedPRId,
  existingItemNames = [],
  onSelectItems,
  onAddProduct,
  title = "Chọn sản phẩm theo Cây thư mục PR & Danh mục",
}: TreeProductPickerModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Active tab: 'pr' (Cây PR) or 'catalog' (Cây danh mục)
  const [activeTab, setActiveTab] = useState<"pr" | "catalog">(
    selectedPRId ? "pr" : "pr"
  );

  // Search keyword
  const [searchTerm, setSearchTerm] = useState("");

  // Expanded tree nodes
  // For PR tree: set of keys like "dept:Phòng Cung ứng", "pr:12"
  // For Catalog tree: set of keys like "cat:Hóa chất"
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (selectedPRId) {
      initial.add(`pr:${selectedPRId}`);
      const prObj = prs.find((p) => String(p.id) === String(selectedPRId));
      if (prObj?.department) {
        initial.add(`dept:${prObj.department}`);
      }
    }
    return initial;
  });

  // Selected items map: key -> SelectedItemData
  const [selectedMap, setSelectedMap] = useState<Map<string, SelectedItemData>>(
    new Map()
  );

  // Set of normalized existing names in the parent order to show indicator
  const existingSet = useMemo(() => {
    return new Set(existingItemNames.map((n) => normName(n)));
  }, [existingItemNames]);

  // Set of manually collapsed nodes when searching
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Reset search and selection cleanly when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setCollapsedNodes(new Set());
      setSelectedMap(new Map());
      if (selectedPRId) {
        const prObj = prs.find((p) => String(p.id) === String(selectedPRId));
        setExpandedNodes((prev) => {
          const next = new Set(prev);
          next.add(`pr:${selectedPRId}`);
          if (prObj?.department) {
            next.add(`dept:${prObj.department}`);
          }
          return next;
        });
      }
    }
  }, [isOpen, selectedPRId]);

  const q = normName(searchTerm);

  // Expand / collapse helper
  const toggleNode = (nodeKey: string) => {
    if (q) {
      setCollapsedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(nodeKey)) next.delete(nodeKey);
        else next.add(nodeKey);
        return next;
      });
    } else {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(nodeKey)) next.delete(nodeKey);
        else next.add(nodeKey);
        return next;
      });
    }
  };

  const expandAll = (allKeys: string[]) => {
    if (q) {
      setCollapsedNodes(new Set());
    } else {
      setExpandedNodes(new Set(allKeys));
    }
  };

  const collapseAll = (keys?: string[]) => {
    if (q) {
      const allKeys = keys || (activeTab === "pr" ? allPRNodeKeys : allCatalogNodeKeys);
      setCollapsedNodes(new Set(allKeys));
    } else {
      setExpandedNodes(new Set());
    }
  };

  // -------------------------------------------------------------
  // 1. Process PR Tree Hierarchy (Department -> PR -> Items)
  // -------------------------------------------------------------
  const prTreeData = useMemo(() => {
    // Group PRs by department
    const deptMap = new Map<
      string,
      {
        dept: string;
        prs: {
          pr: PR;
          items: Item[];
          isLinked: boolean;
        }[];
      }
    >();

    prs.forEach((pr) => {
      const deptName = (pr.department || "Phòng ban khác").trim();
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, { dept: deptName, prs: [] });
      }

      const isLinked = String(pr.id) === String(selectedPRId);
      const items = pr.items || [];

      deptMap.get(deptName)!.prs.push({
        pr,
        items,
        isLinked,
      });
    });

    return Array.from(deptMap.values());
  }, [prs, selectedPRId]);

  // Filtered PR Tree according to search
  const filteredPRTree = useMemo(() => {
    if (!q) {
      return prTreeData;
    }

    return prTreeData
      .map((deptGroup) => {
        const deptMatches = normName(deptGroup.dept).includes(q);

        const filteredPrs = deptGroup.prs
          .map((prGroup) => {
            const prMatches =
              normName(prGroup.pr.number).includes(q) ||
              normName(prGroup.pr.purpose || "").includes(q);

            const filteredItems = prGroup.items.filter((it) => {
              if (deptMatches || prMatches) return true;
              return (
                normName(it.name).includes(q) ||
                normName(it.spec || "").includes(q) ||
                normName(it.code || "").includes(q) ||
                normName(it.category || "").includes(q)
              );
            });

            if (filteredItems.length > 0 || prMatches) {
              return {
                ...prGroup,
                items: filteredItems,
              };
            }
            return null;
          })
          .filter(Boolean) as typeof deptGroup.prs;

        if (filteredPrs.length > 0 || deptMatches) {
          return {
            ...deptGroup,
            prs: filteredPrs,
          };
        }
        return null;
      })
      .filter(Boolean) as typeof prTreeData;
  }, [prTreeData, q]);



  // Count matching PR items
  const totalMatchingPRItems = useMemo(() => {
    return filteredPRTree.reduce(
      (sum, d) => sum + d.prs.reduce((s, p) => s + p.items.length, 0),
      0
    );
  }, [filteredPRTree]);

  // All PR node keys for Expand All
  const allPRNodeKeys = useMemo(() => {
    const keys: string[] = [];
    prTreeData.forEach((d) => {
      keys.push(`dept:${d.dept}`);
      d.prs.forEach((p) => keys.push(`pr:${p.pr.id}`));
    });
    return keys;
  }, [prTreeData]);

  // -------------------------------------------------------------
  // 2. Process Catalog Products Tree (Category -> Products)
  // -------------------------------------------------------------
  const catalogTreeData = useMemo(() => {
    const catMap = new Map<string, Item[]>();
    products.forEach((prod) => {
      const cat = (prod.category || "Hàng hóa chung").trim();
      if (!catMap.has(cat)) {
        catMap.set(cat, []);
      }
      catMap.get(cat)!.push(prod);
    });

    return Array.from(catMap.entries()).map(([cat, prods]) => ({
      cat,
      products: prods,
    }));
  }, [products]);

  // Filtered Catalog Tree according to search
  const filteredCatalogTree = useMemo(() => {
    if (!q) return catalogTreeData;

    return catalogTreeData
      .map((catGroup) => {
        const catMatches = normName(catGroup.cat).includes(q);
        const filteredProds = catGroup.products.filter((p) => {
          if (catMatches) return true;
          return (
            normName(p.name).includes(q) ||
            normName(p.code || "").includes(q) ||
            normName(p.spec || "").includes(q) ||
            normName(p.desc || "").includes(q)
          );
        });

        if (filteredProds.length > 0 || catMatches) {
          return {
            ...catGroup,
            products: filteredProds,
          };
        }
        return null;
      })
      .filter(Boolean) as typeof catalogTreeData;
  }, [catalogTreeData, q]);


  const totalMatchingCatalogItems = useMemo(() => {
    return filteredCatalogTree.reduce((sum, c) => sum + c.products.length, 0);
  }, [filteredCatalogTree]);

  const allCatalogNodeKeys = useMemo(() => {
    return catalogTreeData.map((c) => `cat:${c.cat}`);
  }, [catalogTreeData]);

  // -------------------------------------------------------------
  // Toggle Selection Handlers
  // -------------------------------------------------------------
  const handleToggleItem = (key: string, itemData: SelectedItemData) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, itemData);
      }
      return next;
    });
  };

  // Toggle all items in a PR
  const handleTogglePR = (pr: PR, items: Item[]) => {
    const allSelected = items.every((it) =>
      selectedMap.has(`pr-${pr.id}-it-${it.id}`)
    );
    setSelectedMap((prev) => {
      const next = new Map(prev);
      items.forEach((it) => {
        const k = `pr-${pr.id}-it-${it.id}`;
        if (allSelected) {
          next.delete(k);
        } else {
          next.set(k, {
            id: it.id,
            name: it.name,
            spec: it.spec || "",
            unit: it.unit || "Cái",
            qty: it.qty || 1,
            price: it.estimate || 0,
            code: it.code,
            category: it.category || "Hàng hóa",
            sourcePrNumber: pr.number,
            sourcePrId: pr.id,
          });
        }
      });
      return next;
    });
  };

  // Toggle all items in a Category
  const handleToggleCategory = (cat: string, catProducts: Item[]) => {
    const allSelected = catProducts.every((p) =>
      selectedMap.has(`prod-${p.id}`)
    );
    setSelectedMap((prev) => {
      const next = new Map(prev);
      catProducts.forEach((p) => {
        const k = `prod-${p.id}`;
        if (allSelected) {
          next.delete(k);
        } else {
          next.set(k, {
            id: p.id,
            name: p.name,
            spec: p.spec || "",
            unit: p.unit || "Cái",
            qty: 1,
            price: p.estimate || 0,
            code: p.code,
            category: p.category || cat,
          });
        }
      });
      return next;
    });
  };

  // Confirm selection
  const handleConfirmSelection = () => {
    const items = Array.from(selectedMap.values());
    if (items.length === 0) {
      alert("Vui lòng tích chọn ít nhất 1 mặt hàng.");
      return;
    }
    onSelectItems(items);
    onClose();
  };

  // Add single item immediately
  const handleAddSingleItem = (itemData: SelectedItemData) => {
    onSelectItems([itemData]);
    onClose();
  };

  // Add new custom product directly from search
  const handleCreateAndSelectCustomProduct = () => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    const nextCode = `VT-${String(products.length + 1).padStart(2, "0")}`;
    const newProd: Item = {
      id: Date.now(),
      code: nextCode,
      category: "Vật tư mới",
      name: trimmed,
      desc: "",
      spec: "",
      unit: "Cái",
      qty: 1,
      estimate: 0,
    };
    onAddProduct?.(newProd);
    onSelectItems([
      {
        id: newProd.id,
        name: newProd.name,
        spec: "",
        unit: "Cái",
        qty: 1,
        price: 0,
        code: nextCode,
        category: "Vật tư mới",
      },
    ]);
    onClose();
  };

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="payment-modal-overlay"
      style={{
        zIndex: 99999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="payment-modal-card"
        style={{
          width: "92vw",
          maxWidth: "1050px",
          height: "88vh",
          maxHeight: "920px",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: "16px 20px",
            background: "linear-gradient(to right, #f8fafc, #f1f5f9)",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>🌲</span>
              <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a", fontWeight: 700 }}>
                {title}
              </h3>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
              Duyệt theo cây phòng ban / số PR hoặc danh mục chung · Tích chọn nhiều mặt hàng · Tìm kiếm thời gian thực
            </div>
          </div>
          <button
            type="button"
            className="payment-modal-close"
            style={{ fontSize: "22px", color: "#64748b", cursor: "pointer", border: 0, background: "none" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* TOOLBAR: TABS + UNIVERSAL SEARCH + EXPAND/COLLAPSE */}
        <div
          style={{
            padding: "12px 20px",
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className={`payment-tab-btn ${activeTab === "pr" ? "active" : ""}`}
                style={{
                  padding: "7px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: activeTab === "pr" ? "#0284c7" : "#cbd5e1",
                  background: activeTab === "pr" ? "#0284c7" : "#ffffff",
                  color: activeTab === "pr" ? "#ffffff" : "#334155",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => setActiveTab("pr")}
              >
                <span>📋 Cây thư mục PR ({prs.length} phiếu PR)</span>
              </button>
              <button
                type="button"
                className={`payment-tab-btn ${activeTab === "catalog" ? "active" : ""}`}
                style={{
                  padding: "7px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: activeTab === "catalog" ? "#0284c7" : "#cbd5e1",
                  background: activeTab === "catalog" ? "#0284c7" : "#ffffff",
                  color: activeTab === "catalog" ? "#ffffff" : "#334155",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => setActiveTab("catalog")}
              >
                <span>📦 Cây Danh mục hàng ({products.length} sản phẩm)</span>
              </button>
            </div>

            {/* Tree expansion toggles */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                className="payment-btn payment-btn-sm"
                style={{ fontSize: "11.5px", padding: "4px 10px" }}
                onClick={() =>
                  expandAll(activeTab === "pr" ? allPRNodeKeys : allCatalogNodeKeys)
                }
              >
                ⊞ Mở rộng tất cả
              </button>
              <button
                type="button"
                className="payment-btn payment-btn-sm"
                style={{ fontSize: "11.5px", padding: "4px 10px" }}
                onClick={() => collapseAll()}
              >
                ⊟ Thu gọn tất cả
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ position: "relative", width: "100%" }}>
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "15px",
                color: "#64748b",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              autoFocus
              className="payment-input"
              style={{
                width: "100%",
                paddingLeft: "36px",
                paddingRight: searchTerm ? "32px" : "12px",
                height: "38px",
                fontSize: "13px",
                borderRadius: "8px",
                borderColor: searchTerm ? "#0284c7" : "#cbd5e1",
                boxShadow: searchTerm ? "0 0 0 2px rgba(2, 132, 199, 0.15)" : "none",
                boxSizing: "border-box",
              }}
              placeholder={
                activeTab === "pr"
                  ? "Tìm kiếm tên hàng, quy cách, mã PR (vd: PR-2026-0001), hoặc tên phòng ban..."
                  : "Tìm kiếm theo tên sản phẩm, mã hàng, quy cách, phân loại..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: 0,
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
                onClick={() => setSearchTerm("")}
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Status & Helpers */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
            <span style={{ color: searchTerm ? "#0284c7" : "#64748b", fontWeight: searchTerm ? 600 : 400 }}>
              {activeTab === "pr"
                ? `Hiển thị ${totalMatchingPRItems} mặt hàng trong ${filteredPRTree.length} phòng ban / đơn vị`
                : `Hiển thị ${totalMatchingCatalogItems} sản phẩm trong ${filteredCatalogTree.length} nhóm hàng`}
              {searchTerm && ` (khớp từ khóa "${searchTerm}")`}
            </span>

            {selectedMap.size > 0 && (
              <span style={{ color: "#16a34a", fontWeight: 700 }}>
                ✓ Đang tích chọn {selectedMap.size} mặt hàng
              </span>
            )}
          </div>
        </div>

        {/* MODAL BODY: TREE VIEW SCROLL AREA */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            background: "#f8fafc",
          }}
        >
          {/* TAB 1: PR TREE (Department -> PR -> Items) */}
          {activeTab === "pr" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredPRTree.map((deptGroup) => {
                const deptKey = `dept:${deptGroup.dept}`;
                const isDeptExpanded = q ? !collapsedNodes.has(deptKey) : expandedNodes.has(deptKey);
                const deptItemCount = deptGroup.prs.reduce(
                  (s, p) => s + p.items.length,
                  0
                );

                return (
                  <div
                    key={deptKey}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Level 1: Department Header */}
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#f1f5f9",
                        borderBottom: isDeptExpanded ? "1px solid #e2e8f0" : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      onClick={() => toggleNode(deptKey)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "13px", color: "#64748b" }}>
                          {isDeptExpanded ? "▼" : "▶"}
                        </span>
                        <span style={{ fontSize: "16px" }}>📁</span>
                        <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#1e293b" }}>
                          {deptGroup.dept}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 7px",
                            background: "#e2e8f0",
                            borderRadius: "12px",
                            color: "#475569",
                            fontWeight: 600,
                          }}
                        >
                          {deptGroup.prs.length} phiếu PR · {deptItemCount} mặt hàng
                        </span>
                      </div>
                    </div>

                    {/* Department Children: PRs */}
                    {isDeptExpanded && (
                      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {deptGroup.prs.map(({ pr, items, isLinked }) => {
                          const prKey = `pr:${pr.id}`;
                          const isPrExpanded = q ? !collapsedNodes.has(prKey) : expandedNodes.has(prKey);
                          const allPrSelected =
                            items.length > 0 &&
                            items.every((it) =>
                              selectedMap.has(`pr-${pr.id}-it-${it.id}`)
                            );

                          return (
                            <div
                              key={prKey}
                              style={{
                                border: isLinked ? "2px solid #38bdf8" : "1px solid #e2e8f0",
                                background: isLinked ? "#f0f9ff" : "#ffffff",
                                borderRadius: "8px",
                                overflow: "hidden",
                              }}
                            >
                              {/* Level 2: PR Header */}
                              <div
                                style={{
                                  padding: "8px 12px",
                                  background: isLinked ? "#e0f2fe" : "#f8fafc",
                                  borderBottom: isPrExpanded ? "1px solid #e2e8f0" : "none",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                                onClick={() => toggleNode(prKey)}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <input
                                    type="checkbox"
                                    style={{ cursor: "pointer", margin: 0 }}
                                    checked={allPrSelected}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => handleTogglePR(pr, items)}
                                    title="Tích để chọn/bỏ chọn toàn bộ mặt hàng của PR này"
                                  />
                                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                                    {isPrExpanded ? "▼" : "▶"}
                                  </span>
                                  <span style={{ fontSize: "15px" }}>📄</span>
                                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#0284c7", fontFamily: "monospace" }}>
                                    {pr.number}
                                  </span>
                                  {pr.purpose && (
                                    <span style={{ fontSize: "12px", color: "#334155", maxWidth: "420px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pr.purpose}>
                                      — {pr.purpose}
                                    </span>
                                  )}
                                  {isLinked && (
                                    <span
                                      style={{
                                        fontSize: "10.5px",
                                        padding: "1px 6px",
                                        background: "#0284c7",
                                        color: "#ffffff",
                                        borderRadius: "4px",
                                        fontWeight: 700,
                                      }}
                                    >
                                      📌 PR đang liên kết
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                                    {items.length} mặt hàng
                                  </span>
                                </div>
                              </div>

                              {/* Level 3: PR Items List */}
                              {isPrExpanded && (
                                <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: "6px", background: "#ffffff" }}>
                                  {items.map((it) => {
                                    const itemKey = `pr-${pr.id}-it-${it.id}`;
                                    const isSelected = selectedMap.has(itemKey);
                                    const isAlreadyInOrder = existingSet.has(normName(it.name));

                                    const itemData: SelectedItemData = {
                                      id: it.id,
                                      name: it.name,
                                      spec: it.spec || "",
                                      unit: it.unit || "Cái",
                                      qty: it.qty || 1,
                                      price: it.estimate || 0,
                                      code: it.code,
                                      category: it.category || "Hàng hóa",
                                      sourcePrNumber: pr.number,
                                      sourcePrId: pr.id,
                                    };

                                    return (
                                      <div
                                        key={itemKey}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "8px 12px",
                                          borderRadius: "6px",
                                          background: isSelected
                                            ? "#eff6ff"
                                            : isAlreadyInOrder
                                            ? "#f8fafc"
                                            : "#ffffff",
                                          border: isSelected
                                            ? "1.5px solid #0284c7"
                                            : "1px solid #f1f5f9",
                                          transition: "all 0.15s ease",
                                          gap: "12px",
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleItem(itemKey, itemData)}
                                            style={{ cursor: "pointer", margin: 0, width: "16px", height: "16px" }}
                                          />
                                          <span style={{ fontSize: "15px" }}>📦</span>
                                          <div style={{ minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                              <span style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>
                                                {it.name}
                                              </span>
                                              {it.spec && (
                                                <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                                                  ({it.spec})
                                                </span>
                                              )}
                                              {isAlreadyInOrder && (
                                                <span
                                                  style={{
                                                    fontSize: "10px",
                                                    padding: "1px 5px",
                                                    background: "#ecfdf5",
                                                    color: "#166534",
                                                    border: "1px solid #bbf7d0",
                                                    borderRadius: "4px",
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  ✓ Đã có trong đơn
                                                </span>
                                              )}
                                            </div>
                                            <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px", display: "flex", gap: "12px" }}>
                                              <span>
                                                Số lượng: <b style={{ color: "#0284c7" }}>{it.qty}</b> {it.unit || "Cái"}
                                              </span>
                                              <span>
                                                Dự kiến: <b>{fmt(it.estimate || 0)} ₫</b>
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                          <button
                                            type="button"
                                            className="payment-btn payment-btn-sm"
                                            style={{
                                              fontSize: "11.5px",
                                              padding: "4px 10px",
                                              background: isSelected ? "#0284c7" : "#f0fdf4",
                                              color: isSelected ? "#ffffff" : "#166534",
                                              borderColor: isSelected ? "#0284c7" : "#bbf7d0",
                                              fontWeight: 600,
                                              whiteSpace: "nowrap",
                                            }}
                                            onClick={() => handleAddSingleItem(itemData)}
                                            title="Thêm ngay mặt hàng này vào danh sách đơn"
                                          >
                                            ＋ Chọn ngay
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredPRTree.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#fff", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>🔍</div>
                  <b>Không tìm thấy mặt hàng nào trong phiếu PR khớp với từ khóa "{searchTerm}".</b>
                  <p style={{ margin: "4px 0 12px", fontSize: "12px" }}>
                    Bạn có thể chuyển sang tab <b>Cây Danh mục hàng</b> hoặc thêm sản phẩm tự do bên dưới.
                  </p>
                  {searchTerm.trim() && (
                    <button
                      type="button"
                      className="payment-btn payment-btn-primary"
                      onClick={handleCreateAndSelectCustomProduct}
                    >
                      ＋ Thêm mới sản phẩm "{searchTerm.trim()}" và chèn vào đơn
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CATALOG PRODUCTS TREE (Category -> Products) */}
          {activeTab === "catalog" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredCatalogTree.map((catGroup) => {
                const catKey = `cat:${catGroup.cat}`;
                const isCatExpanded = q ? !collapsedNodes.has(catKey) : expandedNodes.has(catKey);
                const allCatSelected =
                  catGroup.products.length > 0 &&
                  catGroup.products.every((p) => selectedMap.has(`prod-${p.id}`));

                return (
                  <div
                    key={catKey}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Category Header */}
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#f1f5f9",
                        borderBottom: isCatExpanded ? "1px solid #e2e8f0" : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      onClick={() => toggleNode(catKey)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="checkbox"
                          style={{ cursor: "pointer", margin: 0 }}
                          checked={allCatSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleToggleCategory(catGroup.cat, catGroup.products)}
                          title="Tích để chọn/bỏ chọn toàn bộ sản phẩm của nhóm này"
                        />
                        <span style={{ fontSize: "13px", color: "#64748b" }}>
                          {isCatExpanded ? "▼" : "▶"}
                        </span>
                        <span style={{ fontSize: "16px" }}>📁</span>
                        <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#1e293b" }}>
                          {catGroup.cat}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 7px",
                            background: "#e2e8f0",
                            borderRadius: "12px",
                            color: "#475569",
                            fontWeight: 600,
                          }}
                        >
                          {catGroup.products.length} sản phẩm
                        </span>
                      </div>
                    </div>

                    {/* Category Products */}
                    {isCatExpanded && (
                      <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: "6px", background: "#ffffff" }}>
                        {catGroup.products.map((p) => {
                          const prodKey = `prod-${p.id}`;
                          const isSelected = selectedMap.has(prodKey);
                          const isAlreadyInOrder = existingSet.has(normName(p.name));

                          const itemData: SelectedItemData = {
                            id: p.id,
                            name: p.name,
                            spec: p.spec || "",
                            unit: p.unit || "Cái",
                            qty: 1,
                            price: p.estimate || 0,
                            code: p.code,
                            category: p.category || catGroup.cat,
                          };

                          return (
                            <div
                              key={prodKey}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 12px",
                                borderRadius: "6px",
                                background: isSelected
                                  ? "#eff6ff"
                                  : isAlreadyInOrder
                                  ? "#f8fafc"
                                  : "#ffffff",
                                border: isSelected
                                  ? "1.5px solid #0284c7"
                                  : "1px solid #f1f5f9",
                                transition: "all 0.15s ease",
                                gap: "12px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleItem(prodKey, itemData)}
                                  style={{ cursor: "pointer", margin: 0, width: "16px", height: "16px" }}
                                />
                                <span style={{ fontSize: "15px" }}>📦</span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#0284c7", fontWeight: 700 }}>
                                      [{p.code}]
                                    </span>
                                    <span style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>
                                      {p.name}
                                    </span>
                                    {p.spec && (
                                      <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                                        ({p.spec})
                                      </span>
                                    )}
                                    {isAlreadyInOrder && (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          padding: "1px 5px",
                                          background: "#ecfdf5",
                                          color: "#166534",
                                          border: "1px solid #bbf7d0",
                                          borderRadius: "4px",
                                          fontWeight: 600,
                                        }}
                                      >
                                        ✓ Đã có trong đơn
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px", display: "flex", gap: "12px" }}>
                                    <span>
                                      ĐVT: <b>{p.unit || "Cái"}</b>
                                    </span>
                                    <span>
                                      Giá tham khảo: <b>{fmt(p.estimate || 0)} ₫</b>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                className="payment-btn payment-btn-sm"
                                style={{
                                  fontSize: "11.5px",
                                  padding: "4px 10px",
                                  background: isSelected ? "#0284c7" : "#f0fdf4",
                                  color: isSelected ? "#ffffff" : "#166534",
                                  borderColor: isSelected ? "#0284c7" : "#bbf7d0",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                }}
                                onClick={() => handleAddSingleItem(itemData)}
                                title="Thêm ngay sản phẩm này vào danh sách đơn"
                              >
                                ＋ Chọn ngay
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredCatalogTree.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#fff", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>🔍</div>
                  <b>Không tìm thấy sản phẩm nào trong danh mục khớp với "{searchTerm}".</b>
                  <p style={{ margin: "4px 0 12px", fontSize: "12px" }}>
                    Bạn có thể bấm bên dưới để thêm mới sản phẩm này vào danh mục và thêm vào đơn hàng.
                  </p>
                  {searchTerm.trim() && (
                    <button
                      type="button"
                      className="payment-btn payment-btn-primary"
                      onClick={handleCreateAndSelectCustomProduct}
                    >
                      ＋ Thêm mới sản phẩm "{searchTerm.trim()}" và chọn luôn
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: "14px 20px",
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ fontSize: "12.5px", color: "#334155" }}>
            {selectedMap.size > 0 ? (
              <span>
                Đang tích chọn: <b style={{ color: "#0284c7", fontSize: "14px" }}>{selectedMap.size}</b> mặt hàng
              </span>
            ) : (
              <span style={{ color: "#64748b" }}>
                Tích chọn các ô vuông để chọn nhiều mặt hàng, hoặc bấm "＋ Chọn ngay" từng dòng.
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="payment-btn"
              onClick={onClose}
              style={{ padding: "7px 16px" }}
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              className="payment-btn payment-btn-primary"
              disabled={selectedMap.size === 0}
              onClick={handleConfirmSelection}
              style={{
                padding: "7px 18px",
                background: selectedMap.size > 0 ? "#10b981" : "#cbd5e1",
                borderColor: selectedMap.size > 0 ? "#059669" : "#cbd5e1",
                color: "#ffffff",
                fontWeight: 700,
                cursor: selectedMap.size > 0 ? "pointer" : "not-allowed",
              }}
            >
              ✓ Xác nhận thêm {selectedMap.size > 0 ? `(${selectedMap.size}) mặt hàng` : ""} vào đơn
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
