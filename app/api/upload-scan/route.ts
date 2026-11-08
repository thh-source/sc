import { getCurrentUser } from "../../auth";

async function getBindings() {
  return (await import("cloudflare:workers")).env;
}

async function ensureScanTable(db: any) {
  if (!db) return;
  const stmts = [
    "ALTER TABLE prs ADD COLUMN scan_file_url TEXT",
    "ALTER TABLE purchase_requests ADD COLUMN scan_file_url TEXT",
    "CREATE TABLE IF NOT EXISTS prs (id INTEGER PRIMARY KEY, workspace_id TEXT NOT NULL, number TEXT NOT NULL, date TEXT, department TEXT, purpose TEXT, status TEXT, note TEXT, scan_file_url TEXT)",
    "CREATE TABLE IF NOT EXISTS purchase_requests (id INTEGER PRIMARY KEY, number TEXT NOT NULL, date TEXT, department TEXT, purpose TEXT, status TEXT, note TEXT, scan_file_url TEXT)",
  ];
  for (const sql of stmts) {
    try {
      await db.prepare(sql).run();
    } catch {}
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return new Response("Thiếu tham số key của file scan", { status: 400 });
  }

  const env = await getBindings();
  const bucket = env.R2_BUCKET || env.BUCKET;
  if (!bucket) {
    return new Response("R2 Bucket chưa được cấu hình", { status: 500 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response("Không tìm thấy bản scan trên hệ thống lưu trữ R2", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);

  const lowerKey = key.toLowerCase();
  const contentType =
    object.httpMetadata?.contentType ||
    (lowerKey.endsWith(".pdf")
      ? "application/pdf"
      : lowerKey.endsWith(".png")
        ? "image/png"
        : lowerKey.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg");

  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (object.httpEtag) {
    headers.set("ETag", object.httpEtag);
  }

  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Yêu cầu đăng nhập để tải lên bản scan" }, { status: 401 });
    }

    const env = await getBindings();
    const bucket = env.R2_BUCKET || env.BUCKET;
    if (!bucket) {
      return Response.json({ error: "Không tìm thấy cấu hình R2 Bucket" }, { status: 500 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const rawPrCode = String(form.get("pr_code") || form.get("prNumber") || form.get("pr_number") || "PR");
    const prId = form.get("prId") || form.get("pr_id");

    if (!(file instanceof File)) {
      return Response.json({ error: "Không tìm thấy file hợp lệ trong form dữ liệu" }, { status: 400 });
    }

    // Giới hạn 15MB/file (được tự động nén siêu gọn từ Client)
    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: "Dung lượng file sau khi tối ưu vẫn vượt quá 15MB. Vui lòng chọn tài liệu gọn hơn." },
        { status: 413 }
      );
    }

    // Kiểm tra định dạng cho phép: PDF, JPG, PNG, WEBP
    const ext = file.name.split(".").pop()?.toLowerCase() || (file.type.includes("pdf") ? "pdf" : "jpg");
    const allowedExts = ["pdf", "jpg", "jpeg", "png", "webp"];
    if (!allowedExts.includes(ext) && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      return Response.json(
        { error: "Định dạng file không hỗ trợ. Hệ thống chỉ nhận PDF, JPG, PNG." },
        { status: 400 }
      );
    }

    // Đặt tên file chuẩn: pr-scans/{pr_code}_{timestamp}.ext
    const safePrCode = rawPrCode.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "PR";
    const timestamp = Date.now();
    const key = `pr-scans/${safePrCode}_${timestamp}.${ext}`;

    const contentType =
      file.type ||
      (ext === "pdf"
        ? "application/pdf"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg");

    // Lưu vào Cloudflare R2
    await bucket.put(key, file.stream(), {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        originalName: file.name,
        prCode: safePrCode,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.username,
      },
    });

    const scanFileUrl = `/api/upload-scan?key=${encodeURIComponent(key)}`;

    // Cập nhật D1 nếu có prId
    if (env.DB) {
      await ensureScanTable(env.DB);
      try {
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, file_name TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_at TEXT NOT NULL, owner_user_id TEXT, document_type TEXT, expires_at TEXT, status TEXT, note TEXT)"
        ).run();
        const fileId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        await env.DB.prepare(
          "INSERT INTO files (id, entity_type, entity_id, file_name, object_key, content_type, size, uploaded_at, owner_user_id, document_type, expires_at, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            fileId,
            "pr",
            safePrCode,
            file.name,
            key,
            contentType,
            file.size,
            nowIso,
            user.username,
            "Bản scan PR",
            "",
            "Đã nhận",
            `Bản scan cho PR ${safePrCode}`
          )
          .run();
      } catch (e) {
        console.error("Lỗi đồng bộ files table từ upload-scan:", e);
      }

      if (prId) {
        try {
          await env.DB.prepare("UPDATE prs SET scan_file_url = ? WHERE id = ?").bind(scanFileUrl, Number(prId)).run();
        } catch (e) {
          console.error("Lỗi cập nhật bảng prs:", e);
        }
        try {
          await env.DB.prepare("UPDATE purchase_requests SET scan_file_url = ? WHERE id = ?").bind(scanFileUrl, Number(prId)).run();
        } catch (e) {
          console.error("Lỗi cập nhật bảng purchase_requests:", e);
        }
      }
    }

    return Response.json({
      ok: true,
      scan_file_url: scanFileUrl,
      url: scanFileUrl,
      key,
      fileName: file.name,
      size: file.size,
      contentType,
    });
  } catch (err: any) {
    console.error("Lỗi xử lý upload scan:", err);
    return Response.json(
      { error: err?.message || "Đã xảy ra lỗi khi lưu file lên Cloudflare R2" },
      { status: 500 }
    );
  }
}
