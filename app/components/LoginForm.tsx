"use client";
import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: form.get("password"),
      }),
    });
    if (response.ok) {
      try {
        const data = (await response.json()) as { user?: unknown; token?: string };
        if (data && data.user) {
          localStorage.setItem("pka_user", JSON.stringify(data.user));
          if (data.token) {
            localStorage.setItem("pka_token", data.token);
          }
        }
      } catch {}
      location.reload();
    } else {
      let msg = "Mật khẩu hệ thống không đúng";
      try {
        const err = (await response.json()) as { error?: string };
        if (err?.error) msg = err.error;
      } catch {}
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <form onSubmit={submit}>
        <div className="login-brand">
          <img src="/phenikaa-logo.png" alt="Phenikaa Pharma" />
        </div>
        <em>PHENIKAA PHARMA</em>
        <h1>Đăng nhập hệ thống</h1>
        <p>Nhập mật khẩu hệ thống để truy cập quản lý mua sắm, PR, PO, hợp đồng và thanh toán.</p>
        <label>
          Mật khẩu hệ thống
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu..."
            required
            autoFocus
          />
        </label>
        {error && <div className="login-error">⚠ {error}</div>}
        <button disabled={busy}>
          {busy ? "Đang xác thực..." : "Đăng nhập"}
        </button>
        <small>Phiên đăng nhập tự hết hạn sau 12 giờ.</small>
      </form>
    </main>
  );
}
