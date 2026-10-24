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
import { ConflictModal } from "./components/ConflictModal";
import { SupplierPickerModal } from "./components/SupplierPickerModal";
import "./vat-quote.css";

import { PaymentManagement } from "./components/PaymentManagement";
import { BANK_SUGGESTIONS, DEFAULT_PAYMENT_TEMPLATE, localToday } from "./payment-utils";
import { Item, Supplier, PurchaseHistory, QuoteMode, QuoteEntry, Quote, PR, POItem, POCartLine, ApprovalRow, ApprovalDraft, ApprovalRequest, PODoc, Payment, PO, TrashItem, View, ColumnKey, SortState, PaymentDetailLine, PaymentRequestEntry, PaymentGroup, PaymentBeneficiary, PaymentHandoverItem, PaymentPrintTemplate, StoredState, isContractPO, buildPOPaymentDescription, formatPONumber, calcPOTotal } from "./types";
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

const AdminSettings = lazy(() => import("./components/AdminSettings").then(m => ({ default: m.AdminSettings })));
const TrashPage = lazy(() => import("./components/TrashPage").then(m => ({ default: m.TrashPage })));
const ContractManagement = lazy(() => import("./components/ContractManagement").then(m => ({ default: m.ContractManagement })));
const HandoverManagement = lazy(() => import("./components/HandoverManagement").then(m => ({ default: m.HandoverManagement })));
const ProductCatalog = lazy(() => import("./components/ProductCatalog").then(m => ({ default: m.ProductCatalog })));
const SupplierManagement = lazy(() => import("./components/SupplierManagement").then(m => ({ default: m.SupplierManagement })));
import { GlobalSpotlightModal } from "./components/GlobalSpotlightModal";
import { I18nProvider, useTranslation, LanguageSwitcher } from "./i18n";
import { ErrorBoundary } from "./components/ErrorBoundary";

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
  const [view, setView] = useState<View>("dashboard"),
    [collapsed, setCollapsed] = useState(false),
    [prs, setPrs] = useState(prs0),
    [selectedPR, setSelectedPR] = useState(emptyPR);
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
    [pos, setPos] = useState<PO[]>(pos0),
    [currentPO, setCurrentPO] = useState<PO>(emptyPO);
  const [poCart, setPoCart] = useState<POCartLine[]>([]),
    [poCartOpen, setPoCartOpen] = useState(false);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(
      SAMPLE_PHENIKAA_APPROVALS,
    ),
    [activeApprovalId, setActiveApprovalId] = useState<number | null>(null);
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
    [conflictModal, setConflictModal] = useState<{
      serverVersion: number;
      time: string;
    } | null>(null),
    [loadTrigger, setLoadTrigger] = useState(0);

  // Global Spotlight Search (Ctrl + K)
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightPaymentSearch, setSpotlightPaymentSearch] = useState<string>("");
  const [spotlightPaymentActiveId, setSpotlightPaymentActiveId] = useState<number | undefined>(undefined);
  const [spotlightHandoverSearch, setSpotlightHandoverSearch] = useState<string>("");

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
  const [draft, setDraft] = useState({
    number: "",
    date: new Date().toISOString().slice(0, 10),
    department: "",
    purpose: "",
    note: "",
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
            body: JSON.stringify(payloadToSend),
            keepalive,
          },
        );
        if (response.status === 409) {
          const resData = (await response.json().catch(() => null)) as {
            error?: string;
            currentVersion?: number;
            message?: string;
          } | null;
          setConflictModal({
            serverVersion: resData?.currentVersion || (serverVersionRef.current + 1),
            time: new Date().toLocaleTimeString("vi-VN"),
          });
          setStorageStatus(
            "⚠️ Xung đột dữ liệu với phiên làm việc khác!",
          );
          return;
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
    const url = reportToken
      ? `/api/report-state?token=${encodeURIComponent(reportToken)}`
      : `/api/state?workspace=${encodeURIComponent(workspaceId)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ version?: number; data?: StoredState }>;
      })
      .then((body) => {
        if (!active) return;
        if (body.version) {
          serverVersionRef.current = body.version;
        }
        const data = body.data as StoredState | null;
        if (data) {
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
          setPrs(data.prs || prs0);
          setProducts(data.products || items0);
          
          const loadedSuppliers: Supplier[] = (data.suppliers || suppliers0).map((s: Supplier) => ({
            ...s,
            shortName: s.shortName || generateShortName(s.name),
          }));
          setSuppliers(loadedSuppliers);

          setQuotesByPr(migratedQuotes);
          setQuoteSupplierIdsByPr(migratedSupplierIds);
          setQuotes(firstPR ? migratedQuotes[firstPR.id] || {} : {});
          const loadedPos: PO[] = (data.pos || pos0).map((po: PO) => {
            if (/^PO-\d{4}-\d{4}$/i.test((po.number || "").trim())) {
              const sup = loadedSuppliers.find((s) => Number(s.id) === Number(po.supplierId));
              return {
                ...po,
                number: formatPONumber(sup, po.createdDate),
              };
            }
            return po;
          });
          setPos(loadedPos);
          setItems(firstPR?.items || data.items || items0);
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
          
          const hasPaymentRequests = data.paymentRequests && data.paymentRequests.length > 0;
          if (hasPaymentRequests) {
            setPaymentRequests(data.paymentRequests || []);
            setPaymentGroups(data.paymentGroups || []);
            setPaymentBeneficiaries(data.paymentBeneficiaries || []);
            setPaymentHandovers(data.paymentHandovers || []);
            setPaymentTemplate(data.paymentTemplate || DEFAULT_PAYMENT_TEMPLATE);
          } else {
            fetch("/default-payment-seed.json")
              .then((res) => res.json() as Promise<any>)
              .then((seed) => {
                if (!active) return;
                setPaymentRequests(seed.defaultPaymentRequests || []);
                setPaymentGroups(seed.defaultPaymentGroups || []);
                setPaymentBeneficiaries(seed.defaultPaymentBeneficiaries || []);
                setPaymentHandovers(seed.defaultPaymentHandovers || []);
                if (seed.defaultPaymentTemplate) {
                  setPaymentTemplate(seed.defaultPaymentTemplate);
                }
              })
              .catch((err) => console.error("Không thể tải payment seed:", err));
          }
          if (data.approvalRequests && data.approvalRequests.length > 0) {
            setApprovalRequests(data.approvalRequests);
          } else {
            setApprovalRequests(SAMPLE_PHENIKAA_APPROVALS);
          }
          if (data.prs?.length) setSelectedPR(data.prs[0]);
          if (data.pos?.length) setCurrentPO(data.pos[0]);
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
          setPurchaseHistory(purchaseHistory0);
          setPurchaseHistoryImportIds([]);
          setPaymentRequests([]);
          setPaymentGroups([]);
          setPaymentBeneficiaries([]);
          setPaymentHandovers([]);
          setPaymentTemplate(DEFAULT_PAYMENT_TEMPLATE);
          setApprovalRequests(SAMPLE_PHENIKAA_APPROVALS);
          setSelectedPR(emptyPR);
          setCurrentPO(emptyPO);

          fetch("/default-payment-seed.json")
            .then((res) => res.json() as Promise<any>)
            .then((seed) => {
              if (!active) return;
              setPaymentRequests(seed.defaultPaymentRequests || []);
              setPaymentGroups(seed.defaultPaymentGroups || []);
              setPaymentBeneficiaries(seed.defaultPaymentBeneficiaries || []);
              setPaymentHandovers(seed.defaultPaymentHandovers || []);
              if (seed.defaultPaymentTemplate) {
                setPaymentTemplate(seed.defaultPaymentTemplate);
              }
            })
            .catch((err) => console.error("Không thể tải payment seed:", err));
        }
        setStorageReady(true);
        setStorageStatus(data ? "Đã đồng bộ online" : "Sẵn sàng lưu online");
      })
      .catch(() => setStorageStatus("Không thể kết nối dữ liệu"));
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
      window.location.replace("/");
    }
  };
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
      const now = new Date(),
        expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        record = deleteTarget.record,
        entry: TrashItem = {
          id: crypto.randomUUID(),
          type: deleteTarget.type,
          label:
            deleteTarget.type === "PR"
              ? (record as PR).number
              : deleteTarget.type === "CONTRACT"
                ? `HĐ-${(record as PO).number}`
                : (record as PO).number,
          deletedAt: now.toISOString(),
          expiresAt: expires.toISOString(),
          data:
            deleteTarget.type === "CONTRACT"
              ? { poId: (record as PO).id }
              : record,
        };
      setTrash((list) => [entry, ...list]);
      if (deleteTarget.type === "PR") {
        setPrs((list) => list.filter((pr) => Number(pr.id) !== Number(record.id)));
        if (Number(selectedPR.id) === Number(record.id)) setSelectedPR(emptyPR);
        setView("prs");
      } else if (deleteTarget.type === "PO") {
        setPos((list) => list.filter((po) => Number(po.id) !== Number(record.id)));
        if (Number(currentPO.id) === Number(record.id)) setCurrentPO(emptyPO);
        setView("po-list");
      } else {
        setHiddenContractIds((ids) => [...new Set([...ids, record.id])]);
        setView("contracts");
      }
      setStorageStatus(`✓ Đã chuyển ${entry.label} vào thùng rác`);
      setDeleteTarget(null);
      setDeletePassword("");
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
    } else {
      const poId = (entry.data as { poId: number }).poId;
      setHiddenContractIds((ids) => ids.filter((id) => id !== poId));
    }
    setTrash((list) => list.filter((item) => item.id !== entry.id));
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
  const openCompare = (pr: PR) => {
    setSelectedPR(pr);
    setItems(pr.items);
    setQuotes(quotesByPr[pr.id] || {});
    setQuoteSupplierIds(quoteSupplierIdsByPr[pr.id] || []);
    setPoSelections(
      poCart
        .filter((line) => line.allocation.prId === pr.id)
        .map((line) => line.allocation.prItemId),
    );
    setView("compare");
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
      setView("po-detail");
      return;
    }

    if (destination.view === "contracts") {
      if (destination.po) {
        setCurrentPO(destination.po);
      }
      setView("contracts");
      return;
    }

    if (destination.view === "payment") {
      if (destination.query) {
        setSpotlightPaymentSearch(destination.query);
      }
      if (destination.paymentId) {
        setSpotlightPaymentActiveId(destination.paymentId);
      }
      setView("payment");
      return;
    }

    if (destination.view === "handover") {
      if (destination.query) {
        setSpotlightHandoverSearch(destination.query);
      }
      setView("handover");
      return;
    }

    setView(destination.view);
  };
  const updatePRNote = (value: string) => {
    const updated = { ...selectedPR, note: value };
    setSelectedPR(updated);
    setPrs((list) =>
      list.map((pr) => (pr.id === selectedPR.id ? updated : pr)),
    );
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
      items: [emptyItem(0)],
    });
    setImportMessage("");
    setView("prs");
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
    setView("approval");
  };

  const handleCreatePOFromApproval = (req: ApprovalRequest) => {
    const selectedCol =
      req.supplierColumns.find((c) => c.isSelected) || req.supplierColumns[0];
    if (!selectedCol) return;

    // Tìm hoặc tạo mới NCC trong danh mục suppliers
    let targetSupplier =
      (selectedCol.supplierId !== undefined
        ? suppliers.find((s) => s.id === selectedCol.supplierId)
        : undefined) ||
      suppliers.find(
        (s) =>
          s.name.trim().toLowerCase() ===
            req.recommendedSupplierName.trim().toLowerCase() ||
          s.name.trim().toLowerCase() ===
            selectedCol.supplierName.trim().toLowerCase(),
      );

    if (!targetSupplier) {
      const newSup: Supplier = {
        id: makeId(),
        code: `NCC-${String(suppliers.length + 1).padStart(3, "0")}`,
        name:
          req.recommendedSupplierName ||
          selectedCol.supplierName ||
          "Nhà cung cấp được phê duyệt",
        shortName:
          selectedCol.shortName ||
          generateShortName(
            req.recommendedSupplierName || selectedCol.supplierName,
          ),
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
          vatRate: 8,
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

    const newPO: PO = {
      id: makeId(),
      number: formatPONumber(targetSupplier, todayDate),
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
    setView("po-detail");
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
      number: formatPONumber(supplier, todayDate),
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
    setView("po-detail");
  };
  const updatePO = (po: PO) => {
    setCurrentPO(po);
    setPos((list) => list.map((x) => (x.id === po.id ? po : x)));
  };

  const handleCreateHandoverFromPO = (po: PO) => {
    if (!po.items || po.items.length === 0) {
      alert("PO/Hợp đồng này không có sản phẩm nào để tạo biên bản bàn giao.");
      return;
    }

    // Check if items from this PO/Contract already exist in paymentHandovers
    const existing = paymentHandovers.filter(
      (h) => h.source_number === po.number || (h.note && h.note.includes(po.number))
    );
    if (existing.length > 0) {
      const proceed = confirm(
        `Đã có ${existing.length} mặt hàng từ đơn #${po.number} trong danh sách bàn giao.\n\n` +
        `• Bấm [OK] để tiếp tục tạo thêm đợt bàn giao mới.\n` +
        `• Bấm [Hủy] để xem danh sách bàn giao hiện có.`
      );
      if (!proceed) {
        setSpotlightHandoverSearch(po.number);
        setView("handover");
        return;
      }
    }

    const maxId = Math.max(0, ...paymentHandovers.map((h) => Number(h.id) || 0)) + 1;
    let curId = maxId;

    const supplier = suppliers.find((s) => s.id === po.supplierId);
    const suppPart = supplier?.name ? ` - NCC: ${supplier.name}` : "";
    const linkedPR = prs.find((p) => p.number === po.prNumber);
    const defaultDept = linkedPR?.department || "Phòng Cung ứng";
    const docTypeLabel = isContractPO(po) ? "Hợp đồng" : "PO";

    const newHandovers: PaymentHandoverItem[] = po.items.map((it) => {
      const delivered = it.deliveredQty > 0 ? it.deliveredQty : it.qty;
      const specPart = it.spec ? ` (${it.spec})` : "";
      return {
        id: curId++,
        department: defaultDept,
        item_name: it.name,
        unit: it.unit || "Cái",
        quantity_doc: String(it.qty),
        quantity_pass: String(delivered),
        quantity_fail: "",
        note: `Nhận từ ${docTypeLabel} #${po.number}${suppPart}${specPart}`,
        handover_date: localToday(),
        sender_name: "Trần Hải Hà",
        sender_dept: "Phòng Cung ứng",
        receiver_name: "",
        source_type: docTypeLabel,
        source_number: po.number,
      };
    });

    setPaymentHandovers((prev) => [...newHandovers, ...prev]);
    setSpotlightHandoverSearch(po.number);
    setView("handover");
    setStorageStatus(`Đã tạo ${newHandovers.length} dòng bàn giao từ ${docTypeLabel} #${po.number}`);
  };

  const handleCreatePaymentRequestFromHandover = (newReq: PaymentRequestEntry) => {
    setPaymentRequests((prev) => [newReq, ...prev]);
    setSpotlightPaymentActiveId(newReq.id);
    setSpotlightPaymentSearch("");
    setView("payment");
    setStorageStatus(`Đã tạo Đề nghị thanh toán #${newReq.legacy_stt} từ ${newReq.lines?.length || 0} vật tư bàn giao!`);
  };

  const handleCreatePaymentRequestFromPOPayment = (po: PO, payment: Payment) => {
    if (payment.paymentRequestId) {
      const existing = paymentRequests.find((r) => r.id === payment.paymentRequestId);
      if (existing) {
        const go = confirm(
          `Đợt "${payment.phase}" đã liên kết với Đề nghị thanh toán #${existing.legacy_stt || existing.id}.\n\n` +
          `• Bấm [OK] để chuyển sang xem ĐNTT này.\n` +
          `• Bấm [Hủy] để tiếp tục ở lại.`
        );
        if (go) {
          setSpotlightPaymentActiveId(existing.id);
          setView("payment");
        }
        return;
      }
    }

    const supplier = suppliers.find((s) => s.id === po.supplierId);
    const total = po.items.reduce((s, i) => s + i.qty * i.price, 0);
    const docTypeLabel = isContractPO(po) ? "Hợp đồng" : "PO";
    const maxId = Math.max(0, ...paymentRequests.map((r) => Number(r.id) || 0)) + 1;
    const todayStr = localToday();
    const condition = payment.condition || "post";

    const docSupplement =
      condition === "advance"
        ? "Yêu cầu NCC bổ sung hóa đơn VAT đầy đủ sau khi giao hàng"
        : (payment.note || "");

    const newRequest: PaymentRequestEntry = {
      id: maxId,
      legacy_stt: maxId,
      beneficiary_id: supplier?.id,
      payee_name: supplier?.name || "Chưa xác định",
      group_code: po.number,
      description: buildPOPaymentDescription(po, payment),
      item_name: po.items?.map((i) => i.name).slice(0, 3).join(", ") + (po.items?.length > 3 ? "..." : "") || payment.phase,
      invoice_no: "",
      invoice_date: "",
      amount: payment.amount,
      currency: "VND",
      documents: [],
      request_date: payment.date || todayStr,
      payment_type: condition === "advance" ? "Tạm ứng" : "Thanh toán công nợ",
      status: "Chờ duyệt",
      doc_supplement: docSupplement,
      address: supplier?.address || "",
      account_no: supplier?.bankAccount || "",
      bank: supplier?.bank || "",
      created_by_name: "Phòng Cung ứng",
      due_date: payment.date || todayStr,
      lines: [],
    };

    // Update PO payment stage with the new paymentRequestId
    const updatedPayments = (po.payments || []).map((p) =>
      p.id === payment.id ? { ...p, paymentRequestId: maxId, status: "Đang xử lý" as const } : p
    );
    const updatedPO = { ...po, payments: updatedPayments };
    updatePO(updatedPO);

    // Add to paymentRequests state
    setPaymentRequests((prev) => [newRequest, ...prev]);
    setStorageStatus(`Đã tạo Đề nghị thanh toán #${maxId} cho ${payment.phase}`);

    const go = confirm(
      `✓ Đã lập Đề nghị thanh toán #${maxId} thành công cho đợt "${payment.phase}" (Số tiền: ${fmt(payment.amount)} ₫).\n\n` +
      `• Bấm [OK] để chuyển ngay sang tab "Quản lý thanh toán" để duyệt và in phiếu.\n` +
      `• Bấm [Hủy] để tiếp tục ở lại đơn hàng này.`
    );
    if (go) {
      setSpotlightPaymentActiveId(maxId);
      setView("payment");
    }
  };
  const activeContracts = pos.filter((po) => !hiddenContractIds.includes(po.id));
  useEffect(() => {
    if (!storageReady) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const prParam = params.get("pr");
      const poParam = params.get("po");
      const rawViewParam = params.get("view") as View;
      const viewParam = rawViewParam === "contracts" ? "po-list" : rawViewParam;
      
      let didSetPR = false;
      if (prParam) {
        const found = prs.find((p) => String(p.id) === prParam);
        if (found) {
          openCompare(found);
          didSetPR = true;
        }
      }
      
      if (poParam) {
        const found = pos.find((p) => String(p.id) === poParam);
        if (found) setCurrentPO(found);
      }
      
      if (viewParam && !didSetPR) {
        setView(viewParam);
      }
    }
  }, [storageReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!storageReady) return;
    const params = new URLSearchParams();
    if (view !== "dashboard") params.set("view", view);
    if (selectedPR?.id && (view === "compare" || view === "approval")) {
      params.set("pr", String(selectedPR.id));
    }
    if (currentPO?.id && view === "po-detail") {
      params.set("po", String(currentPO.id));
    }
    
    const newHash = params.toString();
    const currentHash = window.location.hash.slice(1);
    if (newHash !== currentHash) {
      window.history.replaceState(null, "", newHash ? `#${newHash}` : window.location.pathname);
    }
  }, [view, selectedPR?.id, currentPO?.id, storageReady]);

  const isNavActive = (id: string) => {
    if (view === "dashboard" && id === "dashboard") return true;
    if (view === "compare" && id === "compare") return true;
    if (view === "approval" && id === "approval") return true;
    if ((view === "prs" || view === "create") && id === "prs") return true;
    if ((view === "po-list" || view === "po-detail" || view === "contracts") && id === "po-list") return true;
    if (view === "payment" && id === "payment") return true;
    if (view === "handover" && id === "handover") return true;
    if (view === "products" && id === "products") return true;
    if (view === "suppliers" && id === "suppliers") return true;
    if (view === "trash" && id === "trash") return true;
    if ((view === "settings" || view === "print-templates") && id === "settings") return true;
    return false;
  };

  const nav = [
    { id: "dashboard", icon: "▦", name: t("nav.dashboard"), action: () => setView("dashboard") },
    { id: "prs", icon: "▣", name: t("nav.prs"), action: () => setView("prs") },
    { id: "compare", icon: "⚖", name: t("nav.compare"), action: () => setView("compare") },
    { id: "approval", icon: "✓", name: t("nav.approval"), action: () => { setActiveApprovalId(null); setView("approval"); } },
    { id: "po-list", icon: "▰", name: t("nav.po_list"), action: () => setView("po-list") },
    { id: "payment", icon: "💳", name: t("nav.payment"), action: () => setView("payment") },
    { id: "handover", icon: "📦", name: t("nav.handover"), action: () => setView("handover") },
    { id: "suppliers", icon: "▱", name: t("nav.suppliers"), action: () => setView("suppliers") },
    { id: "products", icon: "◇", name: t("nav.products"), action: () => setView("products") },
    {
      id: "trash",
      icon: "♲",
      name: `${t("nav.trash")}${trash.length ? ` (${trash.length})` : ""}`,
      action: () => setView("trash"),
    },
    ...(currentUser?.role === "master" || currentUser?.role === "admin"
      ? [
          {
            id: "settings",
            icon: "⚙",
            name: t("nav.settings"),
            action: () => setView("settings" as View),
          },
        ]
      : []),
  ];
  const visibleNav = reportMode
    ? nav.filter((n) =>
        [
          "dashboard",
          "prs",
          "compare",
          "approval",
          "po-list",
          "payment",
          "handover",
        ].includes(n.id),
      )
    : nav;

  return (
    <div
      className={`app ${collapsed ? "collapsed" : ""} ${reportMode ? "report-mode" : ""}`}
    >
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>{t("header.language")}</span>
            <LanguageSwitcher variant="compact" />
          </div>
          {!reportMode && workspaceUsers.length > 0 && (
            <label className="workspace-picker">
              <span>Môi trường</span>
              <select
                value={workspaceId}
                onChange={(event) => {
                  setStorageReady(false);
                  setStorageStatus("Đang mở môi trường làm việc...");
                  setWorkspaceId(event.target.value);
                }}
              >
                {workspaceUsers.map((workspaceUser) => (
                  <option key={workspaceUser.id} value={workspaceUser.id}>
                    {workspaceUser.displayName} ({workspaceUser.username})
                  </option>
                ))}
              </select>
            </label>
          )}
          {!reportMode && (
            <button className="header-share-report" onClick={openShareReport}>
              ↗ Tạo link theo dõi
            </button>
          )}
          <div className="user">
            <i>{currentUser?.displayName?.slice(0, 2).toUpperCase() || "BC"}</i>
            <div>
              <b>{currentUser?.displayName || "Báo cáo"}</b>
              <small>
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
          {!reportMode && currentUser && (
            <button
              className="header-logout"
              onClick={logout}
              title="Đăng xuất tài khoản"
            >
              <span>↪</span> {t("header.logout")}
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
      <main>
        <div className="mobile-header">
          <button className="hamb" onClick={() => setCollapsed(!collapsed)}>
            ☰
          </button>
          <b>{reportMode ? t("header.report_mode") : "Procurement"}</b>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
            <LanguageSwitcher variant="compact" />
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
              className={`cloud-status ${storageStatus.includes("thất bại") || storageStatus.includes("Không thể") ? "error" : ""}`}
            >
              <i>●</i>
              {storageStatus}
            </div>
          </>
        )}
        <Suspense fallback={<div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "14px" }}>Đang tải giao diện...</div>}>
        {view === "dashboard" && (
          <Dashboard
            prs={prs}
            pos={pos}
            suppliers={suppliers}
            purchaseHistory={purchaseHistory}
            onPR={() => setView("prs")}
            onPO={() => setView("po-list")}
            onCompare={() => setView("compare")}
          />
        )}
        {view === "contracts" && (
          <ErrorBoundary key="contracts" fallbackTitle="Lỗi hiển thị quản lý Hợp đồng" onReset={() => setView("dashboard")}>
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
                setView("po-detail");
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
                setView("payment");
              }}
              onCreateHandover={handleCreateHandoverFromPO}
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
            readOnly={reportMode}
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
            readOnly={reportMode}
          />
        )}
        {view === "approval" && (
          <ErrorBoundary
            key="approval"
            fallbackTitle="Lỗi hiển thị Đề nghị Phê duyệt Lựa chọn Nhà Cung Cấp"
            onReset={() => setView("dashboard")}
          >
            <ApprovalManagement
              approvalRequests={approvalRequests}
              activeApprovalId={activeApprovalId}
              setActiveApprovalId={setActiveApprovalId}
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
              }}
              onDeleteApproval={(delId) => {
                setApprovalRequests((prev) => {
                  const remaining = prev.filter((r) => r.id !== delId);
                  if (activeApprovalId === delId) {
                    setActiveApprovalId(remaining[0]?.id ?? null);
                  }
                  return remaining;
                });
              }}
              onRestoreSamples={() => {
                setApprovalRequests((prev) => {
                  const existingIds = new Set(prev.map((r) => r.id));
                  const missing = SAMPLE_PHENIKAA_APPROVALS.filter(
                    (s) => !existingIds.has(s.id),
                  );
                  const merged =
                    missing.length > 0 ? [...missing, ...prev] : prev;
                  if (merged.length > 0) setActiveApprovalId(merged[0].id);
                  return merged;
                });
              }}
              onCreatePOFromApproval={handleCreatePOFromApproval}
              prs={prs}
              suppliers={suppliers}
              quotesByPr={quotesByPr}
              quoteSupplierIdsByPr={quoteSupplierIdsByPr}
              isReportMode={reportMode}
              onBackToCompare={() => setView("compare")}
            />
          </ErrorBoundary>
        )}
        {view === "products" && (
          <ProductCatalog
            products={products}
            setProducts={setProducts}
            pos={pos}
            suppliers={suppliers}
            purchaseHistory={purchaseHistory}
            onCreatePR={() => setView("create")}
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
            onCreate={() => setView("create")}
            onOpen={openCompare}
            onDelete={reportMode ? undefined : (pr) => requestDelete("PR", pr)}
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
                items: [emptyItem(0)],
              });
              setView("prs");
            }}
            onSave={savePR}
          />
        )}
        {view === "suppliers" && (
          <SupplierManagement
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            onAdd={openSupplierModal}
            purchaseHistory={purchaseHistory}
          />
        )}
        {view === "po-list" && (
          <ErrorBoundary key="po-list" fallbackTitle="Lỗi hiển thị danh sách Đơn mua hàng (PO)" onReset={() => setView("dashboard")}>
            <POList
              pos={pos}
              suppliers={suppliers}
              prs={prs}
              products={products}
              onAddSupplier={handleAddSupplier}
              onAddProduct={handleAddProduct}
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
                if (openDetail) {
                  setView("po-detail");
                }
              }}
              onOpen={(po) => {
                setCurrentPO(po);
                setView("po-detail");
              }}
              onDelete={reportMode ? undefined : (po) => requestDelete("PO", po)}
              onCreateHandover={handleCreateHandoverFromPO}
              readOnly={reportMode}
            />
          </ErrorBoundary>
        )}
        {view === "trash" && (
          <TrashPage entries={trash} onRestore={restoreTrash} />
        )}
        {view === "po-detail" && (
          <ErrorBoundary key="po-detail" fallbackTitle="Lỗi hiển thị chi tiết Đơn mua hàng (PO)" onReset={() => setView("po-list")}>
            <PODetail
              po={currentPO?.id ? currentPO : ((pos && pos.length > 0) ? pos[0] : emptyPO)}
              suppliers={suppliers}
              setSuppliers={setSuppliers}
              onUpdate={updatePO}
              onBack={() => setView("po-list")}
              workspaceId={workspaceId}
              readOnly={reportMode}
              onStatus={setStorageStatus}
              onCreateHandover={handleCreateHandoverFromPO}
              onCreatePaymentRequest={handleCreatePaymentRequestFromPOPayment}
              onNavigateToPayment={(reqId) => {
                if (reqId) setSpotlightPaymentActiveId(reqId);
                setView("payment");
              }}
              onSave={() => persistState()}
              onAddSupplier={handleAddSupplier}
              approvalRequests={approvalRequests}
              onDelete={
                reportMode
                  ? undefined
                  : (targetPO) => requestDelete("PO", targetPO)
              }
            />
          </ErrorBoundary>
        )}
        {view === "compare" && (
          <section className="content">
            {!compactCompare && (
              <>
                <div className="heading">
                  <div>
                    <em>{t("compare.pr_breadcrumb")} · {selectedPR.number}</em>
                    <h1>{t("compare.title")}</h1>
                    <p>{selectedPR.purpose}</p>
                  </div>
                  <div className="actions">
                    <button className="ghost" onClick={() => setView("prs")}>
                      ← {t("compare.back_pr_list")}
                    </button>
                  </div>
                </div>
                <div className="cards">
                  <article>
                    <i>◇</i>
                    <strong>{items.length}</strong>
                    <span>{t("compare.items_count")}</span>
                  </article>
                  <article>
                    <i>♙</i>
                    <strong>{suppliers.length}</strong>
                    <span>{t("compare.suppliers_count")}</span>
                  </article>
                  <article className="good">
                    <i>✓</i>
                    <div>
                      <strong>{t("compare.best_price")}</strong>
                      <span>{t("compare.best_price_desc")}</span>
                    </div>
                  </article>
                  <article className="total">
                    <span>{t("compare.estimated_total")}</span>
                    <strong>{fmt(estimated)} ₫</strong>
                  </article>
                </div>
                <section className="common-note-card">
                  <label>
                    <span>✎ {t("compare.general_note")}</span>
                    <textarea
                      rows={3}
                      value={selectedPR.note || ""}
                      placeholder={t("compare.general_note_placeholder")}
                      onChange={(e) => updatePRNote(e.target.value)}
                    />
                  </label>
                </section>
              </>
            )}
            <div className="toolbar" style={compactCompare ? { marginTop: "1rem" } : {}}>
              <label style={{ width: "260px" }}>
                ⌕
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("compare.search_placeholder")}
                />
              </label>
              <div className="vat-compare-toolbar" style={{ margin: 0, padding: 0, border: "none", background: "none" }}>
                <span>{t("compare.price_mode")}</span>
                <button
                  className={quoteCompareMode === "before-vat" ? "active" : ""}
                  onClick={() => setQuoteCompareMode("before-vat")}
                >
                  {t("compare.before_vat")}
                </button>
                <button
                  className={quoteCompareMode === "after-vat" ? "active" : ""}
                  onClick={() => setQuoteCompareMode("after-vat")}
                >
                  {t("compare.after_vat")}
                </button>
              </div>
              <p>
                <span>{t("compare.drag_hint")}</span>
                <span>{t("compare.filter_hint")}</span>
              </p>
              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                {!reportMode && (
                  <>
                    <button
                      className="ghost"
                      style={{ border: "1px solid var(--line)", background: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 500, color: "#3f3f46", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", cursor: "pointer" }}
                      onClick={() => setItems((x) => [...x, emptyItem(x.length)])}
                    >
                      {t("compare.add_item")}
                    </button>
                    <button
                      className="ghost"
                      style={{ border: "1px solid var(--line)", background: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 500, color: "#3f3f46", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", cursor: "pointer" }}
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
                      {t("compare.add_vendor_col")}
                    </button>
                    <button
                      className="primary"
                      style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 500, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", cursor: "pointer" }}
                      onClick={() => {
                        setSelectedSupplierId("");
                        setSupplierSearch("");
                        setSupplierPicker(true);
                      }}
                    >
                      {t("compare.choose_supplier")}
                    </button>
                    <button
                      className="primary"
                      style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 600, background: "#0f2b5b", color: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", cursor: "pointer" }}
                      onClick={openApproval}
                      title="Kế thừa danh sách hàng hóa, NCC và đơn giá của PR này sang Đề nghị Phê duyệt Lựa chọn NCC"
                    >
                      ✓ Lập Đề nghị Phê duyệt
                    </button>
                    <button
                      className="po-create-btn"
                      disabled={!poCart.length}
                      onClick={() => setPoCartOpen(true)}
                      style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 500, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", cursor: "pointer" }}
                    >
                      {t("compare.po_cart_btn", { count: poCart.length })}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setCompactCompare(!compactCompare)}
                  style={{
                    padding: "6px 12px",
                    cursor: "pointer",
                    borderRadius: "6px",
                    border: "1px solid #d4d4d8",
                    background: "#fff",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#3f3f46",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                  }}
                >
                  {compactCompare ? t("btn.expand_workspace") : t("btn.collapse_workspace")}
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
          </section>
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
        <div className="backdrop" onMouseDown={() => setSupplierModal(false)}>
          <div
            className="modal supplier-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
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
      {conflictModal && (
        <ConflictModal
          conflict={conflictModal}
          onReload={() => {
            setConflictModal(null);
            setStorageStatus("Đang tải lại dữ liệu mới nhất...");
            setLoadTrigger((t) => t + 1);
          }}
          onOverwrite={() => {
            serverVersionRef.current = conflictModal.serverVersion;
            setConflictModal(null);
            setStorageStatus("Đang ghi đè dữ liệu lên máy chủ...");
            void persistState();
          }}
        />
      )}
      {!reportMode && (
        <nav className="mobile-bottom-nav" aria-label="Điều hướng điện thoại">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><span>▦</span><b>{t("nav.dashboard")}</b></button>
          <button className={view === "prs" || view === "create" ? "active" : ""} onClick={() => setView("prs")}><span>▣</span><b>PR</b></button>
          <button className={view === "payment" ? "active" : ""} onClick={() => setView("payment")}><span>💳</span><b>{t("nav.payment")}</b></button>
          <button className={view === "po-list" || view === "po-detail" ? "active" : ""} onClick={() => setView("po-list")}><span>▰</span><b>PO</b></button>
          <button onClick={() => setCollapsed(false)}><span>☰</span><b>Menu</b></button>
        </nav>
      )}

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

