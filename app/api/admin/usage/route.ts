import { requireAdmin } from "../../../auth";
import { runAutoClean } from "../cleanup/route";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

const D1_FREE_BYTES = 5 * 1024 * 1024 * 1024;
const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024;

async function ensureFiles() {
  const env = await bindings();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, file_name TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_at TEXT NOT NULL, owner_user_id TEXT)",
  ).run();
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  await ensureFiles();
  const env = await bindings();
  const [stateRows, fileRows, userRows] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(payload)),0) AS bytes, MAX(updated_at) AS updatedAt FROM app_state",
    ).first<{ count: number; bytes: number; updatedAt: string | null }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS bytes, MAX(uploaded_at) AS updatedAt FROM files",
    ).first<{ count: number; bytes: number; updatedAt: string | null }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
  ]);
  const dbBytes = Number(stateRows?.bytes || 0);

  // Quét trực tiếp Cloudflare R2 Bucket để lấy số lượng file và dung lượng thực tế 100%
  const bucket = env.R2_BUCKET || env.BUCKET;

  // Tự động dọn dẹp các tài liệu không cần lưu (cache tạm, bản OTA cũ, backup cũ)
  let cleanResult: any = null;
  if (bucket) {
    try {
      cleanResult = await runAutoClean(bucket, env.DB);
    } catch {}
  }

  let r2TotalBytes = 0;
  let r2FileCount = 0;
  let r2LatestUploaded: string | null = fileRows?.updatedAt || null;

  const breakdown = {
    prScans: { count: 0, bytes: 0 },
    vault: { count: 0, bytes: 0 },
    snapshots: { count: 0, bytes: 0 },
    apk: { count: 0, bytes: 0 },
    updates: { count: 0, bytes: 0 },
    backups: { count: 0, bytes: 0 },
    docs: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 },
  };

  const fileItems: {
    key: string;
    size: number;
    category: string;
    uploadedAt?: string;
  }[] = [];

  if (bucket && typeof bucket.list === "function") {
    try {
      let cursor: string | undefined = undefined;
      let totalB = 0;
      let count = 0;
      let latestTime = 0;
      do {
        const listResult: any = await bucket.list({ cursor, limit: 1000 });
        const objs = listResult?.objects || [];
        for (const obj of objs) {
          const key = String(obj.key || "");
          // Bản đệm xem trước CamScanner chỉ lưu trên máy client, tự động dọn dẹp khỏi R2 nếu còn sót
          if (key.startsWith("cs-preview-cache/")) {
            try {
              await bucket.delete(key);
            } catch {}
            continue;
          }

          count++;
          const objSize = Number(obj.size || 0);
          totalB += objSize;
          const upTime = obj.uploaded ? new Date(obj.uploaded).getTime() : 0;
          if (upTime > latestTime) {
            latestTime = upTime;
          }

          let category = "Khác";
          if (key.startsWith("pr-scans/")) {
            category = "Bản scan PR / chứng từ";
            breakdown.prScans.count++;
            breakdown.prScans.bytes += objSize;
          } else if (key.startsWith("snapshots/")) {
            category = "Bản sao lưu snapshot";
            breakdown.snapshots.count++;
            breakdown.snapshots.bytes += objSize;
          } else if (key.startsWith("apk/")) {
            category = "Bộ cài đặt APK Android";
            breakdown.apk.count++;
            breakdown.apk.bytes += objSize;
          } else if (key.startsWith("updates/")) {
            category = "Gói cập nhật OTA (.zip)";
            breakdown.updates.count++;
            breakdown.updates.bytes += objSize;
          } else if (key.startsWith("backups/")) {
            category = "Sao lưu mã nguồn & CSDL";
            breakdown.backups.count++;
            breakdown.backups.bytes += objSize;
          } else if (key.startsWith("docs/")) {
            category = "Tài liệu kỹ thuật hệ thống";
            breakdown.docs.count++;
            breakdown.docs.bytes += objSize;
          } else if (
            key.includes("/general/") ||
            key.includes("/pr/") ||
            key.includes("/po/") ||
            key.includes("/payment/")
          ) {
            category = "Kho dữ liệu (Data Vault)";
            breakdown.vault.count++;
            breakdown.vault.bytes += objSize;
          } else {
            category = "File khác";
            breakdown.other.count++;
            breakdown.other.bytes += objSize;
          }

          fileItems.push({
            key,
            size: objSize,
            category,
            uploadedAt: obj.uploaded
              ? new Date(obj.uploaded).toISOString()
              : undefined,
          });
        }
        cursor = listResult?.truncated ? listResult?.cursor : undefined;
      } while (cursor);

      r2TotalBytes = totalB;
      r2FileCount = count;
      if (latestTime > 0) {
        r2LatestUploaded = new Date(latestTime).toISOString();
      }
    } catch (err) {
      console.error("Lỗi quét R2 bucket trong /api/admin/usage:", err);
      r2TotalBytes = Number(fileRows?.bytes || 0);
      r2FileCount = Number(fileRows?.count || 0);
    }
  } else {
    r2TotalBytes = Number(fileRows?.bytes || 0);
    r2FileCount = Number(fileRows?.count || 0);
  }

  return Response.json({
    generatedAt: new Date().toISOString(),
    freeTier: {
      d1Bytes: D1_FREE_BYTES,
      r2Bytes: R2_FREE_BYTES,
      d1RowsReadPerDay: 5_000_000,
      d1RowsWrittenPerDay: 100_000,
      r2ClassAOperationsPerMonth: 1_000_000,
      r2ClassBOperationsPerMonth: 10_000_000,
    },
    d1: {
      estimatedBytes: dbBytes,
      remainingBytes: Math.max(0, D1_FREE_BYTES - dbBytes),
      usedPercent: (dbBytes / D1_FREE_BYTES) * 100,
      stateRecords: Number(stateRows?.count || 0),
      users: Number(userRows?.count || 0),
      updatedAt: stateRows?.updatedAt,
    },
    r2: {
      estimatedBytes: r2TotalBytes,
      remainingBytes: Math.max(0, R2_FREE_BYTES - r2TotalBytes),
      usedPercent: (r2TotalBytes / R2_FREE_BYTES) * 100,
      fileCount: r2FileCount,
      updatedAt: r2LatestUploaded,
      breakdown,
      items: fileItems,
      cleanResult:
        cleanResult && cleanResult.deletedCount > 0 ? cleanResult : undefined,
    },
  });
}
