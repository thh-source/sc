import {
  ApprovalItemRow,
  ApprovalRequest,
  ApprovalSupplierColumn,
  ApprovalSupplierQuoteLine,
  PR,
  Quote,
  Supplier,
} from "../types";

/**
 * Làm sạch chuỗi số khi paste từ Excel (hỗ trợ cả định dạng VN 1.930.000 và US 1,930,000)
 */
export function cleanExcelNumber(raw: string): number {
  if (!raw) return 0;
  let s = String(raw)
    .trim()
    .replace(/[^\d.,-]/g, "");
  if (!s) return 0;

  // Nếu có cả dấu chấm và dấu phẩy
  if (s.includes(".") && s.includes(",")) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // Dạng 1.930.000,50 -> bỏ dấu chấm, thay phẩy bằng chấm
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Dạng 1,930,000.50 -> bỏ dấu phẩy
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(".")) {
    const parts = s.split(".");
    // Nếu có nhiều dấu chấm (1.930.000) hoặc phần sau dấu chấm có đúng 3 chữ số (100.000) -> dấu phân cách hàng nghìn
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/\./g, "");
    }
  } else if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  }

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

export function formatTodayVN(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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
        shortName: sup?.shortName || sup?.name || `NCC ${idx + 1}`,
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
    requestNumber: pr.number || `PD-${String(existingCount + 1).padStart(2, "0")}`,
    sourceType: "compare",
    prId: pr.id,
    prNumber: pr.number,
    createdDate: formatTodayVN(),
    department: pr.department || "Phòng chuỗi cung ứng",
    noteRef: pr.number,
    section1Title: `Phê duyệt nhà cung cấp (${pr.purpose || pr.number}) với thông tin báo giá như sau:`,
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
    approverLeader: "Đinh Anh Hào",
    approverDeptHead: "Lưu Thị Thanh Xuân",
    requesterName: "Trần Hải Hà",
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
          shortName: sup.shortName || sup.name,
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
    requestNumber: pr.number || `PD-${String(existingCount + 1).padStart(2, "0")}`,
    sourceType: "pr",
    prId: pr.id,
    prNumber: pr.number,
    createdDate: formatTodayVN(),
    department: pr.department || "Phòng chuỗi cung ứng",
    noteRef: pr.number,
    section1Title: `Phê duyệt nhà cung cấp (${pr.purpose || pr.number}) với thông tin báo giá như sau:`,
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
    approverLeader: "Đinh Anh Hào",
    approverDeptHead: "Lưu Thị Thanh Xuân",
    requesterName: "Trần Hải Hà",
    status: "Nháp",
  };
}

/**
 * Tạo mới phiếu Đề nghị phê duyệt độc lập (Manual / Paste Excel)
 */
export function createManualApproval(existingCount: number): ApprovalRequest {
  const supplierColumns: ApprovalSupplierColumn[] = [
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

  const code = `${String(existingCount + 1).padStart(2, "0")}/03/PR2603`;

  return {
    id: Date.now(),
    requestNumber: code,
    sourceType: "manual",
    prNumber: code,
    createdDate: formatTodayVN(),
    department: "Phòng chuỗi cung ứng",
    noteRef: code,
    section1Title:
      "Phê duyệt nhà cung cấp (vật tư/hàng hóa) với thông tin báo giá như sau:",
    columnMode: "basic",
    showDeliveryTimeRow: false,
    printOrientation: "landscape",
    supplierColumns,
    rows,
    recommendedSupplierName: "Nhà cung cấp 1",
    deliveryTerms: "",
    paymentTerms: "Thanh toán 100% trước khi giao hàng.",
    reasons: [
      "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.",
      "Thời gian giao hàng: 5 ngày từ ngày đặt hàng.",
    ],
    approverLeader: "Đinh Anh Hào",
    approverDeptHead: "Lưu Thị Thanh Xuân",
    requesterName: "Trần Hải Hà",
    status: "Nháp",
  };
}

/**
 * 2 Mẫu chuẩn Phenikaa Pharma từ file Excel thực tế (PR 02/06/PR2602 & PR 16/03/PR2603)
 */
export const SAMPLE_PHENIKAA_APPROVALS: ApprovalRequest[] = [
  {
    id: 260316,
    requestNumber: "16/03/PR2603",
    sourceType: "manual",
    prNumber: "16/03/PR2603",
    createdDate: "30/03/2026",
    department: "Phòng chuỗi cung ứng",
    noteRef: "16/03/PR2603",
    section1Title:
      "Phê duyệt nhà cung cấp (vật tư phòng cơ điện) với thông tin báo giá như sau:",
    columnMode: "extended",
    showQuotedProduct: true,
    quotedProductHeader: "Sản phẩm",
    showSupplierQty: true,
    showDeliveryTimeRow: false,
    printOrientation: "landscape",
    supplierColumns: [
      {
        colId: "col_nam_anh",
        supplierName: "CÔNG TY CỔ PHẦN VẬT TƯ NAM ANH",
        shortName: "Nam Anh",
        isSelected: true,
        deliveryTime: "5 ngày từ ngày đặt hàng",
      },
      {
        colId: "col_minox",
        supplierName: "CÔNG TY TNHH MINOX VIỆT NAM",
        shortName: "Minox",
        isSelected: false,
        deliveryTime: "7-10 ngày",
      },
    ],
    rows: [
      {
        rowId: "r_1",
        stt: 1,
        itemName:
          "Kép thu vi sinh inox 316L hai đầu clamp 45x21.7 (DN40-DN15)",
        qty: 6,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_1_na",
              quotedProduct:
                "Côn thu vi sinh 2 đầu clamp inox 316L 45x21.7 (DN40-DN15)",
              unitPrice: 1930000,
              qty: 6,
              amount: 11580000,
            },
          ],
          col_minox: [
            {
              lineId: "l_1_mn",
              quotedProduct:
                "Côn thu đồng tâm vi sinh chuẩn SMS hai đầu Clamp Size 38.1 x 19.05mm, L=106mm, Inox 316L",
              unitPrice: 2770000,
              qty: 6,
              amount: 16620000,
            },
          ],
        },
      },
      {
        rowId: "r_2",
        stt: 2,
        itemName:
          "Kép thu vi sinh inox 316L hai đầu clamp 57x21.7 (DN50-DN15)",
        qty: 6,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_2_na",
              quotedProduct:
                "Côn thu vi sinh 2 đầu clamp inox 316L 57x21.7 (DN50-DN15)",
              unitPrice: 2150000,
              qty: 6,
              amount: 12900000,
            },
          ],
          col_minox: [
            {
              lineId: "l_2_mn",
              quotedProduct:
                "Côn thu đồng tâm vi sinh chuẩn SMS hai đầu Clamp Size 50.8 x 19.05mm, L=142mm, Inox 316L",
              unitPrice: 2875000,
              qty: 6,
              amount: 17250000,
            },
          ],
        },
      },
      {
        rowId: "r_3",
        stt: 3,
        itemName: "Mặt bích inox 304 DN40 PN10 RF",
        qty: 2,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_3_na",
              quotedProduct: "Mặt bích rỗng inox 304 DN40 PN10 RF",
              unitPrice: 160000,
              qty: 2,
              amount: 320000,
            },
          ],
          col_minox: [
            {
              lineId: "l_3_mn",
              quotedProduct: "Bích rỗng cổ hàn chuẩn DIN Size DN40 PN10, Inox 304",
              unitPrice: 675000,
              qty: 2,
              amount: 1350000,
            },
          ],
        },
      },
      {
        rowId: "r_4",
        stt: 4,
        itemName: "Mặt bích inox 304 DN32 PN10 RF",
        qty: 2,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_4_na",
              quotedProduct: "Mặt bích rỗng inox 304 DN32 PN10 RF",
              unitPrice: 135000,
              qty: 2,
              amount: 270000,
            },
          ],
          col_minox: [
            {
              lineId: "l_4_mn",
              quotedProduct: "Bích rỗng cổ hàn chuẩn DIN Size DN32 PN10, Inox 304",
              unitPrice: 615000,
              qty: 2,
              amount: 1230000,
            },
          ],
        },
      },
      {
        rowId: "r_5",
        stt: 5,
        itemName: "Van 1 chiều inox 316L hai đầu clamp DN40 (Phi 45)",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_5_na",
              quotedProduct: "Van 1 chiều vi sinh 2 đầu clamp inox 316L phi 45",
              unitPrice: 1230000,
              qty: 4,
              amount: 4920000,
            },
          ],
          col_minox: [
            {
              lineId: "l_5_mn_1",
              quotedProduct:
                "Van một chiều vi sinh kết nối Clamp - chuẩn 3A Size 1.5\" (38.1mm), L=94mm, Inox 316L, gioăng EPDM",
              unitPrice: 2474000,
              qty: 1,
              amount: 2474000,
            },
            {
              lineId: "l_5_mn_2",
              quotedProduct:
                "Van một chiều vi sinh kết nối Clamp - chuẩn SMS Size 38.1mm, L=94mm, Inox 316L, gioăng EPDM",
              unitPrice: 2150000,
              qty: 3,
              amount: 6450000,
            },
          ],
        },
      },
      {
        rowId: "r_6",
        stt: 6,
        itemName: "Tê đều vi sinh inox 316L nối hàn DN40 (Phi 45)",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_6_na",
              quotedProduct: "Tê đều vi sinh inox 316L nối hàn phi 45",
              unitPrice: 540000,
              qty: 4,
              amount: 2160000,
            },
          ],
          col_minox: [
            {
              lineId: "l_6_mn",
              quotedProduct:
                "Tê đều vi sinh dài chuẩn SMS kết nối hàn Size 38.1mm, dày 1.5mm, Inox 316L",
              unitPrice: 295000,
              qty: 4,
              amount: 1180000,
            },
          ],
        },
      },
      {
        rowId: "r_7",
        stt: 7,
        itemName: "Chân ren inox vi sinh 316L kết nối clamp phi 45 - ren ngoài DN40",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_7_na",
              quotedProduct:
                "Chân ren inox vi sinh 316L 1 đầu clamp 1 đầu ren ngoài phi 45 (DN40)",
              unitPrice: 430000,
              qty: 4,
              amount: 1720000,
            },
          ],
          col_minox: [
            {
              lineId: "l_7_mn",
              quotedProduct: "Đầu nối ren ngoài G 1-1/2 inch x Clamp 50.5mm Inox 316",
              unitPrice: 660000,
              qty: 4,
              amount: 2640000,
            },
          ],
        },
      },
      {
        rowId: "r_8",
        stt: 8,
        itemName: "Chân ren inox vi sinh 316L kết nối clamp phi 45 - ren ngoài DN32",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_8_na",
              quotedProduct:
                "Chân ren inox vi sinh 316L 1 đầu clamp phi 45, 1 đầu ren ngoài phi 32",
              unitPrice: 430000,
              qty: 4,
              amount: 1720000,
            },
          ],
          col_minox: [
            {
              lineId: "l_8_mn",
              quotedProduct: "Đầu nối ren ngoài G 1-1/4 inch x Clamp 50.5mm Inox 316",
              unitPrice: 660000,
              qty: 4,
              amount: 2640000,
            },
          ],
        },
      },
      {
        rowId: "r_9",
        stt: 9,
        itemName: "Cút vi sinh 90 độ inox 316L 2 đầu clamp DN40 (Phi 45)",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_9_na",
              quotedProduct: "Cút 90 độ vi sinh inox 316L 2 đầu clamp phi 45",
              unitPrice: 540000,
              qty: 4,
              amount: 2160000,
            },
          ],
          col_minox: [
            {
              lineId: "l_9_mn",
              quotedProduct:
                "Cút 90° vi sinh hai đầu Clamp chuẩn SMS Size 38.1mm, Inox 316L",
              unitPrice: 550000,
              qty: 4,
              amount: 2200000,
            },
          ],
        },
      },
      {
        rowId: "r_10",
        stt: 10,
        itemName: "Cút vi sinh 90 độ inox 316L nối hàn DN40 (Phi 45)",
        qty: 15,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_10_na",
              quotedProduct: "Cút 90 độ vi sinh inox 316L nối hàn phi 45",
              unitPrice: 360000,
              qty: 15,
              amount: 5400000,
            },
          ],
          col_minox: [
            {
              lineId: "l_10_mn",
              quotedProduct:
                "Cút 90° dài vi sinh chuẩn SMS kết nối hàn Size 38.1mm, dày 1.5mm, Inox 316L",
              unitPrice: 185000,
              qty: 15,
              amount: 2775000,
            },
          ],
        },
      },
      {
        rowId: "r_11",
        stt: 11,
        itemName: "Côn thu ren ngoài inox 304 DN40-DN32",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_11_na",
              quotedProduct: "Kép côn thu ren ngoài inox 304 DN40-DN32",
              unitPrice: 75000,
              qty: 4,
              amount: 300000,
            },
          ],
          col_minox: [
            {
              lineId: "l_11_mn",
              quotedProduct: "Kép thu ren NPT Size DN40 x DN32, Inox 304",
              unitPrice: 95000,
              qty: 4,
              amount: 380000,
            },
          ],
        },
      },
      {
        rowId: "r_12",
        stt: 12,
        itemName: "Kép ren ngoài inox 304 DN32",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_12_na",
              quotedProduct: "Kép ren ngoài inox 304 DN32",
              unitPrice: 40000,
              qty: 4,
              amount: 160000,
            },
          ],
          col_minox: [
            {
              lineId: "l_12_mn",
              quotedProduct: "Kép đều hai đầu ren BSPT Size DN32, Inox 304",
              unitPrice: 95000,
              qty: 4,
              amount: 380000,
            },
          ],
        },
      },
      {
        rowId: "r_13",
        stt: 13,
        itemName: "Măng sông ren trong inox 304 DN32",
        qty: 6,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_13_na",
              quotedProduct: "Măng sông ren trong inox 304 DN32",
              unitPrice: 35000,
              qty: 6,
              amount: 210000,
            },
          ],
          col_minox: [
            {
              lineId: "l_13_mn",
              quotedProduct: "Măng sông ren trong BSPT Size DN32, Inox 304",
              unitPrice: 75000,
              qty: 6,
              amount: 450000,
            },
          ],
        },
      },
      {
        rowId: "r_14",
        stt: 14,
        itemName: "Kép ren ngoài inox 304 DN40",
        qty: 4,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_14_na",
              quotedProduct: "Kép ren ngoài inox 304 DN40",
              unitPrice: 55000,
              qty: 4,
              amount: 220000,
            },
          ],
          col_minox: [
            {
              lineId: "l_14_mn",
              quotedProduct: "Kép đều hai đầu ren BSPT Size DN40, Inox 304",
              unitPrice: 120000,
              qty: 4,
              amount: 480000,
            },
          ],
        },
      },
      {
        rowId: "r_15",
        stt: 15,
        itemName: "Măng sông ren trong inox 304 DN40",
        qty: 6,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_15_na",
              quotedProduct: "Măng sông ren trong inox 304 DN40",
              unitPrice: 50000,
              qty: 6,
              amount: 300000,
            },
          ],
          col_minox: [
            {
              lineId: "l_15_mn",
              quotedProduct: "Măng sông ren trong BSPT Size DN40, Inox 304",
              unitPrice: 100000,
              qty: 6,
              amount: 600000,
            },
          ],
        },
      },
      {
        rowId: "r_16",
        stt: 16,
        itemName: "Côn thu hàn đồng tâm inox 304 DN40-DN32 SCH10S",
        qty: 6,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_16_na",
              quotedProduct: "Côn thu hàn đồng tâm inox 304 DN40-DN32 SCH10S",
              unitPrice: 65000,
              qty: 6,
              amount: 390000,
            },
          ],
          col_minox: [
            {
              lineId: "l_16_mn",
              quotedProduct: "Côn thu đồng tâm kết nối hàn SCH10S Size DN40xDN32",
              unitPrice: 95000,
              qty: 6,
              amount: 570000,
            },
          ],
        },
      },
      {
        rowId: "r_17",
        stt: 17,
        itemName: "Nắp bịt clamp inox 316L DN40 (Phi 45)",
        qty: 10,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_17_na",
              quotedProduct: "Nắp bịt clamp vi sinh inox 316L phi 45",
              unitPrice: 80000,
              qty: 10,
              amount: 800000,
            },
          ],
          col_minox: [
            {
              lineId: "l_17_mn",
              quotedProduct: "Mặt bích mù Clamp 50.5mm Inox 316L",
              unitPrice: 135000,
              qty: 10,
              amount: 1350000,
            },
          ],
        },
      },
      {
        rowId: "r_18",
        stt: 18,
        itemName: "Cùm clamp inox 304 DN40 (Phi 45)",
        qty: 10,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_18_na",
              quotedProduct: "Cùm clamp vi sinh inox 304 phi 45",
              unitPrice: 40000,
              qty: 10,
              amount: 400000,
            },
          ],
          col_minox: [
            {
              lineId: "l_18_mn",
              quotedProduct: "Cùm kẹp Clamp 50.5mm Inox 304",
              unitPrice: 45000,
              qty: 10,
              amount: 450000,
            },
          ],
        },
      },
      {
        rowId: "r_19",
        stt: 19,
        itemName: "Chân clamp vi sinh inox 316L DN40 (Phi 45)",
        qty: 10,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_19_na",
              quotedProduct: "Chân clamp vi sinh inox 316L phi 45",
              unitPrice: 120000,
              qty: 10,
              amount: 1200000,
            },
          ],
          col_minox: [
            {
              lineId: "l_19_mn",
              quotedProduct:
                "Chân hàn Clamp ngắn chuẩn SMS Size 38.1mm, mặt bích 50.5mm, L=12.7mm, Inox 316L",
              unitPrice: 90000,
              qty: 10,
              amount: 900000,
            },
          ],
        },
      },
      {
        rowId: "r_20",
        stt: 20,
        itemName: "Gioăng silicon dùng cho clamp DN40 (Phi 45)",
        qty: 50,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_20_na",
              quotedProduct: "Gioăng silicon vi sinh phi 45",
              unitPrice: 7000,
              qty: 50,
              amount: 350000,
            },
          ],
          col_minox: [
            {
              lineId: "l_20_mn",
              quotedProduct:
                "Gioăng Clamp vi sinh chuẩn SMS Size 38.1mm, mặt bích 50.5mm, nhựa Silicon",
              unitPrice: 15000,
              qty: 50,
              amount: 750000,
            },
          ],
        },
      },
      {
        rowId: "r_21",
        stt: 21,
        itemName: "Gioăng silicon dùng cho clamp DN15 (Phi 21.7)",
        qty: 50,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_21_na",
              quotedProduct: "Gioăng silicon vi sinh phi 21.7 (DN15)",
              unitPrice: 6000,
              qty: 50,
              amount: 300000,
            },
          ],
          col_minox: [
            {
              lineId: "l_21_mn",
              quotedProduct: "Gioăng Clamp chuẩn DIN Size DN15 (bích 34mm), Silicon",
              unitPrice: 15000,
              qty: 50,
              amount: 750000,
            },
          ],
        },
      },
      {
        rowId: "r_22",
        stt: 22,
        itemName: "Nắp bịt clamp inox 316L DN15 (Phi 21.7)",
        qty: 10,
        unit: "Cái",
        supplierQuotes: {
          col_nam_anh: [
            {
              lineId: "l_22_na",
              quotedProduct: "Nắp bịt clamp vi sinh inox 316L phi 21.7 (DN15)",
              unitPrice: 55000,
              qty: 10,
              amount: 550000,
            },
          ],
          col_minox: [
            {
              lineId: "l_22_mn",
              quotedProduct: "Mặt bích mù Clamp 34mm Inox 316L",
              unitPrice: 80000,
              qty: 10,
              amount: 800000,
            },
          ],
        },
      },
    ],
    recommendedSupplierName: "CÔNG TY CỔ PHẦN VẬT TƯ NAM ANH",
    deliveryTerms: "",
    paymentTerms: "Thanh toán 100% trước khi giao hàng.",
    reasons: [
      "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.",
      "Thời gian giao hàng: 5 ngày từ ngày đặt hàng.",
    ],
    approverLeader: "Đinh Anh Hào",
    approverDeptHead: "Lưu Thị Thanh Xuân",
    requesterName: "Trần Hải Hà",
    status: "Đã phê duyệt",
  },
  {
    id: 260202,
    requestNumber: "02/06/PR2602",
    sourceType: "manual",
    prNumber: "02/06/PR2602",
    createdDate: "28/02/2026",
    department: "Phòng chuỗi cung ứng",
    noteRef: "02/06/PR2602",
    section1Title:
      "Phê duyệt nhà cung cấp (Kính hiển vi soi nổi) với thông tin báo giá như sau:",
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
