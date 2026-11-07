import { getCurrentUser } from "../../auth";

const CS_API_BASE = "https://ai-tools.camscanner.com";
const CS_USER_AGENT = "camscanner-cli/v1.1.9 (windows/amd64)";
const CS_AGENT_HEADER = "clawhub";

async function getBindings() {
  return (await import("cloudflare:workers")).env;
}

async function ensureCamScannerTable(db: any) {
  if (!db) return;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS camscanner_tokens (
          user_key TEXT PRIMARY KEY,
          token TEXT NOT NULL,
          cs_user_id TEXT,
          expires_at INTEGER,
          updated_at TEXT
        )`
      )
      .run();
  } catch (e) {
    console.error("ensureCamScannerTable error:", e);
  }
}

async function getSavedTokenRecord(db: any, userKey: string) {
  if (!db) return null;
  await ensureCamScannerTable(db);
  try {
    const row = await db
      .prepare("SELECT * FROM camscanner_tokens WHERE user_key = ? LIMIT 1")
      .bind(userKey)
      .first();
    if (row && row.token) return row;
    const fallback = await db
      .prepare("SELECT * FROM camscanner_tokens ORDER BY updated_at DESC LIMIT 1")
      .first();
    return fallback || null;
  } catch {
    return null;
  }
}

async function saveTokenRecord(
  db: any,
  userKey: string,
  token: string,
  csUserId: string,
  expiresAt: number
) {
  if (!db || !token) return;
  await ensureCamScannerTable(db);
  const nowIso = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO camscanner_tokens (user_key, token, cs_user_id, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_key) DO UPDATE SET
           token = excluded.token,
           cs_user_id = excluded.cs_user_id,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`
      )
      .bind(userKey, token, csUserId || "", expiresAt || 0, nowIso)
      .run();
  } catch (e) {
    console.error("saveTokenRecord error:", e);
  }
}

async function refreshCamScannerToken(
  db: any,
  userKey: string,
  currentToken: string
): Promise<{ token: string; csUserId?: string; expiresAt?: number } | null> {
  try {
    const res = await fetch(`${CS_API_BASE}/auth/user/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": CS_USER_AGENT,
        "X-IS-AGENT": CS_AGENT_HEADER,
      },
      body: JSON.stringify({ token: currentToken }),
    });
    if (!res.ok) {
      return { token: currentToken };
    }
    const data: any = await res.json();
    const newToken = data.token || currentToken;
    const csUserId = data.user_id || "";
    const expiresAt =
      Number(data.expires_at) ||
      (data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : 0);

    if (newToken && db) {
      await saveTokenRecord(db, userKey, newToken, csUserId, expiresAt);
    }
    return { token: newToken, csUserId, expiresAt };
  } catch {
    return { token: currentToken };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "status";
    const env = await getBindings();
    const user = await getCurrentUser().catch(() => null);
    const userKey = user?.username || "default";
    const headerToken = request.headers.get("x-cs-token") || "";

    if (action === "poll") {
      const code = url.searchParams.get("code") || "";
      if (!code) {
        return Response.json({ error: "Thiếu mã code xác thực CamScanner" }, { status: 400 });
      }
      const res = await fetch(
        `${CS_API_BASE}/auth/user/status?code=${encodeURIComponent(code)}`,
        {
          method: "GET",
          headers: {
            "User-Agent": CS_USER_AGENT,
            "X-IS-AGENT": CS_AGENT_HEADER,
          },
        }
      );
      if (!res.ok) {
        return Response.json({ ok: true, status: "pending" });
      }
      const data: any = await res.json();
      if (data.status === "authorized" && data.token) {
        const expiresAt =
          Number(data.expires_at) ||
          (data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : 0);
        await saveTokenRecord(env.DB, userKey, data.token, data.user_id || "", expiresAt);
        return Response.json({
          ok: true,
          status: "authorized",
          token: data.token,
          csUserId: data.user_id || "",
          expiresAt,
        });
      }
      return Response.json({
        ok: true,
        status: data.status || "pending",
      });
    }

    // Default: check status
    const saved = await getSavedTokenRecord(env.DB, userKey);
    const tokenToCheck = headerToken || saved?.token || "";
    if (!tokenToCheck) {
      return Response.json({
        ok: true,
        authenticated: false,
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (saved?.expires_at && Number(saved.expires_at) > 0 && Number(saved.expires_at) < nowSec) {
      return Response.json({
        ok: true,
        authenticated: false,
        expired: true,
      });
    }

    return Response.json({
      ok: true,
      authenticated: true,
      csUserId: saved?.cs_user_id || "",
      expiresAt: saved?.expires_at || 0,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || "Lỗi kiểm tra kết nối CamScanner" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const env = await getBindings();
    const user = await getCurrentUser().catch(() => null);
    const userKey = user?.username || "default";
    const body: any = await request.json().catch(() => ({}));
    const action = body.action || "search";
    const headerToken = request.headers.get("x-cs-token") || body.token || "";

    // 1. Lấy mã đăng nhập (login-code) -> mở trang uỷ quyền chính thức của CamScanner
    if (action === "login-code") {
      const res = await fetch(`${CS_API_BASE}/auth/user/code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": CS_USER_AGENT,
          "X-IS-AGENT": CS_AGENT_HEADER,
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        return Response.json(
          { error: `Không thể khởi tạo phiên đăng nhập CamScanner (${res.status}): ${txt}` },
          { status: 502 }
        );
      }
      const data: any = await res.json();
      const code = data.code;
      const callbackUrl = `${CS_API_BASE}/auth/user/callback?code=${encodeURIComponent(code)}`;
      const loginUrl = `https://www.camscanner.com/agent-auth?from=${encodeURIComponent(
        callbackUrl
      )}`;
      return Response.json({
        ok: true,
        code,
        loginUrl,
        expiresIn: data.expires_in || 300,
      });
    }

    // 2. Đăng xuất tài khoản CamScanner
    if (action === "logout") {
      if (env.DB) {
        await ensureCamScannerTable(env.DB);
        await env.DB.prepare("DELETE FROM camscanner_tokens").run().catch(() => {});
      }
      return Response.json({ ok: true });
    }

    // Các thao tác bên dưới yêu cầu Token đã đăng nhập
    const saved = await getSavedTokenRecord(env.DB, userKey);
    const rawToken = headerToken || saved?.token || "";
    if (!rawToken) {
      return Response.json(
        { error: "Chưa kết nối tài khoản CamScanner. Vui lòng bấm Đăng nhập CamScanner." },
        { status: 401 }
      );
    }

    const refreshed = await refreshCamScannerToken(env.DB, userKey, rawToken);
    const activeToken = refreshed?.token || rawToken;

    // 3. Lấy danh sách thư mục trên Cloud CamScanner
    if (action === "dirs") {
      const res = await fetch(
        `${CS_API_BASE}/v1/tools/query_cloud_dir/execute?channel=camscanner-cli`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${activeToken}`,
            "Content-Type": "application/json",
            "User-Agent": CS_USER_AGENT,
            "X-IS-AGENT": CS_AGENT_HEADER,
          },
          body: JSON.stringify({}),
        }
      );
      if (res.status === 401) {
        return Response.json(
          { error: "Phiên đăng nhập CamScanner đã hết hạn, vui lòng kết nối lại." },
          { status: 401 }
        );
      }
      const data: any = await res.json();
      const dirs = data?.tool_result?.data?.dirs || data?.data?.tool_result?.dirs || [];
      return Response.json({
        ok: true,
        dirs,
      });
    }

    // 4. Tìm kiếm / Liệt kê tài liệu trên Cloud CamScanner
    if (action === "search") {
      const keyword = String(body.keyword || "").trim();
      const limit = Math.min(50, Math.max(1, Number(body.limit) || 30));
      const scope = body.scope === "full" ? "full" : "title";
      const docType = String(body.docType || "").trim();

      const payload: Record<string, any> = {
        keyword,
        limit,
        search_scope: scope,
      };
      if (docType && docType !== "all") {
        payload.doc_type = docType;
      }

      const res = await fetch(
        `${CS_API_BASE}/v1/tools/search_cloud_doc/execute?channel=camscanner-cli`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${activeToken}`,
            "Content-Type": "application/json",
            "User-Agent": CS_USER_AGENT,
            "X-IS-AGENT": CS_AGENT_HEADER,
          },
          body: JSON.stringify(payload),
        }
      );

      if (res.status === 401) {
        return Response.json(
          { error: "Phiên đăng nhập CamScanner đã hết hạn, vui lòng đăng nhập lại." },
          { status: 401 }
        );
      }

      const data: any = await res.json();
      if (!res.ok || data?.tool_result?.success === false) {
        const errMsg =
          data?.tool_result?.error ||
          data?.error ||
          "Không thể truy vấn danh sách tài liệu từ CamScanner Cloud";
        return Response.json({ error: errMsg }, { status: 400 });
      }

      const resultData = data?.tool_result?.data || data?.data?.tool_result || {};
      const docs = Array.isArray(resultData.docs) ? resultData.docs : [];
      const total = Number(resultData.total) || docs.length;

      return Response.json({
        ok: true,
        total,
        docs,
      });
    }

    // 5. Tải trực tiếp tài liệu từ CamScanner Cloud vào hệ thống R2 (PR / Hóa đơn / Bàn giao / Kho dữ liệu)
    if (action === "import") {
      const csDocId = String(body.csDocId || "").trim();
      const docTitle = String(body.title || csDocId || "CamScanner_Doc").trim();
      const prCode = String(body.prCode || docTitle || "CS").trim();
      const prId = body.prId;
      const targetType = String(body.targetType || "scan").trim();
      const workspaceId = String(body.workspaceId || "phenikaa").trim();
      const entityType = String(body.entityType || "pr").trim();
      const entityId = String(body.entityId || prCode || "KHO_DU_LIEU").trim();
      const documentType = String(body.documentType || "PR").trim();
      const note = String(body.note || "Đồng bộ từ CamScanner Cloud").trim();

      if (!csDocId) {
        return Response.json({ error: "Thiếu mã tài liệu CamScanner (cs_doc_id)" }, { status: 400 });
      }

      const bucket = env.R2_BUCKET || env.BUCKET;
      if (!bucket) {
        return Response.json({ error: "R2 Bucket chưa được cấu hình" }, { status: 500 });
      }

      const dlRes = await fetch(
        `${CS_API_BASE}/v1/tools/download_cloud_doc/execute?channel=camscanner-cli&output_mode=raw`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${activeToken}`,
            "Content-Type": "application/json",
            "User-Agent": CS_USER_AGENT,
            "X-IS-AGENT": CS_AGENT_HEADER,
          },
          body: JSON.stringify({ doc_id: csDocId }),
        }
      );

      if (!dlRes.ok) {
        const errText = await dlRes.text().catch(() => "");
        return Response.json(
          {
            error: `Không thể tải tài liệu từ CamScanner Cloud (${dlRes.status}): ${errText.slice(0, 200)}`,
          },
          { status: 502 }
        );
      }

      const fileBuffer = await dlRes.arrayBuffer();
      const byteSize = fileBuffer.byteLength;
      if (byteSize === 0) {
        return Response.json(
          { error: "File tải về từ CamScanner Cloud bị rỗng" },
          { status: 502 }
        );
      }

      // Xác định định dạng file (mặc định là PDF đối với bản scan CamScanner)
      let ext = "pdf";
      let contentType = dlRes.headers.get("content-type") || "application/pdf";
      if (csDocId.endsWith("_word1") || contentType.includes("word")) {
        ext = "docx";
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (csDocId.endsWith("_exce1") || contentType.includes("excel") || contentType.includes("spreadsheet")) {
        ext = "xlsx";
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (contentType.includes("jpeg") || contentType.includes("jpg")) {
        ext = "jpg";
        contentType = "image/jpeg";
      } else if (contentType.includes("png")) {
        ext = "png";
        contentType = "image/png";
      } else {
        ext = "pdf";
        contentType = "application/pdf";
      }

      const safeCode = prCode.replace(/[^a-zA-Z0-9_-]/g, "_") || "CS";
      const timestamp = Date.now();
      const cleanFileName = docTitle.toLowerCase().endsWith(`.${ext}`)
        ? docTitle
        : `${docTitle}.${ext}`;

      if (targetType === "vault") {
        const id = crypto.randomUUID();
        const safe = cleanFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `${workspaceId}/${entityType}/${entityId}/${id}-${safe}`;
        const now = new Date().toISOString();
        await bucket.put(key, fileBuffer, {
          httpMetadata: { contentType },
          customMetadata: {
            originalName: cleanFileName,
            entityType,
            entityId,
            csDocId,
          },
        });
        if (env.DB) {
          try {
            await env.DB
              .prepare(
                "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, file_name TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_at TEXT NOT NULL, owner_user_id TEXT, document_type TEXT, expires_at TEXT, status TEXT, note TEXT)"
              )
              .run();
            await env.DB
              .prepare(
                "INSERT INTO files (id,entity_type,entity_id,file_name,object_key,content_type,size,uploaded_at,owner_user_id,document_type,expires_at,status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
              )
              .bind(
                id,
                entityType,
                entityId,
                cleanFileName,
                key,
                contentType,
                byteSize,
                now,
                workspaceId,
                documentType,
                "",
                "Đã nhận",
                note
              )
              .run();
          } catch (e) {
            console.error("Insert CamScanner file into D1 files error:", e);
          }
        }
        const fileUrl = `/api/files/${encodeURIComponent(id)}`;
        return Response.json({
          ok: true,
          scan_file_url: fileUrl,
          url: fileUrl,
          fileId: id,
          fileName: cleanFileName,
          size: byteSize,
          contentType,
        });
      }

      const key = `pr-scans/${safeCode}_${timestamp}.${ext}`;
      await bucket.put(key, fileBuffer, {
        httpMetadata: { contentType },
        customMetadata: {
          originalName: cleanFileName,
          prCode: safeCode,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.username || "camscanner",
          csDocId,
        },
      });

      const scanFileUrl = `/api/upload-scan?key=${encodeURIComponent(key)}`;

      // Nếu gắn trực tiếp vào PR thì cập nhật luôn bảng prs trong D1
      if (env.DB && prId) {
        try {
          await env.DB
            .prepare("UPDATE prs SET scan_file_url = ? WHERE id = ?")
            .bind(scanFileUrl, Number(prId))
            .run();
        } catch {}
        try {
          await env.DB
            .prepare("UPDATE purchase_requests SET scan_file_url = ? WHERE id = ?")
            .bind(scanFileUrl, Number(prId))
            .run();
        } catch {}
      }

      return Response.json({
        ok: true,
        scan_file_url: scanFileUrl,
        url: scanFileUrl,
        key,
        fileName: cleanFileName,
        size: byteSize,
        contentType,
      });
    }

    return Response.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("CamScanner API route error:", err);
    return Response.json(
      { error: err?.message || "Lỗi xử lý kết nối CamScanner Cloud" },
      { status: 500 }
    );
  }
}
