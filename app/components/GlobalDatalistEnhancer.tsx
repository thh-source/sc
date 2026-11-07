"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface DatalistOptionItem {
  value: string;
  label: string;
}

function setReactInputValue(input: HTMLInputElement, newValue: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, newValue);
  } else {
    input.value = newValue;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeSearchText(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function migrateInputListAttr(el: Element) {
  if (!(el instanceof HTMLInputElement)) return;
  const listAttr = el.getAttribute("list");
  if (listAttr && listAttr.trim()) {
    el.setAttribute("data-scm-datalist", listAttr.trim());
    el.removeAttribute("list");
    if (!el.getAttribute("autocomplete")) {
      el.setAttribute("autocomplete", "off");
    }
  }
}

function migrateAllInputsInSubtree(root: ParentNode) {
  if (root instanceof HTMLInputElement) {
    migrateInputListAttr(root);
  }
  const inputs = root.querySelectorAll?.("input[list]");
  if (inputs) {
    inputs.forEach((inp) => migrateInputListAttr(inp));
  }
}

function readDatalistOptions(listId: string): DatalistOptionItem[] {
  if (!listId || typeof document === "undefined") return [];
  const datalist = document.getElementById(listId);
  if (!datalist) return [];
  const opts = datalist.querySelectorAll("option");
  const result: DatalistOptionItem[] = [];
  const seen = new Set<string>();
  opts.forEach((opt) => {
    const val = (opt.getAttribute("value") ?? opt.textContent ?? "").trim();
    if (!val || seen.has(val)) return;
    seen.add(val);
    const text = (opt.textContent || "").trim();
    const label =
      opt.getAttribute("label")?.trim() ||
      (text && text !== val ? `${val} — ${text}` : val);
    result.push({ value: val, label });
  });
  return result;
}

export function GlobalDatalistEnhancer() {
  const [mounted, setMounted] = useState(false);
  const [activeInput, setActiveInput] = useState<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<DatalistOptionItem[]>([]);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const [rect, setRect] = useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
    openUpward: boolean;
  } | null>(null);

  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const isOpenRef = useRef(false);
  const hasTypedRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  activeInputRef.current = activeInput;
  isOpenRef.current = isOpen;
  hasTypedRef.current = hasTyped;

  const updatePosition = useCallback((inp: HTMLInputElement | null) => {
    if (!inp || !inp.isConnected) {
      setRect(null);
      return;
    }
    const r = inp.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setRect(null);
      return;
    }
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - r.bottom;
    const spaceAbove = r.top;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    setRect({
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      width: Math.max(r.width, 200),
      openUpward,
    });
  }, []);

  const refreshOptionsForInput = useCallback(
    (inp: HTMLInputElement) => {
      migrateInputListAttr(inp);
      const listId = inp.getAttribute("data-scm-datalist");
      if (!listId) return [];
      const loaded = readDatalistOptions(listId);
      setOptions(loaded);
      setInputValue(inp.value || "");
      updatePosition(inp);
      return loaded;
    },
    [updatePosition]
  );

  useEffect(() => {
    setMounted(true);
    migrateAllInputsInSubtree(document);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.target instanceof HTMLInputElement) {
          migrateInputListAttr(m.target);
        } else if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              migrateAllInputsInSubtree(node);
            }
          });
        }
      }
      if (activeInputRef.current && isOpenRef.current) {
        const listId = activeInputRef.current.getAttribute("data-scm-datalist");
        if (listId) {
          setOptions(readDatalistOptions(listId));
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["list"],
      childList: true,
      subtree: true,
    });

    const handleMouseDownCapture = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (dropdownRef.current && dropdownRef.current.contains(target)) {
        return;
      }

      if (target instanceof HTMLInputElement) {
        migrateInputListAttr(target);
        const listId = target.getAttribute("data-scm-datalist");
        if (listId && !target.readOnly && !target.disabled) {
          const r = target.getBoundingClientRect();
          const clickedChevronZone = e.clientX >= r.right - 30;

          if (activeInputRef.current === target && isOpenRef.current) {
            if (clickedChevronZone) {
              if (hasTypedRef.current) {
                setHasTyped(false);
                setHighlightIndex(-1);
                refreshOptionsForInput(target);
              } else {
                setIsOpen(false);
              }
              return;
            }
            setHasTyped(false);
            refreshOptionsForInput(target);
            return;
          }

          setActiveInput(target);
          setHasTyped(false);
          setHighlightIndex(-1);
          const loaded = refreshOptionsForInput(target);
          if (loaded.length > 0) {
            setIsOpen(true);
          }
          return;
        }
      }

      if (isOpenRef.current) {
        setIsOpen(false);
        setActiveInput(null);
      }
    };

    const handleFocusInCapture = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      migrateInputListAttr(target);
      const listId = target.getAttribute("data-scm-datalist");
      if (!listId || target.readOnly || target.disabled) return;

      setActiveInput(target);
      setHasTyped(false);
      setHighlightIndex(-1);
      const loaded = refreshOptionsForInput(target);
      if (loaded.length > 0) {
        setIsOpen(true);
      }
    };

    const handleInputCapture = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      const listId = target.getAttribute("data-scm-datalist");
      if (!listId || target.readOnly || target.disabled) return;

      setActiveInput(target);
      setInputValue(target.value || "");
      setHasTyped(true);
      setHighlightIndex(-1);
      const loaded = readDatalistOptions(listId);
      setOptions(loaded);
      updatePosition(target);
      if (loaded.length > 0) {
        setIsOpen(true);
      }
    };

    const handleScrollOrResize = (e: Event) => {
      if (
        dropdownRef.current &&
        e.target instanceof Node &&
        dropdownRef.current.contains(e.target)
      ) {
        return;
      }
      if (activeInputRef.current && isOpenRef.current) {
        updatePosition(activeInputRef.current);
      }
    };

    document.addEventListener("mousedown", handleMouseDownCapture, true);
    document.addEventListener("focusin", handleFocusInCapture, true);
    document.addEventListener("input", handleInputCapture, true);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("mousedown", handleMouseDownCapture, true);
      document.removeEventListener("focusin", handleFocusInCapture, true);
      document.removeEventListener("input", handleInputCapture, true);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize, true);
    };
  }, [refreshOptionsForInput, updatePosition]);

  // Split options into primary (matched or all) and secondary (other options when typing)
  const { primaryOptions, otherOptions } = React.useMemo(() => {
    if (!hasTyped || !inputValue.trim()) {
      return { primaryOptions: options, otherOptions: [] as DatalistOptionItem[] };
    }
    const q = normalizeSearchText(inputValue);
    if (!q) {
      return { primaryOptions: options, otherOptions: [] as DatalistOptionItem[] };
    }
    const matched: DatalistOptionItem[] = [];
    const others: DatalistOptionItem[] = [];
    options.forEach((opt) => {
      if (
        normalizeSearchText(opt.value).includes(q) ||
        normalizeSearchText(opt.label).includes(q)
      ) {
        matched.push(opt);
      } else {
        others.push(opt);
      }
    });
    return { primaryOptions: matched, otherOptions: others };
  }, [options, hasTyped, inputValue]);

  const combinedNavOptions = React.useMemo(
    () => [...primaryOptions, ...otherOptions],
    [primaryOptions, otherOptions]
  );

  const handleSelectOption = useCallback((val: string) => {
    const inp = activeInputRef.current;
    if (!inp) return;
    setReactInputValue(inp, val);
    setInputValue(val);
    setHasTyped(false);
    setIsOpen(false);
    setHighlightIndex(-1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inp = activeInputRef.current;
      if (!inp || document.activeElement !== inp) return;

      if (e.key === "ArrowDown") {
        if (!isOpenRef.current) {
          setHasTyped(false);
          refreshOptionsForInput(inp);
          setIsOpen(true);
          setHighlightIndex(0);
          e.preventDefault();
          return;
        }
        if (combinedNavOptions.length > 0) {
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev < combinedNavOptions.length - 1 ? prev + 1 : 0
          );
        }
      } else if (e.key === "ArrowUp") {
        if (isOpenRef.current && combinedNavOptions.length > 0) {
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : combinedNavOptions.length - 1
          );
        }
      } else if (e.key === "Enter") {
        if (
          isOpenRef.current &&
          highlightIndex >= 0 &&
          highlightIndex < combinedNavOptions.length
        ) {
          e.preventDefault();
          e.stopPropagation();
          handleSelectOption(combinedNavOptions[highlightIndex].value);
        } else if (isOpenRef.current) {
          setIsOpen(false);
        }
      } else if (e.key === "Escape" || e.key === "Tab") {
        if (isOpenRef.current) {
          setIsOpen(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [combinedNavOptions, highlightIndex, handleSelectOption, refreshOptionsForInput]);

  if (!mounted) return null;

  const trimmedCurrent = (inputValue || "").trim();

  return (
    <>
      <style>{`
        input[data-scm-datalist]:not([readonly]):not([disabled]) {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
          background-size: 13px 13px;
          padding-right: 26px !important;
        }
      `}</style>
      {isOpen &&
        activeInput &&
        rect &&
        options.length > 0 &&
        createPortal(
          <div
            ref={dropdownRef}
            data-scm-datalist-portal="true"
            onMouseDown={(e) => {
              // Prevent input blur and prevent outside-click handlers from closing modals
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            style={{
              position: "fixed",
              left: `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`,
              top: rect.openUpward ? undefined : `${rect.bottom + 4}px`,
              bottom: rect.openUpward
                ? `${window.innerHeight - rect.top + 4}px`
                : undefined,
              width: `${Math.min(Math.max(rect.width, 210), Math.min(520, window.innerWidth - 16))}px`,
              maxHeight: "260px",
              overflowY: "auto",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              boxShadow:
                "0 12px 28px -4px rgba(15, 23, 42, 0.16), 0 4px 10px -2px rgba(15, 23, 42, 0.08)",
              zIndex: 2147483646,
              padding: "4px",
              fontFamily: "inherit",
            }}
          >
            {primaryOptions.map((opt, idx) => {
              const isSelected =
                trimmedCurrent.toLowerCase() === opt.value.toLowerCase();
              const isHighlighted = idx === highlightIndex;
              return (
                <div
                  key={`pri_${opt.value}_${idx}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectOption(opt.value);
                  }}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    padding: "7px 10px",
                    fontSize: "13px",
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? "#0369a1" : "#1e293b",
                    background: isHighlighted
                      ? "#e0f2fe"
                      : isSelected
                      ? "#f0f9ff"
                      : "transparent",
                    borderRadius: "6px",
                    cursor: "pointer",
                    lineHeight: 1.35,
                    userSelect: "none",
                  }}
                >
                  <span style={{ wordBreak: "break-word" }}>{opt.label}</span>
                  {isSelected && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 800,
                        color: "#0284c7",
                        flexShrink: 0,
                      }}
                    >
                      ✓ Đang chọn
                    </span>
                  )}
                </div>
              );
            })}

            {otherOptions.length > 0 && (
              <>
                <div
                  style={{
                    padding: "5px 10px 3px",
                    marginTop: primaryOptions.length > 0 ? "4px" : 0,
                    borderTop:
                      primaryOptions.length > 0 ? "1px solid #e2e8f0" : "none",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  Tất cả lựa chọn khác ({otherOptions.length})
                </div>
                {otherOptions.map((opt, idx) => {
                  const navIdx = primaryOptions.length + idx;
                  const isHighlighted = navIdx === highlightIndex;
                  return (
                    <div
                      key={`oth_${opt.value}_${idx}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelectOption(opt.value);
                      }}
                      onMouseEnter={() => setHighlightIndex(navIdx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        padding: "7px 10px",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#334155",
                        background: isHighlighted ? "#f1f5f9" : "transparent",
                        borderRadius: "6px",
                        cursor: "pointer",
                        lineHeight: 1.35,
                        userSelect: "none",
                      }}
                    >
                      <span style={{ wordBreak: "break-word" }}>
                        {opt.label}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
