"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Printer, Share2, Paperclip, Loader2, RefreshCw, X } from "lucide-react";
import { compressUploadFile } from "../utils/compressUploadFile";
import { PRScanPreviewModal, printScanFileUrl, createScanShareUrl } from "./PRScanPreviewModal";
import { ShareFileModal } from "./ShareFileModal";

export interface InvoiceScanControlProps {
  scanUrl?: string;
  scanName?: string;
  invoiceNo?: string;
  entityCode?: string;
  subtitle?: string;
  onUploadSuccess: (scanUrl: string, fileName: string) => void;
  onRemove?: () => void;
  compact?: boolean;
  readOnly?: boolean;
  label?: string;
}

export function InvoiceScanControl({
  scanUrl,
  scanName,
  invoiceNo,
  entityCode = "HD",
  subtitle,
  onUploadSuccess,
  onRemove,
  compact = false,
  readOnly = false,
  label,
}: InvoiceScanControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareState, setShareState] = useState<{ isOpen: boolean; shareUrl: string } | null>(null);
  const [sharing, setSharing] = useState(false);

  const displayTitle = invoiceNo?.trim()
    ? `Bản scan Hóa đơn GTGT #${invoiceNo.trim()}`
    : `Bản scan Hóa đơn GTGT (${entityCode})`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setProgressText("Đang tối ưu...");
    try {
      const compressed = await compressUploadFile(file, {
        onProgress: (_pct, msg) => setProgressText(msg || "Đang xử lý..."),
      });

      const formData = new FormData();
      formData.append("file", compressed);
      const codePrefix = `HD_${entityCode}_${invoiceNo || ""}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      formData.append("pr_code", codePrefix || "HD_VAT");

      setProgressText("Đang tải lên...");
      const res = await fetch("/api/upload-scan", {
        method: "POST",
        body: formData,
      });
      const data: any = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Tải lên bản scan hóa đơn thất bại");
      }

      onUploadSuccess(data.scan_file_url, file.name);
    } catch (err: any) {
      alert(err?.message || "Lỗi tải lên bản scan hóa đơn");
    } finally {
      setUploading(false);
      setProgressText("");
    }
  };

  const handleDirectShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!scanUrl || sharing) return;
    setSharing(true);
    try {
      const shareUrl = await createScanShareUrl({
        scanUrl,
        fileName: displayTitle,
        entityCode: invoiceNo?.trim() || entityCode,
        entityType: "invoice",
      });
      setShareState({ isOpen: true, shareUrl });
    } catch (err: any) {
      alert(err?.message || "Không thể tạo link chia sẻ hóa đơn");
    } finally {
      setSharing(false);
    }
  };

  const handleDirectPrint = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!scanUrl) return;
    printScanFileUrl(scanUrl, displayTitle);
  };

  const renderModals = () => {
    if (typeof document === "undefined") return null;
    return (
      <>
        {previewOpen &&
          scanUrl &&
          createPortal(
            <PRScanPreviewModal
              pr={{
                number: invoiceNo?.trim() || entityCode,
                scan_file_url: scanUrl,
                customTitle: displayTitle,
                customSubtitle: subtitle || (scanName ? `File: ${scanName}` : `Mã chứng từ: ${entityCode}`),
                entityType: "invoice",
              }}
              onClose={() => setPreviewOpen(false)}
            />,
            document.body
          )}
        {shareState?.isOpen &&
          createPortal(
            <ShareFileModal
              isOpen={shareState.isOpen}
              onClose={() => setShareState(null)}
              fileName={displayTitle}
              shareUrl={shareState.shareUrl}
              entityCode={invoiceNo?.trim() || entityCode}
            />,
            document.body
          )}
      </>
    );
  };

  if (compact) {
    return (
      <div
        style={{ display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {scanUrl ? (
          <>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              title={`${displayTitle} — Bấm để xem trực tiếp, in hoặc chia sẻ`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "2px 6px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "4px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                color: "#0f172a",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Eye size={12} /> Xem HĐ
            </button>
            <button
              type="button"
              onClick={handleDirectPrint}
              title="In trực tiếp bản scan Hóa đơn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px 5px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                cursor: "pointer",
              }}
            >
              <Printer size={12} />
            </button>
            <button
              type="button"
              onClick={handleDirectShare}
              disabled={sharing}
              title="Chia sẻ link bản scan Hóa đơn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px 5px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                cursor: "pointer",
              }}
            >
              <Share2 size={12} />
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Đổi file scan hóa đơn khác"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2px 5px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                {uploading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              </button>
            )}
          </>
        ) : (
          !readOnly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Tải lên bản scan Hóa đơn (PDF hoặc Ảnh)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "2px 6px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "4px",
                border: "1px dashed #94a3b8",
                background: "#ffffff",
                color: "#334155",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
              <span>{uploading ? "..." : "+ Scan HĐ"}</span>
            </button>
          )
        )}
        {renderModals()}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      {label !== undefined ? (
        label ? (
          <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px", color: "#334155" }}>
            {label}
          </span>
        ) : null
      ) : (
        <span style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "2px", color: scanUrl ? "#166534" : "#334155" }}>
          Bản scan Hóa đơn (PDF / Ảnh): {scanUrl ? "✓ Đã đính kèm" : "(Tải lên để xem / in / chia sẻ)"}
        </span>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {scanUrl ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexWrap: "wrap",
            minHeight: "34px",
            padding: "3px 6px",
            background: "#ffffff",
            border: "1px solid #86efac",
            borderRadius: "6px",
          }}
        >
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            title="Xem trực tiếp bản scan Hóa đơn trên màn hình"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "5px",
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            <Eye size={13} /> Xem HĐ
          </button>

          <button
            type="button"
            onClick={handleDirectPrint}
            title="In trực tiếp bản scan Hóa đơn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 9px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "5px",
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#0f172a",
              cursor: "pointer",
            }}
          >
            <Printer size={13} /> In
          </button>

          <button
            type="button"
            onClick={handleDirectShare}
            disabled={sharing}
            title="Tạo link chia sẻ bản scan Hóa đơn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 9px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "5px",
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#0f172a",
              cursor: "pointer",
            }}
          >
            <Share2 size={13} /> {sharing ? "Đang tạo..." : "Chia sẻ"}
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Tải file khác thay thế bản scan hiện tại"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                fontSize: "11.5px",
                fontWeight: 500,
                borderRadius: "5px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              <span>{uploading ? progressText || "Đang tải..." : "Đổi scan"}</span>
            </button>
          )}

          {!readOnly && onRemove && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Bạn có muốn gỡ bản scan hóa đơn này không?")) {
                  onRemove();
                }
              }}
              title="Gỡ bản scan hóa đơn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "26px",
                height: "26px",
                borderRadius: "5px",
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#dc2626",
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            type="button"
            disabled={readOnly || uploading}
            onClick={() => fileInputRef.current?.click()}
            title="Tải lên bản scan Hóa đơn GTGT (PDF hoặc hình ảnh)"
            style={{
              width: "100%",
              minHeight: "34px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "6px",
              border: "1px dashed #64748b",
              background: "#ffffff",
              color: "#0f172a",
              cursor: readOnly ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{progressText || "Đang tải lên..."}</span>
              </>
            ) : (
              <>
                <Paperclip size={14} />
                <span>+ Tải bản scan Hóa đơn (PDF / Ảnh)</span>
              </>
            )}
          </button>
        </div>
      )}

      {renderModals()}
    </div>
  );
}
