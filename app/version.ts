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
  buildNumber: "20261028.0822",
  buildDate: "28/10/2026, 08:22:40",
  releaseChannel: "Production",
  gitCommit: "dfa78f2",
  releaseNotes: "Bổ sung tùy chọn Tổng tiền chưa có VAT hoặc có VAT trong Đề nghị phê duyệt",
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
