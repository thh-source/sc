/**
 * Kênh giao tiếp đa tab thời gian thực (Inter-Tab Realtime Synchronization)
 * Sử dụng BroadcastChannel API chuẩn với localStorage fallback
 * Giúp ngăn chặn ghi đè dữ liệu (Data Clobbering) và giữ state nhất quán giữa các tab
 */

export const CURRENT_TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `tab_${crypto.randomUUID()}`
    : `tab_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;

export type TabSyncMessage =
  | {
      type: "STATE_SAVED";
      senderTabId: string;
      workspaceId: string;
      version: number;
      timestamp: number;
      diff?: Record<string, any>;
    }
  | {
      type: "PO_CREATED";
      senderTabId: string;
      workspaceId: string;
      poNumber: string;
      poId: number;
      approvalId?: number;
    }
  | {
      type: "PO_NUMBER_RENAMED";
      senderTabId: string;
      workspaceId: string;
      oldNumber: string;
      newNumber: string;
      poId: number;
    }
  | {
      type: "TRASH_UPDATED";
      senderTabId: string;
      workspaceId: string;
      trashCount: number;
    };

const CHANNEL_NAME = "scmh_workspace_sync_channel";
const STORAGE_KEY = "scmh_tab_sync_message";

type SyncListener = (msg: TabSyncMessage) => void;
const listeners = new Set<SyncListener>();

let broadcastChannel: BroadcastChannel | null = null;

// Khởi tạo BroadcastChannel nếu trình duyệt hỗ trợ
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event: MessageEvent<TabSyncMessage>) => {
      const data = event.data;
      if (!data || data.senderTabId === CURRENT_TAB_ID) return;
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (err) {
          console.warn("[TabSync] Listener error:", err);
        }
      });
    };
  } catch (e) {
    console.warn("[TabSync] Could not create BroadcastChannel, falling back to storage events:", e);
    broadcastChannel = null;
  }
}

// Lắng nghe sự kiện storage (fallback cho trình duyệt cũ hoặc khi BroadcastChannel không khả dụng)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const data = JSON.parse(event.newValue) as TabSyncMessage;
      if (!data || data.senderTabId === CURRENT_TAB_ID) return;
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (err) {
          console.warn("[TabSync] Storage listener error:", err);
        }
      });
    } catch {}
  });
}

/**
 * Gửi thông điệp đồng bộ tới tất cả các tab khác cùng mở workspace này
 */
export function broadcastTabMessage(message: Omit<TabSyncMessage, "senderTabId" | "timestamp">): void {
  const fullMessage: TabSyncMessage = {
    ...message,
    senderTabId: CURRENT_TAB_ID,
    timestamp: Date.now(),
  } as TabSyncMessage;

  // 1. Gửi qua BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(fullMessage);
    } catch (e) {
      console.warn("[TabSync] postMessage error:", e);
    }
  }

  // 2. Gửi qua localStorage làm kênh phụ song song
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      // Đính kèm random nonce để luôn kích hoạt sự kiện storage ngay cả khi payload giống nhau
      const storagePayload = JSON.stringify({
        ...fullMessage,
        _nonce: Math.random(),
      });
      window.localStorage.setItem(STORAGE_KEY, storagePayload);
    } catch {}
  }
}

/**
 * Đăng ký nhận thông điệp đồng bộ từ các tab khác
 */
export function subscribeTabSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
