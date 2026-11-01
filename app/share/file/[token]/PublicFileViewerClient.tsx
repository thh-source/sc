"use client";

import React, { useState, useRef } from "react";
import {
  Download,
  Printer,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ExternalLink,
} from "lucide-react";

interface PublicFileViewerClientProps {
  record: {
    token: string;
    fileName: string;
    fileType: string;
    entityType?: string;
    entityCode?: string;
    fileSize?: number;
    createdAt: string;
    expiresAt: string;
    viewCount: number;
  };
  streamUrl: string;
  downloadUrl: string;
}

export function PublicFileViewerClient({
  record,
  streamUrl,
  downloadUrl,
}: PublicFileViewerClientProps) {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isPdf =
    record.fileType.includes("pdf") ||
    record.fileName.toLowerCase().endsWith(".pdf");

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const handleResetZoom = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handlePrint = () => {
    if (isPdf) {
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.focus();
          iframeRef.current.contentWindow.print();
          return;
        } catch {}
      }
      const printFrame = document.createElement("iframe");
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "none";
      printFrame.src = streamUrl;
      document.body.appendChild(printFrame);
      printFrame.onload = () => {
        try {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        } catch {
          window.open(streamUrl, "_blank");
        }
        setTimeout(() => {
          try {
            document.body.removeChild(printFrame);
          } catch {}
        }, 60000);
      };
    } else {
      window.print();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0f172a",
        color: "#f8fafc",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          background: "#1e293b",
          borderBottom: "1px solid #334155",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: isPdf ? "#ef4444" : "#0ea5e9",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isPdf ? <FileText size={22} /> : <ImageIcon size={22} />}
          </div>
          <div>
            <h1
              style={{
                fontSize: "15.5px",
                fontWeight: 700,
                margin: 0,
                color: "#f8fafc",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>{record.fileName}</span>
              {record.entityCode && (
                <span
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 600,
                    padding: "1px 8px",
                    borderRadius: "4px",
                    backgroundColor: "#334155",
                    color: "#38bdf8",
                  }}
                >
                  #{record.entityCode}
                </span>
              )}
            </h1>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
              <span>Phenikaa Pharma</span> ·{" "}
              <span>{isPdf ? "Tài liệu PDF" : "Hình ảnh Scan"}</span> ·{" "}
              <span>Đã xem {record.viewCount} lượt</span>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {!isPdf && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#0f172a",
                border: "1px solid #475569",
                borderRadius: "8px",
                padding: "2px 6px",
                gap: "4px",
              }}
            >
              <button
                type="button"
                onClick={handleZoomOut}
                title="Thu nhỏ"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  padding: "4px",
                  cursor: "pointer",
                  display: "inline-flex",
                }}
              >
                <ZoomOut size={16} />
              </button>
              <span style={{ fontSize: "12px", fontWeight: 600, minWidth: "40px", textAlign: "center" }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                title="Phóng to"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  padding: "4px",
                  cursor: "pointer",
                  display: "inline-flex",
                }}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                title="Xoay 90 độ"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  padding: "4px",
                  cursor: "pointer",
                  display: "inline-flex",
                }}
              >
                <RotateCw size={16} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="Về ban đầu"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  padding: "4px",
                  cursor: "pointer",
                  display: "inline-flex",
                }}
              >
                <Maximize2 size={16} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              fontSize: "13px",
              fontWeight: 600,
              background: copied ? "#059669" : "#334155",
              color: "#ffffff",
              border: "1px solid #475569",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="Sao chép liên kết chia sẻ để gửi cho người khác"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? "Đã sao chép!" : "Sao chép link"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              fontSize: "13px",
              fontWeight: 600,
              background: "#3b82f6",
              color: "#ffffff",
              border: "1px solid #2563eb",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="In tài liệu ra máy in hoặc lưu PDF"
          >
            <Printer size={16} />
            <span>In tài liệu</span>
          </button>

          <a
            href={downloadUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              fontSize: "13px",
              fontWeight: 600,
              background: "#10b981",
              color: "#ffffff",
              border: "1px solid #059669",
              borderRadius: "8px",
              textDecoration: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="Tải file gốc về máy"
          >
            <Download size={16} />
            <span>Tải xuống</span>
          </a>
        </div>
      </header>

      {/* Main View Area */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          overflow: "auto",
        }}
      >
        {isPdf ? (
          <div
            style={{
              width: "100%",
              maxWidth: "1000px",
              height: "calc(100vh - 110px)",
              background: "#ffffff",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            }}
          >
            <iframe
              ref={iframeRef}
              src={streamUrl}
              title={record.fileName}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              overflow: "auto",
              padding: "20px",
            }}
          >
            <img
              src={streamUrl}
              alt={record.fileName}
              style={{
                maxWidth: "92vw",
                maxHeight: "82vh",
                objectFit: "contain",
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                transition: "transform 0.15s ease-out",
                borderRadius: "8px",
                boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
                backgroundColor: "#ffffff",
              }}
            />
          </div>
        )}
      </main>

      {/* Printable Style for clean paper printing */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              header { display: none !important; }
              main { padding: 0 !important; background: #ffffff !important; }
              img { max-width: 100% !important; max-height: 100% !important; box-shadow: none !important; }
              iframe { width: 100vw !important; height: 100vh !important; }
            }
          `,
        }}
      />
    </div>
  );
}
