import { getCurrentUser } from "../../auth";
import { createFileShareToken, getFileShareRecord } from "../../share-file";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Yêu cầu đăng nhập để tạo link chia sẻ" }, { status: 401 });
    }
    const body = (await request.json()) as {
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
      entityType?: string;
      entityCode?: string;
      fileSize?: number;
    };
    const { fileUrl, fileName, fileType, entityType, entityCode, fileSize } = body;

    if (!fileUrl || !fileName) {
      return Response.json(
        { error: "Thiếu đường dẫn fileUrl hoặc tên fileName" },
        { status: 400 }
      );
    }
    if (
      fileUrl.includes("..") ||
      fileUrl.includes("snapshots/") ||
      fileUrl.includes("backups/") ||
      fileUrl.includes("updates/")
    ) {
      return Response.json({ error: "Đường dẫn không được phép chia sẻ" }, { status: 403 });
    }

    const { token, expiresAt } = await createFileShareToken({
      fileUrl,
      fileName,
      fileType,
      entityType,
      entityCode,
      fileSize,
    });

    const url = new URL(request.url);
    const origin = url.origin;
    const shareUrl = `${origin}/share/file/${token}`;

    return Response.json({
      ok: true,
      token,
      shareUrl,
      expiresAt,
    });
  } catch (error: any) {
    console.error("CREATE_SHARE_FILE_ERROR:", error);
    return Response.json(
      { error: error.message || "Lỗi tạo link chia sẻ file" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return Response.json({ error: "Thiếu tham số token" }, { status: 400 });
    }

    const record = await getFileShareRecord(token, true);
    if (!record) {
      return Response.json(
        { error: "Link chia sẻ không tồn tại hoặc đã hết hạn" },
        { status: 404 }
      );
    }

    const origin = url.origin;
    const streamUrl = `${origin}/api/share-file/stream?token=${token}`;
    const downloadUrl = `${origin}/api/share-file/stream?token=${token}&download=1`;

    return Response.json({
      ok: true,
      record: {
        token: record.token,
        fileName: record.file_name,
        fileType: record.file_type,
        entityType: record.entity_type,
        entityCode: record.entity_code,
        fileSize: record.file_size,
        createdAt: record.created_at,
        expiresAt: record.expires_at,
        viewCount: record.view_count,
      },
      streamUrl,
      downloadUrl,
    });
  } catch (error: any) {
    console.error("GET_SHARE_FILE_ERROR:", error);
    return Response.json(
      { error: error.message || "Lỗi đọc thông tin file chia sẻ" },
      { status: 500 }
    );
  }
}
