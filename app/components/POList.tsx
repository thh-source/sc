import React, { useState, useMemo } from "react";
import { Supplier, PO, PR, Item } from "../types";
import { fmt, dateVN, makeId } from "../utils";
import { SupplierSearchCombobox } from "./SupplierSearchCombobox";
import { TreeProductPickerModal, SelectedItemData } from "./TreeProductPickerModal";
import { normName } from "../payment-utils";
import { useTranslation } from "../i18n";
import "../payment.css";

interface DraftPOItem {
  id: number;
  code: string;
  category: string;
  name: string;
  desc: string;
  spec: string;
  unit: string;
  qty: number;
  price: number;
}

export function POList({
  pos,
  suppliers,
  onOpen,
  onDelete,
  prs = [],
  products = [],
  onCreatePO,
  onAddSupplier,
  onAddProduct,
  onCreateHandover,
  readOnly = false,
}: {
  pos: PO[];
  suppliers: Supplier[];
  onOpen: (po: PO) => void;
  onDelete?: (po: PO) => void;
  prs?: PR[];
  products?: Item[];
  onCreatePO?: (po: PO, openDetail?: boolean, sourcePrId?: number) => void;
  onAddSupplier?: (supplier: Supplier) => void;
  onAddProduct?: (product: Item) => void;
  onCreateHandover?: (po: PO) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");

  // Create Direct PO Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draftNumber, setDraftNumber] = useState("");
  const [draftSupplierId, setDraftSupplierId] = useState<number | "">("");
  const [draftPrId, setDraftPrId] = useState<number | "">("");
  const [draftPrNumber, setDraftPrNumber] = useState("Mua trực tiếp");
  const [draftCreatedDate, setDraftCreatedDate] = useState("");
  const [draftExpectedDate, setDraftExpectedDate] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftItems, setDraftItems] = useState<DraftPOItem[]>([]);
  const [itemError, setItemError] = useState("");
  const [customProductInput, setCustomProductInput] = useState("");
  const [showTreePickerModal, setShowTreePickerModal] = useState(false);
  const [inlineProductQuery, setInlineProductQuery] = useState("");
  const [showInlineDropdown, setShowInlineDropdown] = useState(false);

  const selectedPR = useMemo(() => {
    if (!draftPrId) return null;
    return prs.find((p) => p.id === Number(draftPrId)) || null;
  }, [draftPrId, prs]);

  const handleSelectItemsFromTree = (items: SelectedItemData[]) => {
    setDraftItems((prev) => {
      const cleanPrev = prev.filter((it) => it.name.trim() !== "");
      const newItems: DraftPOItem[] = items.map((it, idx) => ({
        id: makeId(),
        code: it.code || `VT-${String(cleanPrev.length + idx + 1).padStart(2, "0")}`,
        category: it.category || "Hàng hóa",
        name: it.name,
        desc: "",
        spec: it.spec || "",
        unit: it.unit || "Cái",
        qty: it.qty || 1,
        price: it.price || 0,
      }));
      return [...cleanPrev, ...newItems];
    });

    if (!draftPrId && items[0]?.sourcePrId) {
      setDraftPrId(items[0].sourcePrId);
      if (items[0].sourcePrNumber) {
        setDraftPrNumber(items[0].sourcePrNumber);
      }
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

    if (selectedPR && selectedPR.items) {
      for (let i = 0; i < selectedPR.items.length; i++) {
        if (results.length >= 15) break;
        const it = selectedPR.items[i];
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
            source: `PR #${selectedPR.number}`,
            sourcePrId: selectedPR.id,
            sourcePrNumber: selectedPR.number,
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
          unit: p.unit || "Cái",
          qty: 1,
          price: p.estimate || 0,
          source: p.category || "Danh mục chung",
        });
      }
    }

    return results;
  }, [inlineProductQuery, selectedPR, products]);

  const resetDraft = () => {
    const currentYear = new Date().getFullYear();
    const poNum = `PO-${currentYear}-${String(pos.length + 1).padStart(4, "0")}`;
    setDraftNumber(poNum);
    setDraftSupplierId("");
    setDraftPrId("");
    setDraftPrNumber("Mua trực tiếp");
    setDraftCreatedDate(new Date().toISOString().slice(0, 10));
    setDraftExpectedDate("");
    setDraftNote("Tạo trực tiếp không qua so sánh báo giá");
    setCustomProductInput("");
    setDraftItems([
      {
        id: makeId(),
        code: "VT-01",
        category: "Vật tư chung",
        name: "",
        desc: "",
        spec: "",
        unit: "Cái",
        qty: 1,
        price: 0,
      },
    ]);
    setItemError("");
  };

  const handleSelectPR = (prIdVal: string) => {
    if (!prIdVal) {
      setDraftPrId("");
      setDraftPrNumber("Mua trực tiếp");
      return;
    }
    const prId = Number(prIdVal);
    setDraftPrId(prId);
    const foundPR = prs.find((p) => p.id === prId);
    if (foundPR) {
      setDraftPrNumber(foundPR.number);
      // If user had no custom items or just 1 blank item, load items from PR
      const hasOnlyBlank = draftItems.length === 0 || (draftItems.length === 1 && !draftItems[0].name.trim());
      if (hasOnlyBlank && foundPR.items && foundPR.items.length > 0) {
        setDraftItems(
          foundPR.items.map((it, idx) => ({
            id: makeId(),
            code: it.code || `VT-${String(idx + 1).padStart(2, "0")}`,
            category: it.category || "Vật tư chung",
            name: it.name,
            desc: it.desc || "",
            spec: it.spec || "",
            unit: it.unit || "Cái",
            qty: it.qty || 1,
            price: it.estimate || 0,
          }))
        );
      }
    }
  };

  const handleAddCustomProduct = (nameInput: string) => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const existing = products.find((p) => normName(p.name) === normName(trimmed));
    if (existing) {
      setDraftItems((prev) => [
        ...prev.filter((x) => x.name.trim() !== ""),
        {
          id: makeId(),
          code: existing.code || `VT-${String(prev.length + 1).padStart(2, "0")}`,
          category: existing.category || "Hàng hóa",
          name: existing.name,
          desc: existing.desc || "",
          spec: existing.spec || "",
          unit: existing.unit || "Cái",
          qty: 1,
          price: existing.estimate || 0,
        },
      ]);
    } else {
      const newId = makeId();
      const nextCode = `VT-${String(products.length + 1).padStart(2, "0")}`;
      const newProd: Item = {
        id: newId,
        code: nextCode,
        category: "Vật tư",
        name: trimmed,
        desc: "",
        spec: "",
        unit: "Cái",
        qty: 1,
        estimate: 0,
      };
      onAddProduct?.(newProd);
      setDraftItems((prev) => [
        ...prev.filter((x) => x.name.trim() !== ""),
        {
          id: makeId(),
          code: nextCode,
          category: "Vật tư",
          name: trimmed,
          desc: "",
          spec: "",
          unit: "Cái",
          qty: 1,
          price: 0,
        },
      ]);
    }
    setCustomProductInput("");
  };

  const draftTotal = draftItems.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
    0
  );

  const handleSavePO = (openDetail: boolean) => {
    if (!draftNumber.trim()) {
      setItemError("Vui lòng nhập số PO.");
      return;
    }
    if (!draftSupplierId) {
      setItemError("Vui lòng chọn nhà cung cấp.");
      return;
    }
    if (draftItems.length === 0) {
      setItemError("Đơn hàng phải có ít nhất 1 mặt hàng.");
      return;
    }
    const invalidItem = draftItems.find(
      (it) => !it.name.trim() || Number(it.qty) <= 0
    );
    if (invalidItem) {
      setItemError("Mỗi dòng hàng cần có tên mặt hàng và số lượng > 0.");
      return;
    }

    const supplierIdNum = Number(draftSupplierId);
    const newPO: PO = {
      id: makeId(),
      number: draftNumber.trim(),
      prNumber: draftPrNumber.trim() || "Mua trực tiếp",
      supplierId: supplierIdNum,
      createdDate: draftCreatedDate || new Date().toISOString().slice(0, 10),
      expectedDate: draftExpectedDate || "",
      status: "Mới tạo",
      items: draftItems.map((item, idx) => ({
        id: item.id || makeId(),
        code: item.code || `VT-${String(idx + 1).padStart(2, "0")}`,
        category: item.category || "Hàng hóa",
        name: item.name.trim(),
        desc: item.desc || "",
        spec: item.spec || "",
        unit: item.unit.trim() || "Cái",
        qty: Number(item.qty) || 1,
        estimate: Number(item.price) || 0,
        price: Number(item.price) || 0,
        deliveryStatus: "Chưa giao",
        deliveredQty: 0,
        deliveryDate: "",
      })),
      docs: [
        {
          id: makeId(),
          name: "Hợp đồng / PO xác nhận",
          status: "Chờ bổ sung",
          note: "",
        },
        {
          id: makeId(),
          name: "Hóa đơn VAT",
          status: "Còn thiếu",
          note: "",
        },
        {
          id: makeId(),
          name: "Biên bản giao nhận",
          status: "Còn thiếu",
          note: "",
        },
      ],
      payments: [
        {
          id: makeId(),
          phase: "Tạm ứng",
          percent: 50,
          amount: Math.round(draftTotal * 0.5),
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Quyết toán / Hoàn tất",
          percent: 50,
          amount: draftTotal - Math.round(draftTotal * 0.5),
          condition: "post",
          status: "Chưa thanh toán",
          date: "",
          note: "",
        },
      ],
      note: draftNote.trim(),
      contractNote: "",
    };

    const sourcePrId = typeof draftPrId === "number" ? draftPrId : undefined;
    onCreatePO?.(newPO, openDetail, sourcePrId);
    setShowCreateModal(false);
  };

  const shown = (pos || []).filter((po) => {
    if (!po) return false;
    const s = suppliers.find((x) => Number(x.id) === Number(po.supplierId));
    return ((po.number || "") + (po.prNumber || "") + (s?.name || ""))
      .toLowerCase()
      .includes(q.toLowerCase());
  });

  return (
    <section className="content po-list-page">
      <div className="heading">
        <div>
          <em>{t("po.badge")}</em>
          <h1>{t("po.title")}</h1>
          <p>{t("po.desc")}</p>
        </div>
        {!readOnly && onCreatePO && (
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                resetDraft();
                setShowCreateModal(true);
              }}
            >
              {t("po.create_direct")}
            </button>
          </div>
        )}
      </div>

      <div className="po-kpis">
        <article>
          <span>Tổng PO</span>
          <b>{(pos || []).length}</b>
        </article>
        <article>
          <span>Đang giao hàng</span>
          <b>{(pos || []).filter((p) => (p?.status || "").includes("giao")).length}</b>
        </article>
        <article>
          <span>Hồ sơ còn thiếu</span>
          <b>
            {(pos || []).reduce(
              (n, p) => n + (p?.docs || []).filter((d) => d?.status !== "Đã đủ").length,
              0
            )}
          </b>
        </article>
        <article>
          <span>Chờ thanh toán</span>
          <b>
            {(pos || []).reduce(
              (n, p) =>
                n +
                (p?.payments || []).filter((x) => x?.status !== "Đã thanh toán").length,
              0
            )}
          </b>
        </article>
      </div>

      <div className="po-list-panel">
        <div className="pr-toolbar">
          <label>
            ⌕
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("po.search_placeholder")}
            />
          </label>
          <span>{shown.length} đơn mua hàng</span>
        </div>

        <div className="mobile-record-list">
          {shown.map((po) => {
            const supplier = suppliers.find((s) => Number(s.id) === Number(po.supplierId));
            const items = po.items || [];
            const total = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
            const delivered = items.filter((item) => item.deliveryStatus === "Đã giao").length;
            return (
              <article key={po.id}>
                <header>
                  <button onClick={() => onOpen(po)}>{po.number}</button>
                  <span className="status progress">{po.status}</span>
                </header>
                <h3>{supplier?.name || "Chưa có nhà cung cấp"}</h3>
                <p>
                  {po.prNumber} · {dateVN(po.createdDate)}
                </p>
                <dl>
                  <div>
                    <dt>Giá trị</dt>
                    <dd>{fmt(total)} ₫</dd>
                  </div>
                  <div>
                    <dt>Giao hàng</dt>
                    <dd>
                      {delivered}/{items.length}
                    </dd>
                  </div>
                </dl>
                <footer>
                  <button className="row-action" onClick={() => onOpen(po)}>
                    Quản lý PO
                  </button>
                  {onCreateHandover && (
                    <button
                      type="button"
                      className="row-action"
                      style={{ color: "#0284c7", fontWeight: 600 }}
                      onClick={() => onCreateHandover(po)}
                      title="Tạo biên bản bàn giao"
                    >
                      🚚 Bàn giao
                    </button>
                  )}
                  {onDelete && (
                    <button className="delete-action" onClick={() => onDelete(po)}>
                      Xóa
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        <div className="pr-table" style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "1280px", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ width: "140px", whiteSpace: "nowrap" }}>{t("table.po_number")}</th>
                <th style={{ width: "130px", whiteSpace: "nowrap" }}>{t("table.source_pr")}</th>
                <th style={{ minWidth: "260px" }}>{t("table.supplier")}</th>
                <th style={{ width: "120px", whiteSpace: "nowrap" }}>{t("table.created_date")}</th>
                <th style={{ width: "120px", whiteSpace: "nowrap" }}>{t("table.expected_delivery")}</th>
                <th style={{ width: "140px", whiteSpace: "nowrap", textAlign: "right" }}>{t("table.po_value")}</th>
                <th style={{ width: "130px", whiteSpace: "nowrap", textAlign: "center" }}>{t("table.delivery_progress")}</th>
                <th style={{ width: "110px", whiteSpace: "nowrap", textAlign: "center" }}>{t("table.documents")}</th>
                <th style={{ width: "110px", whiteSpace: "nowrap", textAlign: "center" }}>{t("table.payment")}</th>
                <th style={{ width: "230px", minWidth: "230px", textAlign: "right", paddingRight: "16px" }}>{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((po) => {
                const s = suppliers.find((x) => Number(x.id) === Number(po.supplierId));
                const items = po.items || [];
                const docs = po.docs || [];
                const payments = po.payments || [];
                const delivered = items.filter(
                  (i) => i.deliveryStatus === "Đã giao"
                ).length;
                const docsCount = docs.filter((d) => d.status === "Đã đủ").length;
                const paid = payments
                  .filter((p) => p.status === "Đã thanh toán")
                  .reduce((n, p) => n + (Number(p.amount) || 0), 0);
                const total = items.reduce((n, i) => n + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
                return (
                  <tr key={po.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="pr-link" onClick={() => onOpen(po)}>
                        {po.number}
                      </button>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{po.prNumber}</td>
                    <td>
                      <b>{s?.name || "Chưa có NCC"}</b>
                      {s?.code && <small className="supplier-code">{s.code}</small>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{dateVN(po.createdDate)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{dateVN(po.expectedDate)}</td>
                    <td className="money" style={{ whiteSpace: "nowrap", textAlign: "right" }}>{fmt(total)} ₫</td>
                    <td style={{ textAlign: "center" }}>
                      <span className="mini-progress" style={{ margin: "0 auto 4px" }}>
                        <i
                          style={{
                            width: `${items.length ? (delivered / items.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <small>
                        {delivered}/{items.length} mặt hàng
                      </small>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={
                          docsCount === docs.length && docs.length > 0
                            ? "status done"
                            : "status waiting"
                        }
                      >
                        {docsCount}/{docs.length} đủ
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <b>{total ? Math.round((paid / total) * 100) : 0}%</b>
                    </td>
                    <td style={{ width: "230px", minWidth: "230px", paddingRight: "16px" }}>
                      <div className="row-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", flexWrap: "nowrap" }}>
                        <button className="row-action" onClick={() => onOpen(po)}>
                          Quản lý →
                        </button>
                        {onCreateHandover && (
                          <button
                            type="button"
                            className="row-action"
                            style={{ color: "#0284c7", fontWeight: 600 }}
                            onClick={() => onCreateHandover(po)}
                            title="Tạo biên bản bàn giao cho PO này"
                          >
                            🚚 Bàn giao
                          </button>
                        )}
                        {onDelete && (
                          <button
                            className="delete-action"
                            onClick={() => onDelete(po)}
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE DIRECT PO MODAL */}
      {showCreateModal && (
        <div
          className="payment-modal-overlay"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="payment-modal-card"
            style={{ maxWidth: 900, width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>
                  ＋ Tạo đơn mua hàng (PO) mới
                </h3>
                <small style={{ color: "#64748b" }}>
                  Tạo trực tiếp không qua luồng so sánh báo giá
                </small>
              </div>
              <button
                type="button"
                className="payment-modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxHeight: "75vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {/* General Form */}
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
                    Số PO <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftNumber}
                    onChange={(e) => setDraftNumber(e.target.value)}
                    placeholder="VD: PO-2026-0001"
                  />
                </div>

                <div>
                  <SupplierSearchCombobox
                    suppliers={suppliers}
                    selectedSupplierId={draftSupplierId}
                    onSelectSupplier={(id) => setDraftSupplierId(id)}
                    onAddSupplier={onAddSupplier}
                    required
                    label="Nhà cung cấp"
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
                      borderColor: selectedPR ? "#0284c7" : "#cbd5e1",
                      background: selectedPR ? "#f0f9ff" : "#fff",
                      fontWeight: selectedPR ? 600 : 400,
                    }}
                    value={draftPrId}
                    onChange={(e) => handleSelectPR(e.target.value)}
                  >
                    <option value="">Mua trực tiếp (Không qua PR)</option>
                    {prs.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.number} - {pr.department || "PR"} (
                        {pr.items?.length || 0} mặt hàng)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPR && (
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
                        🔗 Đã liên kết với {selectedPR.number} ({selectedPR.department || "PR"}):
                      </span>{" "}
                      <span style={{ color: "#334155" }}>
                        Danh sách chọn mặt hàng bên dưới sẽ lọc theo {selectedPR.items?.length || 0} mặt hàng của PR này
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
                        if (selectedPR.items && selectedPR.items.length > 0) {
                          setDraftItems(
                            selectedPR.items.map((it, idx) => ({
                              id: makeId(),
                              code: it.code || `VT-${String(idx + 1).padStart(2, "0")}`,
                              category: it.category || "Vật tư",
                              name: it.name,
                              desc: it.desc || "",
                              spec: it.spec || "",
                              unit: it.unit || "Cái",
                              qty: it.qty || 1,
                              price: it.estimate || 0,
                            }))
                          );
                        }
                      }}
                    >
                      📥 Nạp nhanh toàn bộ {selectedPR.items?.length || 0} mặt hàng từ PR
                    </button>
                  </div>
                )}

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
                    Ngày tạo đơn
                  </label>
                  <input
                    type="date"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftCreatedDate}
                    onChange={(e) => setDraftCreatedDate(e.target.value)}
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
                    Hạn hoàn tất giao hàng
                  </label>
                  <input
                    type="date"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftExpectedDate}
                    onChange={(e) => setDraftExpectedDate(e.target.value)}
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
                    Ghi chú PO
                  </label>
                  <input
                    type="text"
                    className="payment-input"
                    style={{ width: "100%" }}
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder="Ghi chú về đơn hàng, điều khoản giao hàng..."
                  />
                </div>
              </div>

              {/* Items Section */}
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
                      Danh sách mặt hàng ({draftItems.length})
                    </h4>
                    {selectedPR && (
                      <span style={{ fontSize: 11.5, color: "#0369a1", fontWeight: 600 }}>
                        (Chỉ hiển thị mặt hàng & số lượng thuộc PR #{selectedPR.number})
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
                              handleAddCustomProduct(inlineProductQuery.trim());
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
                              handleAddCustomProduct(inlineProductQuery.trim());
                              setInlineProductQuery("");
                              setShowInlineDropdown(false);
                            }
                          }}
                          title="Thêm mặt hàng này vào danh sách đơn hàng"
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
                                setDraftItems((prev) => [
                                  ...prev.filter((x) => x.name.trim() !== ""),
                                  {
                                    id: makeId(),
                                    code: `VT-${String(prev.length + 1).padStart(2, "0")}`,
                                    category: "Hàng hóa",
                                    name: p.name,
                                    desc: "",
                                    spec: p.spec || "",
                                    unit: p.unit || "Cái",
                                    qty: p.qty || 1,
                                    price: p.price || 0,
                                  },
                                ]);
                                if (!draftPrId && p.sourcePrId) {
                                  setDraftPrId(p.sourcePrId);
                                  if (p.sourcePrNumber) setDraftPrNumber(p.sourcePrNumber);
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
                                    handleAddCustomProduct(inlineProductQuery.trim());
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
                                border: 0,
                                background: "none",
                                color: "#0284c7",
                                fontWeight: 600,
                                fontSize: "11.5px",
                                cursor: "pointer",
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
                        setDraftItems((prev) => [
                          ...prev,
                          {
                            id: makeId(),
                            code: `VT-${String(prev.length + 1).padStart(2, "0")}`,
                            category: "Vật tư",
                            name: "",
                            desc: "",
                            spec: "",
                            unit: "Cái",
                            qty: 1,
                            price: 0,
                          },
                        ])
                      }
                    >
                      ＋ Thêm dòng trống
                    </button>
                  </div>
                </div>

                {/* Items Table */}
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
                          Tên mặt hàng <span style={{ color: "#ef4444" }}>*</span>
                        </th>
                        <th
                          style={{
                            padding: "8px 6px",
                            textAlign: "left",
                            width: 140,
                          }}
                        >
                          Quy cách
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
                      {draftItems.map((item, idx) => {
                        const lineTotal =
                          (Number(item.qty) || 0) * (Number(item.price) || 0);
                        return (
                          <tr
                            key={item.id}
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
                                list={`po-item-datalist-${idx}`}
                                value={item.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (selectedPR) {
                                    const matched = selectedPR.items?.find(
                                      (x) => normName(x.name) === normName(val)
                                    );
                                    if (matched) {
                                      setDraftItems((prev) =>
                                        prev.map((it, i) =>
                                          i === idx
                                            ? {
                                                ...it,
                                                name: matched.name,
                                                spec: matched.spec || it.spec,
                                                unit: matched.unit || it.unit,
                                                qty: matched.qty || it.qty,
                                                price: matched.estimate || it.price,
                                              }
                                            : it
                                        )
                                      );
                                      return;
                                    }
                                  } else {
                                    const matched = products?.find(
                                      (p) => normName(p.name) === normName(val)
                                    );
                                    if (matched) {
                                      setDraftItems((prev) =>
                                        prev.map((it, i) =>
                                          i === idx
                                            ? {
                                                ...it,
                                                name: matched.name,
                                                spec: matched.spec || it.spec,
                                                unit: matched.unit || it.unit,
                                                price: matched.estimate || it.price,
                                              }
                                            : it
                                        )
                                      );
                                      return;
                                    }
                                  }
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, name: val } : it
                                    )
                                  );
                                }}
                                placeholder={
                                  selectedPR
                                    ? "Chọn hoặc gõ tên hàng trong PR..."
                                    : "Nhập hoặc chọn tên hàng..."
                                }
                              />
                              <datalist id={`po-item-datalist-${idx}`}>
                                {selectedPR
                                  ? selectedPR.items?.map((it) => (
                                      <option key={it.id} value={it.name}>
                                        SL: {it.qty} {it.unit} {it.spec ? `(${it.spec})` : ""}
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
                                value={item.spec}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, spec: val } : it
                                    )
                                  );
                                }}
                                placeholder="Quy cách..."
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
                                value={item.unit}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, unit: val } : it
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
                                value={item.qty}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, qty: val } : it
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
                                value={item.price}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDraftItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, price: val } : it
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
                              {draftItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftItems((prev) =>
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
                                  title="Xóa dòng"
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
                          TỔNG GIÁ TRỊ ĐƠN HÀNG (PO):
                        </td>
                        <td
                          style={{
                            padding: "8px 6px",
                            textAlign: "right",
                          }}
                        >
                          {draftItems.reduce(
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
                          {fmt(draftTotal)} ₫
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Quick info note */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#166534",
                }}
              >
                ℹ️ Đơn PO sau khi tạo sẽ tự động khởi tạo hồ sơ nghiệm thu tiêu chuẩn (Hợp đồng/PO, Hóa đơn VAT, Biên bản giao nhận) và 2 mốc giải ngân (Tạm ứng 50%, Hoàn tất 50%). Bạn có thể tùy chỉnh lại bất cứ lúc nào trong trang Chi tiết PO.
              </div>

              {itemError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ⚠ {itemError}
                </div>
              )}
            </div>

            {/* Modal footer */}
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
                onClick={() => setShowCreateModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="payment-btn"
                onClick={() => handleSavePO(false)}
              >
                ✓ Lưu đơn PO
              </button>
              <button
                type="button"
                className="payment-btn btn-primary"
                onClick={() => handleSavePO(true)}
              >
                ✓ Lưu & Mở chi tiết PO →
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
        selectedPRId={draftPrId}
        existingItemNames={draftItems.map((it) => it.name)}
        onSelectItems={handleSelectItemsFromTree}
        onAddProduct={onAddProduct}
        title="Tạo đơn PO: Chọn sản phẩm theo Cây thư mục PR & Danh mục"
      />
    </section>
  );
}
