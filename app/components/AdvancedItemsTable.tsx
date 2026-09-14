import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View, QuoteEntry, QuoteMode } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS, valueOf, quoteDefaults } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
// Add other imports as necessary

export function AdvancedItemsTable({
  items,
  visibleItems,
  order,
  setOrder,
  filters,
  setFilters,
  sort,
  setSort,
  filterOpen,
  setFilterOpen,
  suppliers,
  onRemoveSupplier,
  quotes,
  itemChange,
  quoteChange,
  best,
  quoteCompareMode,
  setQuoteCompareMode,
  poSelections,
  togglePOItem,
  purchaseHistory,
  customColumns,
  setCustomColumns,
}: {
  items: Item[];
  visibleItems: Item[];
  order: ColumnKey[];
  setOrder: React.Dispatch<React.SetStateAction<ColumnKey[]>>;
  filters: Partial<Record<ColumnKey, string[]>>;
  setFilters: React.Dispatch<
    React.SetStateAction<Partial<Record<ColumnKey, string[]>>>
  >;
  sort: SortState;
  setSort: React.Dispatch<React.SetStateAction<SortState>>;
  filterOpen: ColumnKey | null;
  setFilterOpen: React.Dispatch<React.SetStateAction<ColumnKey | null>>;
  suppliers: Supplier[];
  onRemoveSupplier: (id: number) => void;
  quotes: Quote;
  itemChange: (id: number, k: keyof Item, v: string) => void;
  quoteChange: (
    iid: number,
    sid: number,
    k: keyof QuoteEntry,
    v: any,
  ) => void;
  best: (id: number) => { supplier: Supplier; price: number } | null;
  quoteCompareMode: QuoteMode;
  setQuoteCompareMode: React.Dispatch<React.SetStateAction<QuoteMode>>;
  poSelections: number[];
  togglePOItem: (id: number) => void;
  purchaseHistory: PurchaseHistory[];
  customColumns?: string[];
  setCustomColumns?: (cols: string[]) => void;
}) {
  const [dragged, setDragged] = useState<ColumnKey | null>(null);
  const filterValues = useMemo(
    () =>
      Object.fromEntries(
        order.map((column) => [
          column,
          [...new Set(items.map((item, row) => String(valueOf(item, column, row))))].filter(Boolean),
        ]),
      ) as Record<ColumnKey, string[]>,
    [items, order],
  );
  const setSuppliers = (updater: React.SetStateAction<Supplier[]>) => {
    const next = typeof updater === "function" ? updater(suppliers) : updater;
    const removed = suppliers.find((s) => !next.some((n) => n.id === s.id));
    if (removed) onRemoveSupplier(removed.id);
  };
  const toggleSort = (key: ColumnKey) =>
    setSort((s) =>
      s?.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  const toggleFilter = (key: ColumnKey, value: string) =>
    setFilters((f) => {
      const current = f[key] || [],
        next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
      return { ...f, [key]: next };
    });
  const cell = (item: Item, key: ColumnKey, row: number) => {
    if (key === "stt")
      return (
        <td className="center" key={key}>
          {row + 1}
        </td>
      );
    if (key === "amount")
      return (
        <td className="money" key={key}>
          {fmt(item.qty * item.estimate)}
        </td>
      );
    const inputKey = key as keyof Item;
    const numeric = key === "qty" || key === "estimate";
    const multiline =
      key === "category" || key === "name" || key === "desc" || key === "spec";
    return (
      <td key={key}>
        {multiline ? (
          <AutoGrowTextarea
            className={key === "category" ? "category-input" : ""}
            value={String(item[inputKey])}
            onChange={(value) => itemChange(item.id, inputKey, value)}
            placeholder={key === "category" ? "Chọn nhóm..." : ""}
          />
        ) : (
          <input
            className={`${key === "unit" || key === "qty" ? "short" : ""} ${numeric ? "num" : ""}`}
            type={numeric ? "number" : "text"}
            value={String(item[inputKey])}
            onChange={(e) => itemChange(item.id, inputKey, e.target.value)}
          />
        )}
      </td>
    );
  };
  return (
    <>
      <div className="vat-compare-toolbar">
        <span>So sánh giá theo:</span>
        <button
          className={quoteCompareMode === "before-vat" ? "active" : ""}
          onClick={() => setQuoteCompareMode("before-vat")}
        >
          Giá chưa VAT
        </button>
        <button
          className={quoteCompareMode === "after-vat" ? "active" : ""}
          onClick={() => setQuoteCompareMode("after-vat")}
        >
          Giá có VAT
        </button>
      </div>
      <div className="tablewrap advanced-table vat-quote-table">
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="po-check-head">
              Lên PO
            </th>
            {order.map((col) => {
              const meta = BASE_COLUMNS.find((c) => c.key === col)!;
              const values = filterValues[col];
              return (
                <th
                  rowSpan={2}
                  key={col}
                  draggable
                  onDragStart={() => setDragged(col)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragged) setOrder((o) => reorder(o, dragged, col));
                    setDragged(null);
                  }}
                  className={`draggable-head ${dragged === col ? "dragging" : ""}`}
                >
                  <div className="head-label">
                    <button onClick={() => toggleSort(col)}>
                      {meta.label}{" "}
                      <small>
                        {sort?.key === col
                          ? sort.direction === "asc"
                            ? "↑"
                            : "↓"
                          : ""}
                      </small>
                    </button>
                    <button
                      className={
                        filters[col]?.length
                          ? "filter-trigger active"
                          : "filter-trigger"
                      }
                      onClick={() =>
                        setFilterOpen(filterOpen === col ? null : col)
                      }
                    >
                      ▾
                    </button>
                  </div>
                  {filterOpen === col && (
                    <div
                      className="filter-popover"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <strong>Lọc {meta.label}</strong>
                      <div className="filter-options">
                        {values.map((v) => (
                          <label key={v}>
                            <input
                              type="checkbox"
                              checked={filters[col]?.includes(v) || false}
                              onChange={() => toggleFilter(col, v)}
                            />
                            <span>{v}</span>
                          </label>
                        ))}
                      </div>
                      <div className="filter-actions">
                        <button
                          onClick={() =>
                            setFilters((f) => ({ ...f, [col]: [] }))
                          }
                        >
                          Xóa lọc
                        </button>
                        <button onClick={() => setFilterOpen(null)}>
                          Xong
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              );
            })}
            {suppliers.map((s) => (
              <th colSpan={2 + (customColumns?.length || 0)} className="suphead" key={s.id}>
                {s.shortName || s.name}
                <button
                  onClick={() => onRemoveSupplier(s.id)}
                >
                  ×
                </button>
              </th>
            ))}
            <th colSpan={2} className="choice">
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                <span>Lựa chọn tự động</span>
                {setCustomColumns && (
                   <button onClick={() => {
                     const name = prompt("Nhập tên cột mới (VD: Tên hàng NCC, Xuất xứ, Bảo hành...):");
                     if (name && name.trim()) setCustomColumns([...(customColumns||[]), name.trim()]);
                   }} style={{fontSize: '11px', padding: '2px 6px'}} className="ghost">
                     + Cột NCC
                   </button>
                )}
              </div>
            </th>
          </tr>
          <tr>
            {suppliers.flatMap((s) => [
              <th key={s.id + "p"}>Giá NCC</th>,
              ...(customColumns || []).map((col, idx) => (
                 <th key={s.id + "cc" + idx}>
                   <div style={{display: 'flex', justifyContent: 'space-between'}}>
                     <span>{col}</span>
                     {s.id === suppliers[0]?.id && setCustomColumns && (
                        <button onClick={() => {
                          if (confirm(`Xóa cột "${col}"?`)) setCustomColumns((customColumns||[]).filter(c => c !== col));
                        }} style={{color: 'red', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', lineHeight: '14px'}}>×</button>
                     )}
                   </div>
                 </th>
              )),
              <th key={s.id + "n"}>Ghi chú</th>,
            ])}
            <th>Giá tốt nhất</th>
            <th>Nhà cung cấp</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((i, r) => {
            const win = best(i.id),
              historical = purchaseHistory.filter((row) => row.itemCode === i.code),
              historicalStats = priceStats(historical);
            return (
              <tr
                key={i.id}
                className={poSelections.includes(i.id) ? "po-row-selected" : ""}
              >
                <td className="po-check">
                  <input
                    type="checkbox"
                    checked={poSelections.includes(i.id)}
                    disabled={!win}
                    onChange={() => togglePOItem(i.id)}
                  />
                </td>
                {order.map((key) => cell(i, key, r))}
                {suppliers.flatMap((s) => {
                  const q = quoteDefaults(quotes[i.id]?.[s.id]),
                    low = win?.supplier.id === s.id;
                  return [
                    <td className={low ? "low" : ""} key={s.id + "p"}>
                      <div className="qprice">
                        {low && <b>✓</b>}
                        <input
                          className="num"
                          type="number"
                          placeholder="Nhập giá"
                          value={q.price}
                          onChange={(e) =>
                            quoteChange(i.id, s.id, "price", e.target.value)
                          }
                        />
                      </div>
                    </td>,
                    ...(customColumns || []).map((col, idx) => (
                      <td key={s.id + "cc" + idx}>
                        <AutoGrowTextarea
                          placeholder={col}
                          value={q.customColumns?.[col] || ""}
                          onChange={(value) =>
                            quoteChange(i.id, s.id, "customColumns", { ...q.customColumns, [col]: value })
                          }
                        />
                      </td>
                    )),
                    <td key={s.id + "n"}>
                      <AutoGrowTextarea
                        placeholder="Ghi chú"
                        value={q.note}
                        onChange={(value) =>
                          quoteChange(i.id, s.id, "note", value)
                        }
                      />
                    </td>,
                  ];
                })}
                <td className="best">
                  {win ? fmt(win.price) + " ₫" : "—"}
                  {!!historicalStats.latest && (
                    <small className="history-reference">
                      LS gần nhất {fmt(historicalStats.latest.unitPrice)} ₫ ·
                      min {fmt(historicalStats.min)} · max{" "}
                      {fmt(historicalStats.max)}
                    </small>
                  )}
                </td>
                <td>
                  <span className={win ? "badge" : "empty"}>
                    {win?.supplier.name || "Chưa có giá"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td colSpan={order.length}>
              TỔNG: {visibleItems.length} mặt hàng ·{" "}
              {fmt(visibleItems.reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
            </td>
            {suppliers.flatMap((s) => [
              <td className="money" key={s.id + "t"}>
                {fmt(
                  visibleItems.reduce(
                    (a, i) => a + quoteBeforeVat(quotes[i.id]?.[s.id]) * i.qty,
                    0,
                  ),
                )}{" "}
                ₫
              </td>,
              <td className="money" key={s.id + "ta"}>
                {fmt(
                  visibleItems.reduce(
                    (a, i) => a + quoteAfterVat(quotes[i.id]?.[s.id]) * i.qty,
                    0,
                  ),
                )}{" "}
                ₫
              </td>,
              <td key={s.id + "tc"}>Chưa VAT / Có VAT</td>,
              <td key={s.id + "x"}></td>,
            ])}
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}

