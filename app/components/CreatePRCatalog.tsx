import React, { ChangeEvent, useState, useMemo, useEffect } from "react";
import { ArrowLeft, Check, Plus, Download, Upload, Paperclip, Eye, Trash2, Loader2 } from "lucide-react";
import { compressImageIfNeeded } from "../utils/compressImage";
import { PRScanPreviewModal } from "./PRScanPreviewModal";
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
    scan_file_url?: string;
  };
  setDraft: React.Dispatch<
    React.SetStateAction<{
      number: string;
      date: string;
      department: string;
      purpose: string;
      note: string;
      items: Item[];
      scan_file_url?: string;
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

  const [uploadingScan, setUploadingScan] = useState(false);
  const [scanFileName, setScanFileName] = useState("");
  const [scanError, setScanError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const scanInputRef = React.useRef<HTMLInputElement>(null);

  const handleScanUpload = async (file: File) => {
    setScanError("");
    if (!file) return;

    if (file.size > 5 * 1024 * 1024 && file.type === "application/pdf") {
      setScanError("File PDF vượt quá 5MB. Vui lòng chọn file nhẹ hơn.");
      return;
    }

    setUploadingScan(true);
    try {
      const finalFile = await compressImageIfNeeded(file);
      if (finalFile.size > 5 * 1024 * 1024) {
        setScanError("Ảnh sau khi nén vẫn vượt quá 5MB. Vui lòng chọn ảnh dung lượng vừa phải hơn.");
        setUploadingScan(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", finalFile);
      formData.append("pr_code", draft.number || "PR");

      const res = await fetch("/api/upload-scan", {
        method: "POST",
        body: formData,
      });

      const data: any = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Tải lên bản scan thất bại");
      }

      setDraft((d) => ({ ...d, scan_file_url: data.scan_file_url }));
      setScanFileName(file.name);
    } catch (err: any) {
      setScanError(err.message || "Lỗi tải lên bản scan");
    } finally {
      setUploadingScan(false);
    }
  };

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
    <div
      className="create-page w-full min-h-full p-4 md:p-6 pb-32 space-y-4"
      style={{
        width: "100%",
        minHeight: "100%",
        paddingBottom: "140px",
        boxSizing: "border-box",
      }}
    >
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
      <div className="form-card pr-info-card" style={{ padding: "12px 16px", marginBottom: "12px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <div className="section-title" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span className="section-step" style={{ width: "24px", height: "24px", minWidth: "24px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, background: "#0f172a", color: "#ffffff", display: "grid", placeItems: "center", flexShrink: 0 }}>1</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Thông tin PR</h2>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, fontWeight: 400 }}>· Nhận diện, mục đích & bản scan</p>
          </div>
        </div>

        {/* Hàng 1: 4 cột ngang trên 1 dòng */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
            <span>Số PR <b style={{ color: "#ef4444" }}>*</b></span>
            <input
              type="text"
              value={draft.number}
              onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
              style={{
                height: "36px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "0 10px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#0f172a",
                outline: 0,
                background: "#ffffff",
              }}
              placeholder="VD: PR-2026-0001"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
            <span>Ngày PR <b style={{ color: "#ef4444" }}>*</b></span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              style={{
                height: "36px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "0 10px",
                fontSize: "13px",
                color: "#1e293b",
                outline: 0,
                background: "#ffffff",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
            <span>Đơn vị / Phòng ban <b style={{ color: "#ef4444" }}>*</b></span>
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
                height: "36px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "0 10px",
                fontSize: "13px",
                color: "#1e293b",
                outline: 0,
                background: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value="">-- Chọn đơn vị --</option>
              {sysDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value="__ADD_NEW__">＋ Thêm phòng ban mới...</option>
            </select>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Paperclip size={13} style={{ color: "#0284c7" }} /> Bản scan PR (PDF/Ảnh)
            </span>
            <input
              ref={scanInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleScanUpload(f);
              }}
            />
            {draft.scan_file_url ? (
              <div
                style={{
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 8px",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "#166534",
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "115px",
                  }}
                  title={scanFileName || "Bản scan PR"}
                >
                  <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span> {scanFileName || "Đã có scan"}
                </span>
                <div style={{ display: "inline-flex", gap: "4px" }}>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    title="Xem trực tiếp bản scan"
                    style={{
                      padding: "3px 6px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#0369a1",
                      backgroundColor: "#ffffff",
                      border: "1px solid #bae6fd",
                      borderRadius: "4px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, scan_file_url: "" }));
                      setScanFileName("");
                    }}
                    title="Xóa file scan"
                    style={{
                      padding: "3px 6px",
                      fontSize: "11px",
                      color: "#dc2626",
                      backgroundColor: "#ffffff",
                      border: "1px solid #fecaca",
                      borderRadius: "4px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => scanInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleScanUpload(f);
                }}
                disabled={uploadingScan}
                style={{
                  height: "36px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  border: `1px dashed ${isDragging ? "#0284c7" : "#0284c7"}`,
                  background: isDragging ? "#e0f2fe" : "#f0f9ff",
                  borderRadius: "6px",
                  color: "#0369a1",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0 8px",
                  width: "100%",
                  transition: "all 0.15s ease",
                }}
                title="Bấm để chọn file scan hoặc kéo thả trực tiếp (tối đa 5MB)"
              >
                {uploadingScan ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-sky-600" />
                    <span>Đang nén & lưu...</span>
                  </>
                ) : (
                  <>
                    <Paperclip size={14} />
                    <span>Đính kèm scan PR</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {scanError && (
          <div style={{ color: "#ef4444", fontSize: "11.5px", marginBottom: "6px", fontWeight: 600 }}>
            ⚠ {scanError}
          </div>
        )}

        {/* Hàng 2: Gộp Mục đích & Ghi chú thành 2 cột song song */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "10px",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
            <span>Mục đích sử dụng <b style={{ color: "#ef4444" }}>*</b></span>
            <textarea
              rows={2}
              value={draft.purpose}
              onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
              placeholder="Nhập mục đích sử dụng (bắt buộc)..."
              style={{
                height: "56px",
                minHeight: "56px",
                maxHeight: "120px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "13px",
                lineHeight: 1.35,
                color: "#1e293b",
                outline: 0,
                resize: "vertical",
                background: "#ffffff",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
            <span>Ghi chú chung PR</span>
            <textarea
              rows={2}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Nhập ghi chú hoặc thông tin bổ sung (nếu có)..."
              style={{
                height: "56px",
                minHeight: "56px",
                maxHeight: "120px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "13px",
                lineHeight: 1.35,
                color: "#1e293b",
                outline: 0,
                resize: "vertical",
                background: "#ffffff",
              }}
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
      {showPreviewModal && draft.scan_file_url && (
        <PRScanPreviewModal
          pr={{
            number: draft.number || "PR-MỚI",
            scan_file_url: draft.scan_file_url,
            department: draft.department,
          }}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  );
}

