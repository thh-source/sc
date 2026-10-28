"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Settings,
  X,
  Globe,
  Share2,
  Copy,
  Check,
  ExternalLink,
  Printer,
  ShieldCheck,
  Loader2,
  Smartphone,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Hash,
  Sparkles,
  RotateCw,
} from "lucide-react";
import { useTranslation, SupportedLang } from "../i18n";
import { CURRENT_APP_VERSION, getAppPlatform } from "../version";
import {
  fetchRemoteVersion,
  getInstalledVersion,
  isNewerVersion,
  downloadAndApplyOta,
  reloadApp,
  AppVersionInfo,
} from "../utils/otaUpdateService";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  } | null;
  onOpenPrintTemplates?: () => void;
  onOpenAdminSettings?: () => void;
  onStatus?: (msg: string) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  currentUser,
  onOpenPrintTemplates,
  onOpenAdminSettings,
  onStatus,
}: SettingsModalProps) {
  const { lang, setLang, supportedLangs, t } = useTranslation();

  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Version & OTA Update State
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [downloadingOta, setDownloadingOta] = useState(false);
  const [otaReady, setOtaReady] = useState(false);
  const [installedVersion, setInstalledVersion] = useState(CURRENT_APP_VERSION.version);
  const [updateResult, setUpdateResult] = useState<{
    checked: boolean;
    hasUpdate: boolean;
    remoteInfo?: AppVersionInfo;
    error?: string;
  } | null>(null);

  const platform = useMemo(() => getAppPlatform(), []);

  useEffect(() => {
    let active = true;
    getInstalledVersion().then((v) => {
      if (active && v) setInstalledVersion(v);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingVersion(true);
    setUpdateResult(null);
    onStatus?.("Đang kiểm tra phiên bản mới từ máy chủ Cloudflare...");

    try {
      const remote = await fetchRemoteVersion();
      const hasUpdate = isNewerVersion(remote.latestVersion, installedVersion);

      setUpdateResult({
        checked: true,
        hasUpdate,
        remoteInfo: remote,
      });

      if (hasUpdate) {
        onStatus?.(`Phát hiện bản cập nhật mới v${remote.latestVersion}!`);
      } else {
        onStatus?.(`Bạn đang dùng bản mới nhất (v${installedVersion})`);
      }
    } catch (err: any) {
      console.error("Lỗi kiểm tra cập nhật:", err);
      setUpdateResult({
        checked: true,
        hasUpdate: false,
        error: "Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.",
      });
      onStatus?.("Không thể kiểm tra phiên bản");
    } finally {
      setCheckingVersion(false);
    }
  };

  const handleDownloadAndApply = async () => {
    if (!updateResult?.remoteInfo) return;
    setDownloadingOta(true);
    onStatus?.(`Đang tải gói cập nhật v${updateResult.remoteInfo.latestVersion}...`);

    try {
      const ok = await downloadAndApplyOta(updateResult.remoteInfo, (state) => {
        if (state.updateReady) {
          setOtaReady(true);
        }
      });
      if (ok) {
        setOtaReady(true);
        onStatus?.("Đã cài đặt bản cập nhật mới thành công!");
      }
    } catch (err: any) {
      alert("Lỗi khi tải bản cập nhật: " + (err.message || "Không xác định"));
    } finally {
      setDownloadingOta(false);
    }
  };

  if (!isOpen) return null;

  const handleCreateShareLink = async () => {
    setShareLoading(true);
    onStatus?.("Đang tạo link báo cáo theo dõi...");
    try {
      const response = await fetch("/api/share", { method: "POST" });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { token: string };
      const url = `${window.location.origin}/report/${encodeURIComponent(body.token)}`;
      setShareLink(url);
      onStatus?.("Đã tạo link báo cáo thành công");
    } catch {
      onStatus?.("Không thể tạo link báo cáo");
      alert("Không thể tạo liên kết theo dõi. Vui lòng kiểm tra lại kết nối máy chủ.");
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const isAdmin = currentUser?.role === "master" || currentUser?.role === "admin";

  return (
    <div
      className="backdrop"
      style={{
        zIndex: 10000,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        style={{
          width: "min(560px, 94vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          boxShadow: "0 20px 40px -10px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.08)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            borderBottom: "1px solid #f1f5f9",
            paddingBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                backgroundColor: "#e0f2fe",
                color: "#0284c7",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Settings size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                Cài đặt & Tiện ích hệ thống
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                Tùy chỉnh ngôn ngữ hiển thị, tạo liên kết theo dõi và cấu hình in ấn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Đóng cửa sổ"
          >
            <X size={20} />
          </button>
        </div>

        {/* Section 1: Ngôn ngữ giao diện */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            padding: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Globe size={16} style={{ color: "#2563eb" }} />
            <h3 style={{ fontSize: "14px", fontWeight: 650, margin: 0, color: "#1e293b" }}>
              Ngôn ngữ giao diện (Display Language)
            </h3>
          </div>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px" }}>
            Hệ thống hỗ trợ chuyển đổi đa ngôn ngữ tức thì mà không cần tải lại trang:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {supportedLangs.map((item) => {
              const isActive = item.code === lang;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setLang(item.code as SupportedLang)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 8px",
                    borderRadius: "8px",
                    border: isActive ? "2px solid #2563eb" : "1px solid #cbd5e1",
                    backgroundColor: isActive ? "#eff6ff" : "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{item.flag}</span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? "#1d4ed8" : "#334155",
                    }}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#2563eb",
                        backgroundColor: "#dbeafe",
                        padding: "1px 6px",
                        borderRadius: "10px",
                      }}
                    >
                      ✓ Đang dùng
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Tạo liên kết theo dõi (Share Report Link) */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            padding: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Share2 size={16} style={{ color: "#059669" }} />
            <h3 style={{ fontSize: "14px", fontWeight: 650, margin: 0, color: "#1e293b" }}>
              Liên kết theo dõi báo cáo mua hàng
            </h3>
          </div>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px" }}>
            Tạo đường dẫn chỉ xem (Read-only) bảo mật để Ban Giám đốc hoặc các phòng ban theo dõi tiến độ:
          </p>

          {!shareLink ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={shareLoading}
              onClick={handleCreateShareLink}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "#059669",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 14px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: shareLoading ? "not-allowed" : "pointer",
              }}
            >
              {shareLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Đang khởi tạo link...
                </>
              ) : (
                <>
                  <Share2 size={15} /> Tạo link theo dõi mới
                </>
              )}
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  style={{
                    flex: 1,
                    height: "36px",
                    padding: "0 10px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#334155",
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "0 12px",
                    height: "36px",
                    borderRadius: "6px",
                    border: "1px solid #059669",
                    backgroundColor: copied ? "#059669" : "#ecfdf5",
                    color: copied ? "#ffffff" : "#059669",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={14} /> Đã sao chép!
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Sao chép
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => window.open(shareLink, "_blank")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "0 12px",
                    height: "36px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  title="Mở link trong tab mới"
                >
                  <ExternalLink size={14} /> Mở link
                </button>
              </div>
              <span style={{ fontSize: "11px", color: "#059669" }}>
                ✓ Link theo dõi đã sẵn sàng. Người nhận chỉ có thể xem báo cáo và không thể thay đổi dữ liệu.
              </span>
            </div>
          )}
        </div>

        {/* Section 3: Thông tin phiên bản & Cập nhật từ xa (Android & Web OTA) */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            padding: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Smartphone size={17} style={{ color: "#0284c7" }} />
              <h3 style={{ fontSize: "14px", fontWeight: 650, margin: 0, color: "#1e293b" }}>
                Thông tin phiên bản ứng dụng
              </h3>
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "12px",
                backgroundColor: platform.isNative ? "#e0f2fe" : "#f1f5f9",
                color: platform.isNative ? "#0284c7" : "#475569",
                border: "1px solid " + (platform.isNative ? "#bae6fd" : "#cbd5e1"),
              }}
            >
              {platform.platformBadge}
            </span>
          </div>

          {/* Bảng chi tiết: Tên phiên bản, Mã build, Ngày giờ, Môi trường */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              padding: "12px 14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Sparkles size={12} style={{ color: "#0284c7" }} /> Tên phiên bản
              </div>
              <div style={{ fontSize: "13px", fontWeight: 750, color: "#0f172a", marginTop: "2px" }}>
                {CURRENT_APP_VERSION.versionName}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Hash size={12} style={{ color: "#059669" }} /> Mã bản build (Build code)
              </div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", fontFamily: "monospace", marginTop: "2px" }}>
                #{CURRENT_APP_VERSION.buildNumber} {CURRENT_APP_VERSION.gitCommit ? `(${CURRENT_APP_VERSION.gitCommit})` : ""}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Calendar size={12} style={{ color: "#d97706" }} /> Ngày giờ bản build
              </div>
              <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155", marginTop: "2px" }}>
                {CURRENT_APP_VERSION.buildDate}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Smartphone size={12} style={{ color: "#6366f1" }} /> Môi trường / Kênh
              </div>
              <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155", marginTop: "2px" }}>
                {platform.platformName} ({CURRENT_APP_VERSION.releaseChannel})
              </div>
            </div>
          </div>

          {/* Nút Tìm phiên bản mới */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={checkingVersion || downloadingOta}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #0284c7",
                backgroundColor: "#0284c7",
                color: "#ffffff",
                fontSize: "12.5px",
                fontWeight: 650,
                cursor: checkingVersion || downloadingOta ? "not-allowed" : "pointer",
                boxShadow: "0 1px 2px rgba(2, 132, 199, 0.2)",
                opacity: checkingVersion || downloadingOta ? 0.75 : 1,
              }}
            >
              {checkingVersion ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Đang kiểm tra máy chủ Cloudflare...
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Tìm phiên bản mới
                </>
              )}
            </button>

            {installedVersion && (
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Phiên bản đang chạy: <b>v{installedVersion}</b>
              </span>
            )}
          </div>

          {/* Khối kết quả kiểm tra cập nhật */}
          {updateResult && (
            <div style={{ marginTop: "12px" }}>
              {updateResult.hasUpdate && updateResult.remoteInfo ? (
                <div
                  style={{
                    backgroundColor: "#eff6ff",
                    border: "1px solid #93c5fd",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <Sparkles size={18} style={{ color: "#2563eb", marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#1e40af" }}>
                        🚀 Phát hiện phiên bản mới: v{updateResult.remoteInfo.latestVersion}
                      </div>
                      <div style={{ fontSize: "12px", color: "#1e3a8a", marginTop: "2px" }}>
                        <b>Tên bản build:</b> {updateResult.remoteInfo.versionName || `Phenikaa SCMH v${updateResult.remoteInfo.latestVersion}`}
                        {updateResult.remoteInfo.buildDate && ` • Ngày phát hành: ${updateResult.remoteInfo.buildDate}`}
                      </div>
                      {updateResult.remoteInfo.releaseNotes && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#334155",
                            marginTop: "6px",
                            backgroundColor: "#ffffff",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          <b>Ghi chú cập nhật:</b> {updateResult.remoteInfo.releaseNotes}
                        </div>
                      )}

                      <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                        {otaReady ? (
                          <button
                            type="button"
                            onClick={() => reloadApp()}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              backgroundColor: "#16a34a",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "7px 14px",
                              fontSize: "12.5px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            <RotateCw size={14} /> Khởi động lại ứng dụng ngay
                          </button>
                        ) : platform.isNative ? (
                          <button
                            type="button"
                            disabled={downloadingOta}
                            onClick={handleDownloadAndApply}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              backgroundColor: "#2563eb",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "7px 14px",
                              fontSize: "12.5px",
                              fontWeight: 700,
                              cursor: downloadingOta ? "not-allowed" : "pointer",
                            }}
                          >
                            {downloadingOta ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Đang tải gói OTA từ Cloudflare R2...
                              </>
                            ) : (
                              <>
                                <Download size={14} /> Tải & Cập nhật ngay (OTA)
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => window.location.reload()}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              backgroundColor: "#2563eb",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "7px 14px",
                              fontSize: "12.5px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            <RefreshCw size={14} /> Tải lại trang để áp dụng
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : updateResult.error ? (
                <div
                  style={{
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#991b1b",
                    fontSize: "12.5px",
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{updateResult.error}</span>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#166534",
                    fontSize: "12.5px",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    <b>Ứng dụng đang ở phiên bản mới nhất!</b> (v{installedVersion} - Build #{CURRENT_APP_VERSION.buildNumber}). Không có bản cập nhật nào mới trên máy chủ.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 4: Cấu hình In ấn & Quản trị hệ thống */}
        <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1fr 1fr" : "1fr", gap: "12px" }}>
          <div
            style={{
              backgroundColor: "#f8fafc",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <Printer size={15} style={{ color: "#6366f1" }} />
                <h4 style={{ fontSize: "13px", fontWeight: 650, margin: 0, color: "#1e293b" }}>
                  Mẫu phiếu in & Biểu mẫu
                </h4>
              </div>
              <p style={{ fontSize: "11.5px", color: "#64748b", margin: 0 }}>
                Tùy biến tiêu đề, số tài khoản, thông tin công ty trên phiếu thanh toán và PO.
              </p>
            </div>
            {onOpenPrintTemplates && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  onOpenPrintTemplates();
                }}
                style={{
                  alignSelf: "flex-start",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Cấu hình mẫu in ➔
              </button>
            )}
          </div>

          {isAdmin && onOpenAdminSettings && (
            <div
              style={{
                backgroundColor: "#f8fafc",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <ShieldCheck size={15} style={{ color: "#d97706" }} />
                  <h4 style={{ fontSize: "13px", fontWeight: 650, margin: 0, color: "#1e293b" }}>
                    Quản trị hệ thống nâng cao
                  </h4>
                </div>
                <p style={{ fontSize: "11.5px", color: "#64748b", margin: 0 }}>
                  Quản lý tài khoản người dùng, sao lưu Snapshot D1/R2 và nhật ký thao tác.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  onOpenAdminSettings();
                }}
                style={{
                  alignSelf: "flex-start",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Mở trang quản trị ➔
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            borderTop: "1px solid #f1f5f9",
            paddingTop: "14px",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{
              padding: "7px 18px",
              fontSize: "13px",
              fontWeight: 600,
              backgroundColor: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              cursor: "pointer",
              color: "#334155",
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
