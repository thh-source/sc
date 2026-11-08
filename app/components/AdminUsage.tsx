import React from "react";
import { fmt } from "../utils";

export function AdminUsage({
  usage,
  onRefresh,
}: {
  usage: {
    generatedAt: string;
    freeTier: {
      d1Bytes: number;
      r2Bytes: number;
      d1RowsReadPerDay: number;
      d1RowsWrittenPerDay: number;
      r2ClassAOperationsPerMonth: number;
      r2ClassBOperationsPerMonth: number;
    };
    d1: {
      estimatedBytes: number;
      remainingBytes: number;
      usedPercent: number;
      stateRecords: number;
      users: number;
      updatedAt: string | null;
    };
    r2: {
      estimatedBytes: number;
      remainingBytes: number;
      usedPercent: number;
      fileCount: number;
      updatedAt: string | null;
      breakdown?: {
        prScans: { count: number; bytes: number };
        vault: { count: number; bytes: number };
        snapshots: { count: number; bytes: number };
        cache: { count: number; bytes: number };
        other: { count: number; bytes: number };
      };
    };
  } | null;
  onRefresh: () => void;
}) {
  const size = (bytes: number) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };
  const percent = (value = 0) => Math.min(100, Math.max(0, value));
  return (
    <section className="admin-card usage-card">
      <div className="section-heading">
        <div>
          <span>☁</span>
          <h2>Lưu trữ & hạn mức Cloudflare</h2>
        </div>
        <button onClick={onRefresh}>Cập nhật</button>
      </div>
      {usage ? (
        <>
          <div className="usage-grid">
            <article>
              <div>
                <b>D1 Database</b>
                <small>Dữ liệu PR, PO, hợp đồng, tài khoản</small>
              </div>
              <strong>{size(usage.d1.estimatedBytes)}</strong>
              <div className="usage-bar">
                <i style={{ width: `${percent(usage.d1.usedPercent)}%` }} />
              </div>
              <footer>
                <span>{usage.d1.usedPercent.toFixed(4)}% free tier</span>
                <b>Còn {size(usage.d1.remainingBytes)} / {size(usage.freeTier.d1Bytes)}</b>
              </footer>
              <p>
                {usage.d1.stateRecords} workspace · {usage.d1.users} tài khoản ·
                đọc miễn phí {fmt(usage.freeTier.d1RowsReadPerDay)} rows/ngày ·
                ghi miễn phí {fmt(usage.freeTier.d1RowsWrittenPerDay)} rows/ngày
              </p>
            </article>
            <article>
              <div>
                <b>R2 Bucket</b>
                <small>File hồ sơ upload, PDF, Excel, ảnh</small>
              </div>
              <strong>{size(usage.r2.estimatedBytes)}</strong>
              <div className="usage-bar">
                <i style={{ width: `${percent(usage.r2.usedPercent)}%` }} />
              </div>
              <footer>
                <span>{usage.r2.usedPercent.toFixed(4)}% free tier</span>
                <b>Còn {size(usage.r2.remainingBytes)} / {size(usage.freeTier.r2Bytes)}</b>
              </footer>
              <p>
                {usage.r2.fileCount} file · upload/list miễn phí{" "}
                {fmt(usage.freeTier.r2ClassAOperationsPerMonth)} request/tháng ·
                đọc/download miễn phí {fmt(usage.freeTier.r2ClassBOperationsPerMonth)} request/tháng
              </p>
              {usage.r2.breakdown && usage.r2.fileCount > 0 && (
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px", lineHeight: "1.45", background: "#f8fafc", padding: "4px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <b style={{ color: "#334155" }}>Chi tiết lưu trữ:</b>{" "}
                  {usage.r2.breakdown.prScans.count > 0 && (
                    <span><b>{usage.r2.breakdown.prScans.count}</b> bản scan PR ({size(usage.r2.breakdown.prScans.bytes)}) · </span>
                  )}
                  {usage.r2.breakdown.vault.count > 0 && (
                    <span><b>{usage.r2.breakdown.vault.count}</b> file kho ({size(usage.r2.breakdown.vault.bytes)}) · </span>
                  )}
                  {usage.r2.breakdown.snapshots.count > 0 && (
                    <span><b>{usage.r2.breakdown.snapshots.count}</b> bản sao lưu snapshot ({size(usage.r2.breakdown.snapshots.bytes)}) · </span>
                  )}
                  {usage.r2.breakdown.cache.count > 0 && (
                    <span><b>{usage.r2.breakdown.cache.count}</b> đệm cache ({size(usage.r2.breakdown.cache.bytes)}) · </span>
                  )}
                  {usage.r2.breakdown.other.count > 0 && (
                    <span><b>{usage.r2.breakdown.other.count}</b> file khác ({size(usage.r2.breakdown.other.bytes)})</span>
                  )}
                </div>
              )}
            </article>
          </div>
          <div className="usage-note">
            <b>Ước tính “đếm lùi”:</b> hệ thống đang còn xa ngưỡng phải trả tiền.
            Free tier của Cloudflare không hết theo ngày; Cloudflare chỉ bắt đầu tính phí khi vượt hạn mức hoặc chuyển sang gói paid.
            Số liệu này tính theo dữ liệu app và bảng file hiện tại, chưa phải hóa đơn billing chính thức.
          </div>
        </>
      ) : (
        <p className="usage-empty">Chưa tải được thống kê Cloudflare.</p>
      )}
    </section>
  );
}

