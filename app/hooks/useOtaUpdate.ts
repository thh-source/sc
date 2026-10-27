import { useState, useEffect, useCallback } from "react";
import {
  OtaState,
  checkAndDownloadUpdate,
  notifyAppReady,
  reloadApp,
  setupOtaLifecycle,
  initCapacitorFetchProxy,
} from "../utils/otaUpdateService";

export function useOtaUpdate() {
  const [otaState, setOtaState] = useState<OtaState>({
    currentVersion: "1.0.0",
    latestVersion: "1.0.0",
    isChecking: false,
    isDownloading: false,
    downloadProgress: 0,
    updateReady: false,
    message: "",
  });

  const [toastVisible, setToastVisible] = useState(false);

  const checkUpdate = useCallback(async () => {
    return await checkAndDownloadUpdate((patch) => {
      setOtaState((prev) => {
        const next = { ...prev, ...patch };
        if (next.updateReady || next.isDownloading) {
          setToastVisible(true);
        }
        return next;
      });
    });
  }, []);

  const applyAndRestart = useCallback(async () => {
    await reloadApp();
  }, []);

  const dismissToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  useEffect(() => {
    // 1. Kích hoạt fetch proxy cho Capacitor Native
    initCapacitorFetchProxy();

    // 2. Báo cáo app ready để chống rollback
    void notifyAppReady();

    // 3. Kiểm tra bản cập nhật mới sau khi mở app 3 giây
    const timer = setTimeout(() => {
      void checkUpdate();
    }, 3000);

    // 4. Lắng nghe sự kiện resume app từ background
    const cleanupResume = setupOtaLifecycle((newVer) => {
      setToastVisible(true);
    });

    return () => {
      clearTimeout(timer);
      cleanupResume();
    };
  }, [checkUpdate]);

  return {
    otaState,
    toastVisible,
    checkUpdate,
    applyAndRestart,
    dismissToast,
  };
}
