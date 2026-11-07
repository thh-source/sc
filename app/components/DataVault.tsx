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
  { id: "all", label: "Tất cả tài liệu", shortLabel: "Tất cả", icon: <FolderOpen size={15} /> },
  { id: "pr", label: "PR (Yêu cầu mua hàng)", shortLabel: "PR", icon: <FileText size={15} /> },
  { id: "dnpd", label: "ĐNPD & Báo giá", shortLabel: "ĐNPD", icon: <CheckSquare size={15} /> },
  { id: "po", label: "PO (Đơn đặt hàng)", shortLabel: "PO", icon: <Package size={15} /> },
  { id: "contract", label: "Hợp đồng", shortLabel: "Hợp đồng", icon: <FileCheck size={15} /> },
  { id: "invoice", label: "Hóa đơn GTGT", shortLabel: "Hóa đơn", icon: <Receipt size={15} /> },
  { id: "handover", label: "BB bàn giao", shortLabel: "BB bàn giao", icon: <Truck size={15} /> },
  { id: "payment", label: "ĐNTT (Thanh toán)", shortLabel: "ĐNTT", icon: <CreditCard size={15} /> },
];

function parseDateToTimestamp(d?: string): number {
  if (!d) return 0;
  const trimmed = d.trim();
  const iso = Date.parse(trimmed);
  if (!isNaN(iso)) return iso;
  const parts = trimmed.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime() || 0;
    }
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime() || 0;
  }
  return 0;
}

function formatDateDisplay(d?: string): string {
  if (!d) return "—";
  const trimmed = d.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    try {
      return new Intl.DateTimeFormat("vi-VN").format(new Date(trimmed));
    } catch {
      return trimmed.slice(0, 10);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split("-");
    return `${day}/${m}/${y}`;
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

    // 1. Bản scan PR (từ prs[].scan_file_url)
    prs.forEach((pr) => {
      if (!pr.scan_file_url) return;
      const url = pr.scan_file_url.trim();
      if (!url) return;
      seenUrls.add(url);

      const urlFileName = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "");
      list.push({
        uid: `pr-scan-${pr.id}`,
        category: "pr",
        categoryLabel: "PR",
        fileName: urlFileName || `Bản scan PR #${pr.number}`,
        fileUrl: url,
        docCode: pr.number || `PR-${pr.id}`,
        relatedInfo: `${pr.items?.length || 0} mặt hàng`,
        partyOrDept: pr.department || "Chưa rõ bộ phận",
        dateStr: pr.createdDate || "",
        sortTime: parseDateToTimestamp(pr.createdDate) || pr.id,
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

        const item: VaultItem = {
          uid: `po-inv-${po.id}-${pay.id}`,
          category: "invoice",
          categoryLabel: "Hóa đơn",
          fileName:
            pay.invoiceScanName ||
            (invNo ? `Hóa đơn GTGT #${invNo}` : `Hóa đơn PO #${po.number}`),
          fileUrl: url,
          docCode: invNo ? `HĐ: ${invNo}` : `PO: ${po.number}`,
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
      if (topUrl && !invoiceByUrl.has(topUrl)) {
        const invNo = (req.invoice_no || "").trim();
        invoiceByUrl.set(topUrl, {
          uid: `dntt-inv-${req.id}`,
          category: "invoice",
          categoryLabel: "Hóa đơn",
          fileName:
            req.invoice_scan_name ||
            (invNo ? `Hóa đơn GTGT #${invNo}` : `Hóa đơn ĐNTT #${req.legacy_stt || req.id}`),
          fileUrl: topUrl,
          docCode: invNo ? `HĐ: ${invNo}` : `ĐNTT #${req.legacy_stt || req.id}`,
          relatedInfo: [
            `ĐNTT #${req.legacy_stt || req.id}`,
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
        invoiceByUrl.set(lineUrl, {
          uid: `dntt-line-inv-${req.id}-${lIdx}`,
          category: "invoice",
          categoryLabel: "Hóa đơn",
          fileName:
            line.invoice_scan_name ||
            (invNo ? `Hóa đơn GTGT #${invNo}` : `Hóa đơn ĐNTT #${req.legacy_stt || req.id}`),
          fileUrl: lineUrl,
          docCode: invNo ? `HĐ: ${invNo}` : `ĐNTT #${req.legacy_stt || req.id}`,
          relatedInfo: `ĐNTT #${req.legacy_stt || req.id}${req.group_code ? ` · ${req.group_code}` : ""}`,
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
      list.push({
        uid: `handover-scan-${maxId}`,
        category: "handover",
        categoryLabel: "BB bàn giao",
        fileName:
          first.handover_scan_name ||
          (srcNum
            ? `Biên bản bàn giao ${srcType} #${srcNum}`
            : `Biên bản bàn giao (${first.department || "Vật tư"})`),
        fileUrl: url,
        docCode: srcNum ? `${srcType}: ${srcNum}` : `Đợt BG #${maxId}`,
        relatedInfo: `${count} mặt hàng bàn giao`,
        partyOrDept: `Nhận: ${first.department || "Chưa rõ"}${
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
        categoryLabel = docType || "ĐNPD / Báo giá";
      } else if (entType === "pr") {
        category = "pr";
        categoryLabel = "PR";
      } else {
        category = "po";
        categoryLabel = docType || "Hồ sơ PO";
      }

      // Tra cứu thông tin chứng từ gốc
      let docCode = f.entityId && f.entityId !== "0" ? f.entityId : "Tải trực tiếp";
      let partyOrDept = "—";
      let relatedInfo = docType || "";
      let route: AppRoute | undefined;

      if (entType === "pr") {
        const matchedPR = prs.find(
          (p) => String(p.id) === String(f.entityId) || p.number === f.entityId
        );
        if (matchedPR) {
          docCode = `PR: ${matchedPR.number}`;
          partyOrDept = matchedPR.department || "—";
          relatedInfo = matchedPR.purpose || `${matchedPR.items?.length || 0} mặt hàng`;
          route = { view: "compare", prId: matchedPR.id };
        }
      } else if (entType === "po" || entType === "contract") {
        const matchedPO = pos.find(
          (p) =>
            String(p.id) === String(f.entityId) ||
            p.number === f.entityId ||
            p.contractNumber === f.entityId
        );
        if (matchedPO) {
          const sup = supplierMap.get(Number(matchedPO.supplierId));
          docCode =
            category === "contract" && matchedPO.contractNumber
              ? `HĐ: ${matchedPO.contractNumber}`
              : `PO: ${matchedPO.number}`;
          partyOrDept = sup?.name || "—";
          relatedInfo = `PO #${matchedPO.number}`;
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
          docCode = `ĐNPD: ${matchedApp.number}`;
          partyOrDept = matchedApp.department || "—";
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
          partyOrDept = matchedReq.payee_name || "—";
          route = { view: "payment", id: matchedReq.id };
        }
      }

      list.push({
        uid: `r2-file-${f.id}`,
        category,
        categoryLabel,
        fileName: f.fileName,
        fileUrl,
        docCode,
        relatedInfo,
        partyOrDept,
        dateStr: f.uploadedAt || "",
        sortTime: parseDateToTimestamp(f.uploadedAt),
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
        entityCode: item.docCode || "TAI_LIEU",
        entityType: item.category,
      });
      setShareState({
        isOpen: true,
        shareUrl,
        fileName: item.fileName,
        entityCode: item.docCode || "TAI_LIEU",
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
      className="content"
      style={{
        padding: isMobile ? "12px 10px 80px" : "18px 24px 40px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Header Kho dữ liệu */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          background: "#ffffff",
          padding: "16px 20px",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FolderOpen size={22} style={{ color: "#0f172a" }} />
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
              Kho dữ liệu & Chứng từ số hóa
            </h1>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                padding: "2px 10px",
                borderRadius: "999px",
                background: "#f1f5f9",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
              }}
            >
              {allVaultItems.length} tài liệu
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
            Tổng hợp toàn bộ bản scan và file đính kèm từ PR, ĐNPD, PO, Hợp đồng, Hóa đơn GTGT, Biên bản bàn giao và ĐNTT. Bấm vào từng tài liệu để xem trực tiếp, in hoặc chia sẻ.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void loadR2Files()}
            disabled={loadingFiles}
            title="Làm mới danh sách tài liệu"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              fontSize: "12.5px",
              fontWeight: 600,
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={loadingFiles ? "animate-spin" : ""} />
            <span>Làm mới</span>
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "12.5px",
                fontWeight: 700,
                borderRadius: "8px",
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <Upload size={14} />
              <span>+ Tải tài liệu lên kho</span>
            </button>
          )}
        </div>
      </div>

      {/* Bộ lọc Phân loại theo từng mục (Category Tabs) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "repeat(2, 1fr)"
            : "repeat(auto-fit, minmax(145px, 1fr))",
          gap: "8px",
        }}
      >
        {CATEGORY_DEFS.map((cat) => {
          const isActive = activeCategory === cat.id;
          const count = categoryCounts[cat.id] || 0;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: isActive ? "2px solid #0f172a" : "1px solid #cbd5e1",
                background: isActive ? "#0f172a" : "#ffffff",
                color: isActive ? "#ffffff" : "#0f172a",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                <span style={{ display: "inline-flex", flexShrink: 0 }}>{cat.icon}</span>
                <span
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cat.shortLabel}
                </span>
              </div>
              <span
                style={{
                  fontSize: "11.5px",
                  fontWeight: 800,
                  padding: "2px 7px",
                  borderRadius: "999px",
                  background: isActive ? "#ffffff" : "#f1f5f9",
                  color: "#0f172a",
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Thanh tìm kiếm & Bộ lọc nhanh */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          background: "#ffffff",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            minWidth: "240px",
          }}
        >
          <Search size={16} style={{ color: "#64748b", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên file, số PR, số PO, số Hóa đơn, Hợp đồng, Nhà cung cấp, Bộ phận..."
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              fontSize: "13px",
              color: "#0f172a",
              background: "transparent",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{
                border: "none",
                background: "#f1f5f9",
                color: "#475569",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Xóa lọc
            </button>
          )}
        </div>

        <div style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>
          Đang hiển thị: <b>{filteredItems.length}</b> / {allVaultItems.length} tài liệu
        </div>
      </div>

      {/* Danh sách tài liệu (Table View trên máy tính / Card List trên điện thoại) */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          overflow: "hidden",
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
                    borderBottom: "2px solid #cbd5e1",
                    color: "#0f172a",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "10px 8px", width: "44px", textAlign: "center" }}>STT</th>
                  <th style={{ padding: "10px 10px", width: "115px" }}>Phân loại</th>
                  <th style={{ padding: "10px 10px", minWidth: "230px" }}>
                    Tên tài liệu / Bản scan (Click để xem)
                  </th>
                  <th style={{ padding: "10px 10px", width: "165px" }}>Mã chứng từ</th>
                  <th style={{ padding: "10px 10px", minWidth: "180px" }}>
                    Nhà cung cấp / Bộ phận
                  </th>
                  <th style={{ padding: "10px 10px", width: "105px", textAlign: "center" }}>
                    Ngày
                  </th>
                  <th style={{ padding: "10px 10px", minWidth: "160px" }}>Ghi chú / Liên kết</th>
                  <th style={{ padding: "10px 10px", width: "210px", textAlign: "center" }}>
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
                    <td
                      style={{
                        padding: "10px 8px",
                        textAlign: "center",
                        fontWeight: 600,
                        color: "#64748b",
                      }}
                    >
                      {idx + 1}
                    </td>

                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          color: "#0f172a",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.categoryLabel}
                      </span>
                    </td>

                    <td style={{ padding: "10px" }}>
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        title="Bấm để mở xem trực tiếp tài liệu này"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          color: "#0f172a",
                          fontWeight: 700,
                          fontSize: "13px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          textDecoration: "underline",
                          textUnderlineOffset: "3px",
                        }}
                      >
                        <FileText size={15} style={{ flexShrink: 0, color: "#334155" }} />
                        <span style={{ wordBreak: "break-word" }}>{item.fileName}</span>
                      </button>
                      {item.sizeBytes ? (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                          Dung lượng: {formatFileSize(item.sizeBytes)}
                        </div>
                      ) : null}
                    </td>

                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>{item.docCode}</span>
                        {item.route && (
                          <button
                            type="button"
                            onClick={() => navigateTo(item.route!)}
                            title="Mở chứng từ gốc trong hệ thống"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              padding: "2px 6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              borderRadius: "4px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#334155",
                              cursor: "pointer",
                            }}
                          >
                            <ExternalLink size={11} /> Mở phiếu
                          </button>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: "10px", color: "#1e293b", fontWeight: 600 }}>
                      {item.partyOrDept || "—"}
                    </td>

                    <td
                      style={{
                        padding: "10px",
                        textAlign: "center",
                        color: "#334155",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDateDisplay(item.dateStr)}
                    </td>

                    <td style={{ padding: "10px", color: "#475569" }}>
                      {item.relatedInfo && (
                        <div style={{ fontWeight: 600, color: "#334155", fontSize: "11.5px" }}>
                          {item.relatedInfo}
                        </div>
                      )}
                      {item.note && (
                        <div style={{ fontSize: "11.5px", color: "#64748b" }}>{item.note}</div>
                      )}
                      {!item.relatedInfo && !item.note && "—"}
                    </td>

                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewItem(item)}
                          title="Xem trực tiếp tài liệu"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "4px 8px",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            borderRadius: "5px",
                            border: "1px solid #0f172a",
                            background: "#0f172a",
                            color: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          <Eye size={12} /> Xem
                        </button>

                        <button
                          type="button"
                          onClick={() => printScanFileUrl(item.fileUrl, item.fileName)}
                          title="In tài liệu này"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            padding: "4px 7px",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            borderRadius: "5px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#0f172a",
                            cursor: "pointer",
                          }}
                        >
                          <Printer size={12} /> In
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleShareItem(item)}
                          disabled={sharingUid === item.uid}
                          title="Tạo link chia sẻ tài liệu"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            padding: "4px 7px",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            borderRadius: "5px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#0f172a",
                            cursor: "pointer",
                          }}
                        >
                          <Share2 size={12} /> {sharingUid === item.uid ? "..." : "Chia sẻ"}
                        </button>

                        <a
                          href={item.fileUrl}
                          download={item.fileName}
                          target="_blank"
                          rel="noreferrer"
                          title="Tải tài liệu về máy"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px 6px",
                            fontSize: "11.5px",
                            borderRadius: "5px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#334155",
                            textDecoration: "none",
                          }}
                        >
                          <Download size={12} />
                        </a>

                        {item.r2FileId && !readOnly && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteR2File(item)}
                            title="Xóa file khỏi kho dữ liệu"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "4px 6px",
                              fontSize: "11.5px",
                              borderRadius: "5px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#475569",
                              cursor: "pointer",
                            }}
                          >
                            <Trash2 size={12} />
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
                    placeholder="Ví dụ: PO-001, HĐ 0012345, PR-QC-01..."
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
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#ffffff",
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
                      border: "1px solid #334155",
                      background: "#ffffff",
                      color: "#0f172a",
                      cursor: uploading ? "wait" : "pointer",
                    }}
                  >
                    <Camera size={15} />
                    <span>Chụp ảnh chứng từ</span>
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
              number: previewItem.docCode || previewItem.categoryLabel,
              scan_file_url: previewItem.fileUrl,
              customTitle: `${previewItem.categoryLabel} · ${previewItem.fileName}`,
              customSubtitle: [
                previewItem.docCode ? `Mã: ${previewItem.docCode}` : "",
                previewItem.partyOrDept && previewItem.partyOrDept !== "—"
                  ? `Đơn vị: ${previewItem.partyOrDept}`
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
    </section>
  );
}
export default DataVault;
