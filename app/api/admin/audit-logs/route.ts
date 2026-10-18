import { cleanupExpiredSessions, getDb, requireAdmin } from "../../../auth";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 10), 200);

    const db = await getDb();
    const { results } = await db
      .prepare(
        "SELECT id, action, entity_type AS entityType, entity_id AS entityId, created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT ?",
      )
      .bind(limit)
      .all<{
        id: number;
        action: string;
        entityType: string;
        entityId: string;
        createdAt: string;
      }>();

    return Response.json({ logs: results || [] });
  } catch {
    return Response.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    
    if (body.action === "cleanup_sessions") {
      const deletedCount = await cleanupExpiredSessions();
      return Response.json({ ok: true, deletedCount });
    }

    return Response.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch {
    return Response.json({ error: "Không có quyền" }, { status: 403 });
  }
}
