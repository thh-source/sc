"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  PO,
  Supplier,
  PaymentRequestEntry,
  PaymentGroup,
  PaymentBeneficiary,
  PaymentHandoverItem,
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
  parseExcelText,
} from "../payment-utils";
import "../payment.css";

const PHENIKAA_LOGO_SRC = "/phenikaa-pharma-logo.png";

const BANK_SUGGESTIONS = [
  "Vietcombank",
  "Techcombank",
  "BIDV",
  "Vietinbank",
  "MB Bank",
  "VPBank",
  "ACB",
  "Sacombank",
  "HDBank",
  "TPBank",
  "Agribank",
  "VIB",
  "SHB",
  "Eximbank",
  "MSB",
  "SeABank",
  "OCB",
  "Bac A Bank",
];

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

export interface PaymentManagementProps {
  paymentRequests?: PaymentRequestEntry[];
  paymentGroups?: PaymentGroup[];
  paymentBeneficiaries?: PaymentBeneficiary[];
  paymentHandovers?: PaymentHandoverItem[];
  paymentTemplate?: PaymentPrintTemplate;
  pos?: PO[];
  suppliers?: Supplier[];
  onUpdateState: (patch: {
    paymentRequests?: PaymentRequestEntry[];
    paymentGroups?: PaymentGroup[];
    paymentBeneficiaries?: PaymentBeneficiary[];
    paymentHandovers?: PaymentHandoverItem[];
    paymentTemplate?: PaymentPrintTemplate;
  }) => void;
  readOnly?: boolean;
}

export function PaymentManagement({
  paymentRequests = [],
  paymentGroups = [],
  paymentBeneficiaries = [],
  paymentHandovers = [],
  paymentTemplate = DEFAULT_PAYMENT_TEMPLATE,
  pos = [],
  suppliers = [],
  onUpdateState,
  readOnly = false,
}: PaymentManagementProps) {
  // Page Tab state (6 tabs matching repo)
  const [activeTab, setActiveTab] = useState<
    "data" | "ncc" | "groups" | "handover" | "template" | "settings"
  >("data");

  // Mobile card view toggle
  const [isMobileView, setIsMobileView] = useState(false);

  // Selection states
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [activeRequestId, setActiveRequestId] = useState<number | null>(
    paymentRequests[0]?.id ?? null
  );

  // Filter states for DATA page
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [freezeCol, setFreezeCol] = useState(2); // 2: STT, 3: NCC, 4: Group, 7: InvoiceNo, 8: InvoiceDate, 0: None

  // Search state for NCC & Groups
  const [nccSearch, setNccSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");

  // Handover selection & filter
  const [checkedHandovers, setCheckedHandovers] = useState<Set<number>>(new Set());
  const [handoverDeptFilter, setHandoverDeptFilter] = useState("");
  const [handoverSearch, setHandoverSearch] = useState("");

  // Modals state
  const [docModalReqId, setDocModalReqId] = useState<number | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [customDocTypes, setCustomDocTypes] = useState<string[]>(DEFAULT_DOCS);

  const [showPOPickerModal, setShowPOPickerModal] = useState(false);
  const [poSearch, setPoSearch] = useState("");

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTargetDept, setPasteTargetDept] = useState("");
  const [pasteTargetDate, setPasteTargetDate] = useState(localToday());
  const [pasteParsedRows, setPasteParsedRows] = useState<any[]>([]);

  // Preview Modals
  const [previewPaymentReq, setPreviewPaymentReq] = useState<PaymentRequestEntry | null>(null);
  const [batchPrintReqs, setBatchPrintReqs] = useState<PaymentRequestEntry[] | null>(null);
  const [previewHandoverDept, setPreviewHandoverDept] = useState<string | null>(null);
  const [previewHandoverItems, setPreviewHandoverItems] = useState<PaymentHandoverItem[]>([]);

  // Template form state
  const [tplForm, setTplForm] = useState<PaymentPrintTemplate>(
    paymentTemplate || DEFAULT_PAYMENT_TEMPLATE
  );

  // Settings tab user management state
  const [systemUsers, setSystemUsers] = useState<
    Array<{ id: number; username: string; full_name: string; role: string; is_active: number }>
  >([
    { id: 1, username: "admin", full_name: "Quản trị hệ thống", role: "admin", is_active: 1 },
    { id: 2, username: "ketoan01", full_name: "Kế toán thanh toán", role: "approver", is_active: 1 },
    { id: 3, username: "cungung01", full_name: "Trần Hải Hà", role: "requester", is_active: 1 },
  ]);
  const [showNewUserBox, setShowNewUserBox] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState("requester");
  const [newUserPass, setNewUserPass] = useState("");
  const [settingsUserMsg, setSettingsUserMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMsg, setPassMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Hidden date picker ref
  const calendarPickerRef = useRef<HTMLInputElement>(null);
  const calendarCbRef = useRef<((dateVal: string) => void) | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paymentTemplate) {
      setTplForm(paymentTemplate);
    }
  }, [paymentTemplate]);

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

  // Group calculations map
  const groupTotalsMap = useMemo(() => {
    const map = new Map<string, { paid: number; pending: number; count: number }>();
    for (const g of paymentGroups) {
      map.set(String(g.id), { paid: 0, pending: 0, count: 0 });
    }
    for (const r of paymentRequests) {
      const gId = String(r.group_id || "");
      const amt = Number(String(r.amount || 0).replace(/,/g, "")) || 0;
      if (gId && map.has(gId)) {
        const item = map.get(gId)!;
        item.count += 1;
        if (PAID_STATUSES.includes(r.status)) {
          item.paid += amt;
        } else {
          item.pending += amt;
        }
      }
    }
    return map;
  }, [paymentGroups, paymentRequests]);

  // Metric summaries
  const metrics = useMemo(() => {
    let totalPaidVND = 0;
    let totalPendingVND = 0;
    let totalCount = paymentRequests.length;
    let paidCount = 0;

    for (const r of paymentRequests) {
      const amt = Number(String(r.amount || 0).replace(/,/g, "")) || 0;
      const cur = String(r.currency || "VND").toUpperCase();
      if (cur === "VND") {
        if (PAID_STATUSES.includes(r.status)) {
          totalPaidVND += amt;
          paidCount += 1;
        } else {
          totalPendingVND += amt;
        }
      }
    }

    return {
      totalCount,
      paidCount,
      totalPaidVND,
      totalPendingVND,
      handoverCount: paymentHandovers.length,
      groupsCount: paymentGroups.length,
      nccCount: paymentBeneficiaries.length,
    };
  }, [paymentRequests, paymentHandovers, paymentGroups, paymentBeneficiaries]);

  // Combined Beneficiaries with Suppliers
  const allBeneficiaries = useMemo(() => {
    const list: PaymentBeneficiary[] = [...paymentBeneficiaries];
    const existingNames = new Set(list.map((b) => normName(b.name)));

    for (const s of suppliers) {
      if (!existingNames.has(normName(s.name))) {
        list.push({
          id: -s.id,
          name: s.name,
          short_name: s.shortName || "",
          address: s.address,
          account_no: s.bankAccount,
          bank: s.bank,
        });
        existingNames.add(normName(s.name));
      }
    }
    return list;
  }, [paymentBeneficiaries, suppliers]);

  // Handover departments list
  const handoverDepts = useMemo(() => {
    const set = new Set<string>();
    for (const h of paymentHandovers) {
      const d = String(h.department || "").trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort();
  }, [paymentHandovers]);

  // Filtered requests for DATA table
  const filteredRequests = useMemo(() => {
    const q = normName(searchQuery);
    return paymentRequests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (groupFilter && String(r.group_id || "") !== String(groupFilter)) return false;
      if (q) {
        const text = [
          r.payee_name,
          r.group_code,
          r.description,
          r.item_name,
          r.invoice_no,
          r.legacy_stt,
          r.bank,
          r.account_no,
          r.amount,
          r.created_by_name,
        ]
          .join(" ")
          .toLowerCase();
        if (!normName(text).includes(q)) return false;
      }
      return true;
    });
  }, [paymentRequests, searchQuery, statusFilter, groupFilter]);

  // Filtered NCC
  const filteredNcc = useMemo(() => {
    const q = normName(nccSearch);
    return paymentBeneficiaries.filter((b) => {
      if (!q) return true;
      const text = [b.name, b.short_name, b.address, b.account_no, b.bank].join(" ");
      return normName(text).includes(q);
    });
  }, [paymentBeneficiaries, nccSearch]);

  // Filtered Groups
  const filteredGroups = useMemo(() => {
    const q = normName(groupSearch);
    return paymentGroups.filter((g) => {
      if (!q) return true;
      const text = [g.code, g.name, g.payee_name].join(" ");
      return normName(text).includes(q);
    });
  }, [paymentGroups, groupSearch]);

  // Filtered Handovers
  const filteredHandovers = useMemo(() => {
    const q = normName(handoverSearch);
    return paymentHandovers.filter((h) => {
      if (handoverDeptFilter && String(h.department || "").trim() !== handoverDeptFilter) {
        return false;
      }
      if (q) {
        const text = [h.department, h.item_name, h.unit, h.note, h.receiver_name, h.sender_name].join(" ");
        if (!normName(text).includes(q)) return false;
      }
      return true;
    });
  }, [paymentHandovers, handoverDeptFilter, handoverSearch]);

  // Request edits
  const handleEditRequest = (id: number, key: keyof PaymentRequestEntry, val: any) => {
    if (readOnly) return;
    const next = paymentRequests.map((r) => {
      if (r.id === id) {
        const updated = { ...r, [key]: val };
        if (key === "payee_name") {
          const match = allBeneficiaries.find(
            (b) =>
              normName(b.name) === normName(val) ||
              (b.short_name && normName(b.short_name) === normName(val))
          );
          if (match) {
            if (!updated.address && match.address) updated.address = match.address;
            if (!updated.account_no && match.account_no) updated.account_no = match.account_no;
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
      created_by_name: tplForm.default_requester_name || "Trần Hải Hà",
      lines: [],
    };
    const next = [newReq, ...paymentRequests];
    onUpdateState({ paymentRequests: next });
    setActiveRequestId(maxId);
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
      created_by_name: tplForm.default_requester_name || "Trần Hải Hà",
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

  // Print Handlers
  const handlePrintSingle = () => {
    if (!activeReq) {
      alert("Vui lòng chọn một đề nghị thanh toán để in");
      return;
    }
    setBatchPrintReqs(null);
    setPreviewPaymentReq(activeReq);
    setTimeout(() => window.print(), 100);
  };

  const handlePrintChecked = () => {
    if (checkedIds.size === 0) {
      alert("Vui lòng tích chọn ít nhất 1 dòng đề nghị thanh toán để in");
      return;
    }
    const selectedList = paymentRequests.filter((r) => checkedIds.has(r.id));
    setPreviewPaymentReq(null);
    setBatchPrintReqs(selectedList);
    setTimeout(() => window.print(), 100);
  };

  // JSON Export & Restore
  const handleExportJson = () => {
    const data = {
      format: "phenikaa-payment-offline-v1",
      exported_at: new Date().toISOString(),
      data: {
        requests: paymentRequests,
        payment_groups: paymentGroups,
        beneficiaries: paymentBeneficiaries,
        handovers: paymentHandovers,
        print_template: tplForm,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phenikaa-payment-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const d = parsed.data || parsed;
        if (d && (d.requests || d.beneficiaries || d.payment_groups || d.handovers)) {
          if (
            !confirm(
              `Khôi phục dữ liệu từ tệp sao lưu (${d.requests?.length || 0} đề nghị, ${
                d.handovers?.length || 0
              } vật tư)?`
            )
          )
            return;
          onUpdateState({
            paymentRequests: d.requests || [],
            paymentGroups: d.payment_groups || [],
            paymentBeneficiaries: d.beneficiaries || [],
            paymentHandovers: d.handovers || [],
            paymentTemplate: d.print_template || DEFAULT_PAYMENT_TEMPLATE,
          });
          alert("Khôi phục dữ liệu JSON thành công!");
        } else {
          alert("Tệp JSON không đúng định dạng dữ liệu thanh toán Phenikaa");
        }
      } catch (err: any) {
        alert("Lỗi đọc file JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Handover actions
  const handleLoadExcelHandovers = async () => {
    if (readOnly) return;
    try {
      const res = await fetch("/handovers-data.json");
      if (!res.ok) throw new Error("Không thể tải file dữ liệu");
      const items: PaymentHandoverItem[] = await res.json();
      if (!Array.isArray(items) || items.length === 0) return;

      if (
        !confirm(
          `Bạn có muốn nạp ${items.length} danh mục vật tư Phenikaa gốc vào danh sách Bàn giao nội bộ?`
        )
      ) {
        return;
      }

      onUpdateState({ paymentHandovers: items });
      alert(`Đã nạp thành công ${items.length} vật tư bàn giao!`);
    } catch (e: any) {
      alert("Lỗi nạp dữ liệu: " + e.message);
    }
  };

  const handleAddHandoverRow = () => {
    if (readOnly) return;
    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    const newItem: PaymentHandoverItem = {
      id: maxId,
      department: handoverDeptFilter || "Phòng KHCU",
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
    onUpdateState({ paymentHandovers: [newItem, ...paymentHandovers] });
  };

  const handleEditHandover = (id: number, key: keyof PaymentHandoverItem, val: any) => {
    if (readOnly) return;
    const next = paymentHandovers.map((h) => (h.id === id ? { ...h, [key]: val } : h));
    onUpdateState({ paymentHandovers: next });
  };

  const handleDeleteHandover = (id: number) => {
    if (readOnly) return;
    if (!confirm("Bạn có chắc muốn xóa vật tư này?")) return;
    const next = paymentHandovers.filter((h) => h.id !== id);
    onUpdateState({ paymentHandovers: next });
  };

  const handleDeleteSelectedHandovers = () => {
    if (readOnly) return;
    if (checkedHandovers.size === 0) {
      alert("Vui lòng tích chọn các dòng vật tư cần xóa");
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa ${checkedHandovers.size} vật tư đã chọn?`)) return;
    const next = paymentHandovers.filter((h) => !checkedHandovers.has(h.id));
    onUpdateState({ paymentHandovers: next });
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
        onUpdateState({ paymentHandovers: [...newItems, ...paymentHandovers] });
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
    onUpdateState({ paymentHandovers: [...newItems, ...paymentHandovers] });
    setShowPasteModal(false);
    setPasteText("");
    setPasteParsedRows([]);
    alert(`Đã thêm thành công ${newItems.length} vật tư vào danh sách bàn giao!`);
  };

  // Preview Handover
  const handlePreviewHandover = () => {
    let itemsToPrint = [];
    if (checkedHandovers.size > 0) {
      itemsToPrint = paymentHandovers.filter((h) => checkedHandovers.has(h.id));
    } else if (handoverDeptFilter) {
      itemsToPrint = paymentHandovers.filter(
        (h) => String(h.department || "").trim() === handoverDeptFilter
      );
    } else {
      itemsToPrint = filteredHandovers;
    }

    if (itemsToPrint.length === 0) {
      alert("Vui lòng tích chọn vật tư hoặc chọn bộ phận nhận để xem trước biên bản");
      return;
    }

    setPreviewHandoverDept(itemsToPrint[0]?.department || "Bộ phận nhận");
    setPreviewHandoverItems(itemsToPrint);
  };

  // Print Handover Direct (2 copies)
  const handlePrintHandoverDirect = () => {
    let itemsToPrint = [];
    if (checkedHandovers.size > 0) {
      itemsToPrint = paymentHandovers.filter((h) => checkedHandovers.has(h.id));
    } else if (handoverDeptFilter) {
      itemsToPrint = paymentHandovers.filter(
        (h) => String(h.department || "").trim() === handoverDeptFilter
      );
    } else {
      itemsToPrint = filteredHandovers;
    }

    if (itemsToPrint.length === 0) {
      alert("Vui lòng chọn ít nhất 1 vật tư để in biên bản bàn giao");
      return;
    }

    setPreviewHandoverDept(itemsToPrint[0]?.department || "Bộ phận nhận");
    setPreviewHandoverItems(itemsToPrint);
    setTimeout(() => window.print(), 100);
  };

  // Settings Actions
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim()) {
      setSettingsUserMsg({ text: "Vui lòng nhập đầy đủ thông tin", type: "error" });
      return;
    }
    const maxId = Math.max(0, ...systemUsers.map((u) => u.id)) + 1;
    const next = [
      ...systemUsers,
      {
        id: maxId,
        username: newUsername.trim(),
        full_name: newFullName.trim(),
        role: newRole,
        is_active: 1,
      },
    ];
    setSystemUsers(next);
    setNewUsername("");
    setNewFullName("");
    setNewUserPass("");
    setShowNewUserBox(false);
    setSettingsUserMsg({ text: `Đã tạo tài khoản ${newUsername.trim()} thành công!`, type: "success" });
  };

  const handleResetPass = (username: string) => {
    const p = prompt(`Nhập mật khẩu mới cho tài khoản ${username} (tối thiểu 4 ký tự):`);
    if (p === null) return;
    if (p.trim().length < 4) {
      alert("Mật khẩu phải từ 4 ký tự trở lên");
      return;
    }
    alert(`Đã đặt lại mật khẩu cho tài khoản ${username} thành công!`);
  };

  const handleDeleteUser = (id: number, username: string) => {
    if (!confirm(`Bạn có chắc muốn xóa tài khoản ${username}?`)) return;
    setSystemUsers(systemUsers.filter((u) => u.id !== id));
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPass || !newPass) {
      setPassMsg({ text: "Vui lòng nhập đầy đủ các trường", type: "error" });
      return;
    }
    if (newPass !== confirmPass) {
      setPassMsg({ text: "Mật khẩu xác nhận không khớp", type: "error" });
      return;
    }
    setOldPass("");
    setNewPass("");
    setConfirmPass("");
    setPassMsg({ text: "Đổi mật khẩu tài khoản thành công!", type: "success" });
  };

  return (
    <section className="content payment-management">
      {/* Hidden date picker for popup calendar button */}
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

      {/* Hidden file input for JSON restore */}
      <input
        type="file"
        ref={restoreFileRef}
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImportJson}
      />

      {/* Top Heading */}
      <div className="heading">
        <div>
          <em>QUẢN LÝ TÀI CHÍNH · THANH TOÁN & BÀN GIAO</em>
          <h1>Đề nghị thanh toán (Mẫu 01 – TT) & Bàn giao nội bộ</h1>
          <p>
            Theo dõi đề nghị chuyển khoản, nhóm giải ngân hợp đồng và biên bản bàn giao
            nội bộ Phenikaa.
          </p>
        </div>
        <div className="actions">
          <button
            className="payment-btn"
            id="btnMobileToggle"
            onClick={() => setIsMobileView((v) => !v)}
            title="Chuyển đổi giao diện giữa dạng bảng tính desktop và dạng thẻ di động"
          >
            {isMobileView ? "💻 Xem bản desktop" : "📱 Xem dạng thẻ"}
          </button>
          <button className="primary" onClick={() => setShowPOPickerModal(true)}>
            ⚡ Lập từ PO
          </button>
          <button className="btn" onClick={handleExportJson}>
            ↓ Sao lưu JSON
          </button>
          <button
            className="btn"
            onClick={() => restoreFileRef.current?.click()}
          >
            ↑ Khôi phục JSON
          </button>
          <button
            className="btn"
            onClick={() => {
              if (activeReq) {
                setBatchPrintReqs(null);
                setPreviewPaymentReq(activeReq);
              } else {
                alert("Vui lòng chọn 1 đề nghị thanh toán");
              }
            }}
          >
            ⎙ Xem trước Mẫu 01-TT
          </button>
          <button className="btn" onClick={() => window.print()}>
            🖨️ In trang / In PDF
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="payment-summary-cards">
        <div className="payment-card card-primary">
          <div className="payment-card-label">Tổng đề nghị thanh toán</div>
          <div className="payment-card-value">{metrics.totalCount}</div>
          <div className="payment-card-sub">{metrics.paidCount} phiếu đã thanh toán xong</div>
        </div>
        <div className="payment-card card-success">
          <div className="payment-card-label">Đã thanh toán (VND)</div>
          <div className="payment-card-value">{fmtMoney(metrics.totalPaidVND)} ₫</div>
          <div className="payment-card-sub">Trạng thái Done & Đã đi tiền</div>
        </div>
        <div className="payment-card card-warning">
          <div className="payment-card-label">Chờ đi tiền / giải ngân</div>
          <div className="payment-card-value">{fmtMoney(metrics.totalPendingVND)} ₫</div>
          <div className="payment-card-sub">Đang trình ký & chờ ngân hàng</div>
        </div>
        <div className="payment-card card-info">
          <div className="payment-card-label">Vật tư bàn giao nội bộ</div>
          <div className="payment-card-value">{metrics.handoverCount}</div>
          <div className="payment-card-sub">{handoverDepts.length} phòng ban tiếp nhận</div>
        </div>
      </div>

      {/* Sub Tabs Navigation (All 6 tabs matching repo) */}
      <div className="payment-tabs">
        <button
          className={`payment-tab-btn ${activeTab === "data" ? "active" : ""}`}
          onClick={() => setActiveTab("data")}
        >
          📋 Bảng DATA · Thanh toán
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "ncc" ? "active" : ""}`}
          onClick={() => setActiveTab("ncc")}
        >
          🏢 Danh mục NCC ({metrics.nccCount})
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "groups" ? "active" : ""}`}
          onClick={() => setActiveTab("groups")}
        >
          📁 Nhóm hợp đồng / Đơn hàng ({metrics.groupsCount})
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "handover" ? "active" : ""}`}
          onClick={() => setActiveTab("handover")}
        >
          📦 Bàn giao nội bộ ({metrics.handoverCount})
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "template" ? "active" : ""}`}
          onClick={() => setActiveTab("template")}
        >
          📄 Mẫu phiếu thanh toán
        </button>
        <button
          className={`payment-tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          ⚙️ Cài đặt & Quản trị
        </button>
      </div>

      {/* TAB 1: DATA TABLE */}
      {activeTab === "data" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Toolbar */}
          <div className="payment-toolbar">
            <button className="payment-btn btn-primary" onClick={handleAddRequestRow}>
              ＋ Thêm đề nghị (thêm dòng)
            </button>
            <input
              placeholder="Tìm NCC, STT, nội dung, hóa đơn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "230px" }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
            >
              <option value="">Tất cả nhóm</option>
              {paymentGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} ({g.name || g.payee_name || ""})
                </option>
              ))}
            </select>

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

            <button className="payment-btn" onClick={handlePrintSingle}>
              ⎙ In phiếu đang xem
            </button>
            <button className="payment-btn" onClick={handlePrintChecked}>
              ⎙ In các dòng đã tích ({checkedIds.size})
            </button>
            <button
              className="payment-btn btn-danger"
              onClick={handleDeleteSelectedRequests}
            >
              Xóa dòng đã chọn
            </button>

            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
              {filteredRequests.length} / {paymentRequests.length} đề nghị
            </span>
          </div>

          {/* Datalists for autocompletion */}
          <datalist id="nccDataList">
            {allBeneficiaries.map((b) => (
              <option key={b.id} value={b.short_name || b.name}>
                {b.name}
              </option>
            ))}
          </datalist>

          <datalist id="bankDataList">
            {BANK_SUGGESTIONS.map((bn) => (
              <option key={bn} value={bn} />
            ))}
          </datalist>

          <datalist id="groupDataList">
            {paymentGroups.map((g) => (
              <option key={g.id} value={g.code}>
                {g.name}
              </option>
            ))}
          </datalist>

          {/* Mobile Cards View for DATA */}
          {isMobileView ? (
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
                      <span className={`m-badge ${stClass}`}>{r.status}</span>
                    </div>
                    <div className="m-card-payee">{payee}</div>
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

                    <div className="m-card-actions">
                      <button
                        className="payment-btn"
                        onClick={() => {
                          setPreviewPaymentReq(r);
                          setTimeout(() => window.print(), 100);
                        }}
                      >
                        ⎙ In phiếu
                      </button>
                      <button
                        className="payment-btn btn-danger"
                        onClick={() => {
                          if (confirm(`Xóa đề nghị thanh toán này?`)) {
                            onUpdateState({
                              paymentRequests: paymentRequests.filter((x) => x.id !== r.id),
                            });
                          }
                        }}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredRequests.length === 0 && (
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
                  <tbody onKeyDown={handleTableKeyDown}>
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
                                setBatchPrintReqs(null);
                                setPreviewPaymentReq(r);
                                setTimeout(() => window.print(), 100);
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
                                if (confirm(`Bạn có chắc muốn xóa đề nghị STT ${r.legacy_stt || r.id}?`)) {
                                  onUpdateState({
                                    paymentRequests: paymentRequests.filter((x) => x.id !== r.id),
                                  });
                                }
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

          {/* Detail Lines Box for Active Request */}
          {activeReq && (
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
        </div>
      )}

      {/* TAB 2: NCC (BENEFICIARIES) */}
      {activeTab === "ncc" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div className="payment-toolbar">
            <button
              className="payment-btn btn-primary"
              onClick={() => {
                const maxId =
                  Math.max(0, ...paymentBeneficiaries.map((b) => Number(b.id) || 0)) + 1;
                const newB: PaymentBeneficiary = {
                  id: maxId,
                  name: "",
                  short_name: "",
                  address: "",
                  account_no: "",
                  bank: "",
                };
                onUpdateState({ paymentBeneficiaries: [newB, ...paymentBeneficiaries] });
              }}
            >
              ＋ Thêm nhà cung cấp
            </button>
            <input
              placeholder="Tìm NCC (tên, viết tắt, STK, ngân hàng)..."
              value={nccSearch}
              onChange={(e) => setNccSearch(e.target.value)}
              style={{ width: "260px" }}
            />
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Có thể bổ sung tên viết tắt để tìm và hiển thị ở bảng DATA; phiếu in vẫn dùng tên đầy đủ.
            </span>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
              {filteredNcc.length} / {paymentBeneficiaries.length} NCC
            </span>
          </div>

          {isMobileView ? (
            <div className="mobile-cards-container">
              {filteredNcc.map((b) => (
                <div key={b.id} className="m-card">
                  <div className="m-card-header">
                    <div className="m-card-stt">NCC #{b.id}</div>
                    {b.short_name && <span className="m-badge mb-badge-dept">{b.short_name}</span>}
                  </div>
                  <div className="m-card-payee">{b.name || "Chưa có tên NCC"}</div>
                  <div className="m-card-meta">
                    <div>🏦 Ngân hàng: <b>{b.bank || "---"}</b></div>
                    <div>Số tài khoản: <b>{b.account_no || "---"}</b></div>
                    {b.address && <div>📍 Địa chỉ: {b.address}</div>}
                  </div>
                  <div className="m-card-actions">
                    <button
                      className="payment-btn btn-danger"
                      onClick={() => {
                        if (confirm(`Xóa NCC ${b.name || b.id} khỏi danh mục?`)) {
                          onUpdateState({
                            paymentBeneficiaries: paymentBeneficiaries.filter((x) => x.id !== b.id),
                          });
                        }
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
              {filteredNcc.length === 0 && <div className="m-empty">Không tìm thấy NCC nào</div>}
            </div>
          ) : (
            <div className="payment-table-container">
              <div className="payment-table-header">
                <span>NCC · DANH MỤC ĐƠN VỊ HƯỞNG LỢI</span>
                <span>Tổng số: {filteredNcc.length} NCC trong danh mục</span>
              </div>
              <div className="payment-table-scroll">
                <table className="payment-grid" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "54px", textAlign: "center" }}>STT</th>
                      <th style={{ minWidth: "280px" }}>Tên đơn vị hưởng lợi (đầy đủ)</th>
                      <th style={{ minWidth: "150px" }}>Tên viết tắt</th>
                      <th style={{ minWidth: "320px" }}>Địa chỉ</th>
                      <th style={{ minWidth: "180px" }}>Số tài khoản</th>
                      <th style={{ minWidth: "260px" }}>Ngân hàng</th>
                      <th style={{ width: "86px", textAlign: "center" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNcc.map((b, bIdx) => (
                      <tr key={b.id}>
                        <td style={{ textAlign: "center", color: "#64748b" }}>{bIdx + 1}</td>
                        <td>
                          <input
                            value={b.name || ""}
                            onChange={(e) => {
                              const next = paymentBeneficiaries.map((item) =>
                                item.id === b.id ? { ...item, name: e.target.value } : item
                              );
                              onUpdateState({ paymentBeneficiaries: next });
                            }}
                            placeholder="Tên công ty / đơn vị hưởng..."
                          />
                        </td>
                        <td>
                          <input
                            value={b.short_name || ""}
                            onChange={(e) => {
                              const next = paymentBeneficiaries.map((item) =>
                                item.id === b.id ? { ...item, short_name: e.target.value } : item
                              );
                              onUpdateState({ paymentBeneficiaries: next });
                            }}
                            placeholder="Tên viết tắt..."
                          />
                        </td>
                        <td>
                          <input
                            value={b.address || ""}
                            onChange={(e) => {
                              const next = paymentBeneficiaries.map((item) =>
                                item.id === b.id ? { ...item, address: e.target.value } : item
                              );
                              onUpdateState({ paymentBeneficiaries: next });
                            }}
                            placeholder="Địa chỉ..."
                          />
                        </td>
                        <td>
                          <input
                            value={b.account_no || ""}
                            onChange={(e) => {
                              const next = paymentBeneficiaries.map((item) =>
                                item.id === b.id ? { ...item, account_no: e.target.value } : item
                              );
                              onUpdateState({ paymentBeneficiaries: next });
                            }}
                            placeholder="Số tài khoản..."
                          />
                        </td>
                        <td>
                          <input
                            list="bankDataList"
                            value={b.bank || ""}
                            onChange={(e) => {
                              const next = paymentBeneficiaries.map((item) =>
                                item.id === b.id ? { ...item, bank: e.target.value } : item
                              );
                              onUpdateState({ paymentBeneficiaries: next });
                            }}
                            placeholder="Ngân hàng & Chi nhánh..."
                          />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="payment-btn btn-danger"
                            style={{ padding: "3px 8px" }}
                            onClick={() => {
                              if (confirm(`Bạn có chắc muốn xóa NCC ${b.name || b.id}?`)) {
                                const next = paymentBeneficiaries.filter((item) => item.id !== b.id);
                                onUpdateState({ paymentBeneficiaries: next });
                              }
                            }}
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredNcc.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                          Không có nhà cung cấp nào
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GROUPS (PO / CONTRACT GROUPS) */}
      {activeTab === "groups" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div className="payment-toolbar">
            <button
              className="payment-btn btn-primary"
              onClick={() => {
                const maxId = Math.max(0, ...paymentGroups.map((g) => Number(g.id) || 0)) + 1;
                const newG: PaymentGroup = {
                  id: maxId,
                  code: `HĐ-${maxId}`,
                  name: "",
                  payee_name: "",
                  total_amount: "0",
                  currency: "VND",
                };
                onUpdateState({ paymentGroups: [newG, ...paymentGroups] });
              }}
            >
              ＋ Thêm nhóm
            </button>
            <input
              placeholder="Tìm nhóm, mã PO, NCC..."
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              style={{ width: "240px" }}
            />
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Có thể tạo nhóm ngay trong cột Nhóm hợp đồng trên bảng DATA bằng cách gõ mã mới và nhấn Tab hoặc Enter.
              “Đã trả” gồm Done và các trạng thái Đã thanh toán.
            </span>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
              {filteredGroups.length} / {paymentGroups.length} nhóm
            </span>
          </div>

          {isMobileView ? (
            <div className="mobile-cards-container">
              {filteredGroups.map((g) => {
                const stats = groupTotalsMap.get(String(g.id)) || { paid: 0, pending: 0, count: 0 };
                const totalVal = Number(String(g.total_amount || 0).replace(/,/g, "")) || 0;
                const remaining = totalVal - stats.paid;
                const pct = totalVal > 0 ? Math.min(100, Math.round((stats.paid / totalVal) * 100)) : 0;

                return (
                  <div key={g.id} className="m-card">
                    <div className="m-card-header">
                      <div className="m-card-stt" style={{ color: "#0369a1" }}>{g.code || "Chưa có mã"}</div>
                      <span className="m-badge mb-badge-paid">{stats.count} phiếu TT</span>
                    </div>
                    <div className="m-card-payee" style={{ fontSize: "13.5px" }}>{g.name || "Chưa có tên nhóm"}</div>
                    <div style={{ fontSize: "12px", color: "#475569" }}>ĐV hưởng: <b>{g.payee_name || "---"}</b></div>

                    <div style={{ margin: "6px 0 2px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginBottom: "3px" }}>
                        <span>Tiến độ thanh toán:</span>
                        <b>{pct}%</b>
                      </div>
                      <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#0284c7" }} />
                      </div>
                    </div>

                    <div className="m-card-meta">
                      <div>Tổng HĐ: <b>{fmtMoney(totalVal)} {g.currency}</b></div>
                      <div>Đã thanh toán: <b style={{ color: "#166534" }}>{fmtMoney(stats.paid)} {g.currency}</b></div>
                      <div>Chờ giải ngân: <b style={{ color: "#b45309" }}>{fmtMoney(stats.pending)} {g.currency}</b></div>
                      <div>Còn lại: <b style={{ color: remaining < 0 ? "#dc2626" : "#0f766e" }}>{fmtMoney(remaining)} {g.currency}</b></div>
                    </div>

                    <div className="m-card-actions">
                      <button
                        className="payment-btn"
                        onClick={() => {
                          setActiveTab("data");
                          setGroupFilter(String(g.id));
                        }}
                      >
                        {stats.count} phiếu ↗
                      </button>
                      <button
                        className="payment-btn btn-danger"
                        onClick={() => {
                          if (confirm(`Xóa nhóm ${g.code}?`)) {
                            onUpdateState({ paymentGroups: paymentGroups.filter((x) => x.id !== g.id) });
                          }
                        }}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredGroups.length === 0 && <div className="m-empty">Không tìm thấy nhóm hợp đồng nào</div>}
            </div>
          ) : (
            <div className="payment-table-container">
              <div className="payment-table-header">
                <span>TIẾN ĐỘ GIẢI NGÂN THEO NHÓM HỢP ĐỒNG / ĐƠN HÀNG</span>
                <span>Số còn lại = Giá trị hợp đồng − các phiếu xác nhận đã thanh toán</span>
              </div>
              <div className="payment-table-scroll">
                <table className="payment-grid" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "120px" }}>Mã nhóm</th>
                      <th style={{ minWidth: "240px" }}>Tên hợp đồng / đơn hàng</th>
                      <th style={{ minWidth: "200px" }}>Đơn vị hưởng lợi</th>
                      <th style={{ width: "140px", textAlign: "right" }}>Giá trị hợp đồng</th>
                      <th style={{ width: "80px" }}>Tiền tệ</th>
                      <th style={{ width: "130px", textAlign: "right" }}>Đã trả</th>
                      <th style={{ width: "130px", textAlign: "right" }}>Chờ đi tiền / chưa rõ</th>
                      <th style={{ width: "130px", textAlign: "right" }}>Còn lại</th>
                      <th style={{ width: "100px", textAlign: "center" }}>Số phiếu</th>
                      <th style={{ width: "70px", textAlign: "center" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map((g) => {
                      const stats = groupTotalsMap.get(String(g.id)) || {
                        paid: 0,
                        pending: 0,
                        count: 0,
                      };
                      const totalVal = Number(String(g.total_amount || 0).replace(/,/g, "")) || 0;
                      const remaining = totalVal - stats.paid;

                      return (
                        <tr key={g.id}>
                          <td>
                            <input
                              value={g.code || ""}
                              onChange={(e) => {
                                const next = paymentGroups.map((item) =>
                                  item.id === g.id ? { ...item, code: e.target.value } : item
                                );
                                onUpdateState({ paymentGroups: next });
                              }}
                              placeholder="Mã nhóm..."
                            />
                          </td>
                          <td>
                            <input
                              value={g.name || ""}
                              onChange={(e) => {
                                const next = paymentGroups.map((item) =>
                                  item.id === g.id ? { ...item, name: e.target.value } : item
                                );
                                onUpdateState({ paymentGroups: next });
                              }}
                              placeholder="Tên HĐ..."
                            />
                          </td>
                          <td>
                            <input
                              list="nccDataList"
                              value={g.payee_name || ""}
                              onChange={(e) => {
                                const next = paymentGroups.map((item) =>
                                  item.id === g.id
                                    ? { ...item, payee_name: e.target.value }
                                    : item
                                );
                                onUpdateState({ paymentGroups: next });
                              }}
                              placeholder="ĐV hưởng lợi..."
                            />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <input
                              style={{ textAlign: "right", fontWeight: 600 }}
                              value={fmtMoney(g.total_amount)}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/,/g, "");
                                const next = paymentGroups.map((item) =>
                                  item.id === g.id
                                    ? { ...item, total_amount: raw }
                                    : item
                                );
                                onUpdateState({ paymentGroups: next });
                              }}
                            />
                          </td>
                          <td>
                            <select
                              value={g.currency || "VND"}
                              onChange={(e) => {
                                const next = paymentGroups.map((item) =>
                                  item.id === g.id
                                    ? { ...item, currency: e.target.value }
                                    : item
                                );
                                onUpdateState({ paymentGroups: next });
                              }}
                            >
                              <option value="VND">VND</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: "#166534" }}>
                            {fmtMoney(stats.paid)} {g.currency}
                          </td>
                          <td style={{ textAlign: "right", color: "#b45309" }}>
                            {fmtMoney(stats.pending)} {g.currency}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontWeight: 700,
                              color: remaining < 0 ? "#dc2626" : "#0f766e",
                            }}
                          >
                            {fmtMoney(remaining)} {g.currency}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              className="payment-btn"
                              style={{ padding: "3px 8px", fontSize: "11px" }}
                              title="Chuyển sang Bảng DATA và lọc theo nhóm này"
                              onClick={() => {
                                setActiveTab("data");
                                setGroupFilter(String(g.id));
                              }}
                            >
                              {stats.count} phiếu ↗
                            </button>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              className="payment-btn btn-danger"
                              style={{ padding: "2px 6px" }}
                              onClick={() => {
                                if (confirm(`Bạn có chắc muốn xóa nhóm ${g.code}?`)) {
                                  const next = paymentGroups.filter((item) => item.id !== g.id);
                                  onUpdateState({ paymentGroups: next });
                                }
                              }}
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredGroups.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                          Không có nhóm hợp đồng nào
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: HANDOVER (BÀN GIAO NỘI BỘ VẬT TƯ) */}
      {activeTab === "handover" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Toolbar */}
          <div className="payment-toolbar">
            <button
              className="payment-btn btn-primary"
              style={{ background: "#0284c7", borderColor: "#0369a1" }}
              onClick={handleLoadExcelHandovers}
              title="Cập nhật toàn bộ 85 vật tư từ file Excel Phenikaa vào bảng"
            >
              📥 Nạp 85 vật tư từ Excel gốc
            </button>
            <button
              className="payment-btn btn-primary"
              style={{ background: "#107c41", borderColor: "#0b5c30" }}
              onClick={() => setShowPasteModal(true)}
            >
              📋 Dán từ Excel (Ctrl+V)
            </button>
            <button
              className="payment-btn btn-primary"
              style={{ background: "#2563eb", borderColor: "#1d4ed8" }}
              onClick={handlePreviewHandover}
              title="Xem trực tiếp bản in biên bản có logo Phenikaa trên màn hình"
            >
              👁️ Xem trước biên bản (kèm Logo)
            </button>
            <button
              className="payment-btn btn-primary"
              style={{ background: "#0f766e", borderColor: "#0d5e56" }}
              onClick={handlePrintHandoverDirect}
            >
              🖨️ In biên bản đã chọn (2 bản)
            </button>
            <button className="payment-btn" onClick={handleAddHandoverRow}>
              ＋ Thêm dòng vật tư
            </button>
            <button className="payment-btn btn-danger" onClick={handleDeleteSelectedHandovers}>
              🗑️ Xóa dòng đã chọn
            </button>

            <select
              value={handoverDeptFilter}
              onChange={(e) => setHandoverDeptFilter(e.target.value)}
              style={{ minWidth: "160px" }}
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
              style={{ width: "230px" }}
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

          {/* Handover Table with direct paste support */}
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
                    <th style={{ minWidth: "150px" }}>Bộ phận nhận</th>
                    <th style={{ minWidth: "260px" }}>Tên hàng hóa - Quy cách</th>
                    <th style={{ width: "80px" }}>ĐVT</th>
                    <th style={{ width: "95px", textAlign: "center" }}>SL chứng từ</th>
                    <th style={{ width: "95px", textAlign: "center" }}>SL Đạt</th>
                    <th style={{ width: "95px", textAlign: "center" }}>SL Hỏng</th>
                    <th style={{ minWidth: "160px" }}>Ghi chú</th>
                    <th style={{ width: "125px" }}>Ngày bàn giao</th>
                    <th style={{ minWidth: "120px" }}>Bên giao</th>
                    <th style={{ minWidth: "120px" }}>Bên nhận</th>
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
                        <td style={{ textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
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
                            value={h.sender_name || "Trần Hải Hà"}
                            onChange={(e) =>
                              handleEditHandover(h.id, "sender_name", e.target.value)
                            }
                            placeholder="Bên giao..."
                          />
                        </td>
                        <td>
                          <input
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
        </div>
      )}

      {/* TAB 5: TEMPLATE CONFIGURATION & LIVE PREVIEW */}
      {activeTab === "template" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="payment-toolbar">
            <button
              className="payment-btn btn-primary"
              onClick={() => {
                onUpdateState({ paymentTemplate: tplForm });
                alert("Đã lưu cấu hình mẫu phiếu thành công!");
              }}
            >
              💾 Lưu cấu hình mẫu
            </button>
            <button
              className="payment-btn"
              onClick={() => {
                setBatchPrintReqs(null);
                setPreviewPaymentReq(activeReq || {
                  id: 999,
                  payee_name: "Công ty Cổ phần Công nghệ và Giải pháp ABC",
                  address: "Số 123 Đường Cầu Giấy, P. Dịch Vọng, Q. Cầu Giấy, TP. Hà Nội",
                  account_no: "19035678901234",
                  bank: "Techcombank - Chi nhánh Thăng Long",
                  description: "Thanh toán tiền vật tư, nguyên phụ liệu sản xuất theo HĐ số 45/2026/PKA-ABC đợt 1",
                  request_date: localToday(),
                  amount: "45000000",
                  currency: "VND",
                  documents: ["Hóa đơn điện tử GTGT", "Biên bản nghiệm thu bàn giao", "Hợp đồng mua bán"],
                  payment_type: "TT trước 100%",
                  status: "Đã giao KT, chờ đi tiền",
                });
                setTimeout(() => window.print(), 100);
              }}
            >
              ⎙ In thử mẫu này
            </button>
            <button
              className="payment-btn btn-danger"
              onClick={() => {
                if (confirm("Khôi phục toàn bộ câu từ về mẫu ban đầu của Phenikaa?")) {
                  setTplForm(DEFAULT_PAYMENT_TEMPLATE);
                  onUpdateState({ paymentTemplate: DEFAULT_PAYMENT_TEMPLATE });
                }
              }}
            >
              ↺ Khôi phục gốc
            </button>
          </div>

          <div className="tpl-container">
            {/* Cột trái: Form cấu hình chi tiết */}
            <div className="tpl-form-col" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* 1. Tiêu đề & Đơn vị */}
              <div className="tpl-card">
                <h3>🏢 1. Tiêu đề & Đơn vị phát hành</h3>
                <div className="tpl-field">
                  <label>Tên đơn vị / Công ty (Dòng trên cùng bên trái)</label>
                  <input
                    value={tplForm.company_name}
                    onChange={(e) => setTplForm({ ...tplForm, company_name: e.target.value })}
                    placeholder="CÔNG TY CỔ PHẦN DƯỢC PHẨM PHENIKAA"
                  />
                </div>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Ký hiệu mẫu</label>
                    <input
                      value={tplForm.form_code}
                      onChange={(e) => setTplForm({ ...tplForm, form_code: e.target.value })}
                      placeholder="Mẫu số 01 – TT"
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Địa danh (Ví dụ: Hà Nội)</label>
                    <input
                      value={tplForm.date_location}
                      onChange={(e) => setTplForm({ ...tplForm, date_location: e.target.value })}
                      placeholder="Hà Nội"
                    />
                  </div>
                </div>
                <div className="tpl-field">
                  <label>Tiêu đề chính của văn bản</label>
                  <input
                    value={tplForm.form_title}
                    onChange={(e) => setTplForm({ ...tplForm, form_title: e.target.value })}
                    placeholder="GIẤY ĐỀ NGHỊ THANH TOÁN BẰNG CHUYỂN KHOẢN"
                  />
                </div>
              </div>

              {/* 2. Nhãn các trường nội dung */}
              <div className="tpl-card">
                <h3>🏷️ 2. Nhãn các trường nội dung</h3>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Nhãn phần Kính gửi</label>
                    <input
                      value={tplForm.recipient_label}
                      onChange={(e) => setTplForm({ ...tplForm, recipient_label: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Nội dung Kính gửi mặc định</label>
                    <input
                      value={tplForm.recipients}
                      onChange={(e) => setTplForm({ ...tplForm, recipients: e.target.value })}
                    />
                  </div>
                </div>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Nhãn người đề nghị</label>
                    <input
                      value={tplForm.label_requester}
                      onChange={(e) => setTplForm({ ...tplForm, label_requester: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Họ tên người đề nghị mặc định</label>
                    <input
                      value={tplForm.default_requester_name}
                      onChange={(e) =>
                        setTplForm({ ...tplForm, default_requester_name: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Nhãn bộ phận</label>
                    <input
                      value={tplForm.label_department}
                      onChange={(e) => setTplForm({ ...tplForm, label_department: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Tên bộ phận mặc định</label>
                    <input
                      value={tplForm.department_name}
                      onChange={(e) => setTplForm({ ...tplForm, department_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Nhãn đơn vị hưởng lợi</label>
                    <input
                      value={tplForm.label_payee}
                      onChange={(e) => setTplForm({ ...tplForm, label_payee: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Nhãn số tài khoản</label>
                    <input
                      value={tplForm.label_account}
                      onChange={(e) => setTplForm({ ...tplForm, label_account: e.target.value })}
                    />
                  </div>
                </div>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Nhãn ngân hàng</label>
                    <input
                      value={tplForm.label_bank}
                      onChange={(e) => setTplForm({ ...tplForm, label_bank: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Nhãn nội dung chuyển tiền</label>
                    <input
                      value={tplForm.label_description}
                      onChange={(e) => setTplForm({ ...tplForm, label_description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Nhãn thời hạn chuyển tiền</label>
                    <input
                      value={tplForm.deadline_label}
                      onChange={(e) => setTplForm({ ...tplForm, deadline_label: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Giá trị thời hạn mặc định</label>
                    <input
                      value={tplForm.deadline_val}
                      onChange={(e) => setTplForm({ ...tplForm, deadline_val: e.target.value })}
                    />
                  </div>
                </div>
                <div className="tpl-field">
                  <label>Nhãn số tiền bằng chữ</label>
                  <input
                    value={tplForm.label_money_words}
                    onChange={(e) => setTplForm({ ...tplForm, label_money_words: e.target.value })}
                  />
                </div>
                <div className="tpl-field">
                  <label>Nhãn chứng từ đi kèm</label>
                  <input
                    value={tplForm.label_docs}
                    onChange={(e) => setTplForm({ ...tplForm, label_docs: e.target.value })}
                  />
                </div>
              </div>

              {/* 3. 4 Chữ ký */}
              <div className="tpl-card">
                <h3>✍️ 3. Cấu hình 4 chức danh & người ký</h3>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Ký 1 (Trái): Chức danh</label>
                    <input
                      value={tplForm.sign1_title}
                      onChange={(e) => setTplForm({ ...tplForm, sign1_title: e.target.value })}
                    />
                    <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                    <input
                      value={tplForm.sign1_name}
                      onChange={(e) => setTplForm({ ...tplForm, sign1_name: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Ký 2: Chức danh</label>
                    <input
                      value={tplForm.sign2_title}
                      onChange={(e) => setTplForm({ ...tplForm, sign2_title: e.target.value })}
                    />
                    <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                    <input
                      value={tplForm.sign2_name}
                      onChange={(e) => setTplForm({ ...tplForm, sign2_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="tpl-grid-2">
                  <div className="tpl-field">
                    <label>Ký 3: Chức danh</label>
                    <input
                      value={tplForm.sign3_title}
                      onChange={(e) => setTplForm({ ...tplForm, sign3_title: e.target.value })}
                    />
                    <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                    <input
                      value={tplForm.sign3_name}
                      onChange={(e) => setTplForm({ ...tplForm, sign3_name: e.target.value })}
                    />
                  </div>
                  <div className="tpl-field">
                    <label>Ký 4 (Phải): Chức danh</label>
                    <input
                      value={tplForm.sign4_title}
                      onChange={(e) => setTplForm({ ...tplForm, sign4_title: e.target.value })}
                    />
                    <label style={{ marginTop: "4px" }}>Họ tên người ký</label>
                    <input
                      value={tplForm.sign4_name}
                      onChange={(e) => setTplForm({ ...tplForm, sign4_name: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom action buttons */}
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button
                  className="payment-btn btn-primary"
                  onClick={() => {
                    onUpdateState({ paymentTemplate: tplForm });
                    alert("Đã lưu cấu hình mẫu phiếu thành công!");
                  }}
                >
                  💾 Lưu cấu hình mẫu phiếu
                </button>
                <button
                  className="payment-btn"
                  onClick={() => {
                    setBatchPrintReqs(null);
                    setPreviewPaymentReq(activeReq || {
                      id: 999,
                      payee_name: "Công ty Cổ phần Công nghệ ABC",
                      address: "Số 123 Cầu Giấy, Hà Nội",
                      account_no: "19035678901234",
                      bank: "Techcombank",
                      description: "Thanh toán tiền mua hàng hóa theo HĐ đợt 1",
                      request_date: localToday(),
                      amount: "45000000",
                      currency: "VND",
                    });
                    setTimeout(() => window.print(), 100);
                  }}
                >
                  ⎙ In thử ngay
                </button>
                <button
                  className="payment-btn btn-danger"
                  onClick={() => {
                    if (confirm("Khôi phục toàn bộ mẫu về chuẩn Phenikaa?")) {
                      setTplForm(DEFAULT_PAYMENT_TEMPLATE);
                      onUpdateState({ paymentTemplate: DEFAULT_PAYMENT_TEMPLATE });
                    }
                  }}
                >
                  ↺ Khôi phục mẫu gốc
                </button>
              </div>
            </div>

            {/* Cột phải: Live scaled preview paper */}
            <div className="tpl-preview-box">
              <div className="tpl-preview-header">
                <span>👁️ Xem trước trực tiếp bản in A4 (Mẫu 01-TT)</span>
                <button
                  type="button"
                  className="payment-btn"
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                  onClick={() => {
                    setBatchPrintReqs(null);
                    setPreviewPaymentReq(activeReq || {
                      id: 999,
                      payee_name: "Công ty Cổ phần Công nghệ ABC",
                      amount: "45000000",
                      currency: "VND",
                    });
                    setTimeout(() => window.print(), 100);
                  }}
                >
                  ⎙ In thử
                </button>
              </div>
              <div className="tpl-preview-wrap">
                <div className="tpl-preview-scale">
                  {/* Paper rendered with current tplForm */}
                  {(() => {
                    const sample = activeReq || {
                      id: 999,
                      legacy_stt: "01",
                      payee_name: "Công ty Cổ phần Công nghệ và Giải pháp ABC",
                      address: "Số 123 Đường Cầu Giấy, P. Dịch Vọng, Q. Cầu Giấy, TP. Hà Nội",
                      account_no: "19035678901234",
                      bank: "Techcombank - Chi nhánh Thăng Long",
                      description: "Thanh toán tiền vật tư, nguyên phụ liệu sản xuất theo HĐ đợt 1",
                      request_date: localToday(),
                      amount: "45000000",
                      currency: "VND",
                      documents: ["Hóa đơn điện tử GTGT", "Biên bản nghiệm thu", "Hợp đồng mua bán"],
                      lines: [
                        { description: "Nguyên phụ liệu dược phẩm lô A-01", invoice_no: "HD-001289", invoice_date: "15/10/2026", amount: 25000000 },
                        { description: "Bao bì và tá dược GMP", invoice_no: "HD-001290", invoice_date: "16/10/2026", amount: 20000000 },
                      ],
                      created_by_name: tplForm.default_requester_name || "Trần Hải Hà",
                    };
                    const dateParts = parsePrintDate(sample.request_date);
                    const cur = String(sample.currency || "VND").toUpperCase();
                    const words = moneyWords({ amount: sample.amount, currency: cur });
                    const lines = (sample.lines && sample.lines.length > 0) ? sample.lines : [
                      { description: sample.description || sample.item_name || "", invoice_no: sample.invoice_no || "", invoice_date: sample.invoice_date || "", amount: sample.amount },
                    ];

                    return (
                      <div className="paper">
                        <div className="upper">{tplForm.company_name}</div>
                        <div className="model">{tplForm.form_code}</div>
                        <h1>{tplForm.form_title}</h1>
                        <div className="recipients">
                          <strong>{tplForm.recipient_label}</strong>
                          <div style={{ whiteSpace: "pre-line" }}>{tplForm.recipients}</div>
                        </div>

                        <div className="person">
                          <div>- {tplForm.label_requester}</div>
                          <div><b>{sample.created_by_name || tplForm.default_requester_name}</b></div>
                          <div>- {tplForm.label_department}</div>
                          <div><b>{tplForm.department_name}</b></div>
                        </div>

                        <div className="intro">- {tplForm.intro_text}</div>

                        <div className="details">
                          <div>+ {tplForm.label_payee}</div>
                          <div className="val"><b>{sample.payee_name || ""}</b></div>
                          <div>+ {tplForm.label_address}</div>
                          <div className="val">{sample.address || ""}</div>
                          <div>+ {tplForm.label_account}</div>
                          <div className="val"><b>{sample.account_no || ""}</b></div>
                          <div>+ {tplForm.label_bank}</div>
                          <div className="val"><b>{sample.bank || ""}</b></div>
                          <div>+ {tplForm.label_description}</div>
                          <div className="val">{sample.description || ""}</div>
                        </div>

                        <div className="person transfer">
                          <div>- {tplForm.deadline_label}</div>
                          <div><b>{tplForm.deadline_val}</b></div>
                        </div>

                        <div className="moneytitle">- {tplForm.table_title}</div>

                        <table>
                          <thead>
                            <tr>
                              <th style={{ width: "38px" }}>{tplForm.col_stt}</th>
                              <th style={{ width: "135px" }}>{tplForm.col_invoice}</th>
                              <th>{tplForm.col_item}</th>
                              <th style={{ width: "125px" }}>{tplForm.col_amount}</th>
                              <th style={{ width: "100px" }}>{tplForm.col_note}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l, li) => (
                              <tr key={li}>
                                <td>{li + 1}</td>
                                <td>{l.invoice_no ? `${l.invoice_no}${l.invoice_date ? " (" + l.invoice_date + ")" : ""}` : ""}</td>
                                <td style={{ textAlign: "left", paddingLeft: "6px" }}>{l.description}</td>
                                <td style={{ textAlign: "right", paddingRight: "6px" }}>{fmtMoney(l.amount)}</td>
                                <td>{l.note || ""}</td>
                              </tr>
                            ))}
                            <tr className="sum">
                              <td colSpan={3} style={{ textAlign: "center", fontWeight: "bold" }}>{tplForm.col_total}</td>
                              <td style={{ textAlign: "right", paddingRight: "6px", fontWeight: "bold" }}>{fmtMoney(sample.amount)}</td>
                              <td>{cur}</td>
                            </tr>
                          </tbody>
                        </table>

                        <div className="words">
                          <div>- {tplForm.label_money_words}</div>
                          <div>{words}</div>
                        </div>

                        <div className="doclabel">- {tplForm.label_docs}:</div>
                        <div className="docs">{(sample.documents || []).join(", ") || "Không có"}</div>

                        <div className="date">
                          {tplForm.date_location}, ngày {dateParts ? dateParts.d : "...."} tháng {dateParts ? dateParts.m : "...."} năm {dateParts ? dateParts.y : "2026"}
                        </div>

                        <div className="sign">
                          <div>{tplForm.sign1_title}<span>{tplForm.sign1_name}</span></div>
                          <div>{tplForm.sign2_title}<span>{tplForm.sign2_name}</span></div>
                          <div>{tplForm.sign3_title}<span>{tplForm.sign3_name}</span></div>
                          <div>{tplForm.sign4_title}<span>{sample.created_by_name || tplForm.default_requester_name}</span></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SETTINGS & USER MANAGEMENT */}
      {activeTab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "980px" }}>
          {/* Section 1: User Management & RBAC */}
          <div className="tpl-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "12px" }}>
              <div>
                <h3 style={{ margin: 0, border: 0, padding: 0 }}>👥 Quản lý người dùng & phân quyền hệ thống</h3>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  Quản trị viên có thể tạo tài khoản, phân quyền (Người duyệt / Người đề nghị) và đặt lại mật khẩu
                </div>
              </div>
              <button
                type="button"
                className="payment-btn btn-primary"
                onClick={() => setShowNewUserBox((v) => !v)}
              >
                ＋ Thêm tài khoản
              </button>
            </div>

            {settingsUserMsg && (
              <div className={`auth-msg ${settingsUserMsg.type}`}>
                {settingsUserMsg.text}
              </div>
            )}

            {showNewUserBox && (
              <form
                onSubmit={handleCreateUser}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "14px",
                  marginBottom: "16px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
                  gap: "10px",
                  alignItems: "end",
                }}
              >
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Tên đăng nhập</label>
                  <input
                    placeholder="ví dụ: ketoan02"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                    style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px", width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Họ và tên</label>
                  <input
                    placeholder="Nguyễn Văn A"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    required
                    style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px", width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Vai trò</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px", width: "100%", boxSizing: "border-box" }}
                  >
                    <option value="requester">Người đề nghị</option>
                    <option value="approver">Người duyệt / Kế toán</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Mật khẩu ban đầu</label>
                  <input
                    type="password"
                    placeholder="Tối thiểu 4 ký tự"
                    value={newUserPass}
                    onChange={(e) => setNewUserPass(e.target.value)}
                    required
                    minLength={4}
                    style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "12px", width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <button type="submit" className="payment-btn btn-primary" style={{ height: "34px" }}>
                    Tạo
                  </button>
                </div>
              </form>
            )}

            <table className="user-table">
              <thead>
                <tr>
                  <th style={{ width: "50px" }}>ID</th>
                  <th>Tên đăng nhập</th>
                  <th>Họ và tên</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {systemUsers.map((u) => {
                  let roleClass = "role-requester";
                  let roleText = "Người đề nghị";
                  if (u.role === "admin") {
                    roleClass = "role-admin";
                    roleText = "Quản trị viên";
                  } else if (u.role === "approver") {
                    roleClass = "role-approver";
                    roleText = "Người duyệt / Kế toán";
                  }

                  return (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td><b>{u.username}</b></td>
                      <td>{u.full_name}</td>
                      <td><span className={`user-badge ${roleClass}`}>{roleText}</span></td>
                      <td>
                        {u.is_active === 1 ? (
                          <span style={{ color: "#16a34a" }}>● Hoạt động</span>
                        ) : (
                          <span style={{ color: "#dc2626" }}>○ Đã khóa</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="payment-btn"
                          style={{ padding: "3px 8px", fontSize: "11px", marginRight: "4px" }}
                          onClick={() => handleResetPass(u.username)}
                        >
                          Đặt lại MK
                        </button>
                        {u.id !== 1 && (
                          <button
                            type="button"
                            className="payment-btn btn-danger"
                            style={{ padding: "3px 8px", fontSize: "11px" }}
                            onClick={() => handleDeleteUser(u.id, u.username)}
                          >
                            Xóa
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section 2: Personal Password Change */}
          <div className="tpl-card">
            <h3>🔑 Đổi mật khẩu tài khoản cá nhân</h3>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px" }}>
              Thay đổi mật khẩu đăng nhập của bạn vào hệ thống
            </div>

            {passMsg && (
              <div className={`auth-msg ${passMsg.type}`}>
                {passMsg.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} style={{ maxWidth: "420px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Mật khẩu hiện tại</label>
                <input
                  type="password"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "5px", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Mật khẩu mới (tối thiểu 4 ký tự)</label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  required
                  minLength={4}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "5px", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  required
                  minLength={4}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "5px", boxSizing: "border-box" }}
                />
              </div>
              <button type="submit" className="payment-btn btn-primary" style={{ alignSelf: "flex-start", marginTop: "4px" }}>
                Lưu mật khẩu mới
              </button>
            </form>
          </div>

          {/* Section 3: Backup & Restore */}
          <div className="tpl-card">
            <h3>💾 Quản lý Sao lưu & Phục hồi cơ sở dữ liệu</h3>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px" }}>
              Tải toàn bộ cơ sở dữ liệu (Đề nghị, NCC, Nhóm hợp đồng, Vật tư bàn giao, Cấu hình in) về máy tính hoặc khôi phục từ tệp JSON.
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button className="payment-btn" onClick={handleExportJson} style={{ padding: "8px 16px" }}>
                ↓ Tải tệp sao lưu JSON
              </button>
              <button
                className="payment-btn"
                onClick={() => restoreFileRef.current?.click()}
                style={{ padding: "8px 16px" }}
              >
                ↑ Khôi phục từ tệp JSON
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* MODAL 2: Excel Paste for Handover */}
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

      {/* MODAL 3: Handover Preview (Biên bản bàn giao 2 bản kèm Logo) */}
      {previewHandoverDept && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card" style={{ maxWidth: "880px", maxHeight: "94vh" }}>
            <div className="payment-modal-header">
              <h3 style={{ color: "#0f766e" }}>
                📄 Xem trước Biên bản bàn giao (Bản in kèm Logo Phenikaa Pharma)
              </h3>
              <button type="button" onClick={() => setPreviewHandoverDept(null)}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", background: "#cbd5e1", padding: "16px", borderRadius: "6px" }}>
              {[1, 2].map((copyNum) => (
                <div key={copyNum} className="handover-paper paper" style={{ marginBottom: "20px" }}>
                  <table className="hb-box">
                    <tbody>
                      <tr>
                        <td className="hb-box-left">
                          <div className="hb-logo">
                            <img
                              src={PHENIKAA_LOGO_SRC}
                              alt="PHENIKAA PHARMA"
                              style={{
                                height: "36px",
                                width: "160px",
                                objectFit: "contain",
                                display: "block",
                                margin: "0 auto",
                              }}
                            />
                          </div>
                          <div className="hb-sender-dept">Bộ phận: Phòng Cung ứng</div>
                        </td>
                        <td className="hb-box-right">
                          <div className="hb-title-main">BIÊN BẢN BÀN GIAO, NGHIỆM THU VẬT TƯ,</div>
                          <div className="hb-title-main">HÀNG HÓA</div>
                          <div className="hb-title-sub">(Không qua kho) - Bản số {copyNum}</div>
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
                      <div>Ông (bà): .................................................... Người nhận hàng</div>
                      <div>Địa chỉ: {previewHandoverDept}</div>
                    </div>
                    <div className="hb-line">Cùng nhau tiến hành giao nhận và nghiệm thu số lượng vật tư sau:</div>
                  </div>

                  <table className="hb-table">
                    <thead>
                      <tr>
                        <th style={{ width: "35px" }}>STT</th>
                        <th>Tên hàng hóa - Quy cách</th>
                        <th style={{ width: "50px" }}>ĐVT</th>
                        <th style={{ width: "75px" }}>SL theo<br />chứng từ</th>
                        <th style={{ width: "75px" }}>SL kiểm tra<br />Đạt</th>
                        <th style={{ width: "75px" }}>SL kiểm tra<br />K.Đạt</th>
                        <th style={{ width: "80px" }}>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewHandoverItems.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td className="center">{idx + 1}</td>
                          <td className="left">{it.item_name || ""}</td>
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
                      Biên bản này được lập thành 02 bản, 01 bản giao cho người giao hàng; 01 bản giao cho người nhận hàng.
                    </div>
                    <div className="hb-sign-row">
                      <div className="hb-sign-col">Người giao hàng<br /><br /><br /><br />Trần Hải Hà</div>
                      <div className="hb-sign-col">Người nhận hàng<br /><br /><br /><br />....................................</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Biên bản hiển thị đầy đủ logo Phenikaa Pharma và lập thành 02 bản giao nhận
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="payment-btn"
                  onClick={() => setPreviewHandoverDept(null)}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  className="payment-btn btn-primary"
                  style={{ background: "#0f766e", borderColor: "#0d5e56" }}
                  onClick={() => {
                    setPreviewHandoverDept(null);
                    setTimeout(() => window.print(), 100);
                  }}
                >
                  🖨️ In biên bản này (2 bản)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: PO Picker Modal */}
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

      {/* PRINT-ONLY AREA */}
      <div id="paymentPrintArea">
        {(() => {
          // If printing single request
          if (previewPaymentReq && !batchPrintReqs) {
            const req = previewPaymentReq;
            const tpl = tplForm;
            const dateParts = parsePrintDate(req.request_date);
            const cur = String(req.currency || "VND").toUpperCase();
            const words = moneyWords({ amount: req.amount, currency: cur });
            const lines = (req.lines && req.lines.length > 0) ? req.lines : [
              { description: req.description || req.item_name || "", invoice_no: req.invoice_no || "", invoice_date: req.invoice_date || "", amount: req.amount },
            ];

            return (
              <div className="paper">
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
                  <div className="val"><b>{req.payee_name || ""}</b></div>
                  <div>+ {tpl.label_address}</div>
                  <div className="val">{req.address || ""}</div>
                  <div>+ {tpl.label_account}</div>
                  <div className="val"><b>{req.account_no || ""}</b></div>
                  <div>+ {tpl.label_bank}</div>
                  <div className="val"><b>{req.bank || ""}</b></div>
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
                      <th style={{ width: "38px" }}>{tpl.col_stt}</th>
                      <th style={{ width: "135px" }}>{tpl.col_invoice}</th>
                      <th>{tpl.col_item}</th>
                      <th style={{ width: "125px" }}>{tpl.col_amount}</th>
                      <th style={{ width: "100px" }}>{tpl.col_note}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, li) => (
                      <tr key={li}>
                        <td>{li + 1}</td>
                        <td>{l.invoice_no ? `${l.invoice_no}${l.invoice_date ? " (" + l.invoice_date + ")" : ""}` : ""}</td>
                        <td style={{ textAlign: "left", paddingLeft: "6px" }}>{l.description}</td>
                        <td style={{ textAlign: "right", paddingRight: "6px" }}>{fmtMoney(l.amount)}</td>
                        <td>{l.note || ""}</td>
                      </tr>
                    ))}
                    <tr className="sum">
                      <td colSpan={3} style={{ textAlign: "center", fontWeight: "bold" }}>{tpl.col_total}</td>
                      <td style={{ textAlign: "right", paddingRight: "6px", fontWeight: "bold" }}>{fmtMoney(req.amount)}</td>
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
          }

          // If printing batch checked requests
          if (batchPrintReqs && batchPrintReqs.length > 0) {
            return batchPrintReqs.map((req) => {
              const tpl = tplForm;
              const dateParts = parsePrintDate(req.request_date);
              const cur = String(req.currency || "VND").toUpperCase();
              const words = moneyWords({ amount: req.amount, currency: cur });
              const lines = (req.lines && req.lines.length > 0) ? req.lines : [
                { description: req.description || req.item_name || "", invoice_no: req.invoice_no || "", invoice_date: req.invoice_date || "", amount: req.amount },
              ];

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
                    <div className="val"><b>{req.payee_name || ""}</b></div>
                    <div>+ {tpl.label_address}</div>
                    <div className="val">{req.address || ""}</div>
                    <div>+ {tpl.label_account}</div>
                    <div className="val"><b>{req.account_no || ""}</b></div>
                    <div>+ {tpl.label_bank}</div>
                    <div className="val"><b>{req.bank || ""}</b></div>
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
                        <th style={{ width: "38px" }}>{tpl.col_stt}</th>
                        <th style={{ width: "135px" }}>{tpl.col_invoice}</th>
                        <th>{tpl.col_item}</th>
                        <th style={{ width: "125px" }}>{tpl.col_amount}</th>
                        <th style={{ width: "100px" }}>{tpl.col_note}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, li) => (
                        <tr key={li}>
                          <td>{li + 1}</td>
                          <td>{l.invoice_no ? `${l.invoice_no}${l.invoice_date ? " (" + l.invoice_date + ")" : ""}` : ""}</td>
                          <td style={{ textAlign: "left", paddingLeft: "6px" }}>{l.description}</td>
                          <td style={{ textAlign: "right", paddingRight: "6px" }}>{fmtMoney(l.amount)}</td>
                          <td>{l.note || ""}</td>
                        </tr>
                      ))}
                      <tr className="sum">
                        <td colSpan={3} style={{ textAlign: "center", fontWeight: "bold" }}>{tpl.col_total}</td>
                        <td style={{ textAlign: "right", paddingRight: "6px", fontWeight: "bold" }}>{fmtMoney(req.amount)}</td>
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
            });
          }

          // If printing Handover
          if (activeTab === "handover" || previewHandoverItems.length > 0) {
            const items =
              previewHandoverItems.length > 0
                ? previewHandoverItems
                : checkedHandovers.size > 0
                ? paymentHandovers.filter((h) => checkedHandovers.has(h.id))
                : filteredHandovers;

            const groupsByDept: Record<string, PaymentHandoverItem[]> = {};
            for (const it of items) {
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
                                  height: "36px",
                                  width: "160px",
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
                              (Không qua kho) - Bản số {copyNum}
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
                        Địa chỉ: Lô đất CN2-10, Khu Công nghệ cao 2, KCNC Hòa Lạc, Xã Hòa Lạc, TP Hà Nội
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
                          <th style={{ width: "35px" }}>STT</th>
                          <th>Tên hàng hóa - Quy cách</th>
                          <th style={{ width: "50px" }}>ĐVT</th>
                          <th style={{ width: "80px" }}>
                            SL theo
                            <br />
                            chứng từ
                          </th>
                          <th style={{ width: "75px" }}>
                            SL kiểm tra
                            <br />
                            Đạt
                          </th>
                          <th style={{ width: "75px" }}>
                            SL kiểm tra
                            <br />
                            K.Đạt
                          </th>
                          <th style={{ width: "75px" }}>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptItems.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="center">{idx + 1}</td>
                            <td className="left">{it.item_name || ""}</td>
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
                        <div className="hb-sign-col">Người giao hàng<br /><br /><br /><br />Trần Hải Hà</div>
                        <div className="hb-sign-col">Người nhận hàng<br /><br /><br /><br />....................................</div>
                      </div>
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ));
          }

          return null;
        })()}
      </div>
    </section>
  );
}
