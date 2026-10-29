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
  version: "1.0.8",
  versionName: "Phenikaa SCMH v1.0.8 (Bản chính thức)",
  buildNumber: "20261029.2009",
  buildDate: "29/10/2026, 20:09:47",
  releaseChannel: "Production",
  gitCommit: "79c7878",
  releaseNotes: "Cập nhật tối ưu hóa ứng dụng, hỗ trợ OTA và sửa lỗi đồng bộ",
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
