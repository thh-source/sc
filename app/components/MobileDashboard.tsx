"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Truck,
  CreditCard,
  Trash2,
  Check,
  DollarSign,
  TrendingUp,
  Package,
  FileText,
  X,
  Bell,
} from "lucide-react";
import { PR, PO, Supplier, ApprovalRequest, PaymentRequestEntry, PaymentHandoverItem } from "../types";
import { fmtMoney } from "../payment-utils";
import { fmt } from "../utils";
import { DashboardTodo } from "./Dashboard";
import { checkIsOnline, getOfflineQueue, subscribeToNetworkStatus } from "../utils/offlineSync";
import { buildWorkflowRadar } from "../utils/workflowRadar";

export interface MobileDashboardProps {
  prs?: PR[];
  pos?: PO[];
  approvalRequests?: ApprovalRequest[];
  paymentRequests?: PaymentRequestEntry[];
  paymentHandovers?: PaymentHandoverItem[];
  suppliers?: Supplier[];
  todos?: DashboardTodo[];
  onAddTodo?: (text: string, priority?: "high" | "normal" | "low") => void;
  onToggleTodo?: (id: string) => void;
  onDeleteTodo?: (id: string) => void;
  onClearCompletedTodos?: () => void;
  todaySpent?: number;
  paidTodayAmount?: number;
  todayPending?: number;
  totalPOAmount?: number;
  totalPOValue?: number;
  disbursedPOAmount?: number;
  totalPOPaid?: number;
  poPaymentPercent?: number;
  poPaymentProgressPct?: number;
  remainingDebt?: number;
  pendingPayments?: PaymentRequestEntry[];
  onNavigate?: (route: any) => void;
  onCreatePR?: () => void;
  onCreatePO?: () => void;
  onCreateApproval?: () => void;
  onSelectPR?: (pr: PR) => void;
  onSelectPO?: (po: PO) => void;
  onSelectPayment?: (id: number) => void;
  onSelectHandover?: (handover: PaymentHandoverItem) => void;
  onSelectApproval?: (req: ApprovalRequest) => void;
  onToggleCompletePayment?: (req: PaymentRequestEntry) => void;
  onConfirmPayment?: (req: PaymentRequestEntry) => void;
  onRevertPayment?: (req: PaymentRequestEntry) => void;
  onStartEditInvoice?: (req: PaymentRequestEntry) => void;
}

export function MobileDashboard(props: MobileDashboardProps) {
  const {
    prs = [],
    pos = [],
    approvalRequests = [],
    paymentRequests = [],
    paymentHandovers = [],
    suppliers = [],
    todos = [],
    onAddTodo,
    onToggleTodo,
    onDeleteTodo,
    onClearCompletedTodos,
    onNavigate,
    onCreatePR,
    onCreatePO,
    onCreateApproval,
    onSelectPR,
    onSelectPO,
    onSelectPayment,
    onSelectHandover,
    onSelectApproval,
    onToggleCompletePayment,
    onConfirmPayment,
    onRevertPayment,
    onStartEditInvoice,
  } = props;

  const radar = useMemo(
    () =>
      buildWorkflowRadar({
        prs,
        pos,
        approvalRequests,
        paymentRequests,
        paymentHandovers,
        suppliers,
      }),
    [prs, pos, approvalRequests, paymentRequests, paymentHandovers, suppliers],
  );
  const pendingPayments = useMemo(
    () => radar.payments.map((p) => p.payment),
    [radar.payments],
  );
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"todos" | "payments" | "queue">("todos");
  const [newTodoText, setNewTodoText] = useState("");
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [todoFilter, setTodoFilter] = useState<"all" | "active" | "completed">("all");

  // Lắng nghe trạng thái mạng & hàng đợi Offline
  useEffect(() => {
    let active = true;
    checkIsOnline().then((online) => {
      if (active) setIsOnline(online);
    });

    const updateQueue = () => {
      getOfflineQueue().then((q) => {
        if (active) setQueueCount(q.length);
      });
    };
    updateQueue();

    const unsubNetwork = subscribeToNetworkStatus((online) => {
      if (active) setIsOnline(online);
      updateQueue();
    });

    const onQueueChanged = () => updateQueue();
    window.addEventListener("scm_offline_queue_changed", onQueueChanged);

    return () => {
      active = false;
      unsubNetwork();
      window.removeEventListener("scm_offline_queue_changed", onQueueChanged);
    };
  }, []);

  const filteredTodos = useMemo(() => {
    const list = todos || [];
    if (todoFilter === "active") return list.filter((t) => !t.completed);
    if (todoFilter === "completed") return list.filter((t) => t.completed);
    return list;
  }, [todos, todoFilter]);

  const activeTodoCount = useMemo(() => (todos || []).filter((t) => !t.completed).length, [todos]);
  const unpaidPOCount = useMemo(
    () => (pos || []).filter((p) => p.status !== "Đã thanh toán" && p.status !== "completed").length,
    [pos]
  );

  const pendingPRs = useMemo(
    () => (prs || []).filter((p) => p.status === "Chờ duyệt" || p.status === "pending" || !p.status),
    [prs]
  );
  const pendingApprovals = useMemo(
    () => (approvalRequests || []).filter((a) => a.status === "Nháp" || a.status === "Chờ phê duyệt"),
    [approvalRequests]
  );

  const handleAddTodoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;
    if (onAddTodo) onAddTodo(newTodoText.trim());
    setNewTodoText("");
  };

  return (
    <div className="mobile-native-dashboard" style={{ paddingBottom: "110px", background: "#f8fafc", minHeight: "100dvh" }}>
      {/* ----------------------------------------------------------------
          1. HEADER CỐ ĐỊNH CHUẨN NATIVE APP
          ---------------------------------------------------------------- */}
      <div
        className="mobile-header-bar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 80,
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              color: "#ffffff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: "15px",
              boxShadow: "0 2px 6px rgba(2, 132, 199, 0.35)",
            }}
          >
            AD
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
              Xin chào, Ban Quản trị 👋
            </div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Phenikaa Mua Hàng (SCMH)
            </div>
          </div>
        </div>

        {/* Network & Cloudflare Sync Status Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isOnline && queueCount === 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 600,
                background: "#ecfdf5",
                color: "#059669",
                border: "1px solid #a7f3d0",
              }}
              title="Đã kết nối và đồng bộ trực tiếp Cloudflare D1"
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
              Đã đồng bộ D1
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 600,
                background: "#fffbeb",
                color: "#d97706",
                border: "1px solid #fde68a",
              }}
              title={isOnline ? `${queueCount} tác vụ đang chờ gửi lên D1` : "Ngoại tuyến: Đã lưu tạm an toàn vào máy"}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b" }} />
              {isOnline ? `Đang gửi (${queueCount})` : "Ngoại tuyến"}
            </span>
          )}

          <button
            type="button"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              color: "#475569",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
            onClick={() => onNavigate && onNavigate({ view: "dashboard" })}
            title="Thông báo hệ thống"
          >
            <Bell size={17} />
          </button>
        </div>
      </div>

      {/* 2. RADAR NHẮC VIỆC (THAY THẾ CÁC THẺ TỔNG HỢP CHUNG) */}
      <div style={{ padding: "12px 16px 4px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button type="button" onClick={() => setActiveTab("queue")} style={{ textAlign: "left", borderRadius: "12px", padding: "10px 12px", border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#b91c1c" }}>QUÁ HẠN / LỖI</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#991b1b" }}>{radar.counts.overdue}</div>
          </button>
          <button type="button" onClick={() => setActiveTab("queue")} style={{ textAlign: "left", borderRadius: "12px", padding: "10px 12px", border: "1px solid #fde68a", background: "#fffbeb", cursor: "pointer" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#b45309" }}>SẮP ĐẾN HẠN (≤3N)</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#92400e" }}>{radar.counts.dueSoon}</div>
          </button>
          <button type="button" onClick={() => setActiveTab("queue")} style={{ textAlign: "left", borderRadius: "12px", padding: "10px 12px", border: "1px solid #fed7aa", background: "#fff7ed", cursor: "pointer" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#c2410c" }}>THIẾU CHỨNG TỪ</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#9a3412" }}>{radar.counts.missingDocs}</div>
          </button>
          <button type="button" onClick={() => setActiveTab("payments")} style={{ textAlign: "left", borderRadius: "12px", padding: "10px 12px", border: "1px solid #bae6fd", background: "#f0f9ff", cursor: "pointer" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#0369a1" }}>ĐANG THEO DÕI</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0c4a6e" }}>{radar.counts.totalActionable}</div>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------
          3. THANH ĐIỀU HƯỚNG PHÂN ĐOẠN (SEGMENTED TABS)
          ---------------------------------------------------------------- */}
      <div style={{ padding: "8px 16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            background: "#e2e8f0",
            padding: "3px",
            borderRadius: "10px",
          }}
        >
          <button
            type="button"
            style={{
              padding: "8px 4px",
              borderRadius: "8px",
              border: 0,
              fontSize: "12px",
              fontWeight: 700,
              background: activeTab === "todos" ? "#ffffff" : "transparent",
              color: activeTab === "todos" ? "#0284c7" : "#64748b",
              boxShadow: activeTab === "todos" ? "0 2px 4px rgba(0,0,0,0.06)" : "none",
              cursor: "pointer",
            }}
            onClick={() => setActiveTab("todos")}
          >
            📋 Việc cá nhân ({activeTodoCount})
          </button>
          <button
            type="button"
            style={{
              padding: "8px 4px",
              borderRadius: "8px",
              border: 0,
              fontSize: "12px",
              fontWeight: 700,
              background: activeTab === "payments" ? "#ffffff" : "transparent",
              color: activeTab === "payments" ? "#0284c7" : "#64748b",
              boxShadow: activeTab === "payments" ? "0 2px 4px rgba(0,0,0,0.06)" : "none",
              cursor: "pointer",
            }}
            onClick={() => setActiveTab("payments")}
          >
            💸 Chi hôm nay ({(pendingPayments || []).length})
          </button>
          <button
            type="button"
            style={{
              padding: "8px 4px",
              borderRadius: "8px",
              border: 0,
              fontSize: "12px",
              fontWeight: 700,
              background: activeTab === "queue" ? "#ffffff" : "transparent",
              color: activeTab === "queue" ? "#0284c7" : "#64748b",
              boxShadow: activeTab === "queue" ? "0 2px 4px rgba(0,0,0,0.06)" : "none",
              cursor: "pointer",
            }}
            onClick={() => setActiveTab("queue")}
          >
            ⚡ Cần duyệt ({((pendingPRs || []).length) + ((pendingApprovals || []).length)})
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------
          TAB 1: DANH SÁCH CÔNG VIỆC CÁ NHÂN (TODO LIST NATIVE D1)
          ---------------------------------------------------------------- */}
      {activeTab === "todos" && (
        <div style={{ padding: "8px 16px" }}>
          {/* Form thêm việc nhanh */}
          <form
            onSubmit={handleAddTodoSubmit}
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <input
              type="text"
              placeholder="Thêm việc mới (VD: @PO-01 đối chiếu hóa đơn)..."
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              style={{
                flex: 1,
                height: "44px",
                padding: "0 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: "13px",
                outline: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            />
            <button
              type="submit"
              disabled={!newTodoText.trim()}
              style={{
                height: "44px",
                padding: "0 16px",
                borderRadius: "10px",
                border: 0,
                background: newTodoText.trim() ? "#0284c7" : "#cbd5e1",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "13px",
                cursor: newTodoText.trim() ? "pointer" : "not-allowed",
              }}
            >
              <Plus size={18} />
            </button>
          </form>

          {/* Filter Chips */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                style={{
                  padding: "4px 10px",
                  borderRadius: "14px",
                  border: 0,
                  fontSize: "11px",
                  fontWeight: 600,
                  background: todoFilter === "all" ? "#0284c7" : "#e2e8f0",
                  color: todoFilter === "all" ? "#ffffff" : "#475569",
                  cursor: "pointer",
                }}
                onClick={() => setTodoFilter("all")}
              >
                Tất cả ({(todos || []).length})
              </button>
              <button
                type="button"
                style={{
                  padding: "4px 10px",
                  borderRadius: "14px",
                  border: 0,
                  fontSize: "11px",
                  fontWeight: 600,
                  background: todoFilter === "active" ? "#0284c7" : "#e2e8f0",
                  color: todoFilter === "active" ? "#ffffff" : "#475569",
                  cursor: "pointer",
                }}
                onClick={() => setTodoFilter("active")}
              >
                Chưa xong ({activeTodoCount})
              </button>
              <button
                type="button"
                style={{
                  padding: "4px 10px",
                  borderRadius: "14px",
                  border: 0,
                  fontSize: "11px",
                  fontWeight: 600,
                  background: todoFilter === "completed" ? "#0284c7" : "#e2e8f0",
                  color: todoFilter === "completed" ? "#ffffff" : "#475569",
                  cursor: "pointer",
                }}
                onClick={() => setTodoFilter("completed")}
              >
                Đã xong ({Math.max(0, ((todos || []).length) - activeTodoCount)})
              </button>
            </div>

            {(todos || []).some((t) => t.completed) && (
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: 0,
                  color: "#dc2626",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => onClearCompletedTodos && onClearCompletedTodos()}
              >
                Dọn việc xong
              </button>
            )}
          </div>

          {/* Todo Items Cards */}
          {(filteredTodos || []).length === 0 ? (
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                padding: "30px 16px",
                textAlign: "center",
                border: "1px dashed #cbd5e1",
              }}
            >
              <CheckCircle2 size={36} color="#10b981" style={{ margin: "0 auto 8px" }} />
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>
                Không có công việc nào tồn đọng!
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                Dữ liệu được đồng bộ trực tiếp Cloudflare D1
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(filteredTodos || []).map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    transition: "all 0.2s",
                  }}
                >
                  {/* Big Circular Checkbox */}
                  <button
                    type="button"
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      border: t.completed ? "2px solid #10b981" : "2px solid #94a3b8",
                      background: t.completed ? "#10b981" : "transparent",
                      color: "#ffffff",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                      transition: "all 0.2s",
                    }}
                    onClick={() => onToggleTodo && onToggleTodo(t.id)}
                    title={t.completed ? "Đánh dấu chưa xong" : "Đánh dấu hoàn thành"}
                  >
                    {t.completed && <Check size={16} strokeWidth={3} />}
                  </button>

                  {/* Todo Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13.5px",
                        fontWeight: t.completed ? 400 : 600,
                        color: t.completed ? "#94a3b8" : "#1e293b",
                        textDecoration: t.completed ? "line-through" : "none",
                        lineHeight: 1.35,
                        wordBreak: "break-word",
                      }}
                    >
                      {t.text}
                    </div>
                    {t.priority === "high" && (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: "4px",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: "#fee2e2",
                          color: "#dc2626",
                        }}
                      >
                        Ưu tiên cao
                      </span>
                    )}
                  </div>

                  {/* Delete Button */}
                  <button
                    type="button"
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "6px",
                      border: 0,
                      background: "#f1f5f9",
                      color: "#94a3b8",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    onClick={() => onDeleteTodo && onDeleteTodo(t.id)}
                    title="Xóa công việc"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------
          TAB 2: THANH TOÁN CẦN XỬ LÝ & TRONG NGÀY (NATIVE CARD VIEW)
          ---------------------------------------------------------------- */}
      {activeTab === "payments" && (
        <div style={{ padding: "8px 16px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
            Hiển thị các khoản thanh toán trong ngày và cần giải ngân:
          </div>

          {(pendingPayments || []).length === 0 ? (
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                padding: "30px 16px",
                textAlign: "center",
                border: "1px dashed #cbd5e1",
              }}
            >
              <CheckCircle2 size={36} color="#10b981" style={{ margin: "0 auto 8px" }} />
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>
                Không còn khoản chi nào tồn đọng hôm nay!
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {pendingPayments.map((r) => {
                const isPaid = r.status === "Đã thanh toán" || r.status === "completed";
                const linkedPO = pos.find((p) => p.id === r.po_id || p.number === r.po_number);

                return (
                  <div
                    key={r.id}
                    style={{
                      background: "#ffffff",
                      borderRadius: "12px",
                      padding: "14px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                    }}
                  >
                    {/* Top Row: PO & Status */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#0284c7",
                          background: "#eff6ff",
                          padding: "3px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        {r.po_number || r.group_code || "Chi trực tiếp"}
                      </span>

                      <button
                        type="button"
                        style={{
                          padding: "4px 10px",
                          borderRadius: "14px",
                          border: 0,
                          fontSize: "11px",
                          fontWeight: 700,
                          background: isPaid ? "#dcfce7" : "#fef3c7",
                          color: isPaid ? "#15803d" : "#b45309",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        onClick={() => {
                          if (isPaid) {
                            if (onRevertPayment) onRevertPayment(r);
                          } else {
                            if (onConfirmPayment) onConfirmPayment(r);
                          }
                        }}
                      >
                        {isPaid ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                        {isPaid ? "Đã thanh toán" : "Chưa thanh toán"}
                      </button>
                    </div>

                    {/* Payee / NCC */}
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
                      {r.payee_name || "Chưa có NCC"}
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "10px", lineHeight: 1.3 }}>
                      {r.description || r.item_name || "Đề nghị thanh toán đơn hàng"}
                    </div>

                    {/* Amount & Invoice Row */}
                    <div
                      style={{
                        paddingTop: "8px",
                        borderTop: "1px dashed #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                        HĐ: <b>{r.invoice_no || "Chưa có"}</b>
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                        {fmtMoney(r.amount)} {r.currency || "₫"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------
          TAB 3: HÀNG ĐỢI DUYỆT (PR CHỜ BÁO GIÁ & ĐNPD CHỜ PHÊ DUYỆT)
          ---------------------------------------------------------------- */}
      {activeTab === "queue" && (
        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* PRs Section */}
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
              📋 Yêu cầu mua sắm cần lấy báo giá ({(pendingPRs || []).length})
            </div>
            {(pendingPRs || []).length === 0 ? (
              <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>
                ✓ Không có PR nào chờ xử lý
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(pendingPRs || []).map((pr) => (
                  <div
                    key={pr.id}
                    style={{
                      background: "#ffffff",
                      borderRadius: "10px",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onClick={() => onSelectPR && onSelectPR(pr)}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: "8px" }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#0284c7" }}>
                        {pr.number}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>
                        {pr.department} · {pr.items?.length || 0} mặt hàng
                      </div>
                      {pr.items && pr.items.length > 0 && (
                        <div style={{ fontSize: "12px", color: "#334155", fontWeight: 600, marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          📦 {pr.items[0]?.name || (pr.items[0] as any)?.itemName || "(Chưa có tên)"}
                          {pr.items.length > 1 ? ` (+${pr.items.length - 1} hàng khác)` : ""}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: 0,
                        background: "#0284c7",
                        color: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      So sánh giá ➔
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Approvals Section */}
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
              ⚖️ Đề nghị phê duyệt chờ quyết toán ({(pendingApprovals || []).length})
            </div>
            {(pendingApprovals || []).length === 0 ? (
              <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>
                ✓ Không có ĐNPD nào chờ phê duyệt
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {pendingApprovals.map((appr) => (
                  <div
                    key={appr.id}
                    style={{
                      background: "#ffffff",
                      borderRadius: "10px",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onClick={() => onNavigate && onNavigate({ view: "approval" })}
                  >
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#0f172a" }}>
                        {appr.prNumber || appr.requestNumber}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        Đề xuất: <b>{appr.recommendedSupplierName || "Chưa chọn"}</b>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: "#fef3c7",
                        color: "#b45309",
                      }}
                    >
                      Chờ duyệt
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------
          4. NÚT HÀNH ĐỘNG NỔI (FAB - FLOATING ACTION BUTTON)
          ---------------------------------------------------------------- */}
      {/* Backdrop khi FAB mở */}
      {isFabOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 115,
          }}
          onClick={() => setIsFabOpen(false)}
        />
      )}

      {/* Menu các nút tạo nhanh khi bung ra */}
      {isFabOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "155px",
            right: "20px",
            zIndex: 120,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "12px",
          }}
        >
          {/* Action 1: Tạo PR */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                background: "#ffffff",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#1e293b",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              Tạo Yêu cầu Mua sắm (PR)
            </span>
            <button
              type="button"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
                color: "#ffffff",
                border: 0,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 6px 16px rgba(34, 82, 246, 0.4)",
                cursor: "pointer",
              }}
              onClick={() => {
                setIsFabOpen(false);
                if (onCreatePR) onCreatePR();
              }}
            >
              <FileText size={20} />
            </button>
          </div>

          {/* Action 2: Tạo PO */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                background: "#ffffff",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#1e293b",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              Tạo Đơn mua hàng (PO)
            </span>
            <button
              type="button"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
                color: "#ffffff",
                border: 0,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 6px 16px rgba(34, 82, 246, 0.4)",
                cursor: "pointer",
              }}
              onClick={() => {
                setIsFabOpen(false);
                if (onCreatePO) onCreatePO();
              }}
            >
              <Package size={20} />
            </button>
          </div>

          {/* Action 3: Tạo Bàn giao */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                background: "#ffffff",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#1e293b",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              Bàn giao &amp; Nghiệm thu
            </span>
            <button
              type="button"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
                color: "#ffffff",
                border: 0,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 6px 16px rgba(34, 82, 246, 0.4)",
                cursor: "pointer",
              }}
              onClick={() => {
                setIsFabOpen(false);
                if (onNavigate) onNavigate({ view: "handover" });
              }}
            >
              <Truck size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Main Floating Action Button Circle */}
      <button
        type="button"
        style={{
          position: "fixed",
          bottom: "85px",
          right: "20px",
          zIndex: 120,
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: isFabOpen ? "#0f172a" : "linear-gradient(135deg, #3875f6 0%, #2252f6 100%)",
          color: "#ffffff",
          border: 0,
          display: "grid",
          placeItems: "center",
          boxShadow: "0 10px 25px -3px rgba(34, 82, 246, 0.5)",
          cursor: "pointer",
          transform: isFabOpen ? "rotate(45deg)" : "none",
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onClick={() => setIsFabOpen((prev) => !prev)}
        title="Tạo nhanh chứng từ mới"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>
    </div>
  );
}
