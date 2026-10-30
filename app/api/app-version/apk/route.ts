async function getRuntimeBindings() {
  const { env } = await import("cloudflare:workers");
  return env as {
    R2_BUCKET?: R2Bucket;
    BUCKET?: R2Bucket;
  };
}

/**
 * GET /api/app-version/apk: Tải trực tiếp file APK Android mới nhất từ Cloudflare R2
 */
export async function GET(request: Request) {
  try {
    const { R2_BUCKET, BUCKET } = await getRuntimeBindings();
    const bucket = R2_BUCKET || BUCKET;

    if (!bucket) {
      return new Response("R2 Bucket chưa được cấu hình", { status: 500 });
    }

    const url = new URL(request.url);
    const version = url.searchParams.get("version") || "1.1.3";

    const candidateApkKeys = [
      `apk/Phenikaa_Procurement_App.apk`,
      `apk/Phenikaa_Procurement_App_v${version}.apk`,
      `apk/Phenikaa-MuaHang.apk`,
      `apk/app-debug.apk`,
    ];

    let object: R2ObjectBody | null = null;
    let foundKey = "";

    for (const key of candidateApkKeys) {
      object = await bucket.get(key);
      if (object) {
        foundKey = key;
        break;
      }
    }

    if (!object) {
      return new Response(`Không tìm thấy file APK cài đặt trên máy chủ R2`, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", "application/vnd.android.package-archive");
    headers.set(
      "Content-Disposition",
      `attachment; filename="Phenikaa_Procurement_App_v${version}.apk"`
    );
    headers.set("Cache-Control", "public, max-age=3600");
    headers.set("etag", object.httpEtag);

    return new Response(object.body, { headers });
  } catch (err: any) {
    console.error("Lỗi download APK từ R2:", err);
    return new Response(err.message || "Lỗi tải file APK", { status: 500 });
  }
}
