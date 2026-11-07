import React, { ChangeEvent, useState, useMemo, useEffect } from "react";
import { ArrowLeft, Check, Plus, Download, Upload, Paperclip, Eye, Trash2, Loader2, AlertTriangle, RotateCcw, ChevronRight, Cloud } from "lucide-react";
import { compressUploadFile } from "../utils/compressUploadFile";
import { PRScanPreviewModal } from "./PRScanPreviewModal";
import { CamScannerCloudModal } from "./CamScannerCloudModal";
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
  const [scanProgressMessage, setScanProgressMessage] = useState("");
  const [scanFileName, setScanFileName] = useState("");
  const [scanError, setScanError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCamScannerModal, setShowCamScannerModal] = useState(false);
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

    setUploadingScan(true);
    setScanProgressMessage("Đang tối ưu tài liệu...");
    try {
      const finalFile = await compressUploadFile(file, {
        onProgress: (_pct, msg) => {
          setScanProgressMessage(msg);
        },
      });

      const formData = new FormData();
      formData.append("file", finalFile);
      formData.append("pr_code", draft.number || "PR");

      setScanProgressMessage("Đang lưu trữ...");
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
      setScanProgressMessage("");
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
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => scanInputRef.current?.click()}
                      className="w-full py-2.5 border border-dashed border-sky-400 bg-sky-50/50 rounded-xl text-xs font-semibold text-sky-700 flex items-center justify-center gap-1.5"
                    >
                      {uploadingScan ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-sky-600" />
                          <span>Đang tải...</span>
                        </>
                      ) : (
                        <>
                          <Paperclip size={14} />
                          <span>Tải ảnh / PDF</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCamScannerModal(true)}
                      className="w-full py-2.5 border border-teal-400 bg-teal-50 rounded-xl text-xs font-bold text-teal-800 flex items-center justify-center gap-1.5"
                    >
                      <Cloud size={14} />
                      <span>Từ CamScanner</span>
                    </button>
                  </div>
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
                          value={item.unit ?? ""}
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
                          value={item.qty === 0 ? "" : item.qty}
                          placeholder="1"
                          min={1}
                          onChange={(e) => itemChange(item.id, "qty", e.target.value, true)}
                          onBlur={(e) => {
                            if (!Number(e.target.value)) itemChange(item.id, "qty", "1", true);
                          }}
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

        <CamScannerCloudModal
          isOpen={showCamScannerModal}
          onClose={() => setShowCamScannerModal(false)}
          targetLabel={draft.number ? `PR #${draft.number}` : "PR mới"}
          prCode={draft.number || "PR"}
          onImported={({ url, fileName }) => {
            setDraft((d) => ({ ...d, scan_file_url: url }));
            setScanFileName(fileName);
          }}
        />
      </div>
    );
  }

  return (
    <section
      className="content create-page stitch-create-pr-page"
      style={{
        width: "100%",
        minHeight: "100%",
        padding: "20px 24px 120px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* STITCH v2 WORKSPACE HEADER BAR */}
      <div
        className="stitch-workspace-header"
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "16px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.02)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "5px",
            background: "linear-gradient(180deg, #2B6DF8 0%, #e65100 100%)",
          }}
        />
        <div style={{ paddingLeft: "6px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11.5px",
              fontWeight: 600,
              color: "#64748b",
              marginBottom: "4px",
            }}
          >
            <span style={{ cursor: "pointer", color: "#2B6DF8" }} onClick={onCancel}>
              Yêu cầu Mua sắm (PR)
            </span>
            <span>/</span>
            <span
              style={{
                background: "#eff6ff",
                color: "#1e40af",
                padding: "1px 8px",
                borderRadius: "5px",
                border: "1px solid #bfdbfe",
                fontFamily: "var(--stitch-font-mono, monospace)",
                fontWeight: 700,
              }}
            >
              {draft.number || "PR-MỚI"}
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 800,
              color: "#2B6DF8",
              letterSpacing: "-0.015em",
            }}
          >
            Khởi tạo Yêu cầu Mua sắm (PR) &amp; Dự toán Vật tư
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "7px 14px",
            }}
          >
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Số mặt hàng
              </div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", fontFamily: "var(--stitch-font-mono, monospace)" }}>
                {draft.items.filter((i) => i.code || i.name).length} mục
              </div>
            </div>
            <div style={{ width: "1px", height: "26px", background: "#cbd5e1" }} />
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Tổng ngân sách dự kiến
              </div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#e65100", fontFamily: "var(--stitch-font-mono, monospace)" }}>
                {fmt(total)} ₫
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            style={{ height: "40px", padding: "0 16px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <ArrowLeft size={16} /> Quay lại
          </button>
          <button
            type="button"
            className="btn btn-primary po-create-btn"
            onClick={onSave}
            disabled={
              !draft.number ||
              !draft.date ||
              !draft.department ||
              !draft.purpose
            }
            style={{ height: "40px", padding: "0 20px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Check size={16} /> Lưu &amp; Phát hành PR
          </button>
        </div>
      </div>

      {draftPrompt && (
        <div
          style={{
            backgroundColor: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "12px",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            boxShadow: "0 2px 8px rgba(217, 119, 6, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={18} style={{ color: "#d97706", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#92400e" }}>
                Phát hiện bản nháp PR chưa hoàn thành (lưu lúc {draftPrompt.time})
              </div>
              <div style={{ fontSize: "11.5px", color: "#b45309" }}>
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
              style={{ fontSize: "12px", padding: "6px 12px" }}
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
              style={{ fontSize: "12px", padding: "6px 10px" }}
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

      {/* BƯỚC 1: THÔNG TIN ĐỊNH DANH & HỒ SƠ SCAN PR */}
      <div
        className="form-card pr-info-card"
        style={{
          padding: "20px 22px",
          background: "#ffffff",
          borderRadius: "14px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.02)",
        }}
      >
        <div
          className="section-title"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <span
            className="section-step"
            style={{
              width: "30px",
              height: "30px",
              minWidth: "30px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 800,
              background: "linear-gradient(135deg, #2B6DF8 0%, #1e40af 100%)",
              color: "#ffffff",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              boxShadow: "0 2px 6px rgba(12, 50, 111, 0.25)",
            }}
          >
            01
          </span>
          <div>
            <h2 style={{ fontSize: "15px", fontWeight: 800, margin: 0, color: "#0f172a" }}>
              Thông tin Định danh &amp; Chứng từ Yêu cầu Mua sắm (PR)
            </h2>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0", fontWeight: 500 }}>
              Khai báo mã số PR, phòng ban đề xuất, mục đích sử dụng và đính kèm bản scan phiếu gốc
            </p>
          </div>
        </div>

        {/* Hàng 1: 4 cột ngang trên 1 dòng */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
            marginBottom: "14px",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            <span>Mã số PR <b style={{ color: "#ef4444" }}>*</b></span>
            <input
              type="text"
              value={draft.number}
              onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
              style={{
                height: "40px",
                border: "1.5px solid #cbd5e1",
                borderRadius: "8px",
                padding: "0 12px",
                fontSize: "13.5px",
                fontWeight: 700,
                fontFamily: "var(--stitch-font-mono, monospace)",
                color: "#2B6DF8",
                outline: 0,
                background: "#f8fafc",
              }}
              placeholder="VD: PR-2026-0001"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            <span>Ngày lập PR <b style={{ color: "#ef4444" }}>*</b></span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              style={{
                height: "40px",
                border: "1.5px solid #cbd5e1",
                borderRadius: "8px",
                padding: "0 12px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#1e293b",
                outline: 0,
                background: "#ffffff",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            <span>Đơn vị / Phòng ban đề xuất <b style={{ color: "#ef4444" }}>*</b></span>
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
                height: "40px",
                border: "1.5px solid #cbd5e1",
                borderRadius: "8px",
                padding: "0 12px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#1e293b",
                outline: 0,
                background: "#ffffff",
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

          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <Paperclip size={13} style={{ color: "#0284c7" }} /> Hồ sơ Scan PR gốc (PDF/Ảnh)
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
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 10px",
                  background: "#f0fdf4",
                  border: "1.5px solid #86efac",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    color: "#166534",
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "135px",
                  }}
                  title={scanFileName || "Bản scan PR"}
                >
                  <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> {scanFileName || "Đã đính kèm scan"}
                </span>
                <div style={{ display: "inline-flex", gap: "4px" }}>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    title="Xem trực tiếp bản scan"
                    style={{
                      padding: "4px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#0369a1",
                      backgroundColor: "#ffffff",
                      border: "1px solid #bae6fd",
                      borderRadius: "6px",
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
                      padding: "4px 8px",
                      fontSize: "11px",
                      color: "#dc2626",
                      backgroundColor: "#ffffff",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
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
              <div style={{ display: "flex", gap: "6px", width: "100%" }}>
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
                    height: "40px",
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    border: `1.5px dashed #38bdf8`,
                    background: isDragging ? "#e0f2fe" : "#f0f9ff",
                    borderRadius: "8px",
                    color: "#0369a1",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "0 10px",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                  title="Bấm để chọn file scan từ máy tính hoặc kéo thả trực tiếp"
                >
                  {uploadingScan ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-sky-600" />
                      <span>{scanProgressMessage || "Đang lưu..."}</span>
                    </>
                  ) : (
                    <>
                      <Paperclip size={14} />
                      <span>+ Tải file scan</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCamScannerModal(true)}
                  style={{
                    height: "40px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    border: "1.5px solid #2dd4bf",
                    background: "#f0fdfa",
                    borderRadius: "8px",
                    color: "#0f766e",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "0 10px",
                    whiteSpace: "nowrap",
                  }}
                  title="Chọn trực tiếp bản scan từ kho dữ liệu CamScanner Pro Cloud"
                >
                  <Cloud size={14} />
                  <span>CamScanner</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {scanError && (
          <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "8px", fontWeight: 600 }}>
            ⚠ {scanError}
          </div>
        )}

        {/* Hàng 2: Gộp Mục đích & Ghi chú thành 2 cột song song */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "14px",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            <span>Mục đích mua sắm / Nội dung đề xuất <b style={{ color: "#ef4444" }}>*</b></span>
            <textarea
              rows={2}
              value={draft.purpose}
              onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
              placeholder="Nhập mục đích sử dụng hàng hóa / vật tư (bắt buộc)..."
              style={{
                height: "62px",
                minHeight: "62px",
                maxHeight: "130px",
                border: "1.5px solid #cbd5e1",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "13px",
                lineHeight: 1.4,
                color: "#0f172a",
                outline: 0,
                resize: "vertical",
                background: "#ffffff",
              }}
            />
          </label>

          {showNoteField || Boolean(draft.note && draft.note.trim()) ? (
            <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Ghi chú chung PR</span>
                <button
                  type="button"
                  onClick={() => { setDraft((d) => ({ ...d, note: "" })); setShowNoteField(false); }}
                  style={{ background: "transparent", border: 0, color: "#64748b", fontSize: "11.5px", cursor: "pointer", fontWeight: 600 }}
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
                  height: "62px",
                  minHeight: "62px",
                  maxHeight: "130px",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "13px",
                  lineHeight: 1.4,
                  color: "#0f172a",
                  outline: 0,
                  resize: "vertical",
                  background: "#ffffff",
                }}
              />
            </label>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", height: "100%" }}>
              <button
                type="button"
                onClick={() => setShowNoteField(true)}
                style={{
                  height: "40px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "1.5px dashed #cbd5e1",
                  background: "#f8fafc",
                  color: "#475569",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Plus size={14} /> Thêm Ghi chú chung PR
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BƯỚC 2: DANH SÁCH VẬT TƯ HÀNG HÓA */}
      <div
        className="form-card items-card"
        style={{
          padding: "20px 22px",
          background: "#ffffff",
          borderRadius: "14px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.02)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div
          className="items-heading"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            paddingBottom: "12px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div className="section-title" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="section-step"
              style={{
                width: "30px",
                height: "30px",
                minWidth: "30px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                background: "linear-gradient(135deg, #e65100 0%, #f97316 100%)",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                boxShadow: "0 2px 6px rgba(230, 81, 0, 0.25)",
              }}
            >
              02
            </span>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 800, margin: 0, color: "#0f172a" }}>
                Chi tiết Danh mục Hàng hóa &amp; Dự toán Ngân sách
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0", fontWeight: 500 }}>
                Chọn từ kho danh mục ({products.length} vật tư), nhập trực tiếp hoặc dán nhanh từ bảng tính Excel (Ctrl+V)
              </p>
            </div>
          </div>

          <div className="excel-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <a
              className="btn btn-secondary btn-sm download"
              href="/mau-nhap-danh-sach-hang-hoa-pr.xlsx"
              download
              style={{ height: "36px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", fontSize: "12.5px" }}
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
              style={{ height: "36px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}
            >
              <Upload size={14} /> Nhập từ File Excel
            </button>
          </div>
        </div>

        {/* Thanh chọn nhanh từ Danh mục */}
        <div
          className="catalog-picker-toolbar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            padding: "12px 14px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
          }}
        >
          <div className="catalog-picker-left" style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "320px" }}>
            <span className="picker-label" style={{ fontSize: "12.5px", fontWeight: 700, color: "#2B6DF8", whiteSpace: "nowrap" }}>
              📦 Chọn từ kho Danh mục:
            </span>
            <select
              className="catalog-select"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              style={{
                flex: 1,
                maxWidth: "520px",
                height: "38px",
                borderRadius: "8px",
                border: "1.5px solid #cbd5e1",
                padding: "0 12px",
                fontSize: "13px",
                fontWeight: 500,
                background: "#ffffff",
                color: "#0f172a",
              }}
            >
              <option value="">— Tìm và chọn hàng hóa từ kho danh mục ({products.length} mã vật tư) —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name} {p.spec ? `· ${p.spec}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!selectedProduct}
              onClick={addCatalogProduct}
              style={{ height: "38px", padding: "0 14px", display: "inline-flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}
            >
              <Plus size={15} /> Thêm vào PR
            </button>
          </div>
          <div className="catalog-picker-right">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ height: "38px", padding: "0 14px", display: "inline-flex", alignItems: "center", gap: "5px" }}
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
              <Plus size={15} /> Thêm dòng hàng mới
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`import-message ${message.startsWith("Không") ? "error" : ""}`}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "12.5px",
              fontWeight: 600,
              background: message.startsWith("Không") ? "#fef2f2" : "#f0fdf4",
              color: message.startsWith("Không") ? "#dc2626" : "#15803d",
              border: `1px solid ${message.startsWith("Không") ? "#fecaca" : "#bbf7d0"}`,
            }}
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

        <div className="table-bottom-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
          <button
            type="button"
            className="btn btn-secondary add-row-btn"
            style={{ height: "38px", padding: "0 16px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                items: [...d.items, emptyItem(d.items.length)],
              }))
            }
          >
            <Plus size={15} /> Thêm dòng hàng hóa
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              style={{ height: "40px", padding: "0 18px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <ArrowLeft size={16} /> Hủy &amp; Quay lại
            </button>
            <button
              type="button"
              className="btn btn-primary po-create-btn"
              onClick={onSave}
              disabled={
                !draft.number ||
                !draft.date ||
                !draft.department ||
                !draft.purpose
              }
              style={{ height: "40px", padding: "0 22px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Check size={16} /> Hoàn tất &amp; Lưu PR
            </button>
          </div>
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

      <CamScannerCloudModal
        isOpen={showCamScannerModal}
        onClose={() => setShowCamScannerModal(false)}
        targetLabel={draft.number ? `PR #${draft.number}` : "PR mới"}
        prCode={draft.number || "PR"}
        onImported={({ url, fileName }) => {
          setDraft((d) => ({ ...d, scan_file_url: url }));
          setScanFileName(fileName);
        }}
      />
    </section>
  );
}

