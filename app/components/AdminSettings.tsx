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
  type SnapshotItem = {
    key: string;
    size: number;
    uploadedAt: string;
    label: string;
    createdBy: string;
    recordCount: number;
    originalBytes: number;
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

  // R2 Snapshots state
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [restoringSnapshotKey, setRestoringSnapshotKey] = useState<string | null>(null);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [snapshotMsg, setSnapshotMsg] = useState("");

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

  const loadSnapshots = () => {
    setSnapshotLoading(true);
    fetch("/api/admin/snapshots")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b?.snapshots) setSnapshots(b.snapshots);
      })
      .catch(() => {})
      .finally(() => setSnapshotLoading(false));
  };

  useEffect(() => {
    load();
    loadUsage();
    loadAuditLogs();
    loadSnapshots();
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

  // Snapshot handlers
  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    setSnapshotMsg("");
    try {
      const res = await fetch("/api/admin/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", label: snapshotLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setSnapshotModalOpen(false);
        setSnapshotLabel("");
        setMessage(`Đã tạo bản snapshot sao lưu thành công (${(data.size / 1024).toFixed(1)} KB)`);
        loadSnapshots();
        loadUsage();
        loadAuditLogs();
      } else {
        setSnapshotMsg(data.error || "Không thể tạo snapshot");
      }
    } catch {
      setSnapshotMsg("Lỗi kết nối khi tạo snapshot");
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (item: SnapshotItem) => {
    const confirmMsg = `CẢNH BÁO PHỤC HỒI:\n\nBạn có chắc chắn muốn phục hồi toàn bộ CSDL về bản snapshot:\n"${item.label}"\n(Thời điểm: ${new Date(item.uploadedAt).toLocaleString("vi-VN")})?\n\nToàn bộ dữ liệu hiện tại sẽ được thay thế bằng dữ liệu tại thời điểm này!`;
    if (!window.confirm(confirmMsg)) return;

    setRestoringSnapshotKey(item.key);
    try {
      const res = await fetch("/api/admin/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", key: item.key }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Phục hồi CSDL thành công (${data.restoredCount} phân vùng)! Trang web sẽ tự động tải lại.`);
        location.reload();
      } else {
        alert(data.error || "Không thể phục hồi dữ liệu");
      }
    } catch {
      alert("Lỗi kết nối máy chủ khi phục hồi dữ liệu");
    } finally {
      setRestoringSnapshotKey(null);
    }
  };

  const handleDeleteSnapshot = async (item: SnapshotItem) => {
    if (!window.confirm(`Xóa bản snapshot "${item.label}" khỏi Cloudflare R2?`)) return;
    try {
      const res = await fetch(`/api/admin/snapshots?key=${encodeURIComponent(item.key)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadSnapshots();
        loadUsage();
        loadAuditLogs();
      }
    } catch {}
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
      case "CREATE_SNAPSHOT":
        return "Tạo snapshot";
      case "RESTORE_SNAPSHOT":
        return "Phục hồi CSDL";
      case "DELETE_SNAPSHOT":
        return "Xóa snapshot";
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
          <p>Tạo tài khoản, phân quyền, sao lưu Snapshot R2 và nhật ký thao tác hệ thống.</p>
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

      {/* Danh sách tài khoản */}
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
                      {/* Đổi mật khẩu */}
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

      {/* Sao lưu & Phục hồi CSDL Snapshot trên Cloudflare R2 */}
      <section className="admin-card snapshot-card" style={{ marginTop: "20px" }}>
        <div className="section-heading">
          <div>
            <span>💾</span>
            <h2>Sao lưu & phục hồi CSDL (Cloudflare R2 Snapshots)</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <small>{snapshots.length} bản snapshot</small>
            <button
              className="ghost"
              onClick={loadSnapshots}
              disabled={snapshotLoading}
              style={{ fontSize: "12px", padding: "4px 10px", height: "auto" }}
            >
              {snapshotLoading ? "Đang tải..." : "↻ Làm mới"}
            </button>
            <button
              className="primary"
              onClick={() => {
                setSnapshotModalOpen(true);
                setSnapshotLabel(`Bản sao lưu ${new Date().toLocaleDateString("vi-VN")} lúc ${new Date().toLocaleTimeString("vi-VN")}`);
                setSnapshotMsg("");
              }}
              style={{ fontSize: "12px", padding: "6px 14px", height: "auto" }}
            >
              ＋ Tạo bản snapshot sao lưu
            </button>
          </div>
        </div>

        <div className="user-table" style={{ maxHeight: "380px", overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: "230px" }}>Tên / Nhãn snapshot</th>
                <th style={{ width: "160px" }}>Thời điểm tạo</th>
                <th style={{ width: "110px" }}>Người tạo</th>
                <th style={{ width: "120px" }}>Dung lượng nén</th>
                <th style={{ width: "90px" }}>Phân vùng</th>
                <th style={{ textAlign: "right" }}>Thao tác phục hồi</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "28px" }}>
                    Chưa có bản snapshot nào trong Cloudflare R2. Nhấn nút <b>"＋ Tạo bản snapshot sao lưu"</b> ở trên để tạo bản sao lưu đầu tiên!
                  </td>
                </tr>
              ) : (
                snapshots.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <b style={{ color: "var(--blue)" }}>{item.label}</b>
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(item.uploadedAt).toLocaleString("vi-VN")}
                    </td>
                    <td>
                      <span style={{ fontSize: "12px" }}>{item.createdBy}</span>
                    </td>
                    <td style={{ fontSize: "12px", fontWeight: "600" }}>
                      {(item.size / 1024).toFixed(1)} KB (Gzip)
                    </td>
                    <td style={{ fontSize: "12px" }}>
                      {item.recordCount} state
                    </td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                        <button
                          className="primary"
                          style={{
                            fontSize: "11px",
                            padding: "4px 10px",
                            height: "auto",
                            background: "#e67700",
                            borderColor: "#d9480f",
                          }}
                          disabled={restoringSnapshotKey === item.key}
                          onClick={() => handleRestoreSnapshot(item)}
                          title="Khôi phục toàn bộ CSDL về trạng thái tại thời điểm này"
                        >
                          {restoringSnapshotKey === item.key
                            ? "Đang phục hồi..."
                            : "↺ Phục hồi về thời điểm này"}
                        </button>
                        <button
                          className="ghost danger"
                          style={{ fontSize: "11px", padding: "4px 8px", height: "auto" }}
                          onClick={() => handleDeleteSnapshot(item)}
                          title="Xóa bản snapshot này khỏi R2"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
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

      {/* Modal tạo snapshot sao lưu */}
      {snapshotModalOpen && (
        <div className="backdrop" onClick={() => !creatingSnapshot && setSnapshotModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <i>💾</i>
            <h2>Tạo bản snapshot sao lưu CSDL</h2>
            <p>
              Toàn bộ dữ liệu CSDL mua hàng, đề nghị thanh toán và lịch sử sẽ được kết xuất, nén Gzip và lưu an toàn vào <b>Cloudflare R2 Bucket</b>.
            </p>
            <label style={{ margin: "14px 0" }}>
              Tên / Nhãn bản sao lưu
              <input
                type="text"
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
                placeholder="Ví dụ: Sao lưu trước khi đối soát..."
                autoFocus
                disabled={creatingSnapshot}
              />
            </label>
            {snapshotMsg && (
              <p style={{ color: "#e03131", fontSize: "13px", margin: "0 0 10px" }}>
                {snapshotMsg}
              </p>
            )}
            <div>
              <button
                className="ghost"
                onClick={() => setSnapshotModalOpen(false)}
                disabled={creatingSnapshot}
              >
                Hủy
              </button>
              <button
                className="primary"
                disabled={creatingSnapshot}
                onClick={handleCreateSnapshot}
              >
                {creatingSnapshot ? "Đang nén & lưu lên R2..." : "Tạo & Lưu vào R2"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
