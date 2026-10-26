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

          {/* Ô tải lên bản PR scan (PDF/Ảnh) */}
          <div
            className="scan-upload-field"
            style={{
              gridColumn: "1 / -1",
              borderTop: "1px dashed #cbd5e1",
              paddingTop: "14px",
              marginTop: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
                flexWrap: "wrap",
                gap: "6px",
              }}
            >
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#1e293b",
                }}
              >
                <Paperclip size={16} style={{ color: "#0284c7" }} />
                Tải lên bản PR scan (PDF/Ảnh)
              </label>
              <small style={{ color: "#64748b", fontSize: "12px" }}>
                Hỗ trợ PDF, JPG, PNG (tối đa 5MB, tự động nén ảnh giữ nét tài liệu)
              </small>
            </div>

            {draft.scan_file_url ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: "8px",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      background: "#dcfce7",
                      color: "#16a34a",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "16px",
                    }}
                  >
                    ✓
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "#166534" }}>
                      {scanFileName || "Bản scan PR đã tải lên thành công"}
                    </div>
                    <small style={{ color: "#15803d", fontSize: "11.5px" }}>
                      Đã lưu trữ an toàn trên Cloudflare R2 & D1
                    </small>
                  </div>
                </div>

                <div style={{ display: "inline-flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#0369a1",
                      backgroundColor: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      borderRadius: "5px",
                    }}
                    onClick={() => setShowPreviewModal(true)}
                  >
                    <Eye size={14} /> Xem trực tiếp
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      fontSize: "12px",
                      color: "#dc2626",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "5px",
                    }}
                    onClick={() => {
                      setDraft((d) => ({ ...d, scan_file_url: "" }));
                      setScanFileName("");
                    }}
                  >
                    <Trash2 size={14} /> Xóa file
                  </button>
                </div>
              </div>
            ) : (
              <div
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
                onClick={() => scanInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "#0284c7" : "#cbd5e1"}`,
                  borderRadius: "8px",
                  padding: "16px 20px",
                  textAlign: "center",
                  background: isDragging ? "#f0f9ff" : "#f8fafc",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
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
                {uploadingScan ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      color: "#0284c7",
                      padding: "10px 0",
                    }}
                  >
                    <Loader2 size={20} className="animate-spin" />
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>
                      Đang nén & lưu bản scan lên Cloudflare R2...
                    </span>
                  </div>
                ) : (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        color: "#334155",
                        marginBottom: "4px",
                      }}
                    >
                      <Paperclip size={18} style={{ color: "#0284c7" }} />
                      <strong style={{ fontSize: "13px" }}>
                        Kéo thả file scan vào đây hoặc bấm để chọn file
                      </strong>
                    </div>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                      Hỗ trợ chụp trực tiếp từ camera điện thoại hoặc tải file PDF / Ảnh (tối đa 5MB)
                    </p>
                  </div>
                )}
              </div>
            )}

            {scanError && (
              <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "6px", fontWeight: 600 }}>
                ⚠ {scanError}
              </div>
            )}
          </div>
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
    </section>
  );
}

