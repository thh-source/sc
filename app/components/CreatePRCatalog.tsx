import React, { ChangeEvent, useState, useMemo, useEffect } from "react";
import { Item, ColumnKey, SortState } from "../types";
import { fmt, makeId, emptyItem, applyTools, BASE_COLUMNS } from "../utils";
import { DraftItemsTable } from "./DraftItemsTable";
import { addNewDepartment, getUnifiedDepartments } from "../utils/departments";

export function CreatePRCatalog({
  draft,
  setDraft,
  products,
  itemChange,
  fileRef,
  importExcel,
  message,
  onCancel,
  onSave,
}: {
  draft: {
    number: string;
    date: string;
    department: string;
    purpose: string;
    note: string;
    items: Item[];
  };
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
  products: Item[];
  itemChange: (
    id: number,
    k: keyof Item,
    v: string,
    forDraft?: boolean,
  ) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  importExcel: (e: ChangeEvent<HTMLInputElement>) => void;
  message: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [sysDepts, setSysDepts] = useState<string[]>(() => getUnifiedDepartments());
  useEffect(() => {
    const onDeptsUpdated = () => setSysDepts(getUnifiedDepartments());
    window.addEventListener("scm_departments_updated", onDeptsUpdated);
    return () => window.removeEventListener("scm_departments_updated", onDeptsUpdated);
  }, []);

  const [selectedProduct, setSelectedProduct] = useState(""),
    [order, setOrder] = useState<ColumnKey[]>(BASE_COLUMNS.map((c) => c.key)),
    [filters, setFilters] = useState<Partial<Record<ColumnKey, string[]>>>({}),
    [sort, setSort] = useState<SortState>(null),
    [open, setOpen] = useState<ColumnKey | null>(null);
  const visible = useMemo(
      () => applyTools(draft.items, order, filters, sort),
      [draft.items, order, filters, sort],
    ),
    total = draft.items.reduce((s, i) => s + i.qty * i.estimate, 0);
  const addCatalogProduct = () => {
    const product = products.find((p) => p.id === Number(selectedProduct));
    if (!product) return;
    setDraft((d) => ({
      ...d,
      items: [...d.items, { ...product, id: makeId(), qty: 1 }],
    }));
    setSelectedProduct("");
  };

  return (
    <section className="content create-page">
      <div className="heading">
        <div>
          <em>ĐỀ NGHỊ MUA HÀNG</em>
          <h1>Tạo PR mới</h1>
          <p>Chọn hàng từ danh mục hoặc tạo mới nếu chưa có.</p>
        </div>
        <div className="actions">

          <button className="ghost" onClick={onCancel}>
            Hủy
          </button>
          <button
            className="primary"
            onClick={onSave}
            disabled={
              !draft.number ||
              !draft.date ||
              !draft.department ||
              !draft.purpose
            }
          >
            Lưu PR
          </button>
        </div>
      </div>
      <div className="form-card">
        <div className="section-title">
          <span>1</span>
          <div>
            <h2>Thông tin PR</h2>
            <p>Các thông tin nhận diện và mục đích sử dụng</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Số PR <b>*</b>
            <input
              value={draft.number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, number: e.target.value }))
              }
            />
          </label>
          <label>
            Ngày PR <b>*</b>
            <input
              type="date"
              value={draft.date}
              onChange={(e) =>
                setDraft((d) => ({ ...d, date: e.target.value }))
              }
            />
          </label>
          <label>
            Đơn vị <b>*</b>
            <select
              value={draft.department}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__ADD_NEW__") {
                  const name = window.prompt("Nhập tên / mã phòng ban mới để lưu vào hệ thống:", "");
                  if (name && name.trim()) {
                    addNewDepartment(name.trim());
                    setDraft((d) => ({ ...d, department: name.trim() }));
                  }
                  return;
                }
                setDraft((d) => ({ ...d, department: val }));
              }}
              style={{
                height: "42px",
                border: "1px solid #ccd8e5",
                borderRadius: "6px",
                padding: "0 11px",
                outline: 0,
                color: "var(--ink)",
                background: "white",
                cursor: "pointer",
              }}
            >
              <option value="">-- Chọn đơn vị / phòng ban --</option>
              {sysDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value="__ADD_NEW__">＋ Thêm phòng ban mới...</option>
            </select>
          </label>
          <label className="purpose-input">
            Mục đích sử dụng <b>*</b>
            <textarea
              rows={3}
              value={draft.purpose}
              onChange={(e) =>
                setDraft((d) => ({ ...d, purpose: e.target.value }))
              }
            />
          </label>
          <label className="common-note-input">
            Ghi chú chung PR
            <textarea
              rows={4}
              value={draft.note}
              placeholder="Nhập diễn giải tự do, lưu ý xử lý hoặc thông tin liên quan..."
              onChange={(e) =>
                setDraft((d) => ({ ...d, note: e.target.value }))
              }
            />
          </label>
        </div>
      </div>
      <div className="form-card items-card">
        <div className="items-heading">
          <div className="section-title">
            <span>2</span>
            <div>
              <h2>Danh sách hàng hóa</h2>
              <p>Chọn sản phẩm có sẵn hoặc nhập mới trực tiếp vào bảng</p>
            </div>
          </div>
          <div className="excel-actions">
            <a
              className="ghost download"
              href="/mau-nhap-danh-sach-hang-hoa-pr.xlsx"
              download
            >
              ⇩ Tải Excel mẫu
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={importExcel}
            />
            <button
              className="excel-upload"
              onClick={() => fileRef.current?.click()}
            >
              ⇧ Nhập Excel
            </button>
          </div>
        </div>
        <div className="catalog-picker">
          <div>
            <label>
              Chọn từ danh mục
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">— Tìm và chọn hàng hóa —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name} · {p.spec}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!selectedProduct}
              onClick={addCatalogProduct}
            >
              Thêm vào PR
            </button>
          </div>
          <span>hoặc</span>
          <button
            className="new-product-btn"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                items: [
                  ...d.items,
                  {
                    ...emptyItem(d.items.length),
                    code: `VT-${String(products.length + 1).padStart(3, "0")}`,
                  },
                ],
              }))
            }
          >
            ＋ Tạo hàng hóa mới
          </button>
          <small>Hàng hóa mới sẽ tự động lưu vào danh mục khi lưu PR.</small>
        </div>
        {message && (
          <div
            className={`import-message ${message.startsWith("Không") ? "error" : ""}`}
          >
            {message}
          </div>
        )}
        <DraftItemsTable
          items={draft.items}
          visibleItems={visible}
          order={order}
          setOrder={setOrder}
          filters={filters}
          setFilters={setFilters}
          sort={sort}
          setSort={setSort}
          filterOpen={open}
          setFilterOpen={setOpen}
          itemChange={itemChange}
          setDraft={setDraft}
        />
        <button
          className="add-row"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              items: [...d.items, emptyItem(d.items.length)],
            }))
          }
        >
          ＋ Thêm dòng hàng hóa
        </button>
      </div>
      <div className="create-footer">
        <p>
          <b>{draft.items.filter((i) => i.code || i.name).length}</b> mặt hàng ·
          Tổng dự kiến <strong>{fmt(total)} ₫</strong>
        </p>
        <div>
          <button className="ghost" onClick={onCancel}>
            Hủy
          </button>
          <button className="primary" onClick={onSave}>
            Lưu PR
          </button>
        </div>
      </div>
    </section>
  );
}

