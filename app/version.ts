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
  version: "1.0.1",
  versionName: "Phenikaa SCMH v1.0.1 (Bản chính thức)",
  buildNumber: "20261028.0716",
  buildDate: "28/10/2026, 07:16:40",
  releaseChannel: "Production",
  gitCommit: "d98d398",
  releaseNotes: "Cập nhật tính năng hiển thị phiên bản build, ngày giờ và nút tìm phiên bản mới trong Cài đặt",
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
