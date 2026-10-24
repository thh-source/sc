import React, { useState, useMemo } from "react";
import { Item, Supplier, PurchaseHistory, Quote, ColumnKey, SortState, QuoteEntry, QuoteMode } from "../types";
import { fmt, priceStats, reorder, BASE_COLUMNS, valueOf, quoteDefaults, quoteBeforeVat, quoteAfterVat, emptyItem, makeId } from "../utils";
import { cleanExcelNumber, parseExcelClipboard } from "../utils/approvalSamples";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { useTranslation } from "../i18n";

type CompareColDescriptor =
  | { id: string; kind: "item"; key: ColumnKey }
  | { id: string; kind: "quotePrice"; supplierId: number }
  | { id: string; kind: "quoteCustom"; supplierId: number; colName: string };

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
  onBatchPaste,
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
  onBatchPaste?: (nextItems: Item[], nextQuotes: Quote) => void;
  best: (id: number) => { supplier: Supplier; price: number } | null;
  quoteCompareMode: QuoteMode;
  setQuoteCompareMode: React.Dispatch<React.SetStateAction<QuoteMode>>;
  poSelections: number[];
  togglePOItem: (id: number) => void;
  purchaseHistory: PurchaseHistory[];
  customColumns?: string[];
  setCustomColumns?: (cols: string[]) => void;
}) {
  const { t } = useTranslation();
  const [dragged, setDragged] = useState<ColumnKey | null>(null);

  const flatEditableCols = useMemo<CompareColDescriptor[]>(() => {
    const cols: CompareColDescriptor[] = [];
    order.forEach((col) => {
      if (col !== "stt" && col !== "amount") {
        cols.push({ id: `item:${col}`, kind: "item", key: col });
      }
    });
    suppliers.forEach((s) => {
      cols.push({ id: `qp:${s.id}`, kind: "quotePrice", supplierId: s.id });
      (customColumns || []).forEach((cc) => {
        cols.push({
          id: `qc:${s.id}:${cc}`,
          kind: "quoteCustom",
          supplierId: s.id,
          colName: cc,
        });
      });
    });
    return cols;
  }, [order, suppliers, customColumns]);

  const handleExcelPaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    targetItemId: number,
    startColId: string,
  ) => {
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text) return;
    const matrix = parseExcelClipboard(text);
    if (matrix.length === 0) return;

    const startColIdx = flatEditableCols.findIndex((c) => c.id === startColId);
    if (startColIdx < 0) return;
    const startCol = flatEditableCols[startColIdx];

    if (matrix.length === 1 && matrix[0].length === 1) {
      const rawVal = matrix[0][0];
      if (startCol.kind === "item" && (startCol.key === "qty" || startCol.key === "estimate")) {
        e.preventDefault();
        itemChange(targetItemId, startCol.key as keyof Item, String(cleanExcelNumber(rawVal)));
      } else if (startCol.kind === "quotePrice") {
        e.preventDefault();
        const num = cleanExcelNumber(rawVal);
        quoteChange(targetItemId, startCol.supplierId, "price", num > 0 ? String(num) : "");
      }
      return;
    }

    e.preventDefault();

    const nextItems = items.map((it) => ({ ...it }));
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

    const nextQuotes: Quote = { ...quotes };

    matrix.forEach((rowCells, rOffset) => {
      const targetRow = nextItems[startRowIdx + rOffset];
      if (!targetRow) return;

      rowCells.forEach((cellVal, cOffset) => {
        const colDesc = flatEditableCols[startColIdx + cOffset];
        if (!colDesc) return;

        if (colDesc.kind === "item") {
          if (colDesc.key === "qty") {
            const n = cleanExcelNumber(cellVal);
            targetRow.qty = n > 0 ? n : 1;
          } else if (colDesc.key === "estimate") {
            targetRow.estimate = cleanExcelNumber(cellVal);
          } else {
            (targetRow as any)[colDesc.key] = cellVal;
          }
        } else if (colDesc.kind === "quotePrice") {
          const num = cleanExcelNumber(cellVal);
          const itemQuotes = { ...(nextQuotes[targetRow.id] || {}) };
          const existingEntry = quoteDefaults(itemQuotes[colDesc.supplierId]);
          itemQuotes[colDesc.supplierId] = {
            ...existingEntry,
            price: num > 0 ? String(num) : "",
          };
          nextQuotes[targetRow.id] = itemQuotes;
        } else if (colDesc.kind === "quoteCustom") {
          const itemQuotes = { ...(nextQuotes[targetRow.id] || {}) };
          const existingEntry = quoteDefaults(itemQuotes[colDesc.supplierId]);
          itemQuotes[colDesc.supplierId] = {
            ...existingEntry,
            customColumns: {
              ...(existingEntry.customColumns || {}),
              [colDesc.colName]: cellVal,
            },
          };
          nextQuotes[targetRow.id] = itemQuotes;
        }
      });
    });

    if (onBatchPaste) {
      onBatchPaste(nextItems, nextQuotes);
    }
  };

  const getColLabel = (key: ColumnKey, fallback: string) => {
    switch (key) {
      case "stt": return t("table.stt");
      case "code": return t("table.item_code");
      case "category": return t("table.category");
      case "name": return t("table.item_name");
      case "desc": return t("table.spec_desc");
      case "spec": return t("table.specification");
      case "unit": return t("table.unit");
      case "qty": return t("table.quantity");
      case "estimate": return t("table.est_price");
      case "amount": return t("table.est_amount");
      default: return fallback;
    }
  };
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
    const colId = `item:${key}`;
    return (
      <td key={key}>
        {multiline ? (
          <AutoGrowTextarea
            className={key === "category" ? "category-input" : ""}
            value={String(item[inputKey])}
            onChange={(value) => itemChange(item.id, inputKey, value)}
            onPaste={(e) => handleExcelPaste(e, item.id, colId)}
            placeholder={key === "category" ? t("table.select_category") : ""}
          />
        ) : (
          <input
            className={`${key === "unit" || key === "qty" ? "short" : ""} ${numeric ? "num" : ""}`}
            type={numeric ? "number" : "text"}
            list={key === "unit" ? "commonAdvancedUnitDatalist" : undefined}
            value={String(item[inputKey])}
            onChange={(e) => itemChange(item.id, inputKey, e.target.value)}
            onPaste={(e) => handleExcelPaste(e, item.id, colId)}
          />
        )}
      </td>
    );
  };
  return (
    <>
      <datalist id="commonAdvancedUnitDatalist">
        {["Cái", "Bộ", "Chiếc", "Hộp", "Kg", "Mét", "Lít", "Thùng", "Gói", "Cuộn", "Bình", "Lọ", "Ống", "Lô", "Bao", "Can", "Gam"].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="tablewrap advanced-table vat-quote-table">
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="po-check-head">
              {t("nav.po_list")}
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
                      {getColLabel(col, meta.label)}{" "}
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
                      <strong>{t("table.filter_col", { col: getColLabel(col, meta.label) })}</strong>
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
                          {t("table.clear_filter")}
                        </button>
                        <button onClick={() => setFilterOpen(null)}>
                          {t("table.done")}
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              );
            })}
            {suppliers.map((s) => (
              <th colSpan={1 + (customColumns?.length || 0)} className="suphead" key={s.id}>
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
                <span>{t("table.auto_choice")}</span>
              </div>
            </th>
          </tr>
          <tr>
            {suppliers.flatMap((s) => [
              <th key={s.id + "p"}>{t("table.vendor_price")}</th>,
              ...(customColumns || []).map((col, idx) => (
                 <th key={s.id + "cc" + idx}>
                   <div style={{display: 'flex', justifyContent: 'space-between'}}>
                     <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
                       {s.id === suppliers[0]?.id && setCustomColumns && idx > 0 && (
                         <button onClick={() => {
                           const next = [...(customColumns||[])];
                           [next[idx-1], next[idx]] = [next[idx], next[idx-1]];
                           setCustomColumns(next);
                         }} style={{cursor: 'pointer', background: 'transparent', border: 'none', padding: '0 4px', fontSize: '12px'}} title="Di chuyển sang trái">◀</button>
                       )}
                       <span>{col}</span>
                       {s.id === suppliers[0]?.id && setCustomColumns && idx < (customColumns||[]).length - 1 && (
                         <button onClick={() => {
                           const next = [...(customColumns||[])];
                           [next[idx], next[idx+1]] = [next[idx+1], next[idx]];
                           setCustomColumns(next);
                         }} style={{cursor: 'pointer', background: 'transparent', border: 'none', padding: '0 4px', fontSize: '12px'}} title="Di chuyển sang phải">▶</button>
                       )}
                     </div>
                     {s.id === suppliers[0]?.id && setCustomColumns && (
                        <button onClick={() => {
                          if (confirm(`Xóa cột "${col}"?`)) setCustomColumns((customColumns||[]).filter(c => c !== col));
                        }} style={{color: 'red', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', lineHeight: '14px'}}>×</button>
                     )}
                   </div>
                 </th>
              )),
            ])}
            <th>{t("compare.best_price")}</th>
            <th>{t("table.supplier")}</th>
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
                          onPaste={(e) =>
                            handleExcelPaste(e, i.id, `qp:${s.id}`)
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
                          onPaste={(e) =>
                            handleExcelPaste(e, i.id, `qc:${s.id}:${col}`)
                          }
                        />
                      </td>
                    )),
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
        <tfoot style={{ whiteSpace: "nowrap", overflow: "hidden" }}>
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
              <td key={s.id + "tc"}></td>,
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
