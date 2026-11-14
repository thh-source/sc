import { createSession, setSessionCookie, verifySystemPassword } from "../../../auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = String(body.password || "").trim();
    if (!password) {
      return Response.json({ error: "Vui lòng nhập mật khẩu" }, { status: 400 });
    }
    const user = await verifySystemPassword(password);
    if (!user) {
      return Response.json(
        { error: "Mật khẩu hệ thống không đúng" },
        { status: 401 },
      );
    }
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expires);
    return Response.json({ user, token: session.token });
  } catch (error) {
    console.error("LOGIN_ERROR", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "MASTER_SECRET_MISSING") {
      return Response.json(
        { error: "Worker chưa nhận MASTER_ADMIN_PASSWORD" },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Lỗi kết nối D1 hoặc cấu hình Worker" },
      { status: 500 },
    );
  }
}
