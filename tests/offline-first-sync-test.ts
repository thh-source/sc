import assert from "assert";

// Mock môi trường browser / capacitor nếu chạy trong Node.js
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = globalThis;
}

// In-memory IndexedDB mock cho kiểm thử
const memoryStores: Record<string, Map<string, any>> = {
  offline_sync_queue: new Map(),
  form_drafts: new Map(),
  offline_state_backup: new Map(),
};

(globalThis as any).localStorage = {
  _storage: new Map<string, string>(),
  getItem(key: string) {
    return this._storage.get(key) || null;
  },
  setItem(key: string, val: string) {
    this._storage.set(key, val);
  },
  removeItem(key: string) {
    this._storage.delete(key);
  },
  clear() {
    this._storage.clear();
  },
};

let mockOnline = true;
try {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      get onLine() {
        return mockOnline;
      },
    },
    configurable: true,
    writable: true,
  });
} catch {
  (globalThis.navigator as any).onLine = true;
}

let eventListeners: Record<string, Function[]> = {};
(globalThis as any).window.addEventListener = (ev: string, fn: Function) => {
  if (!eventListeners[ev]) eventListeners[ev] = [];
  eventListeners[ev].push(fn);
};
(globalThis as any).window.removeEventListener = (ev: string, fn: Function) => {
  if (eventListeners[ev]) {
    eventListeners[ev] = eventListeners[ev].filter((f) => f !== fn);
  }
};
(globalThis as any).window.dispatchEvent = (event: any) => {
  const fns = eventListeners[event.type] || [];
  fns.forEach((fn) => fn(event));
  return true;
};
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, opts?: any) {
    this.type = type;
    this.detail = opts?.detail;
  }
};

import {
  enqueueOfflineAction,
  getOfflineQueue,
  removeOfflineAction,
  clearOfflineQueue,
  saveFormDraft,
  getFormDraft,
  clearFormDraft,
  saveOfflineStateBackup,
  getOfflineStateBackup,
  checkIsOnline,
  processOfflineSyncQueue,
  OfflineSyncItem,
} from "../app/utils/offlineSync";

async function runOfflineFirstTests() {
  console.log("==========================================================");
  console.log("🚀 BẮT ĐẦU KIỂM THỬ TÍNH NĂNG OFFLINE-FIRST & AUTO-SYNC D1");
  console.log("==========================================================");

  // -----------------------------------------------------------------
  // TEST 1: KIỂM TRA PHÁT HIỆN TRẠNG THÁI MẠNG (ONLINE / OFFLINE)
  // -----------------------------------------------------------------
  console.log("\n[TEST 1] Kiểm tra phát hiện trạng thái mạng...");
  mockOnline = true;
  let onlineStatus = await checkIsOnline();
  assert.strictEqual(onlineStatus, true, "Hệ thống phải nhận diện được trạng thái Online");

  mockOnline = false;
  onlineStatus = await checkIsOnline();
  assert.strictEqual(onlineStatus, false, "Hệ thống phải nhận diện được trạng thái Offline");
  console.log("✅ TEST 1 PASSED: Nhận diện chính xác Online và Offline.");

  // -----------------------------------------------------------------
  // TEST 2: LƯU TẠM OFFLINE SYNC QUEUE KHI MẤT MẠNG
  // -----------------------------------------------------------------
  console.log("\n[TEST 2] Thử nghiệm tạo thao tác khi đang mất mạng (Offline)...");
  await clearOfflineQueue();

  const offlineAction1 = await enqueueOfflineAction({
    endpoint: "/api/state?workspace=phenikaa",
    method: "PUT",
    data: {
      prs: [{ id: 101, number: "PR-2026-0001", purpose: "Mua thiết bị phòng sạch thí nghiệm" }],
    },
    expectedVersion: 10,
    description: "Tạo PR mới khi offline",
  });

  const offlineAction2 = await enqueueOfflineAction({
    endpoint: "/api/state?workspace=phenikaa",
    method: "PUT",
    data: {
      pos: [{ id: 201, number: "PO-2026-0001", status: "Đã giao hàng" }],
    },
    expectedVersion: 10,
    description: "Cập nhật trạng thái PO khi offline",
  });

  const queue = await getOfflineQueue();
  assert.strictEqual(queue.length, 2, "Hàng đợi phải chứa đúng 2 tác vụ");
  assert.strictEqual(queue[0].description, "Tạo PR mới khi offline");
  assert.strictEqual(queue[1].description, "Cập nhật trạng thái PO khi offline");
  assert.strictEqual(queue[0].status, "pending");
  console.log(`✅ TEST 2 PASSED: Đã lưu ${queue.length} tác vụ vào offline_sync_queue an toàn.`);

  // -----------------------------------------------------------------
  // TEST 3: TỰ ĐỘNG LƯU BẢN NHÁP FORM (FORM DRAFT AUTO-SAVE)
  // -----------------------------------------------------------------
  console.log("\n[TEST 3] Kiểm thử tự động lưu & khôi phục bản nháp Form (PR Draft)...");
  const samplePRDraft = {
    number: "PR-2026-0099",
    date: "2026-10-27",
    department: "Phòng R&D Công nghệ Nano",
    purpose: "Mua hóa chất tinh khiết phân tích quang phổ",
    note: "Ưu tiên giao gấp trước ngày 30",
    items: [
      { id: 1, code: "HC-001", name: "Dung môi Acetonitrile HPLC", qty: 5, estimate: 650000 },
    ],
  };

  await saveFormDraft("pr_draft_form", samplePRDraft, "Bản nháp PR-2026-0099");
  const restoredDraft = await getFormDraft<typeof samplePRDraft>("pr_draft_form");
  assert.ok(restoredDraft, "Bản nháp phải tồn tại sau khi lưu");
  assert.strictEqual(restoredDraft.data.department, "Phòng R&D Công nghệ Nano");
  assert.strictEqual(restoredDraft.data.items[0].code, "HC-001");

  await clearFormDraft("pr_draft_form");
  const emptyDraft = await getFormDraft("pr_draft_form");
  assert.strictEqual(emptyDraft, null, "Bản nháp phải bị xóa sạch sau khi Submit thành công");
  console.log("✅ TEST 3 PASSED: Lưu bản nháp Form, khôi phục và dọn dẹp sau lưu hoạt động hoàn hảo.");

  // -----------------------------------------------------------------
  // TEST 4: SAO LƯU STATE TOÀN BỘ WORKSPACE (OFFLINE STATE BACKUP)
  // -----------------------------------------------------------------
  console.log("\n[TEST 4] Kiểm thử sao lưu Offline State Backup...");
  const workspaceState = {
    prs: [{ id: 1, number: "PR-2026-0001" }],
    pos: [{ id: 1, number: "PO-2026-0001" }],
  };
  await saveOfflineStateBackup("phenikaa-test", workspaceState, 15);
  const backup = await getOfflineStateBackup("phenikaa-test");
  assert.ok(backup, "State backup phải tồn tại");
  assert.strictEqual(backup.version, 15);
  assert.strictEqual(backup.data.prs.length, 1);
  console.log("✅ TEST 4 PASSED: Sao lưu trạng thái toàn bộ ứng dụng sang offline backup thành công.");

  // -----------------------------------------------------------------
  // TEST 5: TỰ ĐỘNG ĐỒNG BỘ LÊN CLOUDFLARE D1 KHI CÓ MẠNG TRỞ LẠI
  // -----------------------------------------------------------------
  console.log("\n[TEST 5] Kiểm thử tự động Re-sync khi có mạng trở lại...");

  // Mock Fetch API
  const syncedRequests: Array<{ url: string; method: string; body: any; headers: any }> = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    syncedRequests.push({
      url,
      method: init?.method,
      body: init?.body ? JSON.parse(init.body) : null,
      headers: init?.headers,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, version: 11 }),
    };
  };

  // Trường hợp 5.1: Thiết bị vẫn Offline -> processOfflineSyncQueue không gửi và giữ nguyên hàng đợi
  mockOnline = false;
  const offlineResult = await processOfflineSyncQueue();
  assert.strictEqual(offlineResult.success, false, "Offline không được gửi request");
  const queueStillThere = await getOfflineQueue();
  assert.strictEqual(queueStillThere.length, 2, "Hàng đợi phải được bảo toàn khi chưa có mạng");

  // Trường hợp 5.2: Bật mạng trở lại (Online) -> Tự động re-sync toàn bộ FIFO lên Cloudflare D1
  mockOnline = true;
  let progressCount = 0;
  const onlineResult = await processOfflineSyncQueue((synced, total) => {
    progressCount = synced;
  });

  assert.strictEqual(onlineResult.success, true, "Đồng bộ phải thành công khi có mạng");
  assert.strictEqual(onlineResult.syncedCount, 2, "Phải đồng bộ đúng 2 tác vụ");
  assert.strictEqual(syncedRequests.length, 2, "Đã gửi 2 request lên server");
  assert.strictEqual(syncedRequests[0].url, "/api/state?workspace=phenikaa");
  assert.strictEqual(syncedRequests[0].headers["x-expected-version"], "10");

  const queueAfterSync = await getOfflineQueue();
  assert.strictEqual(queueAfterSync.length, 0, "Hàng đợi phải trống sau khi đồng bộ thành công");
  console.log("✅ TEST 5 PASSED: Re-sync FIFO thành công, gửi đúng payload và dọn sạch hàng đợi.");

  console.log("\n==========================================================");
  console.log("🎉 TẤT CẢ 5/5 KIỂM THỬ OFFLINE-FIRST ĐÃ ĐẠT 100%!");
  console.log("==========================================================");
}

runOfflineFirstTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
