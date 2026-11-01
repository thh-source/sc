"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Share2, Download, ExternalLink } from "lucide-react";
import { compressUploadFile } from "../utils/compressUploadFile";
import { ShareFileModal } from "./ShareFileModal";

type DocumentFile = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  documentType?: string;
  expiresAt?: string;
  status?: string;
  note?: string;
};

const DOC_TYPES = [
  "Báo giá",
  "Hợp đồng",
  "PO xác nhận",
  "Hóa đơn",
  "Biên bản giao nhận",
  "Hồ sơ thanh toán",
  "CO/CQ",
  "Khác",
];
const DOC_STATUSES = ["Đã nhận", "Còn thiếu", "Chờ bổ sung", "Hết hiệu lực"];
const fmtSize = (size: number) => {
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};
const dateVN = (value?: string) =>
  value ? new Intl.DateTimeFormat("vi-VN").format(new Date(value)) : "—";
const daysLeft = (value?: string) => {
  if (!value) return null;
  return Math.ceil(
    (new Date(`${value}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );
};

export default function DocumentManager({
  title = "Hồ sơ đính kèm",
  entityType,
  entityId,
  workspaceId,
  readOnly = false,
  onStatus,
}: {
  title?: string;
  entityType: "pr" | "po" | "contract" | "quote";
  entityId: string;
  workspaceId: string;
  readOnly?: boolean;
  onStatus?: (message: string) => void;
}) {
  const [files, setFiles] = useState<DocumentFile[]>([]),
    [loading, setLoading] = useState(false),
    [uploading, setUploading] = useState(false),
    [documentType, setDocumentType] = useState(DOC_TYPES[0]),
    [status, setStatus] = useState(DOC_STATUSES[0]),
    [expiresAt, setExpiresAt] = useState(""),
    [note, setNote] = useState("");
  const [shareData, setShareData] = useState<{ isOpen: boolean; shareUrl: string; fileName: string } | null>(null);

  const handleShareFile = async (file: DocumentFile) => {
    try {
      const res = await fetch("/api/share-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: `/api/files/${encodeURIComponent(file.id)}`,
          fileName: file.fileName,
          fileType: file.contentType || (file.fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
          entityType,
          entityCode: entityId,
          fileSize: file.size,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Không thể tạo link chia sẻ");

      navigator.clipboard.writeText(data.shareUrl);
      setShareData({
        isOpen: true,
        shareUrl: data.shareUrl,
        fileName: file.fileName,
      });
      onStatus?.(`Đã tạo & sao chép link chia sẻ cho ${file.fileName}`);
    } catch (err: any) {
      alert(err.message || "Lỗi tạo link chia sẻ");
    }
  };
  const storageUsed = useMemo(
    () => files.reduce((total, file) => total + Number(file.size || 0), 0),
    [files],
  );
  const loadFiles = useCallback(() => {
    if (!workspaceId || !entityId || readOnly) return;
    setLoading(true);
    fetch(
      `/api/files?workspace=${encodeURIComponent(workspaceId)}&entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error("LOAD_FAILED");
        return response.json() as Promise<{ files?: any[] }>;
      })
      .then((body) => setFiles(body.files || []))
      .catch(() => onStatus?.("Không tải được danh sách hồ sơ"))
      .finally(() => setLoading(false));
  }, [entityId, entityType, onStatus, readOnly, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(loadFiles, 0);
    return () => window.clearTimeout(timer);
  }, [loadFiles]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onStatus?.(`Đang tối ưu hóa tài liệu ${file.name}...`);
    try {
      const finalFile = await compressUploadFile(file, {
        onProgress: (_pct, msg) => onStatus?.(msg),
      });
      const form = new FormData();
      form.append("file", finalFile);
      form.append("entityType", entityType);
      form.append("entityId", entityId);
      form.append("workspaceId", workspaceId);
      form.append("documentType", documentType);
      form.append("status", status);
      form.append("expiresAt", expiresAt);
      form.append("note", note);

      onStatus?.(`Đang tải hồ sơ ${finalFile.name}...`);
      const response = await fetch("/api/files", { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "UPLOAD_FAILED");
      }
      onStatus?.(`Đã lưu hồ sơ ${file.name}`);
      setNote("");
      event.target.value = "";
      loadFiles();
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : "Tải hồ sơ thất bại");
    } finally {
      setUploading(false);
    }
  };
  const removeFile = async (id: string) => {
    if (!confirm("Xóa hồ sơ này khỏi kho lưu trữ?")) return;
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setFiles((current) => current.filter((file) => file.id !== id));
      onStatus?.("Đã xóa hồ sơ");
    } catch {
      onStatus?.("Không xóa được hồ sơ");
    }
  };
  if (!workspaceId || !entityId || entityId === "0") return null;
  return (
    <section className="document-manager">
      <div className="document-head">
        <div>
          <span>HỒ SƠ LƯU TRỮ</span>
          <h2>{title}</h2>
          <p>
            {files.length} file · {fmtSize(storageUsed)} đã dùng trong mục này
          </p>
        </div>
        {!readOnly && (
          <label className={uploading ? "uploading" : ""}>
            ⇧ Tải hồ sơ
            <input
              type="file"
              hidden
              accept=".xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png"
              disabled={uploading}
              onChange={upload}
            />
          </label>
        )}
      </div>
      {!readOnly && (
        <div className="document-controls">
          <label>
            Loại hồ sơ
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              {DOC_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {DOC_STATUSES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Hạn hiệu lực / hạn bổ sung
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
          <label className="document-note">
            Ghi chú
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ví dụ: bản scan ký đóng dấu, thiếu trang..."
            />
          </label>
        </div>
      )}
      <div className="document-list">
        {loading ? (
          <p>Đang tải danh sách hồ sơ...</p>
        ) : files.length ? (
          files.map((file) => {
            const left = daysLeft(file.expiresAt);
            return (
              <article key={file.id}>
                <i>▧</i>
                <div>
                  <a href={`/api/files/${encodeURIComponent(file.id)}`} target="_blank">
                    {file.fileName}
                  </a>
                  <p>
                    {file.documentType || "Hồ sơ"} · {fmtSize(file.size)} · tải lên{" "}
                    {dateVN(file.uploadedAt)}
                  </p>
                  {file.note && <small>{file.note}</small>}
                </div>
                <span className={file.status === "Đã nhận" ? "ok" : "missing"}>
                  {file.status || "Đã nhận"}
                </span>
                {left !== null && (
                  <b className={left <= 7 ? "due-soon" : ""}>
                    {left < 0 ? "Đã quá hạn" : `Còn ${left} ngày`}
                  </b>
                )}

                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                  <button
                    type="button"
                    onClick={() => handleShareFile(file)}
                    title="Tạo link chia sẻ xem, in & tải file không cần đăng nhập"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
                      cursor: "pointer",
                    }}
                  >
                    <Share2 size={13} /> Chia sẻ
                  </button>

                  <a
                    href={`/api/files/${encodeURIComponent(file.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Mở hoặc tải file"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      backgroundColor: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      color: "#475569",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={13} />
                  </a>

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      title="Xóa hồ sơ"
                      style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        border: "1px solid #fecaca",
                        backgroundColor: "#fef2f2",
                        color: "#dc2626",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <p>Chưa có hồ sơ nào được tải lên cho mục này.</p>
        )}
      </div>

      {shareData && (
        <ShareFileModal
          isOpen={shareData.isOpen}
          onClose={() => setShareData(null)}
          fileName={shareData.fileName}
          shareUrl={shareData.shareUrl}
          entityCode={entityId}
        />
      )}
    </section>
  );
}
