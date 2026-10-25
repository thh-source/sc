// app/components/GlobalSpotlightModal.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { PR, PO, Supplier, Item, PaymentRequestEntry, PaymentHandoverItem, View } from "../types";
import { normalizeSearchText, normName, fmtMoney, fmt } from "../utils";

export type SpotlightCategory =
  | "all"
  | "payment"
  | "contract"
  | "po"
  | "pr"
  | "handover"
  | "supplier"
  | "product";

export interface SpotlightItem {
  id: string;
  category: "payment" | "contract" | "po" | "pr" | "handover" | "supplier" | "product";
  categoryLabel: string;
  categoryIcon: string;
  categoryBg: string;
  categoryColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  target: {
    view: View;
    pr?: PR;
    po?: PO;
    paymentId?: number;
    handoverId?: number;
    query?: string;
  };
  score?: number;
}

export interface GlobalSpotlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  prs: PR[];
  pos: PO[];
  suppliers: Supplier[];
  products: Item[];
  paymentRequests: PaymentRequestEntry[];
  paymentHandovers: PaymentHandoverItem[];
  onNavigate: (destination: {
    view: View;
    pr?: PR;
    po?: PO;
    paymentId?: number;
    handoverId?: number;
    query?: string;
  }) => void;
}

export const isPOContract = (p: PO): boolean =>
  p.number.startsWith("HĐ-") ||
  Boolean(p.contractNote && p.contractNote.trim().length > 0) ||
  Boolean(p.prNumber && p.prNumber.toLowerCase().includes("hợp đồng"));

export function GlobalSpotlightModal({
  isOpen,
  onClose,
  prs = [],
  pos = [],
  suppliers = [],
  products = [],
  paymentRequests = [],
  paymentHandovers = [],
  onNavigate,
}: GlobalSpotlightModalProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SpotlightCategory>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input and reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveCategory("all");
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Global Esc key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Search logic & relevance ranking
  const allResults = useMemo(() => {
    const qTrim = query.trim();
    const qNorm = normalizeSearchText(qTrim);
    const tokens = qNorm.split(/\s+/).filter(Boolean);
    const searchDigits = qTrim.replace(/\D/g, "");

    const matchCorpus = (corpus: string): boolean => {
      if (tokens.length === 0) return true;
      const normCorpus = normalizeSearchText(corpus);
      const corpusDigits = corpus.replace(/\D/g, "");

      return tokens.every((tok) => {
        if (normCorpus.includes(tok)) return true;
        const tokDigits = tok.replace(/\D/g, "");
        if (tokDigits && corpusDigits.includes(tokDigits)) return true;
        return false;
      });
    };

    const items: (SpotlightItem & { score: number })[] = [];

    // 1. Payment Requests (Đề nghị thanh toán)
    for (const r of paymentRequests) {
      const corpus = [
        r.legacy_stt,
        r.id,
        r.payee_name,
        r.item_name,
        r.description,
        r.invoice_no,
        r.invoice_date,
        r.amount,
        r.group_code,
        r.bank,
        r.account_no,
        r.status,
        ...(r.lines || []).map((l) => `${l.description || ""} ${l.invoice_no || ""} ${l.amount || ""}`),
      ].filter(Boolean).join(" ");

      if (matchCorpus(corpus)) {
        let score = 0;
        if (tokens.length === 0) {
          score = 100 + (Number(r.legacy_stt || r.id) || 0) * 0.05;
        } else {
          const sttStr = String(r.legacy_stt || "");
          const idStr = String(r.id || "");
          const normPayee = normalizeSearchText(r.payee_name || "");
          const invNorm = normalizeSearchText(r.invoice_no || "");
          const linesInvNorm = normalizeSearchText((r.lines || []).map((l) => l.invoice_no || "").join(" "));
          const descNorm = normalizeSearchText(
            `${r.item_name || ""} ${r.description || ""} ${(r.lines || []).map((l) => l.description || "").join(" ")}`
          );

          // Nhà cung cấp liên quan
          const linkedSupp = suppliers.find(
            (s) =>
              (r.beneficiary_id && s.id === r.beneficiary_id) ||
              normalizeSearchText(s.name) === normPayee ||
              (s.shortName && normalizeSearchText(s.shortName) === normPayee)
          );
          const suppShort = normalizeSearchText(linkedSupp?.shortName || "");
          const suppCode = normalizeSearchText(linkedSupp?.code || "");

          // 1. Khớp chính xác STT hoặc ID (Ưu tiên tuyệt đối)
          if (searchDigits && (sttStr === searchDigits || idStr === searchDigits)) {
            score += 2600;
          } else if (
            qNorm === `#${sttStr}` ||
            qNorm === `stt ${sttStr}` ||
            qNorm === `stt${sttStr}` ||
            qNorm === `#${idStr}`
          ) {
            score += 2600;
          } else if (searchDigits && (sttStr.startsWith(searchDigits) || idStr.startsWith(searchDigits))) {
            score += 1000;
          }

          // 2. Khớp Tên Nhà Cung Cấp / Tên Thụ Hưởng (Ưu tiên cao)
          if (normPayee === qNorm || suppShort === qNorm || suppCode === qNorm) {
            score += 2100;
          } else if (normPayee.startsWith(qNorm) || suppShort.startsWith(qNorm)) {
            score += 1500;
          } else if ((normPayee && normPayee.includes(qNorm)) || (suppShort && suppShort.includes(qNorm))) {
            score += 1200;
          } else if (tokens.every((tok) => normPayee.includes(tok) || suppShort.includes(tok))) {
            score += 900;
          }

          // 3. Khớp Mã PO / Nhóm thanh toán
          if (r.group_code && normalizeSearchText(r.group_code).includes(qNorm)) {
            score += 700;
          }

          // 4. Khớp Số Hóa Đơn
          if (invNorm === qNorm || (searchDigits && r.invoice_no && r.invoice_no.replace(/\D/g, "") === searchDigits)) {
            score += 650;
          } else if (invNorm.includes(qNorm) || linesInvNorm.includes(qNorm)) {
            score += 350;
          } else if (
            searchDigits &&
            searchDigits.length >= 3 &&
            (invNorm.replace(/\D/g, "").includes(searchDigits) || linesInvNorm.replace(/\D/g, "").includes(searchDigits))
          ) {
            score += 300;
          }

          // 5. Khớp Nội dung thanh toán / Tên hàng
          if (descNorm.includes(qNorm)) {
            score += 400;
          } else if (tokens.every((tok) => descNorm.includes(tok))) {
            score += 250;
          }

          // Điểm cộng theo độ mới (recency)
          score += Math.min(100, (Number(r.legacy_stt || r.id) || 0) * 0.1);
        }

        items.push({
          id: `payment-${r.id}`,
          category: "payment",
          categoryLabel: "Thanh toán",
          categoryIcon: "💳",
          categoryBg: "#ecfdf5",
          categoryColor: "#059669",
          title: `ĐNTT #${r.legacy_stt || r.id} · ${r.payee_name || "Chưa có NCC"}`,
          subtitle: `${r.item_name || r.description || "Thanh toán"} · HĐ: ${r.invoice_no || "---"} · ${fmtMoney(r.amount)} ${r.currency || "VND"}`,
          badge: r.status || "Chờ xử lý",
          badgeBg: r.status === "Done" ? "#dcfce7" : "#fef3c7",
          badgeColor: r.status === "Done" ? "#15803d" : "#b45309",
          target: {
            view: "payment",
            paymentId: r.id,
            query: "", // Để trống tìm kiếm bảng để không lọc ẩn các dòng dữ liệu khác
          },
          score,
        });
      }
    }

    // 2. Contracts & Purchase Orders (Hợp đồng & Đơn hàng PO)
    for (const po of pos) {
      const supp = suppliers.find((s) => s.id === po.supplierId);
      const isContract = isPOContract(po);
      const totalAmount = (po.items || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);

      const corpus = [
        po.number,
        po.prNumber,
        po.contractNote,
        supp?.name,
        supp?.shortName,
        supp?.code,
        po.note,
        po.createdDate,
        po.expectedDate,
        ...(po.items || []).map((it) => `${it.name || ""} ${it.code || ""} ${it.spec || ""}`),
      ].filter(Boolean).join(" ");

      if (matchCorpus(corpus)) {
        let score = 0;
        if (tokens.length === 0) {
          score = (isContract ? 95 : 90) + (po.id || 0) * 0.05;
        } else {
          const numNorm = normalizeSearchText(po.number || "");
          const prNorm = normalizeSearchText(po.prNumber || "");
          const suppNameNorm = normalizeSearchText(supp?.name || "");
          const suppShortNorm = normalizeSearchText(supp?.shortName || "");
          const suppCodeNorm = normalizeSearchText(supp?.code || "");
          const itemsNorm = normalizeSearchText(
            (po.items || []).map((it) => `${it.name || ""} ${it.code || ""} ${it.spec || ""}`).join(" ")
          );
          const noteNorm = normalizeSearchText(`${po.note || ""} ${po.contractNote || ""}`);

          // Khớp số PO
          if (numNorm === qNorm || (searchDigits && po.number.replace(/\D/g, "") === searchDigits)) {
            score += 2500;
          } else if (numNorm.startsWith(qNorm)) {
            score += 1200;
          } else if (numNorm.includes(qNorm)) {
            score += 800;
          }

          // Khớp số PR liên quan
          if (prNorm === qNorm) {
            score += 1400;
          } else if (prNorm.includes(qNorm)) {
            score += 600;
          }

          // Khớp Nhà Cung Cấp
          if (suppNameNorm === qNorm || suppShortNorm === qNorm || suppCodeNorm === qNorm) {
            score += 2000;
          } else if (suppNameNorm.startsWith(qNorm) || suppShortNorm.startsWith(qNorm)) {
            score += 1400;
          } else if (suppNameNorm.includes(qNorm) || suppShortNorm.includes(qNorm)) {
            score += 1100;
          } else if (tokens.every((tok) => suppNameNorm.includes(tok) || suppShortNorm.includes(tok))) {
            score += 900;
          }

          // Khớp Tên hàng / Diễn giải
          if (itemsNorm.includes(qNorm)) {
            score += 450;
          } else if (tokens.every((tok) => itemsNorm.includes(tok))) {
            score += 300;
          }

          if (noteNorm.includes(qNorm)) {
            score += 200;
          }

          score += Math.min(100, (po.id || 0) * 0.1);
        }

        if (isContract) {
          items.push({
            id: `contract-${po.id}`,
            category: "contract",
            categoryLabel: "Hợp đồng",
            categoryIcon: "📑",
            categoryBg: "#f5f3ff",
            categoryColor: "#7c3aed",
            title: `Hợp đồng ${po.number} · ${supp?.shortName || supp?.name || "NCC"}`,
            subtitle: `${po.items?.length || 0} mặt hàng · Trị giá: ${fmt(totalAmount)} ₫ · PR: ${po.prNumber || "Trực tiếp"}`,
            badge: "Hợp đồng",
            badgeBg: "#ede9fe",
            badgeColor: "#6d28d9",
            target: {
              view: "contracts",
              po,
              query: po.number,
            },
            score,
          });
        } else {
          items.push({
            id: `po-${po.id}`,
            category: "po",
            categoryLabel: "Đơn mua hàng",
            categoryIcon: "📦",
            categoryBg: "#eff6ff",
            categoryColor: "#2563eb",
            title: `PO ${po.number} · ${supp?.shortName || supp?.name || "NCC"}`,
            subtitle: `${po.items?.length || 0} mặt hàng · Trị giá: ${fmt(totalAmount)} ₫ · Hạn giao: ${po.expectedDate || "---"}`,
            badge: po.items?.every((it) => it.deliveryStatus === "Đã giao") ? "Đã giao đủ" : "Đang giao hàng",
            badgeBg: po.items?.every((it) => it.deliveryStatus === "Đã giao") ? "#dcfce7" : "#e0e7ff",
            badgeColor: po.items?.every((it) => it.deliveryStatus === "Đã giao") ? "#15803d" : "#4338ca",
            target: {
              view: "po-detail",
              po,
              query: po.number,
            },
            score,
          });
        }
      }
    }

    // 3. Purchase Requests (Yêu cầu mua hàng PR)
    for (const pr of prs) {
      const corpus = [
        pr.number,
        pr.department,
        pr.purpose,
        pr.note,
        pr.status,
        ...(pr.items || []).map((it) => `${it.name || ""} ${it.code || ""} ${it.spec || ""}`),
      ].filter(Boolean).join(" ");

      if (matchCorpus(corpus)) {
        let score = 0;
        if (tokens.length === 0) {
          score = 80 + (pr.id || 0) * 0.05;
        } else {
          const numNorm = normalizeSearchText(pr.number || "");
          const deptNorm = normalizeSearchText(pr.department || "");
          const purpNorm = normalizeSearchText(pr.purpose || "");
          const itemsNorm = normalizeSearchText(
            (pr.items || []).map((it) => `${it.name || ""} ${it.code || ""} ${it.spec || ""}`).join(" ")
          );

          if (numNorm === qNorm || (searchDigits && pr.number.replace(/\D/g, "") === searchDigits)) {
            score += 2500;
          } else if (numNorm.startsWith(qNorm)) {
            score += 1200;
          } else if (numNorm.includes(qNorm)) {
            score += 800;
          }

          if (deptNorm === qNorm) {
            score += 1000;
          } else if (deptNorm.includes(qNorm) || purpNorm.includes(qNorm)) {
            score += 500;
          }

          if (itemsNorm.includes(qNorm)) {
            score += 450;
          } else if (tokens.every((tok) => itemsNorm.includes(tok))) {
            score += 300;
          }

          score += Math.min(100, (pr.id || 0) * 0.1);
        }

        items.push({
          id: `pr-${pr.id}`,
          category: "pr",
          categoryLabel: "Yêu cầu mua hàng",
          categoryIcon: "📋",
          categoryBg: "#f0fdfa",
          categoryColor: "#0d9488",
          title: `PR ${pr.number} · ${pr.department || "Phòng ban"}`,
          subtitle: `Mục đích: ${pr.purpose || "---"} · ${pr.items?.length || 0} mặt hàng`,
          badge: pr.status || "Đang xử lý",
          badgeBg: pr.status === "Hoàn thành" ? "#dcfce7" : "#ccfbf1",
          badgeColor: pr.status === "Hoàn thành" ? "#15803d" : "#0f766e",
          target: {
            view: "compare",
            pr,
            query: pr.number,
          },
          score,
        });
      }
    }

    // 4. Handovers (Bàn giao nội bộ)
    for (const h of paymentHandovers) {
      const corpus = [
        h.id,
        h.department,
        h.item_name,
        h.specification,
        h.unit,
        h.sender_name,
        h.receiver_name,
        h.note,
        h.handover_date,
      ].filter(Boolean).join(" ");

      if (matchCorpus(corpus)) {
        let score = 0;
        if (tokens.length === 0) {
          score = 70 + (h.id || 0) * 0.05;
        } else {
          const idStr = String(h.id || "");
          const itemNorm = normalizeSearchText(h.item_name || "");
          const deptNorm = normalizeSearchText(h.department || "");
          const senderNorm = normalizeSearchText(`${h.sender_name || ""} ${h.receiver_name || ""}`);
          const noteNorm = normalizeSearchText(h.note || "");

          if (searchDigits && idStr === searchDigits) {
            score += 2500;
          } else if (qNorm === `#${idStr}`) {
            score += 2500;
          }

          if (itemNorm.includes(qNorm)) {
            score += 600;
          } else if (tokens.every((tok) => itemNorm.includes(tok))) {
            score += 350;
          }

          if (deptNorm.includes(qNorm)) {
            score += 400;
          }

          if (senderNorm.includes(qNorm) || noteNorm.includes(qNorm)) {
            score += 200;
          }

          score += Math.min(100, (h.id || 0) * 0.1);
        }

        items.push({
          id: `handover-${h.id}`,
          category: "handover",
          categoryLabel: "Bàn giao nội bộ",
          categoryIcon: "🚚",
          categoryBg: "#fffbeb",
          categoryColor: "#d97706",
          title: `Bàn giao #${h.id} · ${h.department || "Bộ phận nhận"}`,
          subtitle: `${h.item_name} · ĐVT: ${h.unit || "Cái"} · Đạt: ${h.quantity_pass || 0}/${h.quantity_doc || 0} · Ngày: ${h.handover_date || "---"}`,
          badge: `BP: ${h.department || "Nội bộ"}`,
          badgeBg: "#fef3c7",
          badgeColor: "#92400e",
          target: {
            view: "handover",
            handoverId: h.id,
            query: "",
          },
          score,
        });
      }
    }

    // 5. Suppliers (Nhà cung cấp)
    for (const s of suppliers) {
      const corpus = [
        s.name,
        s.shortName,
        s.code,
        s.bankAccount,
        s.bank,
        s.address,
        s.contact,
        s.phone,
      ].filter(Boolean).join(" ");

      if (matchCorpus(corpus)) {
        let score = 0;
        if (tokens.length === 0) {
          score = 60;
        } else {
          const nameNorm = normalizeSearchText(s.name || "");
          const shortNorm = normalizeSearchText(s.shortName || "");
          const codeNorm = normalizeSearchText(s.code || "");
          const contactNorm = normalizeSearchText(`${s.contact || ""} ${s.address || ""}`);

          if (nameNorm === qNorm || shortNorm === qNorm || codeNorm === qNorm) {
            score += 2200;
          } else if (nameNorm.startsWith(qNorm) || shortNorm.startsWith(qNorm) || codeNorm.startsWith(qNorm)) {
            score += 1500;
          } else if (nameNorm.includes(qNorm) || shortNorm.includes(qNorm)) {
            score += 1100;
          } else if (tokens.every((tok) => nameNorm.includes(tok) || shortNorm.includes(tok))) {
            score += 850;
          } else if (contactNorm.includes(qNorm)) {
            score += 300;
          }
        }

        items.push({
          id: `supplier-${s.id}`,
          category: "supplier",
          categoryLabel: "Nhà cung cấp",
          categoryIcon: "🏢",
          categoryBg: "#faf5ff",
          categoryColor: "#9333ea",
          title: `NCC: ${s.shortName || s.name} (${s.code || "---"})`,
          subtitle: `${s.name} · TK: ${s.bankAccount ? `${s.bankAccount} (${s.bank || ""})` : "Chưa có TK"}`,
          badge: "Đối tác",
          badgeBg: "#f3e8ff",
          badgeColor: "#7e22ce",
          target: {
            view: "suppliers",
            query: s.shortName || s.name,
          },
          score,
        });
      }
    }

    // 6. Products (Danh mục vật tư / hàng hóa)
    for (const p of products) {
      const corpus = [p.code, p.name, p.category, p.spec, p.unit].filter(Boolean).join(" ");

      if (matchCorpus(corpus)) {
        let score = 0;
        if (tokens.length === 0) {
          score = 50;
        } else {
          const codeNorm = normalizeSearchText(p.code || "");
          const nameNorm = normalizeSearchText(p.name || "");
          const specNorm = normalizeSearchText(p.spec || "");

          if (codeNorm === qNorm) {
            score += 2200;
          } else if (codeNorm.startsWith(qNorm)) {
            score += 1400;
          } else if (nameNorm === qNorm) {
            score += 2000;
          } else if (nameNorm.startsWith(qNorm)) {
            score += 1300;
          } else if (nameNorm.includes(qNorm)) {
            score += 900;
          } else if (tokens.every((tok) => nameNorm.includes(tok) || specNorm.includes(tok))) {
            score += 700;
          }
        }

        items.push({
          id: `product-${p.id}`,
          category: "product",
          categoryLabel: "Danh mục vật tư",
          categoryIcon: "🔬",
          categoryBg: "#f0fdf4",
          categoryColor: "#16a34a",
          title: `[${p.code}] ${p.name}`,
          subtitle: `Nhóm: ${p.category} · Quy cách: ${p.spec || "---"} · ĐVT: ${p.unit || "Cái"}`,
          badge: p.category || "Vật tư",
          badgeBg: "#dcfce7",
          badgeColor: "#166534",
          target: {
            view: "products",
            query: p.code || p.name,
          },
          score,
        });
      }
    }

    // Sắp xếp ưu tiên độ khớp cao nhất lên đầu
    items.sort((a, b) => b.score - a.score);

    return items;
  }, [query, paymentRequests, pos, prs, paymentHandovers, suppliers, products]);

  // Count items per category
  const categoryCounts = useMemo(() => {
    const counts: Record<SpotlightCategory, number> = {
      all: allResults.length,
      payment: 0,
      contract: 0,
      po: 0,
      pr: 0,
      handover: 0,
      supplier: 0,
      product: 0,
    };
    for (const it of allResults) {
      counts[it.category] = (counts[it.category] || 0) + 1;
    }
    return counts;
  }, [allResults]);

  // Filtered by selected tab
  const filteredResults = useMemo(() => {
    if (activeCategory === "all") return allResults.slice(0, 30);
    return allResults.filter((it) => it.category === activeCategory).slice(0, 40);
  }, [allResults, activeCategory]);

  // Adjust selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults.length, activeCategory]);

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelectItem(filteredResults[selectedIndex]);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(".spotlight-item.active") as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  const handleSelectItem = (item: SpotlightItem) => {
    onNavigate(item.target);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="spotlight-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="spotlight-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Header */}
        <div className="spotlight-header">
          <span className="spotlight-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm số hóa đơn, tên NCC, mã vật tư, số PR, số PO, nội dung..."
          />
          {query && (
            <button
              type="button"
              className="spotlight-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
          <kbd className="spotlight-close-kbd">ESC</kbd>
        </div>

        {/* Category Tabs */}
        <div className="spotlight-tabs">
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "all" ? "active" : ""}`}
            onClick={() => setActiveCategory("all")}
          >
            <span>Tất cả</span>
            <span className="spotlight-tab-count">{categoryCounts.all}</span>
          </button>
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "payment" ? "active" : ""}`}
            onClick={() => setActiveCategory("payment")}
          >
            <span>💳 Thanh toán</span>
            <span className="spotlight-tab-count">{categoryCounts.payment}</span>
          </button>
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "contract" ? "active" : ""}`}
            onClick={() => setActiveCategory("contract")}
          >
            <span>📑 Hợp đồng</span>
            <span className="spotlight-tab-count">{categoryCounts.contract}</span>
          </button>
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "po" ? "active" : ""}`}
            onClick={() => setActiveCategory("po")}
          >
            <span>📦 PO</span>
            <span className="spotlight-tab-count">{categoryCounts.po}</span>
          </button>
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "pr" ? "active" : ""}`}
            onClick={() => setActiveCategory("pr")}
          >
            <span>📋 PR</span>
            <span className="spotlight-tab-count">{categoryCounts.pr}</span>
          </button>
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "handover" ? "active" : ""}`}
            onClick={() => setActiveCategory("handover")}
          >
            <span>🚚 Bàn giao</span>
            <span className="spotlight-tab-count">{categoryCounts.handover}</span>
          </button>
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "supplier" ? "active" : ""}`}
            onClick={() => setActiveCategory("supplier")}
          >
            <span>🏢 NCC</span>
            <span className="spotlight-tab-count">{categoryCounts.supplier}</span>
          </button>
          <button
            type="button"
            className={`spotlight-tab-btn ${activeCategory === "product" ? "active" : ""}`}
            onClick={() => setActiveCategory("product")}
          >
            <span>🔬 Vật tư</span>
            <span className="spotlight-tab-count">{categoryCounts.product}</span>
          </button>
        </div>

        {/* Results List */}
        <div className="spotlight-list" ref={listRef}>
          {filteredResults.length > 0 ? (
            filteredResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`spotlight-item ${isSelected ? "active" : ""}`}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div
                    className="spotlight-item-icon"
                    style={{ background: item.categoryBg, color: item.categoryColor }}
                  >
                    {item.categoryIcon}
                  </div>
                  <div className="spotlight-item-body">
                    <div className="spotlight-item-title-row">
                      <span className="spotlight-item-title">{item.title}</span>
                      {item.badge && (
                        <span
                          className="spotlight-item-badge"
                          style={{
                            background: item.badgeBg || "#f1f5f9",
                            color: item.badgeColor || "#475569",
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <span className="spotlight-item-sub">{item.subtitle}</span>
                  </div>
                  <span className="spotlight-item-enter">↵ Mở</span>
                </div>
              );
            })
          ) : (
            <div className="spotlight-empty">
              <div className="spotlight-empty-icon">🔍</div>
              <div className="spotlight-empty-text">
                {query ? `Không tìm thấy kết quả nào cho "${query}"` : "Nhập từ khóa để tìm kiếm"}
              </div>
              <div className="spotlight-empty-sub">
                Hỗ trợ tìm kiếm theo số hóa đơn, số PO, PR, tên nhà cung cấp, mã vật tư hoặc nội dung chuyển tiền.
              </div>
            </div>
          )}
        </div>

        {/* Footer with Keyboard Hints */}
        <div className="spotlight-footer">
          <div className="spotlight-footer-keys">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> Di chuyển
            </span>
            <span>
              <kbd>↵</kbd> Chọn mở
            </span>
            <span>
              <kbd>ESC</kbd> Đóng
            </span>
          </div>
          <div>
            {filteredResults.length} / {allResults.length} kết quả phù hợp
          </div>
        </div>
      </div>
    </div>
  );
}
