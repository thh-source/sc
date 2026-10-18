import { getDb, getCurrentUser, recordAudit, requireAdmin } from "../../../auth";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function GET() {
  try {
    await requireAdmin();
    const env = await bindings();
    const list = await env.BUCKET.list({ prefix: "snapshots/" });

    const snapshots = list.objects
      .map((obj) => ({
        key: obj.key,
        size: obj.size,
        uploadedAt: obj.uploaded.toISOString(),
        label: obj.customMetadata?.label || "Bản sao lưu CSDL",
        createdBy: obj.customMetadata?.createdBy || "Hệ thống",
        recordCount: Number(obj.customMetadata?.recordCount || 0),
        originalBytes: Number(obj.customMetadata?.originalBytes || obj.size),
      }))
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );

    return Response.json({ snapshots });
  } catch {
    return Response.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const env = await bindings();
    const db = await getDb();
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      key?: string;
      label?: string;
    };

    // 1. Tạo bản snapshot sao lưu mới
    if (body.action === "create") {
      const { results: states } = await db
        .prepare("SELECT id, payload, updated_at, version FROM app_state")
        .all<{
          id: string;
          payload: string;
          updated_at: string;
          version: number;
        }>();

      const snapshotPayload = {
        version: 1,
        createdAt: new Date().toISOString(),
        createdBy: user.username,
        label: body.label || `Bản sao lưu lúc ${new Date().toLocaleTimeString("vi-VN")}`,
        states: states || [],
      };

      const jsonStr = JSON.stringify(snapshotPayload);
      const jsonBytes = new TextEncoder().encode(jsonStr);

      // Nén dữ liệu bằng Gzip
      const cs = new CompressionStream("gzip");
      const writer = cs.writable.getWriter();
      writer.write(jsonBytes);
      writer.close();
      const compressedBuffer = await new Response(cs.readable).arrayBuffer();

      const key = `snapshots/snapshot_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.json.gz`;
      await env.BUCKET.put(key, compressedBuffer, {
        httpMetadata: { contentType: "application/gzip" },
        customMetadata: {
          label: body.label || `Snapshot ${new Date().toLocaleDateString("vi-VN")}`,
          createdAt: new Date().toISOString(),
          createdBy: user.username,
          recordCount: String(states.length),
          originalBytes: String(jsonBytes.byteLength),
        },
      });

      await recordAudit(
        "CREATE_SNAPSHOT",
        "system",
        `${user.username}: Tạo bản snapshot sao lưu R2 (${states.length} phân vùng, ${(compressedBuffer.byteLength / 1024).toFixed(1)} KB)`,
      );

      return Response.json({
        ok: true,
        key,
        size: compressedBuffer.byteLength,
        recordCount: states.length,
      });
    }

    // 2. Phục hồi dữ liệu về thời điểm snapshot (Point-in-time Restore)
    if (body.action === "restore") {
      const key = String(body.key || "").trim();
      if (!key) {
        return Response.json({ error: "Thiếu khóa snapshot cần phục hồi" }, { status: 400 });
      }

      const obj = await env.BUCKET.get(key);
      if (!obj) {
        return Response.json({ error: "Không tìm thấy bản snapshot trong R2" }, { status: 404 });
      }

      let jsonText: string;
      if (key.endsWith(".gz")) {
        const ds = new DecompressionStream("gzip");
        const decompressedStream = obj.body.pipeThrough(ds);
        jsonText = await new Response(decompressedStream).text();
      } else {
        jsonText = await obj.text();
      }

      let parsedSnapshot: any;
      try {
        parsedSnapshot = JSON.parse(jsonText);
      } catch {
        return Response.json({ error: "Tệp snapshot bị hỏng hoặc không đúng định dạng" }, { status: 400 });
      }

      if (!parsedSnapshot.states || !Array.isArray(parsedSnapshot.states)) {
        return Response.json({ error: "Dữ liệu snapshot không chứa danh sách states hợp lệ" }, { status: 400 });
      }

      const stmts = parsedSnapshot.states.map((st: any) =>
        db
          .prepare(
            "INSERT INTO app_state (id, payload, updated_at, version) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at, version=excluded.version",
          )
          .bind(
            st.id,
            st.payload,
            st.updated_at || new Date().toISOString(),
            st.version || 1,
          ),
      );

      if (stmts.length > 0) {
        await db.batch(stmts);
      }

      await recordAudit(
        "RESTORE_SNAPSHOT",
        "system",
        `${user.username}: Phục hồi CSDL từ snapshot "${parsedSnapshot.label || key}" (${parsedSnapshot.states.length} phân vùng)`,
      );

      return Response.json({
        ok: true,
        restoredCount: parsedSnapshot.states.length,
        message: "Phục hồi dữ liệu thành công",
      });
    }

    return Response.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message || "Lỗi máy chủ" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAdmin();
    const env = await bindings();
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return Response.json({ error: "Thiếu khóa snapshot" }, { status: 400 });
    }

    await env.BUCKET.delete(key);
    await recordAudit(
      "DELETE_SNAPSHOT",
      "system",
      `${user.username}: Xóa bản snapshot ${key}`,
    );

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }
}
