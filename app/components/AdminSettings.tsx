import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { AdminUsage } from "./AdminUsage";
// Add other imports as necessary

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
  const load = () =>
    fetch("/api/users")
      .then((r) => r.json())
      .then((b) => setUsers(b.users || []));
  const loadUsage = () =>
    fetch("/api/admin/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setUsage(body))
      .catch(() => setUsage(null));
  useEffect(() => {
    load();
    loadUsage();
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
  };
  const toggle = async (user: UserRow) => {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    load();
    loadUsage();
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.reload();
  };
  return (
    <section className="content admin-settings">
      <div className="heading">
        <div>
          <em>MASTER ADMIN</em>
          <h1>Cài đặt & người dùng</h1>
          <p>Tạo tài khoản, phân quyền và khóa quyền truy cập hệ thống.</p>
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
              <dd>12 giờ</dd>
            </div>
          </dl>
          <p>
            Mật khẩu được băm PBKDF2 trước khi lưu. Hệ thống không lưu mật khẩu
            dạng văn bản.
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
                <th></th>
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
                    {u.role !== "master" && u.id !== currentUser.id && (
                      <button onClick={() => toggle(u)}>
                        {u.active ? "Khóa" : "Mở khóa"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

