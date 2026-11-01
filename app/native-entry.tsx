import React, { Component, ErrorInfo, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import ProcurementApp from "./ProcurementApp";
import "./globals.css";
import "./mobile.css";

// Proxy Fetch cho môi trường Capacitor Native (gọi API Cloudflare Worker)
const REMOTE_WORKER_URL = "https://pnk.sc-pnk.workers.dev";
if (typeof window !== "undefined") {
  const origFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string" && input.startsWith("/api/")) {
      const headers = new Headers(init?.headers || {});
      const token = localStorage.getItem("pka_token");
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return origFetch(REMOTE_WORKER_URL + input, {
        ...init,
        headers,
        credentials: "include",
      });
    }
    return origFetch(input, init);
  };
}

// Global dismiss splash helper
function dismissNativeSplash() {
  if (typeof window !== "undefined") {
    if (typeof (window as any).__DISMISS_SPLASH__ === "function") {
      (window as any).__DISMISS_SPLASH__();
    }
    const splash = document.getElementById("pka-splash-overlay");
    if (splash) {
      splash.style.transition = "opacity 0.3s ease";
      splash.style.opacity = "0";
      setTimeout(() => {
        if (splash && splash.parentNode) {
          splash.parentNode.removeChild(splash);
        }
      }, 300);
    }
  }
}

// React Error Boundary cấp cao nhất chống Blank Screen
interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class NativeAppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("LỖI KHỞI CHẠY NATIVE APP:", error, errorInfo);
    this.setState({ errorInfo });
    dismissNativeSplash();
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = () => {
    if (confirm("Thao tác này sẽ đặt lại cấu hình đệm của ứng dụng và tải lại. Bạn có muốn tiếp tục?")) {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#082f58",
            color: "#ffffff",
            padding: "24px 16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.2)",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              marginBottom: "16px",
            }}
          >
            ⚠️
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px 0" }}>
            Đã xảy ra sự cố hiển thị giao diện
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              margin: "0 0 20px 0",
              maxWidth: "340px",
              lineHeight: 1.5,
            }}
          >
            Hệ thống đã tự động bảo vệ và chặn màn hình xanh. Bạn có thể thử tải lại hoặc khôi phục cấu hình.
          </p>

          <div
            style={{
              background: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "12px",
              color: "#f87171",
              textAlign: "left",
              maxWidth: "360px",
              width: "100%",
              overflowX: "auto",
              marginBottom: "20px",
              fontFamily: "monospace",
            }}
          >
            <b>Lỗi:</b> {this.state.error?.message || "Không xác định"}
          </div>

          <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "340px" }}>
            <button
              onClick={this.handleReload}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "8px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              🔄 Tải lại
            </button>
            <button
              onClick={this.handleResetStorage}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.1)",
                color: "#e2e8f0",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              🧹 Đặt lại bộ nhớ
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Khởi tạo người dùng mặc định khi chạy Offline Native (Master Admin production workspace)
const defaultOfflineUser = {
  id: "b7f7f770-898b-4e2d-983f-9e640a42950d",
  username: "bosmile",
  displayName: "Master Admin",
  role: "master" as const,
  department: "Ban Quản lý Mua sắm",
};

export function NativeApp() {
  const [user, setUser] = useState<{
    id: string;
    username: string;
    displayName: string;
    role: string;
    department?: string;
  }>(() => {
    try {
      const saved = localStorage.getItem("pka_user");
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultOfflineUser;
  });

  useEffect(() => {
    // Tự động gỡ màn hình Splash ngay khi React mount
    dismissNativeSplash();
  }, []);

  return (
    <NativeAppErrorBoundary>
      <ProcurementApp currentUser={user} />
    </NativeAppErrorBoundary>
  );
}

// Render ứng dụng vào DOM #root
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<NativeApp />);
} else {
  console.error("Không tìm thấy phần tử #root để khởi tạo Native App!");
}
