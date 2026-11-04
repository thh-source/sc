"use client";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
  lazy,
  Suspense,
} from "react";
import type React from "react";
import DocumentManager from "./components/DocumentManager";
import SmartTableTools from "./components/SmartTableTools";
import { SupplierPickerModal } from "./components/SupplierPickerModal";
import "./vat-quote.css";

import { PaymentManagement } from "./components/PaymentManagement";
import { BANK_SUGGESTIONS, DEFAULT_PAYMENT_TEMPLATE, localToday } from "./payment-utils";
import { Item, Supplier, PurchaseHistory, QuoteMode, QuoteEntry, Quote, PR, POItem, POCartLine, ApprovalRow, ApprovalDraft, ApprovalRequest, PODoc, Payment, PO, TrashItem, View, ColumnKey, SortState, PaymentDetailLine, PaymentRequestEntry, PaymentGroup, PaymentBeneficiary, PaymentHandoverItem, PaymentPrintTemplate, StoredState, isContractPO, buildPOPaymentDescription, formatPONumber, generatePOCode, isPONumberExists, calcPOTotal, PODeliveryLog } from "./types";
import { BASE_COLUMNS, reorder, applyTools, makeId, emptyItem, fmt, dateVN, DEFAULT_VAT_RATE, quoteDefaults, quoteBeforeVat, quoteAfterVat, quoteComparePrice, mergeHistorySeed, PurchaseHistorySeed, excelNumber, emptyPR, emptyPO, generateShortName } from "./utils";
import { items0, suppliers0, purchaseHistory0, quotes0, prs0, pos0, HISTORY_SEED_ID } from "./seed";
import { AdvancedItemsTable } from "./components/AdvancedItemsTable";
import { CreatePRCatalog } from "./components/CreatePRCatalog";
import { ApprovalSheet } from "./components/ApprovalSheet";
import ApprovalManagement from "./components/ApprovalManagement";
import {
  createApprovalFromCompare,
  SAMPLE_PHENIKAA_APPROVALS,
} from "./utils/approvalSamples";

import { Dashboard } from "./components/Dashboard";
import { POList } from "./components/POList";
import { PODetail } from "./components/PODetail";
import { PRList } from "./components/PRList";
import { PRScanPreviewModal } from "./components/PRScanPreviewModal";
import { compressUploadFile } from "./utils/compressUploadFile";
import { KnowledgeBase, KnowledgeBaseDrawer } from "./components/KnowledgeBase";
import { DocFlowLinks } from "./components/DocFlowLinks";
import { resolveDocFlow } from "./utils/docFlow";
import {
  isPRCompleted,
  isPOCompleted,
  isApprovalCompleted,
  isPaymentCompleted,
  syncPaymentCompletionToPO,
  calcPODeliveryStats,
} from "./utils/paymentSync";

const AdminSettings = lazy(() => import("./components/AdminSettings").then(m => ({ default: m.AdminSettings })));
const TrashPage = lazy(() => import("./components/TrashPage").then(m => ({ default: m.TrashPage })));
const ContractManagement = lazy(() => import("./components/ContractManagement").then(m => ({ default: m.ContractManagement })));
const HandoverManagement = lazy(() => import("./components/HandoverManagement").then(m => ({ default: m.HandoverManagement })));
const ProductCatalog = lazy(() => import("./components/ProductCatalog").then(m => ({ default: m.ProductCatalog })));
const SupplierManagement = lazy(() => import("./components/SupplierManagement").then(m => ({ default: m.SupplierManagement })));
import { GlobalSpotlightModal } from "./components/GlobalSpotlightModal";
import { POHandoverPickerModal } from "./components/POHandoverPickerModal";
import { generateHandoverBatchId, getPODeliveryBatches, PODeliveryBatch, sortHandoversByPOLineOrder } from "./utils/handoverBatches";
import { HandoverPrintPreviewModal } from "./components/HandoverPrintPreviewModal";
import { PaymentPrintPreviewModal } from "./components/PaymentPrintPreviewModal";
import { SupplierQuickBankModal } from "./components/SupplierQuickBankModal";
import { PaymentStagePickerModal } from "./components/PaymentStagePickerModal";
import { POPaymentLinkModal } from "./components/POPaymentLinkModal";
import { SettingsModal } from "./components/SettingsModal";
import { CatalogManagement } from "./components/CatalogManagement";
import { I18nProvider, useTranslation, LanguageSwitcher } from "./i18n";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { OfflineSyncBanner } from "./components/OfflineSyncBanner";
import { useOtaUpdate } from "./hooks/useOtaUpdate";
import { OtaUpdateBanner } from "./components/OtaUpdateBanner";
import { initOTAUpdates } from "./utils/otaUpdateService";
import {
  enqueueOfflineAction,
  saveOfflineStateBackup,
  getOfflineStateBackup,
  clearFormDraft,
  checkIsOnline,
  initOfflineDB,
  pruneStateOfflineQueue,
} from "./utils/offlineSync";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Users,
  Check,
  ShoppingCart,
  Search,
  Layers,
  Home,
  LogOut,
  FileText,
  Scale,
  CheckSquare,
  Package,
  CreditCard,
  Truck,
  Building2,
  Boxes,
  Trash2,
  Settings,
  Minimize2,
  Maximize2,
  HelpCircle,
  Menu,
  Eye,
  Paperclip,
  Loader2,
} from "lucide-react";
import {
  AppRoute,
  buildHashFromRoute,
  navigateTo,
  parseRouteFromHash,
} from "./utils/navigation";

function ProcurementAppInner({
  reportToken,
  currentUser,
}: {
  reportToken?: string;
  currentUser?: {
    id: string;
    username: string;
    displayName: string;
    role: "master" | "admin" | "user";
  };
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v) return v as View;
    }
    return "dashboard";
  }),
    [routeModal, setRouteModal] = useState<string | null>(() => {
      if (typeof window !== "undefined") {
        return parseRouteFromHash().modal || null;
      }
      return null;
    }),
    [collapsed, setCollapsed] = useState(false),
    [prs, setPrs] = useState(prs0),
    [selectedPR, setSelectedPR] = useState(emptyPR);
  const [uiTheme, setUiTheme] = useState<"classic" | "misa">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scm_ui_theme");
      if (saved === "misa" || saved === "classic") return saved;
    }
    return "classic";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scm_ui_theme") as "classic" | "misa";
      if (saved === "misa" || saved === "classic") {
        if (saved !== uiTheme) setUiTheme(saved);
        document.documentElement.classList.toggle("theme-misa", saved === "misa");
        document.body.classList.toggle("theme-misa", saved === "misa");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.classList.toggle("theme-misa", uiTheme === "misa");
      document.body.classList.toggle("theme-misa", uiTheme === "misa");
    }
  }, [uiTheme]);
  const [reportMode] = useState(Boolean(reportToken));
  const [items, setItems] = useState(items0),
    [suppliers, setSuppliers] = useState(suppliers0),
    [quotes, setQuotes] = useState(quotes0),
    [quotesByPr, setQuotesByPr] = useState<Record<number, Quote>>({}),
    [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [compactCompare, setCompactCompare] = useState(false);
  const [products, setProducts] = useState<Item[]>(items0);
  const [purchaseHistory, setPurchaseHistory] =
    useState<PurchaseHistory[]>(purchaseHistory0);
  const [purchaseHistoryImportIds, setPurchaseHistoryImportIds] = useState<
    string[]
  >([]);
  const [quoteCompareMode, setQuoteCompareMode] =
    useState<QuoteMode>("before-vat");
  const [quoteSupplierIds, setQuoteSupplierIds] = useState<number[]>(
      suppliers0.map((s) => s.id),
    ),
    [quoteSupplierIdsByPr, setQuoteSupplierIdsByPr] = useState<
      Record<number, number[]>
    >({}),
    [supplierPicker, setSupplierPicker] = useState(false),
    [supplierSearch, setSupplierSearch] = useState(""),
    [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierModal, setSupplierModal] = useState(false),
    [newSupplier, setNewSupplier] = useState<Omit<Supplier, "id">>({
      code: "",
      name: "",
      bankAccount: "",
      bank: "",
      address: "",
      contact: "",
      phone: "",
    }),
    [importMessage, setImportMessage] = useState("");
  const [poSelections, setPoSelections] = useState<number[]>([]),
    [pos, setPos] = useState<PO[]>([]),
    [currentPO, setCurrentPO] = useState<PO>(emptyPO);
  const [poCart, setPoCart] = useState<POCartLine[]>([]),
    [poCartOpen, setPoCartOpen] = useState(false);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]),
    [activeApprovalId, setActiveApprovalId] = useState<number | null>(null),
    [isPrintApproval, setIsPrintApproval] = useState(false);
  const [trash, setTrash] = useState<TrashItem[]>([]),
    [hiddenContractIds, setHiddenContractIds] = useState<number[]>([]),
    [deleteTarget, setDeleteTarget] = useState<{
      type: TrashItem["type"];
      record: PR | PO;
    } | null>(null),
    [deletePassword, setDeletePassword] = useState(""),
    [deleteError, setDeleteError] = useState(""),
    [deleteBusy, setDeleteBusy] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestEntry[]>([]),
    [paymentGroups, setPaymentGroups] = useState<PaymentGroup[]>([]),
    [paymentBeneficiaries, setPaymentBeneficiaries] = useState<PaymentBeneficiary[]>([]),
    [paymentHandovers, setPaymentHandovers] = useState<PaymentHandoverItem[]>([]),
    [paymentTemplate, setPaymentTemplate] = useState<PaymentPrintTemplate>(DEFAULT_PAYMENT_TEMPLATE);
  const [storageReady, setStorageReady] = useState(false),
    [storageStatus, setStorageStatus] = useState("Đang kết nối dữ liệu..."),
    [isAppLoading, setIsAppLoading] = useState(true),
    [loadTrigger, setLoadTrigger] = useState(0);

  // Khởi tạo ứng dụng với timeout an toàn và tắt màn hình splash
  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      try {
        // Khởi tạo Offline DB & OTA với timeout an toàn (3500ms)
        await Promise.race([
          Promise.all([
            initOfflineDB(),
            initOTAUpdates(),
          ]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Init timeout")), 3500)
          ),
        ]);
      } catch (err) {
        console.warn("Lỗi khởi tạo offline/OTA, chuyển sang nạp giao diện dự phòng:", err);
      } finally {
        if (isMounted) {
          setIsAppLoading(false); // BẮT BUỘC TẮT MÀN HÌNH CHỜ DÙ CÓ LỖI HAY KHÔNG
        }
        if (typeof window !== "undefined" && (window as any).__DISMISS_SPLASH__) {
          (window as any).__DISMISS_SPLASH__();
        }
      }
    };

    void initializeApp();
    return () => {
      isMounted = false;
    };
  }, []);

  // Hook quản lý Offline-first & Tự động đồng bộ
  const {
    isOnline,
    isSyncing,
    queueCount,
    lastSyncStatus,
    syncMessage,
    triggerSync,
    clearQueue,
  } = useOfflineSync();

  // Hook quản lý Cập nhật từ xa tự động (OTA Update) cho Capacitor Android
  const {
    otaState,
    toastVisible,
    applyAndRestart,
    dismissToast,
  } = useOtaUpdate();

  // Global Spotlight Search (Ctrl + K)
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightPaymentSearch, setSpotlightPaymentSearch] = useState<string>("");
  const [spotlightPaymentActiveId, setSpotlightPaymentActiveId] = useState<number | undefined>(undefined);
  const [spotlightHandoverSearch, setSpotlightHandoverSearch] = useState<string>("");
  const [handoverPickerPO, setHandoverPickerPO] = useState<PO | null>(null);
  const [showHandoverPickerModal, setShowHandoverPickerModal] = useState(false);
  const [printHandoverData, setPrintHandoverData] = useState<{
    isOpen: boolean;
    items: PaymentHandoverItem[];
    po: PO | null;
    department?: string;
    handoverDate?: string;
    senderName?: string;
    receiverName?: string;
  } | null>(null);
  const [printPaymentRequest, setPrintPaymentRequest] = useState<PaymentRequestEntry | null>(null);
  const [supplierQuickBankState, setSupplierQuickBankState] = useState<{
    isOpen: boolean;
    supplier: Supplier;
    pendingPO: PO;
    pendingPayment: Payment;
  } | null>(null);
  const [paymentStagePickerPO, setPaymentStagePickerPO] = useState<PO | null>(null);
  const [linkModalFromPicker, setLinkModalFromPicker] = useState<{ po: PO; stage: Payment } | null>(null);
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [mobileActionSheetOpen, setMobileActionSheetOpen] = useState(false);
  const [catalogSubTab, setCatalogSubTab] = useState<"products" | "suppliers">("products");
  const [previewScanPR, setPreviewScanPR] = useState<PR | null>(null);
  const [uploadingScanPrId, setUploadingScanPrId] = useState<number | null>(null);
  const [compareCompressProgress, setCompareCompressProgress] = useState<string>("");
  const compareScanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const [workspaceId, setWorkspaceId] = useState(currentUser?.id || ""),
    [workspaceUsers, setWorkspaceUsers] = useState<
      { id: string; displayName: string; username: string; role: string }[]
    >([]);
  const [compareOrder, setCompareOrder] = useState<ColumnKey[]>(
      BASE_COLUMNS.map((c) => c.key),
    ),
    [compareFilters, setCompareFilters] = useState<
      Partial<Record<ColumnKey, string[]>>
    >({}),
    [compareSort, setCompareSort] = useState<SortState>(null),
    [compareFilterOpen, setCompareFilterOpen] = useState<ColumnKey | null>(
      null,
    );
  const [showCompareNote, setShowCompareNote] = useState(false);
  const [draft, setDraft] = useState<{
    number: string;
    date: string;
    department: string;
    purpose: string;
    note: string;
    scan_file_url?: string;
    items: Item[];
  }>({
    number: "",
    date: new Date().toISOString().slice(0, 10),
    department: "",
    purpose: "",
    note: "",
    scan_file_url: "",
    items: [emptyItem(0), emptyItem(1)],
  });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.matchMedia("(max-width: 720px)").matches) setCollapsed(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const fileRef = useRef<HTMLInputElement>(null),
    previousPayloadRef = useRef<StoredState | null>(null),
    serverVersionRef = useRef<number>(0),
    saveRunningRef = useRef(false),
    savePendingRef = useRef(false),
    saveRevisionRef = useRef(0),
    savedRevisionRef = useRef(-1),
    latestSaveRef = useRef<{
      workspaceId: string;
      payload: StoredState;
      revision: number;
    }>({
      workspaceId,
      revision: 0,
      payload: {
        prs,
        products,
        suppliers,
        quotes,
        pos,
        items,
        quoteSupplierIds,
        trash,
        hiddenContractIds,
        poCart,
        quotesByPr,
        quoteSupplierIdsByPr,
        quoteCompareMode,
        purchaseHistory,
        purchaseHistoryImportIds,
        paymentRequests,
        paymentGroups,
        paymentBeneficiaries,
        paymentHandovers,
        paymentTemplate,
        approvalRequests,
      },
    });
  const persistState = useCallback(async (keepalive = false) => {
    savePendingRef.current = true;
    if (saveRunningRef.current) return;
    saveRunningRef.current = true;
    try {
      while (savePendingRef.current) {
        savePendingRef.current = false;
        const job = latestSaveRef.current;
        if (job.revision <= savedRevisionRef.current) continue;
        
        let payloadToSend = job.payload;
        if (previousPayloadRef.current) {
          const diff: Partial<StoredState> = {};
          let hasChanges = false;
          for (const key of Object.keys(job.payload) as (keyof StoredState)[]) {
            if (job.payload[key] !== previousPayloadRef.current[key]) {
              diff[key] = job.payload[key] as any;
              hasChanges = true;
            }
          }
          if (!hasChanges) {
             savedRevisionRef.current = job.revision;
             continue;
          }
          payloadToSend = diff as StoredState;
        }

        // 1. Luôn sao lưu vào IndexedDB offline trước
        void saveOfflineStateBackup(job.workspaceId, job.payload, serverVersionRef.current);

        // 2. Kiểm tra nếu đang mất kết nối thì lưu vào queue offline
        const online = await checkIsOnline();
        if (!online) {
          await enqueueOfflineAction({
            endpoint: `/api/state?workspace=${encodeURIComponent(job.workspaceId)}`,
            method: "PUT",
            data: payloadToSend,
            expectedVersion: serverVersionRef.current > 0 ? serverVersionRef.current : undefined,
            description: `Tự động lưu trạng thái (Revision ${job.revision})`,
          });
          savedRevisionRef.current = job.revision;
          previousPayloadRef.current = job.payload;
          setStorageStatus("Đã lưu tạm offline (chờ đồng bộ)");
          continue;
        }

        try {
          const bodyString = JSON.stringify(payloadToSend);
          const safeKeepalive = Boolean(keepalive && bodyString.length < 30000);
          const response = await fetch(
            `/api/state?workspace=${encodeURIComponent(job.workspaceId)}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                ...(serverVersionRef.current > 0
                  ? { "x-expected-version": String(serverVersionRef.current) }
                  : {}),
              },
              body: bodyString,
              keepalive: safeKeepalive,
            },
          );

          if (response.status === 409) {
            // Xung đột phiên bản do autosave race: tự động đồng bộ lại version mới nhất và lưu đè an toàn
            const resData = (await response.json().catch(() => null)) as {
              error?: string;
              currentVersion?: number;
              message?: string;
            } | null;
            const newVer = resData?.currentVersion || (serverVersionRef.current + 1);
            serverVersionRef.current = newVer;
            try {
              const retryRes = await fetch(
                `/api/state?workspace=${encodeURIComponent(job.workspaceId)}`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    "x-expected-version": String(newVer),
                    "x-force-save": "true",
                  },
                  body: bodyString,
                }
              );
              if (retryRes.ok) {
                const retryData = (await retryRes.json().catch(() => null)) as { version?: number } | null;
                if (retryData?.version) serverVersionRef.current = retryData.version;
                savedRevisionRef.current = job.revision;
                previousPayloadRef.current = job.payload;
                setStorageStatus(`Đã lưu lúc ${new Date().toLocaleTimeString("vi-VN")}`);
                void pruneStateOfflineQueue(job.workspaceId);
                continue;
              }
            } catch {}
          }

          if (!response.ok) throw new Error("SAVE_FAILED");
          const resData = (await response.json().catch(() => null)) as { version?: number } | null;
          if (resData?.version) {
            serverVersionRef.current = resData.version;
          }
          savedRevisionRef.current = job.revision;
          previousPayloadRef.current = job.payload;
          setStorageStatus(
            `Đã lưu lúc ${new Date().toLocaleTimeString("vi-VN")}`,
          );
          // Tự động xóa sạch toàn bộ tác vụ /api/state cũ trong IndexedDB vì D1 đã lưu bản mới nhất
          void pruneStateOfflineQueue(job.workspaceId);
        } catch {
          const isActuallyOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
          if (isActuallyOnline) {
            // Thiết bị máy tính vẫn có mạng: chỉ là độ trễ mạng tạm thời, tự động thử lại ngầm không làm phiền người dùng
            setStorageStatus("Đang lưu lại...");
            savePendingRef.current = true;
            setTimeout(() => {
              void persistState(false);
            }, 1500);
          } else {
            // Thiết bị thực sự mất mạng (offline)
            await enqueueOfflineAction({
              endpoint: `/api/state?workspace=${encodeURIComponent(job.workspaceId)}`,
              method: "PUT",
              data: payloadToSend,
              expectedVersion: serverVersionRef.current > 0 ? serverVersionRef.current : undefined,
              description: `Tự động lưu trạng thái ngoại tuyến`,
            });
            savedRevisionRef.current = job.revision;
            previousPayloadRef.current = job.payload;
            setStorageStatus("Đã lưu tạm offline (ngoại tuyến)");
          }
        }
      }
    } catch {
      setStorageStatus("Tự động lưu thất bại · Hệ thống sẽ thử lại");
    } finally {
      saveRunningRef.current = false;
    }
  }, []);
  useEffect(() => {
    saveRevisionRef.current += 1;
    latestSaveRef.current = {
      workspaceId,
      revision: saveRevisionRef.current,
      payload: {
        prs,
        products,
        suppliers,
        quotes,
        pos,
        items,
        quoteSupplierIds,
        trash,
        hiddenContractIds,
        poCart,
        quotesByPr,
        quoteSupplierIdsByPr,
        quoteCompareMode,
        purchaseHistory,
        purchaseHistoryImportIds,
        paymentRequests,
        paymentGroups,
        paymentBeneficiaries,
        paymentHandovers,
        paymentTemplate,
        approvalRequests,
      },
    };
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(`scmh_backup_${workspaceId}`, JSON.stringify(latestSaveRef.current.payload));
      }
      void saveOfflineStateBackup(workspaceId, latestSaveRef.current.payload, serverVersionRef.current);
    } catch {}
  }, [approvalRequests, hiddenContractIds, items, paymentBeneficiaries, paymentGroups, paymentHandovers, paymentRequests, paymentTemplate, poCart, pos, products, prs, purchaseHistory, purchaseHistoryImportIds, quoteCompareMode, quoteSupplierIds, quoteSupplierIdsByPr, quotes, quotesByPr, suppliers, trash, workspaceId]);
  useEffect(() => {
    if (
      reportMode ||
      !currentUser ||
      (currentUser.role !== "master" && currentUser.role !== "admin")
    )
      return;
    fetch("/api/users")
      .then((response) => response.json() as Promise<{ users?: any[] }>)
      .then((body) => setWorkspaceUsers(body.users || []))
      .catch(() => setWorkspaceUsers([]));
  }, [currentUser, reportMode]);
  useEffect(() => {
    let active = true;

    const applyLoadedData = (data: StoredState) => {
      previousPayloadRef.current = data;
      const firstPR = data.prs?.[0],
        legacyQuoteItemIds = new Set(
          Object.keys(data.quotes || {}).map(Number),
        ),
        legacyQuotePR =
          data.prs?.find((pr: PR) =>
            pr.items.some((item: Item) => legacyQuoteItemIds.has(item.id)),
          ) || firstPR,
        migratedQuotes =
          data.quotesByPr ||
          (legacyQuotePR && Object.keys(data.quotes || {}).length
             ? { [legacyQuotePR.id]: data.quotes }
            : {}),
        migratedSupplierIds =
          data.quoteSupplierIdsByPr ||
          (legacyQuotePR && data.quoteSupplierIds?.length
            ? { [legacyQuotePR.id]: data.quoteSupplierIds }
            : {});
      const loadedProducts: Item[] = (data.products || items0).map((p: any) => ({
        ...p,
        name: p.name || p.itemName || p.item_name || p.desc || "",
      }));
      setProducts(loadedProducts);

      const loadedPrs: PR[] = (data.prs || prs0).map((pr: PR) => ({
        ...pr,
        items: (pr.items || []).map((it: any) => ({
          ...it,
          name: it.name || it.itemName || it.item_name || it.productName || it.desc || "",
        })),
      }));
      setPrs(loadedPrs);
      
      const loadedSuppliers: Supplier[] = (data.suppliers || suppliers0).map((s: Supplier) => ({
        ...s,
        shortName: s.shortName || generateShortName(s.name),
      }));
      setSuppliers(loadedSuppliers);

      setQuotesByPr(migratedQuotes);
      setQuoteSupplierIdsByPr(migratedSupplierIds);
      setQuotes(firstPR ? migratedQuotes[firstPR.id] || {} : {});
      const loadedPos: PO[] = (data.pos || pos0).map((po: PO) => {
        const sup = loadedSuppliers.find((s) => Number(s.id) === Number(po.supplierId));
        const normalizedItems = (po.items || []).map((it: any) => ({
          ...it,
          name: it.name || it.itemName || it.item_name || it.productName || it.desc || "",
        }));
        let finalNumber = po.number;
        if (/^PO-\d{4}-\d{4}$/i.test((po.number || "").trim())) {
          finalNumber = formatPONumber(sup, po.createdDate);
        }
        return {
          ...po,
          number: finalNumber,
          items: normalizedItems,
        };
      });
      setPos(loadedPos);
      setItems(firstPR?.items ? firstPR.items.map((it: any) => ({
        ...it,
        name: it.name || it.itemName || it.item_name || it.productName || it.desc || "",
      })) : (data.items || items0));
      setQuoteSupplierIds(
        firstPR ? migratedSupplierIds[firstPR.id] || [] : [],
      );
      const now = Date.now();
      setTrash(
        (data.trash || []).filter(
          (entry: TrashItem) => new Date(entry.expiresAt).getTime() > now,
        ),
      );
      setHiddenContractIds(data.hiddenContractIds || []);
      setPoCart(data.poCart || []);
      setQuoteCompareMode(data.quoteCompareMode || "before-vat");
      setPurchaseHistory(data.purchaseHistory || purchaseHistory0);
      setPurchaseHistoryImportIds(data.purchaseHistoryImportIds || []);
      
      setPaymentRequests(data.paymentRequests || []);
      setPaymentGroups(data.paymentGroups || []);
      setPaymentBeneficiaries(data.paymentBeneficiaries || []);
      setPaymentHandovers(data.paymentHandovers || []);
      setPaymentTemplate(data.paymentTemplate || DEFAULT_PAYMENT_TEMPLATE);
      if (Array.isArray(data.approvalRequests)) {
        setApprovalRequests(data.approvalRequests);
      } else {
        setApprovalRequests([]);
      }
      if (data.prs?.length) setSelectedPR(data.prs[0]);
      if (data.pos?.length) setCurrentPO(data.pos[0]);
    };

    const url = reportToken
      ? `/api/report-state?token=${encodeURIComponent(reportToken)}`
      : `/api/state?workspace=${encodeURIComponent(workspaceId)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ version?: number; data?: StoredState }>;
      })
      .then(async (body) => {
        if (!active) return;
        if (body.version) {
          serverVersionRef.current = body.version;
        }
        let data = body.data as StoredState | null;
        if (!data) {
          try {
            const cached = window.localStorage?.getItem(`scmh_backup_${workspaceId}`);
            if (cached) data = JSON.parse(cached);
          } catch {}
        }
        if (data) {
          void saveOfflineStateBackup(workspaceId, data, body.version);
          applyLoadedData(data);
        } else {
          setPrs([]);
          setProducts([]);
          setSuppliers([]);
          setQuotes({});
          setQuotesByPr({});
          setQuoteSupplierIdsByPr({});
          setPos([]);
          setItems([]);
          setQuoteSupplierIds([]);
          setTrash([]);
          setHiddenContractIds([]);
          setPoCart([]);
          setQuoteCompareMode("before-vat");
          setPurchaseHistory([]);
          setPurchaseHistoryImportIds([]);
          setPaymentRequests([]);
          setPaymentGroups([]);
          setPaymentBeneficiaries([]);
          setPaymentHandovers([]);
          setPaymentTemplate(DEFAULT_PAYMENT_TEMPLATE);
          setApprovalRequests([]);
          setSelectedPR(emptyPR);
          setCurrentPO(emptyPO);
        }
        setStorageReady(true);
        setStorageStatus(data ? "Đã đồng bộ online" : "Sẵn sàng lưu online");
        void pruneStateOfflineQueue(workspaceId);
      })
      .catch(async () => {
        if (!active) return;
        // Chế độ Offline: Khôi phục dữ liệu từ IndexedDB offline_state_backup hoặc production bundle
        try {
          const offlineBackup = await getOfflineStateBackup(workspaceId);
          let data = offlineBackup?.data as StoredState | null;
          if (!data && typeof window !== "undefined" && window.localStorage) {
            const cached = window.localStorage.getItem(`scmh_backup_${workspaceId}`);
            if (cached) data = JSON.parse(cached);
          }
          if (data) {
            if (offlineBackup?.version) {
              serverVersionRef.current = offlineBackup.version;
            }
            applyLoadedData(data);
            setStorageReady(true);
            setStorageStatus("Chế độ ngoại tuyến (Offline)");
            return;
          }
        } catch {}
        setStorageReady(true);
        setStorageStatus("Không thể kết nối dữ liệu");
      });
    return () => {
      active = false;
    };
  }, [loadTrigger, reportToken, workspaceId]);
  useEffect(() => {
    if (!storageReady || reportMode) return;
    const timer = setTimeout(() => void persistState(), 1200);
    return () => clearTimeout(timer);
  }, [
    storageReady,
    reportMode,
    prs,
    products,
    suppliers,
    quotes,
    pos,
    items,
    quoteSupplierIds,
    quotesByPr,
    quoteSupplierIdsByPr,
    trash,
    hiddenContractIds,
    poCart,
    quoteCompareMode,
    purchaseHistory,
    purchaseHistoryImportIds,
    paymentRequests,
    paymentGroups,
    paymentBeneficiaries,
    paymentHandovers,
    paymentTemplate,
    approvalRequests,
    workspaceId,
    persistState,
  ]);
  useEffect(() => {
    if (
      !storageReady ||
      reportMode ||
      purchaseHistoryImportIds.includes(HISTORY_SEED_ID)
    )
      return;
    fetch("/purchase-history-t1-t7-2026.json")
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<PurchaseHistorySeed>;
      })
      .then((seed: PurchaseHistorySeed) => {
        const merged = mergeHistorySeed(
          suppliers,
          products,
          purchaseHistory,
          seed,
        );
        setSuppliers(merged.suppliers.map(s => ({
          ...s,
          shortName: s.shortName || generateShortName(s.name)
        })));
        setProducts(merged.products);
        setPurchaseHistory(merged.history);
        setPurchaseHistoryImportIds((ids) => [...ids, HISTORY_SEED_ID]);
        setStorageStatus(
          `Đã nạp lịch sử mua hàng T1-T7/2026: ${seed.transactions.length} dòng`,
        );
      })
      .catch(() => setStorageStatus("Không thể nạp dữ liệu lịch sử mua hàng"));
  }, [products, purchaseHistory, purchaseHistoryImportIds, reportMode, storageReady, suppliers]);
  useEffect(() => {
    if (!storageReady || reportMode) return;
    const flush = () => void persistState(document.visibilityState === "hidden"),
      visibility = () => {
        if (document.visibilityState === "hidden") flush();
      };
    document.addEventListener("focusout", flush);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("focusout", flush);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [persistState, reportMode, storageReady]);
  const openShareReport = async () => {
    setStorageStatus("Đang tạo link báo cáo...");
    try {
      const response = await fetch("/api/share", { method: "POST" });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { token: string };
      setStorageStatus("Đã tạo link báo cáo");
      window.open(
        `${window.location.origin}/report/${encodeURIComponent(body.token)}`,
        "_blank",
      );
    } catch {
      setStorageStatus("Không thể tạo link báo cáo");
    }
  };
  const logout = async () => {
    setStorageStatus("Đang lưu và đăng xuất...");
    try {
      await fetch(`/api/state?workspace=${encodeURIComponent(workspaceId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prs,
          products,
          suppliers,
          quotes,
          pos,
          items,
          quoteSupplierIds,
          trash,
          hiddenContractIds,
          poCart,
          quotesByPr,
          quoteSupplierIdsByPr,
          quoteCompareMode,
          purchaseHistory,
          purchaseHistoryImportIds,
          paymentRequests,
          paymentGroups,
          paymentBeneficiaries,
          paymentHandovers,
          paymentTemplate,
        }),
      });
    } catch {}
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      try {
        localStorage.removeItem("pka_user");
      } catch {}
      window.location.replace("/");
    }
  };
  const moveToTrash = useCallback(
    (
      type: TrashItem["type"],
      label: string,
      data: any,
      onSuccessMessage?: string,
    ) => {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const entry: TrashItem = {
        id: crypto.randomUUID(),
        type,
        label,
        deletedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        data,
      };
      setTrash((list) => [entry, ...list.filter((t) => t.id !== entry.id)]);
      setStorageStatus(onSuccessMessage || `✓ Đã chuyển ${label} vào thùng rác`);
      setTimeout(() => void persistState(false), 50);
      return entry;
    },
    [persistState],
  );

  const requestDelete = (type: TrashItem["type"], record: PR | PO) => {
    setDeleteTarget({ type, record });
    setDeletePassword("");
    setDeleteError("");
  };
  const confirmDelete = async () => {
    if (!deleteTarget || !deletePassword) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Mật khẩu không đúng");

      const record = deleteTarget.record;
      const label =
        deleteTarget.type === "PR"
          ? (record as PR).number
          : deleteTarget.type === "CONTRACT"
            ? `HĐ-${(record as PO).number}`
            : (record as PO).number;
      const data =
        deleteTarget.type === "CONTRACT"
          ? { poId: (record as PO).id }
          : record;

      moveToTrash(deleteTarget.type, label, data);

      if (deleteTarget.type === "PR") {
        setPrs((list) => list.filter((pr) => Number(pr.id) !== Number(record.id)));
        if (Number(selectedPR.id) === Number(record.id)) setSelectedPR(emptyPR);
        navigateTo({ view: "prs" });
      } else if (deleteTarget.type === "PO") {
        setPos((list) => list.filter((po) => Number(po.id) !== Number(record.id)));
        if (Number(currentPO.id) === Number(record.id)) setCurrentPO(emptyPO);
        navigateTo({ view: "po-list" });
      } else {
        setHiddenContractIds((ids) => [...new Set([...ids, record.id])]);
        navigateTo({ view: "contracts" });
      }
      setDeleteTarget(null);
      setDeletePassword("");
      setTimeout(() => void persistState(false), 50);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Không thể xóa");
    } finally {
      setDeleteBusy(false);
    }
  };
  const restoreTrash = (entry: TrashItem) => {
    if (entry.type === "PR") {
      const pr = entry.data as PR;
      setPrs((list) =>
        list.some((item) => item.id === pr.id) ? list : [pr, ...list],
      );
    } else if (entry.type === "PO") {
      const po = entry.data as PO;
      setPos((list) =>
        list.some((item) => item.id === po.id) ? list : [po, ...list],
      );
    } else if (entry.type === "APPROVAL") {
      const approval = entry.data as ApprovalRequest;
      setApprovalRequests((list) =>
        list.some((item) => item.id === approval.id) ? list : [approval, ...list],
      );
      handleSetActiveApprovalId(approval.id);
    } else if (entry.type === "HANDOVER") {
      const items = Array.isArray(entry.data) ? entry.data : [entry.data];
      setPaymentHandovers((list) => {
        const existingIds = new Set(list.map((h) => h.id));
        const toAdd = items.filter((item: any) => !existingIds.has(item.id));
        return [...toAdd, ...list];
      });
    } else if (entry.type === "PAYMENT") {
      const items = Array.isArray(entry.data) ? entry.data : [entry.data];
      setPaymentRequests((list) => {
        const existingIds = new Set(list.map((p) => p.id));
        const toAdd = items.filter((item: any) => !existingIds.has(item.id));
        return [...toAdd, ...list];
      });
    } else {
      const poId = (entry.data as { poId: number }).poId;
      setHiddenContractIds((ids) => ids.filter((id) => id !== poId));
    }
    setTrash((list) => list.filter((item) => item.id !== entry.id));
    setStorageStatus(`✓ Đã phục hồi ${entry.label}`);
    setTimeout(() => void persistState(false), 50);
  };
  const permanentDeleteTrash = (id: string) => {
    setTrash((list) => list.filter((item) => item.id !== id));
    setStorageStatus("✓ Đã xóa vĩnh viễn khỏi thùng rác");
    setTimeout(() => void persistState(false), 50);
  };
  const emptyTrash = () => {
    setTrash([]);
    setStorageStatus("✓ Đã dọn sạch thùng rác");
    setTimeout(() => void persistState(false), 50);
  };
  const filtered = useMemo(
    () =>
      applyTools(
        items.filter((i) =>
          (i.code + i.category + i.name + i.desc)
            .toLowerCase()
            .includes(deferredSearch.toLowerCase()),
        ),
        compareOrder,
        compareFilters,
        compareSort,
      ),
    [items, deferredSearch, compareOrder, compareFilters, compareSort],
  );
  const estimated = useMemo(
    () => items.reduce((sum, item) => sum + item.qty * item.estimate, 0),
    [items],
  );
  const comparisonSuppliers = suppliers.filter((supplier) =>
      quoteSupplierIds.includes(supplier.id),
    ),
    availableSuppliers = suppliers.filter(
      (supplier) => !quoteSupplierIds.includes(supplier.id),
    );
  const bestByItem = useMemo(() => {
      const result = new Map<number, { supplier: Supplier; price: number }>();
      const selectedSuppliers = suppliers.filter((supplier) =>
        quoteSupplierIds.includes(supplier.id),
      );
      items.forEach((item) => {
        selectedSuppliers.forEach((supplier) => {
          const entry = quotes[item.id]?.[supplier.id];
          const price = quoteComparePrice(entry, quoteCompareMode);
          if (price > 0 && (!result.has(item.id) || price < result.get(item.id)!.price))
            result.set(item.id, { supplier, price });
        });
      });
      return result;
    }, [items, quoteCompareMode, quoteSupplierIds, quotes, suppliers]);
  const best = (itemId: number) => bestByItem.get(itemId) || null;
  const itemChange = (
    id: number,
    k: keyof Item,
    v: string,
    forDraft = false,
  ) => {
    const setter = forDraft
      ? (fn: (x: Item[]) => Item[]) =>
          setDraft((d) => ({ ...d, items: fn(d.items) }))
      : setItems;
    setter((x) =>
      x.map((i) =>
        i.id === id
          ? { ...i, [k]: ["qty", "estimate"].includes(k) ? Number(v) : v }
          : i,
      ),
    );
  };
  const quoteChange = (
    iid: number,
    sid: number,
    k: keyof QuoteEntry,
    v: string | Record<string, string>,
  ) => {
    const updatedEntry = {
      ...quoteDefaults(quotes[iid]?.[sid]),
      [k]: v,
    };
    const next = {
        ...quotes,
        [iid]: {
          ...quotes[iid],
          [sid]: updatedEntry,
        },
      };
    setQuotes(next);
    if (selectedPR.id)
      setQuotesByPr((all) => ({ ...all, [selectedPR.id]: next }));
    setPoCart((cart) =>
      cart.map((line) =>
        line.allocation.prId === selectedPR.id &&
        line.allocation.prItemId === iid &&
        line.supplierId === sid
          ? {
              ...line,
              price: quoteAfterVat(updatedEntry),
              priceBeforeVat: quoteBeforeVat(updatedEntry),
            }
          : line,
      ),
    );
  };
  const loadComparePR = useCallback(
    (pr: PR) => {
      setSelectedPR(pr);
      setItems(pr.items);
      setQuotes(quotesByPr[pr.id] || {});
      setQuoteSupplierIds(quoteSupplierIdsByPr[pr.id] || []);
      setPoSelections(
        poCart
          .filter((line) => line.allocation.prId === pr.id)
          .map((line) => line.allocation.prItemId),
      );
    },
    [quotesByPr, quoteSupplierIdsByPr, poCart],
  );

  const openCompare = (pr: PR) => {
    loadComparePR(pr);
    navigateTo({ view: "compare", prId: pr.id });
  };

  const handleSpotlightNavigate = (destination: {
    view: View;
    pr?: PR;
    po?: PO;
    paymentId?: number;
    handoverId?: number;
    query?: string;
  }) => {
    setSpotlightOpen(false);

    if (destination.view === "compare" && destination.pr) {
      openCompare(destination.pr);
      return;
    }

    if (destination.view === "po-detail" && destination.po) {
      setCurrentPO(destination.po);
      navigateTo({ view: "po-detail", id: destination.po.id });
      return;
    }

    if (destination.view === "contracts") {
      if (destination.po) {
        setCurrentPO(destination.po);
        navigateTo({ view: "contracts", id: destination.po.id });
      } else {
        navigateTo({ view: "contracts" });
      }
      return;
    }

    if (destination.view === "payment") {
      setSpotlightPaymentSearch(destination.query || "");
      if (destination.paymentId) {
        setSpotlightPaymentActiveId(destination.paymentId);
        navigateTo({ view: "payment", id: destination.paymentId });
      } else {
        navigateTo({ view: "payment" });
      }
      return;
    }

    if (destination.view === "handover") {
      setSpotlightHandoverSearch(destination.query || "");
      if (destination.handoverId) {
        navigateTo({ view: "handover", id: destination.handoverId });
      } else {
        navigateTo({ view: "handover" });
      }
      return;
    }

    navigateTo({ view: destination.view });
  };
  const updatePRNote = (value: string) => {
    const updated = { ...selectedPR, note: value };
    setSelectedPR(updated);
    setPrs((list) =>
      list.map((pr) => (pr.id === selectedPR.id ? updated : pr)),
    );
  };
  const handleUpdatePRScan = (prId: number, scanUrl: string) => {
    setPrs((list) =>
      list.map((pr) => (pr.id === prId ? { ...pr, scan_file_url: scanUrl } : pr))
    );
    setSelectedPR((prev) => (prev && prev.id === prId ? { ...prev, scan_file_url: scanUrl } : prev));
  };

  const handleUploadScanInCompare = async (pr: PR, file: File) => {
    if (!file) return;

    setUploadingScanPrId(pr.id);
    setCompareCompressProgress("Đang tối ưu tài liệu...");
    try {
      const finalFile = await compressUploadFile(file, {
        onProgress: (_pct, msg) => {
          setCompareCompressProgress(msg);
        },
      });

      const formData = new FormData();
      formData.append("file", finalFile);
      formData.append("pr_code", pr.number);
      formData.append("prId", String(pr.id));

      setCompareCompressProgress("Đang lưu trữ...");
      const res = await fetch("/api/upload-scan", {
        method: "POST",
        body: formData,
      });

      const data: any = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Tải lên bản scan thất bại");
      }

      handleUpdatePRScan(pr.id, data.scan_file_url);
    } catch (err: any) {
      alert(err.message || "Lỗi tải lên bản scan");
    } finally {
      setUploadingScanPrId(null);
      setCompareCompressProgress("");
    }
  };

  const savePR = () => {
    if (
      !draft.number.trim() ||
      !draft.date ||
      !draft.department.trim() ||
      !draft.purpose.trim()
    )
      return;
    const valid = draft.items.filter((i) => i.code.trim() || i.name.trim());
    const pr: PR = {
      id: makeId(),
      number: draft.number.trim(),
      date: draft.date,
      department: draft.department.trim(),
      purpose: draft.purpose.trim(),
      note: draft.note.trim(),
      items: valid,
      status: "Chờ xử lý",
      scan_file_url: (draft as any).scan_file_url || undefined,
    };
    setPrs((p) => [pr, ...p]);
    setProducts((current) => [
      ...current,
      ...valid
        .filter((i) => !current.some((p) => p.code === i.code))
        .map((i) => ({ ...i, id: makeId() })),
    ]);
    setDraft({
      number: `PR-${new Date().getFullYear()}-${String(prs.length + 1).padStart(4, "0")}`,
      date: new Date().toISOString().slice(0, 10),
      department: "",
      purpose: "",
      note: "",
      scan_file_url: "",
      items: [emptyItem(0)],
    });
    void clearFormDraft("pr_draft_form");
    setImportMessage("");
    navigateTo({ view: "prs" });
    // Bắt buộc lưu vĩnh viễn vào D1 ngay lập tức khi tạo PR thành công
    setTimeout(() => void persistState(false), 50);
  };
  const importExcel = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(reader.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
          header: 1,
          defval: "",
        });
        const headerIdx = rows.findIndex((r) =>
          r.some((c) => {
            const val = String(c).trim().toLowerCase();
            return val.includes("mã") || val.includes("tên") || val.includes("stt");
          })
        );
        
        let imported: Item[] = [];
        if (headerIdx >= 0) {
           const headers = rows[headerIdx].map(c => String(c).trim().toLowerCase());
           const col = (matchers: string[]) => headers.findIndex(h => matchers.some(m => h.includes(m)));
           
           const colMap = {
              code: col(["mã"]),
              name: col(["tên", "quy cách"]),
              category: col(["nhóm"]),
              desc: col(["ghi chú", "note"]),
              spec: col(["đặc tính", "kỹ thuật", "spec"]),
              unit: col(["đvt", "đơn vị", "unit"]),
              qty: col(["số lượng", "sl", "qty"]),
              estimate: col(["đơn giá", "giá", "price", "dự kiến"])
           };
           
           imported = rows
            .slice(headerIdx + 1)
            .filter(r => r.some(c => String(c).trim())) // Has any data
            .map((row, i) => {
              const rowNumber = headerIdx + i + 2;
              const v = (idx: number) => idx >= 0 ? String(row[idx] ?? "").trim() : "";
              
              const qtyRaw = v(colMap.qty);
              const qty = qtyRaw ? excelNumber(qtyRaw, "Số lượng", rowNumber, false) : 1;
              const estimate = excelNumber(v(colMap.estimate), "Đơn giá dự kiến", rowNumber, false);
              
              const name = v(colMap.name);
              const code = v(colMap.code);
              
              return {
                id: makeId(),
                code,
                category: v(colMap.category),
                name: name || "Chưa có tên",
                desc: v(colMap.desc),
                spec: v(colMap.spec),
                unit: v(colMap.unit) || "Cái",
                qty: qty || 1,
                estimate: estimate || 0,
              };
            });
        } else {
           // Fallback if no headers found
           imported = rows
            .filter(r => r.some(c => String(c).trim()))
            .map((row, i) => {
              const rowNumber = i + 1;
              const qtyRaw = row[7];
              const qty = qtyRaw ? excelNumber(qtyRaw as any, "Số lượng", rowNumber, false) : 1;
              const estimate = excelNumber(row[8] as any, "Đơn giá dự kiến", rowNumber, false);
              
              return {
                id: makeId(),
                code: String(row[1] ?? "").trim(),
                category: String(row[2] ?? "").trim(),
                name: String(row[3] ?? "").trim() || "Chưa có tên",
                desc: String(row[4] ?? "").trim(),
                spec: String(row[5] ?? "").trim(),
                unit: String(row[6] ?? "").trim() || "Cái",
                qty: qty || 1,
                estimate: estimate || 0,
              };
            });
        }
        
        if (!imported.length) throw new Error("File chưa có dữ liệu");
        setDraft((d) => ({ ...d, items: imported }));
        setImportMessage(`Đã nhập ${imported.length} mặt hàng từ ${file.name}`);
      } catch (err) {
        setImportMessage(
          `Không thể nhập file: ${err instanceof Error ? err.message : "Sai định dạng"}`,
        );
      }
      event.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  };
  const supplierBankOptions = useMemo(() => {
    const set = new Set<string>(BANK_SUGGESTIONS);
    suppliers.forEach((s) => {
      if (s.bank?.trim()) set.add(s.bank.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [suppliers]);

  const openSupplierModal = () => {
    setNewSupplier({
      code: `NCC-${String(suppliers.length + 1).padStart(3, "0")}`,
      name: "",
      shortName: "",
      bankAccount: "",
      bank: "",
      address: "",
      contact: "",
      phone: "",
    });
    setSupplierModal(true);
  };
  const supplierField = (key: keyof Omit<Supplier, "id">, value: string) =>
    setNewSupplier((s) => ({ ...s, [key]: value }));
  const addSupplier = () => {
    if (!newSupplier.name.trim()) return;
    const nameTrimmed = newSupplier.name.trim();
    const code =
      newSupplier.code?.trim() ||
      `NCC-${String(suppliers.length + 1).padStart(3, "0")}`;
    const shortName =
      (newSupplier.shortName || "").trim() || generateShortName(nameTrimmed);
    setSuppliers((s) => [
      ...s,
      {
        id: makeId(),
        ...newSupplier,
        code,
        name: nameTrimmed,
        shortName,
      },
    ]);
    setSupplierModal(false);
  };

  const handleAddSupplier = (newSupplier: Supplier) => {
    setSuppliers((current) => {
      if (current.some((s) => s.id === newSupplier.id || s.code === newSupplier.code)) return current;
      return [newSupplier, ...current];
    });
    setStorageStatus(`Đã thêm mới nhà cung cấp: ${newSupplier.name}`);
  };

  const handleAddProduct = (newProduct: Item) => {
    setProducts((current) => {
      if (current.some((p) => p.id === newProduct.id || p.code === newProduct.code)) return current;
      return [newProduct, ...current];
    });
    setStorageStatus(`Đã thêm mới sản phẩm: ${newProduct.name}`);
  };
  const addQuoteSupplier = (overrideId?: number) => {
    const id = overrideId || Number(selectedSupplierId);
    if (!id || quoteSupplierIds.includes(id)) return;
    const next = [...quoteSupplierIds, id];
    setQuoteSupplierIds(next);
    if (selectedPR.id)
      setQuoteSupplierIdsByPr((all) => ({
        ...all,
        [selectedPR.id]: next,
      }));
    setSelectedSupplierId("");
    setSupplierPicker(false);
  };
  const orderedQty = (
    prId: number,
    prNumber: string,
    prItemId: number,
    code: string,
  ) =>
    pos.reduce(
      (sum, po) =>
        sum +
        po.items.reduce(
          (itemSum, item) =>
            itemSum +
            (item.allocations?.length
              ? item.allocations
                  .filter(
                    (allocation) =>
                      allocation.prId === prId &&
                      allocation.prItemId === prItemId,
                  )
                  .reduce((n, allocation) => n + allocation.qty, 0)
              : po.prNumber === prNumber && item.code === code
                ? item.qty
                : 0),
          0,
        ),
      0,
    );
  const togglePOItem = (id: number) => {
    const existing = poCart.find(
      (line) =>
        line.allocation.prId === selectedPR.id &&
        line.allocation.prItemId === id,
    );
    if (existing) {
      setPoCart((cart) => cart.filter((line) => line.id !== existing.id));
      setPoSelections((selected) => selected.filter((itemId) => itemId !== id));
      return;
    }
    const item = items.find((row) => row.id === id),
      winner = best(id);
    if (!item || !winner) return;
    if (poCart.length && poCart[0].supplierId !== winner.supplier.id) {
      setStorageStatus(
        `Giỏ PO đang thuộc ${suppliers.find((s) => s.id === poCart[0].supplierId)?.name}. Hãy phát hành hoặc làm trống giỏ trước.`,
      );
      return;
    }
    const remaining = Math.max(
      0,
      item.qty - orderedQty(selectedPR.id, selectedPR.number, item.id, item.code),
    );
    if (!remaining) {
      setStorageStatus(`${item.code} đã được đặt đủ số lượng`);
      return;
    }
    setPoCart((cart) => [
      ...cart,
      {
        id: `${selectedPR.id}:${item.id}`,
        item: { ...item },
        supplierId: winner.supplier.id,
        price: quoteAfterVat(quotes[item.id]?.[winner.supplier.id]),
        priceBeforeVat: quoteBeforeVat(quotes[item.id]?.[winner.supplier.id]),
        allocation: {
          prId: selectedPR.id,
          prNumber: selectedPR.number,
          prItemId: item.id,
          qty: remaining,
        },
      },
    ]);
    setPoSelections((selected) => [...selected, id]);
  };
  const openApproval = () => {
    const activePr: PR =
      selectedPR && selectedPR.id
        ? { ...selectedPR, items }
        : prs[0] || emptyPR;
    const prQuotes =
      quotesByPr[activePr.id] && Object.keys(quotesByPr[activePr.id]).length > 0
        ? quotesByPr[activePr.id]
        : quotes;
    const prSupIds =
      quoteSupplierIdsByPr[activePr.id] &&
      quoteSupplierIdsByPr[activePr.id].length > 0
        ? quoteSupplierIdsByPr[activePr.id]
        : quoteSupplierIds;

    const newReq = createApprovalFromCompare(
      activePr,
      prQuotes,
      prSupIds,
      suppliers,
      approvalRequests.length,
    );

    // Nếu người dùng đã chọn mặt hàng trong poCart thì ưu tiên đánh dấu NCC trong poCart
    if (poCart.length > 0) {
      const preferredSupId = poCart[0].supplierId;
      const hasPreferred = newReq.supplierColumns.some(
        (c) => c.supplierId === preferredSupId,
      );
      if (hasPreferred) {
        newReq.supplierColumns = newReq.supplierColumns.map((c) => ({
          ...c,
          isSelected: c.supplierId === preferredSupId,
        }));
        const chosen = newReq.supplierColumns.find((c) => c.isSelected);
        if (chosen) {
          newReq.recommendedSupplierName = chosen.supplierName;
        }
      }
    }

    setApprovalRequests((prev) => [newReq, ...prev]);
    setActiveApprovalId(newReq.id);
    setPoCartOpen(false);
    navigateTo({ view: "approval", id: newReq.id });
  };

  const handleCreatePOFromApproval = (req: ApprovalRequest, chosenVatRate: number = 10, customPoNumber?: string) => {
    const selectedCol =
      req.supplierColumns.find((c) => c.isSelected) ||
      (req.recommendedSupplierName
        ? req.supplierColumns.find(
            (c) =>
              c.supplierName &&
              c.supplierName.trim().toLowerCase() === req.recommendedSupplierName.trim().toLowerCase()
          )
        : undefined) ||
      req.supplierColumns[0];

    const supName =
      req.recommendedSupplierName?.trim() ||
      selectedCol?.supplierName?.trim() ||
      "Nhà cung cấp được phê duyệt";

    // Tìm hoặc tạo mới NCC trong danh mục suppliers
    let targetSupplier =
      (selectedCol?.supplierId !== undefined
        ? suppliers.find((s) => s.id === selectedCol.supplierId)
        : undefined) ||
      suppliers.find(
        (s) =>
          (req.recommendedSupplierName &&
            s.name.trim().toLowerCase() === req.recommendedSupplierName.trim().toLowerCase()) ||
          (selectedCol?.supplierName &&
            s.name.trim().toLowerCase() === selectedCol.supplierName.trim().toLowerCase()) ||
          (selectedCol?.shortName &&
            s.shortName &&
            s.shortName.trim().toLowerCase() === selectedCol.shortName.trim().toLowerCase())
      );

    if (!targetSupplier) {
      const newSup: Supplier = {
        id: makeId(),
        code: `NCC-${String(suppliers.length + 1).padStart(3, "0")}`,
        name: supName,
        shortName:
          selectedCol?.shortName ||
          generateShortName(supName),
        bankAccount: "",
        bank: "",
        address: "",
        contact: "",
        phone: "",
      };
      setSuppliers((prev) => [...prev, newSup]);
      targetSupplier = newSup;
    }

    const poItems: POItem[] = [];
    const useSupQty =
      req.showSupplierQty !== undefined
        ? req.showSupplierQty
        : req.columnMode === "extended";
    const useQuotedProd =
      req.showQuotedProduct !== undefined
        ? req.showQuotedProduct
        : req.columnMode === "extended";

    req.rows.forEach((row, rIdx) => {
      const lines = row.supplierQuotes[selectedCol.colId] || [];
      if (lines.length === 0) return;

      lines.forEach((line, lIdx) => {
        const effQty = useSupQty
          ? Number(line.qty) || Number(row.qty) || 1
          : Number(row.qty) || 1;
        const unitPrice = Number(line.unitPrice) || 0;
        if (lines.length > 1 && unitPrice <= 0) return;

        const itemName =
          useQuotedProd && (line.quotedProduct?.trim() || line.origin?.trim())
            ? (line.quotedProduct?.trim() || line.origin?.trim() || row.itemName)
            : row.itemName || `Hàng hóa #${rIdx + 1}`;

        poItems.push({
          id: makeId() + rIdx * 10 + lIdx,
          code:
            row.itemCode ||
            `VT-${String(poItems.length + 1).padStart(2, "0")}`,
          category: "Vật tư / Thiết bị",
          name: itemName,
          desc: line.origin || "",
          spec: row.spec || "",
          unit: row.unit || "Cái",
          qty: effQty,
          estimate: unitPrice,
          price: unitPrice,
          vatRate: chosenVatRate,
          note: "",
          deliveryStatus: "Chưa giao",
          deliveredQty: 0,
          deliveryDate: "",
          deliveryHistory: [],
        });
      });
    });

    const totalWithVat = calcPOTotal({ items: poItems });
    const isAdvance = req.paymentTerms.toLowerCase().includes("trước");
    const todayDate = new Date().toISOString().slice(0, 10);

    const poNumber = (customPoNumber && customPoNumber.trim())
      ? customPoNumber.trim()
      : generatePOCode(targetSupplier, todayDate, pos, trash);

    const newPO: PO = {
      id: makeId(),
      number: poNumber,
      prNumber: req.prNumber || req.requestNumber,
      supplierId: targetSupplier.id,
      createdDate: todayDate,
      expectedDate: "",
      status: "Đang xử lý",
      items: poItems,
      docs: [],
      payments: [
        {
          id: 1,
          phase: "Đợt 1 (100%)",
          condition: isAdvance ? "advance" : "post",
          percent: 100,
          amount: totalWithVat,
          status: "Chưa thanh toán",
          date: "",
          note: req.paymentTerms || "",
        },
      ],
      note: [
        req.paymentTerms ? `Điều khoản TT: ${req.paymentTerms}` : "",
        req.deliveryTerms ? `Giao hàng: ${req.deliveryTerms}` : "",
        `Căn cứ Đề nghị phê duyệt số: ${req.prNumber || req.requestNumber}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };

    setPos((prev) => [newPO, ...prev]);
    setCurrentPO(newPO);
    setApprovalRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? {
              ...r,
              status: "Đã tạo PO",
              linkedPoId: newPO.id,
              linkedPoNumber: newPO.number,
            }
          : r,
      ),
    );
    setStorageStatus(
      `Đã phát hành đơn PO ${newPO.number} từ phiếu Đề nghị phê duyệt ${req.prNumber}`,
    );
    navigateTo({ view: "po-detail", id: newPO.id });
  };
  const createPO = () => {
    if (!poCart.length) return;
    const supplier = suppliers.find((s) => s.id === poCart[0].supplierId);
    if (!supplier) return;
    const grouped = new Map<string, POItem>();
    poCart.forEach((line) => {
      const key = `${line.item.code}|${line.item.spec}|${line.item.unit}|${line.price}`,
        existing = grouped.get(key);
      if (existing) {
        existing.qty += line.allocation.qty;
        existing.allocations = [
          ...(existing.allocations || []),
          line.allocation,
        ];
      } else {
        grouped.set(key, {
          ...line.item,
          id: makeId(),
          qty: line.allocation.qty,
          price: line.price,
          vatRate: 0,
          note: "",
          allocations: [line.allocation],
          deliveryStatus: "Chưa giao",
          deliveredQty: 0,
          deliveryDate: "",
          deliveryHistory: [],
        });
      }
    });
    const sourcePRs = [...new Set(poCart.map((line) => line.allocation.prNumber))];
    const todayDate = new Date().toISOString().slice(0, 10);
    const po: PO = {
      id: makeId(),
      number: generatePOCode(supplier, todayDate, pos, trash),
      prNumber:
        sourcePRs.length === 1 ? sourcePRs[0] : `Nhiều PR (${sourcePRs.length})`,
      supplierId: supplier.id,
      createdDate: todayDate,
      expectedDate: "",
      status: "Mới tạo",
      items: [...grouped.values()],
      docs: [],
      payments: [
        {
          id: makeId(),
          phase: "Tạm ứng",
          percent: 50,
          amount: 0,
          condition: "advance",
          status: "Chưa thanh toán",
          date: "",
          note: "Yêu cầu bổ sung hóa đơn VAT sau khi nhận hàng",
        },
        {
          id: makeId(),
          phase: "Thanh toán còn lại",
          percent: 50,
          amount: 0,
          condition: "post",
          status: "Chưa thanh toán",
          date: "",
          note: "",
        },
      ],
      note: "",
    };
    const total = po.items.reduce((s, i) => s + i.price * i.qty, 0);
    po.payments = po.payments.map((p) => ({
      ...p,
      amount: (total * p.percent) / 100,
    }));
    setPos((p) => [po, ...p]);
    setPrs((list) =>
      list.map((pr) => {
        const total = pr.items.reduce((sum, item) => sum + item.qty, 0),
          ordered = pr.items.reduce(
            (sum, item) =>
              sum +
              orderedQty(pr.id, pr.number, item.id, item.code) +
              poCart
                .filter(
                  (line) =>
                    line.allocation.prId === pr.id &&
                    line.allocation.prItemId === item.id,
                )
                .reduce((n, line) => n + line.allocation.qty, 0),
            0,
          );
        return {
          ...pr,
          status:
            ordered >= total
              ? "Đã tạo đủ PO"
              : ordered > 0
                ? "Đã tạo PO một phần"
                : pr.status,
        };
      }),
    );
    setCurrentPO(po);
    setPoSelections([]);
    setPoCart([]);
    setPoCartOpen(false);
    navigateTo({ view: "po-detail", id: po.id });
  };
  const handleUpdatePONumber = (updatedPO: PO, oldNumber?: string) => {
    const prevNumber = oldNumber || pos.find((p) => p.id === updatedPO.id)?.number;
    setPos((list) => list.map((p) => (p.id === updatedPO.id ? updatedPO : p)));
    if (currentPO?.id === updatedPO.id) {
      setCurrentPO(updatedPO);
    }
    if (prevNumber && prevNumber !== updatedPO.number) {
      // 1. Cascade to ApprovalRequests
      setApprovalRequests((list) =>
        list.map((a) =>
          a.linkedPoId === updatedPO.id || a.linkedPoNumber === prevNumber
            ? { ...a, linkedPoNumber: updatedPO.number }
            : a
        )
      );
      // 2. Cascade to PaymentRequests where group_code === prevNumber or description matches
      setPaymentRequests((list) =>
        list.map((pr) => {
          let modified = false;
          let newGroup = pr.group_code;
          let newDesc = pr.description;
          if (pr.group_code === prevNumber) {
            newGroup = updatedPO.number;
            modified = true;
          }
          if (newDesc && newDesc.includes(prevNumber)) {
            newDesc = newDesc.replaceAll(prevNumber, updatedPO.number);
            modified = true;
          }
          return modified ? { ...pr, group_code: newGroup, description: newDesc } : pr;
        })
      );
      // 3. Cascade to PaymentHandovers where source_number === prevNumber
      setPaymentHandovers((list) =>
        list.map((h) =>
          h.source_number === prevNumber
            ? { ...h, source_number: updatedPO.number }
            : h
        )
      );
    }
    setStorageStatus(`Đã đổi số PO thành ${updatedPO.number}`);
  };

  const updatePO = (po: PO) => {
    const existing = pos.find((p) => p.id === po.id);
    if (existing && existing.number !== po.number) {
      handleUpdatePONumber(po, existing.number);
    } else {
      setCurrentPO(po);
      setPos((list) => list.map((x) => (x.id === po.id ? po : x)));
    }
  };

  const handleUpdatePaymentRequest = useCallback((updatedReq: PaymentRequestEntry) => {
    setPaymentRequests((list) =>
      list.map((r) => (r.id === updatedReq.id ? updatedReq : r))
    );
    setStorageStatus(`Đã cập nhật hóa đơn thanh toán #${updatedReq.legacy_stt || updatedReq.id}`);
    setTimeout(() => void persistState(false), 50);
  }, [persistState]);

  const handleToggleCompletePayment = useCallback((req: PaymentRequestEntry) => {
    const willComplete = !isPaymentCompleted(req);
    const { updatedReq, updatedPOs } = syncPaymentCompletionToPO(req, willComplete, pos);
    setPaymentRequests((list) =>
      list.map((r) => (r.id === req.id ? updatedReq : r))
    );
    setPos(updatedPOs);
    setStorageStatus(`Đã cập nhật thanh toán ${req.id} sang ${willComplete ? "Hoàn thành" : "Chưa hoàn thành"}`);
    // Lưu ngay lập tức vào D1
    setTimeout(() => void persistState(false), 50);
  }, [pos, persistState]);

  const handleToggleCompletePR = useCallback((pr: PR) => {
    const willComplete = !isPRCompleted(pr);
    const nextStatus = willComplete ? "Hoàn thành" : "Đang xử lý";
    setPrs((list) =>
      list.map((p) => (p.id === pr.id ? { ...p, isCompleted: willComplete, status: nextStatus } : p))
    );
    setStorageStatus(`Đã cập nhật PR ${pr.number} sang ${willComplete ? "Hoàn thành" : "Chưa hoàn thành"}`);
  }, []);

  const handleToggleCompletePO = useCallback((po: PO) => {
    const willComplete = !isPOCompleted(po);
    const nextStatus = willComplete ? "Đã hoàn thành" : "Đang thực hiện";
    const updated = { ...po, isCompleted: willComplete, status: nextStatus };
    updatePO(updated);
    setStorageStatus(`Đã cập nhật PO ${po.number} sang ${willComplete ? "Hoàn thành" : "Đang thực hiện"}`);
  }, []);

  const handleToggleCompleteApproval = useCallback((appr: ApprovalRequest) => {
    const willComplete = !isApprovalCompleted(appr);
    const nextStatus: ApprovalRequest["status"] = willComplete ? "Đã phê duyệt" : "Chờ phê duyệt";
    setApprovalRequests((list) =>
      list.map((a) => (a.id === appr.id ? { ...a, isCompleted: willComplete, status: nextStatus } : a))
    );
    setStorageStatus(`Đã cập nhật ĐNPD #${appr.id} sang ${willComplete ? "Hoàn thành" : "Chưa hoàn thành"}`);
  }, []);

  const handleCreateHandoverFromPO = (po: PO) => {
    if (!po.items || po.items.length === 0) {
      alert("PO/Hợp đồng này không có sản phẩm nào để tạo biên bản bàn giao.");
      return;
    }
    setHandoverPickerPO(po);
    setShowHandoverPickerModal(true);
  };

  const handleCreateHandoverFromPR = (pr: PR) => {
    if (!pr.items || pr.items.length === 0) {
      alert("Yêu cầu mua sắm (PR) này chưa có sản phẩm nào để tạo biên bản bàn giao.");
      return;
    }
    const pseudoPO: PO = {
      id: -Math.abs(Number(pr.id) || 1),
      number: pr.number,
      createdDate: pr.date,
      expectedDate: pr.date,
      prNumber: pr.number,
      supplierId: 0,
      status: "PR",
      items: pr.items.map((it) => ({
        id: it.id,
        code: it.code || "",
        category: it.category || "",
        name: it.name,
        desc: it.desc || "",
        spec: it.spec || "",
        unit: it.unit || "Cái",
        qty: it.qty,
        estimate: it.estimate || 0,
        price: it.estimate || 0,
        deliveryStatus: "Chưa giao" as const,
        deliveredQty: 0,
        deliveryDate: pr.date,
      })),
      docs: [],
      payments: [],
      note: pr.purpose || "",
    };
    setHandoverPickerPO(pseudoPO);
    setShowHandoverPickerModal(true);
  };

  const handleConfirmHandoverFromPicker = (payload: {
    items: {
      item: POItem;
      qtyDoc: number;
      qtyPass: number;
      department: string;
      note: string;
      handoverDate: string;
      senderName: string;
      receiverName: string;
    }[];
    department: string;
    handoverDate: string;
    senderName: string;
    receiverName: string;
  }) => {
    if (!handoverPickerPO || payload.items.length === 0) return;

    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    let curId = maxId;

    const supplier = suppliers.find((s) => s.id === handoverPickerPO.supplierId);
    const isFromPR = handoverPickerPO.id < 0;
    const docTypeLabel = isContractPO(handoverPickerPO) ? "Hợp đồng" : isFromPR ? "PR" : "PO";

    const existingBatches = getPODeliveryBatches(handoverPickerPO, paymentHandovers);
    const newBatchNumber = existingBatches.length + 1;
    const newBatchId = generateHandoverBatchId(handoverPickerPO.number, newBatchNumber);

    const poItemOrderMap = new Map((handoverPickerPO.items || []).map((pIt, pIdx) => [pIt.id, pIdx]));

    // 1. Tạo các bản ghi bàn giao cho ĐÚNG số lượng thực tế đợt này (Ghi nhận item_order theo PO gốc)
    const newHandovers: PaymentHandoverItem[] = payload.items.map((entry, idx) => {
      const it = entry.item;
      return {
        id: curId++,
        department: payload.department,
        item_name: it.name,
        unit: it.unit || "Cái",
        quantity_doc: String(entry.qtyDoc),
        quantity_pass: String(entry.qtyPass),
        quantity_fail: "",
        note: entry.note?.trim() || "",
        handover_date: payload.handoverDate || localToday(),
        sender_name: payload.senderName || "Trần Hải Hà",
        sender_dept: "Phòng Cung ứng",
        receiver_name: payload.receiverName || "",
        source_type: docTypeLabel,
        source_number: handoverPickerPO.number,
        specification: it.spec || "",
        po_item_id: it.id,
        batch_id: newBatchId,
        batch_number: newBatchNumber,
        item_order: poItemOrderMap.get(it.id) ?? idx,
      };
    });

    // 2. Tính toán chính xác số lượng lũy kế và trạng thái từng mặt hàng dựa trên deliveryStats
    const currentDeliveryStats = calcPODeliveryStats(handoverPickerPO, paymentHandovers);

    const updatedItems = (handoverPickerPO.items || []).map((it) => {
      const entry = payload.items.find((x) => x.item.id === it.id);
      const prevStat = currentDeliveryStats.itemsStats[it.id];
      const prevDelivered = prevStat ? prevStat.quantityDelivered : (Number(it.deliveredQty) || 0);
      const reqQty = Math.max(0, Number(it.qty) || 0);

      if (!entry) {
        // Dòng hàng này không giao trong đợt này: giữ nguyên số lượng lũy kế
        const isDone = prevDelivered >= reqQty && reqQty > 0;
        return {
          ...it,
          deliveredQty: prevDelivered,
          deliveryStatus: (isDone ? "Đã giao" : prevDelivered > 0 ? "Giao một phần" : "Chưa giao") as any,
        };
      }

      // Dòng hàng được giao trong đợt này
      const batchDelivered = Number(entry.qtyPass) || 0;
      const nextDelivered = Math.min(reqQty, prevDelivered + batchDelivered);
      const nextStatus =
        nextDelivered >= reqQty
          ? "Đã giao"
          : nextDelivered > 0
          ? "Giao một phần"
          : "Chưa giao";

      const newHistoryEntry: PODeliveryLog = {
        date: payload.handoverDate || localToday(),
        qty: batchDelivered,
        note: entry.note || undefined,
        senderName: payload.senderName || undefined,
        receiverName: payload.receiverName || undefined,
      };

      return {
        ...it,
        deliveredQty: nextDelivered,
        deliveryStatus: nextStatus as any,
        deliveryDate: payload.handoverDate || localToday(),
        deliveryHistory: [...(it.deliveryHistory || []), newHistoryEntry],
      };
    });

    // 3. Đánh giá trạng thái tổng thể của PO
    const allDone = updatedItems.length > 0 && updatedItems.every(
      (i) => (Number(i.deliveredQty) || 0) >= (Number(i.qty) || 0)
    );
    const someDone = updatedItems.some((i) => (Number(i.deliveredQty) || 0) > 0);
    const nextPoStatus = allDone ? "Đã giao đủ" : someDone ? "Đang giao hàng" : handoverPickerPO.status;

    const updatedPO: PO = {
      ...handoverPickerPO,
      status: nextPoStatus,
      items: updatedItems,
      isCompleted: allDone ? true : handoverPickerPO.isCompleted,
    };

    if (!isFromPR) {
      updatePO(updatedPO);
      if (currentPO?.id === handoverPickerPO.id) {
        setCurrentPO(updatedPO);
      }
    }

    setPaymentHandovers((prev) => [...newHandovers, ...prev]);
    setSpotlightHandoverSearch(handoverPickerPO.number);

    // Tự động chuyển thẳng sang tab Bàn giao theo đúng luồng bàn giao nội bộ không qua kho
    navigateTo({ view: "handover" });
    setStorageStatus(`✓ Đã tạo phiếu bàn giao nội bộ không qua kho (${newBatchId}) cho ${payload.department} từ ${docTypeLabel} #${handoverPickerPO.number}. Đang xem tại tab Bàn giao.`);
  };

  const handleOpenBatchHandoverPreview = (targetPO: PO | null, batch: PODeliveryBatch) => {
    if (!targetPO || !batch) return;
    const cleanDept = (batch.department && batch.department.trim() !== "Phòng Cung ứng")
      ? batch.department.trim()
      : (prs.find((p) => p.number === targetPO.prNumber)?.department || "");
    setPrintHandoverData({
      isOpen: true,
      items: sortHandoversByPOLineOrder(batch.rawHandovers, targetPO),
      po: targetPO,
      department: cleanDept,
      handoverDate: batch.date || "",
      senderName: batch.senderName || "Trần Hải Hà",
      receiverName: batch.receiverName || "",
    });
  };

  const handleOpenExistingHandoverPreview = (targetPO: PO) => {
    const cleanNum = targetPO.number.trim().toLowerCase();
    const matching = paymentHandovers.filter(
      (h) => (h.source_number || "").trim().toLowerCase() === cleanNum
    );
    if (matching.length === 0) {
      alert(`Chưa có biên bản bàn giao nào cho đơn hàng #${targetPO.number}.`);
      return;
    }
    const cleanDept = (matching[0]?.department && matching[0].department.trim() !== "Phòng Cung ứng")
      ? matching[0].department.trim()
      : (prs.find((p) => p.number === targetPO.prNumber)?.department || "");
    setPrintHandoverData({
      isOpen: true,
      items: sortHandoversByPOLineOrder(matching, targetPO),
      po: targetPO,
      department: cleanDept,
      handoverDate: matching[0]?.handover_date || "",
      senderName: matching[0]?.sender_name || "Trần Hải Hà",
      receiverName: matching[0]?.receiver_name || "",
    });
  };

  const handleCreatePaymentRequestFromHandover = (newReq: PaymentRequestEntry) => {
    setPaymentRequests((prev) => [newReq, ...prev]);
    setSpotlightPaymentActiveId(newReq.id);
    setSpotlightPaymentSearch("");
    navigateTo({ view: "payment", id: newReq.id });
    setStorageStatus(`Đã tạo Đề nghị thanh toán #${newReq.legacy_stt} từ ${newReq.lines?.length || 0} vật tư bàn giao!`);
  };

  const executeCreatePaymentRequest = (
    po: PO,
    payment: Payment,
    customInfo?: { address?: string; bankAccount?: string; bank?: string }
  ) => {
    const supplier = suppliers.find((s) => s.id === po.supplierId);
    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const todayStr = localToday();
    const condition = payment.condition || "post";

    const docSupplement =
      condition === "advance"
        ? "Yêu cầu NCC bổ sung hóa đơn VAT đầy đủ sau khi giao hàng"
        : (payment.note || "");

    const finalAddress = customInfo?.address || supplier?.address || "";
    const finalAccount = customInfo?.bankAccount || supplier?.bankAccount || "";
    const finalBank = customInfo?.bank || supplier?.bank || "";

    const desc = buildPOPaymentDescription(po, payment);

    // Lấy thông tin hóa đơn nếu có từ payment stage hiện tại hoặc từ PO
    const invoiceFromCurrent = payment.invoiceNo && payment.invoiceNo.trim();
    const fallbackInvoice = (po.payments || []).find((p) => p.invoiceNo && p.invoiceNo.trim());
    const finalInvoiceNo = invoiceFromCurrent
      ? payment.invoiceNo!.trim()
      : fallbackInvoice
      ? fallbackInvoice.invoiceNo!.trim()
      : "";
    const finalInvoiceDate = invoiceFromCurrent
      ? (payment.invoiceDate || "")
      : fallbackInvoice
      ? (fallbackInvoice.invoiceDate || "")
      : "";

    // Không cập nhật danh sách sản phẩm của PO vào DNTT, chỉ tạo dòng thanh toán tổng quát
    const lines: PaymentDetailLine[] = [
      {
        description: desc || payment.phase || `Thanh toán theo đơn hàng ${po.number}`,
        invoice_no: finalInvoiceNo,
        invoice_date: finalInvoiceDate,
        amount: payment.amount,
        note: payment.note || "",
      },
    ];

    const newRequest: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: maxId,
      beneficiary_id: supplier?.id,
      payee_name: supplier?.name || "Chưa xác định",
      group_code: po.number,
      description: desc,
      item_name: payment.phase || desc,
      invoice_no: finalInvoiceNo,
      invoice_date: finalInvoiceDate,
      amount: payment.amount,
      currency: "VND",
      documents: [], // Phần hồ sơ không tự động thêm gì cả, để người dùng tự chọn
      request_date: payment.date || todayStr,
      payment_type: condition === "advance" ? "Tạm ứng" : "Thanh toán công nợ",
      status: "Chờ duyệt",
      doc_supplement: docSupplement,
      address: finalAddress,
      account_no: finalAccount,
      bank: finalBank,
      created_by_name: "Phòng Cung ứng",
      due_date: payment.date || todayStr,
      lines,
    };

    // Cập nhật payment stage trong PO với paymentRequestId mới
    const updatedPayments = (po.payments || []).map((p) =>
      p.id === payment.id ? { ...p, paymentRequestId: maxId, status: "Đang xử lý" as const } : p
    );
    const updatedPO = { ...po, payments: updatedPayments };
    updatePO(updatedPO);
    if (currentPO?.id === po.id) {
      setCurrentPO(updatedPO);
    }

    // Lưu vào state paymentRequests
    setPaymentRequests((prev) => [newRequest, ...prev]);
    setStorageStatus(`✓ Đã tạo Đề nghị thanh toán #${maxId} cho ${payment.phase}. Mở bản in Mẫu 01-TT.`);

    // Mở trực tiếp trang in/modal xem trước bản in Giấy đề nghị thanh toán
    setPrintPaymentRequest(newRequest);
  };

  const handleCreatePaymentRequestFromPOPayment = (
    po: PO,
    payment: Payment,
    customSupplierInfo?: { address?: string; bankAccount?: string; bank?: string }
  ) => {
    // Nếu đợt thanh toán này đã có ĐNTT liên kết -> mở trực tiếp bản in ĐNTT đó
    if (payment.paymentRequestId) {
      const existing = paymentRequests.find((r) => r.id === payment.paymentRequestId);
      if (existing) {
        setPrintPaymentRequest(existing);
        return;
      }
    }

    // Yêu cầu bắt buộc Hóa đơn GTGT đối với đợt thanh toán trả sau (sau giao hàng / công nợ)
    const isPostPayment = payment.condition !== "advance";
    const hasInvoice = Boolean(payment.invoiceNo && payment.invoiceNo.trim());
    if (isPostPayment && !hasInvoice) {
      alert(
        `Đợt thanh toán trả sau "${payment.phase}" bắt buộc phải có thông tin Số hóa đơn GTGT trước khi lập Đề nghị thanh toán.\n\n` +
        `Vui lòng nhập Số hóa đơn tại mục Đợt thanh toán của PO hoặc liên kết với phiếu ĐNTT tự tạo!`
      );
      const inputEl = document.getElementById(`invoice-no-input-${payment.id}`);
      if (inputEl) {
        inputEl.scrollIntoView({ behavior: "smooth", block: "center" });
        inputEl.focus();
      }
      return;
    }

    const supplier = suppliers.find((s) => s.id === po.supplierId);
    const hasAddress = Boolean(customSupplierInfo?.address || supplier?.address?.trim());
    const hasAccount = Boolean(customSupplierInfo?.bankAccount || supplier?.bankAccount?.trim());
    const hasBank = Boolean(customSupplierInfo?.bank || supplier?.bank?.trim());

    // Kiểm tra thông tin NCC: Địa chỉ, Số tài khoản ngân hàng, Tên ngân hàng
    if (!hasAddress || !hasAccount || !hasBank) {
      setSupplierQuickBankState({
        isOpen: true,
        supplier: supplier || {
          id: po.supplierId || Date.now(),
          code: "",
          name: "Nhà cung cấp",
          address: "",
          bankAccount: "",
          bank: "",
          contact: "",
          phone: "",
        },
        pendingPO: po,
        pendingPayment: payment,
      });
      return;
    }

    executeCreatePaymentRequest(po, payment, customSupplierInfo);
  };

  const handleConfirmQuickBank = (info: {
    bankAccount: string;
    bank: string;
    address: string;
    saveToCatalog: boolean;
  }) => {
    if (!supplierQuickBankState) return;
    const { supplier, pendingPO, pendingPayment } = supplierQuickBankState;

    if (info.saveToCatalog && supplier.id) {
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplier.id
            ? { ...s, bankAccount: info.bankAccount, bank: info.bank, address: info.address }
            : s
        )
      );
    }

    setSupplierQuickBankState(null);
    executeCreatePaymentRequest(pendingPO, pendingPayment, info);
  };

  const handleOpenGeneralPaymentRequestFromPO = (po: PO) => {
    const payments = po.payments || [];
    if (payments.length === 0) {
      const defaultStage: Payment = {
        id: Date.now(),
        phase: "Thanh toán 100%",
        percent: 100,
        amount: calcPOTotal(po),
        status: "Chưa thanh toán",
        date: localToday(),
        condition: "post",
      };
      const updatedPO = { ...po, payments: [defaultStage] };
      updatePO(updatedPO);
      if (currentPO?.id === po.id) setCurrentPO(updatedPO);
      alert(
        `Đã tạo đợt thanh toán 100% cho đơn hàng ${po.number}.\n\n` +
        `Vì đây là đợt thanh toán trả sau, bắt buộc phải nhập Số hóa đơn GTGT trước khi lập Đề nghị thanh toán. Vui lòng nhập Số hóa đơn tại mục Đợt thanh toán của PO bên dưới!`
      );
      setTimeout(() => {
        const inputEl = document.getElementById(`invoice-no-input-${defaultStage.id}`);
        if (inputEl) {
          inputEl.scrollIntoView({ behavior: "smooth", block: "center" });
          inputEl.focus();
        }
      }, 200);
      return;
    }

    const unlinked = payments.filter((p) => !p.paymentRequestId);
    if (unlinked.length === 1) {
      const single = unlinked[0];
      const isPost = single.condition !== "advance";
      const hasInv = Boolean(single.invoiceNo && single.invoiceNo.trim());
      if (isPost && !hasInv) {
        alert(
          `Đợt thanh toán trả sau "${single.phase}" bắt buộc phải có thông tin Số hóa đơn GTGT trước khi lập Đề nghị thanh toán.\n\n` +
          `Vui lòng nhập Số hóa đơn tại mục Đợt thanh toán của PO hoặc liên kết với phiếu ĐNTT tự tạo!`
        );
        const inputEl = document.getElementById(`invoice-no-input-${single.id}`);
        if (inputEl) {
          inputEl.scrollIntoView({ behavior: "smooth", block: "center" });
          inputEl.focus();
        }
        return;
      }
      handleCreatePaymentRequestFromPOPayment(po, single);
    } else {
      setPaymentStagePickerPO(po);
    }
  };
  const activeContracts = pos.filter((po) => !hiddenContractIds.includes(po.id));
  const handleSetActiveApprovalId = useCallback((id: number | null) => {
    setActiveApprovalId(id);
    if (id !== null) {
      navigateTo({ view: "approval", id });
    } else {
      navigateTo({ view: "approval" });
    }
  }, []);

  // Áp dụng route chuẩn hóa vào React state
  const handleClearRouteModal = useCallback(() => {
    setRouteModal(null);
    if (typeof window !== "undefined" && window.location.hash.includes("modal=")) {
      const currentRoute = parseRouteFromHash(window.location.hash);
      const { modal: _m, ...cleanRoute } = currentRoute;
      navigateTo(cleanRoute, { replace: true });
    }
  }, []);

  const applyRoute = useCallback(
    (route: AppRoute) => {
      setView(route.view);
      setIsPrintApproval(Boolean(route.isPrint));
      setRouteModal(route.modal || null);

      if (route.view === "approval") {
        setActiveApprovalId(route.id ?? null);
        if (route.prId !== undefined) {
          const foundPR = prs.find((p) => p.id === route.prId);
          if (foundPR) setSelectedPR(foundPR);
        }
      } else if (route.view === "compare") {
        const targetPrId = route.prId || route.id;
        if (targetPrId !== undefined) {
          const foundPR = prs.find((p) => p.id === targetPrId);
          if (foundPR) {
            loadComparePR(foundPR);
          }
        } else if (selectedPR?.id) {
          loadComparePR(selectedPR);
        } else if (prs.length > 0) {
          loadComparePR(prs[0]);
        }
      } else if (route.view === "po-detail") {
        const targetPoId = route.id || route.poId;
        if (targetPoId !== undefined) {
          const foundPO = pos.find((p) => p.id === targetPoId);
          if (foundPO) {
            setCurrentPO(foundPO);
          }
        }
      } else if (route.view === "contracts") {
        if (route.id !== undefined) {
          const foundPO = pos.find((p) => p.id === route.id);
          if (foundPO) setCurrentPO(foundPO);
        }
      } else if (route.view === "payment") {
        if (route.id !== undefined) {
          setSpotlightPaymentActiveId(route.id);
          setSpotlightPaymentSearch("");
        }
      } else if (route.view === "catalog") {
        if (route.tab === "suppliers" || route.tab === "products") {
          setCatalogSubTab(route.tab);
        }
      } else if (route.view === "products") {
        setCatalogSubTab("products");
      } else if (route.view === "suppliers") {
        setCatalogSubTab("suppliers");
      }
    },
    [prs, pos, loadComparePR],
  );

  // Lắng nghe các sự kiện điều hướng Browser History (popstate, hashchange, scm_route_change)
  useEffect(() => {
    const handleRouteChange = () => {
      const currentRoute = parseRouteFromHash(window.location.hash);
      applyRoute(currentRoute);
    };

    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("scm_route_change", handleRouteChange as EventListener);

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
      window.removeEventListener("scm_route_change", handleRouteChange as EventListener);
    };
  }, [applyRoute]);

  // Khởi tạo và đồng bộ hóa URL khi ứng dụng hoặc dữ liệu sẵn sàng
  useEffect(() => {
    if (!storageReady) return;
    const currentHash = window.location.hash;
    if (!currentHash || currentHash === "#" || currentHash === "#/") {
      navigateTo({ view: "dashboard" }, { replace: true });
      return;
    }

    const route = parseRouteFromHash(currentHash);
    applyRoute(route);
  }, [storageReady, prs, pos, applyRoute]);

  const isNavActive = (id: string) => {
    if (view === "dashboard" && id === "dashboard") return true;
    if ((view === "prs" || view === "create" || view === "compare") && id === "prs") return true;
    if (view === "approval" && id === "approval") return true;
    if ((view === "po-list" || view === "po-detail" || view === "contracts") && id === "po-list") return true;
    if (view === "payment" && id === "payment") return true;
    if (view === "handover" && id === "handover") return true;
    if ((view === "catalog" || view === "products" || view === "suppliers") && id === "catalog") return true;
    if (view === "trash" && id === "trash") return true;
    return false;
  };

  const nav = [
    {
      id: "dashboard",
      icon: <Home size={18} />,
      name: "Trang chủ",
      action: () => navigateTo({ view: "dashboard" }),
    },
    {
      id: "prs",
      icon: <FileText size={18} />,
      name: "PR",
      action: () => navigateTo({ view: "prs" }),
    },
    {
      id: "approval",
      icon: <CheckSquare size={18} />,
      name: "ĐNPD",
      action: () => {
        setActiveApprovalId(null);
        navigateTo({ view: "approval" });
      },
    },
    {
      id: "po-list",
      icon: <Package size={18} />,
      name: "PO",
      action: () => navigateTo({ view: "po-list" }),
    },
    {
      id: "payment",
      icon: <CreditCard size={18} />,
      name: "Thanh toán",
      action: () => navigateTo({ view: "payment" }),
    },
    {
      id: "handover",
      icon: <Truck size={18} />,
      name: "Bàn giao",
      action: () => navigateTo({ view: "handover" }),
    },
    {
      id: "catalog",
      icon: <Layers size={18} />,
      name: "Danh mục",
      action: () => navigateTo({ view: "catalog" }),
    },
    {
      id: "trash",
      icon: <Trash2 size={18} />,
      name: trash.length > 0 ? `Thùng rác (${trash.length})` : "Thùng rác",
      action: () => navigateTo({ view: "trash" }),
    },
  ];

  const visibleNav = reportMode
    ? nav.filter((n) =>
        [
          "dashboard",
          "prs",
          "approval",
          "po-list",
          "payment",
          "handover",
          "catalog",
        ].includes(n.id),
      )
    : nav;

  return (
    <div
      className={`app ${collapsed ? "collapsed" : ""} ${reportMode ? "report-mode" : ""} ${uiTheme === "misa" ? "theme-misa" : ""}`}
    >
      {isAppLoading && (
        <div
          id="pka-app-splash"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            backgroundColor: "#082f58",
            color: "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
            userSelect: "none",
          }}
          className="no-print"
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
          >
            <span style={{ fontSize: "24px", fontWeight: 900, letterSpacing: "1px", color: "#ffffff" }}>PK</span>
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 900, letterSpacing: "2px", margin: "0 0 4px 0", color: "#ffffff" }}>
            PHENIKAA
          </h2>
          <p style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.7)", margin: "0 0 24px 0", fontWeight: 500 }}>
            Hệ thống Quản lý Mua hàng (SCMH)
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 18px",
              borderRadius: "20px",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              fontSize: "12px",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: "2px solid rgba(255, 255, 255, 0.3)",
                borderTopColor: "#ffffff",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span>Đang nạp ứng dụng offline...</span>
          </div>
        </div>
      )}
      {!["payment", "handover", "compare"].includes(view) && (
        <SmartTableTools scopeKey={view} />
      )}
      <aside>
        <div className="brand">
          <span>
            <img src="/phenikaa-logo.png" alt="Phenikaa" />
          </span>
          <b>
            <strong>PHENIKAA</strong>
            <small>{reportMode ? t("header.report_mode") : "Procurement"}</small>
          </b>
        </div>
        <button
          type="button"
          className="sidebar-search-btn"
          onClick={() => setSpotlightOpen(true)}
          title={t("header.search_placeholder")}
        >
          <span className="search-icon">🔍</span>
          <b className="search-text">{t("header.search_placeholder")}</b>
          <kbd className="search-kbd">Ctrl K</kbd>
        </button>
        <nav>
          {visibleNav.map((n) => (
            <button
              onClick={() => {
                n.action();
                if (typeof window !== "undefined" && window.innerWidth <= 768) {
                  setCollapsed(true);
                }
              }}
              className={isNavActive(n.id) ? "active" : ""}
              key={n.id}
            >
              <span>{n.icon}</span>
              <b>{n.name}</b>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom-actions">
          {/* 1. Hàng nút tiện ích phụ (Secondary Actions) */}
          <div className="sidebar-secondary-actions">
            <button
              type="button"
              className="sidebar-secondary-btn"
              onClick={() => setHelpDrawerOpen(true)}
              title="Mở Sổ tay Hướng dẫn quy trình & Phím tắt [?]"
            >
              <HelpCircle size={15} style={{ color: "#38bdf8" }} /> <span>Hướng dẫn</span>
            </button>
            <button
              type="button"
              className="sidebar-secondary-btn"
              onClick={() => setSettingsModalOpen(true)}
              title="Cài đặt hệ thống: Ngôn ngữ, Tạo link theo dõi, Mẫu in..."
            >
              <Settings size={15} style={{ color: "#94a3b8" }} /> <span>Cài đặt</span>
            </button>
          </div>

          {/* 2. Khối tài khoản: Avatar + Tên hiển thị (Master Admin) */}
          <div className="sidebar-user-card">
            <div className="user-profile">
              <i className="user-avatar">{currentUser?.displayName?.slice(0, 2).toUpperCase() || "MA"}</i>
              <div className="user-meta">
                <b className="user-name" title={currentUser?.displayName || "Master Admin"}>
                  {currentUser?.displayName || "Master Admin"}
                </b>
                <small className="user-role">
                  {currentUser
                    ? currentUser.role === "master"
                      ? "Master Admin"
                    : currentUser.role === "admin"
                      ? "Admin"
                      : "Người dùng"
                    : "Chỉ xem"}
                </small>
              </div>
            </div>
          </div>

          {/* 3. Nút Đăng xuất: Màu đỏ ở dưới cùng */}
          {!reportMode && currentUser && (
            <button
              type="button"
              className="btn-sidebar-logout-red"
              onClick={logout}
              title="Đăng xuất tài khoản khỏi hệ thống"
            >
              <LogOut size={14} /> <span>Đăng xuất</span>
            </button>
          )}
        </div>
        <button className="collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? t("nav.expand") : t("nav.collapse")}>
          « <b>{collapsed ? t("nav.expand") : t("nav.collapse")}</b>
        </button>
      </aside>
      {!collapsed && (
        <button
          className="mobile-sidebar-backdrop"
          aria-label="Đóng menu"
          onClick={() => setCollapsed(true)}
        />
      )}
      <main className="flex-1 h-screen overflow-y-auto overflow-x-hidden bg-slate-50 relative pb-28">
        <div className="mobile-header">
          <button className="hamb" onClick={() => setCollapsed(!collapsed)}>
            ☰
          </button>
          <b>{reportMode ? t("header.report_mode") : "Procurement"}</b>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
            <button type="button" className="mobile-search-btn" onClick={() => setSettingsModalOpen(true)} title="Cài đặt hệ thống"><Settings size={16} /></button>
            <button
              type="button"
              className="mobile-search-btn"
              onClick={() => setHelpDrawerOpen(true)}
              title="Sổ tay Hướng dẫn [?]"
            >
              <HelpCircle size={17} style={{ color: "#0284c7" }} />
            </button>
            <button
              type="button"
              className="mobile-search-btn"
              onClick={() => setSpotlightOpen(true)}
              title={t("header.search_placeholder")}
            >
              🔍
            </button>
          </div>
        </div>
        {reportMode ? (
          <div className="report-banner">
            <div>
              <b>◉ BÁO CÁO CHỈ XEM</b>
              <span>
                Dữ liệu PR, báo giá, PO và hợp đồng · Không thể chỉnh sửa
              </span>
            </div>
            <small>Dữ liệu đồng bộ trực tuyến</small>
          </div>
        ) : (
          <>
            <div
              className={`cloud-status desktop-only-status ${
                !isOnline
                  ? "offline"
                  : storageStatus.includes("thất bại") || storageStatus.includes("Không thể")
                  ? "error"
                  : ""
              }`}
              style={{
                ...(!isOnline
                  ? { backgroundColor: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" }
                  : {}),
              }}
            >
              <i style={{ color: !isOnline ? "#d97706" : undefined }}>●</i>
              {!isOnline
                ? `Ngoại tuyến${queueCount > 0 ? ` (${queueCount} chờ lưu)` : ""}`
                : storageStatus}
            </div>
          </>
        )}
        <Suspense fallback={<div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "14px" }}>Đang tải giao diện...</div>}>
        {view === "dashboard" && (
          <Dashboard
            prs={prs}
            pos={pos}
            approvalRequests={approvalRequests}
            paymentRequests={paymentRequests}
            suppliers={suppliers}
            purchaseHistory={purchaseHistory}
            onNavigate={(route) => navigateTo(route)}
            onOpenSpotlight={() => setSpotlightOpen(true)}
            onCreatePR={() => navigateTo({ view: "create" })}
            onCreateApproval={() => navigateTo({ view: "approval", modal: "create" })}
            onCreatePO={() => navigateTo({ view: "po-list", modal: "create" })}
            onCreatePayment={() => navigateTo({ view: "payment", modal: "create" })}
            onCreateHandover={() => navigateTo({ view: "handover", modal: "create" })}
            onSelectPR={(pr) => {
              loadComparePR(pr);
              navigateTo({ view: "compare", prId: pr.id });
            }}
            onSelectPO={(po) => {
              setCurrentPO(po);
              navigateTo({ view: "po-detail", id: po.id });
            }}
            onSelectApproval={(id) => {
              setActiveApprovalId(id);
              navigateTo({ view: "approval", id });
            }}
            onSelectPayment={(id) => {
              if (id) setSpotlightPaymentActiveId(id);
              navigateTo({ view: "payment", id });
            }}
            onToggleCompletePayment={handleToggleCompletePayment}
            onUpdatePaymentRequest={handleUpdatePaymentRequest}
            onToggleCompletePR={handleToggleCompletePR}
            onToggleCompletePO={handleToggleCompletePO}
            onToggleCompleteApproval={handleToggleCompleteApproval}
          />
        )}
        {view === "contracts" && (
          <ErrorBoundary key="contracts" fallbackTitle="Lỗi hiển thị quản lý Hợp đồng" onReset={() => navigateTo({ view: "dashboard" })}>
            <ContractManagement
              pos={activeContracts}
              suppliers={suppliers}
              products={products}
              prs={prs}
              onAddSupplier={handleAddSupplier}
              onAddProduct={handleAddProduct}
              onCreateContract={(contractPO, paymentGroup) => {
                setPos((list) => [contractPO, ...list]);
                if (paymentGroup) {
                  setPaymentGroups((groups) => [paymentGroup, ...groups]);
                }
                setCurrentPO(contractPO);
                setStorageStatus(`Đã tạo hợp đồng ${contractPO.number}`);
              }}
              onOpenPO={(po) => {
                setCurrentPO(po);
                navigateTo({ view: "po-detail", id: po.id });
              }}
              onUpdate={updatePO}
              onDelete={reportMode ? undefined : (po) => requestDelete("CONTRACT", po)}
              workspaceId={workspaceId}
              readOnly={reportMode}
              onStatus={setStorageStatus}
              paymentGroups={paymentGroups}
              paymentRequests={paymentRequests}
              onUpdateState={(patch) => {
                if (patch.paymentGroups !== undefined) setPaymentGroups(patch.paymentGroups);
              }}
              onNavigateToPayment={(_filterGroupId) => {
                navigateTo({ view: "payment" });
              }}
              onCreateHandover={handleCreateHandoverFromPO}
              onCreatePaymentRequest={handleOpenGeneralPaymentRequestFromPO}
            />
          </ErrorBoundary>
        )}
        {view === "payment" && (
          <PaymentManagement
            paymentRequests={paymentRequests}
            paymentGroups={paymentGroups}
            paymentTemplate={paymentTemplate}
            pos={pos}
            suppliers={suppliers}
            products={products}
            prs={prs}
            initialSearchQuery={spotlightPaymentSearch}
            initialActiveId={spotlightPaymentActiveId}
            onUpdateState={(patch) => {
              if (patch.paymentRequests !== undefined) setPaymentRequests(patch.paymentRequests);
              if (patch.paymentGroups !== undefined) setPaymentGroups(patch.paymentGroups);
              if (patch.paymentTemplate !== undefined) setPaymentTemplate(patch.paymentTemplate);
            }}
            onUpdatePO={updatePO}
            onToggleCompletePayment={handleToggleCompletePayment}
            onMoveToTrash={moveToTrash}
            readOnly={reportMode}
            autoOpenCreate={routeModal === "create"}
            onClearAutoCreate={handleClearRouteModal}
          />
        )}
        {view === "handover" && (
          <HandoverManagement
            paymentHandovers={paymentHandovers}
            prs={prs}
            pos={pos}
            suppliers={suppliers}
            paymentRequests={paymentRequests}
            initialSearchQuery={spotlightHandoverSearch}
            onUpdateHandovers={(items) => setPaymentHandovers(items)}
            onUpdateState={(patch) => {
              if (patch.paymentHandovers !== undefined) setPaymentHandovers(patch.paymentHandovers);
            }}
            onNavigateToPayment={handleCreatePaymentRequestFromHandover}
            onMoveToTrash={moveToTrash}
            readOnly={reportMode}
            autoOpenCreate={routeModal === "create"}
            onClearAutoCreate={handleClearRouteModal}
          />
        )}
        {view === "approval" && (
          <ErrorBoundary
            key="approval"
            fallbackTitle="Lỗi hiển thị Đề nghị Phê duyệt Lựa chọn Nhà Cung Cấp"
            onReset={() => navigateTo({ view: "dashboard" })}
          >
            <ApprovalManagement
              approvalRequests={approvalRequests}
              activeApprovalId={activeApprovalId}
              setActiveApprovalId={handleSetActiveApprovalId}
              autoPrint={isPrintApproval}
              onSaveApproval={(updatedReq) => {
                setApprovalRequests((prev) => {
                  const exists = prev.some((r) => r.id === updatedReq.id);
                  if (exists) {
                    return prev.map((r) =>
                      r.id === updatedReq.id ? updatedReq : r,
                    );
                  }
                  return [updatedReq, ...prev];
                });
                // Bắt buộc lưu vĩnh viễn vào D1 ngay lập tức khi lưu ĐNPD
                setTimeout(() => void persistState(false), 50);
              }}
              onDeleteApproval={(delId) => {
                const target = approvalRequests.find((r) => r.id === delId);
                if (target) {
                  const label = target.requestNumber || target.prNumber || `ĐNPD-${target.id}`;
                  moveToTrash("APPROVAL", label, target, `✓ Đã chuyển ${label} vào thùng rác`);
                }
                setApprovalRequests((prev) => {
                  const remaining = prev.filter((r) => r.id !== delId);
                  if (activeApprovalId === delId) {
                    handleSetActiveApprovalId(remaining[0]?.id ?? null);
                  }
                  return remaining;
                });
                setTimeout(() => void persistState(false), 50);
              }}
              onRestoreSamples={() => {
                setApprovalRequests((prev) => {
                  const existingIds = new Set(prev.map((r) => r.id));
                  const missing = SAMPLE_PHENIKAA_APPROVALS.filter(
                    (s) => !existingIds.has(s.id),
                  );
                  const merged =
                    missing.length > 0 ? [...missing, ...prev] : prev;
                  if (merged.length > 0) handleSetActiveApprovalId(merged[0].id);
                  return merged;
                });
              }}
              onCreatePOFromApproval={handleCreatePOFromApproval}
              prs={prs}
              suppliers={suppliers}
              quotesByPr={quotesByPr}
              quoteSupplierIdsByPr={quoteSupplierIdsByPr}
              isReportMode={reportMode}
              onBackToCompare={() => {
                if (selectedPR?.id) {
                  navigateTo({ view: "compare", prId: selectedPR.id });
                } else {
                  navigateTo({ view: "compare" });
                }
              }}
              pos={pos}
              paymentHandovers={paymentHandovers}
              trash={trash}
              onNavigate={(route) => navigateTo(route)}
              onToggleComplete={handleToggleCompleteApproval}
              autoOpenCreate={routeModal === "create"}
              onClearAutoCreate={handleClearRouteModal}
            />
          </ErrorBoundary>
        )}
        {(view === "catalog" || view === "products" || view === "suppliers") && (
          <CatalogManagement
            initialTab={view === "suppliers" ? "suppliers" : catalogSubTab}
            products={products}
            setProducts={setProducts}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            pos={pos}
            purchaseHistory={purchaseHistory}
            onCreatePR={() => navigateTo({ view: "create" })}
            onAddSupplier={openSupplierModal}
            onNavigate={(route) => navigateTo(route)}
          />
        )}
        {(view === "settings" || view === "print-templates") &&
          currentUser &&
          (currentUser.role === "master" || currentUser.role === "admin") && (
            <AdminSettings
              currentUser={currentUser}
              defaultTab={view === "print-templates" ? "templates" : "users"}
              paymentTemplate={paymentTemplate}
              suppliers={suppliers}
              sampleRequest={paymentRequests[0] || null}
              onUpdateState={(patch) => {
                if (patch.paymentTemplate !== undefined) setPaymentTemplate(patch.paymentTemplate);
              }}
              readOnly={reportMode}
            />
          )}
        {view === "prs" && (
          <PRList
            prs={prs}
            pos={pos}
            approvalRequests={approvalRequests}
            paymentRequests={paymentRequests}
            paymentHandovers={paymentHandovers}
            onCreate={() => navigateTo({ view: "create" })}
            onOpen={openCompare}
            onDelete={reportMode ? undefined : (pr) => requestDelete("PR", pr)}
            onNavigate={(route) => navigateTo(route)}
            onToggleComplete={handleToggleCompletePR}
            onUpdateScanUrl={handleUpdatePRScan}
            onCreateHandover={handleCreateHandoverFromPR}
          />
        )}
        {view === "create" && (
          <CreatePRCatalog
            draft={draft}
            setDraft={setDraft}
            products={products}
            itemChange={itemChange}
            fileRef={fileRef}
            importExcel={importExcel}
            message={importMessage}
            onCancel={() => {
              setDraft({
                number: `PR-${new Date().getFullYear()}-${String(prs.length + 1).padStart(4, "0")}`,
                date: new Date().toISOString().slice(0, 10),
                department: "",
                purpose: "",
                note: "",
                scan_file_url: "",
                items: [emptyItem(0)],
              });
              navigateTo({ view: "prs" });
            }}
            onSave={savePR}
          />
        )}

        {view === "po-list" && (
          <ErrorBoundary key="po-list" fallbackTitle="Lỗi hiển thị danh sách Đơn mua hàng (PO)" onReset={() => navigateTo({ view: "dashboard" })}>
            <POList
              pos={pos}
              trash={trash}
              suppliers={suppliers}
              prs={prs}
              products={products}
              approvalRequests={approvalRequests}
              paymentRequests={paymentRequests}
              paymentHandovers={paymentHandovers}
              onNavigate={(route) => navigateTo(route)}
              onToggleComplete={handleToggleCompletePO}
              onAddSupplier={handleAddSupplier}
              onAddProduct={handleAddProduct}
              onUpdatePO={handleUpdatePONumber}
              autoOpenCreate={routeModal === "create"}
              onClearAutoCreate={handleClearRouteModal}
              onCreatePO={(newPO, openDetail, sourcePrId) => {
                setPos((list) => [newPO, ...list]);
                setCurrentPO(newPO);
                if (sourcePrId) {
                  setPrs((list) =>
                    list.map((pr) =>
                      pr.id === sourcePrId
                        ? { ...pr, status: "Đã tạo đủ PO" }
                        : pr
                    )
                  );
                }
                setStorageStatus(`Đã tạo đơn PO ${newPO.number}`);
                // Bắt buộc lưu vĩnh viễn vào D1 ngay lập tức khi tạo PO thành công
                setTimeout(() => void persistState(false), 50);
                if (openDetail) {
                  navigateTo({ view: "po-detail", id: newPO.id });
                }
              }}
              onOpen={(po) => {
                setCurrentPO(po);
                navigateTo({ view: "po-detail", id: po.id });
              }}
              onDelete={reportMode ? undefined : (po) => requestDelete("PO", po)}
              onCreateHandover={handleCreateHandoverFromPO}
              onCreatePaymentRequest={handleOpenGeneralPaymentRequestFromPO}
              readOnly={reportMode}
            />
          </ErrorBoundary>
        )}
        {view === "trash" && (
          <TrashPage
            entries={trash}
            onRestore={restoreTrash}
            onPermanentDelete={permanentDeleteTrash}
            onEmptyTrash={emptyTrash}
          />
        )}
        {view === "po-detail" && (
          <ErrorBoundary key="po-detail" fallbackTitle="Lỗi hiển thị chi tiết Đơn mua hàng (PO)" onReset={() => navigateTo({ view: "po-list" })}>
            <PODetail
              po={currentPO?.id ? currentPO : ((pos && pos.length > 0) ? pos[0] : emptyPO)}
              pos={pos}
              trash={trash}
              suppliers={suppliers}
              setSuppliers={setSuppliers}
              onUpdate={updatePO}
              onBack={() => navigateTo({ view: "po-list" })}
              workspaceId={workspaceId}
              readOnly={reportMode}
              onStatus={setStorageStatus}
              onCreateHandover={handleCreateHandoverFromPO}
              onCreatePaymentRequest={handleCreatePaymentRequestFromPOPayment}
              onOpenGeneralPaymentRequest={handleOpenGeneralPaymentRequestFromPO}
              onPrintPaymentRequest={(reqId) => {
                const req = paymentRequests.find((r) => r.id === reqId);
                if (req) setPrintPaymentRequest(req);
              }}
              paymentTemplate={paymentTemplate}
              onNavigateToPayment={(reqId) => {
                if (reqId) setSpotlightPaymentActiveId(reqId);
                navigateTo({ view: "payment", id: reqId });
              }}
              onSave={() => persistState()}
              onAddSupplier={handleAddSupplier}
              approvalRequests={approvalRequests}
              prs={prs}
              paymentRequests={paymentRequests}
              paymentHandovers={paymentHandovers}
              onNavigate={(route) => navigateTo(route)}
              onUpdatePaymentRequest={handleUpdatePaymentRequest}
              onDelete={
                reportMode
                  ? undefined
                  : (targetPO) => requestDelete("PO", targetPO)
              }
            />
          </ErrorBoundary>
        )}
        {view === "compare" && (
          <section className="content compare-page">
            {/* Contextual PR Comparison Breadcrumb Header */}
            <div
              className="compare-breadcrumb-bar"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: compactCompare ? "10px" : "14px",
                padding: "8px 14px",
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            >
              <nav
                aria-label="Breadcrumb"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => navigateTo({ view: "prs" })}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "#2563eb",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                  title="Quay lại Danh sách PR"
                >
                  <FileText size={15} /> Danh sách PR
                </button>
                <ChevronRight size={14} style={{ color: "#94a3b8" }} />
                <span
                  style={{
                    backgroundColor: "#e2e8f0",
                    color: "#0f172a",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "12.5px",
                  }}
                >
                  PR #{selectedPR?.number || "Chưa chọn PR"}
                </span>
                <ChevronRight size={14} style={{ color: "#94a3b8" }} />
                <span
                  style={{
                    color: "#0369a1",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Scale size={15} style={{ color: "#0284c7" }} /> Bảng so sánh báo giá
                </span>
              </nav>

              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                {selectedPR && (
                  selectedPR.scan_file_url ? (
                    <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => setPreviewScanPR(selectedPR)}
                        title="Xem bản scan PR gốc"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "5px 12px",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          backgroundColor: "#f0f9ff",
                          color: "#0284c7",
                          border: "1px solid #bae6fd",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        <Eye size={15} /> Xem bản scan PR
                      </button>
                      <button
                        type="button"
                        onClick={() => compareScanInputRef.current?.click()}
                        title="Tải lên bản scan khác thay thế"
                        disabled={uploadingScanPrId === selectedPR.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "5px 10px",
                          fontSize: "12px",
                          fontWeight: 500,
                          backgroundColor: "#ffffff",
                          color: "#475569",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        {uploadingScanPrId === selectedPR.id ? (
                          <Loader2 size={13} className="animate-spin text-sky-600" />
                        ) : (
                          <Paperclip size={13} />
                        )}
                        <span>Đổi scan</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => compareScanInputRef.current?.click()}
                      title="Tải lên bản scan PR gốc (PDF hoặc ảnh)"
                      disabled={uploadingScanPrId === selectedPR.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "5px 12px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        backgroundColor: "#f0fdf4",
                        color: "#15803d",
                        border: "1px dashed #86efac",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      {uploadingScanPrId === selectedPR.id ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-emerald-600" />
                          <span>{compareCompressProgress || "Đang tối ưu scan..."}</span>
                        </>
                      ) : (
                        <>
                          <Paperclip size={14} />
                          <span>+ Tải bản scan PR</span>
                        </>
                      )}
                    </button>
                  )
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigateTo({ view: "prs" })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                  title="Quay lại Danh sách PR"
                >
                  <ArrowLeft size={15} /> Quay lại PR
                </button>
              </div>
            </div>

            {!compactCompare && (
              <>
                <div className="heading" style={{ marginTop: "4px" }}>
                  <div>
                    <h1>Bảng so sánh báo giá · {selectedPR.number || "PR"}</h1>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
                      Bộ phận: <b>{selectedPR.department || "Chưa rõ"}</b> · Mục đích: <i>{selectedPR.purpose || "Chưa có"}</i>
                    </p>
                  </div>
                  <div className="actions">
                    <DocFlowLinks
                      flow={resolveDocFlow({ pr: selectedPR }, { prs, pos, approvalRequests, paymentRequests, paymentHandovers })}
                      currentView="compare"
                      onNavigate={(route: any) => navigateTo(route)}
                      compact
                    />
                  </div>
                </div>
                {showCompareNote || Boolean(selectedPR.note && selectedPR.note.trim()) ? (
                  <section className="common-note-card">
                    <label>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span>✎ {t("compare.general_note")}</span>
                        <button
                          type="button"
                          onClick={() => { updatePRNote(""); setShowCompareNote(false); }}
                          style={{ background: "transparent", border: 0, color: "#64748b", fontSize: "11px", cursor: "pointer" }}
                        >
                          ✕ Ẩn ghi chú
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={selectedPR.note || ""}
                        placeholder={t("compare.general_note_placeholder")}
                        onChange={(e) => updatePRNote(e.target.value)}
                      />
                    </label>
                  </section>
                ) : (
                  <div style={{ margin: "6px 0 10px" }}>
                    <button
                      type="button"
                      onClick={() => setShowCompareNote(true)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "6px",
                        border: "1px dashed #cbd5e1",
                        background: "#f8fafc",
                        color: "#475569",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Plus size={13} /> Thêm Ghi chú chung PR
                    </button>
                  </div>
                )}
              </>
            )}
            <div className="compare-toolbar" style={compactCompare ? { marginTop: "1rem" } : {}}>
              <label style={{ width: "260px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Search size={16} style={{ color: "var(--slate-400)" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("compare.search_placeholder")}
                />
              </label>
              <div className="vat-compare-segmented">
                <span className="seg-label">{t("compare.price_mode")}:</span>
                <div className="seg-buttons">
                  <button
                    type="button"
                    className={`seg-btn ${quoteCompareMode === "before-vat" ? "active" : ""}`}
                    onClick={() => setQuoteCompareMode("before-vat")}
                  >
                    {t("compare.before_vat")}
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${quoteCompareMode === "after-vat" ? "active" : ""}`}
                    onClick={() => setQuoteCompareMode("after-vat")}
                  >
                    {t("compare.after_vat")}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginLeft: "auto", alignItems: "center" }}>
                {!reportMode && (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setItems((x) => [...x, emptyItem(x.length)])}
                    >
                      <Plus size={16} /> Thêm hàng
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        const name = prompt("Nhập tên cột mới (VD: Tên hàng NCC, Xuất xứ, Bảo hành...):");
                        if (name && name.trim()) {
                           const cols = selectedPR.quoteCustomColumns || [];
                           const updated = { ...selectedPR, quoteCustomColumns: [...cols, name.trim()] };
                           setSelectedPR(updated);
                           setPrs(all => all.map(pr => pr.id === updated.id ? updated : pr));
                        }
                      }}
                    >
                      <Plus size={16} /> Thêm cột NCC
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setSelectedSupplierId("");
                        setSupplierSearch("");
                        setSupplierPicker(true);
                      }}
                    >
                      <Users size={16} /> Chọn NCC
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ background: "#2B6DF8", color: "#fff" }}
                      onClick={openApproval}
                      title="Kế thừa danh sách hàng hóa, NCC và đơn giá của PR này sang Đề nghị Phê duyệt Lựa chọn NCC"
                    >
                      <Check size={16} /> Lập ĐNPD
                    </button>
                    <button
                      className="btn btn-primary po-create-btn"
                      disabled={!poCart.length}
                      onClick={() => setPoCartOpen(true)}
                    >
                      <ShoppingCart size={16} /> Giỏ PO ({poCart.length})
                    </button>
                  </>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setCompactCompare(!compactCompare)}
                >
                  {compactCompare ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                  {compactCompare ? "Mở rộng" : "Thu gọn"}
                </button>
              </div>
            </div>
            {poCart.length > 0 && (
              <div className="po-selection-bar">
                <span>
                  ✓ Giỏ có <b>{poCart.length}</b> dòng từ{" "}
                  <b>{new Set(poCart.map((line) => line.allocation.prId)).size} PR</b>
                  {" · "}<b>{suppliers.find((s) => s.id === poCart[0].supplierId)?.name}</b>
                </span>
                <div>
                  <button onClick={() => setPoCartOpen(true)}>{t("compare.view_cart")}</button>
                  <button onClick={() => { setPoCart([]); setPoSelections([]); }}>{t("compare.clear_cart")}</button>
                </div>
              </div>
            )}
            <AdvancedItemsTable
                items={items}
                visibleItems={filtered}
                order={compareOrder}
                setOrder={setCompareOrder}
                filters={compareFilters}
                setFilters={setCompareFilters}
                sort={compareSort}
                setSort={setCompareSort}
                filterOpen={compareFilterOpen}
                setFilterOpen={setCompareFilterOpen}
                suppliers={comparisonSuppliers}
                onRemoveSupplier={(id: number) => {
                  const next = quoteSupplierIds.filter((x) => x !== id);
                  setQuoteSupplierIds(next);
                  if (selectedPR.id)
                    setQuoteSupplierIdsByPr((all) => ({
                      ...all,
                      [selectedPR.id]: next,
                    }));
                }}
                quotes={quotes}
                itemChange={itemChange}
                quoteChange={quoteChange}
                onBatchPaste={(nextItems, nextQuotes) => {
                  setItems(nextItems);
                  setQuotes(nextQuotes);
                  if (selectedPR.id) {
                    const updatedPR = { ...selectedPR, items: nextItems };
                    setSelectedPR(updatedPR);
                    setPrs((all) =>
                      all.map((pr) => (pr.id === updatedPR.id ? updatedPR : pr))
                    );
                    setQuotesByPr((all) => ({
                      ...all,
                      [selectedPR.id]: nextQuotes,
                    }));
                  }
                }}
                best={best}
                quoteCompareMode={quoteCompareMode}
                setQuoteCompareMode={setQuoteCompareMode}
                poSelections={poSelections}
                togglePOItem={togglePOItem}
                purchaseHistory={purchaseHistory}
                customColumns={selectedPR.quoteCustomColumns || []}
                setCustomColumns={(cols: string[]) => {
                   const updated = { ...selectedPR, quoteCustomColumns: cols };
                   setSelectedPR(updated);
                   setPrs(all => all.map(pr => pr.id === updated.id ? updated : pr));
                }}
              />
            {!reportMode && selectedPR.id !== 0 && !compactCompare && (
              <DocumentManager
                title={`Hồ sơ PR ${selectedPR.number}`}
                entityType="pr"
                entityId={String(selectedPR.id)}
                workspaceId={workspaceId}
                onStatus={setStorageStatus}
              />
            )}
            <input
              ref={compareScanInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && selectedPR) {
                  handleUploadScanInCompare(selectedPR, f);
                }
                e.target.value = "";
              }}
            />
          </section>
        )}
        {view === "guide" && (
          <KnowledgeBase onNavigate={(route) => navigateTo(route)} />
        )}
        </Suspense>
      </main>
      {poCartOpen && (
        <div className="backdrop" onMouseDown={() => setPoCartOpen(false)}>
          <div className="po-cart-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <em>{t("compare.po_cart_modal_badge")}</em>
                <h2>{t("compare.po_cart_modal_title")}</h2>
                <p>
                  {suppliers.find((s) => s.id === poCart[0]?.supplierId)?.name} ·{" "}
                  {new Set(poCart.map((line) => line.allocation.prId)).size} PR
                </p>
              </div>
              <button onClick={() => setPoCartOpen(false)}>×</button>
            </header>
            <div className="po-cart-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("compare.po_cart_col_src_pr")}</th>
                    <th>{t("table.item_code")}</th>
                    <th>{t("table.item_name")}</th>
                    <th>{t("compare.po_cart_col_req_qty")}</th>
                    <th>{t("compare.po_cart_col_ordered")}</th>
                    <th>{t("compare.po_cart_col_this_order")}</th>
                    <th>{t("compare.po_cart_col_remaining")}</th>
                    <th>{t("compare.po_cart_col_price")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {poCart.map((line) => {
                    const already = orderedQty(
                        line.allocation.prId,
                        line.allocation.prNumber,
                        line.allocation.prItemId,
                        line.item.code,
                      ),
                      available = Math.max(0, line.item.qty - already),
                      after = Math.max(0, available - line.allocation.qty);
                    return (
                      <tr key={line.id}>
                        <td><b>{line.allocation.prNumber}</b></td>
                        <td>{line.item.code}</td>
                        <td>{line.item.name}</td>
                        <td className="num">{line.item.qty}</td>
                        <td className="num">{already}</td>
                        <td>
                          <input
                            type="number"
                            min={0.0001}
                            max={available}
                            step="any"
                            value={line.allocation.qty}
                            onChange={(e) => {
                              const qty = Math.max(0, Math.min(available, Number(e.target.value) || 0));
                              setPoCart((cart) => cart.map((item) => item.id === line.id ? { ...item, allocation: { ...item.allocation, qty } } : item));
                            }}
                          />
                        </td>
                        <td className="num">{after}</td>
                        <td className="money">{fmt(line.price)} ₫</td>
                        <td><button className="delete-action" onClick={() => { setPoCart((cart) => cart.filter((item) => item.id !== line.id)); if (line.allocation.prId === selectedPR.id) setPoSelections((ids) => ids.filter((id) => id !== line.allocation.prItemId)); }}>{t("btn.remove")}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer>
              <div>
                <span>{t("compare.po_cart_total")}</span>
                <b>{fmt(poCart.reduce((sum, line) => sum + line.allocation.qty * line.price, 0))} ₫</b>
              </div>
              <div>
                <button className="ghost" onClick={() => setPoCartOpen(false)}>{t("compare.continue_pr")}</button>
                <button className="po-create-btn" disabled={!poCart.length || poCart.some((line) => line.allocation.qty <= 0)} onClick={openApproval}>{t("compare.create_approval")}</button>
              </div>
            </footer>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="backdrop" onMouseDown={() => !deleteBusy && setDeleteTarget(null)}>
          <div className="modal delete-confirm" onMouseDown={(e) => e.stopPropagation()}>
            <i>!</i>
            <h2>Xác nhận chuyển vào thùng rác</h2>
            <p>
              Bạn đang xóa <b>{deleteTarget.type === "PR" ? (deleteTarget.record as PR).number : deleteTarget.type === "CONTRACT" ? `HĐ-${(deleteTarget.record as PO).number}` : (deleteTarget.record as PO).number}</b>.
              Bản ghi có thể phục hồi trong vòng 30 ngày.
            </p>
            <label>
              Nhập mật khẩu tài khoản hiện tại
              <input
                autoFocus
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void confirmDelete()}
                placeholder="Nhập mật khẩu để xác nhận"
              />
            </label>
            {deleteError && <div className="delete-error">⚠ {deleteError}</div>}
            <div>
              <button className="ghost" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
                Hủy
              </button>
              <button className="danger-confirm" disabled={!deletePassword || deleteBusy} onClick={confirmDelete}>
                {deleteBusy ? "Đang kiểm tra..." : "Xác nhận xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
      {supplierModal && (
        <div className="backdrop">
          <div className="modal supplier-modal">
            <i>＋</i>
            <h2>Thêm nhà cung cấp</h2>
            <p>Nhập thông tin nhà cung cấp để dùng chung cho báo giá và PO.</p>
            <div className="supplier-modal-grid">
              <label>
                Tên nhà cung cấp <b>*</b>
                <input
                  autoFocus
                  value={newSupplier.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewSupplier((prev) => {
                      const autoShort =
                        prev.shortName && prev.shortName !== generateShortName(prev.name)
                          ? prev.shortName
                          : generateShortName(val);
                      return {
                        ...prev,
                        name: val,
                        shortName: autoShort,
                      };
                    });
                  }}
                  placeholder="Ví dụ: Công ty Cổ phần Bao bì An Phát"
                />
              </label>
              <label>
                Tên viết tắt của NCC
                <input
                  value={newSupplier.shortName || ""}
                  onChange={(e) => supplierField("shortName", e.target.value)}
                  placeholder="Ví dụ: An Phát"
                />
              </label>
              <label>
                Số tài khoản
                <input
                  value={newSupplier.bankAccount}
                  onChange={(e) => supplierField("bankAccount", e.target.value)}
                  placeholder="Nhập số tài khoản"
                />
              </label>
              <label>
                Ngân hàng
                <input
                  list="supplierModalBankList"
                  value={newSupplier.bank}
                  onChange={(e) => supplierField("bank", e.target.value)}
                  placeholder="Chọn hoặc gõ tên ngân hàng..."
                />
                <datalist id="supplierModalBankList">
                  {supplierBankOptions.map((bn) => (
                    <option key={bn} value={bn} />
                  ))}
                </datalist>
              </label>
              <label>
                Người liên hệ
                <input
                  value={newSupplier.contact}
                  onChange={(e) => supplierField("contact", e.target.value)}
                  placeholder="Họ và tên"
                />
              </label>
              <label>
                Điện thoại
                <input
                  value={newSupplier.phone}
                  onChange={(e) => supplierField("phone", e.target.value)}
                  placeholder="Số điện thoại"
                />
              </label>
              <label className="full">
                Địa chỉ
                <input
                  value={newSupplier.address}
                  onChange={(e) => supplierField("address", e.target.value)}
                  placeholder="Địa chỉ nhà cung cấp"
                />
              </label>
            </div>
            <div>
              <button className="ghost" onClick={() => setSupplierModal(false)}>
                Hủy
              </button>
              <button
                className="primary"
                disabled={!newSupplier.name.trim()}
                onClick={addSupplier}
              >
                Lưu nhà cung cấp
              </button>
            </div>
          </div>
        </div>
      )}
      {supplierPicker && (
        <SupplierPickerModal
          availableSuppliers={availableSuppliers}
          onSelectSupplier={addQuoteSupplier}
          onCreateAndSelectSupplier={(newSupplier) => {
            setSuppliers((all) => [...all, newSupplier]);
            addQuoteSupplier(newSupplier.id);
          }}
          onClose={() => setSupplierPicker(false)}
        />
      )}
      {!reportMode && (
        <nav className="mobile-bottom-nav" aria-label="Điều hướng điện thoại">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => navigateTo({ view: "dashboard" })}>
            <span><Home size={18} /></span>
            <b>Trang chủ</b>
          </button>
          <button className={view === "prs" || view === "create" ? "active" : ""} onClick={() => navigateTo({ view: "prs" })}>
            <span><FileText size={18} /></span>
            <b>PR</b>
          </button>
          <button className={view === "po-list" || view === "po-detail" ? "active" : ""} onClick={() => navigateTo({ view: "po-list" })}>
            <span><Package size={18} /></span>
            <b>PO</b>
          </button>
          <button className={view === "handover" ? "active" : ""} onClick={() => navigateTo({ view: "handover" })}>
            <span><Truck size={18} /></span>
            <b>Bàn giao</b>
          </button>
          <button onClick={() => setMobileActionSheetOpen(true)}>
            <span><Menu size={18} /></span>
            <b>Menu khác</b>
          </button>
        </nav>
      )}

      {/* Native Mobile Action Sheet (Menu khác - MoMo / Base.vn style) */}
      {mobileActionSheetOpen && (
        <div
          className="native-action-sheet-overlay no-print"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            animation: "sheetFadeIn 0.2s ease-out",
          }}
          onClick={() => setMobileActionSheetOpen(false)}
        >
          <div
            className="native-action-sheet-content"
            style={{
              width: "100%",
              backgroundColor: "#ffffff",
              borderRadius: "24px 24px 0 0",
              padding: "16px 20px",
              paddingBottom: "max(28px, env(safe-area-inset-bottom, 24px))",
              boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.25)",
              maxHeight: "85vh",
              overflowY: "auto",
              boxSizing: "border-box",
              animation: "sheetSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle indicator */}
            <div
              style={{
                width: "40px",
                height: "5px",
                backgroundColor: "#cbd5e1",
                borderRadius: "3px",
                margin: "0 auto 16px auto",
              }}
            />

            {/* Header: Title + Close Button */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: "14px",
                borderBottom: "1px solid #f1f5f9",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "4px",
                    height: "18px",
                    borderRadius: "2px",
                    backgroundColor: "#0284c7",
                  }}
                />
                <h3
                  style={{
                    margin: 0,
                    fontSize: "17px",
                    fontWeight: 800,
                    color: "#0f172a",
                    letterSpacing: "-0.3px",
                  }}
                >
                  Tất cả chức năng
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileActionSheetOpen(false)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: "#f1f5f9",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* 3x3 Grid of Functions */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "18px 12px",
              }}
            >
              {/* Item 1: Thanh toán */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  navigateTo({ view: "payment" });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(16, 185, 129, 0.3)",
                  }}
                >
                  <CreditCard size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  Thanh toán
                </span>
              </button>

              {/* Item 2: Đề nghị phê duyệt */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  navigateTo({ view: "approval" });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(245, 158, 11, 0.3)",
                  }}
                >
                  <CheckSquare size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  ĐNPD
                </span>
              </button>

              {/* Item 3: So sánh giá */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  navigateTo({ view: "compare" });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(59, 130, 246, 0.3)",
                  }}
                >
                  <Scale size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  So sánh giá
                </span>
              </button>

              {/* Item 4: Nhà cung cấp */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  setCatalogSubTab("suppliers");
                  navigateTo({ view: "catalog" });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(139, 92, 246, 0.3)",
                  }}
                >
                  <Building2 size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  Nhà cung cấp
                </span>
              </button>

              {/* Item 5: Danh mục hàng */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  setCatalogSubTab("products");
                  navigateTo({ view: "catalog" });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(99, 102, 241, 0.3)",
                  }}
                >
                  <Boxes size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  Danh mục hàng
                </span>
              </button>

              {/* Item 6: Hợp đồng */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  navigateTo({ view: "contracts" });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(14, 165, 233, 0.3)",
                  }}
                >
                  <FileText size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  Hợp đồng
                </span>
              </button>

              {/* Item 7: Cài đặt */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  setSettingsModalOpen(true);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(100, 116, 139, 0.3)",
                  }}
                >
                  <Settings size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  Cài đặt
                </span>
              </button>

              {/* Item 8: Tìm kiếm Spotlight */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  setSpotlightOpen(true);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(236, 72, 153, 0.3)",
                  }}
                >
                  <Search size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  Tìm kiếm
                </span>
              </button>

              {/* Item 9: Thùng rác */}
              <button
                type="button"
                onClick={() => {
                  setMobileActionSheetOpen(false);
                  navigateTo({ view: "trash" });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(239, 68, 68, 0.3)",
                  }}
                >
                  <Trash2 size={24} />
                </div>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
                  Thùng rác
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings & System Utilities Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        currentUser={currentUser}
        onOpenPrintTemplates={() => navigateTo({ view: "print-templates" })}
        onOpenAdminSettings={() => navigateTo({ view: "settings" })}
        onStatus={setStorageStatus}
        uiTheme={uiTheme}
        onThemeChange={setUiTheme}
      />

      {/* Knowledge Base Contextual Slide-Over Drawer */}
      <KnowledgeBaseDrawer
        isOpen={helpDrawerOpen}
        onClose={() => setHelpDrawerOpen(false)}
        initialTopic={
          view === "compare"
            ? "compare"
            : view === "approval"
              ? "approval"
              : view === "prs" || view === "create"
                ? "pr"
                : view === "po-list" || view === "po-detail"
                  ? "po"
                  : view === "dashboard"
                    ? "dashboard"
                    : "flow"
        }
        onNavigate={(route) => navigateTo(route)}
      />

      {/* Global Spotlight Search Modal (Ctrl + K) */}
      <GlobalSpotlightModal
        isOpen={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        prs={prs}
        pos={pos}
        suppliers={suppliers}
        products={products}
        paymentRequests={paymentRequests}
        paymentHandovers={paymentHandovers}
        onNavigate={handleSpotlightNavigate}
      />

      {/* Handover Item & Department Picker Modal */}
      <POHandoverPickerModal
        po={handoverPickerPO}
        isOpen={showHandoverPickerModal}
        onClose={() => {
          setShowHandoverPickerModal(false);
          setHandoverPickerPO(null);
        }}
        onConfirm={handleConfirmHandoverFromPicker}
        prs={prs}
        suppliers={suppliers}
        existingHandovers={paymentHandovers}
        onOpenExistingHandoverPreview={handleOpenExistingHandoverPreview}
        onUpdateHandovers={(items) => setPaymentHandovers(items)}
        onUpdatePO={updatePO}
        onPrintBatch={(batch) => handleOpenBatchHandoverPreview(handoverPickerPO, batch)}
      />

      {/* Handover Print Preview Modal */}
      {printHandoverData && (
        <HandoverPrintPreviewModal
          isOpen={printHandoverData.isOpen}
          onClose={() => setPrintHandoverData(null)}
          items={printHandoverData.items}
          po={printHandoverData.po}
          department={printHandoverData.department}
          handoverDate={printHandoverData.handoverDate}
          senderName={printHandoverData.senderName}
          receiverName={printHandoverData.receiverName}
          onNavigateToHandoverTab={() => {
            setPrintHandoverData(null);
            navigateTo({ view: "handover" });
          }}
        />
      )}

      {/* Payment Request Print Preview Modal */}
      {printPaymentRequest && (
        <PaymentPrintPreviewModal
          isOpen={Boolean(printPaymentRequest)}
          onClose={() => setPrintPaymentRequest(null)}
          paymentRequest={printPaymentRequest}
          paymentTemplate={paymentTemplate}
          suppliers={suppliers}
          onNavigateToPaymentTab={(id) => {
            setPrintPaymentRequest(null);
            setSpotlightPaymentActiveId(id);
            navigateTo({ view: "payment", id });
          }}
          onUpdatePaymentRequest={(updated) => {
            setPrintPaymentRequest(updated);
            setPaymentRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
          }}
        />
      )}

      {/* Supplier Quick Bank Info Modal */}
      {supplierQuickBankState && (
        <SupplierQuickBankModal
          isOpen={supplierQuickBankState.isOpen}
          onClose={() => setSupplierQuickBankState(null)}
          supplier={supplierQuickBankState.supplier}
          onConfirm={handleConfirmQuickBank}
        />
      )}

      {/* Payment Stage Picker Modal */}
      {paymentStagePickerPO && (
        <PaymentStagePickerModal
          isOpen={Boolean(paymentStagePickerPO)}
          onClose={() => setPaymentStagePickerPO(null)}
          po={paymentStagePickerPO}
          paymentRequests={paymentRequests}
          onSelectStageToCreate={(p) => {
            handleCreatePaymentRequestFromPOPayment(paymentStagePickerPO, p);
          }}
          onPrintExistingRequest={(reqId) => {
            const req = paymentRequests.find((r) => r.id === reqId);
            if (req) setPrintPaymentRequest(req);
          }}
          onOpenLinkModal={(stage) => {
            setLinkModalFromPicker({ po: paymentStagePickerPO, stage });
          }}
          onAddAndCreateStage={() => {
            const defaultStage: Payment = {
              id: Date.now(),
              phase: "Thanh toán 100%",
              percent: 100,
              amount: calcPOTotal(paymentStagePickerPO),
              status: "Chưa thanh toán",
              date: localToday(),
              condition: "post",
            };
            const updatedPO = {
              ...paymentStagePickerPO,
              payments: [...(paymentStagePickerPO.payments || []), defaultStage],
            };
            updatePO(updatedPO);
            if (currentPO?.id === paymentStagePickerPO.id) setCurrentPO(updatedPO);
            alert(
              `Đã tạo đợt thanh toán 100% cho đơn hàng ${paymentStagePickerPO.number}.\n\n` +
              `Vì đây là đợt thanh toán trả sau, bắt buộc phải nhập Số hóa đơn GTGT trước khi lập Đề nghị thanh toán. Vui lòng nhập Số hóa đơn tại mục Đợt thanh toán của PO!`
            );
          }}
        />
      )}

      {/* Popup Liên kết Đợt thanh toán PO với Phiếu ĐNTT có sẵn khi kích hoạt từ Picker */}
      {linkModalFromPicker && (
        <POPaymentLinkModal
          isOpen={Boolean(linkModalFromPicker)}
          onClose={() => setLinkModalFromPicker(null)}
          po={linkModalFromPicker.po}
          stage={linkModalFromPicker.stage}
          paymentRequests={paymentRequests}
          pos={pos}
          onConfirmLink={(req) => {
            const { po: targetPO, stage } = linkModalFromPicker;
            const updatedPayments = (targetPO.payments || []).map((p) => {
              if (p.id !== stage.id) return p;
              const patch: Partial<Payment> = {
                paymentRequestId: req.id,
                status: (req.status === "Đã thanh toán" || req.status === "Hoàn thành") ? "Đã thanh toán" : "Đang xử lý",
              };
              if (!stage.invoiceNo && req.invoice_no) {
                patch.invoiceNo = req.invoice_no;
                patch.invoiceDate = req.invoice_date || stage.invoiceDate;
              }
              return { ...p, ...patch };
            });
            const updatedPO = { ...targetPO, payments: updatedPayments };
            updatePO(updatedPO);
            if (currentPO?.id === targetPO.id) setCurrentPO(updatedPO);

            const updatedReq: PaymentRequestEntry = {
              ...req,
              group_code: req.group_code || targetPO.number,
              invoice_no: req.invoice_no || stage.invoiceNo || "",
              invoice_date: req.invoice_date || stage.invoiceDate || "",
            };
            handleUpdatePaymentRequest(updatedReq);
            setStorageStatus(`✓ Đã liên kết đợt "${stage.phase}" với ĐNTT #${req.legacy_stt || req.id}`);
            setLinkModalFromPicker(null);
          }}
        />
      )}

      {/* PR Scan Preview Modal */}
      {previewScanPR && (
        <PRScanPreviewModal
          pr={previewScanPR}
          onClose={() => setPreviewScanPR(null)}
        />
      )}

      {/* Floating Offline Sync Status Banner */}
      <OfflineSyncBanner
        isOnline={isOnline}
        isSyncing={isSyncing}
        queueCount={queueCount}
        lastSyncStatus={lastSyncStatus}
        syncMessage={syncMessage}
        onTriggerSync={triggerSync}
        onClearQueue={clearQueue}
      />

      {/* Floating OTA Update Notification Banner */}
      <OtaUpdateBanner
        otaState={otaState}
        visible={toastVisible}
        onApplyAndRestart={applyAndRestart}
        onDismiss={dismissToast}
      />
    </div>
  );
}

export default function ProcurementApp(props: {
  reportToken?: string;
  currentUser?: {
    id: string;
    username: string;
    displayName: string;
    role: "master" | "admin" | "user";
  };
}) {
  return (
    <ErrorBoundary fallbackTitle="Đã xảy ra sự cố với ứng dụng SCMH">
      <I18nProvider>
        <ProcurementAppInner {...props} />
      </I18nProvider>
    </ErrorBoundary>
  );
}

