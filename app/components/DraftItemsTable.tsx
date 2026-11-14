import React, { useState } from "react";
import { Trash2, ChevronDown, Minus, Plus } from "lucide-react";
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
  const activeOrder = order.filter((col) => col !== "code");
  const editableCols = activeOrder.filter((k): k is Exclude<ColumnKey, "stt" | "amount" | "code"> => k !== "stt" && k !== "amount");

  const handleExcelPaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    targetItemId: number,
    startKey: ColumnKey,
  ) => {
    if (startKey === "stt" || startKey === "amount" || startKey === "code") return;
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
        <td className="col-stt" key={key}>
          {row + 1}
        </td>
      );
    if (key === "amount")
      return (
        <td className="col-amount" key={key}>
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
      <td key={key} className={`col-${key}`}>
        {multiline ? (
          <AutoGrowTextarea
            className={key === "category" ? "category-input draft-cell-textarea" : "draft-cell-textarea"}
            value={String(item[inputKey])}
            onChange={(value) => itemChange(item.id, inputKey, value, true)}
            onPaste={(e) => handleExcelPaste(e, item.id, key)}
            placeholder={key === "category" ? "Ví dụ: Cơ khí" : ""}
          />
        ) : (
          <input
            className={`draft-cell-input ${key === "unit" || key === "qty" ? "short" : ""} ${numeric ? "num" : ""}`}
            type={numeric ? "number" : "text"}
            list={key === "unit" ? "commonUnitDatalist" : undefined}
            placeholder={numeric ? "0" : ""}
            value={numeric ? (item[inputKey] === 0 ? "" : String(item[inputKey] ?? "")) : String(item[inputKey] ?? "")}
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
            {activeOrder.map((col) => {
              const meta = BASE_COLUMNS.find((c) => c.key === col) || { key: col, label: col };
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
                  className={`draggable-head col-${col} ${dragged === col ? "dragging" : ""}`}
                >
                  <div className="head-label">
                    <button type="button" onClick={() => toggleSort(col)}>
                      <span>{meta.label}</span>
                      {sort?.key === col && (
                        <span className="sort-indicator">
                          {sort.direction === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={
                        filters[col]?.length
                          ? "filter-trigger active"
                          : "filter-trigger"
                      }
                      onClick={() =>
                        setFilterOpen(filterOpen === col ? null : col)
                      }
                      title="Lọc"
                    >
                      <ChevronDown size={12} />
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
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({ ...f, [col]: [] }))
                          }
                        >
                          Xóa lọc
                        </button>
                        <button type="button" onClick={() => setFilterOpen(null)}>
                          Xong
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              );
            })}
            <th className="col-action" style={{ width: "44px", textAlign: "center" }}>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Xóa</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((i, r) => (
            <tr key={i.id}>
              {activeOrder.map((key) => cell(i, key, r))}
              <td className="col-action center">
                <button
                  type="button"
                  className="draft-del-btn"
                  title="Xóa mặt hàng này khỏi PR"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.filter((x) => x.id !== i.id),
                    }))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={activeOrder.length + 1}>
              <div className="table-footer-summary">
                <span>Tổng số: <b>{visibleItems.length}</b> mặt hàng</span>
                <span className="summary-separator">·</span>
                <span>
                  Thành tiền dự kiến:{" "}
                  <b className="summary-total-val">
                    {fmt(visibleItems.reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
                  </b>
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Mobile Card View cho từng mặt hàng khi tạo PR */}
      <div className="mobile-items-cards">
        {visibleItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
            Chưa có mặt hàng nào. Bấm <b>＋ Thêm dòng hàng hóa</b> bên dưới.
          </div>
        ) : (
          visibleItems.map((i, r) => (
            <div key={i.id} className="mobile-item-card">
              <div className="mobile-item-header">
                <span className="mobile-item-index">#{r + 1}</span>
                <input
                  type="text"
                  className="mobile-item-name-input"
                  placeholder="Tên mặt hàng (bắt buộc)..."
                  value={i.name}
                  onChange={(e) => itemChange(i.id, "name", e.target.value, true)}
                />
                <button
                  type="button"
                  className="mobile-item-del-btn"
                  title="Xóa mặt hàng này khỏi PR"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.filter((x) => x.id !== i.id),
                    }))
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="mobile-item-grid">
                <label className="mobile-item-field">
                  <span>Đơn vị tính</span>
                  <input
                    type="text"
                    list="commonUnitDatalist"
                    placeholder="ĐVT..."
                    value={i.unit || ""}
                    onChange={(e) => itemChange(i.id, "unit", e.target.value, true)}
                  />
                </label>
                <label className="mobile-item-field mobile-item-field-wide">
                  <span>Đơn giá dự kiến (₫)</span>
                  <input
                    type="text"
                    placeholder="0"
                    value={i.estimate ? fmt(i.estimate) : ""}
                    onChange={(e) => {
                      const num = e.target.value.replace(/[^0-9]/g, "");
                      itemChange(i.id, "estimate", num, true);
                    }}
                  />
                </label>
              </div>

              <div className="mobile-item-bottom">
                <div className="mobile-stepper-wrap">
                  <span className="mobile-stepper-label">Số lượng:</span>
                  <div className="mobile-stepper">
                    <button
                      type="button"
                      className="step-btn"
                      onClick={() => {
                        const cur = Math.max(1, Number(i.qty) || 1);
                        if (cur > 1) {
                          itemChange(i.id, "qty", String(cur - 1), true);
                        }
                      }}
                      title="Giảm 1"
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      type="number"
                      className="step-input"
                      value={i.qty === 0 ? "" : i.qty}
                      placeholder="1"
                      min={1}
                      onChange={(e) => itemChange(i.id, "qty", e.target.value, true)}
                      onBlur={(e) => {
                        if (!Number(e.target.value)) itemChange(i.id, "qty", "1", true);
                      }}
                    />
                    <button
                      type="button"
                      className="step-btn"
                      onClick={() => {
                        const cur = Math.max(1, Number(i.qty) || 1);
                        itemChange(i.id, "qty", String(cur + 1), true);
                      }}
                      title="Tăng 1"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="mobile-subtotal">
                  <span className="subtotal-label">Thành tiền:</span>
                  <strong className="subtotal-val">
                    {fmt((Number(i.qty) || 0) * (Number(i.estimate) || 0))} ₫
                  </strong>
                </div>
              </div>
            </div>
          ))
        )}

        <div className="mobile-items-summary-card">
          <span>Tổng số: <b>{visibleItems.length}</b> mặt hàng</span>
          <span>
            Dự kiến:{" "}
            <strong>
              {fmt(visibleItems.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.estimate) || 0), 0))} ₫
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}
