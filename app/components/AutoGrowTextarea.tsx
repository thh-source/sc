import React, { useLayoutEffect, useRef } from "react";

export function AutoGrowTextarea({
  value,
  onChange,
  className = "",
  placeholder = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
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
        element.style.height = `${Math.max(32, element.scrollHeight + 2)}px`;
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
      rows={1}
      className={`smart-cell-textarea ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
