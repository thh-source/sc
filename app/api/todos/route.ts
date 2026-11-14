import { getCurrentUser } from "../../auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-expected-version",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: CORS_HEADERS,
  });
}

async function getRuntimeDB() {
  const { env } = await import("cloudflare:workers");
  return env.DB as D1Database;
}

async function ensureTodosTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS personal_todos (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'admin',
      content TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      is_priority INTEGER DEFAULT 0,
      tags TEXT,
      due_date TEXT,
      subtasks TEXT,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0
    );
  `).run();

  try {
    const info = await db.prepare("PRAGMA table_info(personal_todos)").all();
    const cols = new Set((info.results || []).map((c: any) => String(c.name)));
    if (!cols.has("due_date")) {
      await db.prepare("ALTER TABLE personal_todos ADD COLUMN due_date TEXT").run();
    }
    if (!cols.has("subtasks")) {
      await db.prepare("ALTER TABLE personal_todos ADD COLUMN subtasks TEXT").run();
    }
    if (!cols.has("note")) {
      await db.prepare("ALTER TABLE personal_todos ADD COLUMN note TEXT").run();
    }
  } catch (e) {
    console.warn("ensureTodosTable alter check:", e);
  }
}

async function resolveTodoUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id || null;
}

/**
 * GET /api/todos: Lấy danh sách công việc cá nhân của user chưa bị xóa (is_deleted = 0)
 */
export async function GET() {
  try {
    const userId = await resolveTodoUserId();
    if (!userId) return jsonResponse({ error: "Yêu cầu đăng nhập", todos: [] }, 401);
    const db = await getRuntimeDB();
    await ensureTodosTable(db);

    const result = await db
      .prepare(
        `SELECT id, user_id, content, is_completed, is_priority, tags, due_date, subtasks, note, created_at, updated_at 
         FROM personal_todos 
         WHERE (user_id = ? OR user_id = 'b7f7f770-898b-4e2d-983f-9e640a42950d' OR user_id = 'admin') AND is_deleted = 0 
         ORDER BY is_priority DESC, created_at DESC`
      )
      .bind(userId)
      .all();

    const todos = (result.results || []).map((row: any) => {
      let parsedSubtasks: any[] = [];
      if (row.subtasks) {
        try {
          const p = JSON.parse(row.subtasks);
          if (Array.isArray(p)) parsedSubtasks = p;
        } catch {}
      }
      return {
        id: row.id,
        text: row.content,
        completed: row.is_completed === 1,
        createdAt: row.created_at || new Date().toISOString(),
        priority: row.is_priority === 1 ? ("high" as const) : ("normal" as const),
        dueDate: row.due_date || undefined,
        subtasks: parsedSubtasks,
        note: row.note || undefined,
        tags: row.tags
          ? typeof row.tags === "string" && row.tags.startsWith("[")
            ? JSON.parse(row.tags)
            : [row.tags]
          : [],
      };
    });

    return jsonResponse({ todos, count: todos.length });
  } catch (err: any) {
    console.error("Lỗi GET /api/todos:", err);
    return jsonResponse({ error: err.message || "Lỗi máy chủ", todos: [] }, 500);
  }
}

/**
 * POST /api/todos: Thêm công việc mới vào Cloudflare D1
 */
export async function POST(request: Request) {
  try {
    const userId = await resolveTodoUserId();
    if (!userId) return jsonResponse({ error: "Yêu cầu đăng nhập" }, 401);
    const db = await getRuntimeDB();
    await ensureTodosTable(db);

    const body = (await request.json()) as any;
    const text = (body.text || body.content || "").trim();
    if (!text) {
      return jsonResponse({ error: "Nội dung công việc không được để trống" }, 400);
    }

    const id = body.id || `todo-${Date.now()}`;
    const isCompleted = body.completed || body.isCompleted ? 1 : 0;
    const isPriority =
      body.priority === "high" || body.isPriority === 1 || body.isPriority === true ? 1 : 0;
    const tagsStr = Array.isArray(body.tags) ? JSON.stringify(body.tags) : (body.tags || null);
    const dueDate = body.dueDate || body.due_date || null;
    const subtasksStr = Array.isArray(body.subtasks) ? JSON.stringify(body.subtasks) : null;
    const noteStr = typeof body.note === "string" ? body.note : null;
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO personal_todos (id, user_id, content, is_completed, is_priority, tags, due_date, subtasks, note, created_at, updated_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           is_completed = excluded.is_completed,
           is_priority = excluded.is_priority,
           tags = excluded.tags,
           due_date = excluded.due_date,
           subtasks = excluded.subtasks,
           note = excluded.note,
           updated_at = excluded.updated_at,
           is_deleted = 0`
      )
      .bind(id, userId, text, isCompleted, isPriority, tagsStr, dueDate, subtasksStr, noteStr, now, now)
      .run();

    return jsonResponse({
      success: true,
      todo: {
        id,
        text,
        completed: isCompleted === 1,
        priority: isPriority === 1 ? "high" : "normal",
        dueDate: dueDate || undefined,
        subtasks: Array.isArray(body.subtasks) ? body.subtasks : [],
        note: noteStr || undefined,
        createdAt: now,
        tags: body.tags || [],
      },
    });
  } catch (err: any) {
    console.error("Lỗi POST /api/todos:", err);
    return jsonResponse({ error: err.message || "Lỗi máy chủ" }, 500);
  }
}

/**
 * PUT /api/todos: Cập nhật công việc (đổi trạng thái completed, sửa text, hoặc bulk sync)
 */
export async function PUT(request: Request) {
  try {
    const userId = await resolveTodoUserId();
    if (!userId) return jsonResponse({ error: "Yêu cầu đăng nhập" }, 401);
    const db = await getRuntimeDB();
    await ensureTodosTable(db);

    const body = (await request.json()) as any;

    // Hỗ trợ đồng bộ nguyên mảng todos (Bulk Sync)
    if (Array.isArray(body.todos)) {
      if (body.todos.length === 0) {
        // Khi người dùng xóa hết trên Web -> Cập nhật D1 là đã xóa hết
        await db
          .prepare(
            `UPDATE personal_todos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_deleted = 0`
          )
          .bind(userId)
          .run();
        return jsonResponse({ success: true, count: 0 });
      }

      // Đánh dấu các việc không còn trong mảng là đã xóa
      const activeIds = body.todos.map((t: any) => t.id).filter(Boolean);
      if (activeIds.length > 0) {
        const placeholders = activeIds.map(() => "?").join(",");
        await db
          .prepare(
            `UPDATE personal_todos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_deleted = 0 AND id NOT IN (${placeholders})`
          )
          .bind(userId, ...activeIds)
          .run();
      }

      // Upsert các việc hiện có
      for (const t of body.todos) {
        const isComp = t.completed || t.isCompleted ? 1 : 0;
        const isPrio = t.priority === "high" || t.isPriority === 1 ? 1 : 0;
        const tagsStr = Array.isArray(t.tags) ? JSON.stringify(t.tags) : (t.tags || null);
        const now = new Date().toISOString();
        await db
          .prepare(
            `INSERT INTO personal_todos (id, user_id, content, is_completed, is_priority, tags, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
             ON CONFLICT(id) DO UPDATE SET
               content = excluded.content,
               is_completed = excluded.is_completed,
               is_priority = excluded.is_priority,
               tags = excluded.tags,
               updated_at = excluded.updated_at,
               is_deleted = 0`
          )
          .bind(t.id, userId, (t.text || t.content || "").trim(), isComp, isPrio, tagsStr, t.createdAt || now, now)
          .run();
      }

      return jsonResponse({ success: true, count: body.todos.length });
    }

    // Cập nhật 1 mục đơn lẻ
    const id = body.id;
    if (!id) return jsonResponse({ error: "Thiếu ID công việc" }, 400);

    const isCompleted =
      body.completed !== undefined
        ? body.completed ? 1 : 0
        : body.isCompleted !== undefined
        ? body.isCompleted ? 1 : 0
        : undefined;

    const isPriority =
      body.priority !== undefined
        ? body.priority === "high" ? 1 : 0
        : body.isPriority !== undefined
        ? body.isPriority ? 1 : 0
        : undefined;

    const content = body.text !== undefined ? body.text : body.content;

    let updateSql = "UPDATE personal_todos SET updated_at = CURRENT_TIMESTAMP";
    const params: any[] = [];

    if (content !== undefined) {
      updateSql += ", content = ?";
      params.push(content.trim());
    }
    if (isCompleted !== undefined) {
      updateSql += ", is_completed = ?";
      params.push(isCompleted);
    }
    if (isPriority !== undefined) {
      updateSql += ", is_priority = ?";
      params.push(isPriority);
    }
    if (body.dueDate !== undefined || body.due_date !== undefined) {
      updateSql += ", due_date = ?";
      params.push(body.dueDate ?? body.due_date ?? null);
    }
    if (body.subtasks !== undefined) {
      updateSql += ", subtasks = ?";
      params.push(Array.isArray(body.subtasks) ? JSON.stringify(body.subtasks) : null);
    }
    if (body.note !== undefined) {
      updateSql += ", note = ?";
      params.push(typeof body.note === "string" ? body.note : null);
    }

    updateSql += " WHERE id = ? AND (user_id = ? OR user_id = 'b7f7f770-898b-4e2d-983f-9e640a42950d' OR user_id = 'admin')";
    params.push(id, userId);

    await db.prepare(updateSql).bind(...params).run();
    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("Lỗi PUT /api/todos:", err);
    return jsonResponse({ error: err.message || "Lỗi máy chủ" }, 500);
  }
}

/**
 * DELETE /api/todos: Xóa công việc cá nhân (soft-delete is_deleted = 1)
 */
export async function DELETE(request: Request) {
  try {
    const userId = await resolveTodoUserId();
    if (!userId) return jsonResponse({ error: "Yêu cầu đăng nhập" }, 401);
    const db = await getRuntimeDB();
    await ensureTodosTable(db);

    const url = new URL(request.url);
    const idFromQuery = url.searchParams.get("id");
    const clearCompleted = url.searchParams.get("clearCompleted") === "true";
    const clearAll = url.searchParams.get("clearAll") === "true";

    let body: any = null;
    try {
      body = await request.json();
    } catch {}

    const targetId = idFromQuery || body?.id;

    if (clearAll || body?.clearAll) {
      await db
        .prepare(
          `UPDATE personal_todos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_deleted = 0`
        )
        .bind(userId)
        .run();
      return jsonResponse({ success: true, message: "Đã xóa toàn bộ công việc" });
    }

    if (clearCompleted || body?.clearCompleted) {
      await db
        .prepare(
          `UPDATE personal_todos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_completed = 1 AND is_deleted = 0`
        )
        .bind(userId)
        .run();
      return jsonResponse({ success: true, message: "Đã dọn dẹp các công việc đã xong" });
    }

    if (targetId) {
      await db
        .prepare(
          `UPDATE personal_todos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
        )
        .bind(targetId, userId)
        .run();
      return jsonResponse({ success: true, message: "Đã xóa công việc" });
    }

    return jsonResponse({ error: "Yêu cầu xóa không hợp lệ" }, 400);
  } catch (err: any) {
    console.error("Lỗi DELETE /api/todos:", err);
    return jsonResponse({ error: err.message || "Lỗi máy chủ" }, 500);
  }
}
