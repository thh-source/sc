import React, { useState } from "react";
import { Plus, ArrowRight, Trash2, Search, CheckCircle2, Circle, Scale, Eye, Printer, Paperclip, Loader2, Truck } from "lucide-react";
import { compressImageIfNeeded } from "../utils/compressImage";
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
  const [previewScanPR, setPreviewScanPR] = useState<PR | null>(null);
  const [uploadingPrId, setUploadingPrId] = useState<number | null>(null);
  const [targetUploadPR, setTargetUploadPR] = useState<PR | null>(null);
  const rowScanInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadScanForPR = async (pr: PR, file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 && file.type === "application/pdf") {
      alert("File PDF vượt quá 5MB. Vui lòng chọn file nhẹ hơn.");
      return;
    }

    setUploadingPrId(pr.id);
    try {
      const finalFile = await compressImageIfNeeded(file);
      if (finalFile.size > 5 * 1024 * 1024) {
        alert("Ảnh sau khi nén vẫn vượt quá 5MB. Vui lòng chọn ảnh dung lượng vừa phải hơn.");
        setUploadingPrId(null);
        return;
      }

      const formData = new FormData();
      formData.append("file", finalFile);
      formData.append("pr_code", pr.number);
      formData.append("prId", String(pr.id));

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
                        <Loader2 size={17} className="animate-spin text-sky-600" />
                      ) : (
                        <Paperclip size={17} />
                      )}
                      <span>Tải scan</span>
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
              <col style={{ width: "235px" }} />
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
                    <td className="cell-center">{pr.items?.length || 0}</td>
                    <td className="money cell-right">
                      {fmt((pr.items || []).reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
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
                        {pr.scan_file_url ? (
                          <div style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                            <button
                              type="button"
                              className="btn-icon primary-ghost"
                              onClick={() => setPreviewScanPR(pr)}
                              title="Xem bản scan PR"
                              style={{
                                color: "#0284c7",
                                backgroundColor: "#f0f9ff",
                                border: "1px solid #bae6fd",
                                borderRadius: "4px",
                                padding: "4px 6px",
                                display: "inline-flex",
                                alignItems: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon secondary-ghost"
                              onClick={() => handleQuickPrint(pr)}
                              title="In bản scan"
                              style={{
                                color: "#475569",
                                backgroundColor: "#f8fafc",
                                border: "1px solid #cbd5e1",
                                borderRadius: "4px",
                                padding: "4px 6px",
                                display: "inline-flex",
                                alignItems: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Printer size={15} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => {
                              setTargetUploadPR(pr);
                              rowScanInputRef.current?.click();
                            }}
                            title="Tải lên bản scan PR"
                            disabled={uploadingPrId === pr.id}
                            style={{
                              color: "#94a3b8",
                              backgroundColor: "transparent",
                              border: "1px dashed #cbd5e1",
                              borderRadius: "4px",
                              padding: "4px 6px",
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            {uploadingPrId === pr.id ? <Loader2 size={14} className="animate-spin text-sky-600" /> : <Paperclip size={14} />}
                          </button>
                        )}
                        {onCreateHandover && (
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
                              color: "#15803d",
                              backgroundColor: "#f0fdf4",
                              border: "1px solid #86efac",
                              borderRadius: "4px",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            onClick={() => onCreateHandover(pr)}
                            title="Tạo biên bản bàn giao từ PR này"
                          >
                            <Truck size={13} /> Bàn giao
                          </button>
                        )}
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

