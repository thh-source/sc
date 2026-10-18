"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { PaymentHandoverItem } from "../types";
import {
  normName,
  localToday,
  parsePrintDate,
  parseFlexibleDate,
  parseExcelText,
  PHENIKAA_PHARMA_LOGO_BASE64,
} from "../payment-utils";
import "../payment.css";

const PHENIKAA_LOGO_SRC = PHENIKAA_PHARMA_LOGO_BASE64;

const UNIT_SUGGESTIONS = [
  "Cái",
  "Bộ",
  "Chiếc",
  "Mét",
  "Cuộn",
  "Thùng",
  "Hộp",
  "Bình",
  "Kg",
  "Lít",
  "Gói",
  "Tấm",
];

export interface HandoverManagementProps {
  paymentHandovers: PaymentHandoverItem[];
  onUpdateHandovers?: (handovers: PaymentHandoverItem[]) => void;
  onUpdateState?: (patch: { paymentHandovers?: PaymentHandoverItem[] }) => void;
  readOnly?: boolean;
}

export function HandoverManagement({
  paymentHandovers = [],
  onUpdateHandovers,
  onUpdateState,
  readOnly = false,
}: HandoverManagementProps) {
  const triggerUpdateHandovers = (next: PaymentHandoverItem[]) => {
    if (onUpdateHandovers) onUpdateHandovers(next);
    if (onUpdateState) onUpdateState({ paymentHandovers: next });
  };
  // Selection states
  const [checkedHandovers, setCheckedHandovers] = useState<Set<number>>(new Set());
  const [handoverDeptFilter, setHandoverDeptFilter] = useState("");
  const [handoverSearch, setHandoverSearch] = useState("");
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);

  // Modals
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTargetDept, setPasteTargetDept] = useState("");
  const [pasteTargetDate, setPasteTargetDate] = useState(localToday());
  const [pasteParsedRows, setPasteParsedRows] = useState<any[]>([]);

  // Print states
  const [isPrinting, setIsPrinting] = useState(false);
  const [printItemsList, setPrintItemsList] = useState<PaymentHandoverItem[]>([]);

  // Hidden date picker
  const calendarPickerRef = useRef<HTMLInputElement>(null);
  const calendarCbRef = useRef<((dateVal: string) => void) | null>(null);

  // Departments list
  const handoverDepts = useMemo(() => {
    const set = new Set<string>();
    for (const h of paymentHandovers) {
      const d = String(h.department || "").trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort();
  }, [paymentHandovers]);

  const handoverItemSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentHandovers.forEach((h) => {
      if (h.item_name?.trim()) set.add(h.item_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  const handoverSenderSuggestions = useMemo(() => {
    const set = new Set<string>(["Trần Hải Hà"]);
    paymentHandovers.forEach((h) => {
      if (h.sender_name?.trim()) set.add(h.sender_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  const handoverReceiverSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentHandovers.forEach((h) => {
      if (h.receiver_name?.trim()) set.add(h.receiver_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  const handoverNoteSuggestions = useMemo(() => {
    const defaults = ["Mới 100%", "Kèm CO/CQ", "Đầy đủ phụ kiện", "Đạt kiểm định", "Đạt nghiệm thu"];
    const set = new Set<string>(defaults);
    paymentHandovers.forEach((h) => {
      if (h.note?.trim()) set.add(h.note.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentHandovers]);

  // Filtered list (sắp xếp số thứ tự từ dưới lên trên, số to ở trên)
  const filteredHandovers = useMemo(() => {
    const q = normName(handoverSearch);
    const list = paymentHandovers.filter((h) => {
      if (handoverDeptFilter && String(h.department || "").trim() !== handoverDeptFilter) {
        return false;
      }
      if (q) {
        const text = [h.department, h.item_name, h.unit, h.note, h.receiver_name, h.sender_name].join(" ");
        if (!normName(text).includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }, [paymentHandovers, handoverDeptFilter, handoverSearch]);



  // Open calendar
  const openCalendar = (currentVal: string, cb: (dateVal: string) => void) => {
    calendarCbRef.current = cb;
    if (calendarPickerRef.current) {
      const p = parsePrintDate(currentVal);
      if (p) {
        calendarPickerRef.current.value = `${p.y}-${p.m}-${p.d}`;
      } else {
        calendarPickerRef.current.value = localToday();
      }
      try {
        if (typeof calendarPickerRef.current.showPicker === "function") {
          calendarPickerRef.current.showPicker();
        } else {
          calendarPickerRef.current.click();
        }
      } catch {
        calendarPickerRef.current.click();
      }
    }
  };


  const handleAddHandoverRow = () => {
    if (readOnly) return;
    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    const newItem: PaymentHandoverItem = {
      id: maxId,
      department: handoverDeptFilter || "Phòng Cung ứng",
      item_name: "",
      unit: "Cái",
      quantity_doc: "1",
      quantity_pass: "1",
      quantity_fail: "",
      note: "",
      handover_date: localToday(),
      sender_name: "Trần Hải Hà",
      sender_dept: "Phòng Cung ứng",
      receiver_name: "",
    };
    triggerUpdateHandovers([newItem, ...paymentHandovers]);
  };

  const handleEditHandover = (id: number, key: keyof PaymentHandoverItem, val: any) => {
    if (readOnly) return;
    const next = paymentHandovers.map((h) => (h.id === id ? { ...h, [key]: val } : h));
    triggerUpdateHandovers(next);
  };

  const handleDeleteHandover = (id: number) => {
    if (readOnly) return;
    if (!confirm("Bạn có chắc muốn xóa vật tư này?")) return;
    const next = paymentHandovers.filter((h) => h.id !== id);
    triggerUpdateHandovers(next);
  };

  const handleDeleteSelectedHandovers = () => {
    if (readOnly) return;
    if (checkedHandovers.size === 0) {
      alert("Vui lòng tích chọn các dòng vật tư cần xóa");
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa ${checkedHandovers.size} vật tư đã chọn?`)) return;
    const next = paymentHandovers.filter((h) => !checkedHandovers.has(h.id));
    triggerUpdateHandovers(next);
    setCheckedHandovers(new Set());
  };

  // Direct paste on Handover table
  const handleHandoverTablePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (text && (text.includes("\t") || text.includes("\n"))) {
      e.preventDefault();
      const rows = parseExcelText(text, handoverDeptFilter, localToday());
      if (rows.length > 0) {
        let maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0));
        const newItems = rows.map((r) => {
          maxId++;
          return { ...r, id: maxId };
        });
        triggerUpdateHandovers([...newItems, ...paymentHandovers]);
        alert(`Đã dán trực tiếp ${rows.length} vật tư từ Excel vào bảng!`);
      }
    }
  };

  // Paste parsing Modal
  const handleParsePasteModal = (text: string, dept: string, date: string) => {
    setPasteText(text);
    if (!text.trim()) {
      setPasteParsedRows([]);
      return;
    }
    const rows = parseExcelText(text, dept, date);
    setPasteParsedRows(rows);
  };

  const handleApplyPasteModal = () => {
    if (readOnly || pasteParsedRows.length === 0) return;
    let maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0));
    const newItems: PaymentHandoverItem[] = pasteParsedRows.map((r) => {
      maxId++;
      return { ...r, id: maxId };
    });
    triggerUpdateHandovers([...newItems, ...paymentHandovers]);
    setShowPasteModal(false);
    setPasteText("");
    setPasteParsedRows([]);
    alert(`Đã thêm thành công ${newItems.length} vật tư vào danh sách bàn giao!`);
  };

  // Print Handover Direct (2 copies) via Portal
  const handlePrintHandoverDirect = (customItems?: PaymentHandoverItem[]) => {
    const items = customItems || (
      checkedHandovers.size > 0
        ? paymentHandovers.filter((h) => checkedHandovers.has(h.id))
        : handoverDeptFilter
        ? paymentHandovers.filter((h) => String(h.department || "").trim() === handoverDeptFilter)
        : filteredHandovers
    );

    if (items.length === 0) {
      alert("Vui lòng chọn ít nhất 1 vật tư để in biên bản bàn giao");
      return;
    }

    setPrintItemsList(items);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 250);
  };

  return (
    <section className={`content payment-management handover-management ${isWorkspaceExpanded ? "workspace-expanded" : ""}`}>
      {/* Preload logo in DOM */}
      <img src={PHENIKAA_LOGO_SRC} alt="" style={{ display: "none" }} aria-hidden="true" />

      {/* Hidden date picker */}
      <input
        type="date"
        ref={calendarPickerRef}
        style={{ position: "fixed", top: "-1000px", left: "-1000px", opacity: 0 }}
        onChange={(e) => {
          if (calendarCbRef.current && e.target.value) {
            calendarCbRef.current(parseFlexibleDate(e.target.value));
          }
        }}
      />

      {/* Top Heading */}
      <div className={`heading ${isWorkspaceExpanded ? "payment-heading-desc" : ""}`}>
        <div>
          <em>QUẢN LÝ VẬT TƯ · BÀN GIAO NỘI BỘ</em>
          <h1>Biên bản bàn giao, nghiệm thu vật tư (Không qua kho)</h1>
          <p>
            Theo dõi danh mục vật tư chuyển trực tiếp từ Phòng Cung ứng đến các bộ phận sử dụng nội bộ Phenikaa.
          </p>
        </div>
      </div>

      {/* Main Toolbar */}
      <div className="payment-toolbar">
        <button className="payment-btn btn-primary" onClick={handleAddHandoverRow}>
          ＋ Thêm dòng vật tư
        </button>
        <button
          className="payment-btn"
          style={{ background: "#107c41", color: "#fff", borderColor: "#0b5c30" }}
          onClick={() => setShowPasteModal(true)}
          title="Dán danh sách vật tư từ file Excel (Ctrl+V)"
        >
          📋 Dán từ Excel
        </button>
        <button
          className="payment-btn"
          style={{ background: "#0f766e", color: "#fff", borderColor: "#0d5e56" }}
          onClick={() => handlePrintHandoverDirect()}
          title="In biên bản bàn giao các vật tư đã chọn"
        >
          🖨️ In biên bản
        </button>
        <button className="payment-btn btn-danger" onClick={handleDeleteSelectedHandovers}>
          🗑️ Xóa đã chọn
        </button>

        <button
          type="button"
          className={`btn-workspace-toggle ${isWorkspaceExpanded ? "active" : ""}`}
          onClick={() => setIsWorkspaceExpanded(!isWorkspaceExpanded)}
          title={isWorkspaceExpanded ? "Thu gọn về giao diện chuẩn" : "Mở rộng không gian làm việc (giống So sánh báo giá)"}
        >
          <span>{isWorkspaceExpanded ? "🗗" : "⛶"}</span>
          {isWorkspaceExpanded ? "Thu gọn" : "Mở rộng"}
        </button>

        <select
          value={handoverDeptFilter}
          onChange={(e) => setHandoverDeptFilter(e.target.value)}
          style={{ minWidth: "170px" }}
        >
          <option value="">Tất cả phòng ban nhận</option>
          {handoverDepts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <input
          placeholder="Tìm vật tư, ĐVT, ghi chú, phòng ban..."
          value={handoverSearch}
          onChange={(e) => setHandoverSearch(e.target.value)}
          style={{ width: "260px" }}
        />

        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
          {filteredHandovers.length} / {paymentHandovers.length} vật tư
          {checkedHandovers.size > 0 && ` · Đã chọn: ${checkedHandovers.size}`}
        </span>
      </div>

      <datalist id="deptSuggestions">
        {handoverDepts.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <datalist id="unitSuggestions">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <datalist id="handoverItemSuggestions">
        {handoverItemSuggestions.map((it) => (
          <option key={it} value={it} />
        ))}
      </datalist>

      <datalist id="handoverSenderSuggestions">
        {handoverSenderSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <datalist id="handoverReceiverSuggestions">
        {handoverReceiverSuggestions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <datalist id="handoverNoteSuggestions">
        {handoverNoteSuggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {/* Handover Data Table with direct paste support */}
      <div className="payment-table-container" onPaste={handleHandoverTablePaste}>
        <div className="payment-table-header">
          <span>BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ (KHÔNG QUA KHO) · HỖ TRỢ DÁN CTRL+V TỪ EXCEL</span>
          <span>{checkedHandovers.size > 0 ? `Đang chọn ${checkedHandovers.size} vật tư để in hoặc xóa` : "Tích chọn các vật tư muốn in biên bản"}</span>
        </div>
        <div className="payment-table-scroll">
          <table className="payment-grid" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: "36px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredHandovers.length > 0 &&
                      filteredHandovers.every((h) => checkedHandovers.has(h.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCheckedHandovers(new Set(filteredHandovers.map((h) => h.id)));
                      } else {
                        setCheckedHandovers(new Set());
                      }
                    }}
                  />
                </th>
                <th style={{ width: "50px", textAlign: "center" }}>STT</th>
                <th style={{ minWidth: "160px" }}>Bộ phận nhận</th>
                <th style={{ minWidth: "280px" }}>Tên hàng hóa - Quy cách</th>
                <th style={{ width: "80px" }}>ĐVT</th>
                <th style={{ width: "95px", textAlign: "center" }}>SL chứng từ</th>
                <th style={{ width: "95px", textAlign: "center" }}>SL Đạt</th>
                <th style={{ width: "95px", textAlign: "center" }}>SL Hỏng</th>
                <th style={{ minWidth: "160px" }}>Ghi chú</th>
                <th style={{ width: "125px" }}>Ngày bàn giao</th>
                <th style={{ minWidth: "130px" }}>Bên giao</th>
                <th style={{ minWidth: "130px" }}>Bên nhận</th>
                <th style={{ width: "60px", textAlign: "center" }}>Xóa</th>
              </tr>
            </thead>
            <tbody>
              {filteredHandovers.map((h, idx) => {
                const isChecked = checkedHandovers.has(h.id);
                return (
                  <tr key={h.id} className={isChecked ? "chosen" : ""}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const next = new Set(checkedHandovers);
                          if (e.target.checked) next.add(h.id);
                          else next.delete(h.id);
                          setCheckedHandovers(next);
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center", color: "#64748b", fontWeight: 600 }}>{h.id}</td>
                    <td>
                      <input
                        list="deptSuggestions"
                        value={h.department || ""}
                        onChange={(e) => handleEditHandover(h.id, "department", e.target.value)}
                        placeholder="Phòng ban nhận..."
                      />
                    </td>
                    <td>
                      <input
                        list="handoverItemSuggestions"
                        value={h.item_name || ""}
                        onChange={(e) => handleEditHandover(h.id, "item_name", e.target.value)}
                        placeholder="Tên hàng hóa - quy cách..."
                      />
                    </td>
                    <td>
                      <input
                        list="unitSuggestions"
                        value={h.unit || ""}
                        onChange={(e) => handleEditHandover(h.id, "unit", e.target.value)}
                        placeholder="ĐVT..."
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        style={{ textAlign: "center" }}
                        value={h.quantity_doc || ""}
                        onChange={(e) =>
                          handleEditHandover(h.id, "quantity_doc", e.target.value)
                        }
                        placeholder="0"
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        style={{ textAlign: "center", fontWeight: 600, color: "#166534" }}
                        value={h.quantity_pass || ""}
                        onChange={(e) =>
                          handleEditHandover(h.id, "quantity_pass", e.target.value)
                        }
                        placeholder="0"
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        style={{ textAlign: "center", color: "#dc2626" }}
                        value={h.quantity_fail || ""}
                        onChange={(e) =>
                          handleEditHandover(h.id, "quantity_fail", e.target.value)
                        }
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <input
                        list="handoverNoteSuggestions"
                        value={h.note || ""}
                        onChange={(e) => handleEditHandover(h.id, "note", e.target.value)}
                        placeholder="Ghi chú..."
                      />
                    </td>
                    <td>
                      <div className="cell-date-wrap">
                        <input
                          value={h.handover_date || ""}
                          onChange={(e) =>
                            handleEditHandover(h.id, "handover_date", e.target.value)
                          }
                          onBlur={(e) => {
                            const parsed = parseFlexibleDate(e.target.value);
                            if (parsed !== e.target.value) {
                              handleEditHandover(h.id, "handover_date", parsed);
                            }
                          }}
                          placeholder="dd/mm/yyyy"
                        />
                        <button
                          type="button"
                          className="cell-date-btn"
                          title="Chọn ngày"
                          onClick={() =>
                            openCalendar(h.handover_date || "", (val) =>
                              handleEditHandover(h.id, "handover_date", val)
                            )
                          }
                        >
                          📅
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        list="handoverSenderSuggestions"
                        value={h.sender_name || "Trần Hải Hà"}
                        onChange={(e) =>
                          handleEditHandover(h.id, "sender_name", e.target.value)
                        }
                        placeholder="Bên giao..."
                      />
                    </td>
                    <td>
                      <input
                        list="handoverReceiverSuggestions"
                        value={h.receiver_name || ""}
                        onChange={(e) =>
                          handleEditHandover(h.id, "receiver_name", e.target.value)
                        }
                        placeholder="Bên nhận..."
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="payment-btn btn-danger"
                        style={{ padding: "2px 6px" }}
                        onClick={() => handleDeleteHandover(h.id)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredHandovers.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                    Chưa có vật tư bàn giao nào. Bấm "Nạp 85 vật tư từ Excel gốc" hoặc "Dán từ Excel" để thêm dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Excel Paste for Handover */}
      {showPasteModal && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "840px" }}>
            <div className="payment-modal-header">
              <h3 style={{ color: "#107c41" }}>📋 Dán danh sách vật tư từ file Excel</h3>
              <button type="button" onClick={() => setShowPasteModal(false)}>✕</button>
            </div>

            <div style={{ fontSize: "12.5px", color: "#475569", lineHeight: 1.5 }}>
              <b>Hướng dẫn:</b> Copy các ô hoặc cột từ file Excel (Ctrl+C), sau đó dán vào ô bên dưới (Ctrl+V).
              <br />
              • Hệ thống tự nhận diện các cột: <i>Tên hàng hóa - quy cách, ĐVT, Số lượng, Ghi chú</i>.
              <br />
              • Cột <b>SL kiểm tra - Đạt</b> sẽ mặc định bằng <b>SL chứng từ</b>.
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Bộ phận nhận (áp dụng cho đợt dán này):
                </label>
                <input
                  list="deptSuggestions"
                  placeholder="Chọn hoặc nhập phòng ban (vd: Cơ điện, QC, RD...)"
                  value={pasteTargetDept}
                  onChange={(e) => {
                    setPasteTargetDept(e.target.value);
                    handleParsePasteModal(pasteText, e.target.value, pasteTargetDate);
                  }}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ width: "160px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Ngày bàn giao:
                </label>
                <input
                  type="date"
                  value={pasteTargetDate}
                  onChange={(e) => {
                    setPasteTargetDate(e.target.value);
                    handleParsePasteModal(pasteText, pasteTargetDept, e.target.value);
                  }}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Ô dán dữ liệu (Bấm vào đây rồi nhấn Ctrl+V):
              </label>
              <textarea
                rows={7}
                placeholder="Dán các dòng copy từ Excel vào đây..."
                value={pasteText}
                onChange={(e) =>
                  handleParsePasteModal(e.target.value, pasteTargetDept, pasteTargetDate)
                }
                style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
              />
            </div>

            {pasteParsedRows.length > 0 && (
              <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ padding: "6px 10px", background: "#f1f5f9", fontSize: "12px", fontWeight: 600 }}>
                  Xem trước dữ liệu nhận diện: {pasteParsedRows.length} vật tư
                </div>
                <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Tên vật tư</th>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>ĐVT</th>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>SL</th>
                        <th style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Phòng ban</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pasteParsedRows.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "4px 8px" }}>{r.item_name}</td>
                          <td style={{ padding: "4px 8px" }}>{r.unit}</td>
                          <td style={{ padding: "4px 8px" }}>{r.quantity_doc}</td>
                          <td style={{ padding: "4px 8px" }}>{r.department}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
              <button
                type="button"
                className="payment-btn"
                onClick={() => setShowPasteModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                style={{ background: "#107c41", borderColor: "#0b5c30" }}
                disabled={pasteParsedRows.length === 0}
                onClick={handleApplyPasteModal}
              >
                ✓ Chèn vào danh sách bàn giao ({pasteParsedRows.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PORTAL PRINT CONTAINER - Completely isolated from app */}
      {typeof document !== "undefined" && isPrinting && createPortal(
        <div id="paymentPrintPortal">
          {(() => {
            const groupsByDept: Record<string, PaymentHandoverItem[]> = {};
            for (const it of printItemsList) {
              const d = String(it.department || "Chưa phân loại").trim();
              if (!groupsByDept[d]) groupsByDept[d] = [];
              groupsByDept[d].push(it);
            }

            return Object.entries(groupsByDept).map(([dept, deptItems]) => (
              <React.Fragment key={dept}>
                {[1, 2].map((copyNum) => (
                  <div key={copyNum} className="handover-paper paper">
                    <table className="hb-box">
                      <tbody>
                        <tr>
                          <td className="hb-box-left">
                            <div className="hb-logo">
                              <img
                                src={PHENIKAA_LOGO_SRC}
                                alt="PHENIKAA PHARMA"
                                style={{
                                  height: "40px",
                                  width: "170px",
                                  objectFit: "contain",
                                  display: "block",
                                  margin: "0 auto",
                                }}
                              />
                            </div>
                            <div className="hb-sender-dept">Bộ phận: Phòng Cung ứng</div>
                          </td>
                          <td className="hb-box-right">
                            <div className="hb-title-main">
                              BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,
                            </div>
                            <div className="hb-title-main">HÀNG HÓA</div>
                            <div className="hb-title-sub">
                              (Không qua kho)
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="hb-info">
                      <div className="hb-line">
                        Hôm nay, ngày&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;tháng&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;năm {new Date().getFullYear()}
                      </div>
                      <div className="hb-line">Tại Công ty CP Dược phẩm Phenikaa</div>
                      <div className="hb-line">
                        Địa chỉ: Lô đất CN2-10, KCN Công nghệ cao 2, KCNC Hòa Lạc, Xã Hòa Lạc, TP Hà Nội
                      </div>
                      <div className="hb-line">Chúng tôi gồm:</div>
                      <div className="hb-two-col">
                        <div>Ông (bà): Trần Hải Hà - Người giao hàng</div>
                        <div>Địa chỉ: Phòng Cung ứng</div>
                      </div>
                      <div className="hb-two-col">
                        <div>
                          Ông (bà): .................................................... Người nhận
                          hàng
                        </div>
                        <div>Địa chỉ: {dept}</div>
                      </div>
                      <div className="hb-line">
                        Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư sau:
                      </div>
                    </div>

                    <table className="hb-table">
                      <thead>
                        <tr>
                          <th style={{ width: "40px" }}>STT</th>
                          <th>Tên hàng hóa - Quy cách</th>
                          <th style={{ width: "55px" }}>ĐVT</th>
                          <th style={{ width: "85px" }}>
                            SL theo
                            <br />
                            chứng từ
                          </th>
                          <th style={{ width: "80px" }}>
                            SL kiểm tra
                            <br />
                            Đạt
                          </th>
                          <th style={{ width: "80px" }}>
                            SL kiểm tra
                            <br />
                            K.Đạt
                          </th>
                          <th style={{ width: "80px" }}>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptItems.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="center">{idx + 1}</td>
                            <td className="left" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                              {it.item_name || ""}
                            </td>
                            <td className="center">{it.unit || ""}</td>
                            <td className="center">{it.quantity_doc || ""}</td>
                            <td className="center">{it.quantity_pass || ""}</td>
                            <td className="center">{it.quantity_fail || ""}</td>
                            <td className="center">{it.note || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="hb-footer">
                      <div className="hb-conclusion-title">Kết luận:</div>
                      <div className="hb-conclusion-body">
                        Biên bản này được lập thành 02 bản, 01 bản giao cho người giao hàng; 01
                        bản giao cho người nhận hàng.
                      </div>
                      <div className="hb-sign-row">
                        <div className="hb-sign-col">
                          Người giao hàng<br />
                          <i>(Ký, ghi rõ họ tên)</i>
                        </div>
                        <div className="hb-sign-col">
                          Người nhận hàng<br />
                          <i>(Ký, ghi rõ họ tên)</i>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ));
          })()}
        </div>,
        document.body
      )}
    </section>
  );
}
