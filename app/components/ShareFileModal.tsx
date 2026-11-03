"use client";

import React, { useState } from "react";
import { Copy, Check, ExternalLink, X, Share2, ShieldCheck } from "lucide-react";

interface ShareFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  shareUrl: string;
  entityCode?: string;
}

export function ShareFileModal({
  isOpen,
  onClose,
  fileName,
  shareUrl,
  entityCode,
}: ShareFileModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "#eff6ff",
                color: "#2563eb",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Share2 size={18} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                Chia sẻ tài liệu đính kèm
              </h3>
              <small style={{ color: "#64748b" }}>
                {entityCode ? `Mã: ${entityCode} · ` : ""}Tạo link công khai an toàn
              </small>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              padding: "4px",
              display: "inline-flex",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              marginBottom: "16px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
              Tài liệu được chia sẻ:
            </div>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px", wordBreak: "break-all" }}>
              📄 {fileName}
            </div>
          </div>

          <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 600, color: "#334155" }}>
            Đường dẫn xem trực tiếp, tải xuống &amp; in ấn:
          </label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input
              type="text"
              readOnly
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                backgroundColor: "#f1f5f9",
                color: "#0f172a",
                fontFamily: "monospace",
              }}
            />
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 16px",
                borderRadius: "8px",
                backgroundColor: copied ? "#059669" : "#2563eb",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? "Đã chép!" : "Sao chép"}</span>
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "12px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px",
              color: "#166534",
              fontSize: "12.5px",
              lineHeight: 1.5,
            }}
          >
            <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: "2px", color: "#16a34a" }} />
            <div>
              <strong>Quyền truy cập công khai:</strong> Người nhận link có thể xem ngay trên điện thoại hoặc máy tính, tải file gốc về máy hoặc in tài liệu mà <strong>không cần phải có tài khoản đăng nhập</strong> vào hệ thống.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#2563eb",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <ExternalLink size={15} /> Mở thử giao diện người nhận
          </a>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#475569",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
