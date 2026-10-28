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
  version: "1.0.3",
  versionName: "Phenikaa SCMH v1.0.3 (Bản chính thức)",
  buildNumber: "20261028.1054",
  buildDate: "28/10/2026, 10:54:11",
  releaseChannel: "Production",
  gitCommit: "7e3fca5",
  releaseNotes: "Bo sung chuc nang Huy/Xoa dot giao hang an nham va dong bo toan bo lich su giao hang",
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
