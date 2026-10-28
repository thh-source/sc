import { Capacitor } from "@capacitor/core";

export interface AppVersionMetadata {
  appName: string;
  version: string;
  versionName: string;
  buildNumber: string;
  buildDate: string;
  releaseChannel: string;
  gitCommit?: string;
  releaseNotes: string;
}

export const CURRENT_APP_VERSION: AppVersionMetadata = {
  appName: "Phenikaa Mua Hàng (SCMH)",
  version: "1.0.2",
  versionName: "Phenikaa SCMH v1.0.2 (Bản chính thức)",
  buildNumber: "20261028.1036",
  buildDate: "28/10/2026, 10:36:47",
  releaseChannel: "Production",
  gitCommit: "570d173",
  releaseNotes: "Thống kê từng đợt bàn giao trong PO và cho phép chỉnh sửa lại số lượng bàn giao",
};

export function getAppPlatform(): {
  isNative: boolean;
  platformName: string;
  platformBadge: string;
} {
  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
  return {
    isNative,
    platformName: isNative ? "Android Native App (Capacitor)" : "Web Application (Trình duyệt)",
    platformBadge: isNative ? "Android APK" : "Web PWA",
  };
}
