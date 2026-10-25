import React, { useState } from "react";
import { Plus, ArrowRight, Trash2, Search, CheckCircle2, Circle, Scale } from "lucide-react";
import { PR, PO, ApprovalRequest, PaymentRequestEntry, PaymentHandoverItem } from "../types";
import { fmt, dateVN } from "../utils";
import { useTranslation } from "../i18n";
import { DocFlowLinks } from "./DocFlowLinks";
import { resolveDocFlow } from "../utils/docFlow";
import { isPRCompleted } from "../utils/paymentSync";

export function PRList({
  prs,
  pos = [],
  approvalRequests = [],
  paymentRequests = [],
  paymentHandovers = [],
  onCreate,
  onOpen,
  onDelete,
  onNavigate,
  onToggleComplete,
}: {
  prs: PR[];
  pos?: PO[];
  approvalRequests?: ApprovalRequest[];
  paymentRequests?: PaymentRequestEntry[];
  paymentHandovers?: PaymentHandoverItem[];
  onCreate: () => void;
  onOpen: (pr: PR) => void;
  onDelete?: (pr: PR) => void;
  onNavigate?: (route: any) => void;
  onToggleComplete?: (pr: PR) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const shown = prs
    .filter((p) =>
      (p.number + p.department + p.purpose)
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .sort((a, b) => {
      const aDone = isPRCompleted(a);
      const bDone = isPRCompleted(b);
      // Ưu tiên: Chưa hoàn thành lên trên cùng, Đã hoàn thành xuống dưới
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (b.date || "").localeCompare(a.date || "") || (b.id - a.id);
    });
  return (
    <section className="content pr-page">
      <div className="heading">
        <div>
          <h1>{t("pr.title")}</h1>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={16} /> Tạo PR
        </button>
      </div>

      <div className="pr-panel">
        <div className="pr-toolbar">
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Search size={16} style={{ color: "var(--slate-400)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("pr.search_placeholder")}
            />
          </label>
          <span>{t("pr.requests_count", { count: shown.length })}</span>
        </div>
        <div className="mobile-record-list">
          {shown.map((pr) => {
            const flow = resolveDocFlow({ pr }, { prs, pos, approvalRequests, paymentRequests, paymentHandovers });
            const isDone = isPRCompleted(pr);
            return (
              <article key={pr.id} className={isDone ? "row-completed" : ""}>
                <header>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {onToggleComplete && (
                      <button
                        type="button"
                        className={`completion-toggle-btn ${isDone ? "completed" : ""}`}
                        title={isDone ? "Đã hoàn thành (Click để mở lại)" : "Đang xử lý (Click để đánh dấu Hoàn thành)"}
                        onClick={() => onToggleComplete(pr)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", padding: 0 }}
                      >
                        {isDone ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-slate-400" />}
                      </button>
                    )}
                    <button onClick={() => onOpen(pr)}>{pr.number}</button>
                  </div>
                  <span className={`status ${isDone ? "done" : pr.status.includes("PO") || pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}>{pr.status}</span>
                </header>
                <h3>{pr.department}</h3>
                <p>{pr.purpose}</p>
                <dl>
                  <div><dt>Ngày PR</dt><dd>{dateVN(pr.date)}</dd></div>
                  <div><dt>Mặt hàng</dt><dd>{pr.items.length}</dd></div>
                  <div><dt>Dự kiến</dt><dd>{fmt(pr.items.reduce((sum, item) => sum + item.qty * item.estimate, 0))} ₫</dd></div>
                </dl>
                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0" }}>
                  <DocFlowLinks flow={flow} currentView="prs" onNavigate={onNavigate} compact />
                </div>
                <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#0369a1",
                      backgroundColor: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                    onClick={() => onOpen(pr)}
                  >
                    <Scale size={14} /> So sánh giá
                  </button>
                  <div style={{ display: "inline-flex", gap: "6px" }}>
                    <button className="btn-icon primary-ghost" onClick={() => onOpen(pr)} title="Mở PR / So sánh giá">
                      <ArrowRight size={16} />
                    </button>
                    {onDelete && (
                      <button className="btn-icon danger-ghost" onClick={() => onDelete(pr)} title="Xóa PR">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
        <div className="pr-table" style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "1120px", tableLayout: "auto" }}>
            <colgroup>
              <col style={{ width: "115px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "75px" }} />
              <col style={{ width: "125px" }} />
              <col style={{ width: "125px" }} />
              <col style={{ width: "210px" }} />
              <col style={{ width: "170px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="cell-center">{t("table.pr_number")}</th>
                <th className="cell-center">{t("table.pr_date")}</th>
                <th className="cell-left">{t("table.department")}</th>
                <th className="cell-left">{t("table.purpose")}</th>
                <th className="cell-center">{t("table.items_count")}</th>
                <th className="cell-right">{t("table.est_amount")}</th>
                <th className="cell-center">{t("table.status")}</th>
                <th className="cell-left">Tiến độ luồng</th>
                <th className="cell-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((pr) => {
                const flow = resolveDocFlow({ pr }, { prs, pos, approvalRequests, paymentRequests, paymentHandovers });
                const isDone = isPRCompleted(pr);
                return (
                  <tr key={pr.id} className={isDone ? "row-completed" : ""}>
                    <td className="cell-center">
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
                        {onToggleComplete && (
                          <button
                            type="button"
                            className={`completion-toggle-btn ${isDone ? "completed" : ""}`}
                            title={isDone ? "Đã hoàn thành (Click để mở lại)" : "Đang xử lý (Click để đánh dấu Hoàn thành)"}
                            onClick={() => onToggleComplete(pr)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", padding: 0 }}
                          >
                            {isDone ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-slate-400 hover:text-slate-600" />}
                          </button>
                        )}
                        <button className="pr-link" onClick={() => onOpen(pr)}>
                          {pr.number}
                        </button>
                      </div>
                    </td>
                    <td className="cell-center">{dateVN(pr.date)}</td>
                    <td className="cell-left">{pr.department}</td>
                    <td className="purpose-cell cell-left">{pr.purpose}</td>
                    <td className="cell-center">{pr.items.length}</td>
                    <td className="money cell-right">
                      {fmt(pr.items.reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
                    </td>
                    <td className="cell-center">
                      <span
                        className={`status ${isDone ? "done" : pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}
                      >
                        {pr.status}
                      </span>
                    </td>
                    <td>
                      <DocFlowLinks flow={flow} currentView="prs" onNavigate={onNavigate} compact />
                    </td>
                    <td className="cell-center">
                      <div className="row-actions" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 8px",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            color: "#0369a1",
                            backgroundColor: "#f0f9ff",
                            border: "1px solid #bae6fd",
                            borderRadius: "4px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          onClick={() => onOpen(pr)}
                          title="Mở Bảng so sánh báo giá của PR này"
                        >
                          <Scale size={13} /> So sánh giá
                        </button>
                        <button className="btn-icon primary-ghost" onClick={() => onOpen(pr)} title="Mở PR / So sánh giá">
                          <ArrowRight size={16} />
                        </button>
                        {onDelete && (
                          <button className="btn-icon danger-ghost" onClick={() => onDelete(pr)} title="Xóa PR">
                            <Trash2 size={16} />
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
    </section>
  );
}

