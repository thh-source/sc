/**
 * Nén ảnh tự động phía trình duyệt (Client-side Image Compressor)
 * - Giảm kích thước ảnh JPG/PNG dung lượng lớn từ điện thoại hoặc máy scan
 * - Giữ nguyên độ sắc nét của văn bản trên tài liệu scan
 * - Bỏ qua nếu là file PDF
 */
export async function compressImageIfNeeded(
  file: File,
  maxDimension = 1920,
  quality = 0.82
): Promise<File> {
  // Nếu là PDF hoặc file không phải ảnh thì không xử lý nén
  if (file.type === "application/pdf" || !file.type.startsWith("image/")) {
    return file;
  }

  // Nếu ảnh đã dưới 500KB thì giữ nguyên
  if (file.size <= 500 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Giảm kích thước nếu quá lớn
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        // Vẽ nền trắng để tránh PNG trong suốt bị đen khi chuyển sang JPEG
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file); // Giữ nguyên file cũ nếu nén xong không nhẹ hơn
              return;
            }
            const newName = file.name.replace(/\.[^.]+$/, ".jpg");
            const compressedFile = new File([blob], newName, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
