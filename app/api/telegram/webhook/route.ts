import { getCurrentUser } from "../../../auth";
import { processTelegramUpdate, runScheduledBriefing } from "../../../telegram";

async function getBindings() {
  try {
    const { env } = await import("cloudflare:workers");
    return env as any;
  } catch {
    return (globalThis as any).__env || {};
  }
}

/**
 * GET /api/telegram/webhook: Kiểm tra trạng thái hoạt động của Webhook
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const env = await getBindings();

  // Cho phép test chạy cron thủ công qua query ?action=test_cron (yêu cầu admin/master)
  if (action === "test_cron") {
    const user = await getCurrentUser();
    if (!user || (user.role !== "master" && user.role !== "admin")) {
      return Response.json({ ok: false, error: "Không có quyền kích hoạt cron" }, { status: 403 });
    }
    try {
      await runScheduledBriefing(env);
      return Response.json({ ok: true, message: "Đã kích hoạt gửi bản tin nhắc việc thành công!" });
    } catch (e: any) {
      return Response.json({ ok: false, error: e?.message }, { status: 500 });
    }
  }

  return Response.json({
    ok: true,
    bot: "Pnksc_bot",
    service: "SCMH Telegram Assistant",
    status: "active",
    time: new Date().toISOString(),
  });
}

/**
 * POST /api/telegram/webhook: Tiếp nhận các sự kiện và tin nhắn từ Telegram
 */
export async function POST(request: Request) {
  try {
    const env = await getBindings();
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }
    const update = (await request.json()) as Parameters<typeof processTelegramUpdate>[0];

    // Xử lý update bất đồng bộ
    await processTelegramUpdate(update, env);

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error("Lỗi xử lý Telegram Webhook:", err);
    // Luôn trả về 200 OK cho Telegram để tránh Telegram retry spam
    return Response.json({ ok: false, error: err?.message || "Lỗi không xác định" });
  }
}
