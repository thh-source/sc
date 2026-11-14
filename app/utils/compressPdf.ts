/**
 * Tự động nén siêu gọn file PDF phía Client (Browser & Mobile WebView)
 *
 * Tính năng:
 * - Tự động phát hiện: file PDF <= 800KB thì giữ nguyên không cần nén.
 * - Phân giải từng trang PDF qua Canvas với độ sắc nét chuẩn (150 DPI / max 1600px).
 * - Nén ảnh từng trang bằng JPEG chất lượng cao (quality 0.78), giữ độ rõ nét cho chữ, số và con dấu đỏ.
 * - Đóng gói lại thành file PDF mới chuẩn bằng pdf-lib (bật Object Streams để tối ưu siêu gọn).
 * - Nếu file sau khi nén không nhẹ hơn file gốc thì tự động giữ lại file gốc.
 * - Có callback onProgress để giao diện cập nhật trạng thái % nén trực tiếp cho người dùng.
 */

export interface CompressPdfOptions {
  maxDimension?: number;
  quality?: number;
  onProgress?: (percent: number, message: string) => void;
}

export async function compressPdfIfNeeded(
  file: File,
  options?: CompressPdfOptions
): Promise<File> {
  // 1. Kiểm tra định dạng: Chỉ xử lý nếu là PDF
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) return file;

  // 2. Nếu file PDF đã dưới 800KB thì không cần nén thêm
  if (file.size <= 800 * 1024) {
    return file;
  }

  // 3. Nếu không có môi trường DOM (chạy phía server / SSR) thì trả về file gốc
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  try {
    options?.onProgress?.(5, "Đang đọc cấu trúc tài liệu PDF...");

    // Tải động thư viện để tránh phình bundle ban đầu
    const [pdfjsLib, { PDFDocument }] = await Promise.all([
      import("pdfjs-dist"),
      import("pdf-lib"),
    ]);

    // Cấu hình worker cho PDF.js nếu chưa có
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        const workerModule = await import(
          // @ts-expect-error Vite ?url asset import
          "pdfjs-dist/build/pdf.worker.min.js?url"
        );
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      } catch {
        // Fallback dùng cdnjs nếu không thể load local worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || "3.11.174"}/pdf.worker.min.js`;
      }
    }

    const fileBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    if (numPages <= 0) return file;

    const newPdfDoc = await PDFDocument.create();
    const maxDim = options?.maxDimension || 1600;
    const quality = options?.quality || 0.78;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      options?.onProgress?.(
        Math.round(10 + (pageNum / numPages) * 75),
        `Đang tối ưu hóa trang ${pageNum}/${numPages}...`
      );

      const page = await pdf.getPage(pageNum);
      const defaultViewport = page.getViewport({ scale: 1.0 });

      // Tính toán tỷ lệ scale sao cho chiều lớn nhất không vượt quá maxDim (chuẩn ~1600px cho độ sắc nét cao)
      const maxCurrent = Math.max(defaultViewport.width, defaultViewport.height);
      let scale = 1.5;
      if (maxCurrent * scale > maxDim) {
        scale = maxDim / maxCurrent;
      }
      if (scale < 1.0 && maxCurrent < 2000) {
        scale = 1.0;
      }

      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        continue;
      }

      // Tô nền trắng tránh trong suốt bị đen nền
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      // Nén ảnh trang thành JPEG chất lượng cao
      const jpgBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });

      if (!jpgBlob) continue;

      const jpgBuffer = await jpgBlob.arrayBuffer();
      const embeddedJpg = await newPdfDoc.embedJpg(new Uint8Array(jpgBuffer));

      // Giữ nguyên kích thước hiển thị theo chuẩn điểm ảnh PDF (72 pt/inch)
      const pagePtWidth = defaultViewport.width;
      const pagePtHeight = defaultViewport.height;

      const newPage = newPdfDoc.addPage([pagePtWidth, pagePtHeight]);
      newPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: pagePtWidth,
        height: pagePtHeight,
      });
    }

    options?.onProgress?.(90, "Đang đóng gói file PDF siêu nhẹ...");

    const compressedPdfBytes = await newPdfDoc.save({ useObjectStreams: true });

    // Nếu dung lượng nén xong không nhỏ hơn dung lượng cũ thì giữ nguyên file gốc
    if (compressedPdfBytes.length >= file.size) {
      options?.onProgress?.(100, "Đã hoàn tất");
      return file;
    }

    const compressedFile = new File([compressedPdfBytes as BlobPart], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });

    options?.onProgress?.(
      100,
      `Đã nén siêu gọn: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(compressedFile.size / 1024).toFixed(0)}KB`
    );

    return compressedFile;
  } catch (error) {
    console.warn("Lỗi khi nén PDF, sử dụng file gốc an toàn:", error);
    return file;
  }
}
