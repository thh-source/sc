import React, { useState } from "react";
import { Item, ColumnKey, SortState } from "../types";
import { fmt, reorder, BASE_COLUMNS, valueOf, emptyItem, makeId } from "../utils";
import { cleanExcelNumber, parseExcelClipboard } from "../utils/approvalSamples";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

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
      note: string;
      items: Item[];
    }>
  >;
}) {
  const [dragged, setDragged] = useState<ColumnKey | null>(null);
  const editableCols = order.filter((k) => k !== "stt" && k !== "amount");

  const handleExcelPaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    targetItemId: number,
    startKey: ColumnKey,
  ) => {
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text) return;
    const matrix = parseExcelClipboard(text);
    if (matrix.length === 0) return;

    const isNumericCol = (k: ColumnKey) => k === "qty" || k === "estimate";

    if (matrix.length === 1 && matrix[0].length === 1) {
      if (isNumericCol(startKey)) {
        e.preventDefault();
        itemChange(targetItemId, startKey as keyof Item, String(cleanExcelNumber(matrix[0][0])), true);
      }
      return;
    }

    e.preventDefault();
    const startColIdx = editableCols.indexOf(startKey);
    if (startColIdx < 0) return;

    setDraft((d) => {
      const nextItems = d.items.map((it) => ({ ...it }));
      let startRowIdx = nextItems.findIndex((it) => it.id === targetItemId);
      if (startRowIdx < 0) startRowIdx = nextItems.length;

      const requiredRows = startRowIdx + matrix.length;
      while (nextItems.length < requiredRows) {
        const idx = nextItems.length;
        nextItems.push({
          ...emptyItem(idx),
          id: makeId() + idx,
          code: `VT-${String(idx + 1).padStart(3, "0")}`,
        });
      }

      matrix.forEach((rowCells, rOffset) => {
        const targetRow = nextItems[startRowIdx + rOffset];
        if (!targetRow) return;
        rowCells.forEach((cellVal, cOffset) => {
          const colKey = editableCols[startColIdx + cOffset];
          if (!colKey) return;
          if (colKey === "qty") {
            const n = cleanExcelNumber(cellVal);
            targetRow.qty = n > 0 ? n : 1;
          } else if (colKey === "estimate") {
            targetRow.estimate = cleanExcelNumber(cellVal);
          } else {
            (targetRow as any)[colKey] = cellVal;
          }
        });
      });

      return { ...d, items: nextItems };
    });
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
            onPaste={(e) => handleExcelPaste(e, item.id, key)}
            placeholder={key === "category" ? "Ví dụ: Cơ khí" : ""}
          />
        ) : (
          <input
            className={`${key === "unit" || key === "qty" ? "short" : ""} ${numeric ? "num" : ""}`}
            type={numeric ? "number" : "text"}
            list={key === "unit" ? "commonUnitDatalist" : undefined}
            value={String(item[inputKey])}
            onChange={(e) =>
              itemChange(item.id, inputKey, e.target.value, true)
            }
            onPaste={(e) => handleExcelPaste(e, item.id, key)}
          />
        )}
      </td>
    );
  };
  return (
    <div className="draft-table advanced-draft">
      <datalist id="commonUnitDatalist">
        {["Cái", "Bộ", "Chiếc", "Hộp", "Kg", "Mét", "Lít", "Thùng", "Gói", "Cuộn", "Bình", "Lọ", "Ống", "Lô", "Bao", "Can", "Gam"].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
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
