// app/components/ConflictModal.tsx
"use client";

import React from "react";

export interface ConflictModalProps {
  conflict: {
    serverVersion: number;
    time: string;
  };
  onReload: () => void;
  onOverwrite: () => void;
}

export function ConflictModal({ conflict, onReload, onOverwrite }: ConflictModalProps) {
  return (
    <div
      className="backdrop modal-overlay no-print"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 99999,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="modal-card"
        style={{
          maxWidth: "540px",
          width: "100%",
          padding: "24px",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          border: "1px solid #fed7aa",
          background: "#ffffff",
          position: "relative",
        }}
      >
        <button
          onClick={onReload}
          style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "#64748b",
            padding: "4px",
          }}
          title="Đóng"
        >
          ✕
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
          <span style={{ fontSize: "2.2rem", lineHeight: 1 }}>⚠️</span>
          <div>
            <h3 style={{ margin: 0, color: "#9a3412", fontSize: "1.2rem", fontWeight: 700 }}>
              Xung đột dữ liệu phiên làm việc
            </h3>
            <small style={{ color: "#64748b" }}>
              Phát hiện lúc {conflict.time} (Phiên bản máy chủ: #{conflict.serverVersion})
            </small>
          </div>
        </div>
        <p style={{ fontSize: "0.95rem", lineHeight: "1.6", color: "#334155", margin: "0 0 20px 0" }}>
          Dữ liệu trên máy chủ đã được lưu bởi một phiên làm việc hoặc thiết bị khác trong khi bạn đang thao tác.
          Để bảo vệ toàn vẹn dữ liệu, hệ thống đã tạm dừng tự động lưu. Vui lòng chọn cách xử lý:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            className="btn primary"
            style={{
              background: "#2563eb",
              color: "#fff",
              padding: "12px 16px",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "none",
            }}
            onClick={onReload}
          >
            <span>🔄 Tải lại dữ liệu mới nhất từ máy chủ</span>
            <span style={{ fontSize: "0.8rem", opacity: 0.85 }}>(Khuyến nghị)</span>
          </button>
          <button
            type="button"
            className="btn secondary"
            style={{
              background: "#fff",
              color: "#b91c1c",
              border: "1px solid #fca5a5",
              padding: "12px 16px",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              textAlign: "left",
            }}
            onClick={onOverwrite}
          >
            ⚡ Ghi đè máy chủ bằng dữ liệu hiện tại trên máy này
          </button>
        </div>
      </div>
    </div>
  );
}
