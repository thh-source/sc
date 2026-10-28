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
  version: "1.0.5",
  versionName: "Phenikaa SCMH v1.0.5 (Bản chính thức)",
  buildNumber: "20261028.1403",
  buildDate: "28/10/2026, 14:03:24",
  releaseChannel: "Production",
  gitCommit: "0704ec1",
  releaseNotes: "Chuan hoa lap DNPD: Khong tu sinh so PR, tim kiem chon NCC, ten viet tat o bang so sanh va ten day du o muc de xuat",
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
