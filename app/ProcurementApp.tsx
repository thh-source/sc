"use client";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import type React from "react";
import DocumentManager from "./DocumentManager";
import SmartTableTools from "./SmartTableTools";
import "./vat-quote.css";

import { PaymentManagement } from "./components/PaymentManagement";
import { BANK_SUGGESTIONS, DEFAULT_PAYMENT_TEMPLATE } from "./payment-utils";
import { Item, Supplier, PurchaseHistory, QuoteMode, QuoteEntry, Quote, PR, POItem, POCartLine, ApprovalRow, ApprovalDraft, PODoc, PO, TrashItem, View, ColumnKey, SortState, PaymentRequestEntry, PaymentGroup, PaymentBeneficiary, PaymentHandoverItem, PaymentPrintTemplate } from "./types";
import { BASE_COLUMNS, reorder, applyTools, makeId, emptyItem, fmt, dateVN, DEFAULT_VAT_RATE, quoteDefaults, quoteBeforeVat, quoteAfterVat, quoteComparePrice, mergeHistorySeed, PurchaseHistorySeed, excelNumber, emptyPR, emptyPO, generateShortName } from "./utils";
import { items0, suppliers0, purchaseHistory0, quotes0, prs0, pos0, HISTORY_SEED_ID } from "./seed";
import { AdvancedItemsTable } from "./components/AdvancedItemsTable";
import { CreatePRCatalog } from "./components/CreatePRCatalog";
import { ApprovalSheet } from "./components/ApprovalSheet";

import { Dashboard } from "./components/Dashboard";
import { POList } from "./components/POList";
import { PODetail } from "./components/PODetail";
import { PRList } from "./components/PRList";

const AdminSettings = lazy(() => import("./components/AdminSettings").then(m => ({ default: m.AdminSettings })));
const TrashPage = lazy(() => import("./components/TrashPage").then(m => ({ default: m.TrashPage })));
const ContractManagement = lazy(() => import("./components/ContractManagement").then(m => ({ default: m.ContractManagement })));
const PrintTemplatesManagement = lazy(() => import("./components/PrintTemplatesManagement").then(m => ({ default: m.PrintTemplatesManagement })));
const HandoverManagement = lazy(() => import("./components/HandoverManagement").then(m => ({ default: m.HandoverManagement })));
const ProductCatalog = lazy(() => import("./components/ProductCatalog").then(m => ({ default: m.ProductCatalog })));
const SupplierManagement = lazy(() => import("./components/SupplierManagement").then(m => ({ default: m.SupplierManagement })));

export default function ProcurementApp({
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
    [storageStatus, setStorageStatus] = useState("Đang kết nối dữ liệu...");
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
          setStorageStatus(
            "⚠️ Dữ liệu đã thay đổi ở phiên/thiết bị khác. Vui lòng tải lại trang (F5)!",
          );
          return;
        }
        if (!response.ok) throw new Error("SAVE_FAILED");
        const resData = await response.json().catch(() => null);
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
      },
    };
  }, [hiddenContractIds, items, paymentBeneficiaries, paymentGroups, paymentHandovers, paymentRequests, paymentTemplate, poCart, pos, products, prs, purchaseHistory, purchaseHistoryImportIds, quoteCompareMode, quoteSupplierIds, quoteSupplierIdsByPr, quotes, quotesByPr, suppliers, trash, workspaceId]);
  useEffect(() => {
    if (
      reportMode ||
      !currentUser ||
      (currentUser.role !== "master" && currentUser.role !== "admin")
    )
      return;
    fetch("/api/users")
      .then((response) => response.json())
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
        return r.json();
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
              data.prs?.find((pr) =>
                pr.items.some((item) => legacyQuoteItemIds.has(item.id)),
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
          
          const loadedSuppliers: Supplier[] = data.suppliers || suppliers0;
          const mergedSuppliers = [...loadedSuppliers];
          const benList = (data.paymentBeneficiaries && data.paymentBeneficiaries.length > 0)
            ? data.paymentBeneficiaries
            : [];
          for (const b of benList) {
            const match = mergedSuppliers.find(
              (s) =>
                s.name.toLowerCase() === b.name.toLowerCase() ||
                (b.short_name && s.shortName && s.shortName.toLowerCase() === b.short_name.toLowerCase())
            );
            if (match) {
              if (!match.address && b.address) match.address = b.address;
              if (!match.bankAccount && b.account_no) match.bankAccount = b.account_no;
              if (!match.bank && b.bank) match.bank = b.bank;
              if (!match.shortName && b.short_name) match.shortName = b.short_name;
            } else if (b.name) {
              mergedSuppliers.push({
                id: Date.now() + Math.floor(Math.random() * 10000) + b.id,
                code: `NCC-${String(b.id).padStart(3, "0")}`,
                name: b.name,
                shortName: b.short_name || generateShortName(b.name),
                address: b.address || "",
                bankAccount: b.account_no || "",
                bank: b.bank || "",
                contact: "",
                phone: "",
              });
            }
          }
          setSuppliers(mergedSuppliers.map(s => ({
            ...s,
            shortName: s.shortName || generateShortName(s.name)
          })));

          setQuotesByPr(migratedQuotes);
          setQuoteSupplierIdsByPr(migratedSupplierIds);
          setQuotes(firstPR ? migratedQuotes[firstPR.id] || {} : {});
          setPos(data.pos || pos0);
          setItems(firstPR?.items || data.items || items0);
          setQuoteSupplierIds(
            firstPR ? migratedSupplierIds[firstPR.id] || [] : [],
          );
          const now = Date.now();
          setTrash(
            (data.trash || []).filter(
              (entry) => new Date(entry.expiresAt).getTime() > now,
            ),
          );
          setHiddenContractIds(data.hiddenContractIds || []);
          setPoCart(data.poCart || []);
          setQuoteCompareMode(data.quoteCompareMode || "before-vat");
          setPurchaseHistory(data.purchaseHistory || purchaseHistory0);
          setPurchaseHistoryImportIds(data.purchaseHistoryImportIds || []);
          
          const hasPaymentRequests = data.paymentRequests && data.paymentRequests.length > 0;
          if (hasPaymentRequests) {
            setPaymentRequests(data.paymentRequests);
            setPaymentGroups(data.paymentGroups || []);
            setPaymentBeneficiaries(data.paymentBeneficiaries || []);
            setPaymentHandovers(data.paymentHandovers || []);
            setPaymentTemplate(data.paymentTemplate || DEFAULT_PAYMENT_TEMPLATE);
          } else {
            fetch("/default-payment-seed.json")
              .then((res) => res.json())
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
          setSelectedPR(emptyPR);
          setCurrentPO(emptyPO);

          fetch("/default-payment-seed.json")
            .then((res) => res.json())
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
  }, [reportToken, workspaceId]);
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
    purchaseHistory,
    purchaseHistoryImportIds,
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
      const body = await response.json();
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
      const body = await response.json();
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
        setPrs((list) => list.filter((pr) => pr.id !== record.id));
        if (selectedPR.id === record.id) setSelectedPR(emptyPR);
        setView("prs");
      } else if (deleteTarget.type === "PO") {
        setPos((list) => list.filter((po) => po.id !== record.id));
        if (currentPO.id === record.id) setCurrentPO(emptyPO);
        setView("po-list");
      } else {
        setHiddenContractIds((ids) => [...new Set([...ids, record.id])]);
        setView("contracts");
      }
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
            .includes(search.toLowerCase()),
        ),
        compareOrder,
        compareFilters,
        compareSort,
      ),
    [items, search, compareOrder, compareFilters, compareSort],
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
    if (!poCart.length) return;
    const sourcePRs = [...new Set(poCart.map((line) => line.allocation.prNumber))],
      supplierIds = [
        ...new Set(
          poCart.flatMap((line) => {
            const prQuotes =
                quotesByPr[line.allocation.prId] ||
                (line.allocation.prId === selectedPR.id ? quotes : {}),
              prSupplierIds =
                quoteSupplierIdsByPr[line.allocation.prId] ||
                (line.allocation.prId === selectedPR.id ? quoteSupplierIds : []);
            return [
              ...prSupplierIds.filter(
                (id) => quoteBeforeVat(prQuotes[line.item.id]?.[id]) > 0,
              ),
              line.supplierId,
            ];
          }),
        ),
      ],
      rows: ApprovalRow[] = poCart.map((line) => {
        const prices: Record<number, number> = {},
          prQuotes =
            quotesByPr[line.allocation.prId] ||
            (line.allocation.prId === selectedPR.id ? quotes : {});
        supplierIds.forEach((supplierId) => {
          prices[supplierId] = quoteBeforeVat(
            prQuotes[line.item.id]?.[supplierId],
          );
        });
        return {
          id: line.id,
          prNumber: line.allocation.prNumber,
          code: line.item.code,
          name: line.item.name,
          qty: line.allocation.qty,
          unit: line.item.unit,
          selectedSupplierId: line.supplierId,
          prices,
        };
      });
    setApprovalDraft({
      number: selectedPR.number || sourcePRs.join(", "),
      date: new Date().toISOString().slice(0, 10),
      department: selectedPR.department || "Phòng Cung Ứng",
      prNumbers: sourcePRs.join(", "),
      purpose: selectedPR.purpose || "phục vụ hoạt động mua hàng của công ty",
      intro: `Theo yêu cầu mua hàng phục vụ ${selectedPR.purpose || "công việc của các bộ phận"}. Phòng Cung Ứng đã tìm kiếm, đánh giá và đề xuất phương án như sau:`,
      rows,
      supplierIds,
      note: "",
    });
    setPoCartOpen(false);
    setView("approval");
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
          allocations: [line.allocation],
          deliveryStatus: "Chưa giao",
          deliveredQty: 0,
          deliveryDate: "",
        });
      }
    });
    const sourcePRs = [...new Set(poCart.map((line) => line.allocation.prNumber))];
    const po: PO = {
      id: makeId(),
      number: `PO-${new Date().getFullYear()}-${String(pos.length + 1).padStart(4, "0")}`,
      prNumber:
        sourcePRs.length === 1 ? sourcePRs[0] : `Nhiều PR (${sourcePRs.length})`,
      supplierId: supplier.id,
      createdDate: new Date().toISOString().slice(0, 10),
      expectedDate: "",
      status: "Mới tạo",
      items: [...grouped.values()],
      docs: [
        {
          id: makeId(),
          name: "Hợp đồng / PO xác nhận",
          status: "Chờ bổ sung",
          note: "",
        },
        {
          id: makeId(),
          name: "Hóa đơn VAT",
          status: "Còn thiếu",
          note: "",
        },
        {
          id: makeId(),
          name: "Biên bản giao nhận",
          status: "Còn thiếu",
          note: "",
        },
      ],
      payments: [
        {
          id: makeId(),
          phase: "Tạm ứng",
          percent: 50,
          amount: 0,
          status: "Chưa thanh toán",
          date: "",
        },
        {
          id: makeId(),
          phase: "Thanh toán còn lại",
          percent: 50,
          amount: 0,
          status: "Chưa thanh toán",
          date: "",
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
  const activeContracts = pos.filter((po) => !hiddenContractIds.includes(po.id));
  useEffect(() => {
    if (!storageReady) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const prParam = params.get("pr");
      const poParam = params.get("po");
      const viewParam = params.get("view") as View;
      
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

  const nav = [
    { icon: "▦", name: "Tổng quan", action: () => setView("dashboard") },
    { icon: "▣", name: "Danh sách PR", action: () => setView("prs") },
    { icon: "⚖", name: "So sánh báo giá", action: () => setView("compare") },
    { icon: "▰", name: "Quản lý PO", action: () => setView("po-list") },
    { icon: "▧", name: "Hợp đồng", action: () => setView("contracts") },
    { icon: "💳", name: "Thanh toán", action: () => setView("payment") },
    { icon: "📦", name: "Bàn giao nội bộ", action: () => setView("handover") },
    { icon: "📄", name: "Mẫu phiếu in", action: () => setView("print-templates") },
    { icon: "▱", name: "Nhà cung cấp", action: () => setView("suppliers") },
    { icon: "◇", name: "Hàng hóa", action: () => setView("products") },
    {
      icon: "♲",
      name: `Thùng rác${trash.length ? ` (${trash.length})` : ""}`,
      action: () => setView("trash"),
    },
    ...(currentUser?.role === "master" || currentUser?.role === "admin"
      ? [
          {
            icon: "⚙",
            name: "Cài đặt",
            action: () => setView("settings" as View),
          },
        ]
      : []),
  ];
  const visibleNav = reportMode
    ? nav.filter((n) =>
        [
          "Tổng quan",
          "Danh sách PR",
          "So sánh báo giá",
          "Quản lý PO",
          "Hợp đồng",
          "Thanh toán",
          "Bàn giao nội bộ",
          "Mẫu phiếu in",
        ].includes(n.name),
      )
    : nav;

  return (
    <div
      className={`app ${collapsed ? "collapsed" : ""} ${reportMode ? "report-mode" : ""}`}
    >
      <SmartTableTools scopeKey={view} />
      <aside>
        <div className="brand">
          <span>
            <img src="/phenikaa-logo.png" alt="Phenikaa" />
          </span>
          <b>
            <strong>PHENIKAA</strong>
            <small>{reportMode ? "Báo cáo chỉ xem" : "Procurement"}</small>
          </b>
        </div>
        <nav>
          {visibleNav.map((n) => (
            <button
              onClick={() => {
                n.action();
                if (typeof window !== "undefined" && window.innerWidth <= 768) {
                  setCollapsed(true);
                }
              }}
              className={
                (view === "dashboard" && n.name === "Tổng quan") ||
                (view === "compare" && n.name === "So sánh báo giá") ||
                ((view === "prs" || view === "create") &&
                  n.name === "Danh sách PR") ||
                ((view === "po-list" || view === "po-detail") &&
                  n.name === "Quản lý PO") ||
                (view === "contracts" && n.name === "Hợp đồng") ||
                (view === "payment" && n.name === "Thanh toán") ||
                (view === "handover" && n.name === "Bàn giao nội bộ") ||
                (view === "print-templates" && n.name === "Mẫu phiếu in") ||
                (view === "products" && n.name === "Hàng hóa") ||
                (view === "suppliers" && n.name === "Nhà cung cấp") ||
                (view === "trash" && n.name.startsWith("Thùng rác")) ||
                (view === "settings" && n.name === "Cài đặt")
                  ? "active"
                  : ""
              }
              key={n.name}
            >
              <span>{n.icon}</span>
              <b>{n.name}</b>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom-actions">
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
              <span>↪</span> Đăng xuất
            </button>
          )}
        </div>
        <button className="collapse" onClick={() => setCollapsed(!collapsed)}>
          « <b>Thu gọn</b>
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
          <b>{reportMode ? "Báo cáo chỉ xem" : "Procurement"}</b>
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
          <ContractManagement
            pos={activeContracts}
            suppliers={suppliers}
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
          />
        )}
        {view === "payment" && (
          <PaymentManagement
            paymentRequests={paymentRequests}
            paymentGroups={paymentGroups}
            paymentTemplate={paymentTemplate}
            pos={pos}
            suppliers={suppliers}
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
            onUpdateHandovers={(items) => setPaymentHandovers(items)}
            onUpdateState={(patch) => {
              if (patch.paymentHandovers !== undefined) setPaymentHandovers(patch.paymentHandovers);
            }}
            readOnly={reportMode}
          />
        )}
        {view === "print-templates" && (
          <PrintTemplatesManagement
            paymentTemplate={paymentTemplate}
            suppliers={suppliers}
            sampleRequest={paymentRequests[0] || null}
            onUpdateState={(patch) => {
              if (patch.paymentTemplate !== undefined) setPaymentTemplate(patch.paymentTemplate);
            }}
            readOnly={reportMode}
          />
        )}
        {view === "approval" && approvalDraft && !reportMode && (
          <ApprovalSheet
            draft={approvalDraft}
            setDraft={setApprovalDraft}
            suppliers={suppliers}
            onBack={() => setView("compare")}
            onCreatePO={createPO}
          />
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
        {view === "settings" &&
          currentUser &&
          (currentUser.role === "master" || currentUser.role === "admin") && (
            <AdminSettings currentUser={currentUser} />
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
          <POList
            pos={pos}
            suppliers={suppliers}
            onOpen={(po) => {
              setCurrentPO(po);
              setView("po-detail");
            }}
            onDelete={reportMode ? undefined : (po) => requestDelete("PO", po)}
          />
        )}
        {view === "trash" && (
          <TrashPage entries={trash} onRestore={restoreTrash} />
        )}
        {view === "po-detail" && (
          <PODetail
            po={currentPO}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            onUpdate={updatePO}
            onBack={() => setView("po-list")}
            workspaceId={workspaceId}
            readOnly={reportMode}
            onStatus={setStorageStatus}
          />
        )}
        {view === "compare" && (
          <section className="content">
            {!compactCompare && (
              <>
                <div className="heading">
                  <div>
                    <em>YÊU CẦU MUA HÀNG · {selectedPR.number}</em>
                    <h1>Bảng tổng hợp mua hàng</h1>
                    <p>{selectedPR.purpose}</p>
                  </div>
                  <div className="actions">
                    <button className="ghost" onClick={() => setView("prs")}>
                      ← Danh sách PR
                    </button>

                  </div>
                </div>
                <div className="cards">
                  <article>
                    <i>◇</i>
                    <strong>{items.length}</strong>
                    <span>Mặt hàng</span>
                  </article>
                  <article>
                    <i>♙</i>
                    <strong>{suppliers.length}</strong>
                    <span>Nhà cung cấp</span>
                  </article>
                  <article className="good">
                    <i>✓</i>
                    <div>
                      <strong>Giá tốt nhất</strong>
                      <span>Tự động xác định theo giá thấp nhất</span>
                    </div>
                  </article>
                  <article className="total">
                    <span>Giá trị dự kiến</span>
                    <strong>{fmt(estimated)} ₫</strong>
                  </article>
                </div>
                <section className="common-note-card">
                  <label>
                    <span>✎ Ghi chú chung PR</span>
                    <textarea
                      rows={3}
                      value={selectedPR.note || ""}
                      placeholder="Diễn giải tự do cho toàn bộ PR..."
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
                  placeholder="Tìm mã hàng, phân loại, tên vật tư..."
                />
              </label>
              <div className="vat-compare-toolbar" style={{ margin: 0, padding: 0, border: "none", background: "none" }}>
                <span>So sánh giá theo:</span>
                <button
                  className={quoteCompareMode === "before-vat" ? "active" : ""}
                  onClick={() => setQuoteCompareMode("before-vat")}
                >
                  Giá chưa VAT
                </button>
                <button
                  className={quoteCompareMode === "after-vat" ? "active" : ""}
                  onClick={() => setQuoteCompareMode("after-vat")}
                >
                  Giá có VAT
                </button>
              </div>
              <p>
                <span>↔ Kéo tiêu đề để đổi cột</span>
                <span>▾ Bấm để lọc nhiều giá trị</span>
              </p>
              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                {!reportMode && (
                  <>
                    <button
                      className="ghost"
                      style={{ border: "1px solid var(--line)", background: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 500, color: "#3f3f46", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", cursor: "pointer" }}
                      onClick={() => setItems((x) => [...x, emptyItem(x.length)])}
                    >
                      ＋ Thêm mặt hàng
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
                      ＋ Cột NCC
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
                      ＋ Chọn nhà cung cấp
                    </button>
                    <button
                      className="po-create-btn"
                      disabled={!poCart.length}
                      onClick={() => setPoCartOpen(true)}
                      style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 500, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", cursor: "pointer" }}
                    >
                      Giỏ PO ({poCart.length})
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
                  {compactCompare ? "Mở rộng giao diện" : "Thu gọn giao diện"}
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
                  <button onClick={() => setPoCartOpen(true)}>Xem giỏ / Tạo PO</button>
                  <button onClick={() => { setPoCart([]); setPoSelections([]); }}>Làm trống</button>
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
                <em>GIỎ TẠO PO LIÊN PR</em>
                <h2>Tạo PO từ nhiều đề nghị mua hàng</h2>
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
                  <tr><th>PR nguồn</th><th>Mã hàng</th><th>Tên hàng</th><th>SL yêu cầu</th><th>Đã đặt</th><th>Đặt lần này</th><th>Còn lại</th><th>Đơn giá</th><th></th></tr>
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
                        <td><button className="delete-action" onClick={() => { setPoCart((cart) => cart.filter((item) => item.id !== line.id)); if (line.allocation.prId === selectedPR.id) setPoSelections((ids) => ids.filter((id) => id !== line.allocation.prItemId)); }}>Bỏ</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer>
              <div>
                <span>Tổng giá trị PO</span>
                <b>{fmt(poCart.reduce((sum, line) => sum + line.allocation.qty * line.price, 0))} ₫</b>
              </div>
              <div>
                <button className="ghost" onClick={() => setPoCartOpen(false)}>Tiếp tục chọn PR khác</button>
                <button className="po-create-btn" disabled={!poCart.length || poCart.some((line) => line.allocation.qty <= 0)} onClick={openApproval}>Lập phê duyệt</button>
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
        <div className="backdrop" onMouseDown={() => setSupplierPicker(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <i>▱</i>
            <h2>Chọn nhà cung cấp</h2>
            <p>
              Chọn nhà cung cấp từ danh mục dùng chung để thêm cột Giá và Ghi
              chú.
            </p>
            {(() => {
              const q = supplierSearch.toLowerCase();
              const filtered = availableSuppliers.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.shortName && s.shortName.toLowerCase().includes(q)));
              const exactMatch = availableSuppliers.find(s => s.name.toLowerCase() === q || (s.shortName && s.shortName.toLowerCase() === q));
              return (
                <div style={{display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px"}}>
                  <input autoFocus placeholder="Gõ tên nhà cung cấp để tìm hoặc tạo mới..." value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} style={{padding: "10px", fontSize: "15px"}} />
                  <div style={{flex: 1, overflowY: "auto", border: "1px solid #ddd", borderRadius: "4px", background: "#fff", minHeight: "150px"}}>
                    {filtered.map(s => (
                       <div key={s.id} onClick={() => addQuoteSupplier(s.id)} style={{padding: "12px 10px", cursor: "pointer", borderBottom: "1px solid #eee"}} onMouseEnter={e => (e.currentTarget.style.background = "#e6f2ff")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                         <b>{s.shortName || s.name}</b> <small style={{color:"#666"}}>({s.code}) - {s.name}</small>
                       </div>
                    ))}
                    {!exactMatch && supplierSearch.trim() && (
                       <div onClick={() => {
                          const newName = supplierSearch.trim();
                          const newCode = `NCC-${String(suppliers.length + 1).padStart(3, "0")}`;
                          const newId = makeId();
                          setSuppliers(all => [...all, { id: newId, code: newCode, name: newName, shortName: generateShortName(newName), bank: "", bankAccount: "", address: "", contact: "", phone: "" }]);
                          addQuoteSupplier(newId);
                       }} style={{padding: "12px 10px", cursor: "pointer", background: "#f0fdf4", color: "#166534"}} onMouseEnter={e => (e.currentTarget.style.background = "#dcfce7")} onMouseLeave={e => (e.currentTarget.style.background = "#f0fdf4")}>
                         + Tạo mới NCC: <b>{supplierSearch}</b>
                       </div>
                    )}
                    {filtered.length === 0 && !supplierSearch.trim() && <div style={{padding: "10px", color: "#999"}}>Tất cả NCC đã có trong bảng.</div>}
                  </div>
                </div>
              );
            })()}
            <div>
              <button
                className="ghost"
                onClick={() => setSupplierPicker(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {!reportMode && (
        <nav className="mobile-bottom-nav" aria-label="Điều hướng điện thoại">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><span>▦</span><b>Tổng quan</b></button>
          <button className={view === "prs" || view === "create" ? "active" : ""} onClick={() => setView("prs")}><span>▣</span><b>PR</b></button>
          <button className={view === "payment" ? "active" : ""} onClick={() => setView("payment")}><span>💳</span><b>Thanh toán</b></button>
          <button className={view === "po-list" || view === "po-detail" ? "active" : ""} onClick={() => setView("po-list")}><span>▰</span><b>PO</b></button>
          <button onClick={() => setCollapsed(false)}><span>☰</span><b>Menu</b></button>
        </nav>
      )}
    </div>
  );
}

