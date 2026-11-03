import { Capacitor } from "@capacitor/core";

export const REMOTE_API_BASE = "https://pnk.sc-pnk.workers.dev";

export function isNativeMobile(): boolean {
  if (typeof window === "undefined") return false;
  return (
    Capacitor.isNativePlatform() ||
    window.location.hostname === "localhost" ||
    window.location.protocol === "file:" ||
    window.location.protocol === "capacitor:"
  );
}

export function resolveApiUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = isNativeMobile() ? REMOTE_API_BASE : "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(path);
  return fetch(url, init);
}
