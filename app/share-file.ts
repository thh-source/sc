import { getCurrentUser } from "./auth";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function ensureFileShareSchema() {
  const env = await bindings();
  if (!env?.DB) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS file_share_links (
      token TEXT PRIMARY KEY,
      file_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      entity_type TEXT,
      entity_code TEXT,
      file_size INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      owner_user_id TEXT,
      view_count INTEGER DEFAULT 0
    )`
  ).run();
}

export interface FileShareRecord {
  token: string;
  file_url: string;
  file_name: string;
  file_type: string;
  entity_type?: string;
  entity_code?: string;
  file_size?: number;
  created_at: string;
  expires_at: string;
  owner_user_id?: string;
  view_count: number;
}

export async function createFileShareToken(params: {
  fileUrl: string;
  fileName: string;
  fileType?: string;
  entityType?: string;
  entityCode?: string;
  fileSize?: number;
}): Promise<{ token: string; expiresAt: string }> {
  await ensureFileShareSchema();
  const env = await bindings();
  const user = await getCurrentUser().catch(() => null);

  const rawBytes = new Uint8Array(16);
  crypto.getRandomValues(rawBytes);
  const token =
    "sfl_" +
    Array.from(rawBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const now = new Date();
  // Thời hạn mặc định 60 ngày
  const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const fileType = params.fileType || (params.fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");

  await env.DB.prepare(
    `INSERT INTO file_share_links 
      (token, file_url, file_name, file_type, entity_type, entity_code, file_size, created_at, expires_at, owner_user_id, view_count) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  )
    .bind(
      token,
      params.fileUrl,
      params.fileName,
      fileType,
      params.entityType || null,
      params.entityCode || null,
      params.fileSize || 0,
      now.toISOString(),
      expiresAt,
      user?.id || null
    )
    .run();

  return { token, expiresAt };
}

export async function getFileShareRecord(
  token: string,
  incrementView = false
): Promise<FileShareRecord | null> {
  if (!token || !token.startsWith("sfl_")) return null;
  await ensureFileShareSchema();
  const env = await bindings();
  const now = new Date().toISOString();

  const record = await env.DB.prepare(
    `SELECT * FROM file_share_links WHERE token = ? AND expires_at > ?`
  )
    .bind(token, now)
    .first<FileShareRecord>();

  if (!record) return null;

  if (incrementView) {
    try {
      await env.DB.prepare(
        `UPDATE file_share_links SET view_count = view_count + 1 WHERE token = ?`
      )
        .bind(token)
        .run();
    } catch {}
  }

  return record;
}
