import React, { useState, useRef } from "react";
import { X, Printer, ExternalLink, ZoomIn, ZoomOut, RotateCw, Maximize2, FileText, Image as ImageIcon, Share2, Download } from "lucide-react";
import { PR } from "../types";
import { ShareFileModal } from "./ShareFileModal";

interface PRScanPreviewModalProps {
  pr: PR | { number: string; scan_file_url?: string; department?: string };
  onClose: () => void;
}

export function PRScanPreviewModal({ pr, onClose }: PRScanPreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [shareData, setShareData] = useState<{ isOpen: boolean; shareUrl: string } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const scanUrl = pr.scan_file_url || "";
  const isPdf =
    scanUrl.toLowerCase().includes(".pdf") ||
    (scanUrl.toLowerCase().includes("key=") && scanUrl.toLowerCase().includes(".pdf"));

  const handleCreateShareLink = async () => {
    if (!scanUrl) return;
    try {
      const res = await fetch("/api/share-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: scanUrl,
          fileName: `Bản scan PR #${pr.number}`,
          fileType: isPdf ? "application/pdf" : "image/jpeg",
          entityCode: pr.number,
          entityType: "pr",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Không thể tạo link chia sẻ");

      navigator.clipboard.writeText(data.shareUrl);
      setShareData({
        isOpen: true,
        shareUrl: data.shareUrl,
      });
    } catch (err: any) {
      alert(err.message || "Lỗi tạo link chia sẻ");
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const handleResetZoom = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handlePrint = () => {
    if (!scanUrl) return;

    if (isPdf) {
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.focus();
          iframeRef.current.contentWindow.print();
          return;
        } catch {
          // fallback bên dưới
        }
      }
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

  return (
    <div
      className="backdrop no-print"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="modal-panel"
        style={{
          width: "min(1080px, 94vw)",
          maxHeight: "92vh",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: isPdf ? "#fee2e2" : "#e0f2fe",
                color: isPdf ? "#dc2626" : "#0284c7",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isPdf ? <FileText size={20} /> : <ImageIcon size={20} />}
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                Bản scan PR #{pr.number}
              </h3>
              <small style={{ color: "#64748b" }}>
                {pr.department ? `Đơn vị: ${pr.department} · ` : ""}
                Định dạng: <strong>{isPdf ? "PDF Tài liệu" : "Hình ảnh Scan"}</strong>
              </small>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Thanh công cụ Zoom cho ảnh */}
            {!isPdf && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "2px 4px",
                  gap: "2px",
                  marginRight: "6px",
                }}
              >
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: "28px", height: "28px", border: "none", background: "transparent", cursor: "pointer" }}
                  onClick={handleZoomOut}
                  title="Thu nhỏ (-25%)"
                >
                  <ZoomOut size={16} />
                </button>
                <span style={{ fontSize: "12px", fontWeight: 600, minWidth: "44px", textAlign: "center", color: "#334155" }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: "28px", height: "28px", border: "none", background: "transparent", cursor: "pointer" }}
                  onClick={handleZoomIn}
                  title="Phóng to (+25%)"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: "28px", height: "28px", border: "none", background: "transparent", cursor: "pointer" }}
                  onClick={handleRotate}
                  title="Xoay 90 độ"
                >
                  <RotateCw size={16} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: "28px", height: "28px", border: "none", background: "transparent", cursor: "pointer" }}
                  onClick={handleResetZoom}
                  title="Đặt lại kích thước ban đầu"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#eff6ff",
                borderColor: "#bfdbfe",
                color: "#1d4ed8",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              onClick={handleCreateShareLink}
              title="Tạo link chia sẻ cho người khác xem, tải xuống hoặc in trực tiếp"
            >
              <Share2 size={15} /> Chia sẻ
            </button>

            <button
              type="button"
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#2563eb",
                borderColor: "#2563eb",
                color: "#ffffff",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              onClick={handlePrint}
              title="In bản scan này ra máy in hoặc lưu PDF"
            >
              <Printer size={15} /> In bản scan
            </button>

            <a
              href={scanUrl}
              download
              className="btn btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#f8fafc",
                borderColor: "#cbd5e1",
                color: "#334155",
                borderRadius: "6px",
                textDecoration: "none",
              }}
              title="Tải file scan về máy"
            >
              <Download size={15} />
            </a>

            <a
              href={scanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                fontSize: "13px",
                textDecoration: "none",
                borderRadius: "6px",
              }}
              title="Mở file scan trong tab mới"
            >
              <ExternalLink size={15} />
            </a>

            <button
              type="button"
              className="btn-close"
              style={{
                width: "32px",
                height: "32px",
                fontSize: "20px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                borderRadius: "6px",
              }}
              onClick={onClose}
              title="Đóng cửa sổ xem"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body Modal Preview */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#0f172a",
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isPdf ? 0 : "20px",
            minHeight: "500px",
            maxHeight: "calc(92vh - 70px)",
          }}
        >
          {isPdf ? (
            <iframe
              ref={iframeRef}
              src={scanUrl}
              title={`Bản scan PR #${pr.number}`}
              width="100%"
              height="650px"
              style={{
                width: "100%",
                height: "calc(92vh - 75px)",
                minHeight: "550px",
                border: "none",
                backgroundColor: "#ffffff",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "auto",
              }}
            >
              <img
                src={scanUrl}
                alt={`Bản scan PR #${pr.number}`}
                style={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                  borderRadius: "4px",
                  background: "#ffffff",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {shareData && (
        <ShareFileModal
          isOpen={shareData.isOpen}
          onClose={() => setShareData(null)}
          fileName={`Bản scan PR #${pr.number}`}
          shareUrl={shareData.shareUrl}
          entityCode={pr.number}
        />
      )}
    </div>
  );
}
