import { getCurrentUser } from "../../../auth";

async function bindings() {
  return (await import("cloudflare:workers")).env as any;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const env = await bindings();
    const { id } = await params;
    const bucket = env.R2_BUCKET || env.BUCKET;

    if (!bucket || !env.DB) {
      return new Response("Chưa cấu hình dịch vụ lưu trữ R2 / D1", { status: 500 });
    }

    // Tìm thông tin file theo ID (UUID duy nhất)
    const row = await env.DB.prepare(
      "SELECT id, object_key, file_name, content_type, size FROM files WHERE id = ?"
    )
      .bind(id)
      .first<{
        id: string;
        object_key: string;
        file_name: string;
        content_type: string;
        size: number;
      }>();

    if (!row) {
      return new Response("Không tìm thấy thông tin tài liệu trong hệ thống", { status: 404 });
    }

    const object = await bucket.get(row.object_key);
    if (!object) {
      return new Response("Không tìm thấy file trên hệ thống lưu trữ Cloud R2", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);

    const lowerName = (row.file_name || row.object_key || "").toLowerCase();
    const contentType =
      row.content_type && row.content_type !== "application/octet-stream"
        ? row.content_type
        : lowerName.endsWith(".pdf")
          ? "application/pdf"
          : lowerName.endsWith(".png")
            ? "image/png"
            : lowerName.endsWith(".webp")
              ? "image/webp"
              : "image/jpeg";

    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

    if (object.httpEtag) {
      headers.set("ETag", object.httpEtag);
    }

    return new Response(object.body, { headers });
  } catch (err: any) {
    console.error("Lỗi đọc file từ R2:", err);
    return new Response(err?.message || "Lỗi đọc file", { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Yêu cầu đăng nhập" }, { status: 401 });

  const env = await bindings();
  const { id } = await params;
  const bucket = env.R2_BUCKET || env.BUCKET;

  const row = await env.DB.prepare(
    "SELECT object_key FROM files WHERE id = ?"
  )
    .bind(id)
    .first<{ object_key: string }>();

  if (!row) return Response.json({ error: "Không tìm thấy file" }, { status: 404 });

  if (bucket) {
    try {
      await bucket.delete(row.object_key);
    } catch (e) {
      console.warn("Lỗi xóa file trên R2:", e);
    }
  }

  await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
