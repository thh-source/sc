import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LogOut,
  Users,
  FileText,
  Database,
  History,
  Plus,
  RotateCcw,
  Smartphone,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Calendar,
  Hash,
  Loader2,
  RotateCw,
  QrCode,
  Copy,
  Check,
} from "lucide-react";
import { dateVN } from "../utils";
import { AdminUsage } from "./AdminUsage";
import { PrintTemplatesManagement } from "./PrintTemplatesManagement";
import { PaymentPrintTemplate, PaymentRequestEntry, Supplier } from "../types";
import { CURRENT_APP_VERSION, getAppPlatform } from "../version";
import {
  fetchRemoteVersion,
  getInstalledVersion,
  isNewerVersion,
  downloadAndApplyOta,
  reloadApp,
  AppVersionInfo,
} from "../utils/otaUpdateService";

export function AdminSettings({
  currentUser,
  defaultTab = "users",
  paymentTemplate,
  suppliers,
  sampleRequest,
  onUpdateState,
  readOnly = false,
}: {
  currentUser: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  defaultTab?: "users" | "templates" | "snapshots" | "audit" | "version";
  paymentTemplate?: PaymentPrintTemplate;
  suppliers?: Supplier[];
  sampleRequest?: PaymentRequestEntry | null;
  onUpdateState?: (patch: { paymentTemplate?: PaymentPrintTemplate }) => void;
  readOnly?: boolean;
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

  const [activeTab, setActiveTab] = useState<"users" | "templates" | "snapshots" | "audit" | "version">(defaultTab);

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab);
  }, [defaultTab]);

  // OTA Version State
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [downloadingOta, setDownloadingOta] = useState(false);
  const [otaReady, setOtaReady] = useState(false);
  const [installedVersion, setInstalledVersion] = useState(CURRENT_APP_VERSION.version);
  const [updateResult, setUpdateResult] = useState<{
    checked: boolean;
    hasUpdate: boolean;
    remoteInfo?: AppVersionInfo;
    error?: string;
  } | null>(null);

  const [showQr, setShowQr] = useState(false);
  const [copiedApkLink, setCopiedApkLink] = useState(false);

  const apkDownloadUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      const base = window.location.origin.includes("localhost")
        ? "https://quan-ly-mua-hang.sc-pnk.workers.dev"
        : window.location.origin;
      return `${base}/api/app-version/download?type=apk`;
    }
    return "https://quan-ly-mua-hang.sc-pnk.workers.dev/api/app-version/download?type=apk";
  }, []);

  const handleCopyApkLink = () => {
    if (!apkDownloadUrl) return;
    navigator.clipboard.writeText(apkDownloadUrl).then(() => {
      setCopiedApkLink(true);
      setTimeout(() => setCopiedApkLink(false), 2500);
    });
  };

  const platform = useMemo(() => getAppPlatform(), []);

  useEffect(() => {
    getInstalledVersion().then((v) => {
      if (v) setInstalledVersion(v);
    });
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingVersion(true);
    setUpdateResult(null);

    try {
      const remote = await fetchRemoteVersion();
      const hasUpdate = isNewerVersion(remote.latestVersion, installedVersion);
      setUpdateResult({
        checked: true,
        hasUpdate,
        remoteInfo: remote,
      });
    } catch (err: any) {
      setUpdateResult({
        checked: true,
        hasUpdate: false,
        error: "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.",
      });
    } finally {
      setCheckingVersion(false);
    }
  };

  const handleDownloadAndApply = async () => {
    if (!updateResult?.remoteInfo) return;
    setDownloadingOta(true);
    try {
      const ok = await downloadAndApplyOta(updateResult.remoteInfo, (state) => {
        if (state.updateReady) setOtaReady(true);
      });
      if (ok) setOtaReady(true);
    } catch (err: any) {
      alert("Lỗi khi tải cập nhật: " + err.message);
    } finally {
      setDownloadingOta(false);
    }
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
  const cleanupTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, []);

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
      .then((r) => r.json() as Promise<{ users?: UserRow[] }>)
      .then((b) => setUsers(b.users || []));

  const loadUsage = () =>
    fetch("/api/admin/usage")
      .then((r) => (r.ok ? (r.json() as Promise<UsageInfo | null>) : null))
      .then((body) => setUsage(body))
      .catch(() => setUsage(null));

  const loadAuditLogs = () => {
    setAuditLoading(true);
    fetch("/api/admin/audit-logs?limit=50")
      .then((r) => (r.ok ? (r.json() as Promise<{ logs?: AuditLogRow[] } | null>) : null))
      .then((b) => {
        if (b?.logs) setAuditLogs(b.logs);
      })
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  };

  const loadSnapshots = () => {
    setSnapshotLoading(true);
    fetch("/api/admin/snapshots")
      .then((r) => (r.ok ? (r.json() as Promise<{ snapshots?: SnapshotItem[] } | null>) : null))
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
      body = (await response.json()) as { error?: string };
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
      const data = (await res.json()) as { error?: string };
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
      const data = (await res.json()) as { error?: string };
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
      const data = (await res.json()) as { deletedCount?: number };
      if (res.ok) {
        setCleanupStatus(`Đã dọn dẹp ${data.deletedCount || 0} phiên hết hạn`);
        if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = setTimeout(() => setCleanupStatus(""), 4000);
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
      const data = (await res.json()) as { size: number; error?: string };
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
      const data = (await res.json()) as { restoredCount?: number; error?: string };
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
          <h1>Cài đặt hệ thống</h1>
        </div>
        <button className="ghost" onClick={logout} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>

      {/* Thanh điều hướng Tab trong Cài đặt */}
      <div
        className="admin-tabs"
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          borderBottom: "1px solid var(--line)",
          paddingBottom: "12px",
          overflowX: "auto",
        }}
      >
        <button
          className={activeTab === "users" ? "primary" : "ghost"}
          onClick={() => setActiveTab("users")}
          style={{ fontSize: "13px", padding: "7px 15px", height: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Users size={15} /> Tài khoản & Phân quyền
        </button>
        <button
          className={activeTab === "templates" ? "primary" : "ghost"}
          onClick={() => setActiveTab("templates")}
          style={{ fontSize: "13px", padding: "7px 15px", height: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <FileText size={15} /> Mẫu phiếu in
        </button>
        <button
          className={activeTab === "snapshots" ? "primary" : "ghost"}
          onClick={() => setActiveTab("snapshots")}
          style={{ fontSize: "13px", padding: "7px 15px", height: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Database size={15} /> Sao lưu Snapshots ({snapshots.length})
        </button>
        <button
          className={activeTab === "audit" ? "primary" : "ghost"}
          onClick={() => setActiveTab("audit")}
          style={{ fontSize: "13px", padding: "7px 15px", height: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <History size={15} /> Nhật ký thao tác ({auditLogs.length})
        </button>
        <button
          className={activeTab === "version" ? "primary" : "ghost"}
          onClick={() => setActiveTab("version")}
          style={{ fontSize: "13px", padding: "7px 15px", height: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Smartphone size={15} /> Phiên bản & Cập nhật
        </button>
      </div>

      {/* Tab 1: Tài khoản & Phân quyền */}
      {activeTab === "users" && (
        <>
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

                          {u.role !== "master" && u.id !== currentUser.id && (
                            <button
                              style={{ fontSize: "11px", padding: "4px 8px", height: "auto" }}
                              onClick={() => toggle(u)}
                            >
                              {u.active ? "Khóa" : "Mở"}
                            </button>
                          )}

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
        </>
      )}

      {/* Tab 2: Mẫu phiếu in */}
      {activeTab === "templates" && (
        <div className="admin-templates-tab">
          <PrintTemplatesManagement
            paymentTemplate={paymentTemplate}
            suppliers={suppliers}
            sampleRequest={sampleRequest}
            onUpdateState={onUpdateState}
            readOnly={readOnly}
          />
        </div>
      )}

      {/* Tab 3: Sao lưu R2 Snapshots */}
      {activeTab === "snapshots" && (
        <section className="admin-card snapshot-card">
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
                {snapshotLoading ? "Đang tải..." : <><RotateCcw size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "3px" }} /> Làm mới</>}
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
                <Plus size={14} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "3px" }} /> Tạo snapshot
              </button>
            </div>
          </div>

          <div className="user-table" style={{ maxHeight: "420px", overflowY: "auto" }}>
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
      )}

      {/* Tab 4: Nhật ký thao tác (Audit Logs) */}
      {activeTab === "audit" && (
        <section className="admin-card audit-logs-card">
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
                {auditLoading ? "Đang tải..." : <><RotateCcw size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "3px" }} /> Làm mới</>}
              </button>
            </div>
          </div>
          <div className="user-table" style={{ maxHeight: "420px", overflowY: "auto" }}>
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
      )}

      {/* Tab 5: Phiên bản & Cập nhật từ xa (OTA Update) */}
      {activeTab === "version" && (
        <section className="admin-card version-card" style={{ padding: "20px" }}>
          <div className="section-heading" style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Smartphone size={20} style={{ color: "#0284c7" }} />
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                Thông tin phiên bản & Cập nhật từ xa (OTA)
              </h2>
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "12px",
                backgroundColor: platform.isNative ? "#e0f2fe" : "#f1f5f9",
                color: platform.isNative ? "#0284c7" : "#475569",
                border: "1px solid " + (platform.isNative ? "#bae6fd" : "#cbd5e1"),
              }}
            >
              {platform.platformBadge}
            </span>
          </div>

          <div
            style={{
              backgroundColor: "var(--card-bg, #ffffff)",
              borderRadius: "8px",
              border: "1px solid var(--line, #e2e8f0)",
              padding: "16px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "18px",
            }}
          >
            <div>
              <div style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Sparkles size={13} style={{ color: "#0284c7" }} /> Tên phiên bản phát hành
              </div>
              <div style={{ fontSize: "14px", fontWeight: 750, color: "var(--fg, #0f172a)", marginTop: "4px" }}>
                {CURRENT_APP_VERSION.versionName}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Hash size={13} style={{ color: "#059669" }} /> Mã bản build (Build Code)
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--fg, #0f172a)", fontFamily: "monospace", marginTop: "4px" }}>
                #{CURRENT_APP_VERSION.buildNumber} {CURRENT_APP_VERSION.gitCommit ? `(${CURRENT_APP_VERSION.gitCommit})` : ""}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Calendar size={13} style={{ color: "#d97706" }} /> Ngày giờ biên dịch
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg, #334155)", marginTop: "4px" }}>
                {CURRENT_APP_VERSION.buildDate}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Smartphone size={13} style={{ color: "#6366f1" }} /> Nền tảng hoạt động
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg, #334155)", marginTop: "4px" }}>
                {platform.platformName} ({CURRENT_APP_VERSION.releaseChannel})
              </div>
            </div>
          </div>

          {/* Khối Tải File Cài Đặt Android APK Trực Tiếp */}
          <div
            style={{
              backgroundColor: "#f0fdf4",
              borderRadius: "10px",
              border: "1px solid #bbf7d0",
              padding: "16px 18px",
              marginBottom: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "8px",
                    backgroundColor: "#16a34a",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Smartphone size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: "14.5px", fontWeight: 700, margin: 0, color: "#14532d" }}>
                    Cài đặt ứng dụng Android (File APK)
                  </h4>
                  <span style={{ fontSize: "12px", color: "#166534" }}>
                    Bản cài đặt chính thức v{CURRENT_APP_VERSION.version} (~8.6 MB) • Dành cho điện thoại & máy tính bảng
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  backgroundColor: "#dcfce7",
                  color: "#15803d",
                  padding: "3px 9px",
                  borderRadius: "12px",
                  border: "1px solid #86efac",
                }}
              >
                ✓ Sẵn sàng tải về
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <a
                href="/api/app-version/download?type=apk"
                download={`Phenikaa_Procurement_App_v${CURRENT_APP_VERSION.version}.apk`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "#15803d",
                  color: "#ffffff",
                  padding: "9px 18px",
                  borderRadius: "7px",
                  fontSize: "13px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 4px rgba(21, 128, 61, 0.25)",
                  cursor: "pointer",
                }}
              >
                <Download size={16} /> Tải APK Trực Tiếp (8.6 MB)
              </a>

              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#ffffff",
                  color: "#166534",
                  border: "1px solid #86efac",
                  padding: "8px 14px",
                  borderRadius: "7px",
                  fontSize: "12.5px",
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                <QrCode size={15} /> {showQr ? "Ẩn mã QR" : "Quét mã QR trên điện thoại"}
              </button>

              <button
                type="button"
                onClick={handleCopyApkLink}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "8px 14px",
                  borderRadius: "7px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {copiedApkLink ? (
                  <>
                    <Check size={14} style={{ color: "#16a34a" }} /> Đã chép link!
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Sao chép link APK
                  </>
                )}
              </button>
            </div>

            {/* QR Code Section khi bật */}
            {showQr && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  backgroundColor: "#ffffff",
                  padding: "16px",
                  borderRadius: "10px",
                  border: "1px solid #bbf7d0",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "12.5px", fontWeight: 650, color: "#14532d", textAlign: "center" }}>
                  Dùng Camera điện thoại hoặc Zalo quét mã QR dưới đây để tải trực tiếp file APK:
                </div>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(apkDownloadUrl)}`}
                  alt="Mã QR tải APK"
                  style={{
                    width: "170px",
                    height: "170px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    padding: "4px",
                    backgroundColor: "#ffffff",
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "/qr-apk-download.png";
                  }}
                />
                <span style={{ fontSize: "11.5px", color: "#64748b", textAlign: "center", maxWidth: "340px" }}>
                  Sau khi quét, chọn <b>Tải về</b> và bấm <b>Cài đặt</b> để hoàn tất.
                </span>
              </div>
            )}

            {/* Hướng dẫn cài đặt nhanh 3 bước */}
            <div
              style={{
                backgroundColor: "rgba(240, 253, 244, 0.6)",
                borderTop: "1px dashed #86efac",
                paddingTop: "10px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "8px",
                fontSize: "11.5px",
                color: "#166534",
              }}
            >
              <div>
                <b>1. Tải file:</b> Bấm nút tải hoặc quét mã QR trên điện thoại.
              </div>
              <div>
                <b>2. Mở file:</b> Nhấn vào thông báo tải xong trong phần Tệp tải về.
              </div>
              <div>
                <b>3. Cài đặt:</b> Chọn <i>Cài đặt</i> (Cho phép nguồn này nếu có cảnh báo).
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
            <button
              type="button"
              className="primary"
              onClick={handleCheckUpdate}
              disabled={checkingVersion || downloadingOta}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 650,
                cursor: checkingVersion || downloadingOta ? "not-allowed" : "pointer",
              }}
            >
              {checkingVersion ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Đang kiểm tra máy chủ Cloudflare...
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Tìm phiên bản mới
                </>
              )}
            </button>

            <span style={{ fontSize: "12.5px", color: "var(--muted, #64748b)" }}>
              Phiên bản thiết bị: <b>v{installedVersion}</b>
            </span>
          </div>

          {updateResult && (
            <div style={{ marginTop: "10px" }}>
              {updateResult.hasUpdate && updateResult.remoteInfo ? (
                <div
                  style={{
                    backgroundColor: "#eff6ff",
                    border: "1px solid #93c5fd",
                    borderRadius: "8px",
                    padding: "14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <Sparkles size={20} style={{ color: "#2563eb", marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e40af" }}>
                        🚀 Phát hiện phiên bản mới: v{updateResult.remoteInfo.latestVersion}
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#1e3a8a", marginTop: "2px" }}>
                        <b>Tên bản build:</b> {updateResult.remoteInfo.versionName || `Phenikaa SCMH v${updateResult.remoteInfo.latestVersion}`}
                        {updateResult.remoteInfo.buildDate && ` • Ngày phát hành: ${updateResult.remoteInfo.buildDate}`}
                      </div>
                      {updateResult.remoteInfo.releaseNotes && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#334155",
                            marginTop: "6px",
                            backgroundColor: "#ffffff",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          <b>Ghi chú cập nhật:</b> {updateResult.remoteInfo.releaseNotes}
                        </div>
                      )}

                      <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                        {otaReady ? (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => reloadApp()}
                            style={{
                              backgroundColor: "#16a34a",
                              borderColor: "#16a34a",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <RotateCw size={14} /> Khởi động lại ứng dụng ngay
                          </button>
                        ) : platform.isNative ? (
                          <button
                            type="button"
                            className="primary"
                            disabled={downloadingOta}
                            onClick={handleDownloadAndApply}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {downloadingOta ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Đang tải gói OTA từ Cloudflare R2...
                              </>
                            ) : (
                              <>
                                <Download size={14} /> Tải & Cập nhật ngay (OTA)
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => window.location.reload()}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <RefreshCw size={14} /> Tải lại trang để áp dụng
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : updateResult.error ? (
                <div
                  style={{
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#991b1b",
                    fontSize: "13px",
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{updateResult.error}</span>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#166534",
                    fontSize: "13px",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    <b>Hệ thống đang ở phiên bản mới nhất!</b> (v{installedVersion} - Build #{CURRENT_APP_VERSION.buildNumber}). Không có bản cập nhật nào mới.
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      )}
      {resetTargetUser && (
        <div className="backdrop">
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
        <div className="backdrop">
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
