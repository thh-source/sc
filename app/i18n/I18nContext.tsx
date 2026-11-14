"use client";

import React, { createContext, useContext, useMemo, ReactNode } from "react";
import viDict from "../locales/vi/common.json";

export type SupportedLang = "vi";

function getNestedTranslation(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export interface I18nContextValue {
  lang: SupportedLang;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const translateVi = (key: string, params?: Record<string, string | number>): string => {
  let text = getNestedTranslation(viDict, key) || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
};

const I18nContext = createContext<I18nContextValue>({
  lang: "vi",
  t: translateVi,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo<I18nContextValue>(
    () => ({
      lang: "vi",
      t: translateVi,
    }),
    []
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}

export const useI18n = useTranslation;
