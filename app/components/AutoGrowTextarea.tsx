import React, { useLayoutEffect, useRef } from "react";

export interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  style?: React.CSSProperties;
  rows?: number;
  readOnly?: boolean;
  disabled?: boolean;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
}

export function AutoGrowTextarea({
  value,
  onChange,
  className = "",
  placeholder = "",
  title,
  style,
  rows = 1,
  readOnly,
  disabled,
  onBlur,
  onFocus,
  onKeyDown,
  onPaste,
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (
      typeof CSS !== "undefined" &&
      CSS.supports("field-sizing", "content")
    ) {
      element.style.height = "auto";
      return;
    }
    let frame = 0;
    const grow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.height = "0px";
        element.style.height = `${Math.max(28, element.scrollHeight + 2)}px`;
      });
    };
    grow();
    const observer = new ResizeObserver(grow);
    observer.observe(element.parentElement || element);
    window.addEventListener("resize", grow);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", grow);
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={rows}
      title={title}
      className={`smart-cell-textarea ${className}`}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      style={style}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
