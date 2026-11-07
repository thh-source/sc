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

    // Xem trước (Stream inline PDF) trực tiếp từ CamScanner Cloud (có bộ nhớ đệm R2 siêu tốc)
    if (action === "preview") {
      const csDocId = (url.searchParams.get("csDocId") || "").trim();
      const queryToken = (url.searchParams.get("token") || "").trim();
      if (!csDocId) {
        return new Response("Thiếu mã tài liệu csDocId", { status: 400 });
      }

      const bucket = env.R2_BUCKET || env.BUCKET;
      const cacheKey = `cs-preview-cache/${csDocId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      // 1. Kiểm tra bộ nhớ đệm trên R2 trước (nếu đã từng xem trước thì phản hồi tức thì ~30ms)
      if (bucket) {
        try {
          const cachedObj = await bucket.get(cacheKey);
          if (cachedObj) {
            const ct = cachedObj.httpMetadata?.contentType || "application/pdf";
            return new Response(cachedObj.body, {
              headers: {
                "Content-Type": ct,
                "Content-Disposition": `inline; filename="${csDocId}.pdf"`,
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
        } catch {}
      }

      // 2. Lấy token CamScanner và tải bản xem trước
      const saved = await getSavedTokenRecord(env.DB, userKey);
      const rawToken = headerToken || queryToken || saved?.token || "";
      if (!rawToken) {
        return new Response("Chưa kết nối tài khoản CamScanner", { status: 401 });
      }

      const dlRes = await fetch(
        `${CS_API_BASE}/v1/tools/download_cloud_doc/execute?channel=camscanner-cli&output_mode=raw`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rawToken}`,
            "Content-Type": "application/json",
            "User-Agent": CS_USER_AGENT,
            "X-IS-AGENT": CS_AGENT_HEADER,
          },
          body: JSON.stringify({ doc_id: csDocId }),
        }
      );

      if (!dlRes.ok) {
        return new Response(`Không thể tải bản xem trước (${dlRes.status})`, { status: 502 });
      }

      const fileBuffer = await dlRes.arrayBuffer();
      const contentType = dlRes.headers.get("content-type") || "application/pdf";

      // Lưu vào R2 cache để lần di chuột sau hoặc khi bấm "Chọn bản scan này" dùng lại ngay lập tức
      if (bucket && fileBuffer.byteLength > 0) {
        try {
          await bucket.put(cacheKey, fileBuffer, {
            httpMetadata: { contentType },
          });
        } catch {}
      }

      return new Response(fileBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${csDocId}.pdf"`,
          "Cache-Control": "public, max-age=3600",
        },
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

    // 4. Tìm kiếm / Liệt kê tài liệu trên Cloud CamScanner (Hỗ trợ phân trang tự động lấy toàn bộ >270+ tài liệu)
    if (action === "search") {
      const keyword = String(body.keyword || "").trim();
      const scope = body.scope === "full" ? "full" : "title";
      const docType = String(body.docType || "").trim();
      const mode = String(body.mode || "fast").trim(); // "fast" (trang đầu 50 file + dirs) hoặc "all" (quét toàn bộ các trang còn lại)
      const initialEndTime = body.endTime ? Number(body.endTime) : undefined;

      const callCsSearch = async (extra: Record<string, any> = {}) => {
        const payload: Record<string, any> = {
          keyword,
          limit: 50,
          search_scope: scope,
          ...extra,
        };
        if (docType && docType !== "all") {
          payload.doc_type = docType;
        }

        for (let attempt = 0; attempt < 3; attempt++) {
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
            return { unauthorized: true, docs: [] as any[], error: "" };
          }
          if (res.status === 429 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }

          const data: any = await res.json().catch(() => ({}));
          if (!res.ok || data?.tool_result?.success === false) {
            const errMsg =
              data?.tool_result?.error ||
              data?.error ||
              "Không thể truy vấn danh sách tài liệu từ CamScanner Cloud";
            return { unauthorized: false, docs: [] as any[], error: errMsg };
          }

          const resultData = data?.tool_result?.data || data?.data?.tool_result || {};
          const docs = Array.isArray(resultData.docs) ? resultData.docs : [];
          return { unauthorized: false, docs, error: "" };
        }
        return { unauthorized: false, docs: [] as any[], error: "" };
      };

      // Chế độ "fast": Trả về ngay 50 file mới nhất + danh sách thư mục trong ~0.3s
      if (mode !== "all") {
        const [searchRes, dirRes] = await Promise.all([
          callCsSearch(initialEndTime ? { end_time: initialEndTime } : {}),
          fetch(`${CS_API_BASE}/v1/tools/query_cloud_dir/execute?channel=camscanner-cli`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${activeToken}`,
              "Content-Type": "application/json",
              "User-Agent": CS_USER_AGENT,
              "X-IS-AGENT": CS_AGENT_HEADER,
            },
            body: JSON.stringify({}),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);

        if (searchRes.unauthorized) {
          return Response.json(
            { error: "Phiên đăng nhập CamScanner đã hết hạn, vui lòng đăng nhập lại." },
            { status: 401 }
          );
        }
        if (searchRes.error && searchRes.docs.length === 0) {
          return Response.json({ error: searchRes.error }, { status: 400 });
        }

        const docs = searchRes.docs;
        const dirs =
          (dirRes as any)?.tool_result?.data?.dirs ||
          (dirRes as any)?.data?.tool_result?.dirs ||
          [];
        const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
        const nextEndTime = lastDoc ? Number(lastDoc.create_time) || Number(lastDoc.modify_time) || 0 : 0;

        return Response.json({
          ok: true,
          total: docs.length,
          docs,
          dirs,
          hasMore: docs.length === 50 && nextEndTime > 0,
          nextEndTime,
        });
      }

      // Chế độ "all": Quét toàn bộ các trang tiếp theo bằng end_time / start_time để lấy đủ 100% kho CamScanner
      const seenMap = new Map<string, any>();
      const addDocs = (list: any[]) => {
        for (const item of list) {
          if (item && item.cs_doc_id && !seenMap.has(item.cs_doc_id)) {
            seenMap.set(item.cs_doc_id, item);
          }
        }
      };

      if (Array.isArray(body.seedDocs)) {
        addDocs(body.seedDocs);
      }

      const fullPages: { endTime?: number; docs: any[] }[] = [];
      let cursorEndTime: number | undefined = initialEndTime;

      // Nếu đã có seedDocs (trang 1), thêm trang 1 vào fullPages để kiểm tra luôn khoảng thời gian giao thoa
      if (Array.isArray(body.seedDocs) && body.seedDocs.length === 50) {
        fullPages.push({ endTime: undefined, docs: body.seedDocs });
      }

      for (let page = 0; page < 15; page++) {
        const resPage = await callCsSearch(
          cursorEndTime !== undefined ? { end_time: cursorEndTime } : {}
        );
        if (resPage.unauthorized) {
          return Response.json(
            { error: "Phiên đăng nhập CamScanner đã hết hạn, vui lòng đăng nhập lại." },
            { status: 401 }
          );
        }
        const pageDocs = resPage.docs;
        if (pageDocs.length === 0) break;

        const sizeBefore = seenMap.size;
        addDocs(pageDocs);
        if (pageDocs.length === 50) {
          fullPages.push({ endTime: cursorEndTime, docs: pageDocs });
        }
        if (pageDocs.length < 50) break;

        const lastC =
          Number(pageDocs[pageDocs.length - 1].create_time) ||
          Number(pageDocs[pageDocs.length - 1].modify_time) ||
          0;
        if (!lastC) break;

        if (seenMap.size === sizeBefore || cursorEndTime === lastC) {
          cursorEndTime = lastC - 1;
        } else {
          cursorEndTime = lastC;
        }
      }

      // Quét bổ sung các cửa sổ có mật độ cao hoặc file tạo cũ nhưng di chuyển thư mục về sau
      for (const { endTime: pEnd, docs: pDocs } of fullPages) {
        const mods = pDocs
          .map((x) => Number(x.modify_time) || Number(x.create_time))
          .filter(Boolean)
          .sort((a, b) => a - b);
        if (mods.length === 0) continue;
        const minT = Math.min(Number(pDocs[pDocs.length - 1].create_time) || mods[0], mods[0]);
        const maxT = pEnd !== undefined ? pEnd : mods[mods.length - 1];
        const midT = mods[Math.floor(mods.length / 2)];

        if (midT >= minT && midT < maxT) {
          const lowRes = await callCsSearch({ start_time: minT, end_time: midT });
          addDocs(lowRes.docs);
          if (lowRes.docs.length === 50 && midT > minT) {
            const subMods = lowRes.docs
              .map((x) => Number(x.modify_time) || Number(x.create_time))
              .filter(Boolean)
              .sort((a, b) => a - b);
            const subMid =
              subMods.length > 0
                ? subMods[Math.floor(subMods.length / 2)]
                : Math.floor((minT + midT) / 2);
            if (subMid >= minT && subMid < midT) {
              const [s1, s2] = await Promise.all([
                callCsSearch({ start_time: minT, end_time: subMid }),
                callCsSearch({ start_time: subMid + 1, end_time: midT }),
              ]);
              addDocs(s1.docs);
              addDocs(s2.docs);
            }
          }
        }
      }

      const allDocs = Array.from(seenMap.values()).sort(
        (a, b) =>
          (Number(b.create_time) || Number(b.modify_time) || 0) -
          (Number(a.create_time) || Number(a.modify_time) || 0)
      );

      return Response.json({
        ok: true,
        total: allDocs.length,
        docs: allDocs,
        hasMore: false,
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

      const cacheKey = `cs-preview-cache/${csDocId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      let fileBuffer: ArrayBuffer | null = null;
      let rawContentType = "application/pdf";

      // Tận dụng ngay bản đã lưu trong bộ nhớ đệm R2 khi người dùng di chuột xem trước (nhanh tức thì)
      try {
        const cachedObj = await bucket.get(cacheKey);
        if (cachedObj) {
          fileBuffer = await cachedObj.arrayBuffer();
          rawContentType = cachedObj.httpMetadata?.contentType || "application/pdf";
        }
      } catch {}

      if (!fileBuffer || fileBuffer.byteLength === 0) {
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

        fileBuffer = await dlRes.arrayBuffer();
        rawContentType = dlRes.headers.get("content-type") || "application/pdf";
      }

      const byteSize = fileBuffer.byteLength;
      if (byteSize === 0) {
        return Response.json(
          { error: "File tải về từ CamScanner Cloud bị rỗng" },
          { status: 502 }
        );
      }

      // Xác định định dạng file (mặc định là PDF đối với bản scan CamScanner)
      let ext = "pdf";
      let contentType = rawContentType;
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
