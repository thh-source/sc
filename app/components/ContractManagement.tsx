"use client";

import React, { useState, useMemo } from "react";
import { Supplier, PO, PaymentGroup, PaymentRequestEntry, Item, PR } from "../types";
import { fmt, dateVN } from "../utils";
import VisualTimeline from "../VisualTimeline";
import DocumentManager from "../DocumentManager";
import { PAID_STATUSES, fmtMoney, normName } from "../payment-utils";
import { SupplierSearchCombobox } from "./SupplierSearchCombobox";
import { TreeProductPickerModal, SelectedItemData } from "./TreeProductPickerModal";
import "../payment.css";

export interface ContractManagementProps {
  pos: PO[];
  suppliers: Supplier[];
  onOpenPO: (po: PO) => void;
  onUpdate: (po: PO) => void;
  onDelete?: (po: PO) => void;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
  paymentGroups?: PaymentGroup[];
  paymentRequests?: PaymentRequestEntry[];
  onUpdateState?: (patch: { paymentGroups?: PaymentGroup[] }) => void;
  onNavigateToPayment?: (filterGroupId?: number | string) => void;
  onCreateContract?: (contractPO: PO, paymentGroup?: PaymentGroup) => void;
  prs?: PR[];
  products?: Item[];
  onAddSupplier?: (supplier: Supplier) => void;
  onAddProduct?: (product: Item) => void;
}

export function ContractManagement({
  pos,
  suppliers,
  onOpenPO,
  onUpdate,
  onDelete,
  workspaceId,
  readOnly = false,
  onStatus,
  paymentGroups = [],
  paymentRequests = [],
  onUpdateState,
  onNavigateToPayment,
  onCreateContract,
  prs = [],
  products = [],
  onAddSupplier,
  onAddProduct,
}: ContractManagementProps) {
  // Main tab switcher: PO Contracts vs Contract Groups
  const [mainTab, setMainTab] = useState<"pos" | "groups">("pos");

  // State for PO-contracts tab
  const [selectedId, setSelectedId] = useState(pos[0]?.id || 0);
  const [tab, setTab] = useState<"timeline" | "documents" | "invoices">("timeline");
  const [query, setQuery] = useState("");

  // State for Contract Groups tab
  const [groupSearch, setGroupSearch] = useState("");
  const [editingGroup, setEditingGroup] = useState<Partial<PaymentGroup> | null>(null);
  const [viewGroupDetails, setViewGroupDetails] = useState<{
    group: PaymentGroup;
    requests: PaymentRequestEntry[];
    budget: number;
    paid: number;
    pending: number;
    remaining: number;
  } | null>(null);

  // State for Create Contract Modal
  const [showCreateContractModal, setShowCreateContractModal] = useState(false);
  const [contractCreationMode, setContractCreationMode] = useState<"direct" | "from_po">("direct");

  // Direct contract creation draft
  const [cNumber, setCNumber] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cSupplierId, setCSupplierId] = useState<number | "">("");
  const [cPrId, setCPrId] = useState<number | "">("");
  const [cSignDate, setCSignDate] = useState("");
  const [cExpectedDate, setCExpectedDate] = useState("");
  const [cNote, setCNote] = useState("");
  const [cCreatePaymentGroup, setCCreatePaymentGroup] = useState(true);
  const [cCustomProductInput, setCCustomProductInput] = useState("");
  const [cItems, setCItems] = useState<
    Array<{
      id: number;
      name: string;
      spec: string;
      unit: string;
      qty: number;
      price: number;
    }>
  >([]);
  const [cError, setCError] = useState("");
  const [showTreePickerModal, setShowTreePickerModal] = useState(false);
  const [inlineProductQuery, setInlineProductQuery] = useState("");
  const [showInlineDropdown, setShowInlineDropdown] = useState(false);

  const cSelectedPR = useMemo(() => {
    if (!cPrId) return null;
    return prs.find((p) => p.id === Number(cPrId)) || null;
  }, [cPrId, prs]);

  // From PO mode draft
  const [selectedPOIdForContract, setSelectedPOIdForContract] = useState<number | "">("");
  const [fromPoContractNumber, setFromPoContractNumber] = useState("");
  const [fromPoContractNote, setFromPoContractNote] = useState("");
  const [fromPoCreateGroup, setFromPoCreateGroup] = useState(true);

  // Group metrics and calculations linked with paymentRequests
  const groupMetrics = useMemo(() => {
    let totalCommitment = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const stats = paymentGroups.map((g) => {
      const budget = Number(g.total_amount) || 0;
      totalCommitment += budget;

      const matchedRequests = paymentRequests.filter(
        (r) =>
          (r.group_id && String(r.group_id) === String(g.id)) ||
          (r.group_code &&
            g.code &&
            r.group_code.trim().toLowerCase() === g.code.trim().toLowerCase())
      );

      let paid = 0;
      let pending = 0;
      for (const r of matchedRequests) {
        const amt = Number(r.amount) || 0;
        if (PAID_STATUSES.includes(r.status)) {
          paid += amt;
        } else if (r.status !== "Đã hủy" && r.status !== "Từ chối") {
          pending += amt;
        }
      }

      totalPaid += paid;
      totalPending += pending;
      const remaining = Math.max(0, budget - paid);
      const progress = budget > 0 ? Math.min(100, Math.round((paid / budget) * 100)) : 0;

      return {
        ...g,
        budget,
        paid,
        pending,
        remaining,
        progress,
        requestCount: matchedRequests.length,
        requests: matchedRequests,
      };
    });

    const totalRemaining = Math.max(0, totalCommitment - totalPaid);

    return {
      stats,
      totalCommitment,
      totalPaid,
      totalPending,
      totalRemaining,
    };
  }, [paymentGroups, paymentRequests]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groupMetrics.stats;
    const q = groupSearch.toLowerCase();
    return groupMetrics.stats.filter(
      (g) =>
        (g.code || "").toLowerCase().includes(q) ||
        (g.name || "").toLowerCase().includes(q) ||
        (g.payee_name || "").toLowerCase().includes(q) ||
        (g.note || "").toLowerCase().includes(q)
    );
  }, [groupMetrics.stats, groupSearch]);

  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editingGroup.code?.trim() || !editingGroup.name?.trim()) {
      alert("Vui lòng nhập Mã và Tên nhóm hợp đồng / đơn hàng!");
      return;
    }
    const nextGroups = [...paymentGroups];
    if (editingGroup.id) {
      const idx = nextGroups.findIndex((g) => g.id === editingGroup.id);
      if (idx >= 0) {
        nextGroups[idx] = {
          ...(nextGroups[idx] as PaymentGroup),
          code: editingGroup.code.trim(),
          name: editingGroup.name.trim(),
          payee_name: editingGroup.payee_name?.trim() || "",
          total_amount: Number(editingGroup.total_amount) || 0,
          currency: editingGroup.currency || "VND",
          note: editingGroup.note?.trim() || "",
        };
      }
    } else {
      const newId = Date.now();
      nextGroups.push({
        id: newId,
        code: editingGroup.code.trim(),
        name: editingGroup.name.trim(),
        payee_name: editingGroup.payee_name?.trim() || "",
        total_amount: Number(editingGroup.total_amount) || 0,
        currency: editingGroup.currency || "VND",
        note: editingGroup.note?.trim() || "",
      });
    }
    onUpdateState?.({ paymentGroups: nextGroups });
    setEditingGroup(null);
  };

  const handleDeleteGroup = (groupId: number) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa nhóm hợp đồng này?")) {
      const nextGroups = paymentGroups.filter((g) => g.id !== groupId);
      onUpdateState?.({ paymentGroups: nextGroups });
    }
  };

  const openCreateContractModal = () => {
    const nextNum = pos.length + 1;
    const year = new Date().getFullYear();
    setCNumber(`HĐ-${year}-${String(nextNum).padStart(3, "0")}`);
    setCTitle("");
    setCSupplierId(suppliers[0]?.id || "");
    setCPrId("");
    setCCustomProductInput("");
    setCSignDate(new Date().toISOString().slice(0, 10));
    setCExpectedDate("");
    setCNote("");
    setCCreatePaymentGroup(true);
    setCItems([
      {
        id: Date.now(),
        name: "Gói hợp đồng cung cấp hàng hóa/dịch vụ",
        spec: "",
        unit: "Gói",
        qty: 1,
        price: 0,
      },
    ]);
    setCError("");

    if (pos.length > 0) {
      const firstPo = pos[0];
      setSelectedPOIdForContract(firstPo.id);
      setFromPoContractNumber(
        firstPo.number.startsWith("HĐ-")
          ? firstPo.number
          : `HĐ-${firstPo.number}`
      );
      setFromPoContractNote(firstPo.contractNote || "");
      setFromPoCreateGroup(true);
    } else {
      setSelectedPOIdForContract("");
      setFromPoContractNumber("");
      setFromPoContractNote("");
      setFromPoCreateGroup(true);
    }

    setContractCreationMode("direct");
    setShowCreateContractModal(true);
  };

  const handleContractSelectPR = (prIdVal: string) => {
    if (!prIdVal) {
      setCPrId("");
      return;
    }
    const prId = Number(prIdVal);
    setCPrId(prId);
    const foundPR = prs.find((p) => p.id === prId);
    if (foundPR) {
      if (!cTitle.trim()) {
        setCTitle(`Hợp đồng thực hiện theo yêu cầu mua sắm ${foundPR.number}`);
      }
      const hasOnlyDefault =
        cItems.length === 0 ||
        (cItems.length === 1 &&
          (cItems[0].name === "Gói hợp đồng cung cấp hàng hóa/dịch vụ" || !cItems[0].name.trim()));
      if (hasOnlyDefault && foundPR.items && foundPR.items.length > 0) {
        setCItems(
          foundPR.items.map((it, idx) => ({
            id: Date.now() + idx,
            name: it.name,
            spec: it.spec || "",
            unit: it.unit || "Cái",
            qty: it.qty || 1,
            price: it.estimate || 0,
          }))
        );
      }
    }
  };

  const handleSelectItemsFromTree = (items: SelectedItemData[]) => {
    setCItems((prev) => {
      const cleanPrev = prev.filter(
        (it) => it.name.trim() !== "" && it.name !== "Gói hợp đồng cung cấp hàng hóa/dịch vụ"
      );
      const newItems = items.map((it, idx) => ({
        id: Date.now() + Math.random() + idx,
        name: it.name,
        spec: it.spec || "",
        unit: it.unit || "Gói",
        qty: it.qty || 1,
        price: it.price || 0,
      }));
      return [...cleanPrev, ...newItems];
    });

    if (!cPrId && items[0]?.sourcePrId) {
      setCPrId(items[0].sourcePrId);
    }
  };

  const filteredInlineProducts = useMemo(() => {
    const q = normName(inlineProductQuery);
    const results: {
      name: string;
      spec?: string;
      unit: string;
      qty: number;
      price: number;
      source: string;
      sourcePrId?: number;
      sourcePrNumber?: string;
    }[] = [];
    const seenNames = new Set<string>();

    if (cSelectedPR && cSelectedPR.items) {
      for (let i = 0; i < cSelectedPR.items.length; i++) {
        if (results.length >= 15) break;
        const it = cSelectedPR.items[i];
        const nName = normName(it.name);
        if (
          !q ||
          nName.includes(q) ||
          normName(it.spec || "").includes(q) ||
          normName(it.code || "").includes(q)
        ) {
          seenNames.add(nName);
          results.push({
            name: it.name,
            spec: it.spec,
            unit: it.unit || "Cái",
            qty: it.qty || 1,
            price: it.estimate || 0,
            source: `PR #${cSelectedPR.number}`,
            sourcePrId: cSelectedPR.id,
            sourcePrNumber: cSelectedPR.number,
          });
        }
      }
    }

    for (let i = 0; i < products.length; i++) {
      if (results.length >= 15) break;
      const p = products[i];
      const nName = normName(p.name);
      if (seenNames.has(nName)) continue;

      if (
        !q ||
        nName.includes(q) ||
        normName(p.spec || "").includes(q) ||
        normName(p.code || "").includes(q) ||
        normName(p.category || "").includes(q)
      ) {
        seenNames.add(nName);
        results.push({
          name: p.name,
          spec: p.spec,
          unit: p.unit || "Gói",
          qty: 1,
          price: p.estimate || 0,
          source: p.category || "Danh mục chung",
        });
      }
    }

    return results;
  }, [inlineProductQuery, cSelectedPR, products]);

  const handleContractAddCustomProduct = (nameInput?: string | any) => {
    const str = typeof nameInput === "string" ? nameInput : cCustomProductInput;
    const trimmed = (str || "").trim();
    if (!trimmed) return;
    const existing = products.find((p) => normName(p.name) === normName(trimmed));
    if (existing) {
      setCItems((prev) => [
        ...prev.filter((x) => x.name.trim() !== "" && x.name !== "Gói hợp đồng cung cấp hàng hóa/dịch vụ"),
        {
          id: Date.now() + Math.random(),
          name: existing.name,
          spec: existing.spec || "",
          unit: existing.unit || "Gói",
          qty: 1,
          price: existing.estimate || 0,
        },
      ]);
    } else {
      const newId = Date.now();
      const nextCode = `VT-${String(products.length + 1).padStart(2, "0")}`;
      const newProd: Item = {
        id: newId,
        code: nextCode,
        category: "Vật tư",
        name: trimmed,
        desc: "",
        spec: "",
        unit: "Gói",
        qty: 1,
        estimate: 0,
      };
      onAddProduct?.(newProd);
      setCItems((prev) => [
        ...prev.filter((x) => x.name.trim() !== "" && x.name !== "Gói hợp đồng cung cấp hàng hóa/dịch vụ"),
        {
          id: newId,
          name: trimmed,
          spec: "",
          unit: "Gói",
          qty: 1,
          price: 0,
        },
      ]);
    }
    setCCustomProductInput("");
  };

  const handleSelectPOForContract = (poIdVal: string) => {
    const pId = Number(poIdVal);
    setSelectedPOIdForContract(pId);
    const target = pos.find((p) => p.id === pId);
    if (target) {
      setFromPoContractNumber(
        target.number.startsWith("HĐ-")
          ? target.number
          : `HĐ-${target.number}`
      );
      setFromPoContractNote(target.contractNote || "");
    }
  };

  const handleSaveContract = () => {
    if (contractCreationMode === "direct") {
      if (!cNumber.trim()) {
        setCError("Vui lòng nhập số hợp đồng.");
        return;
      }
      if (!cSupplierId) {
        setCError("Vui lòng chọn nhà cung cấp / đối tác.");
        return;
      }
      if (cItems.length === 0) {
        setCError("Hợp đồng phải có ít nhất 1 hạng mục / mặt hàng.");
        return;
      }
      const invalid = cItems.find((it) => !it.name.trim() || Number(it.qty) <= 0);
      if (invalid) {
        setCError("Mỗi hạng mục cần có tên và số lượng > 0.");
        return;
      }

      const supplierObj = suppliers.find((s) => s.id === Number(cSupplierId));
      const cTotal = cItems.reduce(
        (s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0),
        0
      );

      const contractPO: PO = {
        id: Date.now(),
        number: cNumber.trim(),
        prNumber: cSelectedPR ? cSelectedPR.number : "Hợp đồng trực tiếp",
        supplierId: Number(cSupplierId),
        createdDate: cSignDate || new Date().toISOString().slice(0, 10),
        expectedDate: cExpectedDate || "",
        status: "Mới tạo",
        contractNote: cNote.trim() || cTitle.trim(),
        note: cTitle.trim() ? `Hợp đồng: ${cTitle.trim()}` : "Hợp đồng kinh tế",
        items: cItems.map((it, idx) => ({
          id: it.id || Date.now() + idx,
          code: `HĐ-${String(idx + 1).padStart(2, "0")}`,
          category: "Hợp đồng",
          name: it.name.trim(),
          desc: "",
          spec: it.spec || "",
          unit: it.unit.trim() || "Gói",
          qty: Number(it.qty) || 1,
          estimate: Number(it.price) || 0,
          price: Number(it.price) || 0,
          deliveryStatus: "Chưa giao",
          deliveredQty: 0,
          deliveryDate: "",
        })),
        docs: [
          {
            id: Date.now() + 1,
            name: "Hợp đồng kinh tế đã ký",
            status: "Chờ bổ sung",
            note: "",
          },
          {
            id: Date.now() + 2,
            name: "Bảo lãnh hợp đồng / Tạm ứng",
            status: "Còn thiếu",
            note: "",
          },
          {
            id: Date.now() + 3,
            name: "Hóa đơn VAT",
            status: "Còn thiếu",
            note: "",
          },
          {
            id: Date.now() + 4,
            name: "Biên bản nghiệm thu bàn giao",
            status: "Còn thiếu",
            note: "",
          },
        ],
        payments: [
          {
            id: Date.now() + 5,
            phase: "Tạm ứng hợp đồng",
            percent: 30,
            amount: Math.round(cTotal * 0.3),
            status: "Chưa thanh toán",
            date: "",
          },
          {
            id: Date.now() + 6,
            phase: "Nghiệm thu thanh toán đợt 2",
            percent: 40,
            amount: Math.round(cTotal * 0.4),
            status: "Chưa thanh toán",
            date: "",
          },
          {
            id: Date.now() + 7,
            phase: "Quyết toán & Thanh lý",
            percent: 30,
            amount:
              cTotal -
              Math.round(cTotal * 0.3) -
              Math.round(cTotal * 0.4),
            status: "Chưa thanh toán",
            date: "",
          },
        ],
      };

      let paymentGroup: PaymentGroup | undefined = undefined;
      if (cCreatePaymentGroup) {
        paymentGroup = {
          id: Date.now() + 10,
          code: cNumber.trim(),
          name:
            cTitle.trim() ||
            `Hợp đồng ${cNumber.trim()} - ${supplierObj?.name || ""}`,
          payee_name: supplierObj?.name || "",
          total_amount: cTotal,
          currency: "VND",
          note: cNote.trim(),
        };
      }

      onCreateContract?.(contractPO, paymentGroup);
      setSelectedId(contractPO.id);
      setShowCreateContractModal(false);
    } else {
      if (!selectedPOIdForContract) {
        setCError("Vui lòng chọn đơn PO để lập hợp đồng.");
        return;
      }
      const targetPO = pos.find((p) => p.id === Number(selectedPOIdForContract));
      if (!targetPO) {
        setCError("Không tìm thấy đơn PO đã chọn.");
        return;
      }

      const updatedPO: PO = {
        ...targetPO,
        contractNote: fromPoContractNote.trim() || targetPO.contractNote,
      };
      onUpdate(updatedPO);

      if (fromPoCreateGroup) {
        const poTotal = targetPO.items.reduce(
          (sum, it) => sum + it.qty * it.price,
          0
        );
        const poSupplier = suppliers.find((s) => s.id === targetPO.supplierId);
        const gCode = fromPoContractNumber.trim() || `HĐ-${targetPO.number}`;
        const newGroup: PaymentGroup = {
          id: Date.now(),
          code: gCode,
          name: `Hợp đồng theo đơn ${targetPO.number}`,
          payee_name: poSupplier?.name || "",
          total_amount: poTotal,
          currency: "VND",
          note: fromPoContractNote.trim() || targetPO.note || "",
        };
        onUpdateState?.({ paymentGroups: [newGroup, ...paymentGroups] });
      }

      setSelectedId(targetPO.id);
      setShowCreateContractModal(false);
    }
  };

  // PO-contract calculations
  const selected = pos.find((p) => p.id === selectedId) || pos[0];
  const supplier = selected ? suppliers.find((s) => s.id === selected.supplierId) : undefined;
  const total = selected ? selected.items.reduce((n, i) => n + i.qty * i.price, 0) : 0;
  const delivered = selected ? selected.items.reduce((n, i) => n + i.deliveredQty, 0) : 0;
  const ordered = selected ? selected.items.reduce((n, i) => n + i.qty, 0) : 0;
  const docsDone = selected ? selected.docs.filter((d) => d.status === "Đã đủ").length : 0;
  const paid = selected
    ? selected.payments
        .filter((p) => p.status === "Đã thanh toán")
        .reduce((n, p) => n + p.amount, 0)
    : 0;

  const shown = pos.filter((p) => {
    const s = suppliers.find((x) => x.id === p.supplierId);
    return (p.number + (s?.name || ""))
      .toLowerCase()
      .includes(query.toLowerCase());
  });

  const events = selected
    ? [
        {
          date: selected.createdDate,
          title: "Phát hành hợp đồng / PO",
          note: `${selected.number} được gửi tới ${supplier?.name || "NCC"}`,
          state: "done",
        },
        ...selected.payments.map((p) => ({
          date: p.date,
          title: `Thanh toán ${p.phase}`,
          note: `${fmt(p.amount)} ₫ · ${p.status}`,
          state: p.status === "Đã thanh toán" ? "done" : "upcoming",
        })),
        ...selected.items
          .filter((i) => i.deliveryDate)
          .map((i) => ({
            date: i.deliveryDate,
            title: `Giao ${i.name}`,
            note: `${i.deliveredQty}/${i.qty} ${i.unit} · ${i.deliveryStatus}`,
            state: i.deliveryStatus === "Đã giao" ? "done" : "warning",
          })),
        ...(selected.expectedDate
          ? [
              {
                date: selected.expectedDate,
                title: "Hạn hoàn tất giao hàng",
                note: `Còn ${Math.max(0, ordered - delivered)} đơn vị chưa giao`,
                state: "warning",
              },
            ]
          : []),
      ]
        .filter((event) => event.date)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <section className="content contract-page">
      <div className="heading">
        <div>
          <em>LIÊN THÔNG PO · HỒ SƠ · GIẢI NGÂN THANH TOÁN</em>
          <h1>Quản lý hợp đồng & Gói đơn hàng</h1>
          <p>Theo dõi tiến độ thực hiện hợp đồng theo PO và tổng hợp giải ngân theo nhóm nội dung hợp đồng.</p>
        </div>
        <div className="actions">
          {mainTab === "pos" ? (
            <>
              {!readOnly && (
                <button
                  className="primary"
                  onClick={() => openCreateContractModal()}
                >
                  ＋ Tạo hợp đồng mới
                </button>
              )}
              {onDelete && selected && (
                <button className="danger-action" onClick={() => onDelete(selected)}>
                  🗑 Xóa hợp đồng
                </button>
              )}
            </>
          ) : (
            <>
              {!readOnly && (
                <button
                  className="primary"
                  onClick={() =>
                    setEditingGroup({
                      code: `HD-${new Date().getFullYear()}-${String(paymentGroups.length + 1).padStart(3, "0")}`,
                      name: "",
                      payee_name: "",
                      total_amount: 0,
                      currency: "VND",
                      note: "",
                    })
                  }
                >
                  ＋ Thêm nhóm hợp đồng / gói
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Sub-tab Bar */}
      <div className="payment-tabs" style={{ marginBottom: "16px" }}>
        <button
          className={`payment-tab-btn ${mainTab === "pos" ? "active" : ""}`}
          onClick={() => setMainTab("pos")}
        >
          <span>📋</span> Hợp đồng theo PO ({pos.length})
        </button>
        <button
          className={`payment-tab-btn ${mainTab === "groups" ? "active" : ""}`}
          onClick={() => setMainTab("groups")}
        >
          <span>📑</span> Nhóm nội dung hợp đồng & Đơn hàng ({paymentGroups.length})
        </button>
      </div>

      {/* TAB 1: PO CONTRACTS */}
      {mainTab === "pos" && (
        <>
          {!selected ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
              <h3>Chưa có hợp đồng nào</h3>
              <p>Bạn có thể tạo hợp đồng trực tiếp mới hoặc phát hành PO từ Quản lý PO.</p>
              {!readOnly && (
                <button
                  className="primary"
                  style={{ marginTop: 14 }}
                  onClick={() => openCreateContractModal()}
                >
                  ＋ Tạo hợp đồng mới
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="contract-kpis">
                <article>
                  <span>Tổng hợp đồng</span>
                  <b>{pos.length}</b>
                  <small>
                    {pos.filter((p) => p.status !== "Hoàn thành").length} đang thực hiện
                  </small>
                </article>
                <article>
                  <span>Tổng giá trị</span>
                  <b>
                    {fmt(
                      pos.reduce(
                        (n, p) => n + p.items.reduce((s, i) => s + i.qty * i.price, 0),
                        0
                      )
                    )}{" "}
                    ₫
                  </b>
                  <small>Liên thông từ PO</small>
                </article>
                <article className="warn">
                  <span>Sắp đến hạn giao</span>
                  <b>{pos.filter((p) => p.expectedDate).length}</b>
                  <small>Trong 7 ngày tới</small>
                </article>
                <article className="danger">
                  <span>Hồ sơ còn thiếu</span>
                  <b>
                    {pos.reduce(
                      (n, p) => n + p.docs.filter((d) => d.status !== "Đã đủ").length,
                      0
                    )}
                  </b>
                  <small>Cần bổ sung trước thanh toán</small>
                </article>
              </div>

              <div className="contract-layout">
                <aside className="contract-list">
                  <div className="contract-search">
                    ⌕
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Tìm hợp đồng, PO, NCC..."
                    />
                  </div>
                  {shown.map((po) => {
                    const s = suppliers.find((x) => x.id === po.supplierId);
                    const value = po.items.reduce((n, x) => n + x.qty * x.price, 0);
                    return (
                      <button
                        className={po.id === selected.id ? "selected" : ""}
                        key={po.id}
                        onClick={() => setSelectedId(po.id)}
                      >
                        <div>
                          <strong>HĐ-{po.number}</strong>
                          <i>{po.status}</i>
                        </div>
                        <b>{s?.name}</b>
                        <span>Liên kết {po.number}</span>
                        <footer>
                          <small>{dateVN(po.createdDate)}</small>
                          <strong>{fmt(value)} ₫</strong>
                        </footer>
                      </button>
                    );
                  })}
                </aside>

                <div className="contract-detail">
                  <div className="contract-hero">
                    <div>
                      <span>HĐ-{selected.number}</span>
                      <h2>Hợp đồng cung cấp hàng hóa</h2>
                      <p>
                        {supplier?.code} · {supplier?.name}
                      </p>
                    </div>
                    <div>
                      <button onClick={() => onOpenPO(selected)}>
                        Mở PO liên kết ↗
                      </button>
                      <strong>{fmt(total)} ₫</strong>
                      <small>
                        {selected.expectedDate
                          ? `Hạn giao ${dateVN(selected.expectedDate)}`
                          : "Chưa thiết lập hạn giao"}
                      </small>
                    </div>
                  </div>

                  <section className="common-note-card contract-common-note">
                    <label>
                      <span>✎ Ghi chú chung hợp đồng</span>
                      <textarea
                        rows={3}
                        value={selected.contractNote || ""}
                        placeholder="Diễn giải tự do về điều khoản, phụ lục hoặc lưu ý của hợp đồng..."
                        onChange={(e) =>
                          onUpdate({ ...selected, contractNote: e.target.value })
                        }
                      />
                    </label>
                  </section>

                  {selected.expectedDate && (
                    <div className="deadline-alert">
                      <i>!</i>
                      <div>
                        <b>Sắp đến hạn giao hàng</b>
                        <p>
                          Hạn giao dự kiến {dateVN(selected.expectedDate)} · Còn{" "}
                          {Math.max(0, ordered - delivered)} đơn vị chưa giao. Cần xác
                          nhận tiến độ với nhà cung cấp.
                        </p>
                      </div>
                      <button onClick={() => onOpenPO(selected)}>
                        Cập nhật giao hàng
                      </button>
                    </div>
                  )}

                  <div className="contract-progress">
                    <article>
                      <span>Giao hàng</span>
                      <b>{ordered ? Math.round((delivered / ordered) * 100) : 0}%</b>
                      <div>
                        <i
                          style={{
                            width: `${ordered ? (delivered / ordered) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <small>
                        {delivered}/{ordered} đơn vị đã giao
                      </small>
                    </article>
                    <article>
                      <span>Hồ sơ</span>
                      <b>
                        {selected.docs.length
                          ? Math.round((docsDone / selected.docs.length) * 100)
                          : 0}
                        %
                      </b>
                      <div>
                        <i
                          style={{
                            width: `${selected.docs.length ? (docsDone / selected.docs.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <small>
                        {docsDone}/{selected.docs.length} hồ sơ đầy đủ
                      </small>
                    </article>
                    <article>
                      <span>Thanh toán</span>
                      <b>{total ? Math.round((paid / total) * 100) : 0}%</b>
                      <div>
                        <i style={{ width: `${total ? (paid / total) * 100 : 0}%` }} />
                      </div>
                      <small>
                        {fmt(paid)} / {fmt(total)} ₫
                      </small>
                    </article>
                  </div>

                  <div className="contract-tabs">
                    <button
                      className={tab === "timeline" ? "active" : ""}
                      onClick={() => setTab("timeline")}
                    >
                      Timeline
                    </button>
                    <button
                      className={tab === "documents" ? "active" : ""}
                      onClick={() => setTab("documents")}
                    >
                      Hồ sơ ({selected.docs.length})
                    </button>
                    <button
                      className={tab === "invoices" ? "active" : ""}
                      onClick={() => setTab("invoices")}
                    >
                      Hóa đơn
                    </button>
                  </div>

                  {tab === "timeline" && (
                    <div className="contract-timeline">
                      <VisualTimeline
                        empty="Chưa có mốc giao hàng hoặc thanh toán."
                        items={events.map((e, i) => ({
                          id: i,
                          date: e.date,
                          title: e.title,
                          note: e.note,
                          status:
                            e.state === "done"
                              ? "done"
                              : e.state === "warning"
                                ? "late"
                                : "todo",
                        }))}
                      />
                    </div>
                  )}

                  {tab === "documents" && (
                    <div className="contract-docs">
                      <div className="contract-doc-requirements">
                        {selected.docs.map((d) => (
                          <article key={d.id}>
                            <i className={d.status === "Đã đủ" ? "ok" : "missing"}>
                              {d.status === "Đã đủ" ? "✓" : "!"}
                            </i>
                            <div>
                              <b>{d.name}</b>
                              <p>{d.note || "Không có ghi chú"}</p>
                            </div>
                            <span className={d.status === "Đã đủ" ? "ok" : "missing"}>
                              {d.status}
                            </span>
                            <small>
                              {d.status !== "Đã đủ" ? "Chưa hoàn thiện" : "Đã kiểm tra"}
                            </small>
                          </article>
                        ))}
                      </div>
                      {!readOnly && (
                        <DocumentManager
                          title={`File hợp đồng HĐ-${selected.number}`}
                          entityType="contract"
                          entityId={String(selected.id)}
                          workspaceId={workspaceId}
                          readOnly={readOnly}
                          onStatus={onStatus}
                        />
                      )}
                    </div>
                  )}

                  {tab === "invoices" && (
                    <div className="invoice-table empty-state">
                      Chưa có dữ liệu hóa đơn. Hóa đơn sẽ hiển thị sau khi được cập nhật
                      vào PO.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 2: CONTRACT GROUPS / PO PACKAGES (NHÓM HỢP ĐỒNG & GIẢI NGÂN) */}
      {mainTab === "groups" && (
        <div className="payment-management">
          {/* Summary KPI Cards */}
          <div className="payment-summary-cards">
            <div className="payment-card card-primary">
              <span className="payment-card-label">Tổng nhóm HĐ / Gói</span>
              <span className="payment-card-value">{paymentGroups.length}</span>
              <span className="payment-card-sub">Quản lý theo gói thầu / hợp đồng</span>
            </div>
            <div className="payment-card">
              <span className="payment-card-label">Tổng giá trị cam kết</span>
              <span className="payment-card-value">{fmtMoney(groupMetrics.totalCommitment)} ₫</span>
              <span className="payment-card-sub">Tổng ngân sách hợp đồng</span>
            </div>
            <div className="payment-card card-success">
              <span className="payment-card-label">Đã giải ngân (Đã chi)</span>
              <span className="payment-card-value" style={{ color: "#10b981" }}>
                {fmtMoney(groupMetrics.totalPaid)} ₫
              </span>
              <span className="payment-card-sub">
                {groupMetrics.totalCommitment > 0
                  ? `Đạt ${Math.round((groupMetrics.totalPaid / groupMetrics.totalCommitment) * 100)}% kế hoạch`
                  : "Chưa phát sinh"}
              </span>
            </div>
            <div className="payment-card card-warning">
              <span className="payment-card-label">Đang giải quyết</span>
              <span className="payment-card-value" style={{ color: "#f59e0b" }}>
                {fmtMoney(groupMetrics.totalPending)} ₫
              </span>
              <span className="payment-card-sub">Chờ kế toán / đi tiền</span>
            </div>
            <div className="payment-card">
              <span className="payment-card-label">Còn lại cần giải ngân</span>
              <span className="payment-card-value">{fmtMoney(groupMetrics.totalRemaining)} ₫</span>
              <span className="payment-card-sub">Dư địa hợp đồng</span>
            </div>
          </div>

          {/* Search & Actions Toolbar */}
          <div className="payment-toolbar">
            <div className="payment-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="payment-input"
                placeholder="Tìm mã HĐ, tên nhóm gói, nhà cung cấp..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
              {groupSearch && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setGroupSearch("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="toolbar-actions" style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              {!readOnly && (
                <button
                  className="payment-btn payment-btn-primary"
                  onClick={() =>
                    setEditingGroup({
                      code: `HD-${new Date().getFullYear()}-${String(paymentGroups.length + 1).padStart(3, "0")}`,
                      name: "",
                      payee_name: "",
                      total_amount: 0,
                      currency: "VND",
                      note: "",
                    })
                  }
                >
                  ＋ Thêm nhóm hợp đồng mới
                </button>
              )}
            </div>
          </div>

          {/* Groups Data Table */}
          <div className="payment-table-container">
            <div className="payment-table-scroll">
              <table
                className="payment-table"
                style={{
                  tableLayout: "fixed",
                  width: "100%",
                  minWidth: "1480px",
                }}
              >
                <colgroup>
                  <col style={{ width: "50px" }} />
                  <col style={{ width: "135px" }} />
                  <col style={{ width: "240px" }} />
                  <col style={{ width: "200px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "125px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "125px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ minWidth: "160px" }} />
                  {!readOnly && <col style={{ width: "85px" }} />}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ width: 50, textAlign: "center", position: "sticky", left: 0, zIndex: 20, background: "#f1f5f9" }}>STT</th>
                    <th style={{ width: 135 }}>Mã nhóm / HĐ</th>
                    <th>Tên nhóm hợp đồng / Gói thầu</th>
                    <th>Đối tác / NCC</th>
                    <th style={{ width: 130, textAlign: "right" }}>Giá trị HĐ</th>
                    <th style={{ width: 125, textAlign: "right" }}>Đã giải ngân</th>
                    <th style={{ width: 120, textAlign: "right" }}>Đang xử lý</th>
                    <th style={{ width: 125, textAlign: "right" }}>Còn lại</th>
                    <th style={{ width: 110, textAlign: "center" }}>Tiến độ</th>
                    <th style={{ width: 110, textAlign: "center" }}>Phiếu TT</th>
                    <th>Ghi chú</th>
                    {!readOnly && <th style={{ width: 85, textAlign: "center" }}>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.length === 0 ? (
                    <tr>
                      <td colSpan={readOnly ? 11 : 12} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                        {groupSearch
                          ? "Không tìm thấy nhóm hợp đồng nào phù hợp với từ khóa."
                          : "Chưa có nhóm hợp đồng / gói đơn hàng nào. Bấm '＋ Thêm nhóm hợp đồng mới' để tạo."}
                      </td>
                    </tr>
                  ) : (
                    filteredGroups.map((g, idx) => {
                      const isEven = idx % 2 === 1;
                      const rowBg = isEven ? "#f8fafc" : "#ffffff";
                      return (
                        <tr key={g.id}>
                          <td style={{ textAlign: "center", color: "#64748b", fontWeight: 600, position: "sticky", left: 0, zIndex: 10, background: rowBg }}>{idx + 1}</td>
                          <td>
                            <strong style={{ color: "#0284c7", fontFamily: "monospace", fontSize: 13 }}>
                              {g.code}
                            </strong>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.name}>{g.name}</div>
                          </td>
                          <td>
                            <span style={{ color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title={g.payee_name || ""}>{g.payee_name || "—"}</span>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                            {fmtMoney(g.budget)} <small style={{ color: "#64748b" }}>{g.currency || "VND"}</small>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "#10b981" }}>
                            {fmtMoney(g.paid)}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: "#f59e0b" }}>
                            {fmtMoney(g.pending)}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: g.remaining === 0 ? "#10b981" : "#475569" }}>
                            {fmtMoney(g.remaining)}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: g.progress >= 100 ? "#10b981" : "#0284c7" }}>
                                {g.progress}%
                              </span>
                              <div
                                style={{
                                  width: "70px",
                                  height: "6px",
                                  background: "#e2e8f0",
                                  borderRadius: "4px",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${g.progress}%`,
                                    height: "100%",
                                    background: g.progress >= 100 ? "#10b981" : "#0284c7",
                                    borderRadius: "4px",
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              className="payment-btn payment-btn-sm"
                              style={{
                                fontSize: "11.5px",
                                padding: "3px 8px",
                                color: g.requestCount > 0 ? "#0284c7" : "#94a3b8",
                                borderColor: g.requestCount > 0 ? "#bae6fd" : "#e2e8f0",
                                background: g.requestCount > 0 ? "#f0f9ff" : "#f8fafc",
                              }}
                              onClick={() => {
                                setViewGroupDetails({
                                  group: g,
                                  requests: g.requests,
                                  budget: g.budget,
                                  paid: g.paid,
                                  pending: g.pending,
                                  remaining: g.remaining,
                                });
                              }}
                              title="Bấm để xem danh sách phiếu đề nghị thanh toán của nhóm này"
                            >
                              ↗ {g.requestCount} phiếu
                            </button>
                          </td>
                          <td style={{ fontSize: "12px", color: "#64748b" }} title={g.note || ""}>{g.note || "—"}</td>
                          {!readOnly && (
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                                <button
                                  type="button"
                                  className="payment-btn payment-btn-sm"
                                  onClick={() => setEditingGroup(g)}
                                  title="Sửa nhóm hợp đồng"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="payment-btn payment-btn-sm payment-btn-danger"
                                  onClick={() => handleDeleteGroup(g.id)}
                                  title="Xóa nhóm hợp đồng"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Details Modal: Linked Payment Requests */}
          {viewGroupDetails && (
            <div className="payment-modal-backdrop" onClick={() => setViewGroupDetails(null)}>
              <div
                className="payment-modal"
                style={{ maxWidth: 860, width: "95%" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="payment-modal-header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>
                      📑 Chi tiết giải ngân: {viewGroupDetails.group.code} - {viewGroupDetails.group.name}
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                      Đối tác: <strong>{viewGroupDetails.group.payee_name || "Chưa xác định"}</strong> · Ngân sách:{" "}
                      <strong>{fmtMoney(viewGroupDetails.budget)} {viewGroupDetails.group.currency || "VND"}</strong>
                    </p>
                  </div>
                  <button
                    className="modal-close-btn"
                    onClick={() => setViewGroupDetails(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="payment-modal-body" style={{ maxHeight: "65vh", overflowY: "auto", padding: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "10px" }}>
                      <span style={{ fontSize: 11, color: "#166534", fontWeight: 600 }}>ĐÃ THANH TOÁN</span>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>{fmtMoney(viewGroupDetails.paid)} ₫</div>
                    </div>
                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "10px" }}>
                      <span style={{ fontSize: 11, color: "#92400e", fontWeight: 600 }}>ĐANG XỬ LÝ</span>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#b45309" }}>{fmtMoney(viewGroupDetails.pending)} ₫</div>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px" }}>
                      <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>CÒN LẠI</span>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{fmtMoney(viewGroupDetails.remaining)} ₫</div>
                    </div>
                  </div>

                  <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>
                    Danh sách phiếu đề nghị thanh toán ({viewGroupDetails.requests.length} phiếu):
                  </h4>

                  {viewGroupDetails.requests.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: 6 }}>
                      Chưa có phiếu thanh toán nào được gắn với nhóm hợp đồng này.
                    </div>
                  ) : (
                    <table className="payment-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 45, textAlign: "center" }}>STT</th>
                          <th style={{ width: 100 }}>Ngày ĐN</th>
                          <th style={{ width: 110 }}>Loại TT</th>
                          <th>Nội dung thanh toán</th>
                          <th style={{ width: 120, textAlign: "right" }}>Số tiền</th>
                          <th style={{ width: 140, textAlign: "center" }}>Trạng thái</th>
                          <th style={{ width: 110 }}>Người đề nghị</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewGroupDetails.requests.map((r, i) => (
                          <tr key={r.id}>
                            <td style={{ textAlign: "center", color: "#64748b" }}>{i + 1}</td>
                            <td>{r.request_date || "—"}</td>
                            <td><span className="payment-badge">{r.payment_type || "TT"}</span></td>
                            <td><strong>{r.description}</strong></td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                              {fmtMoney(r.amount)} <small>{r.currency || "VND"}</small>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span
                                className={`payment-badge ${
                                  PAID_STATUSES.includes(r.status)
                                    ? "status-done"
                                    : r.status === "Đã giao KT, chờ đi tiền"
                                    ? "status-transfer"
                                    : "status-processing"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td style={{ color: "#475569" }}>{r.created_by_name || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="payment-modal-footer" style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px" }}>
                  {onNavigateToPayment && (
                    <button
                      type="button"
                      className="payment-btn payment-btn-primary"
                      onClick={() => {
                        const gid = viewGroupDetails.group.id;
                        setViewGroupDetails(null);
                        onNavigateToPayment(gid);
                      }}
                    >
                      Mở trong Tab Thanh toán ↗
                    </button>
                  )}
                  <button
                    type="button"
                    className="payment-btn"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setViewGroupDetails(null)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal to Add / Edit Group */}
          {editingGroup && (
            <div className="payment-modal-backdrop" onClick={() => setEditingGroup(null)}>
              <div
                className="payment-modal"
                style={{ maxWidth: 580, width: "95%" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="payment-modal-header">
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    {editingGroup.id ? "✏️ Sửa nhóm hợp đồng / gói" : "＋ Thêm nhóm hợp đồng / gói mới"}
                  </h3>
                  <button
                    className="modal-close-btn"
                    onClick={() => setEditingGroup(null)}
                  >
                    ✕
                  </button>
                </div>
                <form onSubmit={handleSaveGroup}>
                  <div className="payment-modal-body" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Mã nhóm / Hợp đồng <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <input
                          type="text"
                          required
                          className="payment-input"
                          style={{ width: "100%" }}
                          placeholder="VD: HD-2024-001 hoặc GOI-01"
                          value={editingGroup.code || ""}
                          onChange={(e) => setEditingGroup({ ...editingGroup, code: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Loại tiền tệ
                        </label>
                        <select
                          className="payment-select"
                          style={{ width: "100%" }}
                          value={editingGroup.currency || "VND"}
                          onChange={(e) => setEditingGroup({ ...editingGroup, currency: e.target.value })}
                        >
                          <option value="VND">VND (Việt Nam Đồng)</option>
                          <option value="USD">USD (Đô la Mỹ)</option>
                          <option value="EUR">EUR (Euro)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                        Tên nhóm hợp đồng / Gói thầu <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="payment-input"
                        style={{ width: "100%" }}
                        placeholder="VD: Cung cấp thiết bị kiểm nghiệm HPLC và phụ tùng"
                        value={editingGroup.name || ""}
                        onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Nhà cung cấp / Đơn vị thực hiện
                        </label>
                        <input
                          type="text"
                          list="contract-suppliers-list"
                          className="payment-input"
                          style={{ width: "100%" }}
                          placeholder="Chọn hoặc nhập tên NCC"
                          value={editingGroup.payee_name || ""}
                          onChange={(e) => setEditingGroup({ ...editingGroup, payee_name: e.target.value })}
                        />
                        <datalist id="contract-suppliers-list">
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.name}>
                              {s.code} - {s.name}
                            </option>
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                          Tổng giá trị ngân sách
                        </label>
                        <input
                          type="number"
                          className="payment-input"
                          style={{ width: "100%" }}
                          placeholder="VD: 500000000"
                          value={editingGroup.total_amount || ""}
                          onChange={(e) => setEditingGroup({ ...editingGroup, total_amount: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                        Ghi chú
                      </label>
                      <textarea
                        rows={2}
                        className="payment-input"
                        style={{ width: "100%", resize: "vertical" }}
                        placeholder="Ghi chú điều khoản, số quyết định phê duyệt..."
                        value={editingGroup.note || ""}
                        onChange={(e) => setEditingGroup({ ...editingGroup, note: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="payment-modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px" }}>
                    <button
                      type="button"
                      className="payment-btn"
                      onClick={() => setEditingGroup(null)}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="payment-btn payment-btn-primary"
                    >
                      Lưu thông tin
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE CONTRACT MODAL */}
      {showCreateContractModal && (
        <div
          className="payment-modal-overlay"
          onClick={() => setShowCreateContractModal(false)}
        >
          <div
            className="payment-modal-card"
            style={{ maxWidth: 880, width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>
                  ＋ Tạo hợp đồng kinh tế / Gói thầu mới
                </h3>
                <small style={{ color: "#64748b" }}>
                  Khởi tạo hợp đồng trực tiếp không qua luồng so sánh báo giá
                </small>
              </div>
              <button
                type="button"
                className="payment-modal-close"
                onClick={() => setShowCreateContractModal(false)}
              >
                ×
              </button>
            </div>

            {/* Mode selector */}
            <div
              style={{
                display: "flex",
                gap: 8,
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: 8,
              }}
            >
              <button
                type="button"
                className={`payment-tab-btn ${contractCreationMode === "direct" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background:
                    contractCreationMode === "direct" ? "#0284c7" : "#fff",
                  color: contractCreationMode === "direct" ? "#fff" : "#334155",
                  fontWeight: 600,
                }}
                onClick={() => setContractCreationMode("direct")}
              >
                📄 Tạo hợp đồng trực tiếp mới
              </button>
              <button
                type="button"
                disabled={pos.length === 0}
                className={`payment-tab-btn ${contractCreationMode === "from_po" ? "active" : ""}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: pos.length === 0 ? "not-allowed" : "pointer",
                  border: "1px solid #cbd5e1",
                  background:
                    contractCreationMode === "from_po" ? "#0284c7" : "#fff",
                  color: contractCreationMode === "from_po" ? "#fff" : "#334155",
                  fontWeight: 600,
                  opacity: pos.length === 0 ? 0.5 : 1,
                }}
                onClick={() => setContractCreationMode("from_po")}
              >
                🔗 Tạo liên kết từ PO sẵn có ({pos.length})
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxHeight: "72vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {contractCreationMode === "direct" ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Số hợp đồng <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="payment-input"
                        style={{ width: "100%" }}
                        value={cNumber}
                        onChange={(e) => setCNumber(e.target.value)}
                        placeholder="VD: HĐ-2026-001 hoặc HĐ/PKN/2026"
                      />
                    </div>

                    <div>
                      <SupplierSearchCombobox
                        suppliers={suppliers}
                        selectedSupplierId={cSupplierId}
                        onSelectSupplier={(id) => setCSupplierId(id)}
                        onAddSupplier={onAddSupplier}
                        required
                        label="Nhà cung cấp / Đối tác"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Nguồn PR (Tùy chọn)
                      </label>
                      <select
                        className="payment-input"
                        style={{
                          width: "100%",
                          borderColor: cSelectedPR ? "#0284c7" : "#cbd5e1",
                          background: cSelectedPR ? "#f0f9ff" : "#fff",
                          fontWeight: cSelectedPR ? 600 : 400,
                        }}
                        value={cPrId}
                        onChange={(e) => handleContractSelectPR(e.target.value)}
                      >
                        <option value="">Lập trực tiếp (Không qua PR)</option>
                        {prs.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.number} - {pr.department || "PR"} ({pr.items?.length || 0} mặt hàng)
                          </option>
                        ))}
                      </select>
                    </div>

                    {cSelectedPR && (
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: "6px",
                          padding: "8px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "8px",
                          fontSize: "12px",
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, color: "#166534" }}>
                            🔗 Đã liên kết với {cSelectedPR.number} ({cSelectedPR.department || "PR"}):
                          </span>{" "}
                          <span style={{ color: "#334155" }}>
                            Danh sách chọn mặt hàng bên dưới sẽ lọc theo {cSelectedPR.items?.length || 0} mặt hàng của PR này
                          </span>
                        </div>
                        <button
                          type="button"
                          className="payment-btn"
                          style={{
                            padding: "3px 8px",
                            fontSize: "11px",
                            background: "#fff",
                            color: "#166534",
                            borderColor: "#86efac",
                            fontWeight: 600,
                          }}
                          onClick={() => {
                            if (cSelectedPR.items && cSelectedPR.items.length > 0) {
                              setCItems(
                                cSelectedPR.items.map((it, idx) => ({
                                  id: Date.now() + Math.random() + idx,
                                  name: it.name,
                                  spec: it.spec || "",
                                  unit: it.unit || "Cái",
                                  qty: it.qty || 1,
                                  price: it.estimate || 0,
                                }))
                              );
                            }
                          }}
                        >
                          📥 Nạp nhanh toàn bộ {cSelectedPR.items?.length || 0} mặt hàng từ PR
                        </button>
                      </div>
                    )}

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Tên / Trích yếu nội dung hợp đồng
                      </label>
                      <input
                        type="text"
                        className="payment-input"
                        style={{ width: "100%" }}
                        value={cTitle}
                        onChange={(e) => setCTitle(e.target.value)}
                        placeholder="VD: Cung cấp thiết bị phòng thí nghiệm & phụ tùng thay thế"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Ngày ký kết
                      </label>
                      <input
                        type="date"
                        className="payment-input"
                        style={{ width: "100%" }}
                        value={cSignDate}
                        onChange={(e) => setCSignDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Thời hạn hoàn thành / Giao hàng
                      </label>
                      <input
                        type="date"
                        className="payment-input"
                        style={{ width: "100%" }}
                        value={cExpectedDate}
                        onChange={(e) => setCExpectedDate(e.target.value)}
                      />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Điều khoản / Ghi chú hợp đồng
                      </label>
                      <textarea
                        rows={2}
                        className="payment-input"
                        style={{ width: "100%", resize: "vertical" }}
                        value={cNote}
                        onChange={(e) => setCNote(e.target.value)}
                        placeholder="Ghi chú điều khoản thanh toán, bảo hành, nghiệm thu..."
                      />
                    </div>
                  </div>

                  {/* Items section */}
                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div>
                        <h4 style={{ margin: 0, fontSize: 14, color: "#1e293b" }}>
                          Hạng mục / Chi tiết hợp đồng ({cItems.length})
                        </h4>
                        {cSelectedPR && (
                          <span style={{ fontSize: 11.5, color: "#0369a1", fontWeight: 600 }}>
                            (Chỉ hiển thị mặt hàng & số lượng thuộc PR #{cSelectedPR.number})
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {/* TREE PICKER BUTTON */}
                        <button
                          type="button"
                          className="payment-btn"
                          style={{
                            background: "#0284c7",
                            borderColor: "#0369a1",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "12px",
                            padding: "6px 14px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                          }}
                          onClick={() => setShowTreePickerModal(true)}
                          title="Mở cây thư mục theo Phòng ban → Phiếu PR hoặc Danh mục sản phẩm để tích chọn"
                        >
                          <span>🌲 Duyệt Cây thư mục PR & Danh mục</span>
                        </button>

                        {/* INLINE FAST-SEARCH COMBOBOX */}
                        <div style={{ position: "relative" }}>
                          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <input
                              type="text"
                              className="payment-input"
                              style={{ fontSize: 12, width: 230 }}
                              placeholder="Gõ tìm nhanh sản phẩm..."
                              value={inlineProductQuery}
                              onFocus={() => setShowInlineDropdown(true)}
                              onChange={(e) => {
                                setInlineProductQuery(e.target.value);
                                setShowInlineDropdown(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && inlineProductQuery.trim()) {
                                  e.preventDefault();
                                  handleContractAddCustomProduct(inlineProductQuery.trim());
                                  setInlineProductQuery("");
                                  setShowInlineDropdown(false);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="payment-btn payment-btn-sm"
                              style={{
                                padding: "5px 9px",
                                fontSize: "11.5px",
                                background: "#f0fdf4",
                                color: "#166534",
                                borderColor: "#bbf7d0",
                                fontWeight: 600,
                              }}
                              onClick={() => {
                                if (inlineProductQuery.trim()) {
                                  handleContractAddCustomProduct(inlineProductQuery.trim());
                                  setInlineProductQuery("");
                                  setShowInlineDropdown(false);
                                }
                              }}
                              title="Thêm mặt hàng này vào danh sách hợp đồng"
                            >
                              ＋ Thêm
                            </button>
                          </div>

                          {showInlineDropdown && (
                            <div
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                marginTop: "4px",
                                width: "330px",
                                maxHeight: "270px",
                                overflowY: "auto",
                                background: "#ffffff",
                                border: "1px solid #cbd5e1",
                                borderRadius: "8px",
                                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                                zIndex: 9999,
                              }}
                            >
                              <div
                                style={{
                                  padding: "6px 10px",
                                  background: "#f1f5f9",
                                  borderBottom: "1px solid #e2e8f0",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  color: "#475569",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span>Gợi ý nhanh ({filteredInlineProducts.length})</span>
                                <button
                                  type="button"
                                  style={{ border: 0, background: "none", color: "#64748b", cursor: "pointer", fontSize: "11px" }}
                                  onClick={() => setShowInlineDropdown(false)}
                                >
                                  ✕ Đóng
                                </button>
                              </div>

                              {filteredInlineProducts.map((p, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    padding: "7px 10px",
                                    borderBottom: "1px solid #f1f5f9",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                                  onClick={() => {
                                    setCItems((prev) => [
                                      ...prev.filter((x) => x.name.trim() !== "" && x.name !== "Gói hợp đồng cung cấp hàng hóa/dịch vụ"),
                                      {
                                        id: Date.now() + Math.random(),
                                        name: p.name,
                                        spec: p.spec || "",
                                        unit: p.unit || "Gói",
                                        qty: p.qty || 1,
                                        price: p.price || 0,
                                      },
                                    ]);
                                    if (!cPrId && p.sourcePrId) {
                                      setCPrId(p.sourcePrId);
                                    }
                                    setInlineProductQuery("");
                                    setShowInlineDropdown(false);
                                  }}
                                >
                                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{p.name}</div>
                                  <div style={{ fontSize: "11px", color: "#64748b", display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                                    <span>{p.source}</span>
                                    <span>SL: {p.qty} {p.unit} · {fmt(p.price)} ₫</span>
                                  </div>
                                </div>
                              ))}

                              {filteredInlineProducts.length === 0 && (
                                <div style={{ padding: "12px", textAlign: "center", fontSize: "12px", color: "#64748b" }}>
                                  Không tìm thấy sản phẩm.
                                  {inlineProductQuery.trim() && (
                                    <button
                                      type="button"
                                      className="payment-btn payment-btn-sm"
                                      style={{ marginTop: "6px", width: "100%", background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}
                                      onClick={() => {
                                        handleContractAddCustomProduct(inlineProductQuery.trim());
                                        setInlineProductQuery("");
                                        setShowInlineDropdown(false);
                                      }}
                                    >
                                      ＋ Thêm mới "{inlineProductQuery.trim()}"
                                    </button>
                                  )}
                                </div>
                              )}

                              <div
                                style={{
                                  padding: "6px 10px",
                                  background: "#f8fafc",
                                  borderTop: "1px solid #e2e8f0",
                                  textAlign: "center",
                                }}
                              >
                                <button
                                  type="button"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#0284c7",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
                                  onClick={() => {
                                    setShowInlineDropdown(false);
                                    setShowTreePickerModal(true);
                                  }}
                                >
                                  🌲 Mở Cây thư mục PR & Danh mục đầy đủ →
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="payment-btn"
                          onClick={() =>
                            setCItems((prev) => [
                              ...prev,
                              {
                                id: Date.now() + Math.random(),
                                name: "",
                                spec: "",
                                unit: "Gói",
                                qty: 1,
                                price: 0,
                              },
                            ])
                          }
                        >
                          ＋ Dòng trống
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        overflowX: "auto",
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              background: "#f8fafc",
                              borderBottom: "1px solid #cbd5e1",
                            }}
                          >
                            <th
                              style={{
                                padding: "8px 6px",
                                textAlign: "center",
                                width: 35,
                              }}
                            >
                              STT
                            </th>
                            <th style={{ padding: "8px 6px", textAlign: "left" }}>
                              Tên hạng mục / Hàng hóa dịch vụ <span style={{ color: "#ef4444" }}>*</span>
                            </th>
                            <th
                              style={{
                                padding: "8px 6px",
                                textAlign: "left",
                                width: 140,
                              }}
                            >
                              Quy cách / Ghi chú
                            </th>
                            <th
                              style={{
                                padding: "8px 6px",
                                textAlign: "center",
                                width: 65,
                              }}
                            >
                              ĐVT
                            </th>
                            <th
                              style={{
                                padding: "8px 6px",
                                textAlign: "right",
                                width: 75,
                              }}
                            >
                              Số lượng
                            </th>
                            <th
                              style={{
                                padding: "8px 6px",
                                textAlign: "right",
                                width: 110,
                              }}
                            >
                              Đơn giá (₫)
                            </th>
                            <th
                              style={{
                                padding: "8px 6px",
                                textAlign: "right",
                                width: 110,
                              }}
                            >
                              Thành tiền
                            </th>
                            <th
                              style={{
                                padding: "8px 6px",
                                textAlign: "center",
                                width: 40,
                              }}
                            ></th>
                          </tr>
                        </thead>
                        <tbody>
                          {cItems.map((it, idx) => {
                            const lineTotal =
                              (Number(it.qty) || 0) * (Number(it.price) || 0);
                            return (
                              <tr
                                key={it.id}
                                style={{ borderBottom: "1px solid #f1f5f9" }}
                              >
                                <td
                                  style={{
                                    textAlign: "center",
                                    color: "#64748b",
                                  }}
                                >
                                  {idx + 1}
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <input
                                    type="text"
                                    required
                                    className="payment-input"
                                    style={{ width: "100%" }}
                                    list={`contract-item-datalist-${idx}`}
                                    value={it.name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (cSelectedPR) {
                                        const matched = cSelectedPR.items?.find(
                                          (x) => normName(x.name) === normName(val)
                                        );
                                        if (matched) {
                                          setCItems((prev) =>
                                            prev.map((item, i) =>
                                              i === idx
                                                ? {
                                                    ...item,
                                                    name: matched.name,
                                                    spec: matched.spec || item.spec,
                                                    unit: matched.unit || item.unit,
                                                    qty: matched.qty || item.qty,
                                                    price: matched.estimate || item.price,
                                                  }
                                                : item
                                            )
                                          );
                                          return;
                                        }
                                      } else {
                                        const matched = products?.find(
                                          (p) => normName(p.name) === normName(val)
                                        );
                                        if (matched) {
                                          setCItems((prev) =>
                                            prev.map((item, i) =>
                                              i === idx
                                                ? {
                                                    ...item,
                                                    name: matched.name,
                                                    spec: matched.spec || item.spec,
                                                    unit: matched.unit || item.unit,
                                                    price: matched.estimate || item.price,
                                                  }
                                                : item
                                            )
                                          );
                                          return;
                                        }
                                      }
                                      setCItems((prev) =>
                                        prev.map((x, i) =>
                                          i === idx ? { ...x, name: val } : x
                                        )
                                      );
                                    }}
                                    placeholder={
                                      cSelectedPR
                                        ? "Chọn hoặc gõ tên hàng trong PR..."
                                        : "Tên hạng mục..."
                                    }
                                  />
                                  <datalist id={`contract-item-datalist-${idx}`}>
                                    {cSelectedPR
                                      ? cSelectedPR.items?.map((p) => (
                                          <option key={p.id} value={p.name}>
                                            SL: {p.qty} {p.unit} {p.spec ? `(${p.spec})` : ""}
                                          </option>
                                        ))
                                      : products.map((p) => (
                                          <option key={p.id} value={p.name}>
                                            {p.code} - {p.unit}
                                          </option>
                                        ))}
                                  </datalist>
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <input
                                    type="text"
                                    className="payment-input"
                                    style={{ width: "100%" }}
                                    value={it.spec}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCItems((prev) =>
                                        prev.map((x, i) =>
                                          i === idx ? { ...x, spec: val } : x
                                        )
                                      );
                                    }}
                                  />
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <input
                                    type="text"
                                    className="payment-input"
                                    style={{
                                      width: "100%",
                                      textAlign: "center",
                                    }}
                                    value={it.unit}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCItems((prev) =>
                                        prev.map((x, i) =>
                                          i === idx ? { ...x, unit: val } : x
                                        )
                                      );
                                    }}
                                  />
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <input
                                    type="number"
                                    min="1"
                                    className="payment-input"
                                    style={{
                                      width: "100%",
                                      textAlign: "right",
                                    }}
                                    value={it.qty}
                                    onChange={(e) => {
                                      const val = Number(e.target.value) || 0;
                                      setCItems((prev) =>
                                        prev.map((x, i) =>
                                          i === idx ? { ...x, qty: val } : x
                                        )
                                      );
                                    }}
                                  />
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1000"
                                    className="payment-input"
                                    style={{
                                      width: "100%",
                                      textAlign: "right",
                                    }}
                                    value={it.price}
                                    onChange={(e) => {
                                      const val = Number(e.target.value) || 0;
                                      setCItems((prev) =>
                                        prev.map((x, i) =>
                                          i === idx ? { ...x, price: val } : x
                                        )
                                      );
                                    }}
                                  />
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    textAlign: "right",
                                    fontWeight: 600,
                                    color: "#0f172a",
                                  }}
                                >
                                  {fmt(lineTotal)} ₫
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  {cItems.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCItems((prev) =>
                                          prev.filter((_, i) => i !== idx)
                                        )
                                      }
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#ef4444",
                                        cursor: "pointer",
                                        fontSize: 16,
                                        padding: "2px 6px",
                                      }}
                                    >
                                      🗑
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr
                            style={{
                              background: "#f8fafc",
                              fontWeight: 700,
                              borderTop: "2px solid #cbd5e1",
                            }}
                          >
                            <td
                              colSpan={4}
                              style={{
                                padding: "8px 12px",
                                textAlign: "right",
                              }}
                            >
                              TỔNG GIÁ TRỊ HỢP ĐỒNG:
                            </td>
                            <td
                              style={{
                                padding: "8px 6px",
                                textAlign: "right",
                              }}
                            >
                              {cItems.reduce(
                                (s, it) => s + (Number(it.qty) || 0),
                                0
                              )}
                            </td>
                            <td></td>
                            <td
                              style={{
                                padding: "8px 8px",
                                textAlign: "right",
                                color: "#0284c7",
                                fontSize: 13,
                              }}
                            >
                              {fmt(
                                cItems.reduce(
                                  (s, it) =>
                                    s +
                                    (Number(it.qty) || 0) *
                                      (Number(it.price) || 0),
                                  0
                                )
                              )}{" "}
                              ₫
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Payment group integration checkbox */}
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      padding: "10px 14px",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: 600,
                        color: "#0369a1",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={cCreatePaymentGroup}
                        onChange={(e) =>
                          setCCreatePaymentGroup(e.target.checked)
                        }
                      />
                      <span>
                        Đồng thời đăng ký vào Nhóm nội dung hợp đồng để lập Đề nghị thanh toán (ĐNTT)
                      </span>
                    </label>
                    <small
                      style={{
                        display: "block",
                        color: "#64748b",
                        marginTop: 4,
                        marginLeft: 24,
                      }}
                    >
                      Tự động liên thông hợp đồng sang tab "Nhóm nội dung hợp đồng & Đơn hàng" và mô-đun Quản lý thanh toán.
                    </small>
                  </div>
                </>
              ) : (
                /* From PO Mode */
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: 4,
                      }}
                    >
                      Chọn đơn PO cần lập hợp đồng <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      className="payment-input"
                      style={{ width: "100%" }}
                      value={selectedPOIdForContract}
                      onChange={(e) => handleSelectPOForContract(e.target.value)}
                    >
                      {pos.map((p) => {
                        const s = suppliers.find((x) => x.id === p.supplierId);
                        const v = p.items.reduce(
                          (sum, it) => sum + it.qty * it.price,
                          0
                        );
                        return (
                          <option key={p.id} value={p.id}>
                            {p.number} - {s?.name || "NCC"} ({fmt(v)} ₫) - {dateVN(p.createdDate)}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {(() => {
                    const chosen = pos.find(
                      (p) => p.id === Number(selectedPOIdForContract)
                    );
                    if (!chosen) return null;
                    const chSupplier = suppliers.find(
                      (s) => s.id === chosen.supplierId
                    );
                    const chTotal = chosen.items.reduce(
                      (sum, it) => sum + it.qty * it.price,
                      0
                    );
                    return (
                      <div
                        style={{
                          background: "#f0f9ff",
                          border: "1px solid #bae6fd",
                          borderRadius: 6,
                          padding: 12,
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <span style={{ color: "#0369a1", fontWeight: 600 }}>
                            Mã đơn PO:
                          </span>{" "}
                          <b>{chosen.number}</b>
                        </div>
                        <div>
                          <span style={{ color: "#0369a1", fontWeight: 600 }}>
                            Nhà cung cấp:
                          </span>{" "}
                          <b>{chSupplier?.name}</b>
                        </div>
                        <div>
                          <span style={{ color: "#0369a1", fontWeight: 600 }}>
                            Giá trị đơn PO:
                          </span>{" "}
                          <b>{fmt(chTotal)} ₫</b>
                        </div>
                        <div>
                          <span style={{ color: "#0369a1", fontWeight: 600 }}>
                            Số mặt hàng:
                          </span>{" "}
                          <b>{chosen.items.length} mặt hàng</b>
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: 4,
                      }}
                    >
                      Số hợp đồng kinh tế
                    </label>
                    <input
                      type="text"
                      className="payment-input"
                      style={{ width: "100%" }}
                      value={fromPoContractNumber}
                      onChange={(e) => setFromPoContractNumber(e.target.value)}
                      placeholder="VD: HĐ-PO-2026-0001"
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: 4,
                      }}
                    >
                      Điều khoản / Ghi chú hợp đồng
                    </label>
                    <textarea
                      rows={3}
                      className="payment-input"
                      style={{ width: "100%", resize: "vertical" }}
                      value={fromPoContractNote}
                      onChange={(e) => setFromPoContractNote(e.target.value)}
                      placeholder="Ghi chú điều khoản, bảo lãnh, thời hạn bàn giao..."
                    />
                  </div>

                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      padding: "10px 14px",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: 600,
                        color: "#0369a1",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={fromPoCreateGroup}
                        onChange={(e) =>
                          setFromPoCreateGroup(e.target.checked)
                        }
                      />
                      <span>
                        Đồng thời đăng ký vào Nhóm nội dung hợp đồng để lập Đề nghị thanh toán (ĐNTT)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {cError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ⚠ {cError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              className="payment-modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                borderTop: "1px solid #e2e8f0",
                paddingTop: 12,
              }}
            >
              <button
                type="button"
                className="payment-btn"
                onClick={() => setShowCreateContractModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                onClick={handleSaveContract}
              >
                ✓ Lưu và kích hoạt hợp đồng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TREE PRODUCT PICKER MODAL */}
      <TreeProductPickerModal
        isOpen={showTreePickerModal}
        onClose={() => setShowTreePickerModal(false)}
        prs={prs}
        products={products}
        selectedPRId={cPrId}
        existingItemNames={cItems.map((it) => it.name)}
        onSelectItems={handleSelectItemsFromTree}
        onAddProduct={onAddProduct}
        title="Tạo hợp đồng: Chọn sản phẩm theo Cây thư mục PR & Danh mục"
      />
    </section>
  );
}
