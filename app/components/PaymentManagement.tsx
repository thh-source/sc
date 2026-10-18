"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  PO,
  Supplier,
  PaymentRequestEntry,
  PaymentGroup,
  PaymentPrintTemplate,
  PaymentDetailLine,
} from "../types";
import {
  DEFAULT_PAYMENT_TEMPLATE,
  PAID_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  DEFAULT_DOCS,
  fmtMoney,
  moneyWords,
  normName,
  localToday,
  parsePrintDate,
  parseFlexibleDate,
  BANK_SUGGESTIONS,
} from "../payment-utils";
import "../payment.css";
import { useIsMobile } from "../useIsMobile";

export interface PaymentManagementProps {
  paymentRequests?: PaymentRequestEntry[];
  paymentGroups?: PaymentGroup[];
  paymentTemplate?: PaymentPrintTemplate;
  pos?: PO[];
  suppliers?: Supplier[];
  onUpdateState: (patch: {
    paymentRequests?: PaymentRequestEntry[];
    paymentGroups?: PaymentGroup[];
    paymentTemplate?: PaymentPrintTemplate;
  }) => void;
  readOnly?: boolean;
}

export function PaymentManagement({
  paymentRequests = [],
  paymentGroups = [],
  paymentTemplate = DEFAULT_PAYMENT_TEMPLATE,
  pos = [],
  suppliers = [],
  onUpdateState,
  readOnly = false,
}: PaymentManagementProps) {
  // Mobile / Desktop & Card view detection
  const isAutoMobile = useIsMobile(768);
  const [userMobileToggle, setUserMobileToggle] = useState<boolean | null>(null);
  const isPhoneScreen = isAutoMobile;
  const isCardView = userMobileToggle !== null ? userMobileToggle : isAutoMobile;
  const showMobileCards = isCardView;

  // Card view Edit modal state (allows editing on computer in card mode)
  const [editModalReqId, setEditModalReqId] = useState<number | null>(null);

  // Selection states
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [activeRequestId, setActiveRequestId] = useState<number | null>(
    paymentRequests[0]?.id ?? null
  );

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [freezeCol, setFreezeCol] = useState(2); // 2: STT, 3: NCC, 4: Group, 7: InvoiceNo, 8: InvoiceDate, 0: None
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);

  // Modals state
  const [docModalReqId, setDocModalReqId] = useState<number | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [customDocTypes, setCustomDocTypes] = useState<string[]>(DEFAULT_DOCS);

  const [showPOPickerModal, setShowPOPickerModal] = useState(false);
  const [poSearch, setPoSearch] = useState("");

  // Print portal states
  const [isPrinting, setIsPrinting] = useState(false);
  const [printEntriesList, setPrintEntriesList] = useState<PaymentRequestEntry[]>([]);

  // Hidden date picker ref
  const calendarPickerRef = useRef<HTMLInputElement>(null);
  const calendarCbRef = useRef<((dateVal: string) => void) | null>(null);

  // Keep activeRequestId valid
  useEffect(() => {
    if (activeRequestId === null && paymentRequests.length > 0) {
      setActiveRequestId(paymentRequests[0].id);
    }
  }, [paymentRequests, activeRequestId]);

  // Active Request
  const activeReq = useMemo(
    () => paymentRequests.find((r) => r.id === activeRequestId) || paymentRequests[0] || null,
    [paymentRequests, activeRequestId]
  );

  // Filtered requests for DATA table (sắp xếp số thứ tự từ dưới lên trên, số to ở trên)
  const filteredRequests = useMemo(() => {
    const rawQ = searchQuery.trim();
    const tokens = rawQ ? normName(rawQ).split(/\s+/).filter(Boolean) : [];

    const list = paymentRequests.filter((r) => {
      // 1. Bộ lọc trạng thái
      if (statusFilter && r.status !== statusFilter) return false;

      // 2. Bộ lọc nhóm
      if (groupFilter && String(r.group_id || "") !== String(groupFilter)) return false;

      // 3. Tìm kiếm theo từ khóa đa trường (NCC, STT, nội dung, hóa đơn, số tiền, nhóm, dòng chi tiết...)
      if (tokens.length > 0) {
        // Nhóm liên quan
        const grp = paymentGroups.find(
          (g) => String(g.id) === String(r.group_id) || (r.group_code && g.code === r.group_code)
        );

        // Nhà cung cấp liên quan
        const supp = suppliers.find(
          (s) =>
            normName(s.name) === normName(r.payee_name) ||
            (s.shortName && normName(s.shortName) === normName(r.payee_name)) ||
            (r.beneficiary_id && s.id === r.beneficiary_id)
        );

        // Chi tiết từng dòng hàng hóa/hóa đơn
        const linesText = (r.lines || [])
          .map(
            (l) =>
              `${l.description || ""} ${l.invoice_no || ""} ${l.amount || ""} ${fmtMoney(l.amount)} ${l.note || ""}`
          )
          .join(" ");

        // Xây dựng kho dữ liệu tìm kiếm toàn diện cho dòng đề nghị
        const corpus = [
          // STT
          r.legacy_stt,
          `stt ${r.legacy_stt || ""}`,
          `stt${r.legacy_stt || ""}`,
          r.id,
          `stt ${r.id}`,
          `#${r.legacy_stt || r.id}`,
          // Nhà cung cấp & Thụ hưởng
          r.payee_name,
          supp?.name,
          supp?.shortName,
          supp?.code,
          // Nhóm thanh toán & Mã PO
          r.group_code,
          grp?.code,
          grp?.name,
          // Nội dung & Hàng hóa
          r.description,
          r.item_name,
          linesText,
          // Số hóa đơn & Ngày
          r.invoice_no,
          r.invoice_date,
          r.request_date,
          // Số tiền & Tiền tệ
          String(r.amount || ""),
          fmtMoney(r.amount),
          r.currency,
          // Loại thanh toán & Trạng thái
          r.payment_type,
          r.status,
          r.doc_supplement,
          (r.documents || []).join(" "),
          // Ngân hàng & Tài khoản
          r.address,
          r.account_no,
          (r.account_no || "").replace(/[\s.-]/g, ""),
          r.bank,
          r.created_by_name,
        ]
          .filter(Boolean)
          .join(" ");

        const normCorpus = normName(corpus);
        const corpusDigits = corpus.replace(/\D/g, "");

        // Mọi token người dùng gõ đều phải được tìm thấy (hỗ trợ gõ nhiều từ cách nhau dấu cách)
        const allMatched = tokens.every((token) => {
          if (normCorpus.includes(token)) return true;
          // Nếu token có chữ số (số tiền có dấu chấm, số tài khoản, số hóa đơn...)
          const tokenDigits = token.replace(/\D/g, "");
          if (tokenDigits && corpusDigits.includes(tokenDigits)) return true;
          return false;
        });

        if (!allMatched) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      const na = Number(a.legacy_stt || a.id) || 0;
      const nb = Number(b.legacy_stt || b.id) || 0;
      if (nb !== na) return nb - na;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }, [paymentRequests, searchQuery, statusFilter, groupFilter, paymentGroups, suppliers]);

  // Cập nhật activeRequestId hiển thị mục đầu tiên khi kết quả tìm kiếm thay đổi
  useEffect(() => {
    if (filteredRequests.length > 0) {
      if (!filteredRequests.some((r) => r.id === activeRequestId)) {
        setActiveRequestId(filteredRequests[0].id);
      }
    }
  }, [filteredRequests, activeRequestId]);

  // Suggestion lists for autocomplete datalists
  const bankSuggestions = useMemo(() => {
    const set = new Set<string>(BANK_SUGGESTIONS);
    suppliers.forEach((s) => {
      if (s.bank?.trim()) set.add(s.bank.trim());
    });
    paymentRequests.forEach((r) => {
      if (r.bank?.trim()) set.add(r.bank.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [suppliers, paymentRequests]);

  const itemSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentRequests.forEach((r) => {
      if (r.item_name?.trim()) set.add(r.item_name.trim());
      (r.lines || []).forEach((l) => {
        if (l.description?.trim()) set.add(l.description.trim());
      });
    });
    (pos || []).forEach((p) => {
      (p.items || []).forEach((it) => {
        if (it.item?.name?.trim()) set.add(it.item.name.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests, pos]);

  const descSuggestions = useMemo(() => {
    const defaults = [
      "Thanh toán 100% tiền hàng",
      "Thanh toán tạm ứng hợp đồng",
      "Thanh toán đợt 1",
      "Thanh toán đợt 2",
      "Thanh toán đợt 3",
      "Thanh toán quyết toán hợp đồng",
      "Thanh toán theo hợp đồng",
      "Thanh toán phí dịch vụ",
      "Thanh toán bảo trì / sửa chữa",
      "Thanh toán mua sắm thiết bị",
      "Thanh toán mua hóa chất / dung môi",
      "Thanh toán mua bao bì / tá dược",
    ];
    const set = new Set<string>(defaults);
    paymentRequests.forEach((r) => {
      if (r.description?.trim()) set.add(r.description.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests]);

  const invoiceSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentRequests.forEach((r) => {
      if (r.invoice_no?.trim()) set.add(r.invoice_no.trim());
      (r.lines || []).forEach((l) => {
        if (l.invoice_no?.trim()) set.add(l.invoice_no.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests]);

  const docSupplementSuggestions = useMemo(() => {
    const defaults = [
      "Đầy đủ hồ sơ",
      "Chờ hóa đơn gốc",
      "Chờ biên bản bàn giao",
      "Chờ biên bản nghiệm thu",
      "Chờ chứng từ CO/CQ",
      "Chờ bảo lãnh ngân hàng",
      "Đã nộp KT bản cứng",
      "Bổ sung phiếu xuất kho",
    ];
    const set = new Set<string>(defaults);
    paymentRequests.forEach((r) => {
      if (r.doc_supplement?.trim()) set.add(r.doc_supplement.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests]);

  const requesterSuggestions = useMemo(() => {
    const set = new Set<string>();
    if (paymentTemplate.default_requester_name) set.add(paymentTemplate.default_requester_name);
    set.add("Trần Hải Hà");
    paymentRequests.forEach((r) => {
      if (r.created_by_name?.trim()) set.add(r.created_by_name.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentRequests, paymentTemplate]);

  const groupSuggestions = useMemo(() => {
    const set = new Set<string>();
    paymentGroups.forEach((g) => {
      if (g.code?.trim()) set.add(g.code.trim());
    });
    (pos || []).forEach((p) => {
      if (p.number?.trim()) set.add(p.number.trim());
    });
    paymentRequests.forEach((r) => {
      if (r.group_code?.trim()) set.add(r.group_code.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [paymentGroups, pos, paymentRequests]);

  // Request edits
  const handleEditRequest = (id: number, key: keyof PaymentRequestEntry, val: any) => {
    if (readOnly) return;
    const next = paymentRequests.map((r) => {
      if (r.id === id) {
        const updated = { ...r, [key]: val };
        if (key === "payee_name") {
          const match = suppliers.find(
            (s) =>
              normName(s.name) === normName(val) ||
              (s.shortName && normName(s.shortName) === normName(val))
          );
          if (match) {
            if (!updated.address && match.address) updated.address = match.address;
            if (!updated.account_no && match.bankAccount) updated.account_no = match.bankAccount;
            if (!updated.bank && match.bank) updated.bank = match.bank;
          }
        }
        if (key === "group_code") {
          const g = paymentGroups.find(
            (x) => normName(x.code) === normName(val) || normName(x.name) === normName(val)
          );
          if (g) updated.group_id = g.id;
        }
        return updated;
      }
      return r;
    });
    onUpdateState({ paymentRequests: next });
  };

  // Toggle paid status on mobile (The only active feature permitted on mobile)
  const handleTogglePaid = (reqId: number, nextPaid: boolean) => {
    if (readOnly) return;
    const targetStatus = nextPaid ? "Done" : "Đã giao KT, chờ đi tiền";
    handleEditRequest(reqId, "status", targetStatus);
  };

  const handleAddRequestRow = () => {
    if (readOnly) return;
    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt) || 0)) + 1;
    const newReq: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: String(maxStt).padStart(2, "0"),
      payee_name: "",
      group_code: "",
      description: "",
      item_name: "",
      invoice_no: "",
      invoice_date: "",
      amount: "0",
      currency: "VND",
      documents: ["ĐNTT", "Hóa đơn"],
      request_date: localToday(),
      payment_type: "TT trước 100%",
      status: "Đã giao KT, chờ đi tiền",
      address: "",
      account_no: "",
      bank: "",
      created_by_name: paymentTemplate.default_requester_name || "Trần Hải Hà",
      lines: [],
    };
    const next = [newReq, ...paymentRequests];
    onUpdateState({ paymentRequests: next });
    setActiveRequestId(maxId);
    return maxId;
  };

  const handleAddNewFromCardView = () => {
    const newId = handleAddRequestRow();
    if (newId) {
      setEditModalReqId(newId);
    }
  };

  const handleDeleteSelectedRequests = () => {
    if (readOnly) return;
    if (checkedIds.size === 0 && activeRequestId === null) {
      alert("Vui lòng tích chọn dòng cần xóa");
      return;
    }
    const toDelete = checkedIds.size > 0 ? checkedIds : new Set([activeRequestId!]);
    if (!confirm(`Bạn có chắc muốn xóa ${toDelete.size} dòng đề nghị thanh toán đã chọn?`))
      return;

    const next = paymentRequests.filter((r) => !toDelete.has(r.id));
    onUpdateState({ paymentRequests: next });
    setCheckedIds(new Set());
    if (activeRequestId && toDelete.has(activeRequestId)) {
      setActiveRequestId(next[0]?.id ?? null);
    }
  };

  const handleDeleteRequest = (id: number) => {
    if (readOnly) return;
    const target = paymentRequests.find((r) => r.id === id);
    if (!target) return;
    if (confirm(`Bạn có chắc muốn xóa đề nghị STT ${target.legacy_stt || target.id} (${target.payee_name || "Chưa có NCC"})?`)) {
      const next = paymentRequests.filter((r) => r.id !== id);
      onUpdateState({ paymentRequests: next });
      if (editModalReqId === id) setEditModalReqId(null);
      if (activeRequestId === id) setActiveRequestId(next[0]?.id ?? null);
      if (checkedIds.has(id)) {
        const nextChecked = new Set(checkedIds);
        nextChecked.delete(id);
        setCheckedIds(nextChecked);
      }
    }
  };

  // Keyboard navigation for Excel-like Tab / Enter
  const handleTableKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key === "Tab") {
      const editors = Array.from(
        e.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          ".cell-editor:not([disabled])"
        )
      );
      const target = e.target as HTMLElement;
      const idx = editors.indexOf(target as any);
      if (idx >= 0) {
        e.preventDefault();
        const step = e.shiftKey ? -1 : 1;
        const nextIdx = Math.max(0, Math.min(editors.length - 1, idx + step));
        const nextEl = editors[nextIdx];
        if (nextEl) {
          nextEl.focus();
          if (nextEl instanceof HTMLInputElement && nextEl.type !== "date") {
            nextEl.select();
          }
        }
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.matches("input:not([type=checkbox])")) {
        target.blur();
      }
    }
  };

  // Handle direct Excel paste on Payment table (sắp xếp thêm dòng mới lên trên cùng)
  const handlePaymentTablePaste = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
    if (readOnly) return;
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsedRows: PaymentRequestEntry[] = [];
    let maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt || r.id) || 0));

    for (const line of lines) {
      const parts = line.split("\t").map((p) => p.trim());
      if (parts.length === 0 || parts.every((p) => !p)) continue;
      const firstLower = parts[0].toLowerCase();
      if (
        firstLower === "stt" ||
        firstLower === "tt" ||
        firstLower.includes("nhà cung cấp") ||
        firstLower.includes("thụ hưởng") ||
        firstLower.includes("đề nghị thanh toán")
      ) {
        continue;
      }

      let startIdx = 0;
      if (/^\d+$/.test(parts[0]) && parts.length > 1) {
        startIdx = 1;
      }
      const cols = parts.slice(startIdx);

      let payee_name = cols[0] || "";
      let group_code = "";
      let group_id: number | null = null;
      let description = "";
      let item_name = "";
      let invoice_no = "";
      let invoice_date = "";
      let amount = "";

      if (cols.length >= 2) {
        const matchedGroup = paymentGroups.find(
          (g) => g.code.toLowerCase() === cols[1].toLowerCase() || g.name.toLowerCase() === cols[1].toLowerCase()
        );
        if (matchedGroup) {
          group_code = matchedGroup.code;
          group_id = matchedGroup.id;
        } else {
          description = cols[1];
        }
      }
      if (cols.length >= 3) {
        if (description) item_name = cols[2];
        else description = cols[2];
      }
      if (cols.length >= 4) {
        if (!item_name) item_name = cols[3];
        else invoice_no = cols[3];
      }
      if (cols.length >= 5) {
        if (!invoice_no) invoice_no = cols[4];
        else invoice_date = cols[4];
      }
      if (cols.length >= 6) {
        for (let i = 4; i < cols.length; i++) {
          const cleaned = cols[i].replace(/[.,\sđVND]/gi, "");
          if (/^\d+$/.test(cleaned) && Number(cleaned) > 0) {
            amount = cleaned;
            break;
          }
        }
      }

      // Lookup supplier details
      let address = "";
      let account_no = "";
      let bank = "";
      const sup = suppliers.find(
        (s) => s.name.toLowerCase() === payee_name.toLowerCase() || (s.shortName && s.shortName.toLowerCase() === payee_name.toLowerCase())
      );
      if (sup) {
        address = sup.address || "";
        account_no = sup.bankAccount || "";
        bank = sup.bank || "";
      }

      maxStt++;
      parsedRows.push({
        id: Date.now() + parsedRows.length + Math.floor(Math.random() * 1000),
        legacy_stt: String(maxStt).padStart(2, "0"),
        payee_name,
        group_id,
        group_code,
        description: description || `Thanh toán cho ${payee_name || "nhà cung cấp"}`,
        item_name: item_name || description,
        invoice_no: invoice_no || "Chưa có HĐ",
        invoice_date: invoice_date || localToday(),
        amount: amount || "0",
        currency: "VND",
        documents: ["ĐNTT", "Hóa đơn"],
        request_date: localToday(),
        payment_type: "TT sau 100%",
        status: "Đã giao KT, chờ đi tiền",
        missing_doc: "",
        address,
        account_no,
        bank,
        created_by_name: "Trần Hải Hà",
        lines: [],
      });
    }

    if (parsedRows.length > 0) {
      e.preventDefault();
      onUpdateState({ paymentRequests: [...parsedRows, ...paymentRequests] });
      alert(`Đã dán trực tiếp ${parsedRows.length} đề nghị thanh toán từ Excel vào đầu bảng!`);
    }
  };

  // Open calendar picker
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

  // Create request from PO
  const handleCreateFromPO = (po: PO) => {
    if (readOnly) return;
    const s = suppliers.find((x) => x.id === po.supplierId);
    const poTotal = po.items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const maxStt = Math.max(0, ...paymentRequests.map((r) => Number(r.legacy_stt) || 0)) + 1;

    const itemNames = po.items.map((i) => i.name).slice(0, 3).join(", ");
    const lines: PaymentDetailLine[] = po.items.map((it) => ({
      description: it.name + (it.spec ? ` (${it.spec})` : ""),
      invoice_no: "",
      invoice_date: "",
      amount: it.qty * it.price,
    }));

    const newReq: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: String(maxStt).padStart(2, "0"),
      payee_name: s?.name || "",
      group_code: po.number,
      description: `Thanh toán tiền mua hàng theo đơn hàng PO ${po.number}`,
      item_name: itemNames,
      invoice_no: "",
      invoice_date: "",
      amount: poTotal,
      currency: "VND",
      documents: ["ĐNTT", "Hóa đơn", "Hợp đồng", "BB nghiệm thu"],
      request_date: localToday(),
      payment_type: "TT trước 100%",
      status: "Đã giao KT, chờ đi tiền",
      address: s?.address || "",
      account_no: s?.bankAccount || "",
      bank: s?.bank || "",
      created_by_name: paymentTemplate.default_requester_name || "Trần Hải Hà",
      lines,
    };

    let nextGroups = [...paymentGroups];
    if (!nextGroups.some((g) => normName(g.code) === normName(po.number))) {
      const maxGId = Math.max(0, ...nextGroups.map((g) => Number(g.id) || 0)) + 1;
      nextGroups.push({
        id: maxGId,
        code: po.number,
        name: `Đơn hàng ${po.number} - ${s?.name || ""}`,
        payee_name: s?.name || "",
        total_amount: poTotal,
        currency: "VND",
      });
      newReq.group_id = maxGId;
    }

    const next = [newReq, ...paymentRequests];
    onUpdateState({ paymentRequests: next, paymentGroups: nextGroups });
    setActiveRequestId(maxId);
    setShowPOPickerModal(false);
    alert(`Đã lập Đề nghị thanh toán thành công từ PO ${po.number}!`);
  };

  // Print Handlers via Portal (Clean & Isolated)
  const handlePrintSingle = (req?: PaymentRequestEntry) => {
    const target = req || activeReq;
    if (!target) {
      alert("Vui lòng chọn một đề nghị thanh toán để in");
      return;
    }
    setPrintEntriesList([target]);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  const handlePrintChecked = () => {
    if (checkedIds.size === 0) {
      alert("Vui lòng tích chọn ít nhất 1 dòng đề nghị thanh toán để in");
      return;
    }
    const selectedList = paymentRequests.filter((r) => checkedIds.has(r.id));
    setPrintEntriesList(selectedList);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };


  return (
    <section className={`content payment-management ${isWorkspaceExpanded ? "workspace-expanded" : ""}`}>
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
          <em>QUẢN LÝ TÀI CHÍNH · THANH TOÁN</em>
          <h1>Đề nghị thanh toán (Mẫu 01 – TT)</h1>
          <p>
            {isPhoneScreen
              ? "Giao diện di động: Chỉ xem thông tin và đánh dấu đã thanh toán."
              : isCardView
              ? "Chế độ xem dạng thẻ trực quan: Xem, tìm kiếm, chỉnh sửa và lập đề nghị thanh toán mới."
              : "Lập, theo dõi và phê duyệt đề nghị thanh toán chuyển khoản Phenikaa. Dùng chung danh mục Nhà cung cấp và Cài đặt của hệ thống mua hàng."}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`payment-toolbar ${isPhoneScreen ? "payment-toolbar-mobile" : ""}`}>
        {!isPhoneScreen && (
          <>
            <button
              type="button"
              className="payment-btn btn-primary"
              onClick={isCardView ? handleAddNewFromCardView : handleAddRequestRow}
              title={isCardView ? "Thêm một đề nghị thanh toán mới và chỉnh sửa" : "Thêm một dòng đề nghị thanh toán mới vào bảng"}
            >
              ＋ Thêm đề nghị {isCardView ? "mới" : "(thêm dòng)"}
            </button>

            <button
              type="button"
              className="payment-btn"
              onClick={() => setShowPOPickerModal(true)}
              title="Lập đề nghị thanh toán từ đơn đặt hàng PO"
              style={{ background: "#f8fafc", borderColor: "#cbd5e1" }}
            >
              ⚡ Lập từ PO
            </button>

            <button
              type="button"
              className={`btn-workspace-toggle ${isWorkspaceExpanded ? "active" : ""}`}
              onClick={() => setIsWorkspaceExpanded(!isWorkspaceExpanded)}
              title={isWorkspaceExpanded ? "Thu gọn về giao diện chuẩn" : "Mở rộng không gian làm việc (giống So sánh báo giá)"}
            >
              <span>{isWorkspaceExpanded ? "🗗" : "⛶"}</span>
              {isWorkspaceExpanded ? "Thu gọn giao diện" : "Mở rộng không gian"}
            </button>

            <button
              type="button"
              className="payment-btn"
              onClick={() => setUserMobileToggle(!isCardView)}
              title="Chuyển đổi giao diện giữa dạng bảng tính desktop và dạng thẻ trực quan"
            >
              {isCardView ? "📊 Xem dạng bảng tính" : "🗂️ Xem dạng thẻ"}
            </button>
          </>
        )}

        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", width: isPhoneScreen ? "100%" : "250px" }}>
          <input
            placeholder="Tìm NCC, STT, nội dung, hóa đơn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", paddingRight: searchQuery ? "28px" : "10px" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title="Xóa tìm kiếm"
              style={{
                position: "absolute",
                right: "6px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: "13px",
                lineHeight: "1",
              }}
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: isPhoneScreen ? "100%" : "auto" }}
        >
          <option value="">Tất cả trạng thái</option>
          {PAYMENT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          style={{ width: isPhoneScreen ? "100%" : "auto" }}
        >
          <option value="">Tất cả nhóm</option>
          {paymentGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} ({g.name || g.payee_name || ""})
            </option>
          ))}
        </select>

        {!isPhoneScreen && !isCardView && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
              color: "#1e3a5f",
              fontWeight: 600,
              background: "#f0f4f9",
              padding: "3px 8px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
            }}
          >
            <span>📌 Cố định:</span>
            <select
              value={freezeCol}
              onChange={(e) => setFreezeCol(Number(e.target.value))}
              style={{
                padding: "3px 6px",
                borderRadius: "5px",
                border: "1px solid #cbd5e1",
                fontSize: "12px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <option value="2">Cột STT (Mặc định)</option>
              <option value="3">Đến NCC (Cột B)</option>
              <option value="4">Đến Nhóm PO (Cột C)</option>
              <option value="7">Đến Số HĐ (Cột F)</option>
              <option value="8">Đến Ngày HĐ</option>
              <option value="0">Không cố định cột</option>
            </select>
          </div>
        )}

        {!isPhoneScreen && (
          <>
            {!isCardView && (
              <>
                <button className="payment-btn" onClick={handlePrintChecked}>
                  ⎙ In các dòng đã tích ({checkedIds.size})
                </button>
                <button
                  className="payment-btn btn-danger"
                  onClick={handleDeleteSelectedRequests}
                >
                  Xóa dòng đã chọn
                </button>
              </>
            )}
          </>
        )}

        <span style={{ marginLeft: isPhoneScreen ? "0" : "auto", fontSize: "12px", color: "#64748b" }}>
          {filteredRequests.length} / {paymentRequests.length} đề nghị
        </span>
      </div>

      {/* Datalists for autocompletion from central suppliers and tables */}
      <datalist id="nccDataList">
        {suppliers.map((s) => (
          <option key={`sup-short-${s.id}`} value={s.shortName || s.name}>
            {s.name} {s.code ? `(${s.code})` : ""}
          </option>
        ))}
        {suppliers
          .filter((s) => s.shortName && s.name !== s.shortName)
          .map((s) => (
            <option key={`sup-full-${s.id}`} value={s.name}>
              {s.shortName}
            </option>
          ))}
      </datalist>

      <datalist id="bankDataList">
        {bankSuggestions.map((bn) => (
          <option key={bn} value={bn} />
        ))}
      </datalist>

      <datalist id="groupDataList">
        {groupSuggestions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <datalist id="itemDataList">
        {itemSuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      <datalist id="descDataList">
        {descSuggestions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <datalist id="invoiceDataList">
        {invoiceSuggestions.map((inv) => (
          <option key={inv} value={inv} />
        ))}
      </datalist>

      <datalist id="docSupplementDataList">
        {docSupplementSuggestions.map((ds) => (
          <option key={ds} value={ds} />
        ))}
      </datalist>

      <datalist id="requesterDataList">
        {requesterSuggestions.map((rq) => (
          <option key={rq} value={rq} />
        ))}
      </datalist>

      {/* Mobile Cards View */}
      {showMobileCards ? (
        <div className="mobile-cards-container">
          {filteredRequests.map((r) => {
            const isDone = PAID_STATUSES.includes(r.status);
            let stClass = "mb-badge-default";
            if (isDone) stClass = "mb-badge-done";
            else if (r.status && r.status.includes("Đã thanh toán")) stClass = "mb-badge-paid";
            else if (r.status && r.status.includes("chờ")) stClass = "mb-badge-wait";

            const payee = r.payee_name || "Chưa có NCC";
            const grp = paymentGroups.find((g) => String(g.id) === String(r.group_id));
            const docs = (r.documents || []).filter(Boolean);
            const lines = (r.lines || []).filter((l) => l.description || l.amount);

            return (
              <div key={r.id} className={`m-card ${isDone ? "m-card-done" : ""}`}>
                <div className="m-card-header">
                  <div className="m-card-stt">STT {r.legacy_stt || r.id}</div>
                  {isPhoneScreen ? (
                    <span className={`m-badge ${stClass}`}>{r.status}</span>
                  ) : (
                    <select
                      className={`m-badge-select ${stClass}`}
                      value={r.status || "Đã giao KT, chờ đi tiền"}
                      onChange={(e) => handleEditRequest(r.id, "status", e.target.value)}
                      title="Chuyển nhanh trạng thái"
                    >
                      {PAYMENT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div
                  className="m-card-payee"
                  onClick={() => !isPhoneScreen && setEditModalReqId(r.id)}
                  style={{ cursor: !isPhoneScreen ? "pointer" : "default" }}
                  title={!isPhoneScreen ? "Nhấp để chỉnh sửa đề nghị này" : undefined}
                >
                  {payee}
                </div>
                <div className="m-card-amount">
                  {fmtMoney(r.amount)} <small>{r.currency || "VND"}</small>
                </div>
                <div className="m-card-desc">
                  {r.description || r.item_name || "Không có mô tả"}
                </div>

                <div className="m-card-meta">
                  {r.request_date && <div>📅 Ngày: <b>{r.request_date}</b></div>}
                  {grp && <div>📁 Nhóm HĐ: <b>{grp.code}</b></div>}
                  {(r.invoice_no || r.invoice_date) && (
                    <div>
                      🧾 HĐ: <b>{r.invoice_no || "---"}</b>{" "}
                      {r.invoice_date && <span style={{ color: "#64748b" }}>({r.invoice_date})</span>}
                    </div>
                  )}
                  {r.bank && (
                    <div>🏦 {r.bank} - TK: <b>{r.account_no || "---"}</b></div>
                  )}
                </div>

                {docs.length > 0 && (
                  <div className="m-card-docs">
                    {docs.map((d, di) => (
                      <span key={di} className="m-doc-tag">📎 {d}</span>
                    ))}
                  </div>
                )}

                {lines.length > 0 && (
                  <details className="m-card-lines">
                    <summary>Chi tiết {lines.length} hóa đơn / hàng hóa</summary>
                    <div className="m-lines-list">
                      {lines.map((l, li) => (
                        <div key={li} className="m-line-item">
                          <div>{li + 1}. {l.description || "Hàng hóa"}</div>
                          <div>
                            {l.invoice_no && <span style={{ color: "#64748b", marginRight: "6px" }}>HĐ: {l.invoice_no}</span>}
                            <b>{fmtMoney(l.amount)} {r.currency}</b>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Mobile: Chỉ cho xem và có 1 tính năng duy nhất: Đánh dấu đã thanh toán */}
                {isPhoneScreen ? (
                  <div className="m-card-actions">
                    {isDone ? (
                      <button
                        type="button"
                        className="m-btn-mark-paid is-done"
                        onClick={() => handleTogglePaid(r.id, false)}
                        title="Chạm để chuyển lại trạng thái Chưa thanh toán"
                      >
                        <span className="m-btn-icon">✓</span>
                        <span>Đã thanh toán</span>
                        <small>(Chạm để hủy)</small>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="m-btn-mark-paid"
                        onClick={() => handleTogglePaid(r.id, true)}
                        title="Chạm để đánh dấu đề nghị này đã thanh toán xong"
                      >
                        <span className="m-btn-icon">✓</span>
                        <span>Đánh dấu đã thanh toán</span>
                      </button>
                    )}
                  </div>
                ) : (
                  /* Desktop Card Actions: Đầy đủ tính năng sửa, in, hồ sơ, xóa trên máy tính */
                  <div className="m-card-desktop-tools">
                    <button
                      type="button"
                      className="m-btn-edit-card"
                      onClick={() => setEditModalReqId(r.id)}
                      title="Chỉnh sửa chi tiết thông tin đề nghị thanh toán"
                    >
                      ✏️ Sửa chi tiết
                    </button>
                    <button
                      type="button"
                      className={`m-btn-toggle-done ${isDone ? "is-done" : ""}`}
                      onClick={() => handleTogglePaid(r.id, !isDone)}
                      title={isDone ? "Bỏ đánh dấu đã thanh toán" : "Đánh dấu đã thanh toán"}
                    >
                      {isDone ? "✓ Đã TT" : "○ Đánh dấu TT"}
                    </button>
                    <button
                      type="button"
                      className="m-btn-icon-action"
                      onClick={() => handlePrintSingle(r)}
                      title="In phiếu thanh toán này"
                    >
                      ⎙ In
                    </button>
                    <button
                      type="button"
                      className="m-btn-icon-action"
                      onClick={() => setDocModalReqId(r.id)}
                      title="Hồ sơ chứng từ"
                    >
                      📎 Hồ sơ
                    </button>
                    <button
                      type="button"
                      className="m-btn-icon-action btn-danger"
                      onClick={() => handleDeleteRequest(r.id)}
                      title="Xóa đề nghị này"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* On desktop: '+ Thêm đề nghị mới' interactive card */}
          {!isPhoneScreen && (
            <div
              className="m-card m-card-add-new"
              onClick={handleAddNewFromCardView}
              title="Nhấp để thêm đề nghị thanh toán mới ngay tại đây"
            >
              <div className="m-card-add-icon">＋</div>
              <div className="m-card-add-title">Thêm đề nghị thanh toán mới</div>
              <div className="m-card-add-sub">
                Tạo phiếu nhanh chóng và mở form chỉnh sửa thẻ trực quan
              </div>
            </div>
          )}

          {filteredRequests.length === 0 && isPhoneScreen && (
            <div className="m-empty">Không tìm thấy đề nghị thanh toán nào</div>
          )}
        </div>
      ) : (
        /* Desktop Data Table */
        <div className="payment-table-container">
          <div className="payment-table-header">
            <span>DATA · Sửa trực tiếp từng ô (Cho phép co ngắn & xuống dòng · Nhấn Tab/Enter như Excel)</span>
            <span>Chọn STT → chọn dòng · Tự lưu sau khi sửa</span>
          </div>
          <div className="payment-table-scroll">
            <table className="payment-grid">
              <thead>
                <tr>
                  <th style={{ width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={
                        filteredRequests.length > 0 &&
                        filteredRequests.every((r) => checkedIds.has(r.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCheckedIds(new Set(filteredRequests.map((r) => r.id)));
                        } else {
                          setCheckedIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th
                    style={{ width: "55px", textAlign: "center" }}
                    className={freezeCol >= 2 ? "pcol-frozen pcol-rownum" : ""}
                  >
                    A · STT
                  </th>
                  <th
                    style={{ minWidth: "180px" }}
                    className={
                      freezeCol >= 3
                        ? `pcol-frozen ${freezeCol === 3 ? "pcol-frozen-last" : ""}`
                        : ""
                    }
                  >
                    B · NCC
                  </th>
                  <th
                    style={{ minWidth: "150px" }}
                    className={
                      freezeCol >= 4
                        ? `pcol-frozen ${freezeCol === 4 ? "pcol-frozen-last" : ""}`
                        : ""
                    }
                  >
                    C · Nhóm PO
                  </th>
                  <th style={{ minWidth: "230px" }}>D · Nội dung TT</th>
                  <th style={{ minWidth: "180px" }}>E · Hàng hóa/DV</th>
                  <th
                    style={{ minWidth: "120px" }}
                    className={
                      freezeCol >= 7
                        ? `pcol-frozen ${freezeCol === 7 ? "pcol-frozen-last" : ""}`
                        : ""
                    }
                  >
                    F · Số HĐ
                  </th>
                  <th
                    style={{ minWidth: "125px" }}
                    className={
                      freezeCol >= 8
                        ? `pcol-frozen ${freezeCol === 8 ? "pcol-frozen-last" : ""}`
                        : ""
                    }
                  >
                    Ngày HĐ
                  </th>
                  <th style={{ minWidth: "130px", textAlign: "right" }}>G · Số tiền</th>
                  <th style={{ minWidth: "80px" }}>Tiền tệ</th>
                  <th style={{ minWidth: "140px" }}>H · Hồ sơ</th>
                  <th style={{ minWidth: "130px" }}>I · Ngày ĐNTT</th>
                  <th style={{ minWidth: "125px" }}>J · Loại TT</th>
                  <th style={{ minWidth: "160px" }}>K · Trạng thái</th>
                  <th style={{ minWidth: "140px" }}>L · Bổ sung HS</th>
                  <th style={{ minWidth: "170px" }}>M · Địa chỉ</th>
                  <th style={{ minWidth: "130px" }}>N · Số TK</th>
                  <th style={{ minWidth: "160px" }}>O · Ngân hàng</th>
                  <th style={{ minWidth: "110px" }}>Người tạo</th>
                  <th style={{ width: "80px", textAlign: "center" }}>In/Xóa</th>
                </tr>
              </thead>
              <tbody onKeyDown={handleTableKeyDown} onPaste={handlePaymentTablePaste}>
                {filteredRequests.map((r) => {
                  const isChosen = activeRequestId === r.id;
                  const isDone = PAID_STATUSES.includes(r.status);
                  return (
                    <tr
                      key={r.id}
                      className={`${isChosen ? "chosen" : ""} ${isDone ? "row-done" : ""}`}
                      onClick={() => setActiveRequestId(r.id)}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={checkedIds.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(checkedIds);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            setCheckedIds(next);
                          }}
                        />
                      </td>

                      {/* A · STT */}
                      <td
                        style={{ textAlign: "center" }}
                        className={freezeCol >= 2 ? "pcol-frozen pcol-rownum" : ""}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveRequestId(r.id)}
                          title="Bấm để kích hoạt dòng và xem các hóa đơn chi tiết bên dưới"
                        >
                          {r.legacy_stt || r.id}
                        </button>
                      </td>

                      {/* B · NCC */}
                      <td
                        className={
                          freezeCol >= 3
                            ? `pcol-frozen ${freezeCol === 3 ? "pcol-frozen-last" : ""}`
                            : ""
                        }
                      >
                        <input
                          className="cell-editor"
                          list="nccDataList"
                          value={r.payee_name || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "payee_name", e.target.value)
                          }
                          placeholder="Chọn hoặc nhập NCC..."
                        />
                      </td>

                      {/* C · Nhóm PO */}
                      <td
                        className={
                          freezeCol >= 4
                            ? `pcol-frozen ${freezeCol === 4 ? "pcol-frozen-last" : ""}`
                            : ""
                        }
                      >
                        <input
                          className="cell-editor"
                          list="groupDataList"
                          value={r.group_code || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "group_code", e.target.value)
                          }
                          placeholder="Mã nhóm / PO..."
                        />
                      </td>

                      {/* D · Nội dung TT */}
                      <td>
                        <input
                          className="cell-editor"
                          list="descDataList"
                          value={r.description || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "description", e.target.value)
                          }
                          placeholder="Nội dung chuyển tiền..."
                        />
                      </td>

                      {/* E · Hàng hóa/DV */}
                      <td>
                        <input
                          className="cell-editor"
                          list="itemDataList"
                          value={r.item_name || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "item_name", e.target.value)
                          }
                          placeholder="Tên hàng hóa / dịch vụ..."
                        />
                      </td>

                      {/* F · Số HĐ */}
                      <td
                        className={
                          freezeCol >= 7
                            ? `pcol-frozen ${freezeCol === 7 ? "pcol-frozen-last" : ""}`
                            : ""
                        }
                      >
                        <input
                          className="cell-editor"
                          list="invoiceDataList"
                          value={r.invoice_no || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "invoice_no", e.target.value)
                          }
                          placeholder="Số HĐ..."
                        />
                      </td>

                      {/* Ngày HĐ */}
                      <td
                        className={
                          freezeCol >= 8
                            ? `pcol-frozen ${freezeCol === 8 ? "pcol-frozen-last" : ""}`
                            : ""
                        }
                      >
                        <div className="cell-date-wrap">
                          <input
                            className="cell-editor"
                            value={r.invoice_date || ""}
                            placeholder="dd/mm/yyyy"
                            onChange={(e) =>
                              handleEditRequest(r.id, "invoice_date", e.target.value)
                            }
                            onBlur={(e) => {
                              const parsed = parseFlexibleDate(e.target.value);
                              if (parsed !== e.target.value) {
                                handleEditRequest(r.id, "invoice_date", parsed);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="cell-date-btn"
                            title="Chọn ngày từ lịch"
                            onClick={() =>
                              openCalendar(r.invoice_date || "", (val) =>
                                handleEditRequest(r.id, "invoice_date", val)
                              )
                            }
                          >
                            📅
                          </button>
                        </div>
                      </td>

                      {/* G · Số tiền */}
                      <td style={{ textAlign: "right" }}>
                        <input
                          className="cell-editor"
                          style={{ textAlign: "right", fontWeight: 600 }}
                          value={fmtMoney(r.amount)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, "");
                            handleEditRequest(r.id, "amount", raw);
                          }}
                        />
                      </td>

                      {/* Tiền tệ */}
                      <td>
                        <select
                          className="cell-editor"
                          value={r.currency || "VND"}
                          onChange={(e) =>
                            handleEditRequest(r.id, "currency", e.target.value)
                          }
                        >
                          <option value="VND">VND</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </td>

                      {/* H · Hồ sơ */}
                      <td>
                        <button
                          type="button"
                          className="doc-pill-btn"
                          onClick={() => setDocModalReqId(r.id)}
                          title={(r.documents || []).join(", ") || "Chọn hồ sơ..."}
                        >
                          📎 {(r.documents || []).length} hồ sơ ▾
                        </button>
                      </td>

                      {/* I · Ngày ĐNTT */}
                      <td>
                        <div className="cell-date-wrap">
                          <input
                            className="cell-editor"
                            value={r.request_date || ""}
                            placeholder="dd/mm/yyyy"
                            onChange={(e) =>
                              handleEditRequest(r.id, "request_date", e.target.value)
                            }
                            onBlur={(e) => {
                              const parsed = parseFlexibleDate(e.target.value);
                              if (parsed !== e.target.value) {
                                handleEditRequest(r.id, "request_date", parsed);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="cell-date-btn"
                            title="Chọn ngày từ lịch"
                            onClick={() =>
                              openCalendar(r.request_date || "", (val) =>
                                handleEditRequest(r.id, "request_date", val)
                              )
                            }
                          >
                            📅
                          </button>
                        </div>
                      </td>

                      {/* J · Loại TT */}
                      <td>
                        <select
                          className="cell-editor"
                          value={r.payment_type || "TT trước 100%"}
                          onChange={(e) =>
                            handleEditRequest(r.id, "payment_type", e.target.value)
                          }
                        >
                          {PAYMENT_TYPES.map((pt) => (
                            <option key={pt} value={pt}>
                              {pt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* K · Trạng thái */}
                      <td>
                        <select
                          className="cell-editor"
                          value={r.status || "Đã giao KT, chờ đi tiền"}
                          onChange={(e) =>
                            handleEditRequest(r.id, "status", e.target.value)
                          }
                        >
                          {PAYMENT_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* L · Bổ sung HS */}
                      <td>
                        <input
                          className="cell-editor"
                          list="docSupplementDataList"
                          value={r.doc_supplement || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "doc_supplement", e.target.value)
                          }
                          placeholder="Ghi chú hồ sơ..."
                        />
                      </td>

                      {/* M · Địa chỉ */}
                      <td>
                        <input
                          className="cell-editor"
                          value={r.address || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "address", e.target.value)
                          }
                          placeholder="Địa chỉ NCC..."
                        />
                      </td>

                      {/* N · Số TK */}
                      <td>
                        <input
                          className="cell-editor"
                          value={r.account_no || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "account_no", e.target.value)
                          }
                          placeholder="Số tài khoản..."
                        />
                      </td>

                      {/* O · Ngân hàng */}
                      <td>
                        <input
                          className="cell-editor"
                          list="bankDataList"
                          value={r.bank || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "bank", e.target.value)
                          }
                          placeholder="Ngân hàng..."
                        />
                      </td>

                      {/* Người tạo */}
                      <td>
                        <input
                          className="cell-editor"
                          list="requesterDataList"
                          value={r.created_by_name || ""}
                          onChange={(e) =>
                            handleEditRequest(r.id, "created_by_name", e.target.value)
                          }
                          placeholder="Người tạo..."
                        />
                      </td>

                      {/* In / Xóa row */}
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="payment-btn"
                          style={{ padding: "2px 6px", fontSize: "11px", marginRight: "3px" }}
                          title="In phiếu này"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintSingle(r);
                          }}
                        >
                          ⎙
                        </button>
                        <button
                          type="button"
                          className="payment-btn btn-danger"
                          style={{ padding: "2px 6px", fontSize: "11px" }}
                          title="Xóa đề nghị này"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRequest(r.id);
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan={20} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                      Không tìm thấy đề nghị thanh toán nào phù hợp
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Lines Box for Active Request (Desktop only - Mobile is strictly view-only) */}
      {!showMobileCards && activeReq && (
        <details className="payment-detail-box" open>
          <summary>
            Chi tiết nhiều hóa đơn / hàng hóa của dòng đang chọn (STT: {activeReq.legacy_stt || activeReq.id} - {activeReq.payee_name || "Chưa có tên"})
          </summary>
          <p style={{ margin: "4px 0 10px", fontSize: "12px", color: "#64748b" }}>
            Chọn STT trong bảng rồi chỉnh sửa các dòng chi tiết tại đây (Tên hàng hóa, Số hóa đơn, Ngày hóa đơn, Số tiền). Dòng đầu tiên sẽ tự động đồng bộ lên bảng DATA.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 115px 140px 140px 36px",
                gap: "8px",
                fontSize: "11.5px",
                fontWeight: 600,
                color: "#475569",
              }}
            >
              <div>Tên hàng hóa / dịch vụ</div>
              <div>Số hóa đơn</div>
              <div>Ngày hóa đơn</div>
              <div style={{ textAlign: "right" }}>Số tiền</div>
              <div></div>
            </div>

            {(activeReq.lines || []).map((line, lIdx) => (
              <div
                key={lIdx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 115px 140px 140px 36px",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <input
                  list="itemDataList"
                  style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px" }}
                  value={line.description || ""}
                  placeholder="Tên hàng hóa..."
                  onChange={(e) => {
                    const lines = [...(activeReq.lines || [])];
                    lines[lIdx] = { ...lines[lIdx], description: e.target.value };
                    handleEditRequest(activeReq.id, "lines", lines);
                    if (lIdx === 0) handleEditRequest(activeReq.id, "item_name", e.target.value);
                  }}
                />
                <input
                  list="invoiceDataList"
                  style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px" }}
                  value={line.invoice_no || ""}
                  placeholder="Số HĐ..."
                  onChange={(e) => {
                    const lines = [...(activeReq.lines || [])];
                    lines[lIdx] = { ...lines[lIdx], invoice_no: e.target.value };
                    handleEditRequest(activeReq.id, "lines", lines);
                    if (lIdx === 0) handleEditRequest(activeReq.id, "invoice_no", e.target.value);
                  }}
                />
                <div className="cell-date-wrap">
                  <input
                    style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px" }}
                    value={line.invoice_date || ""}
                    placeholder="dd/mm/yyyy"
                    onChange={(e) => {
                      const lines = [...(activeReq.lines || [])];
                      lines[lIdx] = { ...lines[lIdx], invoice_date: e.target.value };
                      handleEditRequest(activeReq.id, "lines", lines);
                    }}
                    onBlur={(e) => {
                      const parsed = parseFlexibleDate(e.target.value);
                      if (parsed !== e.target.value) {
                        const lines = [...(activeReq.lines || [])];
                        lines[lIdx] = { ...lines[lIdx], invoice_date: parsed };
                        handleEditRequest(activeReq.id, "lines", lines);
                        if (lIdx === 0) handleEditRequest(activeReq.id, "invoice_date", parsed);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="cell-date-btn"
                    title="Chọn ngày"
                    onClick={() =>
                      openCalendar(line.invoice_date || "", (val) => {
                        const lines = [...(activeReq.lines || [])];
                        lines[lIdx] = { ...lines[lIdx], invoice_date: val };
                        handleEditRequest(activeReq.id, "lines", lines);
                        if (lIdx === 0) handleEditRequest(activeReq.id, "invoice_date", val);
                      })
                    }
                  >
                    📅
                  </button>
                </div>
                <input
                  style={{
                    padding: "6px 8px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "5px",
                    fontSize: "12px",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                  value={fmtMoney(line.amount)}
                  placeholder="0"
                  onChange={(e) => {
                    const raw = Number(e.target.value.replace(/,/g, "")) || 0;
                    const lines = [...(activeReq.lines || [])];
                    lines[lIdx] = { ...lines[lIdx], amount: raw };
                    const totalAmt = lines.reduce(
                      (sum, it) => sum + (Number(it.amount) || 0),
                      0
                    );
                    handleEditRequest(activeReq.id, "lines", lines);
                    handleEditRequest(activeReq.id, "amount", totalAmt);
                  }}
                />
                <button
                  type="button"
                  className="payment-btn btn-danger"
                  style={{ padding: "4px 8px" }}
                  onClick={() => {
                    const lines = (activeReq.lines || []).filter(
                      (_, idx) => idx !== lIdx
                    );
                    handleEditRequest(activeReq.id, "lines", lines);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              className="payment-btn"
              style={{ alignSelf: "flex-start", marginTop: "4px" }}
              onClick={() => {
                const lines = [
                  ...(activeReq.lines || []),
                  { description: "", invoice_no: "", invoice_date: "", amount: 0 },
                ];
                handleEditRequest(activeReq.id, "lines", lines);
              }}
            >
              ＋ Thêm dòng hàng hóa
            </button>
          </div>
        </details>
      )}

      {/* MODAL 0: Edit Payment Request in Card View (Desktop Full Feature) */}
      {editModalReqId !== null && (() => {
        const editReq = paymentRequests.find((r) => r.id === editModalReqId);
        if (!editReq) return null;
        const attachedDocs = new Set(editReq.documents || []);

        return (
          <div className="payment-modal-overlay" onClick={() => setEditModalReqId(null)}>
            <div
              className="payment-modal-card card-edit-modal"
              style={{ maxWidth: "860px", width: "95vw" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="payment-modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px" }}>✏️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a" }}>
                      Chỉnh sửa Đề nghị thanh toán — STT {editReq.legacy_stt || editReq.id}
                    </h3>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      Dữ liệu tự động lưu khi chỉnh sửa · Nhấn Đóng hoặc Hoàn tất khi xong
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditModalReqId(null)}
                  style={{ fontSize: "20px", cursor: "pointer", border: "none", background: "transparent" }}
                >
                  ✕
                </button>
              </div>

              <div className="card-edit-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "72vh", overflowY: "auto", paddingRight: "4px" }}>
                {/* Section 1: Nhà cung cấp & Thụ hưởng */}
                <div className="card-edit-section">
                  <div className="card-edit-sec-title">🏢 THÔNG TIN NHÀ CUNG CẤP & THỤ HƯỞNG</div>
                  <div className="card-edit-grid-2">
                    <div className="card-edit-field">
                      <label>Nhà cung cấp (Gõ để tìm hoặc chọn NCC):</label>
                      <input
                        list="nccDataList"
                        value={editReq.payee_name || ""}
                        onChange={(e) => handleEditRequest(editReq.id, "payee_name", e.target.value)}
                        placeholder="Chọn hoặc nhập tên NCC..."
                        className="card-edit-input"
                      />
                    </div>
                    <div className="card-edit-field">
                      <label>Địa chỉ NCC:</label>
                      <input
                        value={editReq.address || ""}
                        onChange={(e) => handleEditRequest(editReq.id, "address", e.target.value)}
                        placeholder="Địa chỉ nhà cung cấp..."
                        className="card-edit-input"
                      />
                    </div>
                    <div className="card-edit-field">
                      <label>Số tài khoản ngân hàng:</label>
                      <input
                        value={editReq.account_no || ""}
                        onChange={(e) => handleEditRequest(editReq.id, "account_no", e.target.value)}
                        placeholder="Số tài khoản..."
                        className="card-edit-input"
                      />
                    </div>
                    <div className="card-edit-field">
                      <label>Ngân hàng:</label>
                      <input
                        list="bankDataList"
                        value={editReq.bank || ""}
                        onChange={(e) => handleEditRequest(editReq.id, "bank", e.target.value)}
                        placeholder="Chọn hoặc nhập ngân hàng..."
                        className="card-edit-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Nội dung & Điều kiện thanh toán */}
                <div className="card-edit-section">
                  <div className="card-edit-sec-title">📝 NỘI DUNG & ĐIỀU KIỆN THANH TOÁN</div>
                  <div className="card-edit-grid-2">
                    <div className="card-edit-field" style={{ gridColumn: "span 2" }}>
                      <label>Nội dung thanh toán:</label>
                      <textarea
                        rows={2}
                        value={editReq.description || ""}
                        onChange={(e) => handleEditRequest(editReq.id, "description", e.target.value)}
                        placeholder="Mô tả nội dung đề nghị thanh toán..."
                        className="card-edit-input"
                      />
                    </div>
                    <div className="card-edit-field">
                      <label>Nhóm HĐ / Mã PO:</label>
                      <input
                        list="groupDataList"
                        value={editReq.group_code || (paymentGroups.find((g) => g.id === editReq.group_id)?.code || "")}
                        onChange={(e) => handleEditRequest(editReq.id, "group_code", e.target.value)}
                        placeholder="Chọn hoặc nhập mã PO / Nhóm..."
                        className="card-edit-input"
                      />
                    </div>
                    <div className="card-edit-field">
                      <label>Người đề nghị:</label>
                      <input
                        list="requesterDataList"
                        value={editReq.created_by_name || ""}
                        onChange={(e) => handleEditRequest(editReq.id, "created_by_name", e.target.value)}
                        placeholder="Họ tên người đề nghị..."
                        className="card-edit-input"
                      />
                    </div>
                    <div className="card-edit-field">
                      <label>Ngày đề nghị:</label>
                      <div className="cell-date-wrap">
                        <input
                          value={editReq.request_date || ""}
                          placeholder="dd/mm/yyyy"
                          onChange={(e) => handleEditRequest(editReq.id, "request_date", e.target.value)}
                          onBlur={(e) => {
                            const parsed = parseFlexibleDate(e.target.value);
                            if (parsed !== e.target.value) {
                              handleEditRequest(editReq.id, "request_date", parsed);
                            }
                          }}
                          className="card-edit-input"
                        />
                        <button
                          type="button"
                          className="cell-date-btn"
                          title="Chọn ngày"
                          onClick={() =>
                            openCalendar(editReq.request_date || "", (val) =>
                              handleEditRequest(editReq.id, "request_date", val)
                            )
                          }
                        >
                          📅
                        </button>
                      </div>
                    </div>
                    <div className="card-edit-field">
                      <label>Thời hạn chuyển tiền:</label>
                      <div className="cell-date-wrap">
                        <input
                          value={editReq.due_date || ""}
                          placeholder="dd/mm/yyyy"
                          onChange={(e) => handleEditRequest(editReq.id, "due_date", e.target.value)}
                          onBlur={(e) => {
                            const parsed = parseFlexibleDate(e.target.value);
                            if (parsed !== e.target.value) {
                              handleEditRequest(editReq.id, "due_date", parsed);
                            }
                          }}
                          className="card-edit-input"
                        />
                        <button
                          type="button"
                          className="cell-date-btn"
                          title="Chọn ngày"
                          onClick={() =>
                            openCalendar(editReq.due_date || "", (val) =>
                              handleEditRequest(editReq.id, "due_date", val)
                            )
                          }
                        >
                          📅
                        </button>
                      </div>
                    </div>
                    <div className="card-edit-field">
                      <label>Hình thức thanh toán:</label>
                      <select
                        value={editReq.payment_type || "TT trước 100%"}
                        onChange={(e) => handleEditRequest(editReq.id, "payment_type", e.target.value)}
                        className="card-edit-input"
                      >
                        {PAYMENT_TYPES.map((pt) => (
                          <option key={pt} value={pt}>
                            {pt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="card-edit-field">
                      <label>Trạng thái giải ngân:</label>
                      <select
                        value={editReq.status || "Đã giao KT, chờ đi tiền"}
                        onChange={(e) => handleEditRequest(editReq.id, "status", e.target.value)}
                        className="card-edit-input"
                      >
                        {PAYMENT_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="card-edit-field">
                      <label>Tổng số tiền:</label>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <input
                          value={fmtMoney(editReq.amount)}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, "");
                            handleEditRequest(editReq.id, "amount", raw);
                          }}
                          className="card-edit-input"
                          style={{ fontWeight: 700, color: "#0d9488", textAlign: "right" }}
                        />
                        <select
                          value={editReq.currency || "VND"}
                          onChange={(e) => handleEditRequest(editReq.id, "currency", e.target.value)}
                          className="card-edit-input"
                          style={{ width: "90px" }}
                        >
                          <option value="VND">VND</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                    </div>
                    <div className="card-edit-field">
                      <label>Bổ sung hồ sơ / Ghi chú chứng từ:</label>
                      <input
                        list="docSupplementDataList"
                        value={editReq.doc_supplement || ""}
                        onChange={(e) => handleEditRequest(editReq.id, "doc_supplement", e.target.value)}
                        placeholder="Ghi chú hồ sơ còn thiếu..."
                        className="card-edit-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Danh mục chi tiết các dòng hóa đơn / hàng hóa */}
                <div className="card-edit-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div className="card-edit-sec-title" style={{ margin: 0 }}>
                      📦 CHI TIẾT DANH MỤC HÓA ĐƠN / HÀNG HÓA ({editReq.lines?.length || 0} dòng)
                    </div>
                    <button
                      type="button"
                      className="payment-btn btn-primary"
                      style={{ padding: "4px 10px", fontSize: "12px" }}
                      onClick={() => {
                        const lines = [
                          ...(editReq.lines || []),
                          { description: "", invoice_no: "", invoice_date: "", amount: 0 },
                        ];
                        handleEditRequest(editReq.id, "lines", lines);
                      }}
                    >
                      ＋ Thêm dòng hàng hóa
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.5fr 115px 140px 140px 36px",
                        gap: "8px",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "#475569",
                        padding: "0 2px",
                      }}
                    >
                      <div>Tên hàng hóa / dịch vụ</div>
                      <div>Số hóa đơn</div>
                      <div>Ngày hóa đơn</div>
                      <div style={{ textAlign: "right" }}>Số tiền</div>
                      <div></div>
                    </div>

                    {(editReq.lines || []).map((line, lIdx) => (
                      <div
                        key={lIdx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 115px 140px 140px 36px",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          list="itemDataList"
                          className="card-edit-input"
                          value={line.description || ""}
                          placeholder="Tên hàng hóa..."
                          onChange={(e) => {
                            const lines = [...(editReq.lines || [])];
                            lines[lIdx] = { ...lines[lIdx], description: e.target.value };
                            handleEditRequest(editReq.id, "lines", lines);
                            if (lIdx === 0) handleEditRequest(editReq.id, "item_name", e.target.value);
                          }}
                        />
                        <input
                          list="invoiceDataList"
                          className="card-edit-input"
                          value={line.invoice_no || ""}
                          placeholder="Số HĐ..."
                          onChange={(e) => {
                            const lines = [...(editReq.lines || [])];
                            lines[lIdx] = { ...lines[lIdx], invoice_no: e.target.value };
                            handleEditRequest(editReq.id, "lines", lines);
                            if (lIdx === 0) handleEditRequest(editReq.id, "invoice_no", e.target.value);
                          }}
                        />
                        <div className="cell-date-wrap">
                          <input
                            className="card-edit-input"
                            value={line.invoice_date || ""}
                            placeholder="dd/mm/yyyy"
                            onChange={(e) => {
                              const lines = [...(editReq.lines || [])];
                              lines[lIdx] = { ...lines[lIdx], invoice_date: e.target.value };
                              handleEditRequest(editReq.id, "lines", lines);
                            }}
                            onBlur={(e) => {
                              const parsed = parseFlexibleDate(e.target.value);
                              if (parsed !== e.target.value) {
                                const lines = [...(editReq.lines || [])];
                                lines[lIdx] = { ...lines[lIdx], invoice_date: parsed };
                                handleEditRequest(editReq.id, "lines", lines);
                                if (lIdx === 0) handleEditRequest(editReq.id, "invoice_date", parsed);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="cell-date-btn"
                            title="Chọn ngày"
                            onClick={() =>
                              openCalendar(line.invoice_date || "", (val) => {
                                const lines = [...(editReq.lines || [])];
                                lines[lIdx] = { ...lines[lIdx], invoice_date: val };
                                handleEditRequest(editReq.id, "lines", lines);
                                if (lIdx === 0) handleEditRequest(editReq.id, "invoice_date", val);
                              })
                            }
                          >
                            📅
                          </button>
                        </div>
                        <input
                          className="card-edit-input"
                          style={{ textAlign: "right", fontWeight: 600 }}
                          value={fmtMoney(line.amount)}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = Number(e.target.value.replace(/,/g, "")) || 0;
                            const lines = [...(editReq.lines || [])];
                            lines[lIdx] = { ...lines[lIdx], amount: raw };
                            const totalAmt = lines.reduce(
                              (sum, it) => sum + (Number(it.amount) || 0),
                              0
                            );
                            handleEditRequest(editReq.id, "lines", lines);
                            handleEditRequest(editReq.id, "amount", totalAmt);
                          }}
                        />
                        <button
                          type="button"
                          className="payment-btn btn-danger"
                          style={{ padding: "4px 8px" }}
                          title="Xóa dòng hàng này"
                          onClick={() => {
                            const lines = (editReq.lines || []).filter((_, idx) => idx !== lIdx);
                            const totalAmt = lines.reduce(
                              (sum, it) => sum + (Number(it.amount) || 0),
                              0
                            );
                            handleEditRequest(editReq.id, "lines", lines);
                            if (lines.length > 0) handleEditRequest(editReq.id, "amount", totalAmt);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {(editReq.lines || []).length === 0 && (
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                        Chưa có dòng hàng hóa phân tách. Bấm &quot;＋ Thêm dòng hàng hóa&quot; để bổ sung chi tiết.
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 4: Hồ sơ chứng từ đi kèm */}
                <div className="card-edit-section">
                  <div className="card-edit-sec-title">📎 HỒ SƠ / CHỨNG TỪ ĐI KÈM</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {customDocTypes.map((doc) => {
                      const isChecked = attachedDocs.has(doc);
                      return (
                        <label
                          key={doc}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: `1px solid ${isChecked ? "#3b82f6" : "#cbd5e1"}`,
                            background: isChecked ? "#eff6ff" : "#ffffff",
                            color: isChecked ? "#1d4ed8" : "#334155",
                            cursor: "pointer",
                            fontSize: "12.5px",
                            fontWeight: isChecked ? 600 : 400,
                            userSelect: "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const nextDocs = new Set(attachedDocs);
                              if (e.target.checked) nextDocs.add(doc);
                              else nextDocs.delete(doc);
                              handleEditRequest(editReq.id, "documents", Array.from(nextDocs));
                            }}
                          />
                          <span>{doc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: "12px",
                  marginTop: "8px",
                }}
              >
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="payment-btn"
                    onClick={() => handlePrintSingle(editReq)}
                    title="In phiếu thanh toán này"
                  >
                    ⎙ In phiếu
                  </button>
                  <button
                    type="button"
                    className="payment-btn btn-danger"
                    onClick={() => handleDeleteRequest(editReq.id)}
                    title="Xóa đề nghị thanh toán này"
                  >
                    🗑️ Xóa đề nghị
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="payment-btn"
                    onClick={() => setEditModalReqId(null)}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    className="payment-btn btn-primary"
                    onClick={() => setEditModalReqId(null)}
                  >
                    ✓ Hoàn tất
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 1: Document Attachment */}
      {docModalReqId !== null && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "540px" }}>
            <div className="payment-modal-header">
              <h3>📎 Hồ sơ / chứng từ đi kèm đề nghị</h3>
              <button type="button" onClick={() => setDocModalReqId(null)}>✕</button>
            </div>

            {(() => {
              const req = paymentRequests.find((r) => r.id === docModalReqId);
              if (!req) return null;
              const attached = new Set(req.documents || []);

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontSize: "13px", color: "#64748b" }}>
                    Phiếu STT: <b>{req.legacy_stt || req.id}</b> - {req.payee_name || "Chưa có tên"}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: "8px",
                      maxHeight: "300px",
                      overflowY: "auto",
                      padding: "4px",
                    }}
                  >
                    {customDocTypes.map((doc) => {
                      const isChecked = attached.has(doc);
                      return (
                        <label
                          key={doc}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            border: `1px solid ${isChecked ? "#bfdbfe" : "#e2e8f0"}`,
                            background: isChecked ? "#eff6ff" : "#ffffff",
                            cursor: "pointer",
                            fontSize: "12px",
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const nextDocs = new Set(attached);
                              if (e.target.checked) nextDocs.add(doc);
                              else nextDocs.delete(doc);
                              handleEditRequest(req.id, "documents", Array.from(nextDocs));
                            }}
                          />
                          <span>{doc}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Add custom document input */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      style={{ flex: 1, padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px" }}
                      placeholder="Nhập tên loại chứng từ khác..."
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newDocName.trim()) {
                          e.preventDefault();
                          const val = newDocName.trim();
                          if (!customDocTypes.includes(val)) {
                            setCustomDocTypes([...customDocTypes, val]);
                          }
                          const nextDocs = new Set(attached);
                          nextDocs.add(val);
                          handleEditRequest(req.id, "documents", Array.from(nextDocs));
                          setNewDocName("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="payment-btn"
                      onClick={() => {
                        if (newDocName.trim()) {
                          const val = newDocName.trim();
                          if (!customDocTypes.includes(val)) {
                            setCustomDocTypes([...customDocTypes, val]);
                          }
                          const nextDocs = new Set(attached);
                          nextDocs.add(val);
                          handleEditRequest(req.id, "documents", Array.from(nextDocs));
                          setNewDocName("");
                        }
                      }}
                    >
                      ＋ Thêm hồ sơ
                    </button>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      Đã chọn: <b>{attached.size}</b> hồ sơ
                    </span>
                    <button
                      type="button"
                      className="payment-btn btn-primary"
                      onClick={() => setDocModalReqId(null)}
                    >
                      Hoàn tất
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 2: PO Picker Modal */}
      {showPOPickerModal && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "680px" }}>
            <div className="payment-modal-header">
              <h3>⚡ Chọn Đơn mua hàng (PO) để lập Đề nghị thanh toán</h3>
              <button type="button" onClick={() => setShowPOPickerModal(false)}>✕</button>
            </div>

            <div style={{ fontSize: "12.5px", color: "#64748b" }}>
              Hệ thống tự động điền Nhà cung cấp, số tiền, danh sách hàng hóa và tạo nhóm giải ngân theo mã PO.
            </div>

            <input
              placeholder="Tìm theo số PO hoặc tên nhà cung cấp..."
              value={poSearch}
              onChange={(e) => setPoSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
            />

            <div style={{ maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {pos
                .filter((p) => {
                  if (!poSearch) return true;
                  const s = suppliers.find((x) => x.id === p.supplierId);
                  const q = normName(poSearch);
                  return (
                    normName(p.number).includes(q) ||
                    (s && normName(s.name).includes(q))
                  );
                })
                .map((po) => {
                  const s = suppliers.find((x) => x.id === po.supplierId);
                  const total = po.items.reduce(
                    (sum, it) => sum + it.qty * it.price,
                    0
                  );
                  return (
                    <div
                      key={po.id}
                      style={{
                        padding: "10px 14px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#f8fafc",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: "#0284c7" }}>PO #{po.number}</div>
                        <div style={{ fontSize: "13px", color: "#1e293b" }}>{s?.name || "Chưa rõ NCC"}</div>
                        <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                          Ngày: {po.date} · {po.items.length} mặt hàng
                        </div>
                      </div>
                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                        <div style={{ fontWeight: 700, color: "#166534", fontSize: "14px" }}>
                          {fmtMoney(total)} ₫
                        </div>
                        <button
                          type="button"
                          className="payment-btn btn-primary"
                          onClick={() => handleCreateFromPO(po)}
                        >
                          Lập đề nghị
                        </button>
                      </div>
                    </div>
                  );
                })}
              {pos.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                  Chưa có đơn hàng PO nào được tạo trong hệ thống mua hàng.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PORTAL PRINT CONTAINER - Completely isolated from app */}
      {typeof document !== "undefined" && isPrinting && createPortal(
        <div id="paymentPrintPortal">
          {printEntriesList.map((req) => {
            const tpl = paymentTemplate;
            const dateParts = parsePrintDate(req.request_date);
            const cur = String(req.currency || "VND").toUpperCase();
            const words = moneyWords({ amount: req.amount, currency: cur });
            const lines = (req.lines && req.lines.length > 0) ? req.lines : [
              { description: req.item_name || req.description || "", invoice_no: req.invoice_no || "", invoice_date: req.invoice_date || "", amount: req.amount },
            ];

            const pNameNorm = (req.payee_name || "").trim().toLowerCase();
            const matchedSupplier = suppliers?.find(
              (s) =>
                (s.shortName && s.shortName.trim().toLowerCase() === pNameNorm) ||
                (s.name && s.name.trim().toLowerCase() === pNameNorm) ||
                (s.code && s.code.trim().toLowerCase() === pNameNorm) ||
                (req.beneficiary_id && s.id === req.beneficiary_id)
            );
            const fullPayeeName = matchedSupplier?.name || req.payee_name || "";
            const payeeAddress = req.address || matchedSupplier?.address || "";
            const payeeAccount = req.account_no || matchedSupplier?.bankAccount || "";
            const payeeBank = req.bank || matchedSupplier?.bank || "";

            return (
              <div key={req.id} className="paper" style={{ breakAfter: "page", pageBreakAfter: "always" }}>
                <div className="upper">{tpl.company_name}</div>
                <div className="model">{tpl.form_code}</div>
                <h1>{tpl.form_title}</h1>
                <div className="recipients">
                  <strong>{tpl.recipient_label}</strong>
                  <div style={{ whiteSpace: "pre-line" }}>{tpl.recipients}</div>
                </div>

                <div className="person">
                  <div>- {tpl.label_requester}</div>
                  <div><b>{req.created_by_name || tpl.default_requester_name}</b></div>
                  <div>- {tpl.label_department}</div>
                  <div><b>{tpl.department_name}</b></div>
                </div>

                <div className="intro">- {tpl.intro_text}</div>

                <div className="details">
                  <div>+ {tpl.label_payee}</div>
                  <div className="val"><b>{fullPayeeName}</b></div>
                  <div>+ {tpl.label_address}</div>
                  <div className="val">{payeeAddress}</div>
                  <div>+ {tpl.label_account}</div>
                  <div className="val"><b>{payeeAccount}</b></div>
                  <div>+ {tpl.label_bank}</div>
                  <div className="val"><b>{payeeBank}</b></div>
                  <div>+ {tpl.label_description}</div>
                  <div className="val">{req.description || ""}</div>
                </div>

                <div className="person transfer">
                  <div>- {tpl.deadline_label}</div>
                  <div><b>{tpl.deadline_val}</b></div>
                </div>

                <div className="moneytitle">- {tpl.table_title}</div>

                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}>{tpl.col_stt}</th>
                      <th style={{ width: "170px" }}>{tpl.col_invoice}</th>
                      <th>{tpl.col_item}</th>
                      <th style={{ width: "135px" }}>{tpl.col_amount}</th>
                      <th style={{ width: "90px" }}>{tpl.col_note}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, li) => (
                      <tr key={li}>
                        <td>{li + 1}</td>
                        <td style={{ textAlign: "center", wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal", padding: "6px 6px" }}>
                          {l.invoice_no ? `${l.invoice_no}${l.invoice_date ? " (" + l.invoice_date + ")" : ""}` : ""}
                        </td>
                        <td style={{ textAlign: "left", paddingLeft: "8px", paddingRight: "8px", wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal", padding: "6px 8px" }}>
                          {l.description}
                        </td>
                        <td style={{ textAlign: "right", paddingRight: "8px", whiteSpace: "nowrap" }}>{fmtMoney(l.amount)}</td>
                        <td style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{l.note || ""}</td>
                      </tr>
                    ))}
                    <tr className="sum">
                      <td colSpan={3} style={{ textAlign: "center", fontWeight: "bold" }}>{tpl.col_total}</td>
                      <td style={{ textAlign: "right", paddingRight: "8px", fontWeight: "bold", whiteSpace: "nowrap" }}>{fmtMoney(req.amount)}</td>
                      <td>{cur}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="words">
                  <div>- {tpl.label_money_words}</div>
                  <div>{words}</div>
                </div>

                <div className="doclabel">- {tpl.label_docs}:</div>
                <div className="docs">{(req.documents || []).join(", ") || "Không có"}</div>

                <div className="date">
                  {tpl.date_location}, ngày {dateParts ? dateParts.d : "...."} tháng {dateParts ? dateParts.m : "...."} năm {dateParts ? dateParts.y : "2026"}
                </div>

                <div className="sign">
                  <div>{tpl.sign1_title}<span>{tpl.sign1_name}</span></div>
                  <div>{tpl.sign2_title}<span>{tpl.sign2_name}</span></div>
                  <div>{tpl.sign3_title}<span>{tpl.sign3_name}</span></div>
                  <div>{tpl.sign4_title}<span>{req.created_by_name || tpl.default_requester_name}</span></div>
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </section>
  );
}
