"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FolderOpen,
  Search,
  Eye,
  Printer,
  Share2,
  Download,
  Upload,
  Camera,
  FileText,
  Package,
  Receipt,
  Truck,
  CreditCard,
  FileCheck,
  CheckSquare,
  ExternalLink,
  RefreshCw,
  Trash2,
  Loader2,
  X,
  Cloud,
} from "lucide-react";
import {
  PR,
  PO,
  Supplier,
  ApprovalRequest,
  PaymentRequestEntry,
  PaymentHandoverItem,
} from "../types";
import { compressUploadFile } from "../utils/compressUploadFile";
import {
  PRScanPreviewModal,
  printScanFileUrl,
  createScanShareUrl,
} from "./PRScanPreviewModal";
import { ShareFileModal } from "./ShareFileModal";
import { CamScannerCloudModal } from "./CamScannerCloudModal";
import { navigateTo, AppRoute } from "../utils/navigation";
import { useIsMobile } from "../useIsMobile";

export type VaultCategoryId =
  | "all"
  | "pr"
  | "dnpd"
  | "po"
  | "contract"
  | "invoice"
  | "handover"
  | "payment";

export interface VaultItem {
  uid: string;
  category: Exclude<VaultCategoryId, "all">;
  categoryLabel: string;
  fileName: string;
  subLabel?: string;
  fileUrl: string;
  docCode: string;
  relatedInfo: string;
  partyOrDept: string;
  dateStr: string;
  sortTime: number;
  note: string;
  sizeBytes?: number;
  r2FileId?: string;
  route?: AppRoute;
}

interface R2FileRecord {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  documentType?: string;
  expiresAt?: string;
  status?: string;
  note?: string;
}

export interface DataVaultProps {
  workspaceId: string;
  prs: PR[];
  pos: PO[];
  suppliers: Supplier[];
  approvalRequests: ApprovalRequest[];
  paymentRequests: PaymentRequestEntry[];
  paymentHandovers: PaymentHandoverItem[];
  readOnly?: boolean;
  onStatus?: (msg: string) => void;
}

const CATEGORY_DEFS: {
  id: VaultCategoryId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}[] = [
  { id: "all", label: "Tất cả tài liệu", shortLabel: "Tất cả", icon: <FolderOpen size={14} /> },
  { id: "pr", label: "PR (Yêu cầu mua hàng)", shortLabel: "PR", icon: <FileText size={14} /> },
  { id: "dnpd", label: "ĐNPD & Báo giá", shortLabel: "ĐNPD", icon: <CheckSquare size={14} /> },
  { id: "po", label: "PO (Đơn đặt hàng)", shortLabel: "PO", icon: <Package size={14} /> },
  { id: "contract", label: "Hợp đồng", shortLabel: "Hợp đồng", icon: <FileCheck size={14} /> },
  { id: "invoice", label: "Hóa đơn GTGT", shortLabel: "Hóa đơn", icon: <Receipt size={14} /> },
  { id: "handover", label: "BB bàn giao", shortLabel: "BB bàn giao", icon: <Truck size={14} /> },
  { id: "payment", label: "ĐNTT (Thanh toán)", shortLabel: "ĐNTT", icon: <CreditCard size={14} /> },
];

/**
 * Trích xuất ngày PR từ pr.date, hoặc suy luận từ mã PR (VD: QC261106.1 -> 06/11/2026, RD20261026002 -> 26/10/2026, 2810WH -> 28/10/2026)
 */
function resolvePRDateStr(pr: PR): string {
  const direct = (pr.date || (pr as any).createdDate || "").trim();
  if (direct) return direct;

  const num = (pr.number || "").trim();
  // Pattern 1: DD.MM.YYYY hoặc DD.MM/YYYY (e.g. 10.02/2026/D, 10.03.2026 TĐSH)
  const dmyMatch = num.match(/(\d{2})[\.\/\-](\d{2})[\.\/\-](20\d{2})/);
  if (dmyMatch) {
    return `${dmyMatch[1]}/${dmyMatch[2]}/${dmyMatch[3]}`;
  }
  // Pattern 2: YYYYMMDD (e.g. RD20261026002)
  const ymd8 = num.match(/(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
  if (ymd8) {
    return `${ymd8[3]}/${ymd8[2]}/${ymd8[1]}`;
  }
  // Pattern 3: YYMMDD (e.g. QC261106.1, QC260122.01)
  const ymd6 = num.match(/(2[4-9])(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
  if (ymd6) {
    return `${ymd6[3]}/${ymd6[2]}/20${ymd6[1]}`;
  }
  // Pattern 4: DDMM trong năm 2026 (e.g. 2810WH, EM2710, EM 1910)
  const dm4 = num.match(/(?:^|[^0-9])(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(?:[^0-9]|$)/);
  if (dm4) {
    return `${dm4[1]}/${dm4[2]}/2026`;
  }
  // Pattern 5: Timestamp ID
  if (pr.id && pr.id > 1500000000000 && pr.id < 3000000000000) {
    const d = new Date(pr.id);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return "";
}

function parseDateToTimestamp(d?: string): number {
  if (!d) return 0;
  const trimmed = d.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const iso = Date.parse(trimmed);
    if (!isNaN(iso)) return iso;
  }
  const parts = trimmed.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime() || 0;
    }
    const year = parts[2].length === 2 ? 2000 + Number(parts[2]) : Number(parts[2]);
    return new Date(year, Number(parts[1]) - 1, Number(parts[0])).getTime() || 0;
  }
  const fallback = Date.parse(trimmed);
  return isNaN(fallback) ? 0 : fallback;
}

function formatDateDisplay(d?: string): string {
  if (!d) return "—";
  const trimmed = d.trim();
  if (!trimmed) return "—";
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    try {
      const dt = new Date(trimmed);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}/${dt.getFullYear()}`;
    } catch {
      return trimmed.slice(0, 10);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split("-");
    return `${day}/${m}/${y}`;
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    return trimmed.replace(/\./g, "/");
  }
  return trimmed;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DataVault({
  workspaceId,
  prs = [],
  pos = [],
  suppliers = [],
  approvalRequests = [],
  paymentRequests = [],
  paymentHandovers = [],
  readOnly = false,
  onStatus,
}: DataVaultProps) {
  const isMobile = useIsMobile(768);
  const [activeCategory, setActiveCategory] = useState<VaultCategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [r2Files, setR2Files] = useState<R2FileRecord[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Preview & Share Modal state
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);
  const [shareState, setShareState] = useState<{
    isOpen: boolean;
    shareUrl: string;
    fileName: string;
    entityCode: string;
  } | null>(null);
  const [sharingUid, setSharingUid] = useState<string | null>(null);

  // Upload new document directly into Vault
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [camScannerOpen, setCamScannerOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<Exclude<VaultCategoryId, "all">>("invoice");
  const [uploadDocCode, setUploadDocCode] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadR2Files = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/files?workspace=${encodeURIComponent(workspaceId)}`);
      if (!res.ok) return;
      const body: any = await res.json();
      if (Array.isArray(body.files)) {
        setR2Files(body.files);
      }
    } catch {
      // Ignore silent fetch error in report mode
    } finally {
      setLoadingFiles(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadR2Files();
  }, [loadR2Files]);

  const supplierMap = useMemo(() => {
    const map = new Map<number, Supplier>();
    suppliers.forEach((s) => map.set(Number(s.id), s));
    return map;
  }, [suppliers]);

  // Hợp nhất toàn bộ các file/ảnh được tải lên từ mọi phân hệ
  const allVaultItems = useMemo<VaultItem[]>(() => {
    const list: VaultItem[] = [];
    const seenUrls = new Set<string>();

    // 1. Bản scan PR (từ prs[].scan_file_url) -> Lấy số PR làm tên PR luôn, lấy ngày từ pr.date
    prs.forEach((pr) => {
      if (!pr.scan_file_url) return;
      const url = pr.scan_file_url.trim();
      if (!url) return;
      seenUrls.add(url);

      const prNumber = (pr.number || `PR-${pr.id}`).trim();
      const prDate = resolvePRDateStr(pr);

      list.push({
        uid: `pr-scan-${pr.id}`,
        category: "pr",
        categoryLabel: "PR",
        fileName: prNumber,
        fileUrl: url,
        docCode: prNumber,
        relatedInfo: `${pr.items?.length || 0} mặt hàng`,
        partyOrDept: pr.department || "Chưa rõ bộ phận",
        dateStr: prDate,
        sortTime: parseDateToTimestamp(prDate) || pr.id,
        note: pr.purpose || pr.note || "",
        route: { view: "compare", prId: pr.id },
      });
    });

    // 2. Bản scan Hóa đơn GTGT từ các đợt thanh toán PO (po.payments[].invoiceScanUrl)
    const invoiceByUrl = new Map<string, VaultItem>();

    pos.forEach((po) => {
      const sup = supplierMap.get(Number(po.supplierId));
      (po.payments || []).forEach((pay) => {
        if (!pay.invoiceScanUrl) return;
        const url = pay.invoiceScanUrl.trim();
        if (!url) return;

        const invNo = (pay.invoiceNo || "").trim();
        const linkedDntt = pay.paymentRequestId
          ? paymentRequests.find((r) => r.id === pay.paymentRequestId)
          : undefined;
        const displayTitle = invNo
          ? `HĐ GTGT #${invNo} (PO: ${po.number})`
          : pay.invoiceScanName || `Hóa đơn PO #${po.number}`;

        const item: VaultItem = {
          uid: `po-inv-${po.id}-${pay.id}`,
          category: "invoice",
          categoryLabel: "Hóa đơn",
          fileName: displayTitle,
          subLabel:
            pay.invoiceScanName && pay.invoiceScanName !== displayTitle
              ? pay.invoiceScanName
              : undefined,
          fileUrl: url,
          docCode: invNo ? `HĐ ${invNo}` : `PO ${po.number}`,
          relatedInfo: [
            `PO: ${po.number}`,
            linkedDntt ? `ĐNTT #${linkedDntt.legacy_stt || linkedDntt.id}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          partyOrDept: sup?.name || linkedDntt?.payee_name || "Chưa rõ NCC",
          dateStr: pay.invoiceDate || pay.date || po.createdDate || "",
          sortTime:
            parseDateToTimestamp(pay.invoiceDate || pay.date || po.createdDate) || po.id,
          note: pay.note || pay.phase || "",
          route: { view: "po-detail", id: po.id },
        };
        invoiceByUrl.set(url, item);
        seenUrls.add(url);
      });
    });

    // 3. Bản scan Hóa đơn GTGT từ Đề nghị thanh toán (paymentRequests)
    paymentRequests.forEach((req) => {
      const topUrl = (req.invoice_scan_url || "").trim();
      const dnttNo = req.legacy_stt || req.id;
      if (topUrl && !invoiceByUrl.has(topUrl)) {
        const invNo = (req.invoice_no || "").trim();
        const displayTitle = invNo
          ? `HĐ GTGT #${invNo} (ĐNTT #${dnttNo})`
          : req.invoice_scan_name || `Hóa đơn ĐNTT #${dnttNo}`;
        invoiceByUrl.set(topUrl, {
          uid: `dntt-inv-${req.id}`,
          category: "invoice",
          categoryLabel: "Hóa đơn",
          fileName: displayTitle,
          subLabel:
            req.invoice_scan_name && req.invoice_scan_name !== displayTitle
              ? req.invoice_scan_name
              : undefined,
          fileUrl: topUrl,
          docCode: invNo ? `HĐ ${invNo}` : `ĐNTT #${dnttNo}`,
          relatedInfo: [
            `ĐNTT #${dnttNo}`,
            req.group_code ? `PO/HĐ: ${req.group_code}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          partyOrDept: req.payee_name || "Chưa rõ đơn vị",
          dateStr: req.invoice_date || req.request_date || "",
          sortTime: parseDateToTimestamp(req.invoice_date || req.request_date) || req.id,
          note: req.description || req.item_name || "",
          route: { view: "payment", id: req.id },
        });
        seenUrls.add(topUrl);
      }

      (req.lines || []).forEach((line, lIdx) => {
        const lineUrl = (line.invoice_scan_url || "").trim();
        if (!lineUrl || invoiceByUrl.has(lineUrl)) return;
        const invNo = (line.invoice_no || req.invoice_no || "").trim();
        const displayTitle = invNo
          ? `HĐ GTGT #${invNo} (ĐNTT #${dnttNo})`
          : line.invoice_scan_name || `Hóa đơn ĐNTT #${dnttNo}`;
        invoiceByUrl.set(lineUrl, {
          uid: `dntt-line-inv-${req.id}-${lIdx}`,
          category: "invoice",
          categoryLabel: "Hóa đơn",
          fileName: displayTitle,
          subLabel:
            line.invoice_scan_name && line.invoice_scan_name !== displayTitle
              ? line.invoice_scan_name
              : undefined,
          fileUrl: lineUrl,
          docCode: invNo ? `HĐ ${invNo}` : `ĐNTT #${dnttNo}`,
          relatedInfo: `ĐNTT #${dnttNo}${req.group_code ? ` · ${req.group_code}` : ""}`,
          partyOrDept: req.payee_name || "Chưa rõ đơn vị",
          dateStr: line.invoice_date || req.invoice_date || req.request_date || "",
          sortTime:
            parseDateToTimestamp(line.invoice_date || req.invoice_date || req.request_date) ||
            req.id,
          note: line.description || req.description || "",
          route: { view: "payment", id: req.id },
        });
        seenUrls.add(lineUrl);
      });
    });

    invoiceByUrl.forEach((item) => list.push(item));

    // 4. File / Ảnh chụp Biên bản bàn giao từ các Đợt bàn giao (paymentHandovers)
    const handoverByUrl = new Map<
      string,
      { first: PaymentHandoverItem; count: number; maxId: number }
    >();
    paymentHandovers.forEach((h) => {
      const url = (h.handover_scan_url || "").trim();
      if (!url) return;
      const existing = handoverByUrl.get(url);
      if (existing) {
        existing.count += 1;
        existing.maxId = Math.max(existing.maxId, Number(h.id) || 0);
      } else {
        handoverByUrl.set(url, { first: h, count: 1, maxId: Number(h.id) || 0 });
      }
    });

    handoverByUrl.forEach(({ first, count, maxId }, url) => {
      seenUrls.add(url);
      const srcNum = (first.source_number || "").trim();
      const srcType = (first.source_type || (srcNum ? "PO" : "")).trim();
      const displayTitle = srcNum
        ? `BB bàn giao ${srcType} #${srcNum}`
        : first.handover_scan_name || `BB bàn giao (${first.department || "Vật tư"})`;
      list.push({
        uid: `handover-scan-${maxId}`,
        category: "handover",
        categoryLabel: "BB bàn giao",
        fileName: displayTitle,
        subLabel:
          first.handover_scan_name && first.handover_scan_name !== displayTitle
            ? first.handover_scan_name
            : undefined,
        fileUrl: url,
        docCode: srcNum ? `${srcType} ${srcNum}` : `Đợt BG #${maxId}`,
        relatedInfo: `${count} mặt hàng bàn giao`,
        partyOrDept: `${first.department || "Chưa rõ"}${
          first.receiver_name ? ` (${first.receiver_name})` : ""
        }`,
        dateStr: first.handover_date || "",
        sortTime: parseDateToTimestamp(first.handover_date) || maxId,
        note: `Bên giao: ${first.sender_name || "Trần Hải Hà"}${
          first.note ? ` · ${first.note}` : ""
        }`,
        route: { view: "handover" },
      });
    });

    // 5. Các hồ sơ tải lên qua DocumentManager & Kho dữ liệu (/api/files)
    r2Files.forEach((f) => {
      const fileUrl = `/api/files/${encodeURIComponent(f.id)}`;
      if (seenUrls.has(fileUrl)) return;

      const docType = (f.documentType || "").trim();
      const entType = (f.entityType || "").trim().toLowerCase();

      let category: Exclude<VaultCategoryId, "all"> = "po";
      let categoryLabel = docType || "PO";

      if (docType === "Hóa đơn" || entType === "invoice") {
        category = "invoice";
        categoryLabel = "Hóa đơn";
      } else if (docType === "Hợp đồng" || entType === "contract") {
        category = "contract";
        categoryLabel = "Hợp đồng";
      } else if (docType === "Biên bản giao nhận" || entType === "handover") {
        category = "handover";
        categoryLabel = "BB bàn giao";
      } else if (docType === "Hồ sơ thanh toán" || entType === "payment") {
        category = "payment";
        categoryLabel = "ĐNTT";
      } else if (docType === "Báo giá" || entType === "dnpd" || entType === "quote") {
        category = "dnpd";
        categoryLabel = docType || "ĐNPD";
      } else if (entType === "pr") {
        category = "pr";
        categoryLabel = "PR";
      } else {
        category = "po";
        categoryLabel = docType || "PO";
      }

      // Tra cứu thông tin chứng từ gốc
      let docCode = f.entityId && f.entityId !== "0" ? f.entityId : "";
      let displayTitle = f.fileName || docCode || "Tài liệu";
      let subLabel: string | undefined;
      let partyOrDept = "—";
      let relatedInfo = docType || "";
      let resolvedDate = f.uploadedAt || "";
      let route: AppRoute | undefined;

      if (entType === "pr") {
        const matchedPR = prs.find(
          (p) => String(p.id) === String(f.entityId) || p.number === f.entityId
        );
        if (matchedPR) {
          docCode = matchedPR.number;
          displayTitle = matchedPR.number;
          if (f.fileName && f.fileName !== matchedPR.number) {
            subLabel = f.fileName;
          }
          partyOrDept = matchedPR.department || "—";
          relatedInfo = `${matchedPR.items?.length || 0} mặt hàng`;
          resolvedDate = resolvePRDateStr(matchedPR) || f.uploadedAt || "";
          route = { view: "compare", prId: matchedPR.id };
        }
      } else if (entType === "po" || entType === "contract") {
        const matchedPO = pos.find(
          (p) =>
            String(p.id) === String(f.entityId) ||
            p.number === f.entityId ||
            (p as any).contractNumber === f.entityId
        );
        if (matchedPO) {
          const sup = supplierMap.get(Number(matchedPO.supplierId));
          docCode = matchedPO.number;
          displayTitle =
            f.fileName && f.fileName !== "upload-scan"
              ? `${matchedPO.number} · ${f.fileName}`
              : matchedPO.number;
          partyOrDept = sup?.name || "—";
          relatedInfo = `PO #${matchedPO.number}`;
          resolvedDate = matchedPO.createdDate || f.uploadedAt || "";
          route = {
            view: category === "contract" ? "contracts" : "po-detail",
            id: matchedPO.id,
          };
        }
      } else if (entType === "dnpd") {
        const matchedApp = approvalRequests.find(
          (a) => String(a.id) === String(f.entityId) || a.number === f.entityId
        );
        if (matchedApp) {
          docCode = matchedApp.number;
          displayTitle = `${matchedApp.number} · ${f.fileName}`;
          partyOrDept = matchedApp.department || "—";
          resolvedDate = matchedApp.createdDate || f.uploadedAt || "";
          route = { view: "approval", id: matchedApp.id };
        }
      } else if (entType === "payment") {
        const matchedReq = paymentRequests.find(
          (r) =>
            String(r.id) === String(f.entityId) ||
            String(r.legacy_stt) === String(f.entityId)
        );
        if (matchedReq) {
          docCode = `ĐNTT #${matchedReq.legacy_stt || matchedReq.id}`;
          displayTitle = `${docCode} · ${f.fileName}`;
          partyOrDept = matchedReq.payee_name || "—";
          resolvedDate = matchedReq.request_date || f.uploadedAt || "";
          route = { view: "payment", id: matchedReq.id };
        }
      } else if (docCode && docCode !== "KHO_DU_LIEU" && !displayTitle.includes(docCode)) {
        displayTitle = `${docCode} · ${displayTitle}`;
      }

      list.push({
        uid: `r2-file-${f.id}`,
        category,
        categoryLabel,
        fileName: displayTitle,
        subLabel,
        fileUrl,
        docCode: docCode || displayTitle,
        relatedInfo,
        partyOrDept,
        dateStr: resolvedDate,
        sortTime: parseDateToTimestamp(resolvedDate) || Date.now(),
        note: f.note || "",
        sizeBytes: f.size,
        r2FileId: f.id,
        route,
      });
    });

    return list.sort((a, b) => b.sortTime - a.sortTime);
  }, [prs, pos, supplierMap, paymentRequests, paymentHandovers, approvalRequests, r2Files]);

  // Đếm số lượng theo từng danh mục
  const categoryCounts = useMemo(() => {
    const counts: Record<VaultCategoryId, number> = {
      all: allVaultItems.length,
      pr: 0,
      dnpd: 0,
      po: 0,
      contract: 0,
      invoice: 0,
      handover: 0,
      payment: 0,
    };
    allVaultItems.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, [allVaultItems]);

  // Lọc theo danh mục và từ khóa tìm kiếm
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allVaultItems.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        item.fileName,
        item.subLabel || "",
        item.docCode,
        item.relatedInfo,
        item.partyOrDept,
        item.note,
        item.categoryLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allVaultItems, activeCategory, searchQuery]);

  const handleShareItem = async (item: VaultItem) => {
    if (sharingUid) return;
    setSharingUid(item.uid);
    try {
      const shareUrl = await createScanShareUrl({
        scanUrl: item.fileUrl,
        fileName: item.fileName,
        entityCode: item.docCode || item.fileName || "TAI_LIEU",
        entityType: item.category,
      });
      setShareState({
        isOpen: true,
        shareUrl,
        fileName: item.fileName,
        entityCode: item.docCode || item.fileName || "TAI_LIEU",
      });
    } catch (err: any) {
      alert(err?.message || "Không thể tạo link chia sẻ tài liệu");
    } finally {
      setSharingUid(null);
    }
  };

  const handleDeleteR2File = async (item: VaultItem) => {
    if (!item.r2FileId || readOnly) return;
    if (!confirm(`Bạn có chắc muốn xóa tài liệu "${item.fileName}" khỏi kho dữ liệu?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(item.r2FileId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Xóa file thất bại");
      setR2Files((prev) => prev.filter((x) => x.id !== item.r2FileId));
      onStatus?.(`✓ Đã xóa tài liệu "${item.fileName}"`);
    } catch (err: any) {
      alert(err?.message || "Không thể xóa file");
    }
  };

  const handleUploadNewVaultFile = async (file: File, isFromCamera: boolean) => {
    if (!file) return;
    setUploading(true);
    setUploadProgressText(isFromCamera ? "Đang tối ưu ảnh chụp..." : "Đang tối ưu tài liệu...");
    try {
      const compressed = await compressUploadFile(file, {
        onProgress: (_pct, msg) => setUploadProgressText(msg || "Đang xử lý..."),
      });

      const docTypeMap: Record<Exclude<VaultCategoryId, "all">, string> = {
        pr: "PR",
        dnpd: "Báo giá",
        po: "PO xác nhận",
        contract: "Hợp đồng",
        invoice: "Hóa đơn",
        handover: "Biên bản giao nhận",
        payment: "Hồ sơ thanh toán",
      };

      const finalFileName =
        isFromCamera && (!file.name || file.name === "image.jpg" || file.name === "photo.jpg")
          ? `Anh_${uploadCategory.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.jpg`
          : file.name;

      const formData = new FormData();
      formData.append("file", compressed, finalFileName);
      formData.append("workspaceId", workspaceId);
      formData.append("entityType", uploadCategory);
      formData.append("entityId", uploadDocCode.trim() || "KHO_DU_LIEU");
      formData.append("documentType", docTypeMap[uploadCategory]);
      formData.append("status", "Đã nhận");
      formData.append("note", uploadNote.trim());

      setUploadProgressText("Đang tải lên kho...");
      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });
      const data: any = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Tải tài liệu lên kho thất bại");
      }

      await loadR2Files();
      setUploadModalOpen(false);
      setUploadDocCode("");
      setUploadNote("");
      onStatus?.(`✓ Đã tải "${finalFileName}" lên Kho dữ liệu`);
    } catch (err: any) {
      alert(err?.message || "Lỗi tải tài liệu lên kho");
    } finally {
      setUploading(false);
      setUploadProgressText("");
    }
  };

  return (
    <section
      className="content vault-page"
      style={{
        padding: isMobile ? "12px 10px 80px" : "18px 24px 40px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <style>{`
        .vault-page .vault-header-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          height: 36px !important;
          padding: 0 14px !important;
          font-size: 12.5px !important;
          font-weight: 600 !important;
          border-radius: 8px !important;
          border: 1px solid #cbd5e1 !important;
          background: #ffffff !important;
          color: #1e293b !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: all 0.15s ease !important;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04) !important;
        }
        .vault-page .vault-header-btn:hover {
          background: #f8fafc !important;
          border-color: #94a3b8 !important;
        }
        .vault-page .vault-header-btn.vault-btn-upload {
          background: #eff6ff !important;
          border-color: #93c5fd !important;
          color: #1d4ed8 !important;
          font-weight: 700 !important;
        }
        .vault-page .vault-header-btn.vault-btn-upload:hover {
          background: #dbeafe !important;
          border-color: #60a5fa !important;
        }
        .vault-page .vault-tab-btn {
          display: inline-flex !important;
          align-items: center !important;
          gap: 6px !important;
          height: 34px !important;
          padding: 0 12px !important;
          border-radius: 8px !important;
          border: 1px solid #e2e8f0 !important;
          background: #f8fafc !important;
          color: #475569 !important;
          font-size: 12.5px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: all 0.15s ease !important;
        }
        .vault-page .vault-tab-btn:hover {
          background: #f1f5f9 !important;
          color: #0f172a !important;
          border-color: #cbd5e1 !important;
        }
        .vault-page .vault-tab-btn.active {
          background: #eff6ff !important;
          border-color: #3b82f6 !important;
          color: #1d4ed8 !important;
          font-weight: 700 !important;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.08) !important;
        }
        .vault-page .vault-doc-link {
          display: inline-flex !important;
          align-items: center !important;
          gap: 7px !important;
          background: transparent !important;
          border: none !important;
          padding: 2px 0 !important;
          color: #0f172a !important;
          font-size: 13.5px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          text-align: left !important;
          transition: color 0.15s ease !important;
        }
        .vault-page .vault-doc-link:hover {
          color: #0284c7 !important;
        }
        .vault-page .vault-actions-row {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 5px !important;
          flex-wrap: nowrap !important;
          white-space: nowrap !important;
        }
        .vault-page .vault-action-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 4px !important;
          height: 28px !important;
          padding: 0 9px !important;
          font-size: 11.5px !important;
          font-weight: 600 !important;
          border-radius: 6px !important;
          border: 1px solid #cbd5e1 !important;
          background: #ffffff !important;
          color: #334155 !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          text-decoration: none !important;
          transition: all 0.12s ease !important;
          box-shadow: 0 1px 1px rgba(15, 23, 42, 0.03) !important;
        }
        .vault-page .vault-action-btn:hover {
          background: #f1f5f9 !important;
          border-color: #94a3b8 !important;
          color: #0f172a !important;
        }
        .vault-page .vault-action-btn.btn-view {
          background: #f0f9ff !important;
          border-color: #bae6fd !important;
          color: #0369a1 !important;
          font-weight: 700 !important;
        }
        .vault-page .vault-action-btn.btn-view:hover {
          background: #e0f2fe !important;
          border-color: #7dd3fc !important;
        }
        .vault-page .vault-action-btn.btn-open-doc {
          background: #f8fafc !important;
          border-color: #cbd5e1 !important;
          color: #475569 !important;
        }
        .vault-page .vault-action-btn.btn-open-doc:hover {
          background: #eff6ff !important;
          border-color: #93c5fd !important;
          color: #1d4ed8 !important;
        }
        .vault-page .vault-table tbody tr:hover {
          background: #f8fafc !important;
        }
      `}</style>

      {/* Header & Thanh công cụ gộp gọn gàng */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
        }}
      >
        {/* Hàng 1: Tiêu đề + Nút tải lên / Làm mới */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <FolderOpen size={20} style={{ color: "#0284c7" }} />
              <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                Kho dữ liệu & Chứng từ số hóa
              </h1>
              <span
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "2px 9px",
                  borderRadius: "999px",
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                }}
              >
                {allVaultItems.length} tài liệu
              </span>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "#64748b" }}>
              Tập trung toàn bộ bản scan PR, ĐNPD, PO, Hợp đồng, Hóa đơn GTGT, Biên bản bàn giao và ĐNTT. Click vào tên chứng từ để xem nhanh.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
            <button
              type="button"
              className="vault-header-btn"
              onClick={() => void loadR2Files()}
              disabled={loadingFiles}
              title="Làm mới danh sách tài liệu"
            >
              <RefreshCw size={14} className={loadingFiles ? "animate-spin" : ""} />
              <span>Làm mới</span>
            </button>

            {!readOnly && (
              <button
                type="button"
                className="vault-header-btn vault-btn-upload"
                onClick={() => setUploadModalOpen(true)}
              >
                <Upload size={14} />
                <span>+ Tải tài liệu lên kho</span>
              </button>
            )}
          </div>
        </div>

        {/* Hàng 2: Các tab phân loại (1 dòng gọn gàng) + Ô tìm kiếm */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            paddingTop: "12px",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            {CATEGORY_DEFS.map((cat) => {
              const isActive = activeCategory === cat.id;
              const count = categoryCounts[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`vault-tab-btn ${isActive ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.icon}
                  <span>{cat.shortLabel}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: "999px",
                      background: isActive ? "#dbeafe" : "#e2e8f0",
                      color: isActive ? "#1e40af" : "#475569",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Ô tìm kiếm */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: "1 1 280px",
              maxWidth: isMobile ? "100%" : "420px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "0 10px",
              height: "34px",
            }}
          >
            <Search size={15} style={{ color: "#64748b", flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm số PR, PO, Hóa đơn, Hợp đồng, Nhà cung cấp, Bộ phận..."
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                fontSize: "12.5px",
                color: "#0f172a",
                background: "transparent",
                padding: 0,
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  border: "none",
                  background: "#e2e8f0",
                  color: "#334155",
                  borderRadius: "4px",
                  padding: "1px 6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Xóa
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bảng danh sách tài liệu */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
        }}
      >
        {filteredItems.length === 0 ? (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              color: "#64748b",
              fontSize: "13.5px",
            }}
          >
            <FolderOpen size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <div style={{ fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
              Chưa có tài liệu nào trong mục này
            </div>
            <div>
              Khi bạn tải lên bản scan PR, Hóa đơn GTGT, Biên bản bàn giao, Hợp đồng hoặc PO, toàn bộ tài liệu sẽ tự động hiển thị tại đây.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              className="vault-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #cbd5e1",
                    color: "#334155",
                    fontSize: "12px",
                    fontWeight: 700,
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "11px 10px", width: "48px", textAlign: "center" }}>STT</th>
                  <th style={{ padding: "11px 10px", width: "100px", textAlign: "center" }}>
                    Phân loại
                  </th>
                  <th style={{ padding: "11px 12px", minWidth: "200px" }}>
                    Tên PR / Chứng từ (Click để xem)
                  </th>
                  <th style={{ padding: "11px 12px", minWidth: "150px" }}>
                    Bộ phận / Nhà cung cấp
                  </th>
                  <th style={{ padding: "11px 10px", width: "115px", textAlign: "center" }}>
                    Ngày
                  </th>
                  <th style={{ padding: "11px 12px", minWidth: "220px" }}>
                    Nội dung / Ghi chú
                  </th>
                  <th style={{ padding: "11px 12px", width: "290px", textAlign: "center" }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => (
                  <tr
                    key={item.uid}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: idx % 2 === 0 ? "#ffffff" : "#fcfdfe",
                    }}
                  >
                    {/* STT */}
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "center",
                        fontWeight: 600,
                        color: "#64748b",
                      }}
                    >
                      {idx + 1}
                    </td>

                    {/* Phân loại */}
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "3px 9px",
                          borderRadius: "6px",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          color: "#1e293b",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.categoryLabel}
                      </span>
                    </td>

                    {/* Tên PR / Chứng từ (Click để xem trực tiếp) */}
                    <td style={{ padding: "10px 12px" }}>
                      <button
                        type="button"
                        className="vault-doc-link"
                        onClick={() => setPreviewItem(item)}
                        title="Bấm để mở xem trực tiếp bản scan / tài liệu này"
                      >
                        <FileText size={15} style={{ flexShrink: 0, color: "#0284c7" }} />
                        <span style={{ wordBreak: "break-word" }}>{item.fileName}</span>
                      </button>
                      {(item.subLabel || item.sizeBytes) && (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", paddingLeft: "22px" }}>
                          {item.subLabel ? `${item.subLabel}` : ""}
                          {item.subLabel && item.sizeBytes ? " · " : ""}
                          {item.sizeBytes ? formatFileSize(item.sizeBytes) : ""}
                        </div>
                      )}
                    </td>

                    {/* Bộ phận / Nhà cung cấp */}
                    <td style={{ padding: "10px 12px", color: "#1e293b", fontWeight: 600 }}>
                      {item.partyOrDept || "—"}
                    </td>

                    {/* Ngày */}
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "center",
                        color: "#1e293b",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDateDisplay(item.dateStr)}
                    </td>

                    {/* Nội dung / Ghi chú */}
                    <td style={{ padding: "10px 12px", color: "#475569" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {item.relatedInfo && (
                          <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "12px" }}>
                            {item.relatedInfo}
                          </span>
                        )}
                        {item.note && (
                          <span style={{ fontSize: "12px", color: "#64748b" }}>{item.note}</span>
                        )}
                        {!item.relatedInfo && !item.note && "—"}
                      </div>
                    </td>

                    {/* Thao tác: Tất cả nút nằm gọn trên 1 dòng duy nhất */}
                    <td style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <div className="vault-actions-row">
                        <button
                          type="button"
                          className="vault-action-btn btn-view"
                          onClick={() => setPreviewItem(item)}
                          title="Xem trực tiếp bản scan"
                        >
                          <Eye size={13} />
                          <span>Xem</span>
                        </button>

                        <button
                          type="button"
                          className="vault-action-btn"
                          onClick={() => printScanFileUrl(item.fileUrl, item.fileName)}
                          title="In tài liệu này"
                        >
                          <Printer size={13} />
                          <span>In</span>
                        </button>

                        <button
                          type="button"
                          className="vault-action-btn"
                          onClick={() => void handleShareItem(item)}
                          disabled={sharingUid === item.uid}
                          title="Tạo link hoặc mã QR chia sẻ"
                        >
                          <Share2 size={13} />
                          <span>{sharingUid === item.uid ? "..." : "Chia sẻ"}</span>
                        </button>

                        <a
                          href={item.fileUrl}
                          download={item.fileName}
                          target="_blank"
                          rel="noreferrer"
                          className="vault-action-btn"
                          title="Tải file về máy"
                        >
                          <Download size={13} />
                        </a>

                        {item.route && (
                          <button
                            type="button"
                            className="vault-action-btn btn-open-doc"
                            onClick={() => navigateTo(item.route!)}
                            title="Mở phiếu gốc trong hệ thống"
                          >
                            <ExternalLink size={12} />
                            <span>Mở phiếu</span>
                          </button>
                        )}

                        {item.r2FileId && !readOnly && (
                          <button
                            type="button"
                            className="vault-action-btn"
                            onClick={() => void handleDeleteR2File(item)}
                            title="Xóa file khỏi kho dữ liệu"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tải tài liệu mới lên Kho dữ liệu */}
      {uploadModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="payment-modal-overlay">
            <div
              className="payment-modal-card"
              style={{ maxWidth: "520px", width: "95vw", padding: "20px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: "12px",
                  borderBottom: "1px solid #e2e8f0",
                  marginBottom: "14px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                  📁 Tải tài liệu / Chụp ảnh chứng từ lên Kho dữ liệu
                </h3>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  style={{
                    border: "none",
                    background: "#f1f5f9",
                    color: "#334155",
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    1. Phân loại tài liệu:
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) =>
                      setUploadCategory(e.target.value as Exclude<VaultCategoryId, "all">)
                    }
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    <option value="pr">PR (Phiếu yêu cầu mua hàng)</option>
                    <option value="dnpd">ĐNPD / Báo giá</option>
                    <option value="po">PO (Đơn đặt hàng)</option>
                    <option value="contract">Hợp đồng</option>
                    <option value="invoice">Hóa đơn GTGT</option>
                    <option value="handover">Biên bản bàn giao</option>
                    <option value="payment">ĐNTT (Hồ sơ thanh toán)</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    2. Mã chứng từ liên quan (Số PR / Số PO / Số HĐ / Mã ĐNTT):
                  </label>
                  <input
                    type="text"
                    value={uploadDocCode}
                    onChange={(e) => setUploadDocCode(e.target.value)}
                    placeholder="Ví dụ: PO-001, HĐ 0012345, QC261106.1..."
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    3. Ghi chú / Tên nhà cung cấp / Bộ phận:
                  </label>
                  <input
                    type="text"
                    value={uploadNote}
                    onChange={(e) => setUploadNote(e.target.value)}
                    placeholder="Ghi chú nội dung chứng từ..."
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleUploadNewVaultFile(f, false);
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleUploadNewVaultFile(f, true);
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginTop: "6px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      fontWeight: 700,
                      borderRadius: "8px",
                      border: "1px solid #93c5fd",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      cursor: uploading ? "wait" : "pointer",
                    }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>{uploadProgressText || "Đang tải lên..."}</span>
                      </>
                    ) : (
                      <>
                        <Upload size={15} />
                        <span>Chọn file PDF / Ảnh</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => cameraInputRef.current?.click()}
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      fontWeight: 700,
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#0f172a",
                      cursor: uploading ? "wait" : "pointer",
                    }}
                  >
                    <Camera size={15} />
                    <span>Chụp ảnh chứng từ</span>
                  </button>

                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => setCamScannerOpen(true)}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      fontWeight: 700,
                      borderRadius: "8px",
                      border: "1px solid #2dd4bf",
                      background: "#f0fdfa",
                      color: "#0f766e",
                      cursor: uploading ? "wait" : "pointer",
                    }}
                  >
                    <Cloud size={15} />
                    <span>Chọn trực tiếp từ Kho dữ liệu CamScanner Pro Cloud</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal Xem trực tiếp tài liệu */}
      {previewItem &&
        typeof document !== "undefined" &&
        createPortal(
          <PRScanPreviewModal
            pr={{
              number: previewItem.docCode || previewItem.fileName,
              scan_file_url: previewItem.fileUrl,
              customTitle: `${previewItem.categoryLabel} · ${previewItem.fileName}`,
              customSubtitle: [
                previewItem.partyOrDept && previewItem.partyOrDept !== "—"
                  ? `Đơn vị / Bộ phận: ${previewItem.partyOrDept}`
                  : "",
                previewItem.dateStr ? `Ngày: ${formatDateDisplay(previewItem.dateStr)}` : "",
              ]
                .filter(Boolean)
                .join(" · "),
              entityType: previewItem.category,
            }}
            onClose={() => setPreviewItem(null)}
          />,
          document.body
        )}

      {/* Modal Chia sẻ tài liệu */}
      {shareState?.isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <ShareFileModal
            isOpen={shareState.isOpen}
            onClose={() => setShareState(null)}
            fileName={shareState.fileName}
            shareUrl={shareState.shareUrl}
            entityCode={shareState.entityCode}
          />,
          document.body
        )}

      <CamScannerCloudModal
        isOpen={camScannerOpen}
        onClose={() => setCamScannerOpen(false)}
        targetLabel={`Kho dữ liệu (${uploadCategory.toUpperCase()})`}
        targetType="vault"
        vaultOptions={{
          workspaceId,
          entityType: uploadCategory,
          entityId: uploadDocCode.trim() || "KHO_DU_LIEU",
          documentType: {
            pr: "PR",
            dnpd: "Báo giá",
            po: "PO xác nhận",
            contract: "Hợp đồng",
            invoice: "Hóa đơn",
            handover: "Biên bản giao nhận",
            payment: "Hồ sơ thanh toán",
          }[uploadCategory],
          note: uploadNote.trim(),
        }}
        onImported={async ({ fileName }) => {
          await loadR2Files();
          setUploadModalOpen(false);
          setUploadDocCode("");
          setUploadNote("");
          onStatus?.(`✓ Đã lấy "${fileName}" từ CamScanner Cloud vào Kho dữ liệu`);
        }}
      />
    </section>
  );
}
export default DataVault;
