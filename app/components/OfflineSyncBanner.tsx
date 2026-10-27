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
  let bgClass = "bg-amber-500/95 text-white border-amber-400";
  let icon = <WifiOff size={18} className="animate-pulse flex-shrink-0" />;
  let title = "Đang mất kết nối mạng - Đã bật chế độ tự lưu Offline an toàn";

  if (!isOnline) {
    bgClass = "bg-amber-600/95 text-white border-amber-500 shadow-amber-900/30";
    icon = <WifiOff size={18} className="animate-pulse flex-shrink-0" />;
    title = syncMessage || "⚠️ Đang mất kết nối mạng - Đã bật chế độ tự lưu Offline an toàn";
  } else if (isSyncing) {
    bgClass = "bg-blue-600/95 text-white border-blue-400 shadow-blue-900/30";
    icon = <RefreshCw size={18} className="animate-spin flex-shrink-0" />;
    title = syncMessage || "🔄 Đã kết nối lại - Đang tự động đồng bộ dữ liệu lên hệ thống...";
  } else if (lastSyncStatus === "success") {
    bgClass = "bg-emerald-600/95 text-white border-emerald-400 shadow-emerald-900/30";
    icon = <CheckCircle2 size={18} className="flex-shrink-0" />;
    title = syncMessage || "✅ Đồng bộ thành công!";
  } else if (lastSyncStatus === "error") {
    bgClass = "bg-rose-600/95 text-white border-rose-400 shadow-rose-900/30";
    icon = <AlertTriangle size={18} className="flex-shrink-0" />;
    title = syncMessage || "⚠️ Lỗi khi đồng bộ dữ liệu offline";
  } else if (queueCount > 0) {
    bgClass = "bg-amber-600/95 text-white border-amber-400 shadow-amber-900/30";
    icon = <CloudOff size={18} className="flex-shrink-0" />;
    title = `Đang có ${queueCount} tác vụ chờ đồng bộ lên D1`;
  }

  return (
    <div
      className={`fixed z-[9999] transition-all duration-300 ease-in-out transform flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg border backdrop-blur-sm text-sm font-medium ${bgClass}`}
      style={{
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        right: "16px",
        maxWidth: "min(92vw, 480px)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {icon}
        <div className="truncate">
          <span className="block truncate text-xs sm:text-sm font-semibold">{title}</span>
          {queueCount > 0 && !isSyncing && (
            <span className="text-[11px] opacity-90 block">
              {queueCount} thay đổi được lưu trữ an toàn trong IndexedDB
            </span>
          )}
        </div>
      </div>

      {isOnline && !isSyncing && queueCount > 0 && onTriggerSync && (
        <button
          onClick={onTriggerSync}
          className="flex-shrink-0 px-2.5 py-1 text-xs font-bold rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 transition-colors uppercase tracking-wider"
          title="Thực hiện đồng bộ ngay"
        >
          Đồng bộ ngay
        </button>
      )}
    </div>
  );
};
