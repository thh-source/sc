import { compressImageIfNeeded } from "./compressImage";
import { compressPdfIfNeeded, CompressPdfOptions } from "./compressPdf";

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  ratioPercent: number; // Tỷ lệ giảm (ví dụ: 85%)
  isCompressed: boolean;
}

/**
 * Hàm nén tự động siêu gọn cho tất cả các loại file tài liệu tải lên (PDF và Ảnh)
 * - Tự động phát hiện loại file: PDF hoặc Ảnh (JPEG, PNG, WebP)
 * - Tự động nén siêu gọn nhưng giữ nguyên độ nét cho văn bản và con dấu
 * - Báo cáo tiến trình qua options.onProgress
 */
export async function compressUploadFile(
  file: File,
  options?: CompressPdfOptions
): Promise<File> {
  if (!file) return file;

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return await compressPdfIfNeeded(file, options);
  }

  if (file.type.startsWith("image/")) {
    return await compressImageIfNeeded(file);
  }

  return file;
}
