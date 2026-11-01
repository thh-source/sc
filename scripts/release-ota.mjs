import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execSync } from "child_process";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const REMOTE_WORKER_URL = "https://pnk.sc-pnk.workers.dev";

// 1. Phân tích tham số phiên bản
let version = process.argv[2];
let releaseNotes = process.argv[3] || "Cập nhật tối ưu hóa ứng dụng, hỗ trợ OTA và sửa lỗi đồng bộ";

if (!version) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
    const current = pkg.version || "1.0.0";
    const parts = current.split(".").map(Number);
    parts[2] = (parts[2] || 0) + 1;
    version = parts.join(".");
  } catch {
    version = "1.0.1";
  }
}

// Bỏ chữ v ở đầu nếu có
version = version.replace(/^v/i, "");

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const buildNumber = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;
const buildDate = `${now.toLocaleDateString("vi-VN")}, ${now.toLocaleTimeString("vi-VN")}`;
const versionName = `Phenikaa SCMH v${version} (Bản chính thức)`;

let commitHash = "d98d398";
try {
  commitHash = execSync("git rev-parse --short HEAD", { cwd: rootDir }).toString().trim();
} catch {}

console.log("==========================================================");
console.log(`🚀 BẮT ĐẦU ĐÓNG GÓI BẢN CẬP NHẬT TỪ XA (OTA UPDATE) v${version}`);
console.log(`🏷️ Tên phiên bản:    ${versionName}`);
console.log(`🔢 Mã bản build:      ${buildNumber} (${commitHash})`);
console.log(`🕒 Ngày giờ build:    ${buildDate}`);
console.log(`📝 Ghi chú phát hành: "${releaseNotes}"`);
console.log("==========================================================");

// Cập nhật app/version.ts trước khi build
const versionTsContent = `import { Capacitor } from "@capacitor/core";

export interface AppVersionMetadata {
  appName: string;
  version: string;
  versionName: string;
  buildNumber: string;
  buildDate: string;
  releaseChannel: string;
  gitCommit?: string;
  releaseNotes: string;
}

export const CURRENT_APP_VERSION: AppVersionMetadata = {
  appName: "Phenikaa Mua Hàng (SCMH)",
  version: "${version}",
  versionName: "${versionName}",
  buildNumber: "${buildNumber}",
  buildDate: "${buildDate}",
  releaseChannel: "Production",
  gitCommit: "${commitHash}",
  releaseNotes: "${releaseNotes.replace(/"/g, '\\"')}",
};

export function getAppPlatform(): {
  isNative: boolean;
  platformName: string;
  platformBadge: string;
} {
  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
  return {
    isNative,
    platformName: isNative ? "Android Native App (Capacitor)" : "Web Application (Trình duyệt)",
    platformBadge: isNative ? "Android APK" : "Web PWA",
  };
}
`;

fs.writeFileSync(path.join(rootDir, "app", "version.ts"), versionTsContent, "utf-8");
console.log("✓ Đã cập nhật metadata phiên bản vào app/version.ts.");

// 2. Chạy Build production bundle cho Native Mobile App (SPA React 19 Client Bundle)
console.log("\n[BƯỚC 1/4] Đang dọn dẹp và biên dịch Native SPA Client Bundle...");
const distDir = path.join(rootDir, "dist");
if (fs.existsSync(distDir)) {
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log("✓ Đã dọn dẹp thư mục dist/ cũ.");
  } catch (e) {
    console.warn("Cảnh báo dọn dẹp dist/:", e.message);
  }
}

try {
  execSync("npx vite build --config vite.native.config.ts", { cwd: rootDir, stdio: "inherit" });
  console.log("✓ Đã biên dịch thành công Native SPA Client Bundle.");
} catch (err) {
  console.error("❌ Lỗi khi biên dịch Native SPA Client bundle:", err);
  process.exit(1);
}

// 3. Chuẩn bị thư mục bundle hoàn chỉnh cho Capacitor & Capgo
console.log("\n[BƯỚC 2/4] Chuẩn bị cấu trúc tài nguyên Offline-first trong dist/...");

// Di chuyển dist/native.html thành dist/index.html
const nativeHtmlPath = path.join(distDir, "native.html");
const indexHtmlPath = path.join(distDir, "index.html");

if (fs.existsSync(nativeHtmlPath)) {
  let htmlContent = fs.readFileSync(nativeHtmlPath, "utf-8");
  // Cập nhật thông tin phiên bản vào màn hình splash tĩnh
  htmlContent = htmlContent.replace(
    "Hệ thống Quản lý Mua hàng (Native)",
    `Hệ thống Quản lý Mua hàng v${version}`
  );
  fs.writeFileSync(indexHtmlPath, htmlContent, "utf-8");
  try {
    fs.unlinkSync(nativeHtmlPath);
  } catch {}
  console.log("✓ Đã chuyển đổi native.html -> dist/index.html sẵn sàng cho Capacitor/Android.");
} else if (!fs.existsSync(indexHtmlPath)) {
  console.error("❌ Không tìm thấy file index.html hoặc native.html trong dist/!");
  process.exit(1);
}

// 4. Nén bundle thành file ZIP
console.log("\n[BƯỚC 3/4] Đang nén bundle vào file ZIP...");
const zipFileName = `update-v${version}.zip`;
const zipFilePath = path.join(distDir, zipFileName);

async function createZipBundle() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => {
      const sizeMB = (archive.pointer ? (archive.pointer() / 1024 / 1024).toFixed(2) : (fs.statSync(zipFilePath).size / 1024 / 1024).toFixed(2));
      console.log(`✓ Đã nén thành công: ${zipFileName} (${sizeMB} MB)`);
      resolve(zipFilePath);
    });

    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    // Thêm các file từ dist vào root của ZIP (bỏ các file zip khác và thư mục server)
    archive.glob("**/*", {
      cwd: distDir,
      ignore: ["server/**", "*.zip", ".vite/**"],
    });

    archive.finalize();
  });
}

createZipBundle()
  .then(async (zipPath) => {
    // 5. Đẩy file ZIP lên Cloudflare R2 và cập nhật D1 qua API
    console.log(`\n[BƯỚC 4/4] Đang tải gói cập nhật lên Cloudflare R2...`);

    let uploaded = false;
    try {
      execSync(
        `npx wrangler r2 object put mua-hang-files/updates/v${version}.zip --file="${zipPath}" --remote`,
        { cwd: rootDir, stdio: "inherit" }
      );
      uploaded = true;
      console.log("✅ Upload qua Wrangler CLI (--remote) thành công!");
    } catch (cliErr) {
      console.warn("⚠️ Wrangler upload gặp lỗi, thử upload qua API:", cliErr.message);
    }

    if (!uploaded) {
      const fileBuffer = fs.readFileSync(zipPath);
      const blob = new Blob([fileBuffer], { type: "application/zip" });
      const formData = new FormData();
      formData.append("file", blob, zipFileName);
      formData.append("version", version);
      formData.append("releaseNotes", releaseNotes);

      const uploadRes = await fetch(`${REMOTE_WORKER_URL}/api/app-version`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`HTTP ${uploadRes.status}: ${await uploadRes.text()}`);
      }
    }

    // Luôn đồng bộ metadata lên D1 qua JSON POST
    const metaRes = await fetch(`${REMOTE_WORKER_URL}/api/app-version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latestVersion: version,
        versionName: versionName,
        buildNumber: buildNumber,
        buildDate: buildDate,
        minSupportedVersion: "1.0.0",
        releaseNotes: releaseNotes,
      }),
    });

    if (!metaRes.ok) {
      throw new Error(`Cập nhật metadata D1 thất bại: ${await metaRes.text()}`);
    }

    const result = await metaRes.json();
    console.log("\n==========================================================");
    console.log("✅ ĐÃ ĐẨY BẢN CẬP NHẬT LÊN R2 VÀ CẬP NHẬT D1 THÀNH CÔNG!");
    console.log("----------------------------------------------------------");
    console.log(`📦 Phiên bản mới:      v${result.latestVersion}`);
    console.log(`🔗 Link tải trực tiếp: ${result.downloadUrl}`);
    console.log(`📝 Nội dung cập nhật:  ${result.releaseNotes}`);
    console.log("==========================================================");
    console.log("🎉 Các thiết bị Android sẽ tự động phát hiện và áp dụng ngầm trong lần mở tiếp theo!");
  })
  .catch((err) => {
    console.error("❌ Lỗi khi đóng gói OTA:", err);
    process.exit(1);
  });
