import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
// Add other imports as necessary

export function SupplierManagement({
  suppliers,
  setSuppliers,
  onAdd,
  purchaseHistory,
}: {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onAdd: () => void;
  purchaseHistory: PurchaseHistory[];
}) {
  const [supplierQuery, setSupplierQuery] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(
    null,
  );
  const update = (id: number, key: keyof Supplier, value: string) =>
    setSuppliers((list) =>
      list.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
    );
  const supplierHistoryRows = (supplier: Supplier) =>
    purchaseHistory
      .filter(
        (row) =>
          row.supplierCode === supplier.code ||
          row.supplierName === supplier.name,
      )
      .sort((a, b) =>
        (b.documentDate || b.accountingDate).localeCompare(
          a.documentDate || a.accountingDate,
        ),
      );
  const supplierStats = (supplier: Supplier) => {
    const rows = supplierHistoryRows(supplier),
      stats = priceStats(rows),
      topItems = [...rows
        .reduce((map, row) => {
          const current = map.get(row.itemCode) || {
            code: row.itemCode,
            name: row.itemName,
            value: 0,
            count: 0,
          };
          current.value += row.value;
          current.count += 1;
          map.set(row.itemCode, current);
          return map;
        }, new Map<string, { code: string; name: string; value: number; count: number }>())]
        .map(([, value]) => value)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    return {
      ...stats,
      itemCount: new Set(rows.map((row) => row.itemCode)).size,
      topItems,
    };
  };
  const normalizedSupplierQuery = supplierQuery.trim().toLowerCase();
  const shownSuppliers = suppliers.filter((supplier) =>
    [
      supplier.code,
      supplier.name,
      supplier.contact,
      supplier.phone,
      supplier.bank,
      supplier.address,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSupplierQuery),
  );
  const selectedSupplier = shownSuppliers.find(
      (supplier) => supplier.id === selectedSupplierId,
    ),
    selectedRows = selectedSupplier ? supplierHistoryRows(selectedSupplier) : [],
    selectedStats = selectedSupplier ? supplierStats(selectedSupplier) : null;
  return (
    <section className="content supplier-page">
      <div className="heading">
        <div>
          <em>DANH MỤC DÙNG CHUNG</em>
          <h1>Danh sách nhà cung cấp</h1>
          <p>
            Thông tin tại đây được đồng bộ sang PO và các nghiệp vụ mua hàng.
          </p>
        </div>
        <button className="primary" onClick={onAdd}>
          ＋ Thêm nhà cung cấp
        </button>
      </div>
      <div className="supplier-summary">
        <span>
          <b>{suppliers.length}</b> nhà cung cấp
        </span>
        <span>
          <b>{suppliers.filter((s) => s.bankAccount).length}</b> đã có tài khoản
        </span>
        <span>
          <b>{suppliers.filter((s) => s.contact).length}</b> đã có người liên hệ
        </span>
        <span>
          <b>{purchaseHistory.length}</b> dòng lịch sử nhập kho
        </span>
      </div>
      <div className="supplier-toolbar">
        <label>
          ⌕
          <input
            value={supplierQuery}
            onChange={(e) => setSupplierQuery(e.target.value)}
            placeholder="Tìm nhanh mã, tên NCC, người liên hệ, SĐT..."
          />
        </label>
        <span>{shownSuppliers.length} / {suppliers.length} nhà cung cấp</span>
      </div>
      <div className="supplier-list-panel">
        <table className="supplier-list-table">
          <thead>
            <tr>
              <th>Mã NCC</th>
              <th>Tên nhà cung cấp</th>
              <th>Tên viết tắt</th>
              <th>Người liên hệ</th>
              <th>Điện thoại</th>
              <th>Giá trị T1-T7</th>
              <th>Lượt mua</th>
              <th>Mã hàng</th>
            </tr>
          </thead>
          <tbody>
            {!shownSuppliers.length && (
              <tr>
                <td colSpan={7}>Không tìm thấy nhà cung cấp phù hợp.</td>
              </tr>
            )}
            {shownSuppliers.map((supplier) => {
              const stats = supplierStats(supplier);
              const isSelected = selectedSupplierId === supplier.id;
              const selectedRows = isSelected ? supplierHistoryRows(supplier) : [];
              return (
                <Fragment key={supplier.id}>
                  <tr
                    className={isSelected ? "selected" : ""}
                  >
                    <td>
                      <b className="supplier-list-code">{supplier.code}</b>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="supplier-list-name"
                        onClick={() =>
                          setSelectedSupplierId(
                            isSelected
                              ? null
                              : supplier.id,
                          )
                        }
                      >
                        {supplier.name || "Chưa đặt tên NCC"}
                      </button>
                      <small>{supplier.bank || supplier.address || "Chưa có thông tin phụ"}</small>
                    </td>
                    <td>{supplier.shortName || "—"}</td>
                    <td>{supplier.contact || "—"}</td>
                    <td>{supplier.phone || "—"}</td>
                    <td className="money">{fmt(stats.totalValue)} ₫</td>
                    <td>{stats.count}</td>
                    <td>{stats.itemCount}</td>
                  </tr>
                  {isSelected && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, border: 0 }}>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', margin: '8px', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                            <section className="supplier-detail-panel">
    <div className="supplier-detail-heading">
      <div>
        <em>{supplier.code}</em>
        <h2>{supplier.name}</h2>
        <p>Thông tin chi tiết và lịch sử nhập kho theo nhà cung cấp.</p>
      </div>
      <button
        className="ghost"
        type="button"
        onClick={() => setSelectedSupplierId(null)}
      >
        Đóng chi tiết
      </button>
    </div>
    <div className="supplier-history-kpis compact">
      <span>
        <b>{fmt(stats.totalValue)} ₫</b>
        <small>Giá trị T1-T7</small>
      </span>
      <span>
        <b>{stats.count}</b>
        <small>Lượt mua</small>
      </span>
      <span>
        <b>{stats.itemCount}</b>
        <small>Mã hàng</small>
      </span>
    </div>
    {!!stats.topItems.length && (
      <div className="supplier-top-items compact">
        {stats.topItems.map((item) => (
          <small key={item.code}>
            {item.code} · {item.name} · {fmt(item.value)} ₫
          </small>
        ))}
      </div>
    )}
    <div className="supplier-fields">
      <label>
        Mã nhà cung cấp
        <input
          value={supplier.code}
          onChange={(e) =>
            update(supplier.id, "code", e.target.value)
          }
        />
      </label>
      <label>
        Tên nhà cung cấp
        <input
          value={supplier.name}
          onChange={(e) =>
            update(supplier.id, "name", e.target.value)
          }
        />
      </label>
      <label>
        Tên viết tắt (Tùy chọn)
        <input
          value={supplier.shortName || ""}
          onChange={(e) =>
            update(supplier.id, "shortName", e.target.value)
          }
        />
      </label>
      <label>
        Số tài khoản
        <input
          value={supplier.bankAccount}
          onChange={(e) =>
            update(supplier.id, "bankAccount", e.target.value)
          }
        />
      </label>
      <label>
        Ngân hàng
        <input
          value={supplier.bank}
          onChange={(e) =>
            update(supplier.id, "bank", e.target.value)
          }
        />
      </label>
      <label className="full">
        Địa chỉ
        <input
          value={supplier.address}
          onChange={(e) =>
            update(supplier.id, "address", e.target.value)
          }
        />
      </label>
      <label>
        Người liên hệ
        <input
          value={supplier.contact}
          onChange={(e) =>
            update(supplier.id, "contact", e.target.value)
          }
        />
      </label>
      <label>
        Điện thoại
        <input
          value={supplier.phone}
          onChange={(e) =>
            update(supplier.id, "phone", e.target.value)
          }
        />
      </label>
    </div>
    <div className="supplier-purchase-history">
      <div className="supplier-history-title">
        <div>
          <h3>Lịch sử mua · {supplier.name}</h3>
          <p>Tra cứu nhanh các lần nhập kho theo nhà cung cấp.</p>
        </div>
        <span>{selectedRows.length} dòng</span>
      </div>
      <div className="supplier-history-table">
        <table>
          <thead>
            <tr>
              <th>Ngày mua</th>
              <th>Chứng từ / PO</th>
              <th>Mã hàng</th>
              <th>Tên hàng hóa</th>
              <th>Số lượng</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {!selectedRows.length && (
              <tr>
                <td colSpan={7}>
                  Chưa có lịch sử mua với nhà cung cấp này.
                </td>
              </tr>
            )}
            {selectedRows.map((row) => (
              <tr key={row.id}>
                <td>{dateVN(row.documentDate || row.accountingDate)}</td>
                <td>
                  <b>{row.documentNo || row.invoiceNo || "Nhập kho"}</b>
                  <small>{row.warehouseName}</small>
                </td>
                <td>{row.itemCode}</td>
                <td>
                  <b>{row.itemName}</b>
                  <small>{row.description}</small>
                </td>
                <td>
                  {fmt(row.quantity)} {row.unit}
                </td>
                <td className="money">{fmt(row.unitPrice)} ₫</td>
                <td className="money">{fmt(row.value)} ₫</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
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
