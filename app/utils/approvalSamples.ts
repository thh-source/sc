import {
  ApprovalCustomSigner,
  ApprovalItemRow,
  ApprovalRequest,
  ApprovalSupplierColumn,
  ApprovalSupplierQuoteLine,
  PR,
  Quote,
  Supplier,
} from "../types";
import { generateShortName } from "./format";

/**
 * Làm sạch chuỗi số khi paste từ Excel (hỗ trợ cả định dạng VN 1.930.000 và US 1,930,000)
 */
export function cleanExcelNumber(raw: string | number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  let s = String(raw).trim();
  if (!s) return 0;

  // Xóa các ký tự tiền tệ hoặc chữ (đ, VND, đ/cái...)
  s = s.replace(/[₫đĐVNDvnd\s]/g, "");
  // Xóa đuôi thập phân .00 hoặc ,00
  s = s.replace(/[.,]00$/, "");

  // Nếu có cả dấu chấm và dấu phẩy (vd: 1.250.000,50 hoặc 1,250,000.50)
  if (s.includes(".") && s.includes(",")) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
    const num = parseFloat(s);
    return Number.isFinite(num) ? Math.round(num) : 0;
  }

  // Nếu có dấu chấm:
  if (s.includes(".")) {
    const parts = s.split(".");
    // Khi người dùng gõ vào ô format VND (vd: 1.234 gõ thêm 5 thành 1.2345 hoặc 12.3456 hoặc 1.500.000)
    // Các dấu chấm đều là phân cách hàng nghìn.
    // Chỉ xem là số thập phân nếu đúng 1 dấu chấm và phần trước dấu chấm là "0" (vd: "0.5")
    if (parts.length === 2 && parts[0] === "0") {
      const num = parseFloat(s);
      return Number.isFinite(num) ? num : 0;
    }
    // Ngược lại, trong kế toán VN và đơn giá hàng hóa VND, tất cả dấu chấm đều là phân cách hàng nghìn
    s = s.replace(/\./g, "");
  }

  // Nếu có dấu phẩy:
  if (s.includes(",")) {
    const parts = s.split(",");
    // Nếu có dạng phân cách hàng nghìn (1,500,000 hoặc 100,000)
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, "");
    } else if (parts.length === 2 && (parts[0] === "0" || parts[1].length <= 2)) {
      // Phẩy thập phân (0,5 hoặc 12,5)
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  }

  // Giữ lại chỉ số và dấu trừ nếu có
  s = s.replace(/[^\d.-]/g, "");
  const num = Number(s);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parse dữ liệu clipboard từ Excel (hỗ trợ ô có xuống dòng bên trong dấu ngoặc kép)
 */
export function parseExcelClipboard(text: string): string[][] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const nextCh = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && nextCh === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"' && currentCell.length === 0) {
        inQuotes = true;
      } else if (ch === "\t") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (ch === "\n") {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  // Bỏ dòng cuối rỗng do ký tự xuống dòng cuối cùng khi copy từ Excel
  if (
    rows.length > 0 &&
    rows[rows.length - 1].length === 1 &&
    rows[rows.length - 1][0] === ""
  ) {
    rows.pop();
  }

  return rows;
}


export interface SavedApprovalSigners {
  approverLeader?: string;
  approverDeptHead?: string;
  requesterName?: string;
  customSigners?: Array<{ title: string; name: string }>;
}

const DEFAULT_SIGNERS_STORAGE_KEY = "scmh_default_approval_signers";

export function getSavedApprovalSigners(): SavedApprovalSigners {
  if (typeof window === "undefined") {
    return {
      approverLeader: "Đinh Anh Hào",
      approverDeptHead: "Lưu Thị Thanh Xuân",
      requesterName: "Trần Hải Hà",
    };
  }
  try {
    const raw = localStorage.getItem(DEFAULT_SIGNERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        approverLeader: parsed.approverLeader || "Đinh Anh Hào",
        approverDeptHead: parsed.approverDeptHead || "Lưu Thị Thanh Xuân",
        requesterName: parsed.requesterName || "Trần Hải Hà",
        customSigners: Array.isArray(parsed.customSigners) ? parsed.customSigners : undefined,
      };
    }
  } catch {}
  return {
    approverLeader: "Đinh Anh Hào",
    approverDeptHead: "Lưu Thị Thanh Xuân",
    requesterName: "Trần Hải Hà",
  };
}

export function saveDefaultApprovalSigners(signers: Partial<SavedApprovalSigners>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getSavedApprovalSigners();
    const updated = { ...current, ...signers };
    localStorage.setItem(DEFAULT_SIGNERS_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

export function formatTodayVN(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Định dạng câu mở đầu Mục I Đề nghị phê duyệt theo chuẩn Phenikaa Pharma:
 * "Theo yêu cầu mua hàng phục vụ công việc của phòng [abc] .  Phòng Cung Ứng đã tìm kiếm, đánh giá và đề xuất phương án như sau:"
 */
export function formatApprovalSection1Title(deptName?: string): string {
  const d = (deptName || "").trim();
  if (!d) {
    return "Theo yêu cầu mua hàng phục vụ công việc của phòng [chọn phòng ban] .  Phòng Cung Ứng đã tìm kiếm, đánh giá và đề xuất phương án như sau:";
  }
  const prefix = /^phòng\s+/i.test(d) ? "của " : "của phòng ";
  return `Theo yêu cầu mua hàng phục vụ công việc ${prefix}${d} .  Phòng Cung Ứng đã tìm kiếm, đánh giá và đề xuất phương án như sau:`;
}

/**
 * Tạo phiếu Đề nghị phê duyệt từ Bảng So sánh Báo giá PR
 */
export function createApprovalFromCompare(
  pr: PR,
  quotesForPr: Quote,
  supplierIdsForPr: number[],
  suppliers: Supplier[],
  existingCount: number,
): ApprovalRequest {
  // Tìm danh sách NCC tham gia báo giá
  const activeSupplierIds =
    supplierIdsForPr && supplierIdsForPr.length > 0
      ? supplierIdsForPr
      : suppliers.slice(0, 3).map((s) => s.id);

  // Tính tổng tiền hoặc số lần có giá thấp nhất để tự động gợi ý NCC lựa chọn
  const supplierScores: Record<number, { countBest: number; totalAmount: number }> = {};
  activeSupplierIds.forEach((sid) => {
    supplierScores[sid] = { countBest: 0, totalAmount: 0 };
  });

  pr.items.forEach((item) => {
    let minPrice = Infinity;
    let bestSid: number | null = null;
    activeSupplierIds.forEach((sid) => {
      const rawPrice = quotesForPr?.[item.id]?.[sid]?.price || "";
      const p = cleanExcelNumber(rawPrice);
      if (p > 0) {
        supplierScores[sid].totalAmount += p * (Number(item.qty) || 0);
        if (p < minPrice) {
          minPrice = p;
          bestSid = sid;
        }
      }
    });
    if (bestSid !== null && supplierScores[bestSid]) {
      supplierScores[bestSid].countBest += 1;
    }
  });

  // Chọn NCC có nhiều mặt hàng giá tốt nhất (hoặc tổng tiền thấp nhất > 0)
  let selectedSid = activeSupplierIds[0] || 0;
  let maxBest = -1;
  activeSupplierIds.forEach((sid) => {
    const score = supplierScores[sid];
    if (score && score.countBest > maxBest && score.totalAmount > 0) {
      maxBest = score.countBest;
      selectedSid = sid;
    }
  });

  const supplierColumns: ApprovalSupplierColumn[] = activeSupplierIds.map(
    (sid, idx) => {
      const sup = suppliers.find((s) => s.id === sid);
      const isSelected = sid === selectedSid;
      return {
        colId: `col_${sid}_${idx + 1}`,
        supplierId: sid,
        supplierName: sup?.name || `Nhà cung cấp ${idx + 1}`,
        shortName: sup?.shortName || (sup?.name ? generateShortName(sup.name) : `NCC ${idx + 1}`),
        isSelected,
        deliveryTime: "",
      };
    },
  );

  // Nếu chưa có cột nào, tạo 2 cột mặc định
  if (supplierColumns.length === 0) {
    supplierColumns.push(
      {
        colId: "col_1",
        supplierName: "Nhà cung cấp 1",
        shortName: "NCC 1",
        isSelected: true,
        deliveryTime: "",
      },
      {
        colId: "col_2",
        supplierName: "Nhà cung cấp 2",
        shortName: "NCC 2",
        isSelected: false,
        deliveryTime: "",
      },
    );
  }

  const rows: ApprovalItemRow[] = pr.items.map((item, idx) => {
    const supplierQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
    const qty = Number(item.qty) || 0;

    supplierColumns.forEach((col) => {
      const qEntry =
        col.supplierId !== undefined
          ? quotesForPr?.[item.id]?.[col.supplierId]
          : undefined;
      const unitPrice = cleanExcelNumber(qEntry?.price || "");
      supplierQuotes[col.colId] = [
        {
          lineId: `line_${item.id}_${col.colId}_1`,
          quotedProduct: [item.name, item.spec].filter(Boolean).join(" - "),
          origin: qEntry?.note || "",
          unitPrice,
          qty,
          amount: unitPrice * qty,
        },
      ];
    });

    return {
      rowId: `row_${item.id}_${idx + 1}`,
      stt: idx + 1,
      itemCode: item.code || "",
      itemName: [item.name, item.spec].filter(Boolean).join(" "),
      spec: item.spec || "",
      qty,
      unit: item.unit || "",
      supplierQuotes,
    };
  });

  const selectedCol =
    supplierColumns.find((c) => c.isSelected) || supplierColumns[0];

  return {
    id: Date.now(),
    requestNumber: pr.number || `ĐNPD-${String(existingCount + 1).padStart(3, "0")}`,
    sourceType: "compare",
    prId: pr.id,
    prNumber: pr.number || "",
    createdDate: formatTodayVN(),
    department: "Cung ứng",
    requestingDepartment: pr.department || "",
    noteRef: pr.number || "",
    section1Title: formatApprovalSection1Title(pr.department),
    columnMode: "basic",
    showDeliveryTimeRow: false,
    printOrientation: supplierColumns.length >= 3 ? "landscape" : "portrait",
    supplierColumns,
    rows,
    recommendedSupplierName: selectedCol?.supplierName || "",
    deliveryTerms: "",
    paymentTerms: "Thanh toán 100% trước khi giao hàng.",
    reasons: [
      "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá cạnh tranh nhất.",
      "Thời gian giao hàng đáp ứng tiến độ yêu cầu.",
    ],
    approverLeader: getSavedApprovalSigners().approverLeader || "Đinh Anh Hào",
    approverDeptHead: getSavedApprovalSigners().approverDeptHead || "Lưu Thị Thanh Xuân",
    requesterName: getSavedApprovalSigners().requesterName || "Trần Hải Hà",
    status: "Chờ phê duyệt",
  };
}

/**
 * Tạo phiếu Đề nghị phê duyệt trực tiếp từ PR (Bỏ qua so sánh báo giá)
 */
export function createApprovalFromPR(
  pr: PR,
  suppliers: Supplier[],
  existingCount: number,
): ApprovalRequest {
  const defaultSups = suppliers.slice(0, 3);
  const supplierColumns: ApprovalSupplierColumn[] =
    defaultSups.length >= 2
      ? defaultSups.map((sup, idx) => ({
          colId: `col_${sup.id}_${idx + 1}`,
          supplierId: sup.id,
          supplierName: sup.name,
          shortName: sup.shortName || generateShortName(sup.name),
          isSelected: idx === 0,
          deliveryTime: "",
        }))
      : [
          {
            colId: "col_1",
            supplierName: "Nhà cung cấp 1",
            shortName: "NCC 1",
            isSelected: true,
            deliveryTime: "",
          },
          {
            colId: "col_2",
            supplierName: "Nhà cung cấp 2",
            shortName: "NCC 2",
            isSelected: false,
            deliveryTime: "",
          },
          {
            colId: "col_3",
            supplierName: "Nhà cung cấp 3",
            shortName: "NCC 3",
            isSelected: false,
            deliveryTime: "",
          },
        ];

  const rows: ApprovalItemRow[] = pr.items.map((item, idx) => {
    const qty = Number(item.qty) || 0;
    const supplierQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
    supplierColumns.forEach((col) => {
      supplierQuotes[col.colId] = [
        {
          lineId: `line_${item.id}_${col.colId}_1`,
          quotedProduct: [item.name, item.spec].filter(Boolean).join(" "),
          origin: "",
          unitPrice: 0,
          qty,
          amount: 0,
        },
      ];
    });

    return {
      rowId: `row_${item.id}_${idx + 1}`,
      stt: idx + 1,
      itemCode: item.code || "",
      itemName: [item.name, item.spec].filter(Boolean).join(" "),
      spec: item.spec || "",
      qty,
      unit: item.unit || "",
      supplierQuotes,
    };
  });

  const selectedCol = supplierColumns[0];

  return {
    id: Date.now(),
    requestNumber: pr.number || `ĐNPD-${String(existingCount + 1).padStart(3, "0")}`,
    sourceType: "pr",
    prId: pr.id,
    prNumber: pr.number || "",
    createdDate: formatTodayVN(),
    department: "Cung ứng",
    requestingDepartment: pr.department || "",
    noteRef: pr.number || "",
    section1Title: formatApprovalSection1Title(pr.department),
    columnMode: "basic",
    showDeliveryTimeRow: false,
    printOrientation: supplierColumns.length >= 3 ? "landscape" : "portrait",
    supplierColumns,
    rows,
    recommendedSupplierName: selectedCol?.supplierName || "",
    deliveryTerms: "",
    paymentTerms: "Thanh toán 100% trước khi giao hàng.",
    reasons: [
      "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.",
      "Thời gian giao hàng: 5 ngày từ ngày đặt hàng.",
    ],
    approverLeader: getSavedApprovalSigners().approverLeader || "Đinh Anh Hào",
    approverDeptHead: getSavedApprovalSigners().approverDeptHead || "Lưu Thị Thanh Xuân",
    requesterName: getSavedApprovalSigners().requesterName || "Trần Hải Hà",
    status: "Nháp",
  };
}

/**
 * Tạo mới phiếu Đề nghị phê duyệt độc lập (Manual / Paste Excel)
 */
export function createManualApproval(
  existingCount: number,
  _suppliers?: Supplier[],
): ApprovalRequest {
  const supplierColumns: ApprovalSupplierColumn[] = [
    {
      colId: "col_1",
      supplierName: "",
      shortName: "",
      isSelected: true,
      deliveryTime: "",
    },
    {
      colId: "col_2",
      supplierName: "",
      shortName: "",
      isSelected: false,
      deliveryTime: "",
    },
    {
      colId: "col_3",
      supplierName: "",
      shortName: "",
      isSelected: false,
      deliveryTime: "",
    },
  ];

  const rows: ApprovalItemRow[] = Array.from({ length: 5 }, (_, idx) => {
    const supplierQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
    supplierColumns.forEach((col) => {
      supplierQuotes[col.colId] = [
        {
          lineId: `line_${idx + 1}_${col.colId}_1`,
          quotedProduct: "",
          origin: "",
          unitPrice: 0,
          qty: 1,
          amount: 0,
        },
      ];
    });
    return {
      rowId: `row_manual_${idx + 1}`,
      stt: idx + 1,
      itemCode: "",
      itemName: "",
      spec: "",
      qty: 1,
      unit: "Cái",
      supplierQuotes,
    };
  });

  const requestNum = `ĐNPD-${String(existingCount + 1).padStart(3, "0")}`;
  const selectedCol = supplierColumns.find((c) => c.isSelected) || supplierColumns[0];

  return {
    id: Date.now(),
    requestNumber: requestNum,
    sourceType: "manual",
    prNumber: "",
    createdDate: formatTodayVN(),
    department: "Cung ứng",
    requestingDepartment: "",
    noteRef: "",
    section1Title: formatApprovalSection1Title(""),
    columnMode: "basic",
    showDeliveryTimeRow: false,
    printOrientation: "landscape",
    supplierColumns,
    rows,
    recommendedSupplierName: "",
    deliveryTerms: "",
    paymentTerms: "Thanh toán 100% trước khi giao hàng.",
    reasons: [
      "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.",
      "Thời gian giao hàng: 5 ngày từ ngày đặt hàng.",
    ],
    approverLeader: getSavedApprovalSigners().approverLeader || "Đinh Anh Hào",
    approverDeptHead: getSavedApprovalSigners().approverDeptHead || "Lưu Thị Thanh Xuân",
    requesterName: getSavedApprovalSigners().requesterName || "Trần Hải Hà",
    status: "Nháp",
  };
}

/**
 * 2 Mẫu chuẩn Phenikaa Pharma từ file Excel thực tế (PR 02/06/PR2602 & PR 16/03/PR2603)
 */
export const SAMPLE_PHENIKAA_APPROVALS: ApprovalRequest[] = [
  {
    id: 260202,
    requestNumber: "02/06/PR2602",
    sourceType: "manual",
    prNumber: "02/06/PR2602",
    createdDate: "28/02/2026",
    department: "Cung ứng",
    requestingDepartment: "QC",
    noteRef: "02/06/PR2602",
    section1Title: formatApprovalSection1Title("QC"),
    columnMode: "origin",
    showQuotedProduct: true,
    quotedProductHeader: "Hãng/ Xuất xứ",
    showSupplierQty: false,
    showDeliveryTimeRow: true,
    printOrientation: "landscape",
    supplierColumns: [
      {
        colId: "col_thien_quang",
        supplierName: "CÔNG TY TNHH THIẾT BỊ KHOA HỌC KỸ THUẬT THIÊN QUANG",
        shortName: "Thiên Quang",
        isSelected: true,
        deliveryTime: "Hàng có sẵn",
      },
      {
        colId: "col_khang_kien",
        supplierName: "Công ty TNHH Thiết Bị Khoa Học Khang Kiên",
        shortName: "Khang Kiên",
        isSelected: false,
        deliveryTime: "Hàng có sẵn",
      },
      {
        colId: "col_thang_long",
        supplierName: "Công Ty TNHH Dịch Vụ Và Thiết Bị Khoa Học Thăng Long",
        shortName: "Thăng Long",
        isSelected: false,
        deliveryTime: "4-6 tuần từ ngày đặt hàng",
      },
    ],
    rows: [
      {
        rowId: "r_khv_1",
        stt: 1,
        itemName:
          "Kính hiển vi soi nổi 2 mắt:\n- Độ phóng đại 7 lần đến 45 lần\n- Thị kính trường rộng WF10X/20mm\n- Đầu quan sát nghiêng 45 độ, xoay 360 độ\n- Nguồn sáng đèn LED có thể điều chỉnh mức độ sáng.",
        qty: 1,
        unit: "Chiếc",
        supplierQuotes: {
          col_thien_quang: [
            {
              lineId: "l_khv_tq",
              origin: "Kính hiển vi soi nổi SZM45B1 - Sunny - Trung Quốc",
              unitPrice: 7000000,
              qty: 1,
              amount: 7000000,
            },
          ],
          col_khang_kien: [
            {
              lineId: "l_khv_kk",
              origin: "Kính hiển vi soi nổi SZM45B1 - Sunny - Trung Quốc",
              unitPrice: 7200000,
              qty: 1,
              amount: 7200000,
            },
          ],
          col_thang_long: [
            {
              lineId: "l_khv_tl",
              origin: "Kính hiển vi soi nổi Model: Z-45B - hãng Labomed - Mỹ",
              unitPrice: 23000000,
              qty: 1,
              amount: 23000000,
            },
          ],
        },
      },
    ],
    recommendedSupplierName:
      "CÔNG TY TNHH THIẾT BỊ KHOA HỌC KỸ THUẬT THIÊN QUANG",
    deliveryTerms: "",
    paymentTerms: "Thanh toán 100% trước khi giao hàng.",
    reasons: [
      "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.",
      "Thời gian giao hàng: Hàng có sẵn.",
    ],
    approverLeader: "Đinh Anh Hào",
    approverDeptHead: "Lưu Thị Thanh Xuân",
    requesterName: "Trần Hải Hà",
    status: "Đã phê duyệt",
  },
];
