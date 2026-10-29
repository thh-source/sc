import React from "react";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, CloudOff } from "lucide-react";

interface OfflineSyncBannerProps {
  isOnline: boolean;
  isSyncing: boolean;
  queueCount: number;
  lastSyncStatus: "idle" | "syncing" | "success" | "error";
  syncMessage: string;
  onTriggerSync?: () => void;
}

export const OfflineSyncBanner: React.FC<OfflineSyncBannerProps> = ({
  isOnline,
  isSyncing,
  queueCount,
  lastSyncStatus,
  syncMessage,
  onTriggerSync,
}) => {
  // Chỉ hiển thị banner khi:
  // 1. Ngoại tuyến (!isOnline)
  // 2. Đang đồng bộ (isSyncing)
  // 3. Có hàng đợi chờ đồng bộ (queueCount > 0)
  // 4. Vừa đồng bộ thành công hoặc gặp lỗi (lastSyncStatus === 'success' | 'error')
  const shouldShow =
    !isOnline ||
    isSyncing ||
    queueCount > 0 ||
    lastSyncStatus === "success" ||
    lastSyncStatus === "error";

  if (!shouldShow) return null;

  // Xác định màu sắc & icon theo trạng thái
  let bgStyle: React.CSSProperties = { background: "#d97706", borderColor: "#f59e0b", color: "#ffffff" };
  let icon = <WifiOff size={18} className="animate-pulse flex-shrink-0" />;
  let title = "Đang mất kết nối mạng - Đã bật chế độ tự lưu Offline an toàn";

  if (!isOnline) {
    bgStyle = { background: "#d97706", borderColor: "#f59e0b", color: "#ffffff" };
    icon = <WifiOff size={18} className="animate-pulse flex-shrink-0" />;
    title = syncMessage || "⚠️ Đang mất kết nối mạng - Đã bật chế độ tự lưu Offline an toàn";
  } else if (isSyncing) {
    bgStyle = { background: "#2563eb", borderColor: "#60a5fa", color: "#ffffff" };
    icon = <RefreshCw size={18} className="animate-spin flex-shrink-0" />;
    title = syncMessage || "🔄 Đã kết nối lại - Đang tự động đồng bộ dữ liệu lên hệ thống...";
  } else if (lastSyncStatus === "success") {
    bgStyle = { background: "#059669", borderColor: "#34d399", color: "#ffffff" };
    icon = <CheckCircle2 size={18} className="flex-shrink-0" />;
    title = syncMessage || "✅ Đồng bộ thành công!";
  } else if (lastSyncStatus === "error") {
    bgStyle = { background: "#e11d48", borderColor: "#fb7185", color: "#ffffff" };
    icon = <AlertTriangle size={18} className="flex-shrink-0" />;
    title = syncMessage || "⚠️ Lỗi khi đồng bộ dữ liệu offline";
  } else if (queueCount > 0) {
    bgStyle = { background: "#d97706", borderColor: "#f59e0b", color: "#ffffff" };
    icon = <CloudOff size={18} className="flex-shrink-0" />;
    title = `Đang có ${queueCount} tác vụ chờ đồng bộ lên D1`;
  }

  return (
    <div
      className="offline-sync-banner-container no-print"
      style={{
        position: "fixed",
        zIndex: 9999,
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        right: "16px",
        maxWidth: "min(92vw, 480px)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 16px",
        borderRadius: "12px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        border: "1px solid",
        backdropFilter: "blur(4px)",
        fontSize: "13px",
        fontWeight: 500,
        ...bgStyle,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
        {icon}
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", fontSize: "13px", fontWeight: 700 }}>
            {title}
          </span>
          {queueCount > 0 && !isSyncing && (
            <span style={{ fontSize: "11px", opacity: 0.9, display: "block" }}>
              {queueCount} thay đổi được lưu trữ an toàn trong IndexedDB
            </span>
          )}
        </div>
      </div>

      {isOnline && !isSyncing && queueCount > 0 && onTriggerSync && (
        <button
          onClick={onTriggerSync}
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: 700,
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.25)",
            color: "#ffffff",
            border: "none",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
          title="Thực hiện đồng bộ ngay"
        >
          Đồng bộ ngay
        </button>
      )}
    </div>
  );
};
