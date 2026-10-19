"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { PaymentHandoverItem, PR, PO, Supplier } from "../types";
import {
  normName,
  localToday,
  parsePrintDate,
  parseFlexibleDate,
  parseExcelText,
  PHENIKAA_PHARMA_LOGO_BASE64,
} from "../payment-utils";
import "../payment.css";
import { useIsMobile } from "../useIsMobile";

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
  prs?: PR[];
  pos?: PO[];
  suppliers?: Supplier[];
}

export function HandoverManagement({
  paymentHandovers = [],
  onUpdateHandovers,
  onUpdateState,
  readOnly = false,
  prs = [],
  pos = [],
  suppliers = [],
}: HandoverManagementProps) {
  const triggerUpdateHandovers = (next: PaymentHandoverItem[]) => {
    if (onUpdateHandovers) onUpdateHandovers(next);
    if (onUpdateState) onUpdateState({ paymentHandovers: next });
  };
  // Mobile card view detection (auto <= 768px, with manual toggle override)
  const isAutoMobile = useIsMobile(768);
  const [userMobileToggle, setUserMobileToggle] = useState<boolean | null>(null);
  const showMobileCards = userMobileToggle !== null ? userMobileToggle : isAutoMobile;

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

  // Import from PR / PO / Contract Modal
  const [showImportDocModal, setShowImportDocModal] = useState(false);
  const [importDocType, setImportDocType] = useState<"pr" | "po" | "contract">("pr");
  const [selectedDocId, setSelectedDocId] = useState<string | number>("");
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string | number>>(new Set());
  const [itemCustomQty, setItemCustomQty] = useState<Record<string | number, number>>({});
  const [importTargetDept, setImportTargetDept] = useState("");

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

  // Contract items list derived from POs
  const contractsList = useMemo(() => {
    return pos.filter(
      (p) =>
        p.number.startsWith("HĐ-") ||
        (p.contractNote && p.contractNote.trim().length > 0) ||
        (p.prNumber && p.prNumber.toLowerCase().includes("hợp đồng"))
    );
  }, [pos]);

  const availableDocs = useMemo(() => {
    const q = normName(docSearchQuery);
    if (importDocType === "pr") {
      return prs.filter((pr) => {
        if (!q) return true;
        const text = [
          pr.number,
          pr.department,
          pr.purpose,
          ...(pr.items || []).map((i) => i.name),
        ].join(" ");
        return normName(text).includes(q);
      });
    } else if (importDocType === "po") {
      return pos.filter((po) => {
        if (!q) return true;
        const s = suppliers.find((x) => x.id === po.supplierId);
        const text = [
          po.number,
          s?.name,
          po.prNumber,
          ...(po.items || []).map((i) => i.name),
        ].join(" ");
        return normName(text).includes(q);
      });
    } else {
      const list = contractsList.length > 0 ? contractsList : pos;
      return list.filter((c) => {
        if (!q) return true;
        const s = suppliers.find((x) => x.id === c.supplierId);
        const text = [
          c.number,
          s?.name,
          c.contractNote,
          ...(c.items || []).map((i) => i.name),
        ].join(" ");
        return normName(text).includes(q);
      });
    }
  }, [importDocType, docSearchQuery, prs, pos, suppliers, contractsList]);

  const activeDoc = useMemo(() => {
    if (!selectedDocId) return null;
    if (importDocType === "pr") {
      return prs.find((p) => p.id === Number(selectedDocId)) || null;
    } else {
      return pos.find((p) => p.id === Number(selectedDocId)) || null;
    }
  }, [selectedDocId, importDocType, prs, pos]);

  const activeDocItems = useMemo(() => {
    if (!activeDoc) return [];
    return activeDoc.items || [];
  }, [activeDoc]);

  const openImportDocModal = () => {
    let defType: "pr" | "po" | "contract" = "pr";
    if (prs.length === 0 && pos.length > 0) {
      defType = "po";
    }
    setImportDocType(defType);
    setDocSearchQuery("");

    let firstDoc = null;
    if (defType === "pr" && prs.length > 0) {
      firstDoc = prs[0];
    } else if (pos.length > 0) {
      firstDoc = pos[0];
    }

    if (firstDoc) {
      setSelectedDocId(firstDoc.id);
      const items = firstDoc.items || [];
      setSelectedItemIds(new Set(items.map((it) => it.id)));
      const qtyMap: Record<string | number, number> = {};
      items.forEach((it) => {
        qtyMap[it.id] = it.qty;
      });
      setItemCustomQty(qtyMap);
      setImportTargetDept(
        "department" in firstDoc && firstDoc.department
          ? firstDoc.department
          : handoverDeptFilter || "Phòng Cung ứng"
      );
    } else {
      setSelectedDocId("");
      setSelectedItemIds(new Set());
      setItemCustomQty({});
      setImportTargetDept(handoverDeptFilter || "Phòng Cung ứng");
    }

    setShowImportDocModal(true);
  };

  const handleSwitchImportType = (type: "pr" | "po" | "contract") => {
    setImportDocType(type);
    setDocSearchQuery("");
    let firstDoc = null;
    if (type === "pr") {
      firstDoc = prs[0] || null;
    } else if (type === "po") {
      firstDoc = pos[0] || null;
    } else {
      firstDoc = (contractsList.length > 0 ? contractsList[0] : pos[0]) || null;
    }

    if (firstDoc) {
      setSelectedDocId(firstDoc.id);
      const items = firstDoc.items || [];
      setSelectedItemIds(new Set(items.map((it) => it.id)));
      const qtyMap: Record<string | number, number> = {};
      items.forEach((it) => {
        qtyMap[it.id] = it.qty;
      });
      setItemCustomQty(qtyMap);
      setImportTargetDept(
        "department" in firstDoc && firstDoc.department
          ? firstDoc.department
          : handoverDeptFilter || "Phòng Cung ứng"
      );
    } else {
      setSelectedDocId("");
      setSelectedItemIds(new Set());
      setItemCustomQty({});
    }
  };

  const handleSelectDoc = (docIdVal: string | number) => {
    const dId = Number(docIdVal);
    setSelectedDocId(dId);
    let doc = null;
    if (importDocType === "pr") {
      doc = prs.find((p) => p.id === dId);
    } else {
      doc = pos.find((p) => p.id === dId);
    }
    if (doc) {
      const items = doc.items || [];
      setSelectedItemIds(new Set(items.map((it) => it.id)));
      const qtyMap: Record<string | number, number> = {};
      items.forEach((it) => {
        qtyMap[it.id] = it.qty;
      });
      setItemCustomQty(qtyMap);
      if ("department" in doc && doc.department) {
        setImportTargetDept(doc.department);
      }
    }
  };

  const handleToggleSelectItem = (id: string | number) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllItems = () => {
    if (selectedItemIds.size === activeDocItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(activeDocItems.map((it) => it.id)));
    }
  };

  const handleConfirmImportItems = () => {
    if (readOnly) return;
    if (!activeDoc) {
      alert("Vui lòng chọn chứng từ nguồn.");
      return;
    }
    const chosenItems = activeDocItems.filter((it) => selectedItemIds.has(it.id));
    if (chosenItems.length === 0) {
      alert("Vui lòng tích chọn ít nhất 1 mặt hàng để nạp vào danh sách bàn giao.");
      return;
    }

    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    let curId = maxId;

    const docTypeLabel =
      importDocType === "pr"
        ? "PR"
        : importDocType === "contract"
        ? "Hợp đồng"
        : "PO";

    const docSupplier =
      "supplierId" in activeDoc && activeDoc.supplierId
        ? suppliers.find((s) => s.id === activeDoc.supplierId)
        : null;

    const suppPart = docSupplier?.name ? ` - NCC: ${docSupplier.name}` : "";

    const newHandovers: PaymentHandoverItem[] = chosenItems.map((it) => {
      const actualQty = itemCustomQty[it.id] !== undefined ? itemCustomQty[it.id] : it.qty;
      const specPart = it.spec ? ` (${it.spec})` : "";
      return {
        id: curId++,
        department:
          importTargetDept.trim() ||
          ("department" in activeDoc && activeDoc.department
            ? activeDoc.department
            : "Phòng Cung ứng"),
        item_name: it.name,
        unit: it.unit || "Cái",
        quantity_doc: String(it.qty),
        quantity_pass: String(actualQty),
        quantity_fail: "",
        note: `Nhận từ ${docTypeLabel} #${activeDoc.number}${suppPart}${specPart}`,
        handover_date: localToday(),
        sender_name: "Trần Hải Hà",
        sender_dept: "Phòng Cung ứng",
        receiver_name: "",
        source_type: docTypeLabel,
        source_number: activeDoc.number,
      };
    });

    triggerUpdateHandovers([...newHandovers, ...paymentHandovers]);
    setCheckedHandovers(new Set(newHandovers.map((h) => h.id)));
    setShowImportDocModal(false);
    alert(
      `Đã nạp thành công ${newHandovers.length} mặt hàng từ ${docTypeLabel} #${activeDoc.number} vào danh sách bàn giao!`
    );
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
            {showMobileCards
              ? "Giao diện di động: Tra cứu vật tư bàn giao và chọn in biên bản."
              : "Theo dõi danh mục vật tư chuyển trực tiếp từ Phòng Cung ứng đến các bộ phận sử dụng nội bộ Phenikaa."}
          </p>
        </div>
        <div className="actions">
          <button
            className="payment-btn"
            onClick={() => setUserMobileToggle(!showMobileCards)}
            title="Chuyển đổi giao diện giữa dạng bảng tính desktop và dạng thẻ di động"
          >
            {showMobileCards ? "💻 Xem bản desktop" : "📱 Xem dạng thẻ"}
          </button>
        </div>
      </div>

      {/* Main Toolbar */}
      <div className={`payment-toolbar ${showMobileCards ? "payment-toolbar-mobile" : ""}`}>
        {!showMobileCards ? (
          <>
            <button className="payment-btn btn-primary" onClick={handleAddHandoverRow}>
              ＋ Thêm dòng vật tư
            </button>
            <button
              className="payment-btn"
              style={{ background: "#0284c7", color: "#fff", borderColor: "#0369a1" }}
              onClick={openImportDocModal}
              title="Nhập sản phẩm từ PR, PO hoặc Hợp đồng vào danh sách bàn giao"
            >
              📦 Chọn từ PR / PO / Hợp đồng
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
              🖨️ In biên bản {checkedHandovers.size > 0 ? `(${checkedHandovers.size})` : ""}
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
          </>
        ) : (
          <div style={{ display: "flex", gap: "8px", width: "100%", flexWrap: "wrap" }}>
            <button
              className="payment-btn"
              style={{ background: "#0284c7", color: "#fff", borderColor: "#0369a1", flex: 1, justifyContent: "center" }}
              onClick={openImportDocModal}
              title="Nhập sản phẩm từ PR, PO hoặc Hợp đồng vào danh sách bàn giao"
            >
              📦 Chọn từ PR / PO / HĐ
            </button>
            <button
              className="payment-btn"
              style={{ background: "#0f766e", color: "#fff", borderColor: "#0d5e56", flex: 1, justifyContent: "center" }}
              onClick={() => handlePrintHandoverDirect()}
              title="In biên bản bàn giao các vật tư đã chọn"
            >
              🖨️ In biên bản {checkedHandovers.size > 0 ? `(${checkedHandovers.size})` : ""}
            </button>
          </div>
        )}

        <select
          value={handoverDeptFilter}
          onChange={(e) => setHandoverDeptFilter(e.target.value)}
          style={{ width: showMobileCards ? "100%" : "auto", minWidth: "170px" }}
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
          style={{ width: showMobileCards ? "100%" : "260px" }}
        />

        <span style={{ marginLeft: showMobileCards ? "0" : "auto", fontSize: "12px", color: "#64748b" }}>
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

      {/* Mobile Cards View */}
      {showMobileCards ? (
        <div className="mobile-cards-container">
          {filteredHandovers.map((h) => {
            const isChecked = checkedHandovers.has(h.id);
            return (
              <div key={h.id} className={`m-card ${isChecked ? "m-card-checked" : ""}`}>
                <div className="m-card-header">
                  <div className="m-card-stt">STT {h.id}</div>
                  <span className="m-badge mb-badge-dept">🏢 {h.department || "Chưa chọn bộ phận"}</span>
                </div>
                <div className="m-card-payee">{h.item_name || "Chưa có tên vật tư"}</div>
                <div className="m-card-desc">
                  {h.specification ? `Quy cách: ${h.specification}` : "Chưa có quy cách"} · ĐVT: <b>{h.unit || "Cái"}</b>
                </div>
                <div className="m-handover-qty-grid">
                  <div className="m-qty-box">
                    <small>Chứng từ</small>
                    <b>{h.quantity_doc}</b>
                  </div>
                  <div className="m-qty-box pass">
                    <small>Đạt chuẩn</small>
                    <b>{h.quantity_pass}</b>
                  </div>
                  <div className={`m-qty-box ${Number(h.quantity_fail) > 0 ? "fail" : ""}`}>
                    <small>Hỏng / Lỗi</small>
                    <b>{h.quantity_fail || 0}</b>
                  </div>
                </div>
                <div className="m-card-meta">
                  {h.handover_date && <div>📅 Ngày bàn giao: <b>{h.handover_date}</b></div>}
                  {(h.sender_name || h.receiver_name) && (
                    <div>
                      👤 Giao: <b>{h.sender_name || "—"}</b> · Nhận: <b>{h.receiver_name || "—"}</b>
                    </div>
                  )}
                  {h.note && <div>📝 Ghi chú: <i>{h.note}</i></div>}
                </div>
                <div className="m-card-actions">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      cursor: "pointer",
                      padding: "8px 12px",
                      background: isChecked ? "#e0f2fe" : "#f8fafc",
                      borderRadius: "6px",
                      border: `1px solid ${isChecked ? "#38bdf8" : "#cbd5e1"}`,
                      width: "100%",
                      fontWeight: 600,
                      color: isChecked ? "#0284c7" : "#475569",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const next = new Set(checkedHandovers);
                        if (e.target.checked) next.add(h.id);
                        else next.delete(h.id);
                        setCheckedHandovers(next);
                      }}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <span>{isChecked ? "✓ Đã chọn để in biên bản" : "Chọn vật tư này để in"}</span>
                  </label>
                </div>
              </div>
            );
          })}
          {filteredHandovers.length === 0 && (
            <div className="m-empty">Không tìm thấy vật tư bàn giao nào</div>
          )}
        </div>
      ) : (
        /* Handover Data Table with direct paste support */
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
    )}

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

      {/* MODAL: Import from PR / PO / Contract */}
      {showImportDocModal && (
        <div className="payment-modal-overlay" onClick={() => setShowImportDocModal(false)}>
          <div
            className="payment-modal-card"
            style={{ maxWidth: "900px", width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "22px" }}>📦</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a" }}>
                    Nhập sản phẩm từ PR, PO hoặc Hợp đồng vào Biên bản bàn giao
                  </h3>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Chọn chứng từ nguồn và tích chọn các mặt hàng cần đưa vào danh sách bàn giao
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportDocModal(false)}
                style={{ fontSize: "20px", cursor: "pointer", border: "none", background: "transparent" }}
              >
                ✕
              </button>
            </div>

            {/* Source Tab Selector */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
              <button
                type="button"
                className={`payment-tab-btn ${importDocType === "pr" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: importDocType === "pr" ? "#0284c7" : "#fff",
                  color: importDocType === "pr" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => handleSwitchImportType("pr")}
              >
                📋 Yêu cầu mua sắm PR ({prs.length})
              </button>
              <button
                type="button"
                className={`payment-tab-btn ${importDocType === "po" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: importDocType === "po" ? "#0284c7" : "#fff",
                  color: importDocType === "po" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => handleSwitchImportType("po")}
              >
                🛒 Đơn mua hàng PO ({pos.length})
              </button>
              <button
                type="button"
                className={`payment-tab-btn ${importDocType === "contract" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: importDocType === "contract" ? "#0284c7" : "#fff",
                  color: importDocType === "contract" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => handleSwitchImportType("contract")}
              >
                📑 Hợp đồng kinh tế ({contractsList.length > 0 ? contractsList.length : pos.length})
              </button>
            </div>

            {/* Document Selection & Search */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Chọn {importDocType === "pr" ? "phiếu PR" : importDocType === "contract" ? "Hợp đồng" : "đơn PO"}:
                </label>
                <select
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  value={selectedDocId}
                  onChange={(e) => handleSelectDoc(e.target.value)}
                >
                  <option value="">-- Chọn chứng từ --</option>
                  {availableDocs.map((doc) => {
                    const s = "supplierId" in doc ? suppliers.find((x) => x.id === doc.supplierId) : null;
                    const subText = s ? s.name : "department" in doc ? doc.department : "";
                    const itemCount = doc.items?.length || 0;
                    return (
                      <option key={doc.id} value={doc.id}>
                        {doc.number} {subText ? `- ${subText}` : ""} ({itemCount} mặt hàng)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Bộ phận nhận bàn giao:
                </label>
                <input
                  list="handoverDeptsList"
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                  value={importTargetDept}
                  onChange={(e) => setImportTargetDept(e.target.value)}
                  placeholder="Nhập hoặc chọn phòng ban..."
                />
                <datalist id="handoverDeptsList">
                  {handoverDepts.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Document Details Box if selected */}
            {activeDoc && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", fontSize: "12px" }}>
                <div>
                  <span style={{ color: "#64748b" }}>Số chứng từ:</span> <b>{activeDoc.number}</b>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>
                    {"supplierId" in activeDoc ? "Nhà cung cấp:" : "Bộ phận yêu cầu:"}
                  </span>{" "}
                  <b>
                    {"supplierId" in activeDoc
                      ? suppliers.find((s) => s.id === activeDoc.supplierId)?.name || "Chưa rõ"
                      : "department" in activeDoc
                      ? activeDoc.department
                      : ""}
                  </b>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Ngày lập:</span>{" "}
                  <b>{"createdDate" in activeDoc ? activeDoc.createdDate : "date" in activeDoc ? activeDoc.date : ""}</b>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Số lượng mặt hàng:</span> <b>{activeDocItems.length} mục</b>
                </div>
              </div>
            )}

            {/* Items selection table */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>
                  Danh sách sản phẩm / vật tư trong chứng từ:
                </span>
                <span style={{ fontSize: "12px", color: selectedItemIds.size > 0 ? "#0284c7" : "#64748b", fontWeight: 600 }}>
                  Đã chọn: {selectedItemIds.size} / {activeDocItems.length} mặt hàng
                </span>
              </div>

              <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflowX: "auto", maxHeight: "260px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", position: "sticky", top: 0, zIndex: 2 }}>
                      <th style={{ padding: "6px 8px", width: "40px", textAlign: "center", borderBottom: "1px solid #cbd5e1" }}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.size === activeDocItems.length && activeDocItems.length > 0}
                          onChange={handleToggleSelectAllItems}
                          title="Chọn tất cả"
                        />
                      </th>
                      <th style={{ padding: "6px 8px", width: "40px", textAlign: "center", borderBottom: "1px solid #cbd5e1" }}>STT</th>
                      <th style={{ padding: "6px 8px", width: "80px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Mã hàng</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Tên sản phẩm, vật tư</th>
                      <th style={{ padding: "6px 8px", width: "140px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Quy cách</th>
                      <th style={{ padding: "6px 8px", width: "60px", textAlign: "center", borderBottom: "1px solid #cbd5e1" }}>ĐVT</th>
                      <th style={{ padding: "6px 8px", width: "80px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>SL chứng từ</th>
                      <th style={{ padding: "6px 8px", width: "110px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>SL bàn giao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDocItems.map((it, idx) => {
                      const isChecked = selectedItemIds.has(it.id);
                      const customQty = itemCustomQty[it.id] !== undefined ? itemCustomQty[it.id] : it.qty;
                      return (
                        <tr
                          key={it.id}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            background: isChecked ? "#f0f9ff" : "#fff",
                            cursor: "pointer",
                          }}
                          onClick={() => handleToggleSelectItem(it.id)}
                        >
                          <td style={{ textAlign: "center", padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectItem(it.id)}
                            />
                          </td>
                          <td style={{ textAlign: "center", color: "#64748b", padding: "6px 8px" }}>{idx + 1}</td>
                          <td style={{ padding: "6px 8px", color: "#0284c7", fontWeight: 600 }}>{it.code || "---"}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: "#0f172a" }}>{it.name}</td>
                          <td style={{ padding: "6px 8px", color: "#64748b" }}>{it.spec || "---"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>{it.unit || "Cái"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{it.qty}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={customQty}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setItemCustomQty((prev) => ({ ...prev, [it.id]: val }));
                              }}
                              style={{
                                width: "80px",
                                padding: "4px 6px",
                                textAlign: "right",
                                border: "1px solid #cbd5e1",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {activeDocItems.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                          {activeDoc ? "Chứng từ này không có mặt hàng nào." : "Vui lòng chọn chứng từ phía trên để xem danh sách mặt hàng."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                ℹ️ Các mặt hàng bàn giao sẽ tự động được gán thông tin nguồn (Số PR / PO / HĐ) vào mục ghi chú.
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="payment-btn"
                  onClick={() => setShowImportDocModal(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="payment-btn btn-primary"
                  style={{ background: "#0284c7", borderColor: "#0369a1" }}
                  disabled={selectedItemIds.size === 0}
                  onClick={handleConfirmImportItems}
                >
                  ✓ Nạp {selectedItemIds.size} mặt hàng vào danh sách bàn giao
                </button>
              </div>
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
