async function getRuntimeBindings() {
  const { env } = await import("cloudflare:workers");
  return env as {
    R2_BUCKET?: R2Bucket;
    BUCKET?: R2Bucket;
  };
}

/**
 * GET /api/app-version/download?version=1.0.1: Tải file bundle ZIP từ Cloudflare R2
 */
export async function GET(request: Request) {
  try {
    const { R2_BUCKET, BUCKET } = await getRuntimeBindings();
    const bucket = R2_BUCKET || BUCKET;

    if (!bucket) {
      return new Response("R2 Bucket chưa được cấu hình", { status: 500 });
    }

    const url = new URL(request.url);
    const version = url.searchParams.get("version") || "1.0.1";

    // Tìm kiếm file theo các định dạng đặt tên phổ biến
    const candidateKeys = [
      `updates/v${version}.zip`,
      `updates/${version}.zip`,
      `updates/update.zip`,
    ];

    let object: R2ObjectBody | null = null;
    let foundKey = "";

    for (const key of candidateKeys) {
      object = await bucket.get(key);
      if (object) {
        foundKey = key;
        break;
      }
    }

    if (!object) {
      return new Response(`Không tìm thấy bản cập nhật v${version}`, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="update-v${version}.zip"`);
    headers.set("Cache-Control", "public, max-age=3600");
    headers.set("etag", object.httpEtag);

    return new Response(object.body, {
      headers,
    });
  } catch (err: any) {
    console.error("Lỗi download bundle từ R2:", err);
    return new Response(err.message || "Lỗi tải file", { status: 500 });
  }
}
