"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import viDict from "../locales/vi/common.json";
import enDict from "../locales/en/common.json";
import zhDict from "../locales/zh/common.json";

export type SupportedLang = "vi" | "en" | "zh";

export interface LangOption {
  code: SupportedLang;
  label: string;
  flag: string;
}

export const SUPPORTED_LANGS: LangOption[] = [
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "zh", label: "简体中文", flag: "🇨🇳" },
];

const dictionaries: Record<SupportedLang, Record<string, any>> = {
  vi: viDict,
  en: enDict,
  zh: zhDict,
};

function getNestedTranslation(obj: any, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in cur) {
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export interface I18nContextValue {
  lang: SupportedLang;
  setLang: (lang: SupportedLang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  supportedLangs: LangOption[];
}

const I18nContext = createContext<I18nContextValue>({
  lang: "vi",
  setLang: () => {},
  t: (key: string) => key,
  supportedLangs: SUPPORTED_LANGS,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<SupportedLang>("vi");

  // Read stored language from localStorage on client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("scmh_lang") as SupportedLang;
      if (saved && (saved === "vi" || saved === "en" || saved === "zh")) {
        setLangState(saved);
        document.documentElement.lang = saved;
      } else {
        document.documentElement.lang = "vi";
      }
    } catch {
      // Ignore localStorage exceptions in private browsing or iframe
    }
  }, []);

  const setLang = (nextLang: SupportedLang) => {
    setLangState(nextLang);
    try {
      localStorage.setItem("scmh_lang", nextLang);
      document.documentElement.lang = nextLang;
    } catch {
      // Ignore
    }
  };

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>): string => {
      // 1. Try current language
      let text = getNestedTranslation(dictionaries[lang], key);

      // 2. Safe Fallback to Vietnamese
      if (!text && lang !== "vi") {
        text = getNestedTranslation(dictionaries.vi, key);
      }

      // 3. Fallback to key itself if not found
      if (!text) {
        text = key;
      }

      // 4. Interpolate params if provided: {param}
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }

      return text;
    };
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      supportedLangs: SUPPORTED_LANGS,
    }),
    [lang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}

export const useI18n = useTranslation;
