import React, { useState, Fragment } from "react";
import { Plus, FilePlus, Search } from "lucide-react";
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
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Tất cả"),
    [expanded, setExpanded] = useState<number | null>(products[0]?.id || null);
  const categories = [
      "Tất cả",
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ],
    shown = products.filter(
      (p) =>
        (category === "Tất cả" || p.category === category) &&
        (p.code + p.name + p.spec).toLowerCase().includes(query.toLowerCase()),
    );
  const history = (product: Item) =>
    [
      ...purchaseHistory
        .filter((row) => row.itemCode === product.code)
        .map((row) => ({
          date: row.documentDate || row.accountingDate,
          po: row.documentNo || row.invoiceNo || "Nhập kho",
          supplier: row.supplierName,
          qty: row.quantity,
          price: row.unitPrice,
          source: "Nhập kho",
        })),
      ...pos.flatMap((po) =>
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
          })),
      ),
    ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="content product-page">
      <div className="heading">
        <div>
          <h1>{t("product.title")}</h1>
        </div>
        <div className="actions">
          <button
            className="ghost"
            onClick={() =>
              setProducts((p) => [
                ...p,
                { ...emptyItem(p.length), category: "Hàng hóa mới" },
              ])
            }
          >
            <Plus size={16} /> Thêm hàng
          </button>
          <button className="primary" onClick={onCreatePR}>
            <FilePlus size={16} /> Tạo PR
          </button>
        </div>
      </div>
      <div className="product-toolbar">
        <label>
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("product.search_placeholder")}
          />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span>{shown.length} hàng hóa</span>
      </div>
      <div className="product-table">
        <div className="mobile-record-list">
          {shown.map((p) => {
            const h = history(p),
              latest = h[0],
              previous = h[1],
              change =
                latest && previous
                  ? Math.round(
                      ((latest.price - previous.price) / previous.price) *
                        100,
                    )
                  : 0;
            const isExp = expanded === p.id;
            return (
              <article key={p.id}>
                <header>
                  <button onClick={() => setExpanded(isExp ? null : p.id)}>{p.name || (p as any).itemName || (p as any).item_name || "Hàng hóa mới"}</button>
                  <b className="product-code">{p.code}</b>
                </header>
                <p>{p.desc || p.spec || "Chưa có quy cách"}</p>
                <dl>
                  <div>
                    <dt>Phân loại</dt>
                    <dd>{p.category || "—"}</dd>
                  </div>
                  <div>
                    <dt>ĐVT</dt>
                    <dd>{p.unit || "—"}</dd>
                  </div>
                  <div>
                    <dt>Giá dự kiến</dt>
                    <dd>{fmt(p.estimate)} ₫</dd>
                  </div>
                  {latest && (
                    <div>
                      <dt>Mua gần nhất</dt>
                      <dd>{latest.po} · {dateVN(latest.date)} ({fmt(latest.price)} ₫)</dd>
                    </div>
                  )}
                  {latest && previous && (
                    <div>
                      <dt>Biến động</dt>
                      <dd>
                        <span className={change <= 0 ? "price-down" : "price-up"}>
                          {change <= 0 ? "↓" : "↑"} {Math.abs(change)}%
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
                <footer>
                  <button
                    className="row-action"
                    onClick={() => setExpanded(isExp ? null : p.id)}
                  >
                    {isExp ? "Thu gọn" : `Xem lịch sử giá (${h.length}) →`}
                  </button>
                </footer>
                {isExp && (
                  <div style={{ marginTop: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                    {h.length === 0 ? (
                      <small style={{ color: "#64748b" }}>Chưa phát sinh mua hàng</small>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {h.slice(0, 5).map((row, idx) => (
                          <div key={idx} style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed #edf2f7" }}>
                            <span>{dateVN(row.date)} · {row.po} ({row.source})</span>
                            <b>{fmt(row.price)} ₫ ({row.qty} {p.unit})</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <table>
          <colgroup>
            <col className="product-col-code" />
            <col className="product-col-name" />
            <col className="product-col-category" />
            <col className="product-col-spec" />
            <col className="product-col-unit" />
            <col className="product-col-price" />
            <col className="product-col-latest" />
            <col className="product-col-change" />
            <col className="product-col-action" />
          </colgroup>
          <thead>
            <tr>
              <th className="cell-center">{t("table.item_code")}</th>
              <th className="cell-left">{t("table.item_name")}</th>
              <th className="cell-center">{t("table.category")}</th>
              <th className="cell-left">{t("table.specification")}</th>
              <th className="cell-center">{t("table.unit")}</th>
              <th className="cell-right">{t("table.est_price")}</th>
              <th className="cell-left">{t("table.last_purchase")}</th>
              <th className="cell-center">{t("table.price_trend")}</th>
              <th className="cell-center"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const h = history(p),
                latest = h[0],
                previous = h[1],
                change =
                  latest && previous
                    ? Math.round(
                        ((latest.price - previous.price) / previous.price) *
                          100,
                      )
                    : 0;
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td className="cell-center">
                      <b className="product-code">{p.code}</b>
                    </td>
                    <td className="cell-left">
                      <strong>{p.name || "Hàng hóa mới"}</strong>
                      <small>{p.desc || "Chưa có mô tả kỹ thuật"}</small>
                    </td>
                    <td className="cell-center">
                      <span className="category-pill">
                        {p.category || "Chưa phân loại"}
                      </span>
                    </td>
                    <td className="cell-left">{p.spec || "—"}</td>
                    <td className="cell-center">{p.unit}</td>
                    <td className="money cell-right">{fmt(p.estimate)} ₫</td>
                    <td className="cell-left">
                      <b>{latest?.po || "Chưa phát sinh"}</b>
                      <small>
                        {latest
                          ? `${dateVN(latest.date)} · ${latest.supplier} · ${latest.source}`
                          : "Chưa có dữ liệu PO"}
                      </small>
                    </td>
                    <td className="cell-center">
                      <span className={change <= 0 ? "price-down" : "price-up"}>
                        {latest && previous
                          ? `${change <= 0 ? "↓" : "↑"} ${Math.abs(change)}%`
                          : "—"}
                      </span>
                    </td>
                    <td className="cell-center">
                      <button
                        className="history-btn"
                        onClick={() =>
                          setExpanded(expanded === p.id ? null : p.id)
                        }
                      >
                        {expanded === p.id ? "Thu gọn" : "Lịch sử giá"}
                      </button>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr className="history-row">
                      <td colSpan={9}>
                        <div className="price-history">
                          <div>
                            <h3>Lịch sử mua · {p.name}</h3>
                            <p>So sánh từng lần mua theo PO và nhà cung cấp</p>
                          </div>
                          <table>
                            <thead>
                              <tr>
                                <th>Ngày mua</th>
                                <th>Số PO</th>
                                <th>Nhà cung cấp</th>
                                <th>Nguồn</th>
                                <th>Số lượng</th>
                                <th>Đơn giá</th>
                                <th>Thành tiền</th>
                              </tr>
                            </thead>
                            <tbody>
                              {!h.length && (
                                <tr>
                                  <td colSpan={7}>Chưa có lịch sử mua hàng.</td>
                                </tr>
                              )}
                              {h.map((x, i) => (
                                <tr key={i}>
                                  <td>{dateVN(x.date)}</td>
                                  <td>
                                    <b>{x.po}</b>
                                  </td>
                                  <td>{x.supplier}</td>
                                  <td>{x.source}</td>
                                  <td>
                                    {x.qty} {p.unit}
                                  </td>
                                  <td className="money">{fmt(x.price)} ₫</td>
                                  <td className="money">
                                    {fmt(x.qty * x.price)} ₫
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

