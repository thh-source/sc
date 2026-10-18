import { getDb, hashPassword, randomHex, recordAudit, requireAdmin } from "../../../auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin(),
      { id } = await params;
    const db = await getDb();
    const targetUser = await db
      .prepare("SELECT id, username, display_name, role, active FROM users WHERE id=?")
      .bind(id)
      .first<{ id: string; username: string; display_name: string; role: string; active: number }>();

    if (!targetUser) {
      return Response.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
    }

    if (targetUser.role === "master" && actor.role !== "master") {
      return Response.json({ error: "Chỉ Master Admin mới có quyền thao tác tài khoản Master" }, { status: 403 });
    }

    const body = (await request.json()) as { active?: boolean; password?: string };
    const now = new Date().toISOString();

    // Reset password
    if (body.password !== undefined) {
      const newPassword = String(body.password || "").trim();
      if (newPassword.length < 8) {
        return Response.json({ error: "Mật khẩu phải có tối thiểu 8 ký tự" }, { status: 400 });
      }
      const salt = randomHex(16);
      const hash = await hashPassword(newPassword, salt);
      await db
        .prepare(
          "UPDATE users SET password_hash=?, password_salt=?, must_change_password=1, updated_at=? WHERE id=?",
        )
        .bind(hash, salt, now, id)
        .run();

      await recordAudit(
        "RESET_PASSWORD",
        "user",
        `${actor.username} đặt lại mật khẩu cho ${targetUser.username} (${targetUser.display_name})`,
      );
      return Response.json({ ok: true, message: "Đã đặt lại mật khẩu thành công" });
    }

    // Toggle active / lock
    if (body.active !== undefined) {
      if (actor.id === id) {
        return Response.json(
          { error: "Không thể khóa chính tài khoản đang đăng nhập" },
          { status: 400 },
        );
      }
      const newActive = body.active ? 1 : 0;
      await db
        .prepare("UPDATE users SET active=?, updated_at=? WHERE id=? AND role!='master'")
        .bind(newActive, now, id)
        .run();

      await recordAudit(
        newActive ? "UNLOCK_USER" : "LOCK_USER",
        "user",
        `${actor.username} ${newActive ? "mở khóa" : "khóa"} tài khoản ${targetUser.username}`,
      );
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Không có thông tin cần cập nhật" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message || "Không có quyền" }, { status: 403 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin(),
      { id } = await params;
    if (actor.id === id) {
      return Response.json({ error: "Không thể xóa chính tài khoản đang đăng nhập" }, { status: 400 });
    }
    const db = await getDb();
    const targetUser = await db
      .prepare("SELECT id, username, display_name, role FROM users WHERE id=?")
      .bind(id)
      .first<{ id: string; username: string; display_name: string; role: string }>();

    if (!targetUser) {
      return Response.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
    }
    if (targetUser.role === "master") {
      return Response.json({ error: "Không thể xóa tài khoản Master Admin" }, { status: 403 });
    }

    await db.prepare("DELETE FROM users WHERE id=?").bind(id).run();
    await recordAudit(
      "DELETE_USER",
      "user",
      `${actor.username} xóa tài khoản ${targetUser.username} (${targetUser.display_name})`,
    );

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }
}
