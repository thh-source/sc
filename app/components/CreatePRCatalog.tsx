import React, { ChangeEvent, useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { DraftItemsTable } from "./DraftItemsTable";
// Add other imports as necessary

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

  const [aiLoading, setAiLoading] = useState(false);
  const aiFileRef = React.useRef<HTMLInputElement>(null);

  const handleAiScan = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          // 1. Get payload and API key from backend
          const res = await fetch("/api/ai/extract-pr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mimeType: file.type,
              fileName: file.name,
              base64: base64Data
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Lỗi khi tiền xử lý file");
          
          const { apiKey, contents } = json;
          
          // 2. Call Gemini API directly from Frontend to bypass Cloudflare location restrictions
          // Thêm cơ chế tự động thử lại (auto-retry) tối đa 3 lần nếu máy chủ báo bận (503)
          let aiRes;
          let aiJson;
          let retries = 3;
          
          while (retries > 0) {
            aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + apiKey, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents })
            });
            
            aiJson = await aiRes.json();
            
            if (aiRes.ok) break; // Thành công thì thoát vòng lặp
            
            const errorMsg = aiJson.error?.message || "";
            if (errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE")) {
              retries--;
              if (retries > 0) {
                console.log(`AI đang bận, thử lại sau 2 giây... (Còn ${retries} lần)`);
                await new Promise(r => setTimeout(r, 2000));
                continue;
              }
            }
            break; // Lỗi khác hoặc hết lượt thử thì thoát để báo lỗi
          }

          if (!aiRes || !aiRes.ok) {
            let errorMsg = aiJson?.error?.message || "Lỗi từ Google AI";
            if (errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE")) {
              errorMsg = "Máy chủ AI của Google hiện đang quá tải do có quá nhiều người sử dụng. Xin bạn vui lòng thử lại sau vài giây nhé!";
            }
            throw new Error(errorMsg);
          }
          
          // 3. Parse result
          const responseText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
          const data = JSON.parse(jsonStr);
          
          if (data) {
            setDraft((d) => ({
              ...d,
              department: data.department || d.department,
              purpose: data.purpose || d.purpose,
              note: data.note || d.note,
              items: [
                ...d.items,
                ...(data.items || []).map((item: any) => ({
                  id: makeId(),
                  code: "",
                  category: "",
                  name: item.name || "",
                  desc: item.desc || "",
                  spec: item.spec || "",
                  unit: item.unit || "",
                  qty: item.qty || 1,
                  estimate: item.estimate || 0
                }))
              ]
            }));
            alert("🎉 Đã điền tự động thành công bằng AI!");
          }
        } catch (err: any) {
          alert("❌ Lỗi quét file: " + err.message);
        } finally {
          setAiLoading(false);
          if (aiFileRef.current) aiFileRef.current.value = "";
        }
      };
      reader.onerror = () => {
        alert("Lỗi khi đọc file");
        setAiLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert("❌ Lỗi quét file: " + err.message);
      setAiLoading(false);
    }
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
          <input
            type="file"
            ref={aiFileRef}
            style={{ display: "none" }}
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv"
            onChange={handleAiScan}
          />
          <button 
            className="secondary" 
            onClick={() => aiFileRef.current?.click()}
            disabled={aiLoading}
            style={{ backgroundColor: '#e8f0fe', color: '#1a73e8', borderColor: '#1a73e8' }}
          >
            {aiLoading ? "⏳ Đang quét AI..." : "✨ Scan File AI"}
          </button>
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
            <input
              placeholder="Ví dụ: Phòng Kỹ thuật"
              value={draft.department}
              onChange={(e) =>
                setDraft((d) => ({ ...d, department: e.target.value }))
              }
            />
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

