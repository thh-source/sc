import { requireUser } from "../../../auth";
import * as xlsx from "xlsx";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = await bindings();
  const apiKey = env.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return Response.json({ error: "Chưa cấu hình GEMINI_API_KEY" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { base64, mimeType, fileName } = body;
    if (!base64) return Response.json({ error: "Không tìm thấy dữ liệu ảnh" }, { status: 400 });

    const arrayBuffer = Buffer.from(base64, "base64");
    let promptText = "Trích xuất thông tin Mua Hàng (PR) từ tài liệu sau. Trả về đúng 1 JSON hợp lệ, không kèm văn bản nào khác. Cấu trúc JSON: { department: string, purpose: string, note: string, items: [{ name: string, desc: string, spec: string, qty: number, unit: string, estimate: number }] }. Ghi chú: 'desc' là mô tả chung, 'spec' là yêu cầu kỹ thuật/quy cách chi tiết.";
    
    let contents: any;
    
    if (fileName && (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv"))) {
      // Parse Excel
      const workbook = xlsx.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      let csv = xlsx.utils.sheet_to_csv(sheet);
      
      const lines = csv.split('\n');
      if (lines.length > 100) {
        csv = lines.slice(0, 100).join('\n');
      }
      
      promptText += "\n\nDữ liệu file Excel:\n" + csv;
      
      contents = [
        {
          parts: [{ text: promptText }]
        }
      ];
    } else {
      // Image or PDF
      contents = [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                data: base64,
                mimeType: mimeType || "image/jpeg"
              }
            }
          ]
        }
      ];
    }

    // Trả về payload để frontend gọi API trực tiếp, bypass giới hạn Location của Cloudflare!
    return Response.json({ ok: true, apiKey, contents });
  } catch (error: any) {
    console.error("AI_ERROR", error);
    return Response.json({ error: error.message || "Lỗi khi xử lý file" }, { status: 500 });
  }
}
