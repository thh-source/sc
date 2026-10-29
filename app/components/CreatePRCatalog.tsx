import React, { ChangeEvent, useState, useMemo, useEffect } from "react";
import { ArrowLeft, Check, Plus, Download, Upload, Paperclip, Eye, Trash2, Loader2, AlertTriangle, RotateCcw, ChevronRight } from "lucide-react";
import { compressImageIfNeeded } from "../utils/compressImage";
import { PRScanPreviewModal } from "./PRScanPreviewModal";
import { Item, ColumnKey, SortState } from "../types";
import { fmt, makeId, emptyItem, applyTools, BASE_COLUMNS } from "../utils";
import { DraftItemsTable } from "./DraftItemsTable";
import { addNewDepartment, getUnifiedDepartments } from "../utils/departments";
import { saveFormDraft, getFormDraft, clearFormDraft } from "../utils/offlineSync";
import { useIsMobile } from "../useIsMobile";

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
  const [showNoteField, setShowNoteField] = useState(false);
  const scanInputRef = React.useRef<HTMLInputElement>(null);

  // Quản lý phục hồi & tự động lưu bản nháp Offline
  const [draftPrompt, setDraftPrompt] = useState<{
    data: typeof draft;
    time: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    getFormDraft<typeof draft>("pr_draft_form").then((saved) => {
      if (!active || !saved || !saved.data) return;
      const d = saved.data;
      const hasContent = Boolean(
        d.purpose ||
        d.department ||
        d.note ||
        (d.items && d.items.length > 1) ||
        (d.items && d.items[0] && (d.items[0].code || d.items[0].name))
      );
      // Nếu form hiện tại chưa nhập gì mà có bản nháp cũ -> gợi ý khôi phục
      const currentEmpty = !draft.purpose && !draft.department && (!draft.items || draft.items.length <= 1);
      if (hasContent && currentEmpty) {
        setDraftPrompt({
          data: d,
          time: new Date(saved.updatedAt).toLocaleTimeString("vi-VN") + " " + new Date(saved.updatedAt).toLocaleDateString("vi-VN"),
        });
      }
    });
    return () => { active = false; };
  }, []);

  // Tự động lưu form nháp mỗi 3 giây khi có dữ liệu
  useEffect(() => {
    const hasContent = Boolean(
      draft.purpose ||
      draft.department ||
      draft.note ||
      (draft.items && draft.items.some((i) => i.code || i.name))
    );
    if (!hasContent) return;

    const timer = setTimeout(() => {
      void saveFormDraft("pr_draft_form", draft, `Bản nháp ${draft.number || "PR"}`);
    }, 2500);

    return () => clearTimeout(timer);
  }, [draft]);

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

  const isMobile = useIsMobile();
  const [mobileStep, setMobileStep] = useState<1 | 2>(1);

  if (isMobile) {
    return (
      <div className="create-page w-full min-h-screen pb-32 px-3 pt-3 bg-slate-50 text-slate-800">
        {/* Mobile Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 m-0">Tạo PR Mua sắm</h1>
              <span className="text-xs text-slate-500">Bước {mobileStep}/2: {mobileStep === 1 ? "Thông tin chung" : "Hàng hóa"}</span>
            </div>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm"
            onClick={onSave}
            disabled={!draft.number || !draft.date || !draft.department || !draft.purpose}
          >
            Lưu PR
          </button>
        </div>

        {/* 2-Step Pill Tabs */}
        <div className="grid grid-cols-2 gap-2 my-3">
          <button
            type="button"
            onClick={() => setMobileStep(1)}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
              mobileStep === 1
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              mobileStep === 1 ? "bg-white text-blue-600" : "bg-slate-100 text-slate-600"
            }`}>1</span>
            <span>Thông tin chung</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileStep(2)}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
              mobileStep === 2
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              mobileStep === 2 ? "bg-white text-blue-600" : "bg-slate-100 text-slate-600"
            }`}>2</span>
            <span>Hàng hóa ({draft.items.length})</span>
          </button>
        </div>

        {/* STEP 1: THÔNG TIN CHUNG */}
        {mobileStep === 1 && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mã số PR <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={draft.number}
                  onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
                  placeholder="VD: PR-2026-0001"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Ngày lập PR <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Phòng ban / Đơn vị yêu cầu <span className="text-red-500">*</span>
                </label>
                <select
                  value={draft.department}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__ADD_NEW__") {
                      const name = window.prompt("Nhập tên phòng ban mới:", "");
                      if (name && name.trim()) {
                        addNewDepartment(name.trim());
                        setDraft((d) => ({ ...d, department: name.trim() }));
                      }
                      return;
                    }
                    setDraft((d) => ({ ...d, department: val }));
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 bg-white"
                >
                  <option value="">-- Chọn đơn vị / phòng ban --</option>
                  {sysDepts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  <option value="__ADD_NEW__">＋ Thêm phòng ban mới...</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mục đích sử dụng <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={draft.purpose}
                  onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
                  placeholder="Mục đích sử dụng hàng hóa (bắt buộc)..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Ghi chú chung PR: Không tự động hiện, người dùng ấn nút mới hiện */}
              {showNoteField || Boolean(draft.note && draft.note.trim()) ? (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Ghi chú chung PR
                    </label>
                    <button
                      type="button"
                      onClick={() => { setDraft((d) => ({ ...d, note: "" })); setShowNoteField(false); }}
                      className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                    >
                      ✕ Ẩn ghi chú
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={draft.note}
                    onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                    placeholder="Ghi chú thêm về yêu cầu mua sắm..."
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowNoteField(true)}
                    className="px-3.5 py-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Thêm Ghi chú chung PR
                  </button>
                </div>
              )}

              {/* Scan Attachment */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                  <Paperclip size={14} className="text-blue-600" />
                  Bản scan / Phiếu ký PR
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
                  <div className="flex items-center justify-between p-2.5 bg-sky-50 border border-sky-200 rounded-xl">
                    <span className="text-xs font-semibold text-sky-800 truncate">
                      ✓ Đã đính kèm bản scan PR
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPreviewModal(true)}
                        className="px-2 py-1 bg-white border border-sky-300 rounded-lg text-xs font-semibold text-sky-700"
                      >
                        Xem
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, scan_file_url: "" }))}
                        className="p-1 text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => scanInputRef.current?.click()}
                    className="w-full py-2.5 border border-dashed border-sky-400 bg-sky-50/50 rounded-xl text-xs font-semibold text-sky-700 flex items-center justify-center gap-2"
                  >
                    {uploadingScan ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-sky-600" />
                        <span>Đang tải lên...</span>
                      </>
                    ) : (
                      <>
                        <Paperclip size={14} />
                        <span>Chụp hoặc tải ảnh/PDF scan</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Next Button */}
            <button
              type="button"
              onClick={() => setMobileStep(2)}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 text-sm"
            >
              <span>Tiếp tục: Danh sách hàng hóa ({draft.items.length})</span>
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* STEP 2: DANH SÁCH HÀNG HÓA */}
        {mobileStep === 2 && (
          <div className="space-y-3">
            {/* Quick Catalog / Add bar */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Thêm hàng từ danh mục:</span>
              <div className="flex gap-2">
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="flex-1 h-9 px-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800"
                >
                  <option value="">-- Chọn sản phẩm có sẵn --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit || "Cái"})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedProduct}
                  onClick={addCatalogProduct}
                  className="px-3 h-9 bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <Plus size={14} /> Thêm
                </button>
              </div>
            </div>

            {/* Mini Cards for each item */}
            <div className="space-y-2.5">
              {draft.items.map((item, idx) => {
                const itemTotal = (Number(item.qty) || 0) * (Number(item.estimate) || 0);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => itemChange(item.id, "name", e.target.value, true)}
                          placeholder="Tên hàng hóa / quy cách *"
                          className="font-bold text-sm text-slate-900 border-b border-transparent focus:border-blue-500 outline-none w-full"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            items: d.items.filter((it) => it.id !== item.id),
                          }))
                        }
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block mb-0.5">Quy cách / Model</span>
                        <input
                          type="text"
                          value={item.spec || ""}
                          onChange={(e) => itemChange(item.id, "spec", e.target.value, true)}
                          placeholder="Quy cách kỹ thuật..."
                          className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-700 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block mb-0.5">Đơn vị tính</span>
                        <input
                          type="text"
                          value={item.unit || "Cái"}
                          onChange={(e) => itemChange(item.id, "unit", e.target.value, true)}
                          placeholder="ĐVT (Cái, Bộ...)"
                          className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-700 outline-none"
                        />
                      </div>
                    </div>

                    {/* Quantity Controller & Price */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      {/* Qty +/- */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 mr-1">SL:</span>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = Number(item.qty) || 1;
                            itemChange(item.id, "qty", String(Math.max(1, cur - 1)), true);
                          }}
                          className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm hover:bg-slate-200 active:scale-95"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.qty || 1}
                          min={1}
                          onChange={(e) => itemChange(item.id, "qty", e.target.value, true)}
                          className="w-12 h-7 text-center font-bold text-xs rounded-lg border border-slate-200 text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cur = Number(item.qty) || 1;
                            itemChange(item.id, "qty", String(cur + 1), true);
                          }}
                          className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm hover:bg-slate-200 active:scale-95"
                        >
                          +
                        </button>
                      </div>

                      {/* Price */}
                      <div className="text-right">
                        <div className="text-[11px] text-slate-500">Đơn giá dự kiến:</div>
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            value={item.estimate || ""}
                            onChange={(e) => itemChange(item.id, "estimate", e.target.value, true)}
                            placeholder="0"
                            className="w-20 h-7 text-right px-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-800"
                          />
                          <span className="text-xs text-slate-500">₫</span>
                        </div>
                      </div>
                    </div>

                    {/* Subtotal */}
                    {itemTotal > 0 && (
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-600 bg-slate-50 p-2 rounded-xl">
                        <span>Thành tiền:</span>
                        <span className="text-blue-700 font-bold">{fmt(itemTotal)} ₫</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Custom Item Button */}
            <button
              type="button"
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
              className="w-full py-3 bg-white border border-dashed border-blue-400 text-blue-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Plus size={16} /> Thêm mặt hàng mới
            </button>

            {/* Total Summary */}
            <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between shadow-lg">
              <div>
                <span className="text-xs text-slate-400 block">Tổng cộng ({draft.items.length} mặt hàng)</span>
                <span className="text-base font-extrabold text-emerald-400">{fmt(total)} ₫</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileStep(1)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Sửa bước 1
              </button>
            </div>
          </div>
        )}

        {/* STICKY BOTTOM ACTION CTA */}
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-xl z-50">
          <button
            type="button"
            onClick={onSave}
            disabled={!draft.number || !draft.date || !draft.department || !draft.purpose}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-400 text-white font-extrabold rounded-2xl shadow-lg flex items-center justify-center gap-2 text-base transition-all"
          >
            <Check size={20} />
            <span>Gửi phê duyệt / Lưu PR</span>
          </button>
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

      {draftPrompt && (
        <div
          style={{
            backgroundColor: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={18} style={{ color: "#d97706", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#92400e" }}>
                Phát hiện bản nháp PR chưa hoàn thành (lưu lúc {draftPrompt.time})
              </div>
              <div style={{ fontSize: "11px", color: "#b45309" }}>
                {draftPrompt.data.department ? `Bộ phận: ${draftPrompt.data.department} · ` : ""}
                {draftPrompt.data.purpose ? `Mục đích: ${draftPrompt.data.purpose.slice(0, 40)}... · ` : ""}
                {draftPrompt.data.items?.length || 0} mặt hàng
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ fontSize: "12px", padding: "4px 10px" }}
              onClick={() => {
                setDraft(draftPrompt.data);
                setDraftPrompt(null);
              }}
            >
              <RotateCcw size={13} /> Khôi phục dữ liệu
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "12px", padding: "4px 8px" }}
              onClick={() => {
                void clearFormDraft("pr_draft_form");
                setDraftPrompt(null);
              }}
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}
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

          {showNoteField || Boolean(draft.note && draft.note.trim()) ? (
            <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Ghi chú chung PR</span>
                <button
                  type="button"
                  onClick={() => { setDraft((d) => ({ ...d, note: "" })); setShowNoteField(false); }}
                  style={{ background: "transparent", border: 0, color: "#64748b", fontSize: "11px", cursor: "pointer" }}
                >
                  ✕ Ẩn ghi chú
                </button>
              </div>
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
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", height: "56px" }}>
              <button
                type="button"
                onClick={() => setShowNoteField(true)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px dashed #cbd5e1",
                  background: "#f8fafc",
                  color: "#475569",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Plus size={13} /> Thêm Ghi chú chung PR
              </button>
            </div>
          )}
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

