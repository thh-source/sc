/**
 * DANH SÁCH PHÒNG BAN THỐNG NHẤT TOÀN HỆ THỐNG
 * Theo quy chuẩn của công ty:
 * TT ĐSH, Phòng QA, QC, RD, IT, Sản xuất, Cung ứng, Kế toán, Kho
 */

export const MASTER_DEPARTMENTS: readonly string[] = [
  "TT ĐSH",
  "Phòng QA",
  "QC",
  "RD",
  "IT",
  "Sản xuất",
  "Cung ứng",
  "Kế toán",
  "Kho",
];

const LOCAL_STORAGE_KEY = "scm_unified_departments_v1";

/**
 * Lấy toàn bộ danh sách phòng ban hợp lệ của hệ thống
 * (Bao gồm danh sách chuẩn và các phòng ban mới được người dùng tạo thêm mã)
 */
export function getUnifiedDepartments(): string[] {
  if (typeof window === "undefined") {
    return [...MASTER_DEPARTMENTS];
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [...MASTER_DEPARTMENTS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const set = new Set<string>(MASTER_DEPARTMENTS);
      parsed.forEach((d) => {
        if (typeof d === "string" && d.trim()) {
          set.add(d.trim());
        }
      });
      return Array.from(set);
    }
  } catch (err) {
    console.warn("Failed to load departments from storage", err);
  }
  return [...MASTER_DEPARTMENTS];
}

/**
 * Tạo thêm mã/tên phòng ban mới vào hệ thống (không cho phép gõ tự do mà không thêm mã)
 */
export function addNewDepartment(name: string): { success: boolean; list: string[]; error?: string } {
  const clean = name.trim();
  if (!clean) {
    return { success: false, list: getUnifiedDepartments(), error: "Tên phòng ban không được để trống" };
  }

  const currentList = getUnifiedDepartments();
  const exists = currentList.some((d) => d.toLowerCase() === clean.toLowerCase());
  if (exists) {
    return { success: true, list: currentList };
  }

  const nextList = [...currentList, clean];
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList));
      window.dispatchEvent(new CustomEvent("scm_departments_updated", { detail: nextList }));
    }
  } catch (err) {
    console.warn("Failed to persist new department", err);
  }

  return { success: true, list: nextList };
}
