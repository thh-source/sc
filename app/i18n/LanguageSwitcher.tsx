"use client";

import React from "react";
import { useTranslation, SupportedLang } from "./I18nContext";

export interface LanguageSwitcherProps {
  className?: string;
  variant?: "select" | "pills" | "compact";
}

export function LanguageSwitcher({
  className = "",
  variant = "compact",
}: LanguageSwitcherProps) {
  const { lang, setLang, supportedLangs } = useTranslation();

  if (variant === "pills") {
    return (
      <div
        className={`lang-switcher-pills ${className}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: "rgba(255, 255, 255, 0.08)",
          padding: "3px",
          borderRadius: "6px",
        }}
      >
        {supportedLangs.map((item) => {
          const isActive = item.code === lang;
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => setLang(item.code)}
              style={{
                border: "none",
                background: isActive ? "#2563eb" : "transparent",
                color: isActive ? "#ffffff" : "#cbd5e1",
                padding: "3px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s ease",
              }}
              title={item.label}
            >
              <span>{item.flag}</span>
              <span>{item.code.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Compact / Select Variant
  return (
    <div
      className={`lang-switcher-wrapper ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
      }}
    >
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as SupportedLang)}
        aria-label="Select Language"
        style={{
          height: "32px",
          padding: "0 24px 0 10px",
          fontSize: "12px",
          fontWeight: 600,
          color: "inherit",
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "6px",
          cursor: "pointer",
          appearance: "none",
          WebkitAppearance: "none",
          outline: "none",
        }}
      >
        {supportedLangs.map((item) => (
          <option key={item.code} value={item.code} style={{ color: "#0f172a", background: "#ffffff" }}>
            {item.flag} {item.label}
          </option>
        ))}
      </select>
      <span
        style={{
          position: "absolute",
          right: "8px",
          pointerEvents: "none",
          fontSize: "9px",
          opacity: 0.7,
        }}
      >
        ▼
      </span>
    </div>
  );
}
