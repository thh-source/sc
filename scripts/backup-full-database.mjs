import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const backupsDir = path.join(rootDir, "backups");

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

console.log("=== BẮT ĐẦU BACKUP TOÀN BỘ CƠ SỞ DỮ LIỆU D1 ===");

const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

// 1. Export Full JSON State (Main + History)
console.log("[1/4] Trích xuất App State JSON từ D1...");
try {
  const mainJson = execSync(
    'npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT payload, version, updated_at FROM app_state WHERE id=\'procurement:b7f7f770-898b-4e2d-983f-9e640a42950d\'"',
    { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 }
  ).toString();

  const histJson = execSync(
    'npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT payload FROM app_state WHERE id=\'procurement:b7f7f770-898b-4e2d-983f-9e640a42950d:history\'"',
    { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 }
  ).toString();

  const mainParsed = JSON.parse(mainJson);
  const histParsed = JSON.parse(histJson);

  const mainRow = mainParsed[0]?.results?.[0];
  const histRow = histParsed[0]?.results?.[0];

  if (mainRow && mainRow.payload) {
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

    const stateBackup = {
      workspaceId: "b7f7f770-898b-4e2d-983f-9e640a42950d",
      version: mainRow.version,
      updatedAt: mainRow.updated_at,
      backupDate: new Date().toISOString(),
      data,
    };

    const stateFile = path.join(backupsDir, `production-state-${dateStr}.json`);
    fs.writeFileSync(stateFile, JSON.stringify(stateBackup, null, 2), "utf-8");
    console.log(`✓ Đã lưu App State JSON vào: ${stateFile}`);
    console.log(`  - PRs: ${data.prs?.length || 0}`);
    console.log(`  - POs: ${data.pos?.length || 0}`);
    console.log(`  - Nhà cung cấp: ${data.suppliers?.length || 0}`);
    console.log(`  - Mặt hàng: ${data.products?.length || 0}`);
    console.log(`  - Đề nghị thanh toán: ${data.paymentRequests?.length || 0}`);
    console.log(`  - Bàn giao hàng hóa: ${data.paymentHandovers?.length || 0}`);
  }
} catch (err) {
  console.error("Lỗi trích xuất App State:", err.message);
}

// 2. Export Personal Todos
console.log("[2/4] Trích xuất Bảng Personal Todos từ D1...");
try {
  const todosJson = execSync(
    'npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT * FROM personal_todos WHERE is_deleted = 0"',
    { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 }
  ).toString();

  const todosParsed = JSON.parse(todosJson);
  const todosRows = todosParsed[0]?.results || [];

  const todosFile = path.join(backupsDir, `personal-todos-${dateStr}.json`);
  fs.writeFileSync(todosFile, JSON.stringify(todosRows, null, 2), "utf-8");
  console.log(`✓ Đã lưu ${todosRows.length} công việc cá nhân vào: ${todosFile}`);
} catch (err) {
  console.error("Lỗi trích xuất Personal Todos:", err.message);
}

// 3. Export Users & System Configs
console.log("[3/4] Trích xuất Users và System Configs...");
try {
  const usersJson = execSync(
    'npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT id, username, display_name, role, active, created_at FROM users"',
    { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 }
  ).toString();
  const configJson = execSync(
    'npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT * FROM system_configs"',
    { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 }
  ).toString();

  const usersRows = JSON.parse(usersJson)[0]?.results || [];
  const configRows = JSON.parse(configJson)[0]?.results || [];

  const systemMetaFile = path.join(backupsDir, `system-metadata-${dateStr}.json`);
  fs.writeFileSync(systemMetaFile, JSON.stringify({ users: usersRows, configs: configRows }, null, 2), "utf-8");
  console.log(`✓ Đã lưu metadata hệ thống vào: ${systemMetaFile}`);
} catch (err) {
  console.error("Lỗi trích xuất metadata hệ thống:", err.message);
}

// 4. Generate SQL Dump of Core Relational Tables
console.log("[4/4] Tạo tệp SQL DUMP cho các bảng quan hệ...");
try {
  const tables = ["prs", "pos", "suppliers", "products", "personal_todos", "system_configs", "users"];
  let sqlDump = `-- PHENIKAA SCMH DATABASE BACKUP\n-- Generated on: ${new Date().toISOString()}\n-- Database: mua-hang-db (Cloudflare D1)\n\n`;

  for (const tbl of tables) {
    try {
      const rowsRes = execSync(
        `npx wrangler d1 execute mua-hang-db --remote --json --command="SELECT * FROM ${tbl}"`,
        { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 }
      ).toString();
      const rows = JSON.parse(rowsRes)[0]?.results || [];

      sqlDump += `-- Table: ${tbl} (${rows.length} rows)\n`;
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = Object.values(row).map((v) => {
          if (v === null || v === undefined) return "NULL";
          if (typeof v === "number") return v;
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        sqlDump += `INSERT OR REPLACE INTO ${tbl} (${cols.join(", ")}) VALUES (${vals.join(", ")});\n`;
      }
      sqlDump += `\n`;
    } catch (e) {
      console.warn(`Bỏ qua bảng ${tbl}:`, e.message);
    }
  }

  const sqlFile = path.join(backupsDir, `mua-hang-db-${dateStr}.sql`);
  fs.writeFileSync(sqlFile, sqlDump, "utf-8");
  console.log(`✓ Đã lưu SQL Dump vào: ${sqlFile}`);
} catch (err) {
  console.error("Lỗi tạo SQL Dump:", err.message);
}

console.log("=== HOÀN TẤT BACKUP CƠ SỞ DỮ LIỆU ===");
