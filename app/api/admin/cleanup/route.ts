import { requireAdmin } from "../../../auth";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function runAutoClean(bucket: any, db?: any) {
  if (!bucket || typeof bucket.list !== "function") {
    return { success: false, deletedCount: 0, freedBytes: 0, deletedKeys: [] };
  }

  const deletedKeys: string[] = [];
  let freedBytes = 0;

  try {
    // 1. Quét toàn bộ bucket để tìm các file không cần thiết
    const listResult = await bucket.list({ limit: 1000 });
    const objects = listResult.objects || [];

    // Tìm phiên bản OTA mới nhất để giữ lại
    let latestUpdateVersion = "1.1.3";
    if (db) {
      try {
        const row = (await db
          .prepare(
            "SELECT value FROM system_configs WHERE key = 'app_version'"
          )
          .first()) as { value: string } | null;
        if (row?.value) {
          const parsed = JSON.parse(row.value);
          if (parsed.latestVersion) latestUpdateVersion = parsed.latestVersion;
        }
      } catch {}
    }

    const latestUpdateKey = `updates/v${latestUpdateVersion}.zip`;

    for (const obj of objects) {
      const key = String(obj.key || "");
      const size = Number(obj.size || 0);
      let shouldDelete = false;

      // a) File đệm xem trước CamScanner (chỉ lưu trên máy client)
      if (key.startsWith("cs-preview-cache/")) {
        shouldDelete = true;
      }
      // b) File sao lưu mã nguồn thủ công cũ trong backups/
      else if (key.startsWith("backups/")) {
        shouldDelete = true;
      }
      // c) File tài liệu kỹ thuật tĩnh docs/ (đã có trong Git)
      else if (key.startsWith("docs/")) {
        shouldDelete = true;
      }
      // d) Bản cập nhật OTA cũ (chỉ giữ lại bản mới nhất)
      else if (
        key.startsWith("updates/") &&
        key.endsWith(".zip") &&
        key !== latestUpdateKey
      ) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        try {
          await bucket.delete(key);
          deletedKeys.push(key);
          freedBytes += size;
        } catch (e) {
          console.error(`Không thể xóa ${key}:`, e);
        }
      }
    }

    return {
      success: true,
      deletedCount: deletedKeys.length,
      freedBytes,
      deletedKeys,
    };
  } catch (err: any) {
    console.error("Lỗi tự động dọn dẹp R2:", err);
    return {
      success: false,
      deletedCount: deletedKeys.length,
      freedBytes,
      deletedKeys,
      error: err.message,
    };
  }
}

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  const env = await bindings();
  const bucket = env.R2_BUCKET || env.BUCKET;
  const result = await runAutoClean(bucket, env.DB);

  return Response.json(result);
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  const env = await bindings();
  const bucket = env.R2_BUCKET || env.BUCKET;
  if (!bucket) {
    return Response.json({ error: "Chưa cấu hình R2 Bucket" }, { status: 500 });
  }

  const list = await bucket.list({ limit: 1000 });
  const objects = list.objects || [];

  const candidates: { key: string; size: number; reason: string }[] = [];

  for (const obj of objects) {
    const key = String(obj.key || "");
    const size = Number(obj.size || 0);

    if (key.startsWith("cs-preview-cache/")) {
      candidates.push({
        key,
        size,
        reason: "File đệm xem trước CamScanner tạm thời",
      });
    } else if (key.startsWith("backups/")) {
      candidates.push({
        key,
        size,
        reason: "File sao lưu mã nguồn thủ công cũ không dùng",
      });
    } else if (key.startsWith("docs/")) {
      candidates.push({
        key,
        size,
        reason: "File tài liệu đặc tả (đã có trong mã nguồn Git)",
      });
    } else if (
      key.startsWith("updates/") &&
      key.endsWith(".zip") &&
      key !== "updates/v1.1.3.zip"
    ) {
      candidates.push({
        key,
        size,
        reason: "Bản nén OTA cũ (đã có bản mới hơn v1.1.3)",
      });
    }
  }

  return Response.json({
    totalCandidates: candidates.length,
    candidateBytes: candidates.reduce((s, c) => s + c.size, 0),
    candidates,
  });
}
