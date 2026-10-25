import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Truck,
  CreditCard,
  ArrowRight,
  Trash2,
  Check,
  Tag,
  Calendar,
  Layers,
  Sparkles,
  DollarSign,
  Filter,
  Package,
  FileCheck,
  X,
} from "lucide-react";
import { PR, PO, Supplier, PurchaseHistory, ApprovalRequest, PaymentRequestEntry } from "../types";
import { fmt } from "../utils";

// --- TYPES FOR DASHBOARD TO-DO WIDGET & MENTION SYSTEM ---
export interface DashboardTodo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  priority?: "high" | "normal" | "low";
}

export interface MentionItem {
  id: string;
  category: "po" | "pr" | "dnpd" | "ncc";
  tag: string;
  badge: string;
  title: string;
  subtitle?: string;
  meta?: string;
  status?: string;
  searchStr: string;
}

const STORAGE_KEY_TODOS = "scmh_dashboard_todos_v1";

export function Dashboard({
  prs = [],
  pos = [],
  approvalRequests = [],
  paymentRequests = [],
  suppliers = [],
  purchaseHistory = [],
  onNavigate,
  onOpenSpotlight,
  onCreatePR,
  onCreateApproval,
  onCreatePO,
  onSelectPR,
  onSelectPO,
  onSelectApproval,
  onSelectPayment,
}: {
  prs?: PR[];
  pos?: PO[];
  approvalRequests?: ApprovalRequest[];
  paymentRequests?: PaymentRequestEntry[];
  suppliers?: Supplier[];
  purchaseHistory?: PurchaseHistory[];
  onNavigate?: (route: any) => void;
  onOpenSpotlight?: () => void;
  onCreatePR?: () => void;
  onCreateApproval?: () => void;
  onCreatePO?: () => void;
  onSelectPR?: (pr: PR) => void;
  onSelectPO?: (po: PO) => void;
  onSelectApproval?: (id: number) => void;
  onSelectPayment?: (id: number) => void;
}) {
  // Current date for comparison
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // -------------------------------------------------------------
  // 1. ACTION ITEMS QUEUE (Khu vực 1: Hàng đợi cần xử lý ngay)
  // -------------------------------------------------------------
  type QueueTab = "pr_quote" | "approval_pending" | "po_delivery";
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>("pr_quote");

  // Tab 1: PRs waiting for quote / compare
  const pendingPRs = useMemo(() => {
    return prs.filter(
      (p) =>
        p.status === "Chờ xử lý" ||
        p.status === "Đang lấy báo giá" ||
        p.status.toLowerCase().includes("báo giá") ||
        p.status.toLowerCase().includes("so sánh"),
    );
  }, [prs]);

  // Tab 2: Approval requests waiting for decision
  const pendingApprovals = useMemo(() => {
    return approvalRequests.filter(
      (a) =>
        a.status === "Chờ phê duyệt" ||
        a.status === "Nháp" ||
        !a.status,
    );
  }, [approvalRequests]);

  // Tab 3: POs undelivered / partially delivered
  const pendingDeliveryPOs = useMemo(() => {
    return pos.filter((po) => {
      if (po.status === "Hoàn thành" || po.status === "Đã hủy") return false;
      const items = po.items || [];
      const hasUndelivered = items.some(
        (i) => (i.deliveredQty || 0) < i.qty || i.deliveryStatus !== "Đã giao",
      );
      return hasUndelivered || po.status.toLowerCase().includes("giao");
    });
  }, [pos]);

  // -------------------------------------------------------------
  // 2. PAYMENT & CASH FLOW TRACKER (Khu vực 2: Dòng tiền & Đợt thanh toán)
  // -------------------------------------------------------------
  type CashFlowFilter = "all" | "advance_urgent" | "due_soon";
  const [cashFlowFilter, setCashFlowFilter] = useState<CashFlowFilter>("all");

  const cashFlowItems = useMemo(() => {
    const list: Array<{
      poId: number;
      poNumber: string;
      supplierName: string;
      phase: string;
      amount: number;
      date: string;
      isAdvance: boolean;
      status: string;
      urgency: "overdue" | "due_soon" | "normal";
      urgencyLabel: string;
    }> = [];

    pos.forEach((po) => {
      const sup = suppliers.find((s) => s.id === po.supplierId);
      const supplierName = sup?.name || "Chưa rõ NCC";
      const payments = po.payments || [];

      payments.forEach((pm) => {
        if (pm.status === "Đã thanh toán") return;

        const isAdvance =
          pm.condition === "advance" ||
          pm.phase.toLowerCase().includes("tạm ứng") ||
          pm.phase.toLowerCase().includes("đặt cọc") ||
          pm.phase.toLowerCase().includes("trước giao");

        let urgency: "overdue" | "due_soon" | "normal" = "normal";
        let urgencyLabel = "Trong hạn";

        if (pm.date) {
          const diffDays = Math.ceil(
            (new Date(pm.date).getTime() - new Date(todayStr).getTime()) /
              (1000 * 3600 * 24),
          );
          if (diffDays < 0) {
            urgency = "overdue";
            urgencyLabel = `Quá hạn ${Math.abs(diffDays)} ngày`;
          } else if (diffDays <= 3) {
            urgency = "due_soon";
            urgencyLabel = diffDays === 0 ? "Đến hạn hôm nay" : `Hạn trong ${diffDays} ngày`;
          }
        } else if (isAdvance) {
          // If advance payment with no set date, it holds up delivery!
          urgency = "overdue";
          urgencyLabel = "Cần TT để giao hàng";
        }

        list.push({
          poId: po.id,
          poNumber: po.number,
          supplierName,
          phase: pm.phase || "Đợt thanh toán",
          amount: pm.amount || 0,
          date: pm.date || "Chưa rõ ngày",
          isAdvance,
          status: pm.status,
          urgency,
          urgencyLabel,
        });
      });
    });

    // Sort: overdue first, then due_soon, then normal
    return list.sort((a, b) => {
      const score = (u: string) => (u === "overdue" ? 3 : u === "due_soon" ? 2 : 1);
      return score(b.urgency) - score(a.urgency);
    });
  }, [pos, suppliers, todayStr]);

  const filteredCashFlowItems = useMemo(() => {
    if (cashFlowFilter === "advance_urgent") {
      return cashFlowItems.filter((item) => item.isAdvance);
    }
    if (cashFlowFilter === "due_soon") {
      return cashFlowItems.filter(
        (item) => item.urgency === "overdue" || item.urgency === "due_soon",
      );
    }
    return cashFlowItems;
  }, [cashFlowItems, cashFlowFilter]);

  // -------------------------------------------------------------
  // 3. TO-DO LIST & NOTES (Khu vực 3: Bảng công việc cá nhân)
  // -------------------------------------------------------------
  const [todos, setTodos] = useState<DashboardTodo[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TODOS);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    // Default initial seed tasks linking to real items
    return [
      {
        id: "todo-1",
        text: "Gọi điện giục NCC Minox gửi CO/CQ và hóa đơn cho @PO-001",
        completed: false,
        createdAt: new Date().toISOString(),
        priority: "high",
      },
      {
        id: "todo-2",
        text: "Kiểm tra lại báo giá van bướm và lập so sánh giá cho #PR-001",
        completed: false,
        createdAt: new Date().toISOString(),
        priority: "normal",
      },
      {
        id: "todo-3",
        text: "Nhắc phòng QA ký xác nhận biên bản nghiệm thu đợt 2 cho @PO-002",
        completed: false,
        createdAt: new Date().toISOString(),
        priority: "normal",
      },
      {
        id: "todo-4",
        text: "Kiểm tra hồ sơ trình ký đề nghị phê duyệt @DNPD-001",
        completed: true,
        createdAt: new Date().toISOString(),
        priority: "low",
      },
    ];
  });

  // Save to localStorage whenever todos change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
    } catch (e) {
      console.error("Failed to save todos to localStorage", e);
    }
  }, [todos]);

  const [todoInput, setTodoInput] = useState("");
  const [todoPriority, setTodoPriority] = useState<"high" | "normal" | "low">("normal");
  const [todoFilter, setTodoFilter] = useState<"all" | "active" | "completed">("all");

  // Mention State & Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const [mentionCategoryTab, setMentionCategoryTab] = useState<"all" | "po" | "pr" | "dnpd" | "ncc">("all");
  const [mentionState, setMentionState] = useState<{
    isOpen: boolean;
    query: string;
    categoryFilter: "all" | "po" | "pr" | "dnpd" | "ncc";
    symbol: "@" | "#";
    startIndex: number;
    selectedIndex: number;
  }>({
    isOpen: false,
    query: "",
    categoryFilter: "all",
    symbol: "@",
    startIndex: 0,
    selectedIndex: 0,
  });

  // Build the complete list of mention items across PO, PR, DNPD, and NCC
  const allMentionItems = useMemo<MentionItem[]>(() => {
    const items: MentionItem[] = [];

    // 1. POs
    pos.forEach((po) => {
      const supp = suppliers.find((s) => s.id === po.supplierId);
      const suppName = supp?.name || "";
      const cleanNum = po.number.startsWith("PO-") ? po.number : `PO-${po.number}`;
      const itemsSummary = po.items?.map((i) => i.name).join(" ") || "";
      const poTotal = po.items?.reduce((sum, item) => sum + (item.price || 0) * (item.qty || 0), 0) || 0;
      items.push({
        id: `po-${po.id}`,
        category: "po",
        tag: `@${cleanNum}`,
        badge: "PO",
        title: po.number,
        subtitle: suppName || undefined,
        meta: `${poTotal > 0 ? fmt(poTotal) + " đ · " : ""}${po.createdDate || ""}`,
        status: po.status,
        searchStr: `${po.number} ${suppName} ${itemsSummary} ${po.prNumber || ""}`.toLowerCase(),
      });
    });

    // 2. PRs
    prs.forEach((pr) => {
      const cleanNum = pr.number.startsWith("PR-") ? pr.number : `PR-${pr.number}`;
      const itemsSummary = pr.items?.map((i) => i.name).join(" ") || "";
      items.push({
        id: `pr-${pr.id}`,
        category: "pr",
        tag: `#${cleanNum}`,
        badge: "PR",
        title: pr.number,
        subtitle: pr.department ? `${pr.department}${pr.purpose ? " · " + pr.purpose : ""}` : (pr.purpose || undefined),
        meta: `${pr.items?.length || 0} vật tư · ${pr.date || ""}`,
        status: pr.status,
        searchStr: `${pr.number} ${pr.department || ""} ${pr.purpose || ""} ${itemsSummary} ${pr.note || ""}`.toLowerCase(),
      });
    });

    // 3. Approval Requests (ĐNPD)
    approvalRequests.forEach((appr) => {
      const cleanNum = appr.requestNumber.startsWith("DNPD-") ? appr.requestNumber : `DNPD-${appr.requestNumber}`;
      items.push({
        id: `dnpd-${appr.id}`,
        category: "dnpd",
        tag: `@${cleanNum}`,
        badge: "ĐNPD",
        title: appr.requestNumber,
        subtitle: appr.recommendedSupplierName ? `NCC đề xuất: ${appr.recommendedSupplierName}` : (appr.department || undefined),
        meta: appr.createdDate ? `Ngày tạo: ${appr.createdDate}` : undefined,
        status: appr.status || "Chờ duyệt",
        searchStr: `${appr.requestNumber} ${appr.recommendedSupplierName || ""} ${appr.department || ""} ${appr.section1Title || ""}`.toLowerCase(),
      });
    });

    // 4. Suppliers (NCC)
    suppliers.forEach((s) => {
      const tagSafe = s.name.replace(/\s+/g, "_");
      items.push({
        id: `ncc-${s.id}`,
        category: "ncc",
        tag: `@NCC-${tagSafe}`,
        badge: "NCC",
        title: s.name,
        subtitle: s.contact ? `${s.contact}${s.phone ? " · " + s.phone : ""}` : (s.phone || undefined),
        meta: s.code ? `Mã: ${s.code}` : undefined,
        searchStr: `${s.name} ${s.code || ""} ${s.contact || ""} ${s.phone || ""} ${s.address || ""}`.toLowerCase(),
      });
    });

    return items;
  }, [pos, prs, approvalRequests, suppliers]);

  // Filter mention items based on category tab & search query
  const filteredMentionItems = useMemo(() => {
    const activeTab = mentionCategoryTab;
    const q = mentionState.query.toLowerCase().trim();

    let list = allMentionItems;
    if (activeTab !== "all") {
      list = list.filter((item) => item.category === activeTab);
    }

    if (q) {
      list = list.filter((item) => item.searchStr.includes(q));
    }

    return list.slice(0, 12);
  }, [allMentionItems, mentionCategoryTab, mentionState.query]);

  // Check mention trigger in text
  const checkMentionTrigger = (text: string, cursorPos: number) => {
    const textBefore = text.slice(0, cursorPos);
    const match = textBefore.match(/(?:^|\s)([@#])([a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF]*)$/);

    if (!match) {
      setMentionState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
      return;
    }

    const symbol = match[1] as "@" | "#";
    const word = match[2];
    const startIndex = cursorPos - (symbol.length + word.length);
    const lowerWord = word.toLowerCase();

    let cat: "all" | "po" | "pr" | "dnpd" | "ncc" = "all";
    let search = lowerWord;

    if (lowerWord.startsWith("po-") || lowerWord === "po") {
      cat = "po";
      search = lowerWord.replace(/^po-?/, "").trim();
    } else if (lowerWord.startsWith("pr-") || lowerWord === "pr") {
      cat = "pr";
      search = lowerWord.replace(/^pr-?/, "").trim();
    } else if (lowerWord.startsWith("dnpd-") || lowerWord === "dnpd" || lowerWord === "dn") {
      cat = "dnpd";
      search = lowerWord.replace(/^(dnpd|dn)-?/, "").trim();
    } else if (lowerWord.startsWith("ncc-") || lowerWord === "ncc") {
      cat = "ncc";
      search = lowerWord.replace(/^ncc-?/, "").trim();
    } else if (symbol === "#") {
      cat = "pr";
      search = lowerWord;
    }

    setMentionCategoryTab(cat);
    setMentionState({
      isOpen: true,
      query: search,
      categoryFilter: cat,
      symbol,
      startIndex,
      selectedIndex: 0,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTodoInput(val);
    const pos = e.target.selectionStart ?? val.length;
    checkMentionTrigger(val, pos);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mentionState.isOpen || filteredMentionItems.length === 0) {
      if (e.key === "Escape" && mentionState.isOpen) {
        e.preventDefault();
        setMentionState((prev) => ({ ...prev, isOpen: false }));
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionState((prev) => ({
        ...prev,
        selectedIndex: (prev.selectedIndex + 1) % filteredMentionItems.length,
      }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionState((prev) => ({
        ...prev,
        selectedIndex:
          (prev.selectedIndex - 1 + filteredMentionItems.length) %
          filteredMentionItems.length,
      }));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const item = filteredMentionItems[mentionState.selectedIndex];
      if (item) {
        applyMentionItem(item);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionState((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const applyMentionItem = (item: MentionItem) => {
    const before = todoInput.slice(0, mentionState.startIndex);
    const after = todoInput.slice(inputRef.current?.selectionStart ?? (mentionState.startIndex + mentionState.query.length + 1));
    const cleanAfter = after.replace(/^[a-zA-Z0-9_\-]+/, "");
    const newText = `${before}${item.tag} ${cleanAfter}`;

    setTodoInput(newText);
    setMentionState((prev) => ({ ...prev, isOpen: false }));

    const newCursor = before.length + item.tag.length + 1;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  const handleInsertHelperTag = (tagPrefix: string) => {
    const current = todoInput;
    const needLeadingSpace = current.length > 0 && !current.endsWith(" ");
    const textToAdd = (needLeadingSpace ? " " : "") + tagPrefix;
    const newText = current + textToAdd;
    setTodoInput(newText);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const pos = newText.length;
        inputRef.current.setSelectionRange(pos, pos);
        checkMentionTrigger(newText, pos);
      }
    }, 10);
  };

  // Close mention dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setMentionState((prev) => ({ ...prev, isOpen: false }));
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddTodo = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = todoInput.trim();
    if (!trimmed) return;

    const newTodo: DashboardTodo = {
      id: "todo-" + Date.now(),
      text: trimmed,
      completed: false,
      createdAt: new Date().toISOString(),
      priority: todoPriority,
    };

    setTodos((prev) => [newTodo, ...prev]);
    setTodoInput("");
    setTodoPriority("normal");
    setMentionState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleToggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  };

  const handleDeleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClearCompletedTodos = () => {
    setTodos((prev) => prev.filter((t) => !t.completed));
  };

  // Smart tag click handlers
  const handleOpenPRTag = (tagText: string) => {
    const rawTag = tagText.replace(/^[@#]/i, "").trim().toLowerCase();
    const clean = tagText.replace(/^[@#]PR-?/i, "").trim().toLowerCase();
    const matched = prs.find(
      (p) =>
        p.number.toLowerCase() === rawTag ||
        p.number.toLowerCase() === clean ||
        p.number.toLowerCase() === `pr-${clean}` ||
        p.number.toLowerCase().includes(clean) ||
        String(p.id) === clean,
    );
    if (matched && onSelectPR) {
      onSelectPR(matched);
    } else if (onNavigate) {
      onNavigate({ view: "prs" });
    }
  };

  const handleOpenPOTag = (tagText: string) => {
    const rawTag = tagText.replace(/^@/i, "").trim().toLowerCase();
    const clean = tagText.replace(/^@PO-?/i, "").trim().toLowerCase();
    const matched = pos.find(
      (p) =>
        p.number.toLowerCase() === rawTag ||
        p.number.toLowerCase() === clean ||
        p.number.toLowerCase() === `po-${clean}` ||
        p.number.toLowerCase().includes(clean) ||
        String(p.id) === clean,
    );
    if (matched && onSelectPO) {
      onSelectPO(matched);
    } else if (onNavigate) {
      onNavigate({ view: "po-list" });
    }
  };

  const handleOpenApprovalTag = (tagText: string) => {
    const rawTag = tagText.replace(/^[@#]/i, "").trim().toLowerCase();
    const clean = tagText.replace(/^[@#]DNPD-?/i, "").trim().toLowerCase();
    const matched = approvalRequests.find(
      (a) =>
        a.requestNumber.toLowerCase() === rawTag ||
        a.requestNumber.toLowerCase() === clean ||
        a.requestNumber.toLowerCase() === `dnpd-${clean}` ||
        a.requestNumber.toLowerCase().includes(clean) ||
        String(a.id) === clean,
    );
    if (matched && onSelectApproval) {
      onSelectApproval(matched.id);
    } else if (onNavigate) {
      onNavigate({ view: "approval" });
    }
  };

  const handleOpenSupplierTag = (tagText: string) => {
    const rawTag = tagText.replace(/^[@#]NCC[-:]?/i, "").replace(/_/g, " ").trim().toLowerCase();
    const matched = suppliers.find(
      (s) =>
        s.name.toLowerCase() === rawTag ||
        s.name.toLowerCase().includes(rawTag) ||
        String(s.id) === rawTag,
    );
    if (onNavigate) {
      onNavigate({ view: "suppliers" });
    }
  };

  // Render text with clickable smart tags (@PO-xxx, #PR-xxx, @PR-xxx, @DNPD-xxx, @NCC-xxx)
  const renderSmartTodoText = (text: string) => {
    const parts = text.split(/([@#][A-Za-z0-9_\-\.:]+)/g);
    return parts.map((part, idx) => {
      if (/^[@#]PR-?[A-Za-z0-9_\-\.:]+/i.test(part)) {
        return (
          <button
            key={idx}
            type="button"
            className="todo-smart-chip chip-pr"
            title="Mở PR / So sánh giá"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPRTag(part);
            }}
          >
            {part}
          </button>
        );
      }
      if (/^@PO-?[A-Za-z0-9_\-\.:]+/i.test(part)) {
        return (
          <button
            key={idx}
            type="button"
            className="todo-smart-chip chip-po"
            title="Mở chi tiết PO"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPOTag(part);
            }}
          >
            {part}
          </button>
        );
      }
      if (/^[@#]DNPD-?[A-Za-z0-9_\-\.:]+/i.test(part)) {
        return (
          <button
            key={idx}
            type="button"
            className="todo-smart-chip chip-approval"
            title="Mở Đề nghị phê duyệt"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenApprovalTag(part);
            }}
          >
            {part}
          </button>
        );
      }
      if (/^[@#]NCC[-:][A-Za-z0-9_\-\.:]+/i.test(part)) {
        return (
          <button
            key={idx}
            type="button"
            className="todo-smart-chip chip-supplier"
            title="Mở Nhà cung cấp"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenSupplierTag(part);
            }}
          >
            {part}
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const filteredTodos = useMemo(() => {
    if (todoFilter === "active") return todos.filter((t) => !t.completed);
    if (todoFilter === "completed") return todos.filter((t) => t.completed);
    return todos;
  }, [todos, todoFilter]);

  const activeTodoCount = useMemo(() => todos.filter((t) => !t.completed).length, [todos]);

  // Operational Pulse Metrics
  const advanceRequiredCount = useMemo(
    () => cashFlowItems.filter((i) => i.isAdvance).length,
    [cashFlowItems],
  );

  return (
    <section className="content dashboard-workspace">
      {/* -------------------------------------------------------------
          DASHBOARD HEADER & QUICK ACTIONS
          ------------------------------------------------------------- */}
      <div className="dashboard-topbar">
        <div className="dashboard-topbar-title">
          <h1>Trung tâm Điều hành Mua hàng</h1>
        </div>

        {/* Quick Actions Bar (Khu vực 4) */}
        <div className="dashboard-quick-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenSpotlight}
            title="Tìm kiếm nhanh chứng từ (Ctrl + K)"
          >
            <Search size={14} /> Tra cứu (Ctrl+K)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCreatePR}
          >
            <Plus size={14} /> Tạo PR
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCreateApproval}
          >
            <CheckCircle2 size={14} /> Lập ĐNPD
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onCreatePO}
          >
            <Package size={14} /> Tạo PO
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          MAIN BENTO GRID (Col 8 : Col 4)
          ------------------------------------------------------------- */}
      <div className="dashboard-bento-grid">
        {/* LEFT COLUMN (8 Cols): ACTION ITEMS & CASH FLOW TRACKER */}
        <div className="dashboard-main-col">
          {/* KHU VỰC 1: HÀNG ĐỢI CẦN XỬ LÝ NGAY (ACTION ITEMS) */}
          <div className="dashboard-card queue-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-badge-icon badge-orange">
                  <AlertCircle size={16} />
                </span>
                <div>
                  <h2>Hàng đợi Cần xử lý ngay</h2>
                  <p>Các đầu việc đang chờ phê duyệt, lấy báo giá hoặc theo dõi nhận hàng</p>
                </div>
              </div>

              {/* Queue Segmented Tabs */}
              <div className="queue-tabs">
                <button
                  type="button"
                  className={`queue-tab-btn ${activeQueueTab === "pr_quote" ? "active" : ""}`}
                  onClick={() => setActiveQueueTab("pr_quote")}
                >
                  PR chờ báo giá
                  <span className="queue-pill-count">{pendingPRs.length}</span>
                </button>
                <button
                  type="button"
                  className={`queue-tab-btn ${activeQueueTab === "approval_pending" ? "active" : ""}`}
                  onClick={() => setActiveQueueTab("approval_pending")}
                >
                  ĐNPD chờ duyệt
                  <span className="queue-pill-count">{pendingApprovals.length}</span>
                </button>
                <button
                  type="button"
                  className={`queue-tab-btn ${activeQueueTab === "po_delivery" ? "active" : ""}`}
                  onClick={() => setActiveQueueTab("po_delivery")}
                >
                  PO giao thiếu / chậm
                  <span className="queue-pill-count">{pendingDeliveryPOs.length}</span>
                </button>
              </div>
            </div>

            {/* TAB CONTENT 1: PRs WAITING FOR QUOTE / COMPARE */}
            {activeQueueTab === "pr_quote" && (
              <div className="queue-table-wrap">
                {pendingPRs.length === 0 ? (
                  <div className="queue-empty-state">
                    <CheckCircle2 size={32} className="empty-icon-success" />
                    <p>Không có PR nào đang chờ xử lý báo giá. Mọi yêu cầu đã hoàn tất!</p>
                  </div>
                ) : (
                  <table className="queue-data-table">
                    <thead>
                      <tr>
                        <th>Mã PR</th>
                        <th>Đơn vị yêu cầu</th>
                        <th>Số món</th>
                        <th>Ngày tạo</th>
                        <th>Mục đích sử dụng</th>
                        <th style={{ textAlign: "right" }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingPRs.slice(0, 6).map((pr) => (
                        <tr key={pr.id}>
                          <td>
                            <button
                              type="button"
                              className="queue-code-link"
                              onClick={() => onSelectPR && onSelectPR(pr)}
                            >
                              {pr.number}
                            </button>
                          </td>
                          <td>
                            <span className="cell-dept-badge">{pr.department}</span>
                          </td>
                          <td>
                            <b>{pr.items?.length || 0}</b> mặt hàng
                          </td>
                          <td className="cell-date">{pr.date}</td>
                          <td className="cell-purpose" title={pr.purpose}>
                            {pr.purpose}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => onSelectPR && onSelectPR(pr)}
                            >
                              So sánh giá <ArrowRight size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* TAB CONTENT 2: APPROVALS WAITING FOR DECISION */}
            {activeQueueTab === "approval_pending" && (
              <div className="queue-table-wrap">
                {pendingApprovals.length === 0 ? (
                  <div className="queue-empty-state">
                    <CheckCircle2 size={32} className="empty-icon-success" />
                    <p>Không có tờ trình ĐNPD nào đang chờ phê duyệt.</p>
                  </div>
                ) : (
                  <table className="queue-data-table">
                    <thead>
                      <tr>
                        <th>Số ĐNPD</th>
                        <th>Bộ phận đề xuất</th>
                        <th>Nhà cung cấp lựa chọn</th>
                        <th style={{ textAlign: "right" }}>Tổng giá trị đề xuất</th>
                        <th>Ngày lập</th>
                        <th style={{ textAlign: "right" }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingApprovals.slice(0, 6).map((appr) => {
                        const selectedCol = (appr.supplierColumns || []).find((c) => c.isSelected);
                        const totalVal = (appr.rows || []).reduce((sum, r) => {
                          if (selectedCol && r.supplierQuotes?.[selectedCol.colId]) {
                            const lines = r.supplierQuotes[selectedCol.colId];
                            return (
                              sum +
                              lines.reduce(
                                (lSum, l) =>
                                  lSum +
                                  (l.amount ||
                                    (l.unitPrice || 0) * (l.qty || r.qty || 1)),
                                0,
                              )
                            );
                          }
                          const firstColId = Object.keys(r.supplierQuotes || {})[0];
                          if (firstColId && r.supplierQuotes[firstColId]) {
                            return (
                              sum +
                              r.supplierQuotes[firstColId].reduce(
                                (lSum, l) => lSum + (l.amount || 0),
                                0,
                              )
                            );
                          }
                          return sum;
                        }, 0);
                        return (
                          <tr key={appr.id}>
                            <td>
                              <button
                                type="button"
                                className="queue-code-link"
                                onClick={() =>
                                  onSelectApproval && onSelectApproval(appr.id)
                                }
                              >
                                {appr.requestNumber || `ĐNPD-#${appr.id}`}
                              </button>
                            </td>
                            <td>
                              <span className="cell-dept-badge">
                                {appr.department || "Phòng Cung ứng"}
                              </span>
                            </td>
                            <td>
                              <span className="cell-supplier-name">
                                {appr.recommendedSupplierName || "Đề xuất theo so sánh"}
                              </span>
                            </td>
                            <td className="cell-money" style={{ textAlign: "right" }}>
                              <b>{fmt(totalVal)} ₫</b>
                            </td>
                            <td className="cell-date">{appr.createdDate}</td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-xs"
                                onClick={() =>
                                  onSelectApproval && onSelectApproval(appr.id)
                                }
                              >
                                Xem & Duyệt <ArrowRight size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* TAB CONTENT 3: POs UNDELIVERED / PARTIALLY DELIVERED */}
            {activeQueueTab === "po_delivery" && (
              <div className="queue-table-wrap">
                {pendingDeliveryPOs.length === 0 ? (
                  <div className="queue-empty-state">
                    <CheckCircle2 size={32} className="empty-icon-success" />
                    <p>Tất cả các đơn hàng PO đã được giao đủ vào kho!</p>
                  </div>
                ) : (
                  <table className="queue-data-table">
                    <thead>
                      <tr>
                        <th>Mã PO</th>
                        <th>Nhà cung cấp</th>
                        <th>Hạn giao dự kiến</th>
                        <th>Tiến độ giao hàng</th>
                        <th>Tình trạng</th>
                        <th style={{ textAlign: "right" }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingDeliveryPOs.slice(0, 6).map((po) => {
                        const sup = suppliers.find((s) => s.id === po.supplierId);
                        const items = po.items || [];
                        const deliveredCount = items.filter(
                          (i) => i.deliveryStatus === "Đã giao",
                        ).length;
                        const percent = items.length
                          ? Math.round((deliveredCount / items.length) * 100)
                          : 0;

                        const isOverdue =
                          po.expectedDate && po.expectedDate < todayStr;

                        return (
                          <tr key={po.id}>
                            <td>
                              <button
                                type="button"
                                className="queue-code-link"
                                onClick={() => onSelectPO && onSelectPO(po)}
                              >
                                {po.number}
                              </button>
                            </td>
                            <td>
                              <span className="cell-supplier-name">
                                {sup?.name || "Chưa rõ NCC"}
                              </span>
                            </td>
                            <td className="cell-date">
                              <span className={isOverdue ? "date-overdue" : ""}>
                                {po.expectedDate || "Chưa hẹn ngày"}
                              </span>
                            </td>
                            <td>
                              <div className="delivery-progress-wrap">
                                <div className="mini-track">
                                  <div
                                    className="mini-fill"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <span className="mini-text">
                                  {deliveredCount}/{items.length} món ({percent}%)
                                </span>
                              </div>
                            </td>
                            <td>
                              {isOverdue ? (
                                <span className="tag-warning red">
                                  <AlertTriangle size={12} /> Chậm tiến độ
                                </span>
                              ) : (
                                <span className="tag-warning amber">
                                  <Clock size={12} /> Đang giao
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={() => onSelectPO && onSelectPO(po)}
                              >
                                Chi tiết PO <ArrowRight size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* KHU VỰC 2: THEO DÕI DÒNG TIỀN & ĐỢT THANH TOÁN ĐẾN HẠN */}
          <div className="dashboard-card cashflow-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-badge-icon badge-blue">
                  <CreditCard size={16} />
                </span>
                <div>
                  <h2>Theo dõi Dòng tiền & Tiến độ Thanh toán</h2>
                  <p>Hạn nợ và các khoản yêu cầu tạm ứng trước để nhà cung cấp giao hàng</p>
                </div>
              </div>

              {/* Cashflow Filter Pills */}
              <div className="cashflow-filter-pills">
                <button
                  type="button"
                  className={`pill-btn ${cashFlowFilter === "all" ? "active" : ""}`}
                  onClick={() => setCashFlowFilter("all")}
                >
                  Tất cả ({cashFlowItems.length})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${cashFlowFilter === "advance_urgent" ? "active" : ""}`}
                  onClick={() => setCashFlowFilter("advance_urgent")}
                >
                  Tạm ứng trước giao ({advanceRequiredCount})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${cashFlowFilter === "due_soon" ? "active" : ""}`}
                  onClick={() => setCashFlowFilter("due_soon")}
                >
                  Quá hạn & Đến hạn
                </button>
              </div>
            </div>

            <div className="queue-table-wrap">
              {filteredCashFlowItems.length === 0 ? (
                <div className="queue-empty-state">
                  <CheckCircle2 size={32} className="empty-icon-success" />
                  <p>Không có đợt thanh toán nào cần gấp trong danh mục này.</p>
                </div>
              ) : (
                <table className="queue-data-table">
                  <thead>
                    <tr>
                      <th>PO & NCC</th>
                      <th>Giai đoạn thanh toán</th>
                      <th style={{ textAlign: "right" }}>Số tiền thanh toán</th>
                      <th>Hạn thanh toán</th>
                      <th>Tình trạng cảnh báo</th>
                      <th style={{ textAlign: "right" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCashFlowItems.slice(0, 6).map((item, idx) => {
                      const poObj = pos.find((p) => p.id === item.poId);
                      return (
                        <tr key={idx}>
                          <td>
                            <div>
                              <button
                                type="button"
                                className="queue-code-link"
                                onClick={() => poObj && onSelectPO && onSelectPO(poObj)}
                              >
                                {item.poNumber}
                              </button>
                              <div className="sub-supplier-name">
                                {item.supplierName}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="payment-phase-text">
                              <b>{item.phase}</b>
                              {item.isAdvance && (
                                <span className="advance-pill">Tạm ứng bắt buộc</span>
                              )}
                            </div>
                          </td>
                          <td className="cell-money" style={{ textAlign: "right" }}>
                            <b>{fmt(item.amount)} ₫</b>
                          </td>
                          <td className="cell-date">{item.date}</td>
                          <td>
                            {item.urgency === "overdue" && (
                              <span className="urgency-tag urgency-red">
                                <AlertCircle size={12} /> {item.urgencyLabel}
                              </span>
                            )}
                            {item.urgency === "due_soon" && (
                              <span className="urgency-tag urgency-yellow">
                                <Clock size={12} /> {item.urgencyLabel}
                              </span>
                            )}
                            {item.urgency === "normal" && (
                              <span className="urgency-tag urgency-green">
                                <Check size={12} /> {item.urgencyLabel}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => {
                                if (poObj && onSelectPO) onSelectPO(poObj);
                              }}
                            >
                              Xem PO <ArrowRight size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (4 Cols): PROCUREMENT TO-DO LIST & QUICK PULSE */}
        <div className="dashboard-side-col">
          {/* KHU VỰC 3: BẢNG CÔNG VIỆC CÁ NHÂN (TO-DO LIST) */}
          <div className="dashboard-card todo-card">
            <div className="card-header todo-header">
              <div className="card-title-group">
                <span className="card-badge-icon badge-green">
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <h2>Công việc Cá nhân</h2>
                  <p>
                    Còn <b>{activeTodoCount}</b> việc cần làm trong ngày
                  </p>
                </div>
              </div>

              {/* Todo Filter Pills */}
              <div className="todo-filter-pills">
                <button
                  type="button"
                  className={`todo-pill ${todoFilter === "all" ? "active" : ""}`}
                  onClick={() => setTodoFilter("all")}
                >
                  Tất cả ({todos.length})
                </button>
                <button
                  type="button"
                  className={`todo-pill ${todoFilter === "active" ? "active" : ""}`}
                  onClick={() => setTodoFilter("active")}
                >
                  Chưa xong ({activeTodoCount})
                </button>
                <button
                  type="button"
                  className={`todo-pill ${todoFilter === "completed" ? "active" : ""}`}
                  onClick={() => setTodoFilter("completed")}
                >
                  Đã xong
                </button>
              </div>
            </div>

            {/* Quick Add Form */}
            <form className="todo-input-form" onSubmit={handleAddTodo}>
              <div className="todo-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  className="todo-input"
                  placeholder="Thêm việc... gõ @PO, #PR, @DNPD, @NCC để chọn nhanh"
                  value={todoInput}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm todo-add-btn"
                  disabled={!todoInput.trim()}
                >
                  <Plus size={15} /> Thêm
                </button>

                {/* Auto-Complete Mention Dropdown */}
                {mentionState.isOpen && (
                  <div
                    ref={mentionDropdownRef}
                    className="todo-mention-dropdown"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className="mention-header">
                      <div className="mention-tabs">
                        <button
                          type="button"
                          className={`mention-tab ${mentionCategoryTab === "all" ? "active" : ""}`}
                          onClick={() => setMentionCategoryTab("all")}
                        >
                          Tất cả
                        </button>
                        <button
                          type="button"
                          className={`mention-tab tab-po ${mentionCategoryTab === "po" ? "active" : ""}`}
                          onClick={() => setMentionCategoryTab("po")}
                        >
                          Đơn PO ({pos.length})
                        </button>
                        <button
                          type="button"
                          className={`mention-tab tab-pr ${mentionCategoryTab === "pr" ? "active" : ""}`}
                          onClick={() => setMentionCategoryTab("pr")}
                        >
                          Phiếu PR ({prs.length})
                        </button>
                        <button
                          type="button"
                          className={`mention-tab tab-approval ${mentionCategoryTab === "dnpd" ? "active" : ""}`}
                          onClick={() => setMentionCategoryTab("dnpd")}
                        >
                          ĐNPD ({approvalRequests.length})
                        </button>
                        <button
                          type="button"
                          className={`mention-tab tab-ncc ${mentionCategoryTab === "ncc" ? "active" : ""}`}
                          onClick={() => setMentionCategoryTab("ncc")}
                        >
                          NCC ({suppliers.length})
                        </button>
                      </div>
                      <button
                        type="button"
                        className="mention-close-btn"
                        onClick={() => setMentionState((prev) => ({ ...prev, isOpen: false }))}
                        title="Đóng (Esc)"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div className="mention-list">
                      {filteredMentionItems.length === 0 ? (
                        <div className="mention-empty">
                          Không tìm thấy chứng từ phù hợp với từ khóa &ldquo;{mentionState.query}&rdquo;
                        </div>
                      ) : (
                        filteredMentionItems.map((item, idx) => (
                          <div
                            key={item.id}
                            className={`mention-item ${idx === mentionState.selectedIndex ? "selected" : ""}`}
                            onClick={() => applyMentionItem(item)}
                            onMouseEnter={() =>
                              setMentionState((prev) => ({ ...prev, selectedIndex: idx }))
                            }
                          >
                            <span className={`mention-badge badge-${item.category}`}>
                              {item.badge}
                            </span>
                            <div className="mention-info">
                              <div className="mention-top-line">
                                <strong className="mention-title">{item.title}</strong>
                                {item.status && (
                                  <span className="mention-status">{item.status}</span>
                                )}
                              </div>
                              {(item.subtitle || item.meta) && (
                                <div className="mention-meta">
                                  {item.subtitle && <span className="mention-sub">{item.subtitle}</span>}
                                  {item.subtitle && item.meta && <span className="meta-sep">·</span>}
                                  {item.meta && <span className="mention-extra">{item.meta}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mention-footer">
                      <span>↑↓ điều hướng · Enter / Tab chọn · Esc đóng</span>
                      <span>{filteredMentionItems.length} kết quả</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Smart Tag Helper Pills */}
              <div className="todo-helpers">
                <span className="helpers-label">Gắn nhanh:</span>
                <button
                  type="button"
                  className="helper-chip chip-po"
                  onClick={() => handleInsertHelperTag("@PO-")}
                  title="Chọn đơn hàng PO"
                >
                  + @PO
                </button>
                <button
                  type="button"
                  className="helper-chip chip-pr"
                  onClick={() => handleInsertHelperTag("#PR-")}
                  title="Chọn yêu cầu mua sắm PR"
                >
                  + #PR
                </button>
                <button
                  type="button"
                  className="helper-chip chip-approval"
                  onClick={() => handleInsertHelperTag("@DNPD-")}
                  title="Chọn tờ trình đề nghị phê duyệt"
                >
                  + @DNPD
                </button>
                <button
                  type="button"
                  className="helper-chip chip-supplier"
                  onClick={() => handleInsertHelperTag("@NCC-")}
                  title="Chọn nhà cung cấp"
                >
                  + @NCC
                </button>

                <div className="todo-priority-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={todoPriority === "high"}
                      onChange={(e) =>
                        setTodoPriority(e.target.checked ? "high" : "normal")
                      }
                    />
                    <span className={todoPriority === "high" ? "high-label" : ""}>
                      Ưu tiên cao
                    </span>
                  </label>
                </div>
              </div>
            </form>

            {/* Todo List Items */}
            <div className="todo-list-wrap">
              {filteredTodos.length === 0 ? (
                <div className="todo-empty-state">
                  <Sparkles size={24} className="empty-sparkle" />
                  <p>Không có công việc nào trong mục này.</p>
                </div>
              ) : (
                <ul className="todo-items-list">
                  {filteredTodos.map((item) => (
                    <li
                      key={item.id}
                      className={`todo-item ${item.completed ? "completed" : ""} ${item.priority === "high" ? "priority-high" : ""}`}
                    >
                      <label className="todo-checkbox-label">
                        <input
                          type="checkbox"
                          className="todo-checkbox"
                          checked={item.completed}
                          onChange={() => handleToggleTodo(item.id)}
                        />
                        <span className="custom-check-box">
                          {item.completed && <Check size={12} strokeWidth={3} />}
                        </span>
                      </label>

                      <div className="todo-body">
                        <div className="todo-text">
                          {item.priority === "high" && !item.completed && (
                            <span className="priority-flag" title="Việc gấp">
                              GẤP
                            </span>
                          )}
                          {renderSmartTodoText(item.text)}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="todo-del-btn"
                        title="Xóa việc này"
                        onClick={() => handleDeleteTodo(item.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Todo Footer Actions */}
            {todos.some((t) => t.completed) && (
              <div className="todo-footer-bar">
                <span>
                  Đã hoàn thành {todos.filter((t) => t.completed).length}/{todos.length} việc
                </span>
                <button
                  type="button"
                  className="clear-completed-btn"
                  onClick={handleClearCompletedTodos}
                >
                  Dọn dẹp đã xong
                </button>
              </div>
            )}
          </div>

          {/* KHU VỰC PHỤ: TÓM TẮT NHỊP ĐỘ VẬN HÀNH (OPERATIONAL PULSE) */}
          <div className="dashboard-card pulse-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-badge-icon badge-purple">
                  <Layers size={16} />
                </span>
                <div>
                  <h2>Nhịp độ Vận hành</h2>
                  <p>Điểm nghẽn cần chú ý xử lý trong tuần</p>
                </div>
              </div>
            </div>

            <div className="pulse-list">
              <div className="pulse-item">
                <div className="pulse-icon-box box-amber">
                  <AlertTriangle size={16} />
                </div>
                <div className="pulse-info">
                  <b>{advanceRequiredCount} đợt tạm ứng chờ tiền</b>
                  <p>Cần giải ngân sớm để nhà cung cấp tiến hành giao hàng</p>
                </div>
              </div>

              <div className="pulse-item">
                <div className="pulse-icon-box box-blue">
                  <Truck size={16} />
                </div>
                <div className="pulse-info">
                  <b>{pendingDeliveryPOs.length} đơn PO chưa giao đủ</b>
                  <p>Theo dõi sát với kho và nhà xe để hoàn tất nhận hàng</p>
                </div>
              </div>

              <div className="pulse-item">
                <div className="pulse-icon-box box-green">
                  <CheckCircle2 size={16} />
                </div>
                <div className="pulse-info">
                  <b>{pendingApprovals.length} tờ trình ĐNPD chờ duyệt</b>
                  <p>Trình ký lãnh đạo để kịp phát hành PO đúng kế hoạch</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
