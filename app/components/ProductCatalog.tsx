import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
// Add other imports as necessary

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
          <em>DANH MỤC DÙNG CHUNG · LỊCH SỬ MUA</em>
          <h1>Danh sách hàng hóa</h1>
          <p>Tra cứu thông tin vật tư và giá mua theo nhà cung cấp, PO.</p>
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
            ＋ Thêm hàng hóa
          </button>
          <button className="primary" onClick={onCreatePR}>
            Tạo PR từ danh mục
          </button>
        </div>
      </div>
      <div className="product-kpis">
        <article>
          <span>Tổng hàng hóa</span>
          <b>{products.length}</b>
          <small>{categories.length - 1} phân loại</small>
        </article>
        <article>
          <span>Đã phát sinh mua</span>
          <b>
            {
              products.filter((p) =>
                pos.some((po) => po.items.some((i) => i.code === p.code)) ||
                purchaseHistory.some((row) => row.itemCode === p.code),
              ).length
            }
          </b>
          <small>Có PO hoặc nhập kho</small>
        </article>
        <article>
          <span>Tổng lượt mua</span>
          <b>{pos.reduce((n, p) => n + p.items.length, 0) + purchaseHistory.length}</b>
          <small>PO + nhập kho T1-T7</small>
        </article>
        <article>
          <span>Giá gần nhất</span>
          <b>
            {fmt(
              products.reduce((n, p) => n + p.estimate, 0) /
                Math.max(1, products.length),
            )}{" "}
            ₫
          </b>
          <small>Bình quân danh mục</small>
        </article>
      </div>
      <div className="product-toolbar">
        <label>
          ⌕
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã, tên hàng hóa, quy cách..."
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
              <th>Mã hàng</th>
              <th>Tên hàng hóa</th>
              <th>Phân loại</th>
              <th>Quy cách</th>
              <th>ĐVT</th>
              <th>Giá dự kiến</th>
              <th>Lần mua gần nhất</th>
              <th>Biến động giá</th>
              <th></th>
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
                    <td>
                      <b className="product-code">{p.code}</b>
                    </td>
                    <td>
                      <strong>{p.name || "Hàng hóa mới"}</strong>
                      <small>{p.desc || "Chưa có mô tả kỹ thuật"}</small>
                    </td>
                    <td>
                      <span className="category-pill">
                        {p.category || "Chưa phân loại"}
                      </span>
                    </td>
                    <td>{p.spec || "—"}</td>
                    <td>{p.unit}</td>
                    <td className="money">{fmt(p.estimate)} ₫</td>
                    <td>
                      <b>{latest?.po || "Chưa phát sinh"}</b>
                      <small>
                        {latest
                          ? `${dateVN(latest.date)} · ${latest.supplier} · ${latest.source}`
                          : "Chưa có dữ liệu PO"}
                      </small>
                    </td>
                    <td>
                      <span className={change <= 0 ? "price-down" : "price-up"}>
                        {latest && previous
                          ? `${change <= 0 ? "↓" : "↑"} ${Math.abs(change)}%`
                          : "—"}
                      </span>
                    </td>
                    <td>
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

