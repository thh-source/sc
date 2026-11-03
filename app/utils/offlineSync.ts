import { Network } from "@capacitor/network";
import { resolveApiUrl } from "./apiConfig";

export interface OfflineSyncItem {
  id: string;
  endpoint: string;
  method: string;
  data: any;
  expectedVersion?: number;
  createdAt: number;
  description?: string;
  status?: "pending" | "syncing" | "failed";
  error?: string;
  retries?: number;
}

export interface FormDraftItem<T = any> {
  key: string;
  data: T;
  updatedAt: number;
  title?: string;
}

export interface StateBackupItem {
  workspaceId: string;
  data: any;
  version?: number;
  updatedAt: number;
}

const DB_NAME = "SCM_OfflineDB";
const DB_VERSION = 1;
const STORE_QUEUE = "offline_sync_queue";
const STORE_DRAFTS = "form_drafts";
const STORE_BACKUP = "offline_state_backup";

/**
 * Mở kết nối IndexedDB an toàn với timeout và fallback
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB không khả dụng trong môi trường này"));
    }

    const timer = setTimeout(() => {
      reject(new Error("Timeout khi mở IndexedDB (2000ms)"));
    }, 2000);

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = () => {
        clearTimeout(timer);
        console.warn("IndexedDB mở bị blocked bởi kết nối khác, tiếp tục fallback");
        reject(new Error("IndexedDB blocked"));
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
          queueStore.createIndex("createdAt", "createdAt", { unique: false });
          queueStore.createIndex("status", "status", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          db.createObjectStore(STORE_DRAFTS, { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains(STORE_BACKUP)) {
          db.createObjectStore(STORE_BACKUP, { keyPath: "workspaceId" });
        }
      };

      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };

      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error || new Error("Lỗi mở IndexedDB"));
      };
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Khởi tạo Offline DB an toàn với timeout
 */
export async function initOfflineDB(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const db = await openDB();
    return Boolean(db);
  } catch (err) {
    console.warn("Lỗi khởi tạo offline DB, chuyển sang fallback an toàn:", err);
    return false;
  }
}

// -------------------------------------------------------------
// 1. QUẢN LÝ HÀNG ĐỢI ĐỒNG BỘ (OFFLINE SYNC QUEUE)
// -------------------------------------------------------------

export async function enqueueOfflineAction(
  item: Omit<OfflineSyncItem, "id" | "createdAt" | "status" | "retries">
): Promise<OfflineSyncItem> {
  const fullItem: OfflineSyncItem = {
    ...item,
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    createdAt: Date.now(),
    status: "pending",
    retries: 0,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.put(fullItem);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Fallback vào localStorage nếu IndexedDB bị hạn chế
    try {
      const list = JSON.parse(localStorage.getItem(STORE_QUEUE) || "[]");
      list.push(fullItem);
      localStorage.setItem(STORE_QUEUE, JSON.stringify(list));
    } catch {}
  }

  // Bắn event thông báo hàng đợi có thay đổi
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("scm_offline_queue_changed", { detail: { count: 1 } }));
  }

  return fullItem;
}

export async function getOfflineQueue(): Promise<OfflineSyncItem[]> {
  try {
    const db = await openDB();
    return await new Promise<OfflineSyncItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readonly");
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as OfflineSyncItem[];
        items.sort((a, b) => a.createdAt - b.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    try {
      const list = JSON.parse(localStorage.getItem(STORE_QUEUE) || "[]");
      return list;
    } catch {
      return [];
    }
  }
}

export async function removeOfflineAction(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const list = JSON.parse(localStorage.getItem(STORE_QUEUE) || "[]");
      const filtered = list.filter((item: OfflineSyncItem) => item.id !== id);
      localStorage.setItem(STORE_QUEUE, JSON.stringify(filtered));
    } catch {}
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("scm_offline_queue_changed", { detail: { removed: id } }));
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.removeItem(STORE_QUEUE);
    } catch {}
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("scm_offline_queue_changed", { detail: { count: 0 } }));
  }
}

// -------------------------------------------------------------
// 2. TỰ ĐỘNG LƯU BẢN NHÁP FORM (FORM DRAFTS AUTO-SAVE)
// -------------------------------------------------------------

export async function saveFormDraft<T>(key: string, data: T, title?: string): Promise<void> {
  const item: FormDraftItem<T> = {
    key,
    data,
    updatedAt: Date.now(),
    title,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.setItem(`draft_${key}`, JSON.stringify(item));
    } catch {}
  }
}

export async function getFormDraft<T>(key: string): Promise<FormDraftItem<T> | null> {
  try {
    const db = await openDB();
    return await new Promise<FormDraftItem<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readonly");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const str = localStorage.getItem(`draft_${key}`);
      return str ? JSON.parse(str) : null;
    } catch {
      return null;
    }
  }
}

export async function clearFormDraft(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.removeItem(`draft_${key}`);
    } catch {}
  }
}

// -------------------------------------------------------------
// 3. SAO LƯU STATE TOÀN BỘ WORKSPACE (OFFLINE STATE BACKUP)
// -------------------------------------------------------------

export async function saveOfflineStateBackup(
  workspaceId: string,
  data: any,
  version?: number
): Promise<void> {
  const item: StateBackupItem = {
    workspaceId,
    data,
    version,
    updatedAt: Date.now(),
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BACKUP, "readwrite");
      const store = tx.objectStore(STORE_BACKUP);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.setItem(`scmh_backup_${workspaceId}`, JSON.stringify(item));
    } catch {}
  }
}

export async function getOfflineStateBackup(workspaceId: string): Promise<StateBackupItem | null> {
  try {
    const db = await openDB();
    return await new Promise<StateBackupItem | null>((resolve, reject) => {
      const tx = db.transaction(STORE_BACKUP, "readonly");
      const store = tx.objectStore(STORE_BACKUP);
      const req = store.get(workspaceId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const str = localStorage.getItem(`scmh_backup_${workspaceId}`);
      if (str) {
        const parsed = JSON.parse(str);
        if (parsed && typeof parsed === "object" && "data" in parsed && "workspaceId" in parsed) {
          return parsed as StateBackupItem;
        }
        return {
          workspaceId,
          data: parsed,
          updatedAt: Date.now(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}

// -------------------------------------------------------------
// 4. KIỂM TRA & LẮNG NGHE KẾT NỐI MẠNG (CAPACITOR + BROWSER)
// -------------------------------------------------------------

export async function checkIsOnline(): Promise<boolean> {
  try {
    const status = await Network.getStatus();
    return Boolean(status.connected);
  } catch {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  }
}

export function subscribeToNetworkStatus(
  callback: (isOnline: boolean) => void
): () => void {
  let isSubscribed = true;

  // Lắng nghe qua Capacitor Network
  try {
    Network.addListener("networkStatusChange", (status) => {
      if (isSubscribed) callback(status.connected);
    });
  } catch {}

  // Lắng nghe qua sự kiện chuẩn trình duyệt
  const handleOnline = () => {
    if (isSubscribed) callback(true);
  };
  const handleOffline = () => {
    if (isSubscribed) callback(false);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  return () => {
    isSubscribed = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  };
}

// -------------------------------------------------------------
// 5. BỘ ĐỒNG BỘ NỀN KHI CÓ MẠNG (BACKGROUND SYNC RUNNER)
// -------------------------------------------------------------

export async function processOfflineSyncQueue(
  onProgress?: (synced: number, total: number) => void
): Promise<{ success: boolean; syncedCount: number; errors: any[] }> {
  const isOnline = await checkIsOnline();
  if (!isOnline) {
    return { success: false, syncedCount: 0, errors: ["Thiết bị đang ngoại tuyến"] };
  }

  const queue = await getOfflineQueue();
  if (queue.length === 0) {
    return { success: true, syncedCount: 0, errors: [] };
  }

  let syncedCount = 0;
  const errors: any[] = [];
  const totalItems = queue.length;

  // 1. Phân loại tác vụ: state sync và các tác vụ khác (như todos)
  const stateItems: OfflineSyncItem[] = [];
  const otherItems: OfflineSyncItem[] = [];

  for (const item of queue) {
    if (item.endpoint && item.endpoint.includes("/api/state")) {
      stateItems.push(item);
    } else {
      otherItems.push(item);
    }
  }

  // 2. Xử lý nhóm /api/state: Gộp theo workspace để chỉ đẩy bản mới nhất
  if (stateItems.length > 0) {
    const stateGroups = new Map<string, OfflineSyncItem[]>();
    for (const item of stateItems) {
      try {
        const urlObj = new URL(item.endpoint, "http://dummy");
        const ws = urlObj.searchParams.get("workspace") || "default";
        if (!stateGroups.has(ws)) stateGroups.set(ws, []);
        stateGroups.get(ws)!.push(item);
      } catch {
        if (!stateGroups.has("default")) stateGroups.set("default", []);
        stateGroups.get("default")!.push(item);
      }
    }

    for (const [ws, items] of stateGroups.entries()) {
      // Sắp xếp tăng dần theo createdAt, bản cuối cùng là mới nhất
      items.sort((a, b) => a.createdAt - b.createdAt);
      const latestItem = items[items.length - 1];

      try {
        // Lấy dữ liệu mới nhất từ backup nếu có
        let payloadToSend = latestItem.data;
        const backup = await getOfflineStateBackup(ws);
        if (backup && backup.data) {
          payloadToSend = { ...payloadToSend, ...backup.data };
        }

        const url = resolveApiUrl(latestItem.endpoint);

        // Lấy version hiện tại trên server qua GET trước để tránh xung đột 409
        let currentServerVersion: number | undefined;
        try {
          const checkRes = await fetch(url, { credentials: "include" });
          if (checkRes.ok) {
            const checkData = (await checkRes.json()) as { version?: number };
            if (checkData?.version) currentServerVersion = checkData.version;
          }
        } catch {}

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (currentServerVersion !== undefined && currentServerVersion > 0) {
          headers["x-expected-version"] = String(currentServerVersion);
        } else if (latestItem.expectedVersion !== undefined && latestItem.expectedVersion > 0) {
          headers["x-expected-version"] = String(latestItem.expectedVersion);
        }

        let putRes = await fetch(url, {
          method: "PUT",
          headers,
          credentials: "include",
          body: JSON.stringify(payloadToSend),
        });

        if (putRes.status === 409) {
          // Xung đột phiên bản: lấy version mới nhất từ response và gửi lại
          const resData = (await putRes.json().catch(() => null)) as { currentVersion?: number } | null;
          if (resData?.currentVersion) {
            headers["x-expected-version"] = String(resData.currentVersion);
            putRes = await fetch(url, {
              method: "PUT",
              headers,
              credentials: "include",
              body: JSON.stringify(payloadToSend),
            });
          }
        }

        if (!putRes.ok) {
          throw new Error(`HTTP_${putRes.status}`);
        }

        // Đồng bộ thành công: Xóa TẤT CẢ các item /api/state của workspace này khỏi queue
        for (const it of items) {
          await removeOfflineAction(it.id);
          syncedCount++;
          if (onProgress) onProgress(syncedCount, totalItems);
        }
      } catch (err) {
        console.warn(`Lỗi đồng bộ state workspace ${ws}:`, err);
        for (const it of items) {
          errors.push({ id: it.id, error: err });
        }
      }
    }
  }

  // 3. Xử lý các tác vụ khác (như todos,...)
  for (const item of otherItems) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (item.expectedVersion !== undefined && item.expectedVersion > 0) {
        headers["x-expected-version"] = String(item.expectedVersion);
      }

      const url = resolveApiUrl(item.endpoint);
      let response = await fetch(url, {
        method: item.method || "POST",
        headers,
        credentials: "include",
        body: item.data ? JSON.stringify(item.data) : undefined,
      });

      if (response.status === 409) {
        const resData = (await response.json().catch(() => null)) as { currentVersion?: number } | null;
        if (resData?.currentVersion) {
          headers["x-expected-version"] = String(resData.currentVersion);
          response = await fetch(url, {
            method: item.method || "POST",
            headers,
            credentials: "include",
            body: item.data ? JSON.stringify(item.data) : undefined,
          });
        }
      }

      if (response.status === 404 && item.method === "DELETE") {
        await removeOfflineAction(item.id);
        syncedCount++;
        if (onProgress) onProgress(syncedCount, totalItems);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      await removeOfflineAction(item.id);
      syncedCount++;
      if (onProgress) onProgress(syncedCount, totalItems);
    } catch (err) {
      console.warn(`Lỗi đồng bộ item ${item.id}:`, err);
      errors.push({ id: item.id, error: err });
    }
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors,
  };
}
