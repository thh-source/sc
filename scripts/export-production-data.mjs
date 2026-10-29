import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("Đang trích xuất dữ liệu thực tế từ Cloudflare D1...");

const mainJson = execSync(
  'npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT payload, version, updated_at FROM app_state WHERE id=\'procurement:b7f7f770-898b-4e2d-983f-9e640a42950d\'"',
  { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 }
).toString();

const histJson = execSync(
  'npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT payload FROM app_state WHERE id=\'procurement:b7f7f770-898b-4e2d-983f-9e640a42950d:history\'"',
  { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 }
).toString();

const mainParsed = JSON.parse(mainJson);
const histParsed = JSON.parse(histJson);

const mainRow = mainParsed[0]?.results?.[0];
const histRow = histParsed[0]?.results?.[0];

if (!mainRow || !mainRow.payload) {
  console.error("Không tìm thấy dữ liệu workspace chính trong D1!");
  process.exit(1);
}

const data = JSON.parse(mainRow.payload);
if (histRow && histRow.payload) {
  try {
    const histData = JSON.parse(histRow.payload);
    if (histData.purchaseHistory) data.purchaseHistory = histData.purchaseHistory;
    if (histData.purchaseHistoryImportIds) data.purchaseHistoryImportIds = histData.purchaseHistoryImportIds;
  } catch (e) {
    console.warn("Lỗi parse history:", e.message);
  }
}

const fullExport = {
  workspaceId: "b7f7f770-898b-4e2d-983f-9e640a42950d",
  version: mainRow.version || 2453,
  updatedAt: mainRow.updated_at || new Date().toISOString(),
  data,
};

const outputPath = path.join(rootDir, "public", "production-state.json");
fs.writeFileSync(outputPath, JSON.stringify(fullExport), "utf-8");

console.log(`✓ Đã lưu thành công dữ liệu sản xuất vào ${outputPath}`);
console.log(`  - PRs: ${data.prs?.length || 0}`);
console.log(`  - POs: ${data.pos?.length || 0}`);
console.log(`  - Nhà cung cấp: ${data.suppliers?.length || 0}`);
console.log(`  - Vật tư / Hàng hóa: ${data.products?.length || 0}`);
console.log(`  - Phiếu đề nghị thanh toán: ${data.paymentRequests?.length || 0}`);
console.log(`  - Lịch sử mua hàng: ${data.purchaseHistory?.length || 0}`);
