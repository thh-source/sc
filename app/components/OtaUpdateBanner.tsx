import React from "react";
import { Sparkles, RefreshCw, X, ArrowUpCircle } from "lucide-react";
import { OtaState } from "../utils/otaUpdateService";

interface OtaUpdateBannerProps {
  otaState: OtaState;
  visible: boolean;
  onApplyAndRestart: () => void;
  onDismiss: () => void;
}

export const OtaUpdateBanner: React.FC<OtaUpdateBannerProps> = ({
  otaState,
  visible,
  onApplyAndRestart,
  onDismiss,
}) => {
  if (!visible) return null;

  if (otaState.isDownloading) {
    return (
      <div
        className="fixed z-[9998] transition-all duration-300 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg border backdrop-blur-sm text-sm font-medium bg-blue-600/95 text-white border-blue-400"
        style={{
          bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
          right: "16px",
          maxWidth: "min(92vw, 450px)",
        }}
        role="status"
      >
        <RefreshCw size={17} className="animate-spin flex-shrink-0" />
        <span className="text-xs sm:text-sm font-semibold truncate">
          Đang tải bản cập nhật v{otaState.latestVersion} ngầm...
        </span>
      </div>
    );
  }

  if (otaState.updateReady) {
    return (
      <div
        className="fixed z-[9998] transition-all duration-300 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl shadow-xl border backdrop-blur-sm text-sm font-medium bg-emerald-600/95 text-white border-emerald-400"
        style={{
          bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
          right: "16px",
          maxWidth: "min(92vw, 480px)",
        }}
        role="alert"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles size={18} className="text-amber-300 flex-shrink-0 animate-bounce" />
          <div className="truncate">
            <span className="block text-xs sm:text-sm font-bold truncate">
              Đã sẵn sàng phiên bản mới v{otaState.latestVersion}!
            </span>
            <span className="text-[11px] opacity-90 block">
              Sẽ áp dụng trong lần mở tiếp theo
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onApplyAndRestart}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 active:scale-95 shadow transition-all uppercase tracking-wider"
          >
            <ArrowUpCircle size={14} /> Khởi động lại
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-white/20 active:bg-white/30 text-white/80 hover:text-white transition-colors"
            title="Đóng thông báo"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
