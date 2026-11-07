"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  Printer,
  Share2,
  Paperclip,
  Camera,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { compressUploadFile } from "../utils/compressUploadFile";
import {
  PRScanPreviewModal,
  printScanFileUrl,
  createScanShareUrl,
} from "./PRScanPreviewModal";
import { ShareFileModal } from "./ShareFileModal";
import { useIsMobile } from "../useIsMobile";

export interface HandoverScanControlProps {
  scanUrl?: string;
  scanName?: string;
  batchTitle?: string;
  sourceNumber?: string;
  department?: string;
  handoverDate?: string;
  receiverName?: string;
  onUpdate: (scanUrl: string | undefined, fileName: string | undefined) => void;
  onStatus?: (msg: string) => void;
  compact?: boolean;
  readOnly?: boolean;
}

export function HandoverScanControl({
  scanUrl,
  scanName,
  batchTitle,
  sourceNumber,
  department,
  handoverDate,
  receiverName,
  onUpdate,
  onStatus,
  compact = false,
  readOnly = false,
}: HandoverScanControlProps) {
  const isMobile = useIsMobile(768);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareState, setShareState] = useState<{ isOpen: boolean; shareUrl: string } | null>(null);
  const [sharing, setSharing] = useState(false);

  const entityCode = (sourceNumber || department || "BBBG").trim();
  const displayTitle = batchTitle
    ? `Biên bản bàn giao · ${batchTitle}`
    : sourceNumber
    ? `Biên bản bàn giao #${sourceNumber}`
    : `Biên bản bàn giao (${department || "Vật tư"})`;

  const computedSubtitle = [
    department ? `Bộ phận nhận: ${department}` : "",
    handoverDate ? `Ngày BG: ${handoverDate}` : "",
    receiverName ? `Người nhận: ${receiverName}` : "",
    scanName ? `File: ${scanName}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const processAndUploadFile = async (file: File, isFromCamera: boolean) => {
    setUploading(true);
    setProgressText(isFromCamera ? "Đang xử lý ảnh chụp..." : "Đang tối ưu file...");
    try {
      const compressed = await compressUploadFile(file, {
        onProgress: (_pct, msg) => setProgressText(msg || "Đang xử lý..."),
      });

      const formData = new FormData();
      const finalFileName =
        isFromCamera && (!file.name || file.name === "image.jpg" || file.name === "photo.jpg")
          ? `Anh_BBBG_${entityCode}_${new Date().toISOString().slice(0, 10)}.jpg`
          : file.name;

      formData.append("file", compressed, finalFileName);
      const codePrefix = `BBBG_${entityCode}_${handoverDate || ""}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      formData.append("pr_code", codePrefix || "BBBG");

      setProgressText("Đang tải lên...");
      const res = await fetch("/api/upload-scan", {
        method: "POST",
        body: formData,
      });
      const data: any = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Tải lên file biên bản bàn giao thất bại");
      }

      onUpdate(data.scan_file_url, finalFileName);
      onStatus?.(
        isFromCamera
          ? `✓ Đã chụp và lưu ảnh biên bản bàn giao (${finalFileName})`
          : `✓ Đã tải lên file biên bản bàn giao (${finalFileName})`
      );
    } catch (err: any) {
      alert(err?.message || "Lỗi tải lên biên bản bàn giao");
    } finally {
      setUploading(false);
      setProgressText("");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processAndUploadFile(file, false);
  };

  const handleCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processAndUploadFile(file, true);
  };

  const handleRemoveScan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Bạn có muốn gỡ file / ảnh biên bản bàn giao này không?")) return;
    onUpdate(undefined, undefined);
    onStatus?.("Đã gỡ file biên bản bàn giao");
  };

  const handleDirectShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!scanUrl || sharing) return;
    setSharing(true);
    try {
      const shareUrl = await createScanShareUrl({
        scanUrl,
        fileName: displayTitle,
        entityCode,
        entityType: "handover",
      });
      setShareState({ isOpen: true, shareUrl });
    } catch (err: any) {
      alert(err?.message || "Không thể tạo link chia sẻ biên bản bàn giao");
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
                number: entityCode,
                scan_file_url: scanUrl,
                customTitle: displayTitle,
                customSubtitle: computedSubtitle || `Mã đợt: ${entityCode}`,
                entityType: "handover",
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
              entityCode={entityCode}
            />,
            document.body
          )}
      </>
    );
  };

  const renderHiddenInputs = () => (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleCameraChange}
      />
    </>
  );

  if (compact) {
    return (
      <div
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}
        onClick={(e) => e.stopPropagation()}
      >
        {renderHiddenInputs()}
        {scanUrl ? (
          <>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              title={`${displayTitle} — Bấm để xem trực tiếp file/ảnh biên bản bàn giao`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                fontSize: "11.5px",
                fontWeight: 700,
                borderRadius: "6px",
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#ffffff",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Eye size={12} /> Xem file BG
            </button>
            <button
              type="button"
              onClick={handleDirectPrint}
              title="In trực tiếp file/ảnh biên bản bàn giao"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "3px 6px",
                fontSize: "11.5px",
                borderRadius: "6px",
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
              title="Chia sẻ link file/ảnh biên bản bàn giao"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "3px 6px",
                fontSize: "11.5px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                cursor: "pointer",
              }}
            >
              <Share2 size={12} />
            </button>
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Đổi file biên bản bàn giao khác"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "3px 6px",
                    fontSize: "11.5px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                </button>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={uploading}
                    title="Chụp lại ảnh biên bản bàn giao bằng camera"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3px 6px",
                      fontSize: "11.5px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#0f172a",
                      cursor: "pointer",
                    }}
                  >
                    <Camera size={12} />
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          !readOnly && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Tải file biên bản bàn giao (PDF hoặc Ảnh)"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px dashed #64748b",
                  background: "#ffffff",
                  color: "#0f172a",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                <span>{uploading ? progressText || "Đang tải..." : "+ Up file BG"}</span>
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                title="Chụp ảnh trực tiếp biên bản bàn giao bằng điện thoại"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#0f172a",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <Camera size={12} />
                <span>Chụp ảnh</span>
              </button>
            </>
          )
        )}
        {renderModals()}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        background: scanUrl ? "#f0fdf4" : "#f8fafc",
        border: scanUrl ? "1px solid #86efac" : "1px dashed #cbd5e1",
        borderRadius: "10px",
        padding: "10px 14px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {renderHiddenInputs()}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: scanUrl ? "#166534" : "#334155",
            }}
          >
            📎 File / Ảnh Biên bản bàn giao:
          </span>
          {scanUrl ? (
            <span
              style={{
                fontSize: "11.5px",
                fontWeight: 600,
                color: "#15803d",
                background: "#dcfce7",
                padding: "2px 8px",
                borderRadius: "999px",
                maxWidth: "280px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={scanName || "Đã đính kèm biên bản bàn giao"}
            >
              ✓ {scanName || "Đã đính kèm biên bản"}
            </span>
          ) : (
            <span style={{ fontSize: "11.5px", color: "#64748b" }}>
              {isMobile
                ? "Chưa có file — Chọn tải file hoặc chụp ảnh trực tiếp biên bản bàn giao"
                : "Chưa có file — Cho phép tải file PDF/Ảnh hoặc chụp ảnh biên bản bàn giao trên điện thoại"}
            </span>
          )}
        </div>

        {scanUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              title="Xem trực tiếp file / ảnh biên bản bàn giao"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 700,
                borderRadius: "6px",
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <Eye size={14} /> Xem biên bản
            </button>

            <button
              type="button"
              onClick={handleDirectPrint}
              title="In trực tiếp file / ảnh biên bản bàn giao"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                cursor: "pointer",
              }}
            >
              <Printer size={14} /> In
            </button>

            <button
              type="button"
              onClick={handleDirectShare}
              disabled={sharing}
              title="Tạo link chia sẻ biên bản bàn giao"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                cursor: "pointer",
              }}
            >
              <Share2 size={14} /> {sharing ? "Đang tạo..." : "Chia sẻ"}
            </button>

            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Tải file khác thay thế"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  {uploading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  <span>{uploading ? progressText || "Đang tải..." : "Đổi file"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                  title="Chụp lại ảnh biên bản bàn giao bằng camera"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  <Camera size={13} />
                  <span>Chụp lại</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemoveScan}
                  title="Gỡ file biên bản bàn giao"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#dc2626",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        ) : (
          !readOnly && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
                width: isMobile ? "100%" : "auto",
              }}
            >
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                title="Chọn file PDF hoặc hình ảnh biên bản bàn giao từ thiết bị"
                style={{
                  flex: isMobile ? 1 : undefined,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  borderRadius: "7px",
                  border: "1px solid #334155",
                  background: "#ffffff",
                  color: "#0f172a",
                  cursor: uploading ? "wait" : "pointer",
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
                    <span>+ Up file bàn giao (PDF / Ảnh)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
                title="Mở máy ảnh chụp trực tiếp biên bản bàn giao (rất tiện trên điện thoại)"
                style={{
                  flex: isMobile ? 1 : undefined,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  borderRadius: "7px",
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#ffffff",
                  cursor: uploading ? "wait" : "pointer",
                }}
              >
                <Camera size={15} />
                <span>Chụp ảnh biên bản</span>
              </button>
            </div>
          )
        )}
      </div>

      {renderModals()}
    </div>
  );
}
