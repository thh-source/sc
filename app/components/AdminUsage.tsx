import React, { useState } from "react";
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
        apk?: { count: number; bytes: number };
        updates?: { count: number; bytes: number };
        backups?: { count: number; bytes: number };
        docs?: { count: number; bytes: number };
        other: { count: number; bytes: number };
      };
      items?: {
        key: string;
        size: number;
        category: string;
        uploadedAt?: string;
      }[];
    };
  } | null;
  onRefresh: () => void;
}) {
  const [showFileList, setShowFileList] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [cleanLoading, setCleanLoading] = useState(false);
  const [cleanMsg, setCleanMsg] = useState("");

  const size = (bytes: number) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };
  const percent = (value = 0) => Math.min(100, Math.max(0, value));

  const handleAutoClean = async () => {
    if (
      !window.confirm(
        "Hệ thống sẽ tự động quét và xóa các tài liệu không cần lưu:\n- File đệm xem trước CamScanner tạm thời\n- Các gói nén OTA cũ (chỉ giữ lại bản mới nhất v1.1.3)\n- Các bản backup mã nguồn thủ công cũ\n- File tài liệu đặc tả tĩnh (đã có trong Git)\n\nBạn có chắc muốn tự động dọn dẹp ngay bây giờ?"
      )
    ) {
      return;
    }
    setCleanLoading(true);
    setCleanMsg("");
    try {
      const res = await fetch("/api/admin/cleanup", { method: "POST" });
      const data: any = await res.json();
      if (data.success) {
        setCleanMsg(
          `✓ Đã tự động dọn sạch ${data.deletedCount} file thừa, giải phóng ${size(
            data.freedBytes
          )}!`
        );
        onRefresh();
      } else {
        setCleanMsg(data.error || "Không thể dọn dẹp file");
      }
    } catch {
      setCleanMsg("Lỗi kết nối khi dọn dẹp");
    } finally {
      setCleanLoading(false);
    }
  };

  const items = usage?.r2?.items || [];
  const filteredItems = items.filter((it) => {
    if (filterCategory !== "all" && it.category !== filterCategory) return false;
    if (searchKeyword.trim() && !it.key.toLowerCase().includes(searchKeyword.toLowerCase().trim())) {
      return false;
    }
    return true;
  });
  return (
    <section className="admin-card usage-card">
      <div className="section-heading">
        <div>
          <span>☁</span>
          <h2>Lưu trữ & hạn mức Cloudflare</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => void handleAutoClean()}
            disabled={cleanLoading}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 700,
              borderRadius: "6px",
              border: "1px solid #0f766e",
              background: "#0d9488",
              color: "#ffffff",
              cursor: cleanLoading ? "wait" : "pointer",
            }}
          >
            {cleanLoading ? "Đang dọn dẹp..." : "🧹 Dọn dẹp file thừa"}
          </button>
          <button onClick={onRefresh}>Cập nhật</button>
        </div>
      </div>
      {cleanMsg && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: "12px",
            borderRadius: "7px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            color: "#166534",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {cleanMsg}
        </div>
      )}
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
                <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "6px", lineHeight: "1.5", background: "#f8fafc", padding: "6px 10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                    <div>
                      <b style={{ color: "#334155" }}>Phân loại R2:</b>{" "}
                      {usage.r2.breakdown.prScans.count > 0 && (
                        <span><b>{usage.r2.breakdown.prScans.count}</b> scan PR ({size(usage.r2.breakdown.prScans.bytes)}) · </span>
                      )}
                      {usage.r2.breakdown.apk && usage.r2.breakdown.apk.count > 0 && (
                        <span><b style={{ color: "#0369a1" }}>{usage.r2.breakdown.apk.count}</b> bộ cài APK ({size(usage.r2.breakdown.apk.bytes)}) · </span>
                      )}
                      {usage.r2.breakdown.updates && usage.r2.breakdown.updates.count > 0 && (
                        <span><b>{usage.r2.breakdown.updates.count}</b> gói OTA ({size(usage.r2.breakdown.updates.bytes)}) · </span>
                      )}
                      {usage.r2.breakdown.backups && usage.r2.breakdown.backups.count > 0 && (
                        <span><b>{usage.r2.breakdown.backups.count}</b> sao lưu hệ thống ({size(usage.r2.breakdown.backups.bytes)}) · </span>
                      )}
                      {usage.r2.breakdown.snapshots.count > 0 && (
                        <span><b>{usage.r2.breakdown.snapshots.count}</b> snapshot CSDL ({size(usage.r2.breakdown.snapshots.bytes)}) · </span>
                      )}
                      {usage.r2.breakdown.vault.count > 0 && (
                        <span><b>{usage.r2.breakdown.vault.count}</b> kho ({size(usage.r2.breakdown.vault.bytes)}) · </span>
                      )}
                      {usage.r2.breakdown.docs && usage.r2.breakdown.docs.count > 0 && (
                        <span><b>{usage.r2.breakdown.docs.count}</b> tài liệu kỹ thuật ({size(usage.r2.breakdown.docs.bytes)}) · </span>
                      )}
                      {usage.r2.breakdown.other && usage.r2.breakdown.other.count > 0 && (
                        <span style={{ color: "#d97706" }}><b>{usage.r2.breakdown.other.count}</b> file khác ({size(usage.r2.breakdown.other.bytes)})</span>
                      )}
                    </div>

                    {items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowFileList((prev) => !prev)}
                        style={{
                          padding: "3px 8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          borderRadius: "5px",
                          border: "1px solid #cbd5e1",
                          background: showFileList ? "#e2e8f0" : "#ffffff",
                          color: "#1e293b",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {showFileList ? "▲ Đóng danh sách" : `🔍 Xem chi tiết ${items.length} file`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          </div>

          {/* Bảng danh sách chi tiết toàn bộ các file trên Cloudflare R2 */}
          {showFileList && items.length > 0 && (
            <div
              style={{
                marginTop: "12px",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                padding: "12px",
                boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h4 style={{ margin: 0, fontSize: "13.5px", fontWeight: 800, color: "#0f172a" }}>
                    Danh sách chi tiết toàn bộ {items.length} file trên Cloudflare R2
                  </h4>
                  <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                    (Tổng: {size(usage.r2.estimatedBytes)})
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Lọc tên file / đường dẫn..."
                    style={{
                      height: "28px",
                      padding: "0 8px",
                      fontSize: "11.5px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      outline: "none",
                      width: "180px",
                    }}
                  />
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    style={{
                      height: "28px",
                      padding: "0 6px",
                      fontSize: "11.5px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      color: "#334155",
                    }}
                  >
                    <option value="all">Tất cả danh mục</option>
                    <option value="Bản scan PR / chứng từ">Scan PR / chứng từ</option>
                    <option value="Bộ cài đặt APK Android">Bộ cài APK Android</option>
                    <option value="Gói cập nhật OTA (.zip)">Gói cập nhật OTA</option>
                    <option value="Bản sao lưu snapshot">Bản sao lưu CSDL</option>
                    <option value="Kho dữ liệu (Data Vault)">Kho dữ liệu</option>
                    <option value="File khác">File khác</option>
                  </select>
                </div>
              </div>

              <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                      <th style={{ padding: "6px 8px", width: "36px", textAlign: "center" }}>#</th>
                      <th style={{ padding: "6px 8px" }}>Tên file / Khóa lưu trữ (Key)</th>
                      <th style={{ padding: "6px 8px", width: "150px" }}>Phân loại</th>
                      <th style={{ padding: "6px 8px", width: "90px", textAlign: "right" }}>Dung lượng</th>
                      <th style={{ padding: "6px 8px", width: "130px", textAlign: "center" }}>Ngày tải lên</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it, idx) => (
                      <tr key={it.key} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fcfdfe" }}>
                        <td style={{ padding: "5px 8px", textAlign: "center", color: "#94a3b8" }}>{idx + 1}</td>
                        <td style={{ padding: "5px 8px", fontWeight: 600, color: "#0f172a", wordBreak: "break-all" }}>
                          <code>{it.key}</code>
                        </td>
                        <td style={{ padding: "5px 8px", color: "#475569" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              background: it.category.includes("APK")
                                ? "#e0f2fe"
                                : it.category.includes("scan")
                                ? "#f0fdfa"
                                : it.category.includes("sao lưu")
                                ? "#fef3c7"
                                : "#f1f5f9",
                              color: it.category.includes("APK")
                                ? "#0369a1"
                                : it.category.includes("scan")
                                ? "#0f766e"
                                : it.category.includes("sao lưu")
                                ? "#b45309"
                                : "#475569",
                            }}
                          >
                            {it.category}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                          {size(it.size)}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "center", color: "#64748b" }}>
                          {it.uploadedAt ? new Date(it.uploadedAt).toLocaleString("vi-VN") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

