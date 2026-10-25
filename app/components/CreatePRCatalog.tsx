import React, { ChangeEvent, useState, useMemo, useEffect } from "react";
import { ArrowLeft, Check, Plus, Download, Upload } from "lucide-react";
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
          <h1>Tạo PR mới</h1>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            <ArrowLeft size={16} /> Quay lại
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={
              !draft.number ||
              !draft.date ||
              !draft.department ||
              !draft.purpose
            }
          >
            <Check size={16} /> Lưu PR
          </button>
        </div>
      </div>
      <div className="form-card">
        <div className="section-title">
          <span className="section-step">1</span>
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
            <span className="section-step">2</span>
            <div>
              <h2>Danh sách hàng hóa</h2>
              <p>Chọn sản phẩm có sẵn từ danh mục hoặc nhập mới trực tiếp vào bảng</p>
            </div>
          </div>
          <div className="excel-actions">
            <a
              className="btn btn-secondary btn-sm download"
              href="/mau-nhap-danh-sach-hang-hoa-pr.xlsx"
              download
            >
              <Download size={14} /> Tải Excel mẫu
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={importExcel}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm excel-upload"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} /> Nhập Excel
            </button>
          </div>
        </div>

        <div className="catalog-picker-toolbar">
          <div className="catalog-picker-left">
            <span className="picker-label">Thêm từ danh mục:</span>
            <select
              className="catalog-select"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              <option value="">— Tìm và chọn hàng hóa từ kho danh mục —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name} · {p.spec}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!selectedProduct}
              onClick={addCatalogProduct}
            >
              <Plus size={14} /> Thêm vào PR
            </button>
          </div>
          <div className="catalog-picker-right">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
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
              <Plus size={14} /> Tạo hàng hóa mới
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`import-message ${message.startsWith("Không") ? "error" : ""}`}
          >
            {message}
          </div>
        )}

        <div className="pr-work-table-container">
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
        </div>

        <div className="table-bottom-actions">
          <button
            type="button"
            className="btn btn-secondary add-row-btn"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                items: [...d.items, emptyItem(d.items.length)],
              }))
            }
          >
            <Plus size={15} /> Thêm dòng hàng hóa
          </button>
        </div>
      </div>

      <div className="create-footer">
        <div className="create-footer-summary">
          <span className="summary-badge">PR Workspace</span>
          <p>
            Đang có <b>{draft.items.filter((i) => i.code || i.name).length}</b> mặt hàng hợp lệ ·
            Tổng dự kiến: <strong>{fmt(total)} ₫</strong>
          </p>
        </div>
        <div className="create-footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            <ArrowLeft size={16} /> Quay lại
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={
              !draft.number ||
              !draft.date ||
              !draft.department ||
              !draft.purpose
            }
          >
            <Check size={16} /> Lưu PR
          </button>
        </div>
      </div>
    </section>
  );
}

