import { useState, useEffect, useCallback, useRef } from "react";
import {
  checkIsOnline,
  subscribeToNetworkStatus,
  getOfflineQueue,
  processOfflineSyncQueue,
  OfflineSyncItem,
} from "../utils/offlineSync";

export interface UseOfflineSyncReturn {
  isOnline: boolean;
  isSyncing: boolean;
  queueCount: number;
  lastSyncStatus: "idle" | "syncing" | "success" | "error";
  syncMessage: string;
  triggerSync: () => Promise<void>;
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [lastSyncStatus, setLastSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState<string>("");
  const prevOnlineRef = useRef<boolean>(true);
  const successTimerRef = useRef<any>(null);

  // Cập nhật số lượng items trong hàng đợi
  const refreshQueueCount = useCallback(async () => {
    try {
      const queue = await getOfflineQueue();
      setQueueCount(queue.length);
      return queue.length;
    } catch {
      return 0;
    }
  }, []);

  // Xử lý chạy đồng bộ hàng đợi
  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    const online = await checkIsOnline();
    if (!online) {
      setSyncMessage("⚠️ Thiết bị chưa có kết nối mạng");
      return;
    }

    const currentQueue = await getOfflineQueue();
    if (currentQueue.length === 0) {
      setQueueCount(0);
      return;
    }

    setIsSyncing(true);
    setLastSyncStatus("syncing");
    setSyncMessage(`🔄 Đang tự động đồng bộ ${currentQueue.length} tác vụ lên hệ thống...`);

    try {
      const result = await processOfflineSyncQueue((synced, total) => {
        setSyncMessage(`🔄 Đang đồng bộ: ${synced}/${total} tác vụ...`);
      });

      await refreshQueueCount();

      if (result.success) {
        setLastSyncStatus("success");
        setSyncMessage(`✅ Đồng bộ thành công! (Đã lưu ${result.syncedCount} tác vụ lên D1)`);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          setLastSyncStatus("idle");
          setSyncMessage("");
        }, 4000);
      } else {
        setLastSyncStatus("error");
        setSyncMessage(`⚠️ Đã đồng bộ ${result.syncedCount} tác vụ, còn lỗi ${result.errors.length} tác vụ`);
      }
    } catch (err: any) {
      setLastSyncStatus("error");
      setSyncMessage(`⚠️ Lỗi khi đồng bộ: ${err.message || "Không xác định"}`);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshQueueCount]);

  // Khởi tạo và lắng nghe trạng thái mạng
  useEffect(() => {
    let mounted = true;

    // Check trạng thái ban đầu
    checkIsOnline().then((online) => {
      if (!mounted) return;
      setIsOnline(online);
      prevOnlineRef.current = online;
      if (!online) {
        setLastSyncStatus("idle");
        setSyncMessage("⚠️ Đang mất kết nối mạng - Đã bật chế độ tự lưu Offline an toàn");
      }
    });

    refreshQueueCount();

    // Lắng nghe thay đổi kết nối mạng
    const unsubscribeNetwork = subscribeToNetworkStatus(async (online) => {
      if (!mounted) return;
      const wasOffline = !prevOnlineRef.current;
      setIsOnline(online);
      prevOnlineRef.current = online;

      if (!online) {
        setLastSyncStatus("idle");
        setSyncMessage("⚠️ Đang mất kết nối mạng - Đã bật chế độ tự lưu Offline an toàn");
      } else if (wasOffline && online) {
        // Vừa kết nối lại: Tự động kích hoạt đồng bộ
        setLastSyncStatus("syncing");
        setSyncMessage("🔄 Đã kết nối lại - Đang tự động đồng bộ dữ liệu lên hệ thống...");
        setTimeout(() => {
          if (mounted) void triggerSync();
        }, 500);
      }
    });

    // Lắng nghe sự kiện hàng đợi thay đổi
    const handleQueueChange = () => {
      if (mounted) void refreshQueueCount();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("scm_offline_queue_changed", handleQueueChange);
    }

    return () => {
      mounted = false;
      unsubscribeNetwork();
      if (typeof window !== "undefined") {
        window.removeEventListener("scm_offline_queue_changed", handleQueueChange);
      }
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [refreshQueueCount, triggerSync]);

  return {
    isOnline,
    isSyncing,
    queueCount,
    lastSyncStatus,
    syncMessage,
    triggerSync,
  };
}
