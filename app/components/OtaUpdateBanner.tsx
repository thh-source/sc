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
        className="no-print"
        style={{
          position: "fixed",
          zIndex: 9998,
          bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
          right: "16px",
          maxWidth: "min(92vw, 450px)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          borderRadius: "12px",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          border: "1px solid #60a5fa",
          fontSize: "13px",
          fontWeight: 600,
        }}
        role="status"
      >
        <RefreshCw size={17} className="animate-spin flex-shrink-0" />
        <span style={{ fontSize: "13px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Đang tải bản cập nhật v{otaState.latestVersion} ngầm...
        </span>
      </div>
    );
  }

  if (otaState.updateReady) {
    return (
      <div
        className="no-print"
        style={{
          position: "fixed",
          zIndex: 9998,
          bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
          right: "16px",
          maxWidth: "min(92vw, 480px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "10px 16px",
          borderRadius: "12px",
          backgroundColor: "#059669",
          color: "#ffffff",
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          border: "1px solid #34d399",
          fontSize: "13px",
          fontWeight: 600,
        }}
        role="alert"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <Sparkles size={18} style={{ color: "#fef08a", flexShrink: 0 }} />
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ display: "block", fontSize: "13px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
              Đã sẵn sàng phiên bản mới v{otaState.latestVersion}!
            </span>
            <span style={{ fontSize: "11px", opacity: 0.9, display: "block" }}>
              Sẽ áp dụng trong lần mở tiếp theo
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={onApplyAndRestart}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              fontSize: "11px",
              fontWeight: 800,
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              color: "#065f46",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            <ArrowUpCircle size={14} /> Khởi động lại
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
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
