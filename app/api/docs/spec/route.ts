async function getRuntimeBindings() {
  const { env } = await import("cloudflare:workers");
  return env as {
    R2_BUCKET?: R2Bucket;
    BUCKET?: R2Bucket;
  };
}

/**
 * GET /api/docs/spec: Tải trực tiếp file đặc tả SYSTEM_ARCHITECTURE_SPEC.md từ Cloudflare R2
 */
export async function GET(request: Request) {
  try {
    const { R2_BUCKET, BUCKET } = await getRuntimeBindings();
    const bucket = R2_BUCKET || BUCKET;

    if (!bucket) {
      return new Response("R2 Bucket chưa được cấu hình", { status: 500 });
    }

    const object = await bucket.get("docs/SYSTEM_ARCHITECTURE_SPEC.md");
    if (!object) {
      return new Response("Không tìm thấy file tài liệu đặc tả", { status: 404 });
    }

    return new Response(object.body as any, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="SYSTEM_ARCHITECTURE_SPEC.md"',
        "Content-Length": String(object.size),
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return new Response("Lỗi tải file đặc tả: " + err.message, { status: 500 });
  }
}
