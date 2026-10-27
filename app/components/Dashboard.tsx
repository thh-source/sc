import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus,
  Search,
  CheckCircle2,
  Circle,
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
  TrendingUp,
  Filter,
  Package,
  FileCheck,
  X,
  Pencil,
} from "lucide-react";
import { PR, PO, Supplier, PurchaseHistory, ApprovalRequest, PaymentRequestEntry, calcPOTotal } from "../types";
import { fmt } from "../utils";
import { fmtMoney } from "../payment-utils";
import {
  isPaymentCompleted,
  isPaymentPaidToday,
  findLinkedPOForPayment,
  isPRCompleted,
  isPOCompleted,
  isApprovalCompleted,
} from "../utils/paymentSync";

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
  onToggleCompletePayment,
  onUpdatePaymentRequest,
  onToggleCompletePR,
  onToggleCompletePO,
  onToggleCompleteApproval,
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
  onToggleCompletePayment?: (req: PaymentRequestEntry) => void;
  onUpdatePaymentRequest?: (req: PaymentRequestEntry) => void;
  onToggleCompletePR?: (pr: PR) => void;
  onToggleCompletePO?: (po: PO) => void;
  onToggleCompleteApproval?: (appr: ApprovalRequest) => void;
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
        !isPRCompleted(p) &&
        (p.status === "Chờ xử lý" ||
          p.status === "Đang lấy báo giá" ||
          p.status.toLowerCase().includes("báo giá") ||
          p.status.toLowerCase().includes("so sánh")),
    );
  }, [prs]);

  // Tab 2: Approval requests waiting for decision
  const pendingApprovals = useMemo(() => {
    return approvalRequests.filter(
      (a) =>
        !isApprovalCompleted(a) &&
        (a.status === "Chờ phê duyệt" ||
          a.status === "Nháp" ||
          !a.status),
    );
  }, [approvalRequests]);

  // Tab 3: POs undelivered / partially delivered
  const pendingDeliveryPOs = useMemo(() => {
    return pos.filter((po) => {
      if (isPOCompleted(po) || po.status === "Hoàn thành" || po.status === "Đã hủy") return false;
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

  // -------------------------------------------------------------
  // KPI TỔNG HỢP DÒNG TIỀN & TIẾN ĐỘ THANH TOÁN (Real-time Reactivity)
  // -------------------------------------------------------------
  const paidTodayAmount = useMemo(() => {
    return (paymentRequests || [])
      .filter((r) => isPaymentCompleted(r) && r.paidAt?.slice(0, 10) === todayStr)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [paymentRequests, todayStr]);

  const { totalPOValue, totalPOPaid, poPaymentProgressPct, remainingDebt } = useMemo(() => {
    let totalVal = 0;
    let totalPaid = 0;
    pos.forEach((po) => {
      const poVal = calcPOTotal(po);
      totalVal += poVal;
      const poPaidAmt = (po.payments || [])
        .filter((p) => p.status === "Đã thanh toán")
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      totalPaid += Math.min(poVal, poPaidAmt);
    });
    const pct = totalVal > 0 ? Math.round((totalPaid / totalVal) * 100) : 0;
    const remaining = Math.max(0, totalVal - totalPaid);
    return {
      totalPOValue: totalVal,
      totalPOPaid: totalPaid,
      poPaymentProgressPct: pct,
      remainingDebt: remaining,
    };
  }, [pos]);

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
  // PENDING PAYMENTS WORKLIST (Khoản thanh toán chưa hoàn thành & hoàn thành trong ngày)
  // -------------------------------------------------------------
  const pendingPayments = useMemo(() => {
    return (paymentRequests || [])
      .filter((r) => {
        const completed = isPaymentCompleted(r);
        if (!completed) return true;
        // Nếu đã hoàn thành, chỉ giữ lại trên Dashboard nếu ngày thanh toán là ngày hôm nay
        if (r.paidAt && r.paidAt.slice(0, 10) === todayStr) {
          return true;
        }
        return false;
      })
      .sort((a, b) => {
        const aDone = isPaymentCompleted(a);
        const bDone = isPaymentCompleted(b);
        // Khoản chưa thanh toán ở trên, khoản đã thanh toán hôm nay trượt xuống dưới
        if (aDone !== bDone) {
          return aDone ? 1 : -1;
        }
        const na = Number(a.legacy_stt || a.id) || 0;
        const nb = Number(b.legacy_stt || b.id) || 0;
        if (nb !== na) return nb - na;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
  }, [paymentRequests, todayStr]);

  const unpaidPaymentsCount = useMemo(() => {
    return (paymentRequests || []).filter((r) => !isPaymentCompleted(r)).length;
  }, [paymentRequests]);

  const paidTodayPaymentsCount = useMemo(() => {
    return (paymentRequests || []).filter(
      (r) => isPaymentCompleted(r) && r.paidAt?.slice(0, 10) === todayStr
    ).length;
  }, [paymentRequests, todayStr]);

  // Modal xác nhận chuyển trạng thái thanh toán an toàn
  const [paymentConfirmModal, setPaymentConfirmModal] = useState<{
    req: PaymentRequestEntry;
    action: "complete" | "revert";
  } | null>(null);

  // Inline edit state cho số HĐ và ngày HĐ
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [draftInvoiceNo, setDraftInvoiceNo] = useState<string>("");
  const [draftInvoiceDate, setDraftInvoiceDate] = useState<string>("");

  const handleStartEditInvoice = (r: PaymentRequestEntry) => {
    setEditingInvoiceId(r.id);
    setDraftInvoiceNo(r.invoice_no || "");
    setDraftInvoiceDate(r.invoice_date || "");
  };

  const handleSaveInvoice = (r: PaymentRequestEntry) => {
    setEditingInvoiceId(null);
    const trimmedNo = draftInvoiceNo.trim();
    const trimmedDate = draftInvoiceDate.trim();
    if (trimmedNo === (r.invoice_no || "") && trimmedDate === (r.invoice_date || "")) {
      return;
    }
    const updatedReq: PaymentRequestEntry = {
      ...r,
      invoice_no: trimmedNo || undefined,
      invoice_date: trimmedDate || undefined,
    };
    if (updatedReq.lines && updatedReq.lines.length > 0) {
      updatedReq.lines = updatedReq.lines.map((l, idx) =>
        idx === 0 ? { ...l, invoice_no: trimmedNo, invoice_date: trimmedDate || undefined } : l
      );
    }
    onUpdatePaymentRequest?.(updatedReq);
  };

  const handleCancelEditInvoice = () => {
    setEditingInvoiceId(null);
  };

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
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              {onToggleCompletePR && (
                                <button
                                  type="button"
                                  className="completion-toggle-btn"
                                  onClick={() => onToggleCompletePR(pr)}
                                  title="Đánh dấu hoàn thành PR"
                                >
                                  <Circle size={15} className="text-slate-400 hover:text-slate-600" />
                                </button>
                              )}
                              <button
                                type="button"
                                className="queue-code-link"
                                onClick={() => onSelectPR && onSelectPR(pr)}
                              >
                                {pr.number}
                              </button>
                            </div>
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
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                {onToggleCompleteApproval && (
                                  <button
                                    type="button"
                                    className="completion-toggle-btn"
                                    onClick={() => onToggleCompleteApproval(appr)}
                                    title="Duyệt & đánh dấu hoàn thành ĐNPD"
                                  >
                                    <Circle size={15} className="text-slate-400 hover:text-slate-600" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="queue-code-link"
                                  onClick={() =>
                                    onSelectApproval && onSelectApproval(appr.id)
                                  }
                                >
                                  {appr.requestNumber || `ĐNPD-#${appr.id}`}
                                </button>
                              </div>
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
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                {onToggleCompletePO && (
                                  <button
                                    type="button"
                                    className="completion-toggle-btn"
                                    onClick={() => onToggleCompletePO(po)}
                                    title="Đánh dấu hoàn thành PO"
                                  >
                                    <Circle size={15} className="text-slate-400 hover:text-slate-600" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="queue-code-link"
                                  onClick={() => onSelectPO && onSelectPO(po)}
                                >
                                  {po.number}
                                </button>
                              </div>
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

            {/* KPI Tóm tắt Dòng tiền & Tiến độ thanh toán PO */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              {/* 1. Đã chi trong ngày */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  backgroundColor: "#ffffff",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "8px",
                    backgroundColor: "#ecfdf5",
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <DollarSign size={20} />
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                    Đã chi trong ngày
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                    {fmt(paidTodayAmount)} ₫
                  </div>
                  <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}>
                    {paidTodayPaymentsCount > 0 ? `${paidTodayPaymentsCount} khoản đã giải ngân` : "Chưa có khoản chi nào"}
                  </div>
                </div>
              </div>

              {/* 2. Tiến độ thanh toán theo PO */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  backgroundColor: "#ffffff",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "8px",
                    backgroundColor: "#eff6ff",
                    color: "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <TrendingUp size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                      Tiến độ thanh toán PO
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 800, color: "#2563eb" }}>
                      {poPaymentProgressPct}%
                    </span>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>
                    {fmt(totalPOPaid)} ₫
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    trên tổng {fmt(totalPOValue)} ₫
                  </div>
                </div>
              </div>

              {/* 3. Công nợ còn lại */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  backgroundColor: "#ffffff",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "8px",
                    backgroundColor: "#fff7ed",
                    color: "#ea580c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <CreditCard size={20} />
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                    Công nợ còn lại
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: remainingDebt > 0 ? "#ea580c" : "#166534" }}>
                    {fmt(remainingDebt)} ₫
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {cashFlowItems.length} đợt chờ thanh toán
                  </div>
                </div>
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

          {/* KHU VỰC: KHOẢN THANH TOÁN CHƯA HOÀN THÀNH */}
          <div className="dashboard-card pending-payments-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-badge-icon badge-emerald">
                  <CreditCard size={16} />
                </span>
                <div>
                  <h2>Thanh toán cần xử lý &amp; trong ngày</h2>
                  <p>Hàng đợi các khoản chi phí cần giải ngân để NCC giao hàng hoặc thanh toán công nợ</p>
                </div>
              </div>
              <span className="queue-pill-count">
                {unpaidPaymentsCount} khoản chờ đi tiền
                {paidTodayPaymentsCount > 0 && ` • ${paidTodayPaymentsCount} đã xong hôm nay`}
              </span>
            </div>

            <div className="queue-table-wrap">
              {pendingPayments.length === 0 ? (
                <div className="queue-empty-state">
                  <CheckCircle2 size={32} className="empty-icon-success" />
                  <p>Tuyệt vời! Không còn khoản thanh toán nào bị tồn đọng.</p>
                </div>
              ) : (
                <table className="queue-data-table pending-payments-table">
                  <thead>
                    <tr>
                      <th style={{ width: "135px" }}>PO liên kết</th>
                      <th style={{ width: "210px" }}>Đơn vị thụ hưởng</th>
                      <th>Nội dung thanh toán</th>
                      <th style={{ width: "155px", textAlign: "right" }}>Số tiền</th>
                      <th style={{ width: "210px" }}>Số HĐ (Ngày HĐ)</th>
                      <th style={{ width: "155px", textAlign: "center" }}>Trạng thái / Xác nhận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayments.map((r) => {
                      const linkedInfo = findLinkedPOForPayment(r, pos);
                      const linkedPO = linkedInfo?.po;
                      const isDone = isPaymentCompleted(r);
                      const isEditing = editingInvoiceId === r.id;
                      const invoiceText = r.invoice_no?.trim() || "Chưa có HĐ";
                      const dateText = r.invoice_date?.trim() ? ` (${r.invoice_date.trim()})` : "";
                      const invoiceCombined = `${invoiceText}${dateText}`;

                      return (
                        <tr
                          key={r.id}
                          className={isDone ? "row-paid-today" : "row-unpaid"}
                          style={{
                            opacity: isDone ? 0.78 : 1,
                            backgroundColor: isDone ? "#f0fdf4" : undefined,
                            transition: "all 0.2s ease",
                          }}
                        >
                          {/* 1. PO liên kết */}
                          <td>
                            {linkedPO ? (
                              <button
                                type="button"
                                className="queue-code-link"
                                onClick={() => onSelectPO && onSelectPO(linkedPO)}
                                title={`Mở xem đơn ${linkedPO.number}`}
                              >
                                <Package size={12} /> {linkedPO.number}
                              </button>
                            ) : (
                              <span className="text-muted" style={{ fontSize: "12px", color: "var(--slate-400)" }}>
                                {r.group_code || "Trực tiếp"}
                              </span>
                            )}
                          </td>

                          {/* 2. Đơn vị thụ hưởng */}
                          <td>
                            <span className="cell-supplier-name font-medium">
                              {r.payee_name || "Chưa có NCC"}
                            </span>
                          </td>

                          {/* 3. Nội dung thanh toán */}
                          <td className="cell-purpose" title={r.description || r.item_name}>
                            {r.description || r.item_name || "Thanh toán"}
                          </td>

                          {/* 4. Số tiền (Gộp chung đơn vị tiền) */}
                          <td className="cell-money font-semibold" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {fmtMoney(r.amount)} {r.currency || "VND"}
                          </td>

                          {/* 5. Số HĐ (Ngày HĐ) - Inline Edit */}
                          <td style={{ whiteSpace: "nowrap" }}>
                            {isEditing ? (
                              <div
                                className="inline-invoice-editor-wrap"
                                onBlur={(e) => {
                                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                    handleSaveInvoice(r);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveInvoice(r);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    handleCancelEditInvoice();
                                  }
                                }}
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Số HĐ"
                                  value={draftInvoiceNo}
                                  onChange={(e) => setDraftInvoiceNo(e.target.value)}
                                  className="inline-invoice-input inline-invoice-input-no"
                                  title="Nhập số hóa đơn (Enter để lưu)"
                                />
                                <input
                                  type="date"
                                  value={draftInvoiceDate}
                                  onChange={(e) => setDraftInvoiceDate(e.target.value)}
                                  className="inline-invoice-input inline-invoice-input-date"
                                  title="Chọn ngày hóa đơn (Enter để lưu)"
                                />
                                <button
                                  type="button"
                                  className="inline-invoice-save-btn"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSaveInvoice(r);
                                  }}
                                  title="Lưu số hóa đơn"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="inline-invoice-cancel-btn"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleCancelEditInvoice();
                                  }}
                                  title="Hủy"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <div
                                className={`compact-invoice-trigger ${r.invoice_no?.trim() ? "has-invoice" : "no-invoice"}`}
                                onClick={() => handleStartEditInvoice(r)}
                                title="Bấm để nhập/sửa nhanh số và ngày hóa đơn"
                              >
                                <span>{invoiceCombined}</span>
                                <Pencil size={11} className="invoice-edit-icon" />
                              </div>
                            )}
                          </td>

                          {/* 6. Trạng thái / Nút xác nhận an toàn */}
                          <td style={{ textAlign: "center" }}>
                            {isDone ? (
                              <button
                                type="button"
                                className="payment-status-badge status-paid"
                                onClick={() => setPaymentConfirmModal({ req: r, action: "revert" })}
                                title="Đã thanh toán hôm nay. Bấm để hoàn tác nếu chuyển nhầm"
                              >
                                <CheckCircle2 size={13} /> Đã thanh toán
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="payment-status-badge status-unpaid"
                                onClick={() => setPaymentConfirmModal({ req: r, action: "complete" })}
                                title="Chưa thanh toán. Bấm để mở hộp thoại xác nhận thanh toán"
                              >
                                <Clock size={13} /> Chưa thanh toán
                              </button>
                            )}
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
      {/* MODAL XÁC NHẬN CHUYỂN TRẠNG THÁI THANH TOÁN */}
      {paymentConfirmModal && (
        <div
          className="modal-backdrop payment-confirm-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPaymentConfirmModal(null);
            }
          }}
        >
          <div
            className="payment-confirm-dialog"
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "14px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              maxWidth: "460px",
              width: "100%",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
              animation: "dialogFadeIn 0.15s ease-out",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "18px 20px 14px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  backgroundColor:
                    paymentConfirmModal.action === "complete" ? "#d1fae5" : "#fef3c7",
                  color:
                    paymentConfirmModal.action === "complete" ? "#047857" : "#b45309",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {paymentConfirmModal.action === "complete" ? (
                  <CheckCircle2 size={22} />
                ) : (
                  <AlertCircle size={22} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.3,
                  }}
                >
                  {paymentConfirmModal.action === "complete"
                    ? "Xác nhận chuyển sang Đã thanh toán?"
                    : "Xác nhận hoàn tác về Chưa thanh toán?"}
                </h3>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "#64748b",
                    lineHeight: 1.4,
                  }}
                >
                  {paymentConfirmModal.action === "complete"
                    ? "Hệ thống sẽ cập nhật khoản này thành Đã thanh toán và đồng bộ ngay tiến độ vào PO liên kết."
                    : "Khoản thanh toán sẽ được hoàn tác về Chưa thanh toán và cập nhật lại tiến độ PO."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentConfirmModal(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Info Summary Box */}
            <div style={{ padding: "16px 20px" }}>
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  fontSize: "13px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b" }}>Đơn vị thụ hưởng:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", textAlign: "right", maxWidth: "230px" }}>
                    {paymentConfirmModal.req.payee_name || "Chưa có NCC"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b" }}>Số tiền:</span>
                  <span style={{ fontWeight: 700, color: "#047857", fontSize: "14px" }}>
                    {fmtMoney(paymentConfirmModal.req.amount)} {paymentConfirmModal.req.currency || "VND"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ color: "#64748b", flexShrink: 0 }}>Nội dung:</span>
                  <span style={{ color: "#334155", textAlign: "right", maxWidth: "250px", wordBreak: "break-word" }}>
                    {paymentConfirmModal.req.description || paymentConfirmModal.req.item_name || "Thanh toán theo đơn hàng"}
                  </span>
                </div>
                {paymentConfirmModal.req.group_code && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#64748b" }}>PO liên kết:</span>
                    <span style={{ fontWeight: 600, color: "#2563eb" }}>
                      {paymentConfirmModal.req.group_code}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                padding: "12px 20px 16px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                borderTop: "1px solid #f1f5f9",
                backgroundColor: "#fafbfc",
              }}
            >
              <button
                type="button"
                onClick={() => setPaymentConfirmModal(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  if (paymentConfirmModal) {
                    onToggleCompletePayment?.(paymentConfirmModal.req);
                    setPaymentConfirmModal(null);
                  }
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    paymentConfirmModal.action === "complete" ? "#10b981" : "#f59e0b",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                {paymentConfirmModal.action === "complete" ? (
                  <>
                    <CheckCircle2 size={14} /> Đồng ý
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} /> Đồng ý hoàn tác
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
