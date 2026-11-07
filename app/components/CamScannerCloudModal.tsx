"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Cloud,
  Search,
  RefreshCw,
  Check,
  ExternalLink,
  Folder,
  FileText,
  LogOut,
  Loader2,
  X,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export interface CamScannerDocItem {
  cs_doc_id: string;
  title: string;
  dir_id?: string;
  dir_title?: string;
  doc_id?: string;
  display_key?: string;
  create_time?: number | string;
  modify_time?: number | string;
}

export interface CamScannerImportResult {
  url: string;
  fileName: string;
  csDocId: string;
  title: string;
}

export interface CamScannerCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: CamScannerImportResult) => void;
  targetLabel?: string;
  prCode?: string;
  prId?: number | string;
  targetType?: "scan" | "vault";
  workspaceId?: string;
  entityType?: string;
  entityId?: string;
  documentType?: string;
  note?: string;
}

const LS_CS_TOKEN_KEY = "scmh_camscanner_token_v1";

function formatCsTime(val?: number | string): string {
  if (!val) return "—";
  const num = Number(val);
  if (!isNaN(num) && num > 1000000000) {
    const ms = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [datePart, timePart] = str.split(/[T ]/);
    const [y, m, d] = datePart.split("-");
    return `${d}/${m}/${y}${timePart ? ` ${timePart.slice(0, 5)}` : ""}`;
  }
  return str;
}

function inferCsDocType(doc: CamScannerDocItem): string {
  const link = (doc.doc_id || doc.display_key || "").toLowerCase();
  const id = (doc.cs_doc_id || "").toLowerCase();
  if (link.includes("/pdfdetail") || id.endsWith("_pdfx0")) return "PDF";
  if (id.endsWith("_word1")) return "Word";
  if (id.endsWith("_exce1")) return "Excel";
  if (id.endsWith("_pptx1")) return "PPT";
  if (link.includes("/markdowndetail")) return "Markdown";
  return "Bản Scan (PDF)";
}

export function CamScannerCloudModal({
  isOpen,
  onClose,
  onImported,
  targetLabel = "Chứng từ",
  prCode = "CS",
  prId,
  targetType = "scan",
  workspaceId = "phenikaa",
  entityType = "pr",
  entityId = "",
  documentType = "PR",
  note = "Đồng bộ từ CamScanner Cloud",
}: CamScannerCloudModalProps) {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [csUserId, setCsUserId] = useState("");
  const [localToken, setLocalToken] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_CS_TOKEN_KEY) || "";
    }
    return "";
  });

  // Login flow state
  const [loginWaiting, setLoginWaiting] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
  const [loginError, setLoginError] = useState("");
  const pollTimerRef = useRef<any>(null);
  const authWindowRef = useRef<Window | null>(null);

  // Cloud docs search state
  const [keyword, setKeyword] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [searchScope, setSearchScope] = useState<"title" | "full">("title");
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docs, setDocs] = useState<CamScannerDocItem[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [searchError, setSearchError] = useState("");

  // Importing state
  const [importingDocId, setImportingDocId] = useState<string | null>(null);

  const getHeaders = useCallback(
    (tokenOverride?: string) => {
      const tk = tokenOverride !== undefined ? tokenOverride : localToken;
      const h: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (tk) {
        h["x-cs-token"] = tk;
      }
      return h;
    },
    [localToken]
  );

  const fetchCloudDocs = useCallback(
    async (kw = keyword, typeF = docTypeFilter, scope = searchScope, tokenOverride?: string) => {
      setLoadingDocs(true);
      setSearchError("");
      try {
        const res = await fetch("/api/camscanner", {
          method: "POST",
          headers: getHeaders(tokenOverride),
          body: JSON.stringify({
            action: "search",
            keyword: kw,
            docType: typeF === "all" ? "" : typeF,
            scope,
            limit: 35,
          }),
        });
        const data: any = await res.json();
        if (res.status === 401) {
          setAuthenticated(false);
          setSearchError("Phiên đăng nhập CamScanner đã hết hạn. Vui lòng kết nối lại.");
          return;
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Không thể tải danh sách tài liệu từ CamScanner Cloud");
        }
        setDocs(Array.isArray(data.docs) ? data.docs : []);
        setTotalDocs(Number(data.total) || (data.docs?.length ?? 0));
      } catch (err: any) {
        setSearchError(err?.message || "Lỗi kết nối CamScanner Cloud");
      } finally {
        setLoadingDocs(false);
      }
    },
    [keyword, docTypeFilter, searchScope, getHeaders]
  );

  const checkAuthStatus = useCallback(async () => {
    setCheckingAuth(true);
    setLoginError("");
    try {
      const savedToken =
        typeof window !== "undefined" ? localStorage.getItem(LS_CS_TOKEN_KEY) || "" : "";
      if (savedToken) setLocalToken(savedToken);

      const res = await fetch("/api/camscanner?action=status", {
        headers: savedToken ? { "x-cs-token": savedToken } : {},
      });
      const data: any = await res.json();
      if (data.authenticated) {
        setAuthenticated(true);
        setCsUserId(data.csUserId || "");
        void fetchCloudDocs("", "all", "title", savedToken);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }, [fetchCloudDocs]);

  useEffect(() => {
    if (isOpen) {
      void checkAuthStatus();
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setLoginWaiting(false);
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, checkAuthStatus]);

  const handleStartLogin = async () => {
    setLoginError("");
    setLoginWaiting(true);
    try {
      const res = await fetch("/api/camscanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login-code" }),
      });
      const data: any = await res.json();
      if (!res.ok || !data.ok || !data.code || !data.loginUrl) {
        throw new Error(data.error || "Không thể khởi tạo liên kết đăng nhập CamScanner");
      }

      setLoginUrl(data.loginUrl);

      // Mở cửa sổ đăng nhập CamScanner chính thức
      const w = 540;
      const h = 680;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      authWindowRef.current = window.open(
        data.loginUrl,
        "CamScannerCloudAuth",
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      // Poll trạng thái xác thực mỗi 2 giây
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      const code = data.code;
      pollTimerRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/camscanner?action=poll&code=${encodeURIComponent(code)}`
          );
          const pollData: any = await pollRes.json();
          if (pollData.status === "authorized" && pollData.token) {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            try {
              authWindowRef.current?.close();
            } catch {}
            localStorage.setItem(LS_CS_TOKEN_KEY, pollData.token);
            setLocalToken(pollData.token);
            setCsUserId(pollData.csUserId || "");
            setLoginWaiting(false);
            setAuthenticated(true);
            void fetchCloudDocs("", "all", "title", pollData.token);
          } else if (pollData.status === "expired" || pollData.status === "rejected") {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            setLoginWaiting(false);
            setLoginError("Phiên cấp quyền đã hết hạn hoặc bị từ chối. Vui lòng bấm kết nối lại.");
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      setLoginWaiting(false);
      setLoginError(err?.message || "Lỗi kết nối máy chủ CamScanner");
    }
  };

  const handleLogout = async () => {
    if (!confirm("Bạn có muốn ngắt kết nối tài khoản CamScanner Pro hiện tại?")) return;
    try {
      await fetch("/api/camscanner", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {}
    localStorage.removeItem(LS_CS_TOKEN_KEY);
    setLocalToken("");
    setAuthenticated(false);
    setDocs([]);
  };

  const handleImportDoc = async (doc: CamScannerDocItem) => {
    if (importingDocId) return;
    setImportingDocId(doc.cs_doc_id);
    setSearchError("");
    try {
      const res = await fetch("/api/camscanner", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          action: "import",
          csDocId: doc.cs_doc_id,
          title: doc.title || prCode,
          prCode,
          prId,
          targetType,
          workspaceId,
          entityType,
          entityId: entityId || prCode,
          documentType,
          note,
        }),
      });
      const data: any = await res.json();
      if (!res.ok || !data.ok || !data.scan_file_url) {
        throw new Error(data.error || "Không thể tải tài liệu từ CamScanner Cloud");
      }
      onImported({
        url: data.scan_file_url,
        fileName: data.fileName || `${doc.title}.pdf`,
        csDocId: doc.cs_doc_id,
        title: doc.title,
      });
      onClose();
    } catch (err: any) {
      setSearchError(err?.message || "Lỗi khi lấy file từ CamScanner Cloud");
    } finally {
      setImportingDocId(null);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="payment-modal-overlay"
      style={{ zIndex: 2147483640 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="payment-modal-card"
        style={{
          maxWidth: "860px",
          width: "95vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          borderRadius: "14px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            background: "#0f172a",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "8px",
                background: "#0d9488",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "14px",
                flexShrink: 0,
              }}
            >
              CS
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#ffffff" }}>
                  Kho dữ liệu Cloud CamScanner Pro
                </h3>
                {authenticated && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "rgba(16, 185, 129, 0.2)",
                      color: "#6ee7b7",
                      border: "1px solid rgba(110, 231, 183, 0.35)",
                    }}
                  >
                    <ShieldCheck size={12} /> Đã kết nối Cloud
                  </span>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Chọn bản scan trực tiếp từ tài khoản CamScanner của bạn để gắn vào{" "}
                <b style={{ color: "#e2e8f0" }}>{targetLabel}</b>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {authenticated && (
              <button
                type="button"
                onClick={handleLogout}
                title="Đổi hoặc ngắt kết nối tài khoản CamScanner"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 10px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px solid #334155",
                  background: "#1e293b",
                  color: "#cbd5e1",
                  cursor: "pointer",
                }}
              >
                <LogOut size={12} /> Đổi TK
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "6px",
                border: "1px solid #334155",
                background: "#1e293b",
                color: "#ffffff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "18px 20px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            background: "#f8fafc",
          }}
        >
          {checkingAuth ? (
            <div style={{ padding: "48px 20px", textAlign: "center", color: "#475569" }}>
              <Loader2
                size={28}
                className="animate-spin"
                style={{ margin: "0 auto 10px", color: "#0d9488" }}
              />
              <div style={{ fontWeight: 700, fontSize: "14px" }}>
                Đang kiểm tra kết nối Cloud CamScanner...
              </div>
            </div>
          ) : !authenticated ? (
            /* Màn hình Đăng nhập / Kết nối tài khoản CamScanner Pro */
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "28px 24px",
                textAlign: "center",
                maxWidth: "560px",
                margin: "12px auto",
              }}
            >
              <div
                style={{
                  width: "54px",
                  height: "54px",
                  borderRadius: "14px",
                  background: "#f0fdfa",
                  border: "1px solid #99f6e4",
                  color: "#0d9488",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                }}
              >
                <Cloud size={28} />
              </div>

              <h4 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
                Kết nối trực tiếp với tài khoản CamScanner Pro
              </h4>
              <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#475569", lineHeight: 1.55 }}>
                Đăng nhập 1 lần duy nhất vào cổng uỷ quyền chính thức của <b>CamScanner Cloud</b>.
                Sau khi kết nối, toàn bộ các bản scan bạn vừa chụp trên điện thoại sẽ hiển thị trực tiếp tại đây để bạn chọn gắn vào <b>{targetLabel}</b> mà không cần tải thủ công về máy.
              </p>

              {loginError && (
                <div
                  style={{
                    padding: "10px 12px",
                    marginBottom: "14px",
                    borderRadius: "8px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    fontSize: "12.5px",
                    fontWeight: 600,
                  }}
                >
                  {loginError}
                </div>
              )}

              {!loginWaiting ? (
                <button
                  type="button"
                  onClick={() => void handleStartLogin()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "11px 22px",
                    fontSize: "14px",
                    fontWeight: 700,
                    borderRadius: "9px",
                    border: "1px solid #0f766e",
                    background: "#0d9488",
                    color: "#ffffff",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(13, 148, 136, 0.25)",
                  }}
                >
                  <Sparkles size={16} />
                  <span>Đăng nhập & Kết nối Cloud CamScanner</span>
                </button>
              ) : (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "10px",
                    background: "#f0fdfa",
                    border: "1px solid #99f6e4",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#0f766e",
                      fontWeight: 700,
                      fontSize: "13.5px",
                    }}
                  >
                    <Loader2 size={18} className="animate-spin" />
                    <span>Đang chờ bạn xác nhận đăng nhập trên cửa sổ CamScanner...</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    Sau khi đăng nhập và bấm <b>Authorize / Cho phép</b> trên trang CamScanner, hệ thống sẽ tự động mở kho tài liệu của bạn.
                  </div>
                  {loginUrl && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap", justifyContent: "center" }}>
                      <a
                        href={loginUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          background: "#0d9488",
                          color: "#ffffff",
                          fontSize: "12px",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        <ExternalLink size={13} /> Mở lại trang đăng nhập CamScanner
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                          setLoginWaiting(false);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#475569",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Màn hình Danh sách Tài liệu trên Cloud CamScanner */
            <>
              {/* Thanh tìm kiếm & lọc trên Cloud CamScanner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                  background: "#ffffff",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    flex: "1 1 240px",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "7px",
                    padding: "0 10px",
                    height: "34px",
                  }}
                >
                  <Search size={15} style={{ color: "#64748b", flexShrink: 0 }} />
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void fetchCloudDocs(keyword, docTypeFilter, searchScope);
                      }
                    }}
                    placeholder="Tìm tên bản scan trên CamScanner (bấm Enter để tìm, để trống để xem mới nhất)..."
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontSize: "12.5px",
                      color: "#0f172a",
                    }}
                  />
                </div>

                <select
                  value={docTypeFilter}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setDocTypeFilter(nextType);
                    void fetchCloudDocs(keyword, nextType, searchScope);
                  }}
                  style={{
                    height: "34px",
                    borderRadius: "7px",
                    border: "1px solid #cbd5e1",
                    padding: "0 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#334155",
                    background: "#ffffff",
                  }}
                >
                  <option value="all">Tất cả định dạng</option>
                  <option value="pdf">PDF / Bản scan</option>
                  <option value="image">Ảnh Scan</option>
                  <option value="word">Word</option>
                  <option value="excel">Excel</option>
                </select>

                <select
                  value={searchScope}
                  onChange={(e) => {
                    const nextScope = e.target.value as "title" | "full";
                    setSearchScope(nextScope);
                    void fetchCloudDocs(keyword, docTypeFilter, nextScope);
                  }}
                  style={{
                    height: "34px",
                    borderRadius: "7px",
                    border: "1px solid #cbd5e1",
                    padding: "0 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#334155",
                    background: "#ffffff",
                  }}
                >
                  <option value="title">Tìm theo tiêu đề</option>
                  <option value="full">Tìm cả chữ OCR trong trang</option>
                </select>

                <button
                  type="button"
                  onClick={() => void fetchCloudDocs(keyword, docTypeFilter, searchScope)}
                  disabled={loadingDocs}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    height: "34px",
                    padding: "0 12px",
                    borderRadius: "7px",
                    border: "1px solid #0d9488",
                    background: "#0d9488",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <RefreshCw size={13} className={loadingDocs ? "animate-spin" : ""} />
                  <span>{loadingDocs ? "Đang tải..." : "Tìm / Làm mới"}</span>
                </button>
              </div>

              {searchError && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    fontSize: "12.5px",
                    fontWeight: 600,
                  }}
                >
                  {searchError}
                </div>
              )}

              {/* Bảng danh sách tài liệu trên CamScanner Cloud */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                {loadingDocs ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "#475569" }}>
                    <Loader2
                      size={24}
                      className="animate-spin"
                      style={{ margin: "0 auto 8px", color: "#0d9488" }}
                    />
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>
                      Đang đồng bộ danh sách bản scan từ CamScanner Cloud...
                    </div>
                  </div>
                ) : docs.length === 0 ? (
                  <div style={{ padding: "36px 20px", textAlign: "center", color: "#64748b" }}>
                    <div style={{ fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                      Không tìm thấy bản scan nào khớp với bộ lọc
                    </div>
                    <div style={{ fontSize: "12.5px" }}>
                      Hãy đảm bảo ứng dụng CamScanner trên điện thoại đã đồng bộ (Sync) tài liệu lên Cloud, sau đó bấm <b>Tìm / Làm mới</b>.
                    </div>
                  </div>
                ) : (
                  <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "12.5px",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: "#f8fafc",
                            borderBottom: "1px solid #cbd5e1",
                            color: "#334155",
                            textAlign: "left",
                            position: "sticky",
                            top: 0,
                            zIndex: 2,
                          }}
                        >
                          <th style={{ padding: "9px 10px", width: "42px", textAlign: "center" }}>
                            #
                          </th>
                          <th style={{ padding: "9px 10px" }}>Tên bản scan trên CamScanner</th>
                          <th style={{ padding: "9px 10px", width: "130px" }}>Thư mục</th>
                          <th style={{ padding: "9px 10px", width: "105px", textAlign: "center" }}>
                            Định dạng
                          </th>
                          <th style={{ padding: "9px 10px", width: "135px", textAlign: "center" }}>
                            Cập nhật
                          </th>
                          <th style={{ padding: "9px 12px", width: "165px", textAlign: "center" }}>
                            Chọn lấy file
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((doc, idx) => {
                          const isImporting = importingDocId === doc.cs_doc_id;
                          const docWebUrl = doc.doc_id || doc.display_key || "";
                          return (
                            <tr
                              key={doc.cs_doc_id || idx}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                background: idx % 2 === 0 ? "#ffffff" : "#fcfdfe",
                              }}
                            >
                              <td
                                style={{
                                  padding: "9px 10px",
                                  textAlign: "center",
                                  color: "#64748b",
                                  fontWeight: 600,
                                }}
                              >
                                {idx + 1}
                              </td>
                              <td style={{ padding: "9px 10px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "7px",
                                    fontWeight: 700,
                                    color: "#0f172a",
                                    fontSize: "13px",
                                  }}
                                >
                                  <FileText
                                    size={15}
                                    style={{ color: "#0d9488", flexShrink: 0 }}
                                  />
                                  <span style={{ wordBreak: "break-word" }}>{doc.title}</span>
                                  {docWebUrl && docWebUrl.startsWith("http") && (
                                    <a
                                      href={docWebUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Mở xem trên trang CamScanner"
                                      style={{
                                        color: "#64748b",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: "9px 10px", color: "#475569" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontSize: "11.5px",
                                  }}
                                >
                                  <Folder size={12} style={{ color: "#64748b" }} />
                                  {doc.dir_title || "Thư mục gốc"}
                                </span>
                              </td>
                              <td style={{ padding: "9px 10px", textAlign: "center" }}>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: "5px",
                                    background: "#f0fdfa",
                                    color: "#0f766e",
                                    border: "1px solid #99f6e4",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {inferCsDocType(doc)}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "9px 10px",
                                  textAlign: "center",
                                  color: "#475569",
                                  fontSize: "11.5px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatCsTime(doc.modify_time || doc.create_time)}
                              </td>
                              <td
                                style={{
                                  padding: "9px 12px",
                                  textAlign: "center",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <button
                                  type="button"
                                  disabled={!!importingDocId}
                                  onClick={() => void handleImportDoc(doc)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "5px",
                                    height: "28px",
                                    padding: "0 11px",
                                    borderRadius: "6px",
                                    border: "1px solid #0d9488",
                                    background: isImporting ? "#0f766e" : "#0d9488",
                                    color: "#ffffff",
                                    fontSize: "11.5px",
                                    fontWeight: 700,
                                    cursor: importingDocId ? "wait" : "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {isImporting ? (
                                    <>
                                      <Loader2 size={12} className="animate-spin" />
                                      <span>Đang lấy file...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check size={13} />
                                      <span>Chọn bản scan này</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px",
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <div>
            {authenticated
              ? `Đang hiển thị ${docs.length} / ${totalDocs} tài liệu trên Cloud CamScanner${
                  csUserId ? ` (ID: ${csUserId})` : ""
                }`
              : "Tích hợp trực tiếp qua giao thức CamScanner Cloud API"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#334155",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
export default CamScannerCloudModal;
