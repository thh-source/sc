import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS, valueOf } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
// Add other imports as necessary

export function DraftItemsTable({
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
  itemChange,
  setDraft,
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
  itemChange: (
    id: number,
    k: keyof Item,
    v: string,
    forDraft?: boolean,
  ) => void;
  setDraft: React.Dispatch<
    React.SetStateAction<{
      number: string;
      date: string;
      department: string;
      purpose: string;
      items: Item[];
    }>
  >;
}) {
  const [dragged, setDragged] = useState<ColumnKey | null>(null);
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
    const inputKey = key as keyof Item,
      numeric = key === "qty" || key === "estimate",
      multiline =
        key === "category" ||
        key === "name" ||
        key === "desc" ||
        key === "spec";
    return (
      <td key={key}>
        {multiline ? (
          <AutoGrowTextarea
            className={key === "category" ? "category-input" : ""}
            value={String(item[inputKey])}
            onChange={(value) => itemChange(item.id, inputKey, value, true)}
            placeholder={key === "category" ? "Ví dụ: Cơ khí" : ""}
          />
        ) : (
          <input
            className={`${key === "unit" || key === "qty" ? "short" : ""} ${numeric ? "num" : ""}`}
            type={numeric ? "number" : "text"}
            value={String(item[inputKey])}
            onChange={(e) =>
              itemChange(item.id, inputKey, e.target.value, true)
            }
          />
        )}
      </td>
    );
  };
  return (
    <div className="draft-table advanced-draft">
      <table>
        <thead>
          <tr>
            {order.map((col) => {
              const meta = BASE_COLUMNS.find((c) => c.key === col)!;
              const values = [
                ...new Set(items.map((i, r) => String(valueOf(i, col, r)))),
              ].filter(Boolean);
              return (
                <th
                  key={col}
                  draggable
                  onDragStart={() => setDragged(col)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragged) setOrder((o) => reorder(o, dragged, col));
                    setDragged(null);
                  }}
                  className="draggable-head"
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
                    <div className="filter-popover">
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((i, r) => (
            <tr key={i.id}>
              {order.map((key) => cell(i, key, r))}
              <td>
                <button
                  className="delete-row"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.filter((x) => x.id !== i.id),
                    }))
                  }
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={order.length}>
              TỔNG: {visibleItems.length} mặt hàng ·{" "}
              {fmt(visibleItems.reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

