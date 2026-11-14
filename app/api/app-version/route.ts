import { getCurrentUser } from "../../auth";

async function getRuntimeBindings() {
  const { env } = await import("cloudflare:workers");
  return env as {
    DB: D1Database;
    R2_BUCKET?: R2Bucket;
    BUCKET?: R2Bucket;
  };
}

async function ensureConfigTable(db: D1Database) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS system_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)
    .run();
}

const DEFAULT_APP_VERSION = {
  latestVersion: "1.0.1",
  versionName: "Phenikaa SCMH v1.0.1 (Bản chính thức)",
  buildNumber: "20261028.01",
  buildDate: "28/10/2026, 07:15:00",
  minSupportedVersion: "1.0.0",
  downloadUrl: "https://pnk.sc-pnk.workers.dev/api/app-version/download?version=1.0.1",
  checksum: "",
  releaseNotes: "Cập nhật tính năng OTA Update từ xa, tự động đồng bộ Todo List D1, tối ưu hóa giao diện bàn giao PO và chế độ Offline-First",
};

/**
 * GET /api/app-version: Lấy thông tin phiên bản mới nhất cho ứng dụng di động
 */
export async function GET(request: Request) {
  try {
    const { DB } = await getRuntimeBindings();
    await ensureConfigTable(DB);

    const row = await DB.prepare("SELECT value FROM system_configs WHERE key = 'app_version'").first<{ value: string }>();

    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        return Response.json(parsed);
      } catch {}
    }

    return Response.json(DEFAULT_APP_VERSION);
  } catch (err: any) {
    console.error("Lỗi GET /api/app-version:", err);
    return Response.json(DEFAULT_APP_VERSION);
  }
}

/**
 * POST /api/app-version: Cập nhật phiên bản ứng dụng mới từ script deploy hoặc admin
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Yêu cầu đăng nhập" }, { status: 401 });
    }
    if (user.role !== "master" && user.role !== "admin") {
      return Response.json({ error: "Không có quyền cập nhật phiên bản" }, { status: 403 });
    }

    const { DB, R2_BUCKET, BUCKET } = await getRuntimeBindings();
    const bucket = R2_BUCKET || BUCKET;
    await ensureConfigTable(DB);

    const contentType = request.headers.get("content-type") || "";

    // 1. Trường hợp upload file ZIP trực tiếp (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const version = (formData.get("version") as string) || "1.0.1";
      const notes = (formData.get("releaseNotes") as string) || "Cập nhật ứng dụng";

      if (!file) {
        return Response.json({ error: "Không tìm thấy file zip bundle" }, { status: 400 });
      }

      if (!bucket) {
        return Response.json({ error: "R2 Bucket chưa được binding" }, { status: 500 });
      }

      const fileBuffer = await file.arrayBuffer();
      const objectKey = `updates/v${version}.zip`;

      await bucket.put(objectKey, fileBuffer, {
        httpMetadata: {
          contentType: "application/zip",
        },
      });

      const versionPayload = {
        latestVersion: version,
        versionName: (formData.get("versionName") as string) || `Phenikaa SCMH v${version} (Bản chính thức)`,
        buildNumber: (formData.get("buildNumber") as string) || `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.01`,
        buildDate: (formData.get("buildDate") as string) || new Date().toLocaleString("vi-VN"),
        minSupportedVersion: "1.0.0",
        downloadUrl: `https://pnk.sc-pnk.workers.dev/api/app-version/download?version=${encodeURIComponent(version)}`,
        checksum: "",
        releaseNotes: notes,
        updatedAt: new Date().toISOString(),
      };

      await DB.prepare(
        `INSERT INTO system_configs (key, value, updated_at)
         VALUES ('app_version', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
      )
        .bind(JSON.stringify(versionPayload))
        .run();

      return Response.json({ success: true, ...versionPayload });
    }

    // 2. Trường hợp cập nhật metadata (application/json)
    const body = (await request.json()) as any;
    const version = body.latestVersion || body.version || "1.0.1";
    const downloadUrl =
      body.downloadUrl ||
      `https://quan-ly-mua-hang.sc-pnk.workers.dev/api/app-version/download?version=${encodeURIComponent(version)}`;

    const versionPayload = {
      latestVersion: version,
      versionName: body.versionName || `Phenikaa SCMH v${version} (Bản chính thức)`,
      buildNumber: body.buildNumber || `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.01`,
      buildDate: body.buildDate || new Date().toLocaleString("vi-VN"),
      minSupportedVersion: body.minSupportedVersion || "1.0.0",
      downloadUrl,
      checksum: body.checksum || "",
      releaseNotes: body.releaseNotes || "Bản cập nhật mới",
      updatedAt: new Date().toISOString(),
    };

    await DB.prepare(
      `INSERT INTO system_configs (key, value, updated_at)
       VALUES ('app_version', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    )
      .bind(JSON.stringify(versionPayload))
      .run();

    return Response.json({ success: true, ...versionPayload });
  } catch (err: any) {
    console.error("Lỗi POST /api/app-version:", err);
    return Response.json({ error: err.message || "Lỗi máy chủ" }, { status: 500 });
  }
}
