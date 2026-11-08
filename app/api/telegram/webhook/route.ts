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

  // Cho phép test chạy cron thủ công qua query ?action=test_cron
  if (action === "test_cron") {
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
    const update = await request.json();

    // Xử lý update bất đồng bộ
    await processTelegramUpdate(update, env);

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error("Lỗi xử lý Telegram Webhook:", err);
    // Luôn trả về 200 OK cho Telegram để tránh Telegram retry spam
    return Response.json({ ok: false, error: err?.message || "Lỗi không xác định" });
  }
}
