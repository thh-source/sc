import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { PR, PO, Supplier, PurchaseHistory, ApprovalRequest, PaymentRequestEntry } from "../types";
import { fmt } from "../utils";

// --- TYPES FOR DASHBOARD TO-DO WIDGET ---
export interface DashboardTodo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  priority?: "high" | "normal" | "low";
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
    const clean = tagText.replace(/^#PR-?/i, "").trim().toLowerCase();
    const matched = prs.find(
      (p) =>
        p.number.toLowerCase().includes(clean) ||
        String(p.id) === clean ||
        p.number.toLowerCase() === `pr-${clean}`,
    );
    if (matched && onSelectPR) {
      onSelectPR(matched);
    } else if (onNavigate) {
      onNavigate({ view: "prs" });
    }
  };

  const handleOpenPOTag = (tagText: string) => {
    const clean = tagText.replace(/^@PO-?/i, "").trim().toLowerCase();
    const matched = pos.find(
      (p) =>
        p.number.toLowerCase().includes(clean) ||
        String(p.id) === clean ||
        p.number.toLowerCase() === `po-${clean}`,
    );
    if (matched && onSelectPO) {
      onSelectPO(matched);
    } else if (onNavigate) {
      onNavigate({ view: "po-list" });
    }
  };

  const handleOpenApprovalTag = (tagText: string) => {
    const clean = tagText.replace(/^[@#]DNPD-?/i, "").trim().toLowerCase();
    const matched = approvalRequests.find(
      (a) =>
        a.requestNumber.toLowerCase().includes(clean) ||
        String(a.id) === clean,
    );
    if (matched && onSelectApproval) {
      onSelectApproval(matched.id);
    } else if (onNavigate) {
      onNavigate({ view: "approval" });
    }
  };

  // Render text with clickable smart tags (#PR-xxx, @PO-xxx, @DNPD-xxx)
  const renderSmartTodoText = (text: string) => {
    const parts = text.split(/([@#][A-Za-z0-9_-]+)/g);
    return parts.map((part, idx) => {
      if (/^#PR-?[A-Za-z0-9_-]+/i.test(part)) {
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
      if (/^@PO-?[A-Za-z0-9_-]+/i.test(part)) {
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
      if (/^[@#]DNPD-?[A-Za-z0-9_-]+/i.test(part)) {
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
                  type="text"
                  className="todo-input"
                  placeholder="Thêm việc... gõ @PO-xxx, #PR-xxx..."
                  value={todoInput}
                  onChange={(e) => setTodoInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm todo-add-btn"
                  disabled={!todoInput.trim()}
                >
                  <Plus size={15} /> Thêm
                </button>
              </div>

              {/* Smart Tag Helper Pills */}
              <div className="todo-helpers">
                <span className="helpers-label">Gắn nhanh:</span>
                <button
                  type="button"
                  className="helper-chip chip-po"
                  onClick={() => setTodoInput((prev) => prev + " @PO-")}
                >
                  + @PO
                </button>
                <button
                  type="button"
                  className="helper-chip chip-pr"
                  onClick={() => setTodoInput((prev) => prev + " #PR-")}
                >
                  + #PR
                </button>
                <button
                  type="button"
                  className="helper-chip chip-approval"
                  onClick={() => setTodoInput((prev) => prev + " @DNPD-")}
                >
                  + @DNPD
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
