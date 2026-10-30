async function getRuntimeBindings() {
  const { env } = await import("cloudflare:workers");
  return env as {
    R2_BUCKET?: R2Bucket;
    BUCKET?: R2Bucket;
  };
}

/**
 * GET /api/app-version/download?version=1.1.3: Tải file bundle ZIP OTA hoặc file APK Android từ Cloudflare R2
 * - Tham số:
 *   - ?type=apk: Tải trực tiếp file cài đặt APK Android (.apk)
 *   - ?version=x.x.x: Chọn phiên bản (mặc định bản mới nhất)
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
    const type = url.searchParams.get("type") || url.searchParams.get("format");

    let object: R2ObjectBody | null = null;
    let foundKey = "";

    // 1. Nếu yêu cầu tải APK cài đặt Android
    if (type === "apk" || url.pathname.endsWith(".apk")) {
      const candidateApkKeys = [
        `apk/Phenikaa_Procurement_App.apk`,
        `apk/Phenikaa_Procurement_App_v${version}.apk`,
        `apk/Phenikaa-MuaHang.apk`,
        `apk/app-debug.apk`,
      ];

      for (const key of candidateApkKeys) {
        object = await bucket.get(key);
        if (object) {
          foundKey = key;
          break;
        }
      }

      if (!object) {
        return new Response(`Không tìm thấy file cài đặt APK v${version}`, { status: 404 });
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
    }

    // 2. Mặc định tải file ZIP OTA Update
    const candidateKeys = [
      `updates/v${version}.zip`,
      `updates/${version}.zip`,
      `updates/update.zip`,
    ];

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
