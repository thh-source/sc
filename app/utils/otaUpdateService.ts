import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { App } from "@capacitor/app";
import { CURRENT_APP_VERSION } from "../version";

export const REMOTE_API_BASE = "https://quan-ly-mua-hang.sc-pnk.workers.dev";

export interface AppVersionInfo {
  latestVersion: string;
  versionName?: string;
  buildNumber?: string;
  buildDate?: string;
  minSupportedVersion?: string;
  downloadUrl: string;
  checksum?: string;
  releaseNotes?: string;
  updatedAt?: string;
}

export interface OtaState {
  currentVersion: string;
  latestVersion: string;
  versionName?: string;
  buildNumber?: string;
  buildDate?: string;
  releaseNotes?: string;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  updateReady: boolean;
  message: string;
  error?: string;
}

/**
 * Lấy metadata phiên bản mới nhất từ Cloudflare Worker & D1
 */
export async function fetchRemoteVersion(): Promise<AppVersionInfo> {
  const apiUrl = `${REMOTE_API_BASE}/api/app-version`;
  const res = await fetch(apiUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AppVersionInfo;
}

/**
 * Lấy phiên bản đang chạy hiện tại trên máy
 */
export async function getInstalledVersion(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return CURRENT_APP_VERSION.version;
  }
  try {
    const current = await CapacitorUpdater.current();
    if (current && (current as any).bundle?.version) {
      return (current as any).bundle.version;
    }
    if (current && (current as any).version) {
      return (current as any).version;
    }
  } catch {}
  return CURRENT_APP_VERSION.version;
}

/**
 * So sánh 2 chuỗi phiên bản semver (vd: "1.0.1" > "1.0.0")
 */
export function isNewerVersion(remoteVer: string, currentVer: string): boolean {
  if (!remoteVer || !currentVer) return false;
  const cleanRemote = remoteVer.replace(/^v/i, "").trim();
  const cleanCurrent = currentVer.replace(/^v/i, "").trim();
  if (cleanRemote === cleanCurrent) return false;

  const rParts = cleanRemote.split(".").map((x) => parseInt(x, 10) || 0);
  const cParts = cleanCurrent.split(".").map((x) => parseInt(x, 10) || 0);

  for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
    const r = rParts[i] || 0;
    const c = cParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

/**
 * Patch fetch toàn cục cho môi trường Capacitor Native
 * Tự động trỏ các endpoint tương đối "/api/..." về Cloudflare Worker
 */
export function initCapacitorFetchProxy(): void {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    const origFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === "string" && input.startsWith("/api/")) {
        return origFetch(`${REMOTE_API_BASE}${input}`, init);
      }
      return origFetch(input, init);
    };
  }
}

/**
 * Báo cáo app đã tải thành công để Capgo không bị rollback
 */
export async function notifyAppReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
    console.log("✓ Capgo notifyAppReady thành công!");
  } catch (err) {
    console.warn("notifyAppReady warning:", err);
  }
}

/**
 * Khởi động lại ứng dụng để kích hoạt phiên bản mới ngay lập tức
 */
export async function reloadApp(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.location.reload();
    return;
  }
  try {
    await CapacitorUpdater.reload();
  } catch {
    window.location.reload();
  }
}

/**
 * Kiểm tra phiên bản mới từ Cloudflare R2 / Worker API và tự động tải ngầm
 */
export async function checkAndDownloadUpdate(
  onStateChange?: (state: Partial<OtaState>) => void
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    onStateChange?.({ isChecking: true, message: "Đang kiểm tra bản cập nhật mới..." });

    // 1. Lấy phiên bản cục bộ hiện tại từ plugin
    let currentVersion = "1.0.0";
    try {
      const current = await CapacitorUpdater.current();
      if (current && (current as any).bundle?.version) {
        currentVersion = (current as any).bundle.version;
      } else if (current && (current as any).version) {
        currentVersion = (current as any).version;
      }
    } catch {
      currentVersion = "1.0.0";
    }

    onStateChange?.({ currentVersion });

    // 2. Gọi API lấy metadata phiên bản mới nhất từ Cloudflare
    const apiUrl = `${REMOTE_API_BASE}/api/app-version`;
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const versionInfo = (await res.json()) as AppVersionInfo;
    const latestVersion = versionInfo.latestVersion || "1.0.0";

    onStateChange?.({ latestVersion });

    // 3. So sánh nếu máy chủ có bản mới hơn
    const hasUpdate = isNewerVersion(latestVersion, currentVersion);
    if (!hasUpdate) {
      onStateChange?.({
        isChecking: false,
        message: `Đang chạy phiên bản mới nhất (v${currentVersion})`,
      });
      return false;
    }

    // 4. Bắt đầu tải ngầm gói bundle ZIP từ Cloudflare R2
    onStateChange?.({
      isChecking: false,
      isDownloading: true,
      message: `Đang tải bản cập nhật v${latestVersion} ngầm...`,
    });

    const downloadUrl =
      versionInfo.downloadUrl.startsWith("http")
        ? versionInfo.downloadUrl
        : `${REMOTE_API_BASE}${versionInfo.downloadUrl}`;

    console.log(`[OTA] Đang tải bundle từ ${downloadUrl}...`);

    const versionData = await CapacitorUpdater.download({
      url: downloadUrl,
      version: latestVersion,
    });

    // 5. Giải nén và đặt làm phiên bản active cho lần mở tiếp theo
    await CapacitorUpdater.set(versionData);

    onStateChange?.({
      isDownloading: false,
      updateReady: true,
      message: `Đã sẵn sàng phiên bản v${latestVersion}! Ứng dụng sẽ áp dụng trong lần mở tiếp theo.`,
    });

    return true;
  } catch (err: any) {
    console.warn("[OTA] Lỗi kiểm tra / tải bản cập nhật:", err);
    onStateChange?.({
      isChecking: false,
      isDownloading: false,
      error: err.message || "Lỗi cập nhật",
    });
    return false;
  }
}

/**
 * Tải và kích hoạt gói bundle cập nhật trực tiếp (dùng khi bấm "Tải và cập nhật ngay" trong Cài đặt)
 */
export async function downloadAndApplyOta(
  versionInfo: AppVersionInfo,
  onStateChange?: (state: Partial<OtaState>) => void
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    window.location.reload();
    return true;
  }

  try {
    const latestVersion = versionInfo.latestVersion;
    onStateChange?.({
      isDownloading: true,
      message: `Đang tải gói cập nhật v${latestVersion} từ Cloudflare R2...`,
    });

    const downloadUrl = versionInfo.downloadUrl.startsWith("http")
      ? versionInfo.downloadUrl
      : `${REMOTE_API_BASE}${versionInfo.downloadUrl}`;

    console.log(`[OTA Manual] Đang tải bundle từ ${downloadUrl}...`);

    const versionData = await CapacitorUpdater.download({
      url: downloadUrl,
      version: latestVersion,
    });

    await CapacitorUpdater.set(versionData);

    onStateChange?.({
      isDownloading: false,
      updateReady: true,
      message: `Đã cài đặt thành công bản cập nhật v${latestVersion}! Khởi động lại ứng dụng để áp dụng ngay.`,
    });

    return true;
  } catch (err: any) {
    console.error("[OTA Manual] Lỗi tải bundle:", err);
    onStateChange?.({
      isDownloading: false,
      error: err.message || "Không thể tải gói cập nhật",
    });
    return false;
  }
}

/**
 * Đăng ký lắng nghe sự kiện App Resume (khi người dùng mở lại app từ background)
 */
export function setupOtaLifecycle(
  onUpdateReady?: (version: string) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  // Lắng nghe khi app trở lại foreground
  const appListener = App.addListener("appStateChange", (state) => {
    if (state.isActive) {
      void checkAndDownloadUpdate((s) => {
        if (s.updateReady && s.latestVersion) {
          onUpdateReady?.(s.latestVersion);
        }
      });
    }
  });

  return () => {
    appListener.then((handler) => handler.remove());
  };
}
