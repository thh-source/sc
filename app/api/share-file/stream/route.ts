import { getFileShareRecord } from "../../../share-file";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const download = url.searchParams.get("download") === "1";

    if (!token) {
      return new Response("Thiếu tham số token", { status: 400 });
    }

    const record = await getFileShareRecord(token, !download);
    if (!record) {
      return new Response("Link chia sẻ không tồn tại hoặc đã hết hạn", { status: 404 });
    }

    const env = await bindings();
    const bucket = env.R2_BUCKET || env.BUCKET;
    if (!bucket) {
      return new Response("Hệ thống lưu trữ R2 chưa sẵn sàng", { status: 500 });
    }

    let r2Key = "";
    const rawUrl = record.file_url;

    if (rawUrl.includes("key=")) {
      try {
        const u = new URL(rawUrl, "http://localhost");
        r2Key = u.searchParams.get("key") || "";
      } catch {
        const match = rawUrl.match(/key=([^&]+)/);
        if (match) r2Key = decodeURIComponent(match[1]);
      }
    } else if (rawUrl.startsWith("/api/files/") || rawUrl.includes("/api/files/")) {
      const fileId = rawUrl.split("/api/files/")[1]?.split("?")[0];
      if (fileId && env.DB) {
        const row = await env.DB.prepare("SELECT object_key FROM files WHERE id = ?")
          .bind(decodeURIComponent(fileId))
          .first<{ object_key: string }>();
        if (row?.object_key) {
          r2Key = row.object_key;
        }
      }
    } else if (rawUrl.startsWith("pr-scans/")) {
      r2Key = rawUrl;
    } else {
      r2Key = rawUrl;
    }

    if (
      !r2Key ||
      r2Key.includes("..") ||
      r2Key.startsWith("snapshots/") ||
      r2Key.startsWith("backups/") ||
      r2Key.startsWith("updates/")
    ) {
      return new Response("Không có quyền truy cập file này", { status: 403 });
    }

    const object = await bucket.get(r2Key);
    if (!object) {
      return new Response("File không tồn tại trên hệ thống lưu trữ", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);

    const safeName = record.file_name || "tai-lieu";
    const encodedName = encodeURIComponent(safeName);

    headers.set("Content-Type", record.file_type || object.httpMetadata?.contentType || "application/octet-stream");
    
    if (download) {
      headers.set("Content-Disposition", `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
    } else {
      headers.set("Content-Disposition", `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
    }

    headers.set("Cache-Control", "public, max-age=86400");
    if (object.httpEtag) {
      headers.set("ETag", object.httpEtag);
    }

    return new Response(object.body, { headers });
  } catch (error: any) {
    console.error("STREAM_SHARE_FILE_ERROR:", error);
    return new Response(error.message || "Lỗi truy xuất file", { status: 500 });
  }
}
