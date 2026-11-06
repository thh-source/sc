import React, { useState } from "react";
import { Plus, Trash2, Search, CheckCircle2, Circle, Scale, Eye, Printer, Paperclip, Loader2, Truck } from "lucide-react";
import { compressUploadFile } from "../utils/compressUploadFile";
import { PRScanPreviewModal } from "./PRScanPreviewModal";
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
  onUpdateScanUrl,
  onCreateHandover,
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
  onUpdateScanUrl?: (prId: number, scanUrl: string) => void;
  onCreateHandover?: (pr: PR) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "done">("all");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [previewScanPR, setPreviewScanPR] = useState<PR | null>(null);
  const [uploadingPrId, setUploadingPrId] = useState<number | null>(null);
  const [targetUploadPR, setTargetUploadPR] = useState<PR | null>(null);
  const [compressProgress, setCompressProgress] = useState<string>("");
  const rowScanInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadScanForPR = async (pr: PR, file: File) => {
    if (!file) return;

    setUploadingPrId(pr.id);
    setCompressProgress("Đang tối ưu tài liệu...");
    try {
      const finalFile = await compressUploadFile(file, {
        onProgress: (_pct, msg) => {
          setCompressProgress(msg);
        },
      });

      const formData = new FormData();
      formData.append("file", finalFile);
      formData.append("pr_code", pr.number);
      formData.append("prId", String(pr.id));

      setCompressProgress("Đang lưu trữ...");
      const res = await fetch("/api/upload-scan", {
        method: "POST",
        body: formData,
      });

      const data: any = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Tải lên bản scan thất bại");
      }

      pr.scan_file_url = data.scan_file_url;
      onUpdateScanUrl?.(pr.id, data.scan_file_url);
    } catch (err: any) {
      alert(err.message || "Lỗi tải lên bản scan");
    } finally {
      setUploadingPrId(null);
      setTargetUploadPR(null);
      setCompressProgress("");
    }
  };

  const handleQuickPrint = (pr: PR) => {
    if (!pr.scan_file_url) return;
    const scanUrl = pr.scan_file_url;
    const isPdf =
      scanUrl.toLowerCase().includes(".pdf") ||
      (scanUrl.toLowerCase().includes("key=") && scanUrl.toLowerCase().includes(".pdf"));

    if (isPdf) {
      const printFrame = document.createElement("iframe");
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "none";
      printFrame.src = scanUrl;
      document.body.appendChild(printFrame);
      printFrame.onload = () => {
        try {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        } catch {
          window.open(scanUrl, "_blank");
        }
        setTimeout(() => {
          try {
            document.body.removeChild(printFrame);
          } catch {}
        }, 60000);
      };
    } else {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Bản scan PR #${pr.number}</title>
              <style>
                @page { size: auto; margin: 8mm; }
                body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: flex-start; background: #fff; }
                img { max-width: 100%; height: auto; object-fit: contain; }
              </style>
            </head>
            <body>
              <img src="${scanUrl}" onload="window.print(); setTimeout(() => window.close(), 1000);" />
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    }
  };

  const departments = Array.from(new Set(prs.map((p) => (p.department || "").trim()).filter(Boolean)));
  const totalPrBudget = prs.reduce(
    (sum, pr) => sum + (pr.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.estimate) || 0), 0),
    0
  );
  const completedPrCount = prs.filter((p) => isPRCompleted(p)).length;
  const activePrCount = prs.length - completedPrCount;

  const shown = prs
    .filter((p) => {
      const isDone = isPRCompleted(p);
      if (statusFilter === "active" && isDone) return false;
      if (statusFilter === "done" && !isDone) return false;
      if (deptFilter && (p.department || "").trim() !== deptFilter) return false;
      const itemNames = (p.items || []).map((it) => it.name || "").join(" ");
      return (p.number + " " + p.department + " " + p.purpose + " " + itemNames)
        .toLowerCase()
        .includes(q.toLowerCase());
    })
    .sort((a, b) => {
      // Giữ nguyên thứ tự mới ở trên, cũ ở dưới (không đẩy PR hoàn tất xuống dưới)
      return (b.date || "").localeCompare(a.date || "") || (b.id - a.id);
    });

  return (
    <section className="content pr-page">
      {/* STITCH v2 WORKSPACE HEADER */}
      <div className="heading stitch-page-banner">
        <div>
          <div className="stitch-breadcrumb">
            <span>Điều hành Thu mua</span>
            <span>/</span>
            <b>Yêu cầu Mua sắm (PR)</b>
          </div>
          <h1>{t("pr.title")}</h1>
          <p className="stitch-subtitle">
            Quản lý tập trung yêu cầu vật tư từ các phòng ban, theo dõi hồ sơ scan và luồng chuyển tiếp báo giá ĐNPD / PO
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="primary po-create-btn" onClick={onCreate} style={{ height: "40px", padding: "0 18px" }}>
            <Plus size={17} /> + Tạo Yêu cầu PR mới
          </button>
        </div>
      </div>

      {/* STITCH v2 BENTO KPI STRIP (Desktop only via CSS) */}
      <div className="stitch-kpi-strip">
        <div className="stitch-kpi-card kpi-navy">
          <div className="stitch-kpi-body">
            <span className="stitch-kpi-label">Tổng Yêu cầu Mua sắm (PR)</span>
            <div className="stitch-kpi-val-row">
              <strong className="stitch-kpi-num">{prs.length} PR</strong>
              <span className="stitch-kpi-subval">{fmt(totalPrBudget)} ₫</span>
            </div>
            <span className="stitch-kpi-desc">Tổng giá trị ngân sách dự toán lũy kế</span>
          </div>
          <div className="stitch-kpi-icon icon-navy">📋</div>
        </div>

        <div className="stitch-kpi-card kpi-orange">
          <div className="stitch-kpi-body">
            <span className="stitch-kpi-label">Đang xử lý &amp; Lấy báo giá</span>
            <div className="stitch-kpi-val-row">
              <strong className="stitch-kpi-num text-orange">{activePrCount} PR</strong>
              <span className="stitch-kpi-badge badge-orange">Cần theo dõi</span>
            </div>
            <span className="stitch-kpi-desc">Đang trong luồng so sánh giá ĐNPD hoặc chờ lập PO</span>
          </div>
          <div className="stitch-kpi-icon icon-orange">⚖️</div>
        </div>

        <div className="stitch-kpi-card kpi-emerald">
          <div className="stitch-kpi-body">
            <span className="stitch-kpi-label">Đã hoàn thành / Đã lên PO</span>
            <div className="stitch-kpi-val-row">
              <strong className="stitch-kpi-num text-emerald">{completedPrCount} PR</strong>
              <span className="stitch-kpi-badge badge-emerald">
                {prs.length > 0 ? Math.round((completedPrCount / prs.length) * 100) : 0}% hoàn tất
              </span>
            </div>
            <span className="stitch-kpi-desc">Đã phát hành đủ PO hoặc hoàn tất bàn giao</span>
          </div>
          <div className="stitch-kpi-icon icon-emerald">✓</div>
        </div>
      </div>

      <div className="pr-panel">
        <div className="pr-toolbar stitch-filter-bar">
          <div className="stitch-seg-group">
            <button
              type="button"
              className={`stitch-seg-btn ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              Tất cả ({prs.length})
            </button>
            <button
              type="button"
              className={`stitch-seg-btn ${statusFilter === "active" ? "active" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              Đang xử lý ({activePrCount})
            </button>
            <button
              type="button"
              className={`stitch-seg-btn ${statusFilter === "done" ? "active" : ""}`}
              onClick={() => setStatusFilter("done")}
            >
              Đã hoàn thành ({completedPrCount})
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: "260px" }}>
              <Search size={16} style={{ color: "var(--slate-400)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("pr.search_placeholder")}
              />
            </label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{
                height: "36px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                padding: "0 12px",
                fontSize: "12.5px",
                fontWeight: 600,
                color: "#334155",
                background: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value="">Tất cả phòng ban ({departments.length})</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="stitch-count-pill">{t("pr.requests_count", { count: shown.length })}</span>
          </div>
        </div>

        {/* MOBILE RECORD LIST (100% UNTOUCHED FOR APK MOBILE) */}
        <div className="mobile-record-list">
          {shown.map((pr) => {
            const flow = resolveDocFlow({ pr }, { prs, pos, approvalRequests, paymentRequests, paymentHandovers });
            const isDone = isPRCompleted(pr);
            return (
              <article key={pr.id} className={isDone ? "row-completed" : ""}>
                <header>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {onToggleComplete && (
                      <button
                        type="button"
                        className={`completion-toggle-btn ${isDone ? "completed" : ""}`}
                        title={isDone ? "Đã hoàn thành (Click để mở lại)" : "Đang xử lý (Click để đánh dấu Hoàn thành)"}
                        onClick={() => onToggleComplete(pr)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", padding: 0 }}
                      >
                        {isDone ? <CheckCircle2 size={22} className="text-emerald-600 fill-emerald-100" /> : <Circle size={22} className="text-slate-400 hover:text-slate-600" />}
                      </button>
                    )}
                    <button onClick={() => onOpen(pr)} style={{ fontSize: "15px", fontWeight: 800 }}>{pr.number}</button>
                  </div>
                  <span className={`status ${isDone ? "done" : pr.status?.includes("PO") || pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}>{pr.status || "Chờ duyệt"}</span>
                </header>
                <h3>{pr.department}</h3>
                <p>{pr.purpose}</p>
                <dl>
                  <div><dt>Ngày PR</dt><dd>{dateVN(pr.date)}</dd></div>
                  <div><dt>Mặt hàng</dt><dd>{pr.items?.length || 0}</dd></div>
                  <div><dt>Dự kiến</dt><dd>{fmt((pr.items || []).reduce((sum, item) => sum + item.qty * item.estimate, 0))} ₫</dd></div>
                </dl>

                {/* Danh sách mặt hàng chính trong PR */}
                {(pr.items || []).length > 0 && (
                  <div style={{ marginTop: "8px", padding: "8px 10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
                      📦 Mặt hàng ({(pr.items || []).length}):
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      {(pr.items || []).slice(0, 2).map((it, itIdx) => (
                        <div key={it.id || itIdx} style={{ fontSize: "12px", color: "#1e293b", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, paddingRight: "6px" }}>
                            • {it.name || (it as any).itemName || (it as any).item_name || (it as any).productName || "(Chưa có tên hàng)"}
                          </span>
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500, flexShrink: 0 }}>
                            {it.qty} {it.unit || "Cái"}
                          </span>
                        </div>
                      ))}
                      {(pr.items || []).length > 2 && (
                        <div style={{ fontSize: "11px", color: "#0284c7", fontWeight: 600, marginTop: "2px" }}>
                          +{(pr.items || []).length - 2} mặt hàng khác...
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0" }}>
                  <DocFlowLinks flow={flow} currentView="prs" onNavigate={onNavigate} compact />
                </div>
                <footer className="m-card-footer">
                  <button
                    type="button"
                    className="m-action-btn m-btn-primary"
                    onClick={() => onOpen(pr)}
                    title="Mở PR & So sánh giá"
                  >
                    <Scale size={17} />
                    <span>Mở & So sánh</span>
                  </button>

                  {onCreateHandover && (
                    <button
                      type="button"
                      className="m-action-btn m-btn-success"
                      onClick={() => onCreateHandover(pr)}
                      title="Tạo biên bản bàn giao từ các mặt hàng trong PR này"
                    >
                      <Truck size={17} />
                      <span>Tạo biên bản</span>
                    </button>
                  )}

                  {pr.scan_file_url ? (
                    <>
                      <button
                        type="button"
                        className="m-action-btn m-btn-outline-primary"
                        onClick={() => setPreviewScanPR(pr)}
                        title="Xem trực tiếp bản scan PR"
                      >
                        <Eye size={17} />
                        <span>Bản scan</span>
                      </button>
                      <button
                        type="button"
                        className="m-action-btn m-btn-outline-secondary"
                        onClick={() => handleQuickPrint(pr)}
                        title="In nhanh bản scan PR"
                      >
                        <Printer size={17} />
                        <span>In</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="m-action-btn m-btn-outline-secondary"
                      onClick={() => {
                        setTargetUploadPR(pr);
                        rowScanInputRef.current?.click();
                      }}
                      title="Tải lên bản scan PR"
                      disabled={uploadingPrId === pr.id}
                    >
                      {uploadingPrId === pr.id ? (
                        <span style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Loader2 size={15} className="animate-spin text-sky-600" />
                          <span>{compressProgress || "Đang nén..."}</span>
                        </span>
                      ) : (
                        <>
                          <Paperclip size={17} />
                          <span>Tải scan</span>
                        </>
                      )}
                    </button>
                  )}

                  {onDelete && (
                    <button
                      type="button"
                      className="m-action-btn m-btn-danger"
                      onClick={() => onDelete(pr)}
                      title="Xóa PR"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        {/* DESKTOP PR TABLE (STITCH v2 REDESIGNED) */}
        <div className="pr-table" style={{ width: "100%", overflowX: "auto", overflowY: "visible", maxHeight: "none" }}>
          <table style={{ width: "100%", minWidth: "1240px", tableLayout: "auto" }}>
            <colgroup>
              <col style={{ width: "130px" }} />
              <col style={{ width: "130px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "85px" }} />
              <col style={{ width: "135px" }} />
              <col style={{ width: "130px" }} />
              <col style={{ width: "135px" }} />
              <col style={{ width: "190px" }} />
              <col style={{ width: "220px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="cell-left" style={{ paddingLeft: "16px" }}>{t("table.pr_number")}</th>
                <th className="cell-left">Ngày &amp; Đơn vị</th>
                <th className="cell-left">Nội dung mua sắm &amp; Tóm tắt vật tư</th>
                <th className="cell-center">{t("table.items_count")}</th>
                <th className="cell-right">{t("table.est_amount")}</th>
                <th className="cell-center">{t("table.status")}</th>
                <th className="cell-center">Bản scan PR</th>
                <th className="cell-left">Tiến độ luồng</th>
                <th className="cell-right" style={{ paddingRight: "16px" }}>Thao tác tác nghiệp</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((pr) => {
                const flow = resolveDocFlow({ pr }, { prs, pos, approvalRequests, paymentRequests, paymentHandovers });
                const isDone = isPRCompleted(pr);
                const itemCount = pr.items?.length || 0;
                const firstTwoNames = (pr.items || [])
                  .slice(0, 2)
                  .map((it) => it.name || (it as any).itemName || (it as any).item_name || "")
                  .filter(Boolean)
                  .join(", ");

                return (
                  <tr key={pr.id} className={isDone ? "row-completed" : ""}>
                    <td className="cell-left" style={{ paddingLeft: "16px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        {onToggleComplete && (
                          <button
                            type="button"
                            className={`completion-toggle-btn ${isDone ? "completed" : ""}`}
                            title={isDone ? "Đã hoàn thành (Click để mở lại)" : "Đang xử lý (Click để đánh dấu Hoàn thành)"}
                            onClick={() => onToggleComplete(pr)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", padding: 0 }}
                          >
                            {isDone ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-slate-400 hover:text-slate-600" />}
                          </button>
                        )}
                        <button className="pr-link" onClick={() => onOpen(pr)}>
                          {pr.number}
                        </button>
                      </div>
                    </td>
                    <td className="cell-left">
                      <div style={{ fontWeight: 400, fontSize: "13px", color: "#0f172a" }}>{dateVN(pr.date)}</div>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: "3px",
                          padding: "1px 7px",
                          borderRadius: "5px",
                          fontSize: "11px",
                          fontWeight: 400,
                          background: "#f1f5f9",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        🏢 {pr.department || "Chưa rõ"}
                      </span>
                    </td>
                    <td className="purpose-cell cell-left">
                      <div style={{ fontWeight: 400, color: "#0f172a", fontSize: "13px" }}>{pr.purpose || "Mua sắm vật tư"}</div>
                      {firstTwoNames && (
                        <div
                          style={{
                            fontSize: "11.5px",
                            color: "#64748b",
                            marginTop: "3px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "380px",
                          }}
                          title={firstTwoNames}
                        >
                          📦 {firstTwoNames}
                          {itemCount > 2 ? ` (+${itemCount - 2} món khác)` : ""}
                        </div>
                      )}
                    </td>
                    <td className="cell-center">
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "2px 9px",
                          borderRadius: "999px",
                          fontSize: "11.5px",
                          fontWeight: 400,
                          background: "#eff6ff",
                          color: "#1e40af",
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        {itemCount} mục
                      </span>
                    </td>
                    <td className="money cell-right" style={{ fontWeight: 400, color: "#0f172a", fontSize: "13px" }}>
                      {fmt((pr.items || []).reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
                    </td>
                    <td className="cell-center">
                      <span
                        className={`status ${isDone ? "done" : pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}
                      >
                        {pr.status}
                      </span>
                    </td>
                    <td className="cell-center">
                      {pr.scan_file_url ? (
                        <div style={{ display: "inline-flex", gap: "5px", alignItems: "center", justifyContent: "center" }}>
                          <button
                            type="button"
                            className="stitch-action-pill pill-navy"
                            onClick={() => setPreviewScanPR(pr)}
                            title="Xem bản scan PR gốc"
                            style={{ padding: "4px 8px", fontSize: "11.5px" }}
                          >
                            <Eye size={13} /> Xem scan
                          </button>
                          <button
                            type="button"
                            className="btn-icon secondary-ghost"
                            onClick={() => handleQuickPrint(pr)}
                            title="In bản scan PR"
                            style={{
                              color: "#475569",
                              backgroundColor: "#f8fafc",
                              border: "1px solid #cbd5e1",
                              borderRadius: "6px",
                              padding: "4px 6px",
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            <Printer size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="stitch-action-pill"
                          onClick={() => {
                            setTargetUploadPR(pr);
                            rowScanInputRef.current?.click();
                          }}
                          title="Tải lên file scan / ảnh phiếu yêu cầu PR"
                          disabled={uploadingPrId === pr.id}
                          style={{
                            padding: "4px 9px",
                            fontSize: "11.5px",
                            color: "#0f172a",
                            backgroundColor: "#ffffff",
                            border: "1px dashed #cbd5e1",
                            cursor: "pointer",
                          }}
                        >
                          {uploadingPrId === pr.id ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-sky-600" />
                              <span>{compressProgress || "Đang tối ưu..."}</span>
                            </>
                          ) : (
                            <>
                              <Paperclip size={13} />
                              <span>+ Tải scan</span>
                            </>
                          )}
                        </button>
                      )}
                    </td>
                    <td>
                      <DocFlowLinks flow={flow} currentView="prs" onNavigate={onNavigate} compact />
                    </td>
                    <td className="cell-right" style={{ paddingRight: "16px" }}>
                      <div className="row-actions" style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                        <button
                          type="button"
                          className="stitch-action-pill pill-navy"
                          onClick={() => onOpen(pr)}
                          title="Mở Bảng so sánh báo giá của PR này"
                        >
                          <Scale size={13} /> So sánh giá
                        </button>
                        {onCreateHandover && (
                          <button
                            type="button"
                            className="stitch-action-pill pill-navy"
                            onClick={() => onCreateHandover(pr)}
                            title="Tạo biên bản bàn giao từ PR này"
                          >
                            <Truck size={13} /> Bàn giao
                          </button>
                        )}
                        {onDelete && (
                          <button className="btn-icon danger-ghost" onClick={() => onDelete(pr)} title="Xóa PR">
                            <Trash2 size={15} />
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
      <input
        ref={rowScanInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && targetUploadPR) {
            handleUploadScanForPR(targetUploadPR, f);
          }
          e.target.value = "";
        }}
      />

      {previewScanPR && (
        <PRScanPreviewModal
          pr={previewScanPR}
          onClose={() => setPreviewScanPR(null)}
        />
      )}
    </section>
  );
}
