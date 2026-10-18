import React, { useState, useEffect } from "react";
import { dateVN } from "../utils";
import { AdminUsage } from "./AdminUsage";

export function AdminSettings({
  currentUser,
}: {
  currentUser: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
}) {
  type UserRow = {
    id: string;
    username: string;
    displayName: string;
    role: string;
    active: number;
    createdAt: string;
  };
  type AuditLogRow = {
    id: number;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
  };
  type UsageInfo = {
    generatedAt: string;
    freeTier: {
      d1Bytes: number;
      r2Bytes: number;
      d1RowsReadPerDay: number;
      d1RowsWrittenPerDay: number;
      r2ClassAOperationsPerMonth: number;
      r2ClassBOperationsPerMonth: number;
    };
    d1: {
      estimatedBytes: number;
      remainingBytes: number;
      usedPercent: number;
      stateRecords: number;
      users: number;
      updatedAt: string | null;
    };
    r2: {
      estimatedBytes: number;
      remainingBytes: number;
      usedPercent: number;
      fileCount: number;
      updatedAt: string | null;
    };
  };

  const [users, setUsers] = useState<UserRow[]>([]),
    [usage, setUsage] = useState<UsageInfo | null>(null),
    [message, setMessage] = useState(""),
    [form, setForm] = useState({
      username: "",
      displayName: "",
      password: "",
      role: "user",
    });

  // Audit logs & session cleanup state
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [cleaningSessions, setCleaningSessions] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState("");

  // Reset password state
  const [resetTargetUser, setResetTargetUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const load = () =>
    fetch("/api/users")
      .then((r) => r.json())
      .then((b) => setUsers(b.users || []));

  const loadUsage = () =>
    fetch("/api/admin/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setUsage(body))
      .catch(() => setUsage(null));

  const loadAuditLogs = () => {
    setAuditLoading(true);
    fetch("/api/admin/audit-logs?limit=50")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b?.logs) setAuditLogs(b.logs);
      })
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    load();
    loadUsage();
    loadAuditLogs();
  }, []);

  const create = async () => {
    setMessage("");
    const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json();
    if (!response.ok) {
      setMessage(body.error || "Không thể tạo tài khoản");
      return;
    }
    setForm({ username: "", displayName: "", password: "", role: "user" });
    setMessage("Đã tạo tài khoản mới");
    load();
    loadUsage();
    loadAuditLogs();
  };

  const toggle = async (user: UserRow) => {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    load();
    loadUsage();
    loadAuditLogs();
  };

  const handleResetPassword = async () => {
    if (!resetTargetUser || newPassword.length < 8) return;
    setResetLoading(true);
    setResetMsg("");
    try {
      const res = await fetch(`/api/users/${resetTargetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Đã đặt lại mật khẩu cho tài khoản "${resetTargetUser.username}"`);
        setResetTargetUser(null);
        setNewPassword("");
        loadAuditLogs();
      } else {
        setResetMsg(data.error || "Không thể đặt lại mật khẩu");
      }
    } catch {
      setResetMsg("Lỗi kết nối máy chủ");
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteUser = async (u: UserRow) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${u.displayName}" (${u.username})?`)) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Đã xóa tài khoản ${u.username}`);
        load();
        loadUsage();
        loadAuditLogs();
      } else {
        setMessage(data.error || "Không thể xóa tài khoản");
      }
    } catch {
      setMessage("Lỗi kết nối khi xóa");
    }
  };

  const handleCleanupSessions = async () => {
    setCleaningSessions(true);
    setCleanupStatus("");
    try {
      const res = await fetch("/api/admin/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup_sessions" }),
      });
      const data = await res.json();
      if (res.ok) {
        setCleanupStatus(`Đã dọn dẹp ${data.deletedCount || 0} phiên hết hạn`);
        setTimeout(() => setCleanupStatus(""), 4000);
        loadUsage();
      }
    } catch {
      setCleanupStatus("Lỗi dọn dẹp phiên");
    } finally {
      setCleaningSessions(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.reload();
  };

  const renderActionName = (action: string) => {
    switch (action) {
      case "LOGIN":
        return "Đăng nhập";
      case "LOGOUT":
        return "Đăng xuất";
      case "CREATE_USER":
        return "Tạo tài khoản";
      case "LOCK_USER":
        return "Khóa tài khoản";
      case "UNLOCK_USER":
        return "Mở khóa";
      case "RESET_PASSWORD":
        return "Đổi mật khẩu";
      case "DELETE_USER":
        return "Xóa tài khoản";
      case "SYNC_BACKUP":
        return "Sao lưu CSDL";
      default:
        return action;
    }
  };

  return (
    <section className="content admin-settings">
      <div className="heading">
        <div>
          <em>MASTER ADMIN</em>
          <h1>Cài đặt & người dùng</h1>
          <p>Tạo tài khoản, phân quyền, bảo mật và nhật ký thao tác hệ thống.</p>
        </div>
        <button className="ghost" onClick={logout}>
          Đăng xuất
        </button>
      </div>

      <div className="admin-grid">
        <section className="admin-card create-user-card">
          <div className="section-heading">
            <div>
              <span>＋</span>
              <h2>Tạo tài khoản người dùng</h2>
            </div>
          </div>
          <div className="admin-form">
            <label>
              ID đăng nhập
              <input
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                placeholder="Ví dụ: nguyenvana"
              />
            </label>
            <label>
              Tên người dùng
              <input
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
                placeholder="Nguyễn Văn A"
              />
            </label>
            <label>
              Mật khẩu ban đầu
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                placeholder="Tối thiểu 8 ký tự"
              />
            </label>
            <label>
              Vai trò
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
              >
                <option value="user">Người dùng</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {message && (
              <div
                className={
                  message.startsWith("Đã")
                    ? "admin-message success"
                    : "admin-message"
                }
              >
                {message}
              </div>
            )}
            <button
              className="primary"
              disabled={
                !form.username || !form.displayName || form.password.length < 8
              }
              onClick={create}
            >
              Tạo tài khoản
            </button>
          </div>
        </section>

        <section className="admin-card master-card">
          <div className="section-heading">
            <div>
              <span>◆</span>
              <h2>Tài khoản đang đăng nhập</h2>
            </div>
          </div>
          <dl>
            <div>
              <dt>ID</dt>
              <dd>{currentUser.username}</dd>
            </div>
            <div>
              <dt>Tên</dt>
              <dd>{currentUser.displayName}</dd>
            </div>
            <div>
              <dt>Quyền</dt>
              <dd>
                <span>
                  {currentUser.role === "master" ? "Master Admin" : "Admin"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Phiên đăng nhập</dt>
              <dd style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span>12 giờ</span>
                <button
                  className="ghost"
                  style={{ fontSize: "11px", padding: "3px 8px", height: "auto" }}
                  onClick={handleCleanupSessions}
                  disabled={cleaningSessions}
                  title="Dọn dẹp các phiên đã hết hạn trong cơ sở dữ liệu"
                >
                  {cleaningSessions ? "Đang dọn..." : "🧹 Dọn phiên hết hạn"}
                </button>
              </dd>
            </div>
            {cleanupStatus && (
              <div>
                <dt></dt>
                <dd style={{ fontSize: "12px", color: "var(--green)" }}>{cleanupStatus}</dd>
              </div>
            )}
          </dl>
          <p>
            Mật khẩu được băm PBKDF2 bảo mật cao. Hệ thống tự động ghi nhật ký kiểm toán cho các tác vụ quản trị.
          </p>
        </section>
      </div>

      <AdminUsage usage={usage} onRefresh={loadUsage} />

      <section className="admin-card user-list-card">
        <div className="section-heading">
          <div>
            <span>♙</span>
            <h2>Danh sách tài khoản</h2>
          </div>
          <small>{users.length} tài khoản</small>
        </div>
        <div className="user-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên người dùng</th>
                <th>Vai trò</th>
                <th>Ngày tạo</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.username}</b>
                  </td>
                  <td>{u.displayName}</td>
                  <td>
                    <span className={`role ${u.role}`}>
                      {u.role === "master"
                        ? "Master Admin"
                        : u.role === "admin"
                          ? "Admin"
                          : "Người dùng"}
                    </span>
                  </td>
                  <td>{dateVN(u.createdAt)}</td>
                  <td>
                    <span
                      className={u.active ? "account-active" : "account-locked"}
                    >
                      {u.active ? "Đang hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                      {/* Đổi mật khẩu cho user hoặc chính mình */}
                      {(u.role !== "master" || u.id === currentUser.id) && (
                        <button
                          className="ghost"
                          style={{ fontSize: "11px", padding: "4px 8px", height: "auto" }}
                          onClick={() => {
                            setResetTargetUser(u);
                            setNewPassword("");
                            setResetMsg("");
                          }}
                          title="Đặt lại mật khẩu cho tài khoản này"
                        >
                          Đổi MK
                        </button>
                      )}

                      {/* Khóa/Mở khóa */}
                      {u.role !== "master" && u.id !== currentUser.id && (
                        <button
                          style={{ fontSize: "11px", padding: "4px 8px", height: "auto" }}
                          onClick={() => toggle(u)}
                        >
                          {u.active ? "Khóa" : "Mở"}
                        </button>
                      )}

                      {/* Xóa tài khoản */}
                      {u.role !== "master" && u.id !== currentUser.id && (
                        <button
                          className="ghost danger"
                          style={{ fontSize: "11px", padding: "4px 8px", height: "auto" }}
                          onClick={() => handleDeleteUser(u)}
                          title="Xóa tài khoản khỏi hệ thống"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Nhật ký kiểm toán & Thao tác hệ thống */}
      <section className="admin-card audit-logs-card" style={{ marginTop: "20px" }}>
        <div className="section-heading">
          <div>
            <span>📋</span>
            <h2>Nhật ký thao tác & kiểm toán (Audit Logs)</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <small>{auditLogs.length} bản ghi gần nhất</small>
            <button
              className="ghost"
              onClick={loadAuditLogs}
              disabled={auditLoading}
              style={{ fontSize: "12px", padding: "4px 10px", height: "auto" }}
            >
              {auditLoading ? "Đang tải..." : "↻ Làm mới"}
            </button>
          </div>
        </div>
        <div className="user-table" style={{ maxHeight: "380px", overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: "160px" }}>Thời gian</th>
                <th style={{ width: "130px" }}>Thao tác</th>
                <th>Chi tiết hành động</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: "28px" }}>
                    Chưa có nhật ký nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td>
                      <span className={`audit-badge audit-${log.action.toLowerCase()}`}>
                        {renderActionName(log.action)}
                      </span>
                    </td>
                    <td style={{ fontSize: "13px" }}>
                      {log.entityId}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal đặt lại mật khẩu */}
      {resetTargetUser && (
        <div className="backdrop" onClick={() => setResetTargetUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <i>🔑</i>
            <h2>Đặt lại mật khẩu</h2>
            <p>
              Đặt mật khẩu mới cho tài khoản <b>{resetTargetUser.displayName}</b> ({resetTargetUser.username})
            </p>
            <label style={{ margin: "14px 0" }}>
              Mật khẩu mới
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                autoFocus
              />
            </label>
            {resetMsg && (
              <p style={{ color: "#e03131", fontSize: "13px", margin: "0 0 10px" }}>
                {resetMsg}
              </p>
            )}
            <div>
              <button className="ghost" onClick={() => setResetTargetUser(null)}>
                Hủy
              </button>
              <button
                className="primary"
                disabled={newPassword.length < 8 || resetLoading}
                onClick={handleResetPassword}
              >
                {resetLoading ? "Đang lưu..." : "Xác nhận đặt lại"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
