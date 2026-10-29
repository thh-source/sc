import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const backupsDir = path.join(rootDir, "backups");

const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function createSourceZip() {
  const zipPath = path.join(backupsDir, `SCMH-v1.1.2-FullSource-Backup-${dateStr}.zip`);
  console.log(`[1/2] Đang tạo gói Source Code Backup: ${zipPath}...`);

  const output = fs.createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", () => {
      console.log(`✓ Đã tạo thành công Source Code Backup: ${(archive.pointer() / (1024 * 1024)).toFixed(2)} MB`);
      resolve(zipPath);
    });
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    // Bỏ qua các thư mục nặng không cần thiết
    archive.glob("**/*", {
      cwd: rootDir,
      ignore: [
        "node_modules/**",
        ".next/**",
        "dist/**",
        ".wrangler/**",
        ".gradle/**",
        "android/.gradle/**",
        "android/build/**",
        "android/app/build/**",
        "backups/**",
        "*.apk",
        "*.zip",
        "apk-test-*.png",
        ".git/**",
      ],
      dot: true,
    });

    archive.finalize();
  });
}

async function createBinariesAndDbZip() {
  const zipPath = path.join(backupsDir, `SCMH-v1.1.2-Binaries-and-Database-${dateStr}.zip`);
  console.log(`[2/2] Đang tạo gói Binaries & Database Backup: ${zipPath}...`);

  const output = fs.createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", () => {
      console.log(`✓ Đã tạo thành công Binaries & Database Backup: ${(archive.pointer() / (1024 * 1024)).toFixed(2)} MB`);
      resolve(zipPath);
    });
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    // Thêm các file thực thi và dữ liệu
    const apkFile = path.join(rootDir, "Phenikaa_Procurement_App.apk");
    if (fs.existsSync(apkFile)) archive.file(apkFile, { name: "Phenikaa_Procurement_App.apk" });

    const otaZip = path.join(rootDir, "update-v1.1.2.zip");
    if (fs.existsSync(otaZip)) archive.file(otaZip, { name: "update-v1.1.2.zip" });

    const sqlFile = path.join(backupsDir, `mua-hang-db-${dateStr}.sql`);
    if (fs.existsSync(sqlFile)) archive.file(sqlFile, { name: `mua-hang-db-${dateStr}.sql` });

    const stateJson = path.join(backupsDir, `production-state-${dateStr}.json`);
    if (fs.existsSync(stateJson)) archive.file(stateJson, { name: `production-state-${dateStr}.json` });

    const todosJson = path.join(backupsDir, `personal-todos-${dateStr}.json`);
    if (fs.existsSync(todosJson)) archive.file(todosJson, { name: `personal-todos-${dateStr}.json` });

    const sysMeta = path.join(backupsDir, `system-metadata-${dateStr}.json`);
    if (fs.existsSync(sysMeta)) archive.file(sysMeta, { name: `system-metadata-${dateStr}.json` });

    const specDoc = path.join(rootDir, "docs", "SYSTEM_SPECIFICATION.md");
    if (fs.existsSync(specDoc)) archive.file(specDoc, { name: "SYSTEM_SPECIFICATION.md" });

    archive.finalize();
  });
}

async function run() {
  try {
    await createSourceZip();
    await createBinariesAndDbZip();
    console.log("=== HOÀN TẤT TOÀN BỘ GÓI BACKUP ===");
  } catch (err) {
    console.error("Lỗi đóng gói backup:", err);
    process.exit(1);
  }
}

run();
