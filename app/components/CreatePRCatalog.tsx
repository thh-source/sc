import React, { ChangeEvent, useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { DraftItemsTable } from "./DraftItemsTable";

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

    const [aiLoading, setAiLoading] = useState<string | false>(false);
  const [aiPendingData, setAiPendingData] = useState<any>(null);
  
  // AI Settings State
  const [aiProvider, setAiProvider] = useState<"gemini" | "deepseek" | "openrouter">(() => {
    return (typeof localStorage !== "undefined" ? localStorage.getItem("sc_ai_provider") : "gemini") as any || "gemini";
  });
  const [aiKeys, setAiKeys] = useState<{ deepseek: string, openrouter: string }>(() => {
    if (typeof localStorage !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("sc_ai_keys") || "{}");
      } catch (e) {}
    }
    return { deepseek: "", openrouter: "" };
  });
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  const [aiMapping, setAiMapping] = useState<Record<string, string>>({
    code: 'code',
    name: 'name',
    desc: 'desc',
    spec: 'spec',
    qty: 'qty',
    unit: 'unit',
    estimate: 'estimate'
  });
  const aiFileRef = React.useRef<HTMLInputElement>(null);

  const applyAiData = () => {
    if (!aiPendingData) return;
    setDraft((d) => ({
      ...d,
      department: aiPendingData.department || d.department,
      purpose: aiPendingData.purpose || d.purpose,
      note: aiPendingData.note || d.note,
      items: [
        ...d.items,
        ...(aiPendingData.items || []).map((item: any) => ({
          id: makeId(),
          code: item[aiMapping.code] || "",
          category: "",
          name: item[aiMapping.name] || "",
          desc: item[aiMapping.desc] || "",
          spec: item[aiMapping.spec] || "",
          unit: item[aiMapping.unit] || "",
          qty: item[aiMapping.qty] || 1,
          estimate: item[aiMapping.estimate] || 0
        }))
      ]
    }));
    setAiPendingData(null);
            setTimeout(() => setMascotState("idle"), 4000);
  };

  const handleAiScan = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (aiProvider !== "gemini" && !file.name.match(/\.(xlsx|csv|xls)$/i)) {
      alert("❌ Chế độ DeepSeek/OpenRouter hiện tại chỉ hỗ trợ trích xuất siêu tốc cho file Excel/CSV. Để quét file Ảnh hoặc PDF, bạn vui lòng chuyển lại sang Google Gemini nhé!");
      if (aiFileRef.current) aiFileRef.current.value = "";
      return;
    }

    setAiLoading("Đang đọc file...");
            try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          setAiLoading("Đang xử lý dữ liệu...");
          const base64 = (reader.result as string).split(",")[1];
          const res = await fetch("/api/ai/extract-pr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              base64,
              mimeType: file.type,
              fileName: file.name
            })
          });
          
          if (!res.ok) throw new Error("Lỗi khi kết nối AI (Backend)");
          
          const json = await res.json();
          if (json.error) throw new Error(json.error);
          
          const { apiKey, contents } = json;
          
          setAiLoading("Đang trích xuất thông minh...");
          
          let aiRes;
          let aiJson;
          let retries = 2; // Giảm xuống 2 để đỡ tốn Quota 20 lần/phút
          
          while (retries >= 0) {
            if (aiProvider === "gemini") {
              aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + apiKey, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  contents,
                  generationConfig: { responseMimeType: "application/json" }
                })
              });
            } else {
              // OpenRouter or DeepSeek
              const isDeepSeek = aiProvider === "deepseek";
              const key = isDeepSeek ? aiKeys.deepseek : aiKeys.openrouter;
              const url = isDeepSeek ? "https://api.deepseek.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
              const model = isDeepSeek ? "deepseek-chat" : "google/gemini-flash-1.5-8b";
              
              if (!key) {
                throw new Error(`Vui lòng nhập API Key cho ${isDeepSeek ? "DeepSeek" : "OpenRouter"} trong cài đặt (Nút ⚙️).`);
              }

              // Chuyển đổi payload Gemini sang OpenAI format
              // Vì contents[0].parts[0].text chứa cả file csv text
              const promptText = contents[0]?.parts?.[0]?.text || "";
              
              aiRes = await fetch(url, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${key}`
                },
                body: JSON.stringify({ 
                  model: model,
                  messages: [
                    { role: "system", content: "Bạn là một AI trích xuất dữ liệu mua hàng. Luôn luôn trả về định dạng JSON thuần túy, đúng cấu trúc yêu cầu, KHÔNG BỌC TRONG markdown ```json." },
                    { role: "user", content: promptText }
                  ],
                  response_format: { type: "json_object" }
                })
              });
            }
            
            aiJson = await aiRes.json();
            
            if (aiRes.ok) break;
            
            const errorMsg = aiJson.error?.message || "";
            if ((errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE")) && retries > 0) {
              setAiLoading(`AI đang bận, thử lại... (Còn ${retries} lần)`);
              retries--;
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
            break;
          }

          if (!aiRes || !aiRes.ok) {
            let errorMsg = aiJson?.error?.message || "Lỗi từ Google AI";
            if (errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE")) {
              errorMsg = "Máy chủ AI hiện đang quá tải. Xin bạn vui lòng thử lại sau vài giây nhé!";
            } else if (errorMsg.includes("Quota exceeded") || errorMsg.includes("429")) {
              errorMsg = "Bạn đã dùng quá giới hạn quét miễn phí trong 1 phút. Vui lòng đợi khoảng 1 phút rồi thử lại, hoặc chuyển sang dùng DeepSeek/OpenRouter nhé!";
            } else if (errorMsg.includes("insufficient_quota")) {
              errorMsg = "API Key của bạn đã hết tiền hoặc bị khóa. Vui lòng nạp thêm tiền hoặc dùng key khác.";
            } else if (errorMsg.includes("AuthenticationError") || errorMsg.includes("API key not valid")) {
              errorMsg = "API Key không hợp lệ. Vui lòng kiểm tra lại trong phần Cài đặt (⚙️).";
            }
            throw new Error(errorMsg);
          }
          
          // 3. Parse result
          let responseText = "";
          if (aiProvider === "gemini") {
            responseText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
          } else {
            responseText = aiJson.choices?.[0]?.message?.content || "";
          }
          const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
          const data = JSON.parse(jsonStr);
          
          if (data && data.items && data.items.length > 0) {
            setAiPendingData(data);
          } else if (data) {
             setAiPendingData(data);
          }
          setAiLoading(false);
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
          <div className="flex items-center gap-2">
            <select 
              className="border p-2 rounded" 
              value={aiProvider} 
              onChange={e => {
                const val = e.target.value as any;
                setAiProvider(val);
                if (typeof localStorage !== 'undefined') localStorage.setItem("sc_ai_provider", val);
              }}
              title="Chọn mô hình AI"
            >
              <option value="gemini">Google (Mặc định)</option>
              <option value="deepseek">DeepSeek V3</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            <button 
              className="ghost" 
              onClick={() => setAiSettingsOpen(true)}
              title="Cài đặt API Key"
              style={{ padding: '0.5rem', minWidth: 'auto' }}
            >
              ⚙️
            </button>
          </div>
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

      {aiSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">⚙️ Cài đặt Đa Mô Hình AI</h3>
              <button onClick={() => setAiSettingsOpen(false)} className="text-gray-500 hover:text-red-500 font-bold text-xl">&times;</button>
            </div>
            
            <div className="p-4 overflow-auto">
              <p className="mb-4 text-sm text-gray-600">Bạn có thể sử dụng các nhà cung cấp AI miễn phí khác nếu Google bị hết hạn mức. Mật khẩu API Key được lưu an toàn trên trình duyệt của bạn.</p>
              
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">🔑 DeepSeek API Key</label>
                <input 
                  type="password" 
                  className="w-full border p-2 rounded" 
                  placeholder="sk-..." 
                  value={aiKeys.deepseek}
                  onChange={e => setAiKeys({...aiKeys, deepseek: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">Lấy key miễn phí tại <a href="https://platform.deepseek.com" target="_blank" className="text-blue-500 hover:underline">platform.deepseek.com</a></p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">🔑 OpenRouter API Key</label>
                <input 
                  type="password" 
                  className="w-full border p-2 rounded" 
                  placeholder="sk-or-v1-..." 
                  value={aiKeys.openrouter}
                  onChange={e => setAiKeys({...aiKeys, openrouter: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">Lấy key tại <a href="https://openrouter.ai" target="_blank" className="text-blue-500 hover:underline">openrouter.ai</a> (Sử dụng model Llama 3 8B miễn phí)</p>
              </div>
            </div>
            
            <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
              <button onClick={() => setAiSettingsOpen(false)} className="px-5 py-2 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 font-medium">Hủy</button>
              <button onClick={() => {
                if (typeof localStorage !== 'undefined') localStorage.setItem("sc_ai_keys", JSON.stringify(aiKeys));
                setAiSettingsOpen(false);
                alert("Đã lưu cấu hình AI thành công!");
              }} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      )}

      {aiPendingData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-blue-50">
              <h3 className="text-lg font-bold text-blue-800">✨ Kiểm tra & Khớp Dữ Liệu AI</h3>
              <button onClick={() => setAiPendingData(null)} className="text-gray-500 hover:text-red-500 font-bold text-xl">&times;</button>
            </div>
            
            <div className="p-4 overflow-auto flex-1">
              <p className="mb-4 text-sm text-gray-600">AI đã quét xong! Nếu AI nhận diện nhầm cột, bạn có thể <strong>chọn lại tên cột</strong> ở tiêu đề bảng bên dưới để tráo đổi cho đúng.</p>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border text-sm min-w-max">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 min-w-[200px]">
                        Tên vật tư
                        <select className="block w-full mt-1 font-normal border p-1 rounded" value={aiMapping.name} onChange={e => setAiMapping({...aiMapping, name: e.target.value})}>
                          <option value="">-- Bỏ qua --</option>
                          {Object.keys(aiPendingData.items[0] || {}).map(k => <option key={k} value={k}>Lấy từ AI: {k}</option>)}
                        </select>
                      </th>
                      <th className="border p-2 min-w-[150px]">
                        Mã hàng
                        <select className="block w-full mt-1 font-normal border p-1 rounded" value={aiMapping.code} onChange={e => setAiMapping({...aiMapping, code: e.target.value})}>
                          <option value="">-- Bỏ qua --</option>
                          {Object.keys(aiPendingData.items[0] || {}).map(k => <option key={k} value={k}>Lấy từ AI: {k}</option>)}
                        </select>
                      </th>
                      <th className="border p-2 min-w-[200px]">
                        Mô tả kỹ thuật
                        <select className="block w-full mt-1 font-normal border p-1 rounded" value={aiMapping.desc} onChange={e => setAiMapping({...aiMapping, desc: e.target.value})}>
                          <option value="">-- Bỏ qua --</option>
                          {Object.keys(aiPendingData.items[0] || {}).map(k => <option key={k} value={k}>Lấy từ AI: {k}</option>)}
                        </select>
                      </th>
                      <th className="border p-2 min-w-[200px]">
                        Quy cách
                        <select className="block w-full mt-1 font-normal border p-1 rounded" value={aiMapping.spec} onChange={e => setAiMapping({...aiMapping, spec: e.target.value})}>
                          <option value="">-- Bỏ qua --</option>
                          {Object.keys(aiPendingData.items[0] || {}).map(k => <option key={k} value={k}>Lấy từ AI: {k}</option>)}
                        </select>
                      </th>
                      <th className="border p-2 min-w-[120px]">
                        Số lượng
                        <select className="block w-full mt-1 font-normal border p-1 rounded" value={aiMapping.qty} onChange={e => setAiMapping({...aiMapping, qty: e.target.value})}>
                          <option value="">-- Bỏ qua --</option>
                          {Object.keys(aiPendingData.items[0] || {}).map(k => <option key={k} value={k}>Lấy từ AI: {k}</option>)}
                        </select>
                      </th>
                      <th className="border p-2 min-w-[100px]">
                        ĐVT
                        <select className="block w-full mt-1 font-normal border p-1 rounded" value={aiMapping.unit} onChange={e => setAiMapping({...aiMapping, unit: e.target.value})}>
                          <option value="">-- Bỏ qua --</option>
                          {Object.keys(aiPendingData.items[0] || {}).map(k => <option key={k} value={k}>Lấy từ AI: {k}</option>)}
                        </select>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(aiPendingData.items || []).slice(0, 5).map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="border p-2">{aiMapping.name ? item[aiMapping.name] : ""}</td>
                        <td className="border p-2 text-blue-600">{aiMapping.code ? item[aiMapping.code] : ""}</td>
                        <td className="border p-2 text-gray-600">{aiMapping.desc ? item[aiMapping.desc] : ""}</td>
                        <td className="border p-2 text-gray-600">{aiMapping.spec ? item[aiMapping.spec] : ""}</td>
                        <td className="border p-2 font-bold text-center">{aiMapping.qty ? item[aiMapping.qty] : ""}</td>
                        <td className="border p-2 text-center">{aiMapping.unit ? item[aiMapping.unit] : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {aiPendingData.items?.length > 5 && <div className="text-center text-gray-500 mt-3 font-medium">... và {aiPendingData.items.length - 5} dòng khác bị ẩn</div>}
            </div>
            
            <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
              <button onClick={() => setAiPendingData(null)} className="px-5 py-2 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 font-medium">Hủy bỏ</button>
              <button onClick={() => { applyAiData(); alert("🎉 Đã nhập dữ liệu thành công!"); }} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium flex items-center gap-2">
                <span>Nhập vào Danh sách PR</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}

