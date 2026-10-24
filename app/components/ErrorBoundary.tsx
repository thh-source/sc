"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an uncaught render error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section className="content" style={{ padding: "40px 20px" }}>
          <div
            style={{
              maxWidth: "680px",
              margin: "40px auto",
              padding: "32px",
              background: "#ffffff",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)",
              textAlign: "center",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <div style={{ fontSize: "44px", marginBottom: "14px" }}>⚠️</div>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#991b1b", margin: "0 0 8px" }}>
              {this.props.fallbackTitle || "Đã xảy ra sự cố giao diện khi hiển thị mục này"}
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 24px", lineHeight: 1.5 }}>
              Hệ thống đã tự động khoanh vùng lỗi để không làm gián đoạn toàn bộ website và đảm bảo dữ liệu của bạn không bị mất.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginBottom: "20px" }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: "9px 20px",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                ↺ Thử lại mục này
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "";
                  window.location.reload();
                }}
                style={{
                  padding: "9px 20px",
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                🏠 Tải lại toàn trang
              </button>
            </div>
            {this.state.error && (
              <details
                style={{
                  textAlign: "left",
                  background: "#fef2f2",
                  padding: "12px 14px",
                  borderRadius: "6px",
                  border: "1px solid #fee2e2",
                  fontSize: "12px",
                  color: "#b91c1c",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Chi tiết lỗi kỹ thuật</summary>
                <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
