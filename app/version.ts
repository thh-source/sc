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
  version: "1.0.4",
  versionName: "Phenikaa SCMH v1.0.4 (Bản chính thức)",
  buildNumber: "20261028.1132",
  buildDate: "28/10/2026, 11:32:24",
  releaseChannel: "Production",
  gitCommit: "9099942",
  releaseNotes: "Dong bo thu tu mat hang tren Bien ban ban giao trung khop 100% thu tu trong PO goc",
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
