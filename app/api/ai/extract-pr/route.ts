import { requireUser } from "../../../auth";
import { GoogleGenAI } from "@google/genai";
import * as xlsx from "xlsx";

// Setup Google Gen AI (Assuming API key is in environment variables)
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

  const ai = new GoogleGenAI({ apiKey });

  try {
    const body = await request.json();
    const { base64, mimeType, fileName } = body;
    if (!base64) return Response.json({ error: "Không tìm thấy dữ liệu ảnh" }, { status: 400 });

    const arrayBuffer = Buffer.from(base64, "base64");
    let promptText = "Trích xuất thông tin Mua Hàng (PR) từ tài liệu sau. Trả về đúng 1 JSON hợp lệ, không kèm văn bản nào khác. Cấu trúc JSON: { department: string, purpose: string, note: string, items: [{ name: string, desc: string, spec: string, qty: number, unit: string, estimate: number }] }. Ghi chú: 'desc' là mô tả chung, 'spec' là yêu cầu kỹ thuật/quy cách chi tiết.";
    
    let responseText = "";
    
    if (fileName && (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv"))) {
      // Parse Excel
      const workbook = xlsx.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      let csv = xlsx.utils.sheet_to_csv(sheet);
      
      // Giới hạn dữ liệu Excel tránh làm quá tải AI (chỉ lấy 100 dòng đầu tiên)
      const lines = csv.split('\n');
      if (lines.length > 100) {
        csv = lines.slice(0, 100).join('\n');
      }
      
      promptText += "\n\nDữ liệu file Excel:\n" + csv;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: promptText,
      });
      responseText = response.text;
    } else {
      // Image or PDF
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          promptText,
          {
            inlineData: {
              data: base64,
              mimeType: mimeType || "image/jpeg"
            }
          }
        ]
      });
      responseText = response.text;
    }

    // Clean up markdown JSON block if present
    const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(jsonStr);

    return Response.json({ ok: true, data: result });
  } catch (error: any) {
    console.error("AI_ERROR", error);
    let errorMsg = error.message || "Lỗi khi xử lý AI";
    if (errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE")) {
      errorMsg = "Máy chủ AI của Google hiện đang quá tải do có quá nhiều người sử dụng. Xin bạn vui lòng thử lại sau vài giây nhé!";
    }
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
