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
  Eye,
  Plus,
  CreditCard,
  Truck,
  FolderPlus,
  Maximize2,
  Minimize2,
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

export type CamScannerCreateActionType = "pr" | "payment" | "handover" | "vault";

export interface CamScannerCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: CamScannerImportResult) => void;
  onCreateFromScan?: (
    actionType: CamScannerCreateActionType,
    result: CamScannerImportResult
  ) => void;
  embedded?: boolean;
  targetLabel?: string;
  prCode?: string;
  prId?: number | string;
  targetType?: "scan" | "vault";
  workspaceId?: string;
  entityType?: string;
  entityId?: string;
  documentType?: string;
  note?: string;
  vaultOptions?: {
    workspaceId?: string;
    entityType?: string;
    entityId?: string;
    documentType?: string;
    note?: string;
  };
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
  return "Scan PDF";
}

export function CamScannerCloudModal({
  isOpen,
  onClose,
  onImported,
  onCreateFromScan,
  embedded = false,
  targetLabel = "Chứng từ",
  prCode = "CS",
  prId,
  targetType = "scan",
  workspaceId = "phenikaa",
  entityType = "pr",
  entityId = "",
  documentType = "PR",
  note = "Đồng bộ từ CamScanner Cloud",
  vaultOptions,
}: CamScannerCloudModalProps) {
  const effWorkspaceId = vaultOptions?.workspaceId || workspaceId;
  const effEntityType = vaultOptions?.entityType || entityType;
  const effEntityId = vaultOptions?.entityId || entityId;
  const effDocType = vaultOptions?.documentType || documentType;
  const effNote = vaultOptions?.note ?? note;

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

  // Cloud docs search state (debounced 1s after user stops typing)
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [isWaitingDebounce, setIsWaitingDebounce] = useState(false);
  const searchDebounceTimerRef = useRef<any>(null);
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState<string>("__ALL__");
  const [searchScope, setSearchScope] = useState<"title" | "full">("title");
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [syncingAllDocs, setSyncingAllDocs] = useState(false);
  const [docs, setDocs] = useState<CamScannerDocItem[]>([]);
  const [cloudDirs, setCloudDirs] = useState<
    { dir_id: string; title: string; doc_count?: number }[]
  >([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [searchError, setSearchError] = useState("");

  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const docTypeFilterRef = useRef(docTypeFilter);
  docTypeFilterRef.current = docTypeFilter;
  const searchScopeRef = useRef(searchScope);
  searchScopeRef.current = searchScope;

  // Importing state
  const [importingDocId, setImportingDocId] = useState<string | null>(null);
  const [importingAction, setImportingAction] = useState<string>("");

  // Hover / Click Preview popup state & Resizable/Draggable geometry
  const [previewDoc, setPreviewDoc] = useState<CamScannerDocItem | null>(null);
  const [previewPinned, setPreviewPinned] = useState(false);
  const [previewFrameLoading, setPreviewFrameLoading] = useState(false);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const [previewRect, setPreviewRect] = useState<{
    width: number;
    height: number;
    right: number;
    top: number | null;
  }>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("scmh_cs_preview_size_v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.width && parsed?.height) {
            return {
              width: Math.max(360, Math.min(1400, Number(parsed.width))),
              height: Math.max(380, Math.min(1000, Number(parsed.height))),
              right: 18,
              top: null,
            };
          }
        }
      } catch {
        // ignore
      }
    }
    return { width: 520, height: 680, right: 18, top: null };
  });
  const [isInteractingPreview, setIsInteractingPreview] = useState(false);
  const previewCardRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<any>(null);
  const closePreviewTimerRef = useRef<any>(null);
  const isHoveringPopupRef = useRef(false);

  const startResizePreview = (
    e: React.MouseEvent,
    dir: "w" | "e" | "n" | "s" | "nw" | "ne" | "sw" | "se"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (previewMaximized) setPreviewMaximized(false);
    setPreviewPinned(true);
    setIsInteractingPreview(true);

    const cardEl = previewCardRef.current;
    const rect = cardEl?.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = rect ? rect.width : previewRect.width;
    const startHeight = rect ? rect.height : previewRect.height;
    const startRight = rect
      ? Math.max(8, window.innerWidth - rect.right)
      : previewRect.right;
    const startTop = rect
      ? rect.top
      : previewRect.top ?? Math.max(16, (window.innerHeight - startHeight) / 2);

    let latestW = startWidth;
    let latestH = startHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let nextWidth = startWidth;
      let nextHeight = startHeight;
      let nextRight = startRight;
      let nextTop = startTop;

      const maxW = Math.max(400, window.innerWidth - 20);
      const maxH = Math.max(400, window.innerHeight - 20);

      if (dir.includes("w")) {
        // Kéo cạnh trái sang trái -> tăng chiều rộng
        nextWidth = Math.min(maxW, Math.max(360, startWidth - dx));
      } else if (dir.includes("e")) {
        // Kéo cạnh phải sang phải -> tăng chiều rộng và dịch mốc right
        const proposedWidth = Math.min(maxW, Math.max(360, startWidth + dx));
        const actualDeltaW = proposedWidth - startWidth;
        nextWidth = proposedWidth;
        nextRight = Math.max(8, startRight - actualDeltaW);
      }

      if (dir.includes("s")) {
        // Kéo cạnh dưới xuống dưới -> tăng chiều cao
        nextHeight = Math.min(maxH, Math.max(360, startHeight + dy));
      } else if (dir.includes("n")) {
        // Kéo cạnh trên lên trên -> tăng chiều cao và dịch mốc top
        const proposedHeight = Math.min(maxH, Math.max(360, startHeight - dy));
        const actualDeltaH = proposedHeight - startHeight;
        nextHeight = proposedHeight;
        nextTop = Math.max(8, startTop - actualDeltaH);
      }

      latestW = nextWidth;
      latestH = nextHeight;

      setPreviewRect({
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
        right: Math.round(nextRight),
        top: Math.round(nextTop),
      });
    };

    const handleMouseUp = () => {
      setIsInteractingPreview(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      try {
        localStorage.setItem(
          "scmh_cs_preview_size_v1",
          JSON.stringify({
            width: Math.round(latestW),
            height: Math.round(latestH),
          })
        );
      } catch {
        // ignore
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const startDragPreview = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (previewMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    setPreviewPinned(true);
    setIsInteractingPreview(true);

    const cardEl = previewCardRef.current;
    const rect = cardEl?.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRight = rect
      ? window.innerWidth - rect.right
      : previewRect.right;
    const startTop = rect
      ? rect.top
      : previewRect.top ??
        Math.max(16, (window.innerHeight - previewRect.height) / 2);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const nextRight = Math.max(
        6,
        Math.min(window.innerWidth - 180, startRight - dx)
      );
      const nextTop = Math.max(
        6,
        Math.min(window.innerHeight - 120, startTop + dy)
      );
      setPreviewRect((prev) => ({
        ...prev,
        right: Math.round(nextRight),
        top: Math.round(nextTop),
      }));
    };

    const handleMouseUp = () => {
      setIsInteractingPreview(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleRowMouseEnter = (doc: CamScannerDocItem) => {
    if (closePreviewTimerRef.current) {
      clearTimeout(closePreviewTimerRef.current);
      closePreviewTimerRef.current = null;
    }
    if (previewPinned) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setPreviewDoc((prev) => {
        if (prev?.cs_doc_id !== doc.cs_doc_id) {
          setPreviewFrameLoading(true);
        }
        return doc;
      });
    }, 220);
  };

  const handleRowMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (previewPinned) return;
    if (closePreviewTimerRef.current) clearTimeout(closePreviewTimerRef.current);
    closePreviewTimerRef.current = setTimeout(() => {
      if (!isHoveringPopupRef.current) {
        setPreviewDoc(null);
      }
    }, 320);
  };

  const handlePinPreview = (doc: CamScannerDocItem) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (closePreviewTimerRef.current) clearTimeout(closePreviewTimerRef.current);
    if (previewDoc?.cs_doc_id !== doc.cs_doc_id) {
      setPreviewFrameLoading(true);
    }
    setPreviewDoc(doc);
    setPreviewPinned(true);
  };

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
    async (
      kw = keywordRef.current,
      typeF = docTypeFilterRef.current,
      scope = searchScopeRef.current,
      tokenOverride?: string
    ) => {
      setLoadingDocs(true);
      setSyncingAllDocs(false);
      setSearchError("");
      try {
        const res = await fetch("/api/camscanner", {
          method: "POST",
          headers: getHeaders(tokenOverride),
          body: JSON.stringify({
            action: "search",
            mode: "fast",
            keyword: kw,
            docType: typeF === "all" ? "" : typeF,
            scope,
          }),
        });
        const data: any = await res.json();
        if (res.status === 401) {
          setAuthenticated(false);
          setSearchError(
            "Phiên đăng nhập CamScanner đã hết hạn. Vui lòng kết nối lại."
          );
          return;
        }
        if (!res.ok || !data.ok) {
          throw new Error(
            data.error ||
              "Không thể tải danh sách tài liệu từ CamScanner Cloud"
          );
        }
        const firstBatch: CamScannerDocItem[] = Array.isArray(data.docs)
          ? data.docs
          : [];
        setDocs(firstBatch);
        if (Array.isArray(data.dirs)) {
          setCloudDirs(data.dirs);
        }
        setTotalDocs(Number(data.total) || firstBatch.length);
        setLoadingDocs(false);

        if (data.hasMore && data.nextEndTime) {
          setSyncingAllDocs(true);
          try {
            const fullRes = await fetch("/api/camscanner", {
              method: "POST",
              headers: getHeaders(tokenOverride),
              body: JSON.stringify({
                action: "search",
                mode: "all",
                keyword: kw,
                docType: typeF === "all" ? "" : typeF,
                scope,
                endTime: data.nextEndTime,
                seedDocs: firstBatch,
              }),
            });
            const fullData: any = await fullRes.json();
            if (fullRes.ok && fullData.ok && Array.isArray(fullData.docs)) {
              setDocs(fullData.docs);
              setTotalDocs(Number(fullData.total) || fullData.docs.length);
            }
          } catch {
            // Keep first batch if network hiccups
          } finally {
            setSyncingAllDocs(false);
          }
        }
      } catch (err: any) {
        setSearchError(err?.message || "Lỗi kết nối CamScanner Cloud");
      } finally {
        setLoadingDocs(false);
      }
    },
    [getHeaders]
  );

  // Tự động chờ 1 giây (1000ms) sau khi người dùng ngừng gõ phím mới bắt đầu tìm kiếm
  useEffect(() => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }

    if (keyword === debouncedKeyword) {
      setIsWaitingDebounce(false);
      return;
    }

    setIsWaitingDebounce(true);
    searchDebounceTimerRef.current = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setIsWaitingDebounce(false);
      if (authenticated && searchScopeRef.current === "full") {
        void fetchCloudDocs(
          keyword,
          docTypeFilterRef.current,
          searchScopeRef.current
        );
      }
    }, 1000);

    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
    };
  }, [keyword, debouncedKeyword, authenticated, fetchCloudDocs]);

  const checkAuthStatus = useCallback(async () => {
    setCheckingAuth(true);
    setLoginError("");
    try {
      const savedToken =
        typeof window !== "undefined"
          ? localStorage.getItem(LS_CS_TOKEN_KEY) || ""
          : "";
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
    if (isOpen || embedded) {
      void checkAuthStatus();
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setLoginWaiting(false);
      setPreviewDoc(null);
      setPreviewPinned(false);
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, embedded, checkAuthStatus]);

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
        throw new Error(
          data.error || "Không thể khởi tạo liên kết đăng nhập CamScanner"
        );
      }

      setLoginUrl(data.loginUrl);

      const w = 540;
      const h = 680;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      authWindowRef.current = window.open(
        data.loginUrl,
        "CamScannerCloudAuth",
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

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
          } else if (
            pollData.status === "expired" ||
            pollData.status === "rejected"
          ) {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            setLoginWaiting(false);
            setLoginError(
              "Phiên cấp quyền đã hết hạn hoặc bị từ chối. Vui lòng bấm kết nối lại."
            );
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      setLoginWaiting(false);
      setLoginError(err?.message || "Lỗi kết nối máy chủ CamScanner");
    }
  };

  const handleLogout = async () => {
    if (
      !confirm("Bạn có muốn ngắt kết nối tài khoản CamScanner Pro hiện tại?")
    )
      return;
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

  const handleImportDoc = async (
    doc: CamScannerDocItem,
    createAction?: CamScannerCreateActionType
  ) => {
    if (importingDocId) return;
    setImportingDocId(doc.cs_doc_id);
    setImportingAction(createAction || "select");
    setSearchError("");
    try {
      const isVaultSave =
        createAction === "vault" || (!createAction && targetType === "vault");
      const res = await fetch("/api/camscanner", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          action: "import",
          csDocId: doc.cs_doc_id,
          title: doc.title || prCode,
          prCode: doc.title || prCode,
          prId: createAction ? undefined : prId,
          targetType: isVaultSave ? "vault" : "scan",
          workspaceId: effWorkspaceId,
          entityType: isVaultSave ? effEntityType : "pr",
          entityId: isVaultSave
            ? effEntityId || doc.title || "KHO_DU_LIEU"
            : prCode,
          documentType: isVaultSave ? effDocType : "PR",
          note: isVaultSave
            ? effNote || "Đồng bộ từ CamScanner Cloud"
            : note,
        }),
      });
      const data: any = await res.json();
      if (!res.ok || !data.ok || !data.scan_file_url) {
        throw new Error(
          data.error || "Không thể tải tài liệu từ CamScanner Cloud"
        );
      }
      const importResult: CamScannerImportResult = {
        url: data.scan_file_url,
        fileName: data.fileName || `${doc.title}.pdf`,
        csDocId: doc.cs_doc_id,
        title: doc.title,
      };
      setPreviewDoc(null);
      setPreviewPinned(false);
      if (createAction && onCreateFromScan) {
        onCreateFromScan(createAction, importResult);
        if (!embedded) onClose();
      } else {
        onImported(importResult);
        if (!embedded) onClose();
      }
    } catch (err: any) {
      setSearchError(err?.message || "Lỗi khi lấy file từ CamScanner Cloud");
    } finally {
      setImportingDocId(null);
      setImportingAction("");
    }
  };

  if ((!isOpen && !embedded) || typeof document === "undefined") return null;

  // Tổng hợp danh sách thư mục từ dữ liệu thực tế + cloudDirs
  const folderStats = (() => {
    const map = new Map<string, number>();
    let rootCount = 0;
    for (const d of docs) {
      const fName = (d.dir_title || "").trim();
      if (!fName) {
        rootCount++;
      } else {
        map.set(fName, (map.get(fName) || 0) + 1);
      }
    }
    for (const cd of cloudDirs) {
      const t = (cd.title || "").trim();
      if (t && !map.has(t)) {
        map.set(t, cd.doc_count || 0);
      }
    }
    return {
      rootCount,
      folders: Array.from(map.entries()).map(([name, count]) => ({
        name,
        count,
      })),
    };
  })();

  const kwLower = debouncedKeyword.trim().toLowerCase();
  const filteredDocs = docs.filter((d) => {
    if (folderFilter === "__ROOT__") {
      if ((d.dir_title || "").trim() !== "") return false;
    } else if (folderFilter !== "__ALL__") {
      if ((d.dir_title || "").trim() !== folderFilter) return false;
    }
    if (kwLower && searchScope === "title") {
      const titleMatch = (d.title || "").toLowerCase().includes(kwLower);
      const dirMatch = (d.dir_title || "").toLowerCase().includes(kwLower);
      if (!titleMatch && !dirMatch) return false;
    }
    return true;
  });

  const isHubMode = Boolean(onCreateFromScan);

  const mainContent = (
    <div
      className={embedded ? "cs-cloud-embedded-card" : "payment-modal-card cs-cloud-modal-card"}
      style={{
        maxWidth: embedded ? "100%" : isHubMode ? "1040px" : "920px",
        width: embedded ? "100%" : "96vw",
        maxHeight: embedded ? "none" : "88vh",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        overflow: "hidden",
        borderRadius: "12px",
        border: "1px solid #cbd5e1",
        background: "#ffffff",
        boxShadow: embedded
          ? "0 1px 3px rgba(15, 23, 42, 0.04)"
          : "0 20px 40px rgba(15, 23, 42, 0.22)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        .cs-cloud-search-box input.cs-cloud-search-input {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
          outline: none !important;
          height: 32px !important;
          padding: 0 4px !important;
          font-size: 12.5px !important;
          color: #0f172a !important;
          width: 100% !important;
        }
        .cs-cloud-table {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
        }
        .cs-cloud-table th,
        .cs-cloud-table td {
          box-sizing: border-box !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          padding: 7px 8px !important;
          font-size: 12.5px !important;
        }
        .cs-cloud-act-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 3px !important;
          height: 26px !important;
          padding: 0 7px !important;
          border-radius: 5px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: all 0.12s ease !important;
          line-height: 1 !important;
        }
        .cs-cloud-act-btn:disabled {
          opacity: 0.6 !important;
          cursor: wait !important;
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
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
              fontSize: "13px",
              flexShrink: 0,
            }}
          >
            CS
          </div>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "15.5px",
                  fontWeight: 800,
                  color: "#ffffff",
                }}
              >
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
                  <ShieldCheck size={12} /> Đã kết nối Cloud ({docs.length} file)
                </span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#cbd5e1", marginTop: "2px" }}>
              {isHubMode ? (
                <>
                  Rê chuột vào dòng để xem trước nhanh · Chọn tạo{" "}
                  <b style={{ color: "#5eead4" }}>PR, ĐNTT, Biên bản bàn giao</b>{" "}
                  hoặc lưu kho trực tiếp từ bản scan
                </>
              ) : (
                <>
                  Chọn bản scan trực tiếp từ tài khoản CamScanner của bạn để gắn vào{" "}
                  <b style={{ color: "#ffffff" }}>{targetLabel}</b>
                </>
              )}
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
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.1)",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <LogOut size={12} /> Đổi TK
            </button>
          )}
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.1)",
                color: "#ffffff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: "14px 16px",
          overflowY: "auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "#f8fafc",
        }}
      >
        {checkingAuth ? (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              color: "#475569",
            }}
          >
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

            <h4
              style={{
                margin: "0 0 8px",
                fontSize: "17px",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Kết nối trực tiếp với tài khoản CamScanner Pro
            </h4>
            <p
              style={{
                margin: "0 0 18px",
                fontSize: "13px",
                color: "#475569",
                lineHeight: 1.55,
              }}
            >
              Đăng nhập 1 lần duy nhất vào cổng uỷ quyền chính thức của{" "}
              <b>CamScanner Cloud</b>. Toàn bộ bản scan trên điện thoại sẽ đồng
              bộ trực tiếp tại đây để bạn xem trước và tạo PR, ĐNTT, Biên bản bàn
              giao ngay lập tức.
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
                  <span>
                    Đang chờ bạn xác nhận đăng nhập trên cửa sổ CamScanner...
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#475569" }}>
                  Sau khi đăng nhập và bấm <b>Authorize / Cho phép</b>, hệ thống
                  sẽ tự động mở kho tài liệu của bạn.
                </div>
                {loginUrl && (
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "4px",
                      flexWrap: "wrap",
                      justifyContent: "center",
                    }}
                  >
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
                      <ExternalLink size={13} /> Mở lại trang đăng nhập
                      CamScanner
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (pollTimerRef.current)
                          clearInterval(pollTimerRef.current);
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
          <>
            {/* Thanh tìm kiếm & lọc trên Cloud CamScanner */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
                background: "#ffffff",
                padding: "8px 10px",
                borderRadius: "9px",
                border: "1px solid #cbd5e1",
              }}
            >
              <div
                className="cs-cloud-search-box"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flex: "1 1 220px",
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "7px",
                  padding: "0 10px",
                  height: "34px",
                }}
              >
                <Search
                  size={15}
                  style={{ color: "#64748b", flexShrink: 0 }}
                />
                <input
                  type="text"
                  className="cs-cloud-search-input"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (searchDebounceTimerRef.current) {
                        clearTimeout(searchDebounceTimerRef.current);
                        searchDebounceTimerRef.current = null;
                      }
                      setDebouncedKeyword(keyword);
                      setIsWaitingDebounce(false);
                      void fetchCloudDocs(keyword, docTypeFilter, searchScope);
                    }
                  }}
                  placeholder="Tìm tên bản scan trên CamScanner (tự tìm sau 1s ngừng gõ)..."
                />
                {isWaitingDebounce && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "10.5px",
                      fontWeight: 600,
                      color: "#0d9488",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    <Loader2 size={12} className="animate-spin" />
                    Chờ 1s...
                  </span>
                )}
                {keyword && (
                  <button
                    type="button"
                    onClick={() => {
                      if (searchDebounceTimerRef.current) {
                        clearTimeout(searchDebounceTimerRef.current);
                        searchDebounceTimerRef.current = null;
                      }
                      setKeyword("");
                      setDebouncedKeyword("");
                      setIsWaitingDebounce(false);
                      if (searchScope === "full") {
                        void fetchCloudDocs("", docTypeFilter, searchScope);
                      }
                    }}
                    style={{
                      border: "none",
                      background: "#e2e8f0",
                      color: "#334155",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Xóa
                  </button>
                )}
              </div>

              <select
                value={docTypeFilter}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setDocTypeFilter(nextType);
                  setDebouncedKeyword(keyword);
                  setIsWaitingDebounce(false);
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
                  setDebouncedKeyword(keyword);
                  setIsWaitingDebounce(false);
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
                onClick={() => {
                  if (searchDebounceTimerRef.current) {
                    clearTimeout(searchDebounceTimerRef.current);
                    searchDebounceTimerRef.current = null;
                  }
                  setDebouncedKeyword(keyword);
                  setIsWaitingDebounce(false);
                  void fetchCloudDocs(keyword, docTypeFilter, searchScope);
                }}
                disabled={loadingDocs || syncingAllDocs}
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
                <RefreshCw
                  size={13}
                  className={
                    loadingDocs || syncingAllDocs ? "animate-spin" : ""
                  }
                />
                <span>
                  {loadingDocs
                    ? "Đang tải..."
                    : syncingAllDocs
                    ? `Đang đồng bộ (${docs.length}+)...`
                    : "Tìm / Làm mới"}
                </span>
              </button>
            </div>

            {/* Thanh lọc nhanh theo Thư mục trên CamScanner Cloud */}
            {docs.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => setFolderFilter("__ALL__")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    border:
                      folderFilter === "__ALL__"
                        ? "1px solid #0d9488"
                        : "1px solid #cbd5e1",
                    background:
                      folderFilter === "__ALL__" ? "#f0fdfa" : "#ffffff",
                    color:
                      folderFilter === "__ALL__" ? "#0f766e" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  <span>Tất cả tài liệu ({docs.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFolderFilter("__ROOT__")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    border:
                      folderFilter === "__ROOT__"
                        ? "1px solid #0d9488"
                        : "1px solid #cbd5e1",
                    background:
                      folderFilter === "__ROOT__" ? "#f0fdfa" : "#ffffff",
                    color:
                      folderFilter === "__ROOT__" ? "#0f766e" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  <Folder size={12} />
                  <span>Thư mục gốc ({folderStats.rootCount})</span>
                </button>

                {folderStats.folders.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => setFolderFilter(f.name)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      border:
                        folderFilter === f.name
                          ? "1px solid #0d9488"
                          : "1px solid #cbd5e1",
                      background:
                        folderFilter === f.name ? "#f0fdfa" : "#ffffff",
                      color:
                        folderFilter === f.name ? "#0f766e" : "#475569",
                      cursor: "pointer",
                    }}
                  >
                    <Folder size={12} />
                    <span>
                      {f.name} ({f.count})
                    </span>
                  </button>
                ))}

                {syncingAllDocs && (
                  <span
                    style={{
                      marginLeft: "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: "#0f766e",
                    }}
                  >
                    <Loader2 size={12} className="animate-spin" />
                    <span>Đang tải toàn bộ lịch sử kho CamScanner...</span>
                  </span>
                )}
              </div>
            )}

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

            {/* Bảng danh sách tài liệu trên CamScanner Cloud — Cột tên file thu gọn & Nút chức năng nằm ngay sau cột tên file */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              {loadingDocs ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "#475569",
                  }}
                >
                  <Loader2
                    size={24}
                    className="animate-spin"
                    style={{ margin: "0 auto 8px", color: "#0d9488" }}
                  />
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    Đang đồng bộ danh sách bản scan từ CamScanner Cloud...
                  </div>
                </div>
              ) : filteredDocs.length === 0 ? (
                <div
                  style={{
                    padding: "36px 20px",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Không tìm thấy bản scan nào khớp với bộ lọc
                  </div>
                  <div style={{ fontSize: "12.5px" }}>
                    Hãy thử xóa từ khóa tìm kiếm, chọn tab{" "}
                    <b>Tất cả tài liệu</b> hoặc bấm <b>Tìm / Làm mới</b>.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: embedded ? "600px" : "430px",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  <table className="cs-cloud-table">
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
                        <th
                          style={{
                            width: "40px",
                            textAlign: "center",
                          }}
                        >
                          #
                        </th>
                        <th
                          style={{
                            width: isHubMode ? "220px" : "210px",
                          }}
                        >
                          Tên bản scan
                        </th>
                        <th
                          style={{
                            width: isHubMode ? "350px" : "150px",
                            textAlign: "center",
                          }}
                        >
                          {isHubMode
                            ? "Chức năng (Xem / Tạo phiếu từ file scan)"
                            : "Chức năng"}
                        </th>
                        <th style={{ width: "120px" }}>Thư mục</th>
                        <th
                          style={{
                            width: "90px",
                            textAlign: "center",
                          }}
                        >
                          Định dạng
                        </th>
                        <th
                          style={{
                            width: "122px",
                            textAlign: "center",
                          }}
                        >
                          Cập nhật
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocs.map((doc, idx) => {
                        const isImporting = importingDocId === doc.cs_doc_id;
                        const isPreviewing =
                          previewDoc?.cs_doc_id === doc.cs_doc_id;
                        return (
                          <tr
                            key={doc.cs_doc_id || idx}
                            onMouseEnter={() => handleRowMouseEnter(doc)}
                            onMouseLeave={handleRowMouseLeave}
                            style={{
                              borderBottom: "1px solid #f1f5f9",
                              background: isPreviewing
                                ? "#f0fdfa"
                                : idx % 2 === 0
                                ? "#ffffff"
                                : "#fcfdfe",
                              transition: "background 0.12s ease",
                            }}
                          >
                            {/* 1. STT */}
                            <td
                              style={{
                                textAlign: "center",
                                color: "#64748b",
                                fontWeight: 600,
                              }}
                            >
                              {idx + 1}
                            </td>

                            {/* 2. Tên bản scan (Thu gọn kích thước vừa vặn, cắt gọn nếu quá dài) */}
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  cursor: "pointer",
                                  overflow: "hidden",
                                }}
                                onClick={() => handlePinPreview(doc)}
                                title={`${doc.title} — Rê chuột để xem trước nhanh, click để ghim xem trước`}
                              >
                                <FileText
                                  size={14}
                                  style={{ color: "#0d9488", flexShrink: 0 }}
                                />
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    fontWeight: 600,
                                    color: "#0f172a",
                                  }}
                                >
                                  {doc.title}
                                </span>
                              </div>
                            </td>

                            {/* 3. Cột các nút chức năng (Nằm ngay sau cột tên file!) */}
                            <td style={{ textAlign: "center" }}>
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "4px",
                                  flexWrap: "nowrap",
                                }}
                              >
                                <button
                                  type="button"
                                  className="cs-cloud-act-btn btn"
                                  onClick={() => handlePinPreview(doc)}
                                  title="Xem trước bản scan này"
                                  style={{
                                    border: isPreviewing
                                      ? "1px solid #0d9488"
                                      : "1px solid #cbd5e1",
                                    background: isPreviewing
                                      ? "#ccfbf1"
                                      : "#f8fafc",
                                    color: isPreviewing ? "#0f766e" : "#334155",
                                  }}
                                >
                                  <Eye size={12} />
                                  <span>Xem</span>
                                </button>

                                {isHubMode ? (
                                  <>
                                    <button
                                      type="button"
                                      className="cs-cloud-act-btn btn"
                                      disabled={!!importingDocId}
                                      onClick={() =>
                                        void handleImportDoc(doc, "pr")
                                      }
                                      title="Tạo Phiếu yêu cầu mua hàng (PR) mới kèm bản scan này"
                                      style={{
                                        border: "1px solid #93c5fd",
                                        background: "#eff6ff",
                                        color: "#1d4ed8",
                                      }}
                                    >
                                      {isImporting &&
                                      importingAction === "pr" ? (
                                        <Loader2
                                          size={11}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <Plus size={11} />
                                      )}
                                      <span>Tạo PR</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="cs-cloud-act-btn btn"
                                      disabled={!!importingDocId}
                                      onClick={() =>
                                        void handleImportDoc(doc, "payment")
                                      }
                                      title="Tạo Đề nghị thanh toán (ĐNTT) mới kèm bản scan này"
                                      style={{
                                        border: "1px solid #6ee7b7",
                                        background: "#ecfdf5",
                                        color: "#047857",
                                      }}
                                    >
                                      {isImporting &&
                                      importingAction === "payment" ? (
                                        <Loader2
                                          size={11}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <CreditCard size={11} />
                                      )}
                                      <span>ĐNTT</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="cs-cloud-act-btn btn"
                                      disabled={!!importingDocId}
                                      onClick={() =>
                                        void handleImportDoc(doc, "handover")
                                      }
                                      title="Tạo Đợt / Biên bản bàn giao mới kèm bản scan này"
                                      style={{
                                        border: "1px solid #fcd34d",
                                        background: "#fffbeb",
                                        color: "#b45309",
                                      }}
                                    >
                                      {isImporting &&
                                      importingAction === "handover" ? (
                                        <Loader2
                                          size={11}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <Truck size={11} />
                                      )}
                                      <span>BB bàn giao</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="cs-cloud-act-btn btn"
                                      disabled={!!importingDocId}
                                      onClick={() =>
                                        void handleImportDoc(doc, "vault")
                                      }
                                      title="Lưu bản scan này vào Kho dữ liệu chung"
                                      style={{
                                        border: "1px solid #cbd5e1",
                                        background: "#ffffff",
                                        color: "#334155",
                                      }}
                                    >
                                      {isImporting &&
                                      importingAction === "vault" ? (
                                        <Loader2
                                          size={11}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <FolderPlus size={11} />
                                      )}
                                      <span>Lưu kho</span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="cs-cloud-act-btn btn"
                                    disabled={!!importingDocId}
                                    onClick={() => void handleImportDoc(doc)}
                                    style={{
                                      border: "1px solid #0d9488",
                                      background: isImporting
                                        ? "#0f766e"
                                        : "#0d9488",
                                      color: "#ffffff",
                                    }}
                                  >
                                    {isImporting ? (
                                      <>
                                        <Loader2
                                          size={11}
                                          className="animate-spin"
                                        />
                                        <span>Đang lấy...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Check size={12} />
                                        <span>Chọn</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* 4. Thư mục */}
                            <td title={doc.dir_title || "Thư mục gốc"}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "11.5px",
                                  color: "#475569",
                                }}
                              >
                                <Folder
                                  size={12}
                                  style={{ color: "#64748b", flexShrink: 0 }}
                                />
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {doc.dir_title || "Thư mục gốc"}
                                </span>
                              </span>
                            </td>

                            {/* 5. Định dạng */}
                            <td style={{ textAlign: "center" }}>
                              <span
                                style={{
                                  fontSize: "10.5px",
                                  fontWeight: 700,
                                  padding: "2px 6px",
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

                            {/* 6. Cập nhật */}
                            <td
                              style={{
                                textAlign: "center",
                                color: "#475569",
                                fontSize: "11.5px",
                              }}
                            >
                              {formatCsTime(
                                doc.modify_time || doc.create_time
                              )}
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
          padding: "10px 18px",
          background: "#ffffff",
          borderTop: "1px solid #e2e8f0",
          fontSize: "12px",
          color: "#64748b",
        }}
      >
        <div>
          {authenticated
            ? `Đang hiển thị ${filteredDocs.length} / ${docs.length} tài liệu trên Cloud CamScanner${
                syncingAllDocs ? " (Đang tải tiếp các trang cũ...)" : ""
              }${csUserId ? ` · ID: ${csUserId}` : ""}`
            : "Tích hợp trực tiếp qua giao thức CamScanner Cloud API"}
        </div>
        {!embedded && (
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
        )}
      </div>

      {/* Popup Xem trước (Hover / Click Preview) trực tiếp bản scan từ CamScanner Cloud (Có thể kéo mở rộng kích thước & di chuyển) */}
      {previewDoc && (
        <div
          ref={previewCardRef}
          onMouseEnter={() => {
            isHoveringPopupRef.current = true;
            if (closePreviewTimerRef.current) {
              clearTimeout(closePreviewTimerRef.current);
              closePreviewTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            isHoveringPopupRef.current = false;
            if (!previewPinned && !isInteractingPreview) {
              closePreviewTimerRef.current = setTimeout(() => {
                setPreviewDoc(null);
              }, 280);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            right: previewMaximized ? "2vw" : `${previewRect.right}px`,
            top: previewMaximized
              ? "3vh"
              : previewRect.top !== null
              ? `${previewRect.top}px`
              : "50%",
            transform:
              previewMaximized || previewRect.top !== null
                ? "none"
                : "translateY(-50%)",
            width: previewMaximized
              ? "96vw"
              : `min(${previewRect.width}px, 95vw)`,
            height: previewMaximized
              ? "94vh"
              : `min(${previewRect.height}px, 94vh)`,
            background: "#ffffff",
            borderRadius: "14px",
            border: "2px solid #0d9488",
            boxShadow: "0 24px 48px rgba(15, 23, 42, 0.35)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 2147483645,
            userSelect: isInteractingPreview ? "none" : "auto",
          }}
        >
          {/* Các thanh kéo mở rộng kích thước (Resize Handles 8 hướng: 4 cạnh + 4 góc) */}
          {!previewMaximized && (
            <>
              {/* Cạnh trái (Kéo sang trái để mở rộng popup) */}
              <div
                onMouseDown={(e) => startResizePreview(e, "w")}
                title="Kéo sang trái để mở rộng khung xem trước"
                style={{
                  position: "absolute",
                  left: 0,
                  top: "14px",
                  bottom: "14px",
                  width: "10px",
                  cursor: "ew-resize",
                  zIndex: 25,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "4px",
                    height: "44px",
                    borderRadius: "999px",
                    background: "rgba(13, 148, 136, 0.55)",
                    boxShadow: "0 0 4px rgba(255,255,255,0.8)",
                  }}
                />
              </div>

              {/* Cạnh phải */}
              <div
                onMouseDown={(e) => startResizePreview(e, "e")}
                title="Kéo cạnh phải để thay đổi chiều rộng"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "14px",
                  bottom: "14px",
                  width: "8px",
                  cursor: "ew-resize",
                  zIndex: 25,
                }}
              />

              {/* Cạnh trên */}
              <div
                onMouseDown={(e) => startResizePreview(e, "n")}
                title="Kéo cạnh trên để mở rộng chiều cao"
                style={{
                  position: "absolute",
                  top: 0,
                  left: "14px",
                  right: "14px",
                  height: "7px",
                  cursor: "ns-resize",
                  zIndex: 25,
                }}
              />

              {/* Cạnh dưới */}
              <div
                onMouseDown={(e) => startResizePreview(e, "s")}
                title="Kéo cạnh dưới để mở rộng chiều cao"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: "14px",
                  right: "14px",
                  height: "9px",
                  cursor: "ns-resize",
                  zIndex: 25,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "4px",
                    borderRadius: "999px",
                    background: "rgba(13, 148, 136, 0.45)",
                  }}
                />
              </div>

              {/* Góc trên - trái */}
              <div
                onMouseDown={(e) => startResizePreview(e, "nw")}
                title="Kéo góc để mở rộng"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "16px",
                  height: "16px",
                  cursor: "nwse-resize",
                  zIndex: 26,
                }}
              />

              {/* Góc trên - phải */}
              <div
                onMouseDown={(e) => startResizePreview(e, "ne")}
                title="Kéo góc để mở rộng"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: "16px",
                  height: "16px",
                  cursor: "nesw-resize",
                  zIndex: 26,
                }}
              />

              {/* Góc dưới - trái (Góc kéo mở rộng chính thuận tiện nhất) */}
              <div
                onMouseDown={(e) => startResizePreview(e, "sw")}
                title="Kéo góc dưới trái để mở rộng cả chiều ngang và chiều dọc"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "20px",
                  height: "20px",
                  cursor: "nesw-resize",
                  zIndex: 26,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "flex-start",
                  padding: "3px",
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderLeft: "3px solid #0d9488",
                    borderBottom: "3px solid #0d9488",
                    borderBottomLeftRadius: "4px",
                  }}
                />
              </div>

              {/* Góc dưới - phải */}
              <div
                onMouseDown={(e) => startResizePreview(e, "se")}
                title="Kéo góc dưới phải để mở rộng"
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "20px",
                  height: "20px",
                  cursor: "nwse-resize",
                  zIndex: 26,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "flex-end",
                  padding: "3px",
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRight: "3px solid #0d9488",
                    borderBottom: "3px solid #0d9488",
                    borderBottomRightRadius: "4px",
                  }}
                />
              </div>
            </>
          )}

          {/* Header của Popup Xem trước (Có thể kéo di chuyển vị trí) */}
          <div
            onMouseDown={startDragPreview}
            style={{
              padding: "10px 14px",
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              cursor: previewMaximized ? "default" : "move",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={previewDoc.title}
                >
                  👁 {previewDoc.title}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#94a3b8",
                    marginTop: "2px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    📁 {previewDoc.dir_title || "Thư mục gốc"} ·{" "}
                    {formatCsTime(
                      previewDoc.modify_time || previewDoc.create_time
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#5eead4",
                      background: "rgba(13, 148, 136, 0.22)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      border: "1px solid rgba(94, 234, 212, 0.25)",
                    }}
                  >
                    ↔ Kéo cạnh/góc để mở rộng
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPinned(true);
                    setPreviewMaximized((prev) => !prev);
                  }}
                  title={
                    previewMaximized
                      ? "Thu nhỏ về kích thước tùy chỉnh"
                      : "Phóng to toàn màn hình"
                  }
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {previewMaximized ? (
                    <Minimize2 size={13} />
                  ) : (
                    <Maximize2 size={13} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreviewPinned(false);
                    setPreviewMaximized(false);
                    setPreviewDoc(null);
                  }}
                  title="Đóng xem trước"
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Thanh nút hành động nhanh ngay trên Popup Xem trước */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
              }}
            >
              {isHubMode ? (
                <>
                  <button
                    type="button"
                    disabled={!!importingDocId}
                    onClick={() => void handleImportDoc(previewDoc, "pr")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #3b82f6",
                      background: "#2563eb",
                      color: "#ffffff",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: importingDocId ? "wait" : "pointer",
                    }}
                  >
                    <Plus size={12} /> Tạo PR
                  </button>
                  <button
                    type="button"
                    disabled={!!importingDocId}
                    onClick={() => void handleImportDoc(previewDoc, "payment")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #10b981",
                      background: "#059669",
                      color: "#ffffff",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: importingDocId ? "wait" : "pointer",
                    }}
                  >
                    <CreditCard size={12} /> Tạo ĐNTT
                  </button>
                  <button
                    type="button"
                    disabled={!!importingDocId}
                    onClick={() => void handleImportDoc(previewDoc, "handover")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #f59e0b",
                      background: "#d97706",
                      color: "#ffffff",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: importingDocId ? "wait" : "pointer",
                    }}
                  >
                    <Truck size={12} /> Tạo BB bàn giao
                  </button>
                  <button
                    type="button"
                    disabled={!!importingDocId}
                    onClick={() => void handleImportDoc(previewDoc, "vault")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #475569",
                      background: "#334155",
                      color: "#ffffff",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: importingDocId ? "wait" : "pointer",
                    }}
                  >
                    <FolderPlus size={12} /> Lưu kho
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!!importingDocId}
                  onClick={() => void handleImportDoc(previewDoc)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "5px 12px",
                    borderRadius: "6px",
                    border: "1px solid #14b8a6",
                    background: "#0d9488",
                    color: "#ffffff",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: importingDocId ? "wait" : "pointer",
                  }}
                >
                  {importingDocId === previewDoc.cs_doc_id ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Đang lấy...</span>
                    </>
                  ) : (
                    <>
                      <Check size={13} />
                      <span>Chọn bản scan này</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Nội dung file PDF xem trước */}
          <div
            style={{ flex: 1, position: "relative", background: "#f1f5f9" }}
          >
            {/* Lớp chắn trong suốt khi đang kéo chuột mở rộng/di chuyển để iframe không nuốt sự kiện chuột */}
            {isInteractingPreview && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 15,
                  background: "transparent",
                }}
              />
            )}
            {previewFrameLoading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(248, 250, 252, 0.92)",
                  zIndex: 2,
                  color: "#0f766e",
                  gap: "8px",
                }}
              >
                <Loader2 size={26} className="animate-spin" />
                <span style={{ fontSize: "12.5px", fontWeight: 700 }}>
                  Đang tải bản xem trước từ CamScanner Cloud...
                </span>
              </div>
            )}
            <iframe
              key={previewDoc.cs_doc_id}
              src={`/api/camscanner?action=preview&csDocId=${encodeURIComponent(
                previewDoc.cs_doc_id
              )}&token=${encodeURIComponent(
                localToken
              )}#toolbar=0&navpanes=0&view=FitH`}
              title={`Xem trước ${previewDoc.title}`}
              onLoad={() => setPreviewFrameLoading(false)}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                display: "block",
                pointerEvents: isInteractingPreview ? "none" : "auto",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return mainContent;
  }

  return createPortal(
    <div
      className="payment-modal-overlay"
      style={{ zIndex: 2147483640 }}
      onClick={(e) => e.stopPropagation()}
    >
      {mainContent}
    </div>,
    document.body
  );
}
export default CamScannerCloudModal;
