import React from "react";
import { getFileShareRecord } from "../../../share-file";
import { PublicFileViewerClient } from "./PublicFileViewerClient";

export const dynamic = "force-dynamic";

export default async function PublicFileSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const record = await getFileShareRecord(token, true);

  if (!record) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f1f5f9",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "20px",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            background: "#ffffff",
            padding: "36px 28px",
            borderRadius: "16px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#fee2e2",
              color: "#dc2626",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              fontWeight: 800,
              marginBottom: "16px",
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: "19px", fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>
            Link tài liệu không tồn tại hoặc đã hết hạn
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.5, margin: "0 0 24px" }}>
            Đường dẫn chia sẻ này có thể đã bị xóa, hết thời hạn hiệu lực (60 ngày) hoặc nhập chưa đúng. Vui lòng liên hệ người gửi để nhận link mới.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              textDecoration: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            Về trang chủ hệ thống
          </a>
        </div>
      </main>
    );
  }

  const streamUrl = `/api/share-file/stream?token=${record.token}`;
  const downloadUrl = `/api/share-file/stream?token=${record.token}&download=1`;

  return (
    <PublicFileViewerClient
      record={{
        token: record.token,
        fileName: record.file_name,
        fileType: record.file_type,
        entityType: record.entity_type,
        entityCode: record.entity_code,
        fileSize: record.file_size,
        createdAt: record.created_at,
        expiresAt: record.expires_at,
        viewCount: record.view_count,
      }}
      streamUrl={streamUrl}
      downloadUrl={downloadUrl}
    />
  );
}
