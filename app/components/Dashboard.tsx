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
  Sparkles,
  DollarSign,
  TrendingUp,
  Filter,
  Package,
  FileCheck,
  X,
  Pencil,
} from "lucide-react";
import { PR, PO, Supplier, PurchaseHistory, ApprovalRequest, PaymentRequestEntry, PaymentHandoverItem, isItemHidden } from "../types";
import { fmt } from "../utils";
import { fmtMoney } from "../payment-utils";
import {
  isPaymentCompleted,
  findLinkedPOForPayment,
} from "../utils/paymentSync";
import {
  buildWorkflowRadar,
  PipelineStage,
  RadarFilter,
  WorkflowAlertTag,
} from "../utils/workflowRadar";
import { enqueueOfflineAction, checkIsOnline } from "../utils/offlineSync";
import { useIsMobile } from "../useIsMobile";
import { MobileDashboard } from "./MobileDashboard";
import { WorkflowPipelineCard } from "./WorkflowPipelineCard";
import { resolveApiUrl, apiFetch } from "../utils/apiConfig";

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
  paymentHandovers = [],
  suppliers = [],
  purchaseHistory = [],
  onNavigate,
  onOpenSpotlight,
  onCreatePR,
  onCreateApproval,
  onCreatePO,
  onCreatePayment,
  onCreateHandover,
  onSelectPR,
  onSelectPO,
  onSelectApproval,
  onSelectPayment,
  onSelectHandover,
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
  paymentHandovers?: PaymentHandoverItem[];
  suppliers?: Supplier[];
  purchaseHistory?: PurchaseHistory[];
  onNavigate?: (route: any) => void;
  onOpenSpotlight?: () => void;
  onCreatePR?: () => void;
  onCreateApproval?: () => void;
  onCreatePO?: () => void;
  onCreatePayment?: () => void;
  onCreateHandover?: () => void;
  onSelectPR?: (pr: PR) => void;
  onSelectPO?: (po: PO) => void;
  onSelectApproval?: (id: number) => void;
  onSelectPayment?: (id: number) => void;
  onSelectHandover?: (handover: PaymentHandoverItem) => void;
  onToggleCompletePayment?: (req: PaymentRequestEntry) => void;
  onUpdatePaymentRequest?: (req: PaymentRequestEntry) => void;
  onToggleCompletePR?: (pr: PR) => void;
  onToggleCompletePO?: (po: PO) => void;
  onToggleCompleteApproval?: (appr: ApprovalRequest) => void;
}) {
  const handleCreatePR = onCreatePR || (() => onNavigate?.({ view: "create" }));
  const handleCreateApproval = onCreateApproval || (() => onNavigate?.({ view: "approval" }));
  const handleCreatePO = onCreatePO || (() => onNavigate?.({ view: "po-list" }));
  const handleCreatePayment = onCreatePayment || (() => onNavigate?.({ view: "payment" }));
  const handleCreateHandover = onCreateHandover || (() => onNavigate?.({ view: "handover" }));
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // -------------------------------------------------------------
  // 1. WORKFLOW RADAR & 5-STAGE PIPELINE (Chống sót việc xuyên luồng)
  // -------------------------------------------------------------
  const [radarFilter, setRadarFilter] = useState<RadarFilter>("all");
  const [activeStage, setActiveStage] = useState<PipelineStage>("po");

  const radar = useMemo(
    () =>
      buildWorkflowRadar({
        prs,
        pos,
        approvalRequests,
        paymentRequests,
        paymentHandovers,
        suppliers,
        todayStr,
      }),
    [prs, pos, approvalRequests, paymentRequests, paymentHandovers, suppliers, todayStr],
  );

  const matchesRadar = (alerts: WorkflowAlertTag[], isDoneToday = false) => {
    if (radarFilter === "all") return true;
    if (isDoneToday) return false;
    return alerts.some((a) => a.category === radarFilter);
  };

  const stagePRs = useMemo(() => radar.prs.filter((x) => matchesRadar(x.alerts)), [radar.prs, radarFilter]);
  const stageApprovals = useMemo(() => radar.approvals.filter((x) => matchesRadar(x.alerts)), [radar.approvals, radarFilter]);
  const stagePOs = useMemo(() => radar.pos.filter((x) => matchesRadar(x.alerts)), [radar.pos, radarFilter]);
  const stageHandovers = useMemo(() => radar.handovers.filter((x) => matchesRadar(x.alerts)), [radar.handovers, radarFilter]);
  const stagePayments = useMemo(
    () => radar.payments.filter((x) => matchesRadar(x.alerts, x.isDoneToday)),
    [radar.payments, radarFilter],
  );

  const handleSelectRadarFilter = (next: RadarFilter) => {
    setRadarFilter(next);
    if (next === "all") return;
    const order: Array<{ stage: PipelineStage; count: number }> = [
      { stage: "po", count: radar.pos.filter((x) => x.alerts.some((a) => a.category === next)).length },
      { stage: "payment", count: radar.payments.filter((x) => !x.isDoneToday && x.alerts.some((a) => a.category === next)).length },
      { stage: "handover", count: radar.handovers.filter((x) => x.alerts.some((a) => a.category === next)).length },
      { stage: "approval", count: radar.approvals.filter((x) => x.alerts.some((a) => a.category === next)).length },
      { stage: "pr", count: radar.prs.filter((x) => x.alerts.some((a) => a.category === next)).length },
    ];
    const currentMatch = order.find((o) => o.stage === activeStage && o.count > 0);
    if (!currentMatch) {
      const firstMatch = order.find((o) => o.count > 0);
      if (firstMatch) setActiveStage(firstMatch.stage);
    }
  };

  // -------------------------------------------------------------
  // PENDING PAYMENTS WORKLIST (Khoản thanh toán chưa hoàn thành & hoàn thành trong ngày)
  // -------------------------------------------------------------
  const pendingPayments = useMemo(() => {
    return (paymentRequests || [])
      .filter((r) => {
        if (isItemHidden(r)) return false;
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

  const todayPendingAmount = useMemo(() => {
    return (pendingPayments || [])
      .filter((r) => !isPaymentCompleted(r))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [pendingPayments]);

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
  // 3. TO-DO LIST & NOTES (Khu vực 3: Bảng công việc cá nhân đồng bộ D1)
  // -------------------------------------------------------------
  const [todos, setTodos] = useState<DashboardTodo[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TODOS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Tự động tải danh sách công việc mới nhất từ Cloudflare D1
  useEffect(() => {
    let active = true;
    apiFetch("/api/todos")
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json() as Promise<{ todos: DashboardTodo[] }>;
      })
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data.todos)) {
          setTodos(data.todos);
          try {
            localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(data.todos));
          } catch {}
        }
      })
      .catch((err) => {
        console.warn("Không thể tải danh sách công việc từ Cloudflare D1:", err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Lưu cache localStorage dự phòng khi ngoại tuyến
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

  const createAndSyncTodo = async (
    text: string,
    priority: "high" | "normal" | "low" = "normal",
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newTodo: DashboardTodo = {
      id: "todo-" + Date.now(),
      text: trimmed,
      completed: false,
      createdAt: new Date().toISOString(),
      priority,
    };

    setTodos((prev) => [newTodo, ...prev]);

    try {
      const isOnline = await checkIsOnline();
      if (!isOnline) {
        await enqueueOfflineAction({
          endpoint: "/api/todos",
          method: "POST",
          data: newTodo,
          description: `Thêm công việc: ${trimmed}`,
        });
      } else {
        await apiFetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newTodo),
        });
      }
    } catch {
      await enqueueOfflineAction({
        endpoint: "/api/todos",
        method: "POST",
        data: newTodo,
        description: `Thêm công việc: ${trimmed}`,
      });
    }
  };

  const handleAddTodo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = todoInput.trim();
    if (!trimmed) return;
    const priorityToUse = todoPriority;
    setTodoInput("");
    setTodoPriority("normal");
    setMentionState((prev) => ({ ...prev, isOpen: false }));
    await createAndSyncTodo(trimmed, priorityToUse);
  };

  const handleToggleTodo = async (id: string) => {
    const target = todos.find((t) => t.id === id);
    if (!target) return;
    const willBeCompleted = !target.completed;

    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: willBeCompleted } : t)),
    );

    // Đồng bộ trạng thái hoàn thành lên Cloudflare D1
    try {
      const isOnline = await checkIsOnline();
      if (!isOnline) {
        await enqueueOfflineAction({
          endpoint: "/api/todos",
          method: "PUT",
          data: { id, completed: willBeCompleted },
          description: `Cập nhật trạng thái công việc #${id}`,
        });
      } else {
        await apiFetch("/api/todos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, completed: willBeCompleted }),
        });
      }
    } catch {
      await enqueueOfflineAction({
        endpoint: "/api/todos",
        method: "PUT",
        data: { id, completed: willBeCompleted },
        description: `Cập nhật trạng thái công việc #${id}`,
      });
    }
  };

  const handleDeleteTodo = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));

    // Đồng bộ thao tác xóa lên Cloudflare D1
    try {
      const isOnline = await checkIsOnline();
      if (!isOnline) {
        await enqueueOfflineAction({
          endpoint: `/api/todos?id=${encodeURIComponent(id)}`,
          method: "DELETE",
          data: { id },
          description: `Xóa công việc #${id}`,
        });
      } else {
        await apiFetch(`/api/todos?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      }
    } catch {
      await enqueueOfflineAction({
        endpoint: `/api/todos?id=${encodeURIComponent(id)}`,
        method: "DELETE",
        data: { id },
        description: `Xóa công việc #${id}`,
      });
    }
  };

  const handleClearCompletedTodos = async () => {
    setTodos((prev) => prev.filter((t) => !t.completed));

    // Đồng bộ dọn dẹp các việc đã xong lên Cloudflare D1
    try {
      const isOnline = await checkIsOnline();
      if (!isOnline) {
        await enqueueOfflineAction({
          endpoint: "/api/todos?clearCompleted=true",
          method: "DELETE",
          data: { clearCompleted: true },
          description: "Dọn dẹp các việc đã hoàn thành",
        });
      } else {
        await apiFetch("/api/todos?clearCompleted=true", {
          method: "DELETE",
        });
      }
    } catch {
      await enqueueOfflineAction({
        endpoint: "/api/todos?clearCompleted=true",
        method: "DELETE",
        data: { clearCompleted: true },
        description: "Dọn dẹp các việc đã hoàn thành",
      });
    }
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

  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileDashboard
        prs={prs}
        pos={pos}
        approvalRequests={approvalRequests}
        paymentRequests={paymentRequests}
        paymentHandovers={paymentHandovers}
        suppliers={suppliers}
        todos={todos}
        onAddTodo={createAndSyncTodo}
        onToggleTodo={handleToggleTodo}
        onDeleteTodo={handleDeleteTodo}
        onClearCompletedTodos={handleClearCompletedTodos}
        onNavigate={onNavigate}
        onCreatePR={onCreatePR}
        onCreateApproval={onCreateApproval}
        onCreatePO={onCreatePO}
        onSelectPR={onSelectPR}
        onSelectPO={onSelectPO}
        onSelectPayment={onSelectPayment}
        onSelectHandover={onSelectHandover}
        onSelectApproval={onSelectApproval ? (req) => onSelectApproval(req.id) : undefined}
        onToggleCompletePayment={onToggleCompletePayment}
      />
    );
  }

  return (
    <section className="content dashboard-workspace">
      {/* -------------------------------------------------------------
          DASHBOARD TOPBAR: WORKFLOW QUICK ACTIONS STRIP
          ------------------------------------------------------------- */}
      <div className="dashboard-topbar">
        <div className="dashboard-topbar-title">
          <div className="topbar-title-row">
            <span className="live-status-dot"></span>
            <h1>Trung tâm Điều hành Mua hàng</h1>
          </div>
          <p className="dashboard-topbar-sub">Ưu tiên xử lý việc cần làm và truy cập nhanh các phân hệ nghiệp vụ mua sắm</p>
        </div>

        {/* 5 Nút chức năng nghiệp vụ đưa ra ngoài màn hình chính ấn để vào ngay */}
        <div className="dashboard-workflow-actions">
          <button
            type="button"
            className="workflow-action-btn action-pr"
            onClick={handleCreatePR}
            title="Tạo Yêu cầu mua sắm PR mới"
          >
            <Plus size={15} />
            <span>Tạo PR</span>
          </button>
          <button
            type="button"
            className="workflow-action-btn action-approval"
            onClick={handleCreateApproval}
            title="Lập Đề nghị phê duyệt ĐNPD"
          >
            <FileCheck size={15} />
            <span>Tạo ĐNPD</span>
          </button>
          <button
            type="button"
            className="workflow-action-btn action-po"
            onClick={handleCreatePO}
            title="Lập Đơn mua hàng PO"
          >
            <Package size={15} />
            <span>Tạo PO</span>
          </button>
          <button
            type="button"
            className="workflow-action-btn action-payment"
            onClick={handleCreatePayment}
            title="Tạo Đề nghị thanh toán ĐNTT"
          >
            <CreditCard size={15} />
            <span>Tạo ĐNTT</span>
          </button>
          <button
            type="button"
            className="workflow-action-btn action-handover"
            onClick={handleCreateHandover}
            title="Tạo Đợt bàn giao nội bộ"
          >
            <Truck size={15} />
            <span>Tạo Bàn giao</span>
          </button>
          <button
            type="button"
            className="workflow-action-btn action-search"
            onClick={onOpenSpotlight}
            title="Tìm kiếm nhanh chứng từ (Ctrl + K)"
          >
            <Search size={14} />
            <span>Tra cứu</span>
            <kbd className="action-kbd">Ctrl K</kbd>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          THANH RADAR NHẮC VIỆC (CHỐNG SÓT VIỆC XUYÊN LUỒNG)
          ------------------------------------------------------------- */}
      <div className="radar-attention-strip">
        <button
          type="button"
          className={`radar-pill pill-all ${radarFilter === "all" ? "active" : ""}`}
          onClick={() => handleSelectRadarFilter("all")}
        >
          <span className="radar-dot dot-slate" />
          <span>Tất cả đang theo dõi</span>
          <strong>{radar.counts.totalActionable}</strong>
        </button>
        <button
          type="button"
          className={`radar-pill pill-overdue ${radarFilter === "overdue" ? "active" : ""}`}
          onClick={() => handleSelectRadarFilter("overdue")}
        >
          <span className="radar-dot dot-red" />
          <span>Quá hạn gấp / Hàng lỗi</span>
          <strong>{radar.counts.overdue}</strong>
        </button>
        <button
          type="button"
          className={`radar-pill pill-due ${radarFilter === "due_soon" ? "active" : ""}`}
          onClick={() => handleSelectRadarFilter("due_soon")}
        >
          <span className="radar-dot dot-amber" />
          <span>Sắp đến hạn (≤ 3 ngày)</span>
          <strong>{radar.counts.dueSoon}</strong>
        </button>
        <button
          type="button"
          className={`radar-pill pill-missing ${radarFilter === "missing_docs" ? "active" : ""}`}
          onClick={() => handleSelectRadarFilter("missing_docs")}
        >
          <span className="radar-dot dot-orange" />
          <span>Thiếu chứng từ / Treo bước</span>
          <strong>{radar.counts.missingDocs}</strong>
        </button>
      </div>

      {/* -------------------------------------------------------------
          BỐ CỤC 2 CỘT: TRÁI (PIPELINE 5 CHẶNG) - PHẢI (TO-DO LIST)
          ------------------------------------------------------------- */}
      <div className="dashboard-action-grid">
        <div className="dashboard-action-left">
          <WorkflowPipelineCard
            radar={radar}
            radarFilter={radarFilter}
            activeStage={activeStage}
            onChangeStage={setActiveStage}
            onSelectPR={onSelectPR}
            onSelectApproval={onSelectApproval}
            onSelectPO={onSelectPO}
            onSelectHandover={onSelectHandover}
            onSelectPayment={onSelectPayment}
            onCreateHandover={handleCreateHandover}
            onCreatePayment={handleCreatePayment}
            onQuickRemindTodo={(text, priority) => createAndSyncTodo(text, priority || "normal")}
            editingInvoiceId={editingInvoiceId}
            draftInvoiceNo={draftInvoiceNo}
            draftInvoiceDate={draftInvoiceDate}
            onDraftInvoiceNoChange={setDraftInvoiceNo}
            onDraftInvoiceDateChange={setDraftInvoiceDate}
            onStartEditInvoice={handleStartEditInvoice}
            onSaveInvoice={handleSaveInvoice}
            onCancelEditInvoice={handleCancelEditInvoice}
            onRequestPaymentConfirm={(req, action) => setPaymentConfirmModal({ req, action })}
          />
        </div>

        <div className="dashboard-action-right">
      <div className="dashboard-card todo-hero-card">
        <div className="card-header todo-hero-header">
          <div className="card-title-group">
            <span className="card-badge-icon badge-green">
              <CheckCircle2 size={18} />
            </span>
            <div>
              <div className="todo-title-row">
                <h2>Công việc Cần làm trong ngày (To-Do List)</h2>
                {activeTodoCount > 0 ? (
                  <span className="todo-counter-pill active">
                    Còn <b>{activeTodoCount}</b> việc cần làm
                  </span>
                ) : (
                  <span className="todo-counter-pill done">
                    ✓ Đã xong hết việc hôm nay!
                  </span>
                )}
                {todos.some((t) => t.priority === "high" && !t.completed) && (
                  <span className="todo-counter-pill urgent">
                    🔥 Có việc gấp
                  </span>
                )}
              </div>
              <p>Gắn nhanh chứng từ bằng cách gõ <code>@PO</code>, <code>#PR</code>, <code>@DNPD</code>, <code>@NCC</code> để tạo liên kết trực tiếp</p>
            </div>
          </div>

          {/* Filter Pills & Clear */}
          <div className="todo-header-actions">
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
                Đã xong ({Math.max(0, todos.length - activeTodoCount)})
              </button>
            </div>
            {todos.some((t) => t.completed) && (
              <button
                type="button"
                className="clear-completed-btn"
                onClick={handleClearCompletedTodos}
                title="Xóa các việc đã hoàn thành"
              >
                Dọn dẹp đã xong
              </button>
            )}
          </div>
        </div>

        {/* Quick Add Form */}
        <form className="todo-hero-input-form" onSubmit={handleAddTodo}>
          <div className="todo-hero-input-row">
            <input
              ref={inputRef}
              type="text"
              className="todo-hero-input"
              placeholder="Thêm việc cần làm hôm nay... gõ @PO, #PR, @DNPD, @NCC để chọn nhanh"
              value={todoInput}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
            />
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
                  Ưu tiên gấp
                </span>
              </label>
            </div>
            <button
              type="submit"
              className="btn btn-primary todo-hero-add-btn"
              disabled={!todoInput.trim()}
            >
              <Plus size={15} /> Thêm việc
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
          <div className="todo-hero-helpers">
            <span className="helpers-label">Gắn chứng từ nhanh:</span>
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
          </div>
        </form>

        {/* Todo List Items */}
        <div className="todo-hero-list-wrap">
          {filteredTodos.length === 0 ? (
            <div className="todo-empty-state">
              <Sparkles size={26} className="empty-sparkle" />
              <p>Không có công việc nào trong mục này.</p>
            </div>
          ) : (
            <ul className="todo-hero-items-list">
              {filteredTodos.map((item) => (
                <li
                  key={item.id}
                  className={`todo-hero-item ${item.completed ? "completed" : ""} ${item.priority === "high" ? "priority-high" : ""}`}
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
                        <span className="priority-flag" title="Việc gấp cần giải quyết ngay">
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
