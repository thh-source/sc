"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApprovalItemRow,
  ApprovalRequest,
  ApprovalSupplierColumn,
  ApprovalSupplierQuoteLine,
  PR,
  Quote,
  Supplier,
} from "../types";
import { fmt as formatVND } from "../utils/format";
import { PHENIKAA_PHARMA_LOGO_BASE64 } from "../payment-utils";
import {
  cleanExcelNumber,
  createApprovalFromCompare,
  createApprovalFromPR,
  createManualApproval,
  parseExcelClipboard,
} from "../utils/approvalSamples";

interface ApprovalManagementProps {
  approvalRequests: ApprovalRequest[];
  activeApprovalId: number | null;
  setActiveApprovalId: (id: number | null) => void;
  onSaveApproval: (req: ApprovalRequest) => void;
  onDeleteApproval: (id: number) => void;
  onRestoreSamples: () => void;
  onCreatePOFromApproval: (req: ApprovalRequest) => void;
  prs: PR[];
  suppliers: Supplier[];
  quotesByPr: Record<number, Quote>;
  quoteSupplierIdsByPr: Record<number, number[]>;
  isReportMode?: boolean;
  onBackToCompare?: () => void;
}

type FlatColDescriptor =
  | { type: "fixed"; field: "itemName" | "qty" | "unit" }
  | {
      type: "supplier";
      colId: string;
      field: "quotedProduct" | "unitPrice" | "qty" | "amount";
    };

const DELIVERY_TERM_PRESETS = [
  "Giao hàng tại kho nhà máy Phenikaa Pharma",
  "Đã bao gồm chi phí vận chuyển đến kho bên mua",
  "Giao hàng trong giờ hành chính",
];

const PAYMENT_TERM_PRESETS = [
  "Thanh toán 100% trước khi giao hàng.",
  "Thanh toán 100% trong vòng 30 ngày sau khi nhận đủ hàng và hồ sơ thanh toán hợp lệ.",
  "Tạm ứng 30% sau khi ký PO, thanh toán 70% còn lại sau khi giao hàng.",
];

const REASON_PRESETS = [
  "Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật. Đơn giá rẻ nhất.",
  "Thời gian giao hàng: 5 ngày từ ngày đặt hàng.",
  "Thời gian giao hàng: Hàng có sẵn.",
  "Nhà cung cấp uy tín, lịch sử thực hiện hợp đồng và dịch vụ hậu mãi tốt.",
];

export function isQuotedProductVisible(req: ApprovalRequest): boolean {
  if (req.showQuotedProduct !== undefined) return req.showQuotedProduct;
  return req.columnMode === "origin" || req.columnMode === "extended";
}

export function isSupplierQtyVisible(req: ApprovalRequest): boolean {
  if (req.showSupplierQty !== undefined) return req.showSupplierQty;
  return req.columnMode === "extended";
}

export function getQuotedProductTitle(req: ApprovalRequest): string {
  if (req.quotedProductHeader && req.quotedProductHeader.trim()) {
    return req.quotedProductHeader;
  }
  if (req.columnMode === "origin") return "Hãng/ Xuất xứ";
  return "Mặt hàng NCC báo";
}

export function computeSupplierTotal(
  req: ApprovalRequest,
  colId: string,
): number {
  const useSupQty = isSupplierQtyVisible(req);
  let sum = 0;
  req.rows.forEach((row) => {
    const lines = row.supplierQuotes[colId] || [];
    lines.forEach((line) => {
      const effQty = useSupQty
        ? Number(line.qty) || 0
        : Number(row.qty) || 0;
      const unitPrice = Number(line.unitPrice) || 0;
      const amt = unitPrice > 0 ? unitPrice * effQty : Number(line.amount) || 0;
      sum += amt;
    });
  });
  return sum;
}

/**
 * Tự động tính số dòng hiển thị (rows) cho textarea dựa trên độ dài chuỗi và ký tự xuống dòng
 */
function calcTextareaRows(text: string | undefined, charsPerLine = 22): number {
  if (!text) return 2;
  const lines = String(text).split("\n");
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  return Math.max(2, Math.min(8, totalLines));
}

export default function ApprovalManagement({
  approvalRequests,
  activeApprovalId,
  setActiveApprovalId,
  onSaveApproval,
  onDeleteApproval,
  onRestoreSamples,
  onCreatePOFromApproval,
  prs,
  suppliers,
  quotesByPr,
  quoteSupplierIdsByPr,
  isReportMode = false,
  onBackToCompare,
}: ApprovalManagementProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sourceModalMode, setSourceModalMode] = useState<"compare" | "pr" | null>(
    null,
  );
  const [selectedAddSupplierId, setSelectedAddSupplierId] = useState<string>("");
  const [pasteToast, setPasteToast] = useState<string | null>(null);
  const [showExcelPasteModal, setShowExcelPasteModal] = useState(false);
  const [rawExcelModalText, setRawExcelModalText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = (msg: string) => {
    setPasteToast(msg);
    setTimeout(() => {
      setPasteToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const filteredRequests = useMemo(() => {
    return approvalRequests.filter((req) => {
      if (statusFilter !== "ALL" && req.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        req.requestNumber.toLowerCase().includes(q) ||
        req.prNumber.toLowerCase().includes(q) ||
        req.department.toLowerCase().includes(q) ||
        req.recommendedSupplierName.toLowerCase().includes(q) ||
        req.section1Title.toLowerCase().includes(q)
      );
    });
  }, [approvalRequests, searchQuery, statusFilter]);

  // Chỉ mở giao diện làm việc khi activeApprovalId khác null và tìm thấy phiếu
  const activeRequest = useMemo(() => {
    if (activeApprovalId === null) return null;
    return approvalRequests.find((r) => r.id === activeApprovalId) || null;
  }, [approvalRequests, activeApprovalId]);

  const updateActive = (updater: (prev: ApprovalRequest) => ApprovalRequest) => {
    if (!activeRequest || isReportMode) return;
    const next = updater(activeRequest);
    onSaveApproval(next);
  };

  const hasQuotedProduct = activeRequest
    ? isQuotedProductVisible(activeRequest)
    : false;
  const hasSupplierQty = activeRequest
    ? isSupplierQtyVisible(activeRequest)
    : false;
  const quotedProductTitle = activeRequest
    ? getQuotedProductTitle(activeRequest)
    : "Mặt hàng NCC báo";

  // Bật/tắt cột Mặt hàng NCC báo
  const toggleQuotedProductColumn = (forceVal?: boolean) => {
    updateActive((prev) => {
      const current = isQuotedProductVisible(prev);
      const nextVal = forceVal !== undefined ? forceVal : !current;
      const supQty = isSupplierQtyVisible(prev);
      return {
        ...prev,
        showQuotedProduct: nextVal,
        quotedProductHeader: prev.quotedProductHeader || "Mặt hàng NCC báo",
        columnMode: nextVal && supQty ? "extended" : nextVal ? "origin" : "basic",
      };
    });
  };

  // Bật/tắt cột Số lượng mua của NCC
  const toggleSupplierQtyColumn = (forceVal?: boolean) => {
    updateActive((prev) => {
      const current = isSupplierQtyVisible(prev);
      const nextVal = forceVal !== undefined ? forceVal : !current;
      const quotedProd = isQuotedProductVisible(prev);
      return {
        ...prev,
        showSupplierQty: nextVal,
        columnMode: nextVal ? "extended" : quotedProd ? "origin" : "basic",
      };
    });
  };

  // Danh sách cột phẳng phục vụ Paste Excel đa dòng/cột theo đúng các cột đang bật
  const flatColumns = useMemo<FlatColDescriptor[]>(() => {
    if (!activeRequest) return [];
    const cols: FlatColDescriptor[] = [
      { type: "fixed", field: "itemName" },
      { type: "fixed", field: "qty" },
      { type: "fixed", field: "unit" },
    ];
    activeRequest.supplierColumns.forEach((sc) => {
      if (hasQuotedProduct) {
        cols.push({ type: "supplier", colId: sc.colId, field: "quotedProduct" });
      }
      cols.push({ type: "supplier", colId: sc.colId, field: "unitPrice" });
      if (hasSupplierQty) {
        cols.push({ type: "supplier", colId: sc.colId, field: "qty" });
      }
      cols.push({ type: "supplier", colId: sc.colId, field: "amount" });
    });
    return cols;
  }, [activeRequest, hasQuotedProduct, hasSupplierQty]);

  // Tính tổng tiền chưa có VAT cho từng cột NCC
  const supplierTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!activeRequest) return totals;
    activeRequest.supplierColumns.forEach((sc) => {
      totals[sc.colId] = computeSupplierTotal(activeRequest, sc.colId);
    });
    return totals;
  }, [activeRequest]);

  // Chọn NCC được đề xuất (Radio trên header cột)
  const handleSelectSupplierCol = (colId: string) => {
    updateActive((prev) => {
      const targetCol = prev.supplierColumns.find((c) => c.colId === colId);
      const nextCols = prev.supplierColumns.map((c) => ({
        ...c,
        isSelected: c.colId === colId,
      }));
      return {
        ...prev,
        supplierColumns: nextCols,
        recommendedSupplierName:
          targetCol?.supplierName ||
          targetCol?.shortName ||
          prev.recommendedSupplierName,
      };
    });
  };

  // Thêm cột NCC mới
  const handleAddSupplierColumn = () => {
    if (!activeRequest) return;
    const supIdNum = selectedAddSupplierId
      ? Number(selectedAddSupplierId)
      : undefined;
    const matchedSup =
      supIdNum !== undefined
        ? suppliers.find((s) => s.id === supIdNum)
        : undefined;

    const newIndex = activeRequest.supplierColumns.length + 1;
    const newColId = `col_${Date.now()}_${newIndex}`;
    const newCol: ApprovalSupplierColumn = {
      colId: newColId,
      supplierId: matchedSup?.id,
      supplierName: matchedSup?.name || `Nhà cung cấp ${newIndex}`,
      shortName: matchedSup?.shortName || matchedSup?.name || `NCC ${newIndex}`,
      isSelected: activeRequest.supplierColumns.length === 0,
      deliveryTime: "",
    };

    updateActive((prev) => {
      const nextCols = [...prev.supplierColumns, newCol];
      const nextRows = prev.rows.map((r) => ({
        ...r,
        supplierQuotes: {
          ...r.supplierQuotes,
          [newColId]: [
            {
              lineId: `line_${r.rowId}_${newColId}_1`,
              quotedProduct: r.itemName,
              origin: "",
              unitPrice: 0,
              qty: r.qty,
              amount: 0,
            },
          ],
        },
      }));
      return {
        ...prev,
        supplierColumns: nextCols,
        rows: nextRows,
        printOrientation:
          nextCols.length >= 3 ? "landscape" : prev.printOrientation,
      };
    });
    setSelectedAddSupplierId("");
  };

  // Xóa cột NCC
  const handleRemoveSupplierColumn = (colId: string) => {
    if (!activeRequest || activeRequest.supplierColumns.length <= 1) return;
    updateActive((prev) => {
      const remaining = prev.supplierColumns.filter((c) => c.colId !== colId);
      if (remaining.length > 0 && !remaining.some((c) => c.isSelected)) {
        remaining[0] = { ...remaining[0], isSelected: true };
      }
      const nextRows = prev.rows.map((r) => {
        const copy = { ...r.supplierQuotes };
        delete copy[colId];
        return { ...r, supplierQuotes: copy };
      });
      const selected = remaining.find((c) => c.isSelected);
      return {
        ...prev,
        supplierColumns: remaining,
        rows: nextRows,
        recommendedSupplierName:
          selected?.supplierName || prev.recommendedSupplierName,
      };
    });
  };

  // Thêm dòng hàng hóa mới
  const handleAddRow = () => {
    if (!activeRequest) return;
    updateActive((prev) => {
      const nextStt = prev.rows.length + 1;
      const rowId = `row_${Date.now()}_${nextStt}`;
      const supplierQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
      prev.supplierColumns.forEach((col) => {
        supplierQuotes[col.colId] = [
          {
            lineId: `line_${rowId}_${col.colId}_1`,
            quotedProduct: "",
            origin: "",
            unitPrice: 0,
            qty: 1,
            amount: 0,
          },
        ];
      });
      return {
        ...prev,
        rows: [
          ...prev.rows,
          {
            rowId,
            stt: nextStt,
            itemName: "",
            qty: 1,
            unit: "Cái",
            supplierQuotes,
          },
        ],
      };
    });
  };

  // Xóa dòng hàng hóa
  const handleRemoveRow = (rowId: string) => {
    if (!activeRequest || activeRequest.rows.length <= 1) return;
    updateActive((prev) => {
      const filtered = prev.rows
        .filter((r) => r.rowId !== rowId)
        .map((r, idx) => ({ ...r, stt: idx + 1 }));
      return { ...prev, rows: filtered };
    });
  };

  // Tách dòng con (Sub-row) cho 1 NCC trên 1 mặt hàng
  const handleSplitSubRow = (rowId: string, colId: string) => {
    updateActive((prev) => {
      const nextRows = prev.rows.map((row) => {
        if (row.rowId !== rowId) return row;
        const currentLines = row.supplierQuotes[colId] || [];
        const newLine: ApprovalSupplierQuoteLine = {
          lineId: `line_${rowId}_${colId}_${Date.now()}`,
          quotedProduct: row.itemName,
          origin: "",
          unitPrice: 0,
          qty: 1,
          amount: 0,
        };
        return {
          ...row,
          supplierQuotes: {
            ...row.supplierQuotes,
            [colId]: [...currentLines, newLine],
          },
        };
      });
      return {
        ...prev,
        showSupplierQty: true,
        columnMode: "extended",
        rows: nextRows,
      };
    });
  };

  // Xóa dòng tách con của NCC
  const handleRemoveSubRow = (rowId: string, colId: string, lineId: string) => {
    updateActive((prev) => {
      const nextRows = prev.rows.map((row) => {
        if (row.rowId !== rowId) return row;
        const currentLines = row.supplierQuotes[colId] || [];
        if (currentLines.length <= 1) return row;
        return {
          ...row,
          supplierQuotes: {
            ...row.supplierQuotes,
            [colId]: currentLines.filter((l) => l.lineId !== lineId),
          },
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  // Cập nhật trường cố định của dòng (Hàng hóa, Số lượng chung, ĐVT)
  const handleUpdateFixedRow = (
    rowIdx: number,
    field: "itemName" | "qty" | "unit",
    rawValue: string,
  ) => {
    updateActive((prev) => {
      const useSupQty = isSupplierQtyVisible(prev);
      const nextRows = prev.rows.map((row, idx) => {
        if (idx !== rowIdx) return row;
        if (field === "qty") {
          const newQty = cleanExcelNumber(rawValue);
          const updatedQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
          Object.keys(row.supplierQuotes).forEach((colId) => {
            const lines = row.supplierQuotes[colId] || [];
            updatedQuotes[colId] = lines.map((line, lIdx) => {
              const nextLineQty =
                lines.length === 1 && !useSupQty ? newQty : line.qty;
              const effQty = useSupQty ? line.qty : newQty;
              return {
                ...line,
                qty: lIdx === 0 && lines.length === 1 ? newQty : nextLineQty,
                amount: (Number(line.unitPrice) || 0) * effQty,
              };
            });
          });
          return { ...row, qty: newQty, supplierQuotes: updatedQuotes };
        }
        return { ...row, [field]: rawValue };
      });
      return { ...prev, rows: nextRows };
    });
  };

  // Cập nhật ô báo giá của NCC
  const handleUpdateSupplierLine = (
    rowIdx: number,
    colId: string,
    subIdx: number,
    field: "quotedProduct" | "unitPrice" | "qty",
    rawValue: string,
  ) => {
    updateActive((prev) => {
      const useSupQty = isSupplierQtyVisible(prev);
      const nextRows = prev.rows.map((row, idx) => {
        if (idx !== rowIdx) return row;
        const lines = [...(row.supplierQuotes[colId] || [])];
        while (lines.length <= subIdx) {
          lines.push({
            lineId: `line_${row.rowId}_${colId}_${lines.length + 1}`,
            quotedProduct: "",
            origin: "",
            unitPrice: 0,
            qty: row.qty,
            amount: 0,
          });
        }
        const target = { ...lines[subIdx] };
        if (field === "unitPrice") {
          target.unitPrice = cleanExcelNumber(rawValue);
        } else if (field === "qty") {
          target.qty = cleanExcelNumber(rawValue);
        } else if (field === "quotedProduct") {
          target.quotedProduct = rawValue;
          target.origin = rawValue;
        }
        const effQty = useSupQty
          ? Number(target.qty) || 0
          : Number(row.qty) || 0;
        target.amount = (Number(target.unitPrice) || 0) * effQty;
        lines[subIdx] = target;
        return {
          ...row,
          supplierQuotes: {
            ...row.supplierQuotes,
            [colId]: lines,
          },
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  /**
   * Xử lý sự kiện Paste trực tiếp từ Excel vào bất kỳ ô nào trên bảng
   */
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    startRowIdx: number,
    startFlatColIdx: number,
    subIdx: number = 0,
  ) => {
    if (!activeRequest || isReportMode) return;
    const clipboardText = e.clipboardData?.getData("text/plain") || "";
    if (!clipboardText) return;

    const matrix = parseExcelClipboard(clipboardText);
    if (matrix.length === 0) return;

    const targetColDesc = flatColumns[startFlatColIdx];
    const isNumericTarget =
      (targetColDesc?.type === "fixed" && targetColDesc.field === "qty") ||
      (targetColDesc?.type === "supplier" &&
        (targetColDesc.field === "unitPrice" ||
          targetColDesc.field === "qty" ||
          targetColDesc.field === "amount"));

    if (matrix.length === 1 && matrix[0].length === 1 && !isNumericTarget) {
      return;
    }

    e.preventDefault();
    applyMatrixToTable(matrix, startRowIdx, startFlatColIdx, subIdx);
  };

  const applyMatrixToTable = (
    matrix: string[][],
    startRowIdx: number,
    startFlatColIdx: number,
    subIdx: number = 0,
  ) => {
    if (!activeRequest) return;

    updateActive((prev) => {
      const useSupQty = isSupplierQtyVisible(prev);
      const nextRows = [
        ...prev.rows.map((r) => ({
          ...r,
          supplierQuotes: { ...r.supplierQuotes },
        })),
      ];

      const requiredRows = startRowIdx + matrix.length;
      while (nextRows.length < requiredRows) {
        const newStt = nextRows.length + 1;
        const newRowId = `row_paste_${Date.now()}_${newStt}`;
        const sq: Record<string, ApprovalSupplierQuoteLine[]> = {};
        prev.supplierColumns.forEach((sc) => {
          sq[sc.colId] = [
            {
              lineId: `line_${newRowId}_${sc.colId}_1`,
              quotedProduct: "",
              origin: "",
              unitPrice: 0,
              qty: 1,
              amount: 0,
            },
          ];
        });
        nextRows.push({
          rowId: newRowId,
          stt: newStt,
          itemName: "",
          qty: 1,
          unit: "Cái",
          supplierQuotes: sq,
        });
      }

      matrix.forEach((rowCells, rOffset) => {
        const targetRowIndex = startRowIdx + rOffset;
        const rowObj = { ...nextRows[targetRowIndex] };
        const rowQuotes = { ...rowObj.supplierQuotes };

        rowCells.forEach((cellVal, cOffset) => {
          const flatCol = flatColumns[startFlatColIdx + cOffset];
          if (!flatCol) return;

          if (flatCol.type === "fixed") {
            if (flatCol.field === "itemName") {
              rowObj.itemName = cellVal;
            } else if (flatCol.field === "unit") {
              rowObj.unit = cellVal;
            } else if (flatCol.field === "qty") {
              const parsedQty = cleanExcelNumber(cellVal);
              rowObj.qty = parsedQty;
              Object.keys(rowQuotes).forEach((cid) => {
                rowQuotes[cid] = (rowQuotes[cid] || []).map((line, lIdx) => {
                  const effQty = useSupQty ? line.qty : parsedQty;
                  return {
                    ...line,
                    qty: lIdx === 0 && !useSupQty ? parsedQty : line.qty,
                    amount: (Number(line.unitPrice) || 0) * effQty,
                  };
                });
              });
            }
          } else if (flatCol.type === "supplier") {
            const lines = [...(rowQuotes[flatCol.colId] || [])];
            const targetSubIdx = rOffset === 0 ? subIdx : 0;
            while (lines.length <= targetSubIdx) {
              lines.push({
                lineId: `line_${rowObj.rowId}_${flatCol.colId}_${lines.length + 1}`,
                quotedProduct: "",
                origin: "",
                unitPrice: 0,
                qty: rowObj.qty,
                amount: 0,
              });
            }
            const line = { ...lines[targetSubIdx] };
            if (flatCol.field === "quotedProduct") {
              line.quotedProduct = cellVal;
              line.origin = cellVal;
            } else if (flatCol.field === "unitPrice") {
              line.unitPrice = cleanExcelNumber(cellVal);
              const effQty = useSupQty
                ? Number(line.qty) || 0
                : Number(rowObj.qty) || 0;
              line.amount = line.unitPrice * effQty;
            } else if (flatCol.field === "qty") {
              line.qty = cleanExcelNumber(cellVal);
              line.amount = (Number(line.unitPrice) || 0) * line.qty;
            } else if (flatCol.field === "amount") {
              const pastedAmt = cleanExcelNumber(cellVal);
              if (line.unitPrice > 0) {
                const effQty = useSupQty
                  ? Number(line.qty) || 0
                  : Number(rowObj.qty) || 0;
                line.amount = line.unitPrice * effQty;
              } else {
                line.amount = pastedAmt;
              }
            }
            lines[targetSubIdx] = line;
            rowQuotes[flatCol.colId] = lines;
          }
        });

        rowObj.supplierQuotes = rowQuotes;
        nextRows[targetRowIndex] = rowObj;
      });

      return { ...prev, rows: nextRows };
    });

    showToast(
      `📋 Đã dán ${matrix.length} dòng × ${matrix[0]?.length || 1} cột từ Excel!`,
    );
  };

  // Tạo mới từ 3 nguồn -> Tự động mở vào giao diện làm việc chi tiết
  const handleCreateFromCompare = (pr: PR) => {
    const qForPr = quotesByPr[pr.id] || {};
    const sIds = quoteSupplierIdsByPr[pr.id] || [];
    const newReq = createApprovalFromCompare(
      pr,
      qForPr,
      sIds,
      suppliers,
      approvalRequests.length,
    );
    onSaveApproval(newReq);
    setActiveApprovalId(newReq.id);
    setSourceModalMode(null);
    showToast(`✓ Đã tạo phiếu Đề nghị phê duyệt từ So sánh giá PR ${pr.number}`);
  };

  const handleCreateFromPR = (pr: PR) => {
    const newReq = createApprovalFromPR(pr, suppliers, approvalRequests.length);
    onSaveApproval(newReq);
    setActiveApprovalId(newReq.id);
    setSourceModalMode(null);
    showToast(`✓ Đã tạo phiếu Đề nghị phê duyệt từ PR ${pr.number}`);
  };

  const handleCreateManual = () => {
    const newReq = createManualApproval(approvalRequests.length);
    onSaveApproval(newReq);
    setActiveApprovalId(newReq.id);
    showToast("✓ Đã tạo phiếu Đề nghị phê duyệt độc lập (Trắng)");
  };

  const getSupplierFlatColIndex = (
    colId: string,
    field: "quotedProduct" | "unitPrice" | "qty" | "amount",
  ) => {
    return flatColumns.findIndex(
      (c) => c.type === "supplier" && c.colId === colId && c.field === field,
    );
  };

  const subColCountPerSupplier =
    2 + (hasQuotedProduct ? 1 : 0) + (hasSupplierQty ? 1 : 0);

  const totalTableColumns =
    4 + (activeRequest?.supplierColumns.length || 0) * subColCountPerSupplier;

  const shouldRecommendLandscape =
    activeRequest &&
    (activeRequest.supplierColumns.length >= 3 || subColCountPerSupplier >= 3);

  /**
   * Tính toán tỉ lệ phần trăm độ rộng (<colgroup> & <th>) cho từng cột:
   * - Các cột co gọn được (STT, Số lượng, ĐVT, Đơn giá, Thành tiền) được ép gọn tối đa với tiêu đề 2 dòng.
   * - Đảm bảo tổng độ rộng 100% trang A4 cả trên màn hình làm việc lẫn khi in.
   */
  const colWidths = useMemo(() => {
    const numSups = Math.max(1, activeRequest?.supplierColumns.length || 1);
    const sttPct = 2.4;
    const itemPct = numSups >= 3 ? 13.0 : 16.0;
    const qtyPct = 2.8;
    const unitPct = 2.8;
    const remainingPct = 100 - (sttPct + itemPct + qtyPct + unitPct);
    const perSupPct = remainingPct / numSups;

    let specPct = 0;
    let pricePct = 0;
    let supQtyPct = 0;
    let amtPct = 0;

    if (hasQuotedProduct && hasSupplierQty) {
      specPct = perSupPct * 0.38;
      pricePct = perSupPct * 0.24;
      supQtyPct = perSupPct * 0.11;
      amtPct = perSupPct * 0.27;
    } else if (hasQuotedProduct && !hasSupplierQty) {
      specPct = perSupPct * 0.44;
      pricePct = perSupPct * 0.27;
      amtPct = perSupPct * 0.29;
    } else if (!hasQuotedProduct && hasSupplierQty) {
      pricePct = perSupPct * 0.42;
      supQtyPct = perSupPct * 0.14;
      amtPct = perSupPct * 0.44;
    } else {
      pricePct = perSupPct * 0.48;
      amtPct = perSupPct * 0.52;
    }

    return {
      stt: `${sttPct}%`,
      item: `${itemPct}%`,
      qty: `${qtyPct}%`,
      unit: `${unitPct}%`,
      perSup: `${perSupPct.toFixed(2)}%`,
      spec: `${specPct.toFixed(2)}%`,
      price: `${pricePct.toFixed(2)}%`,
      supQty: `${supQtyPct.toFixed(2)}%`,
      amt: `${amtPct.toFixed(2)}%`,
    };
  }, [activeRequest?.supplierColumns.length, hasQuotedProduct, hasSupplierQty]);

  const renderTableColGroup = () => {
    if (!activeRequest) return null;
    return (
      <colgroup>
        <col style={{ width: colWidths.stt }} />
        <col style={{ width: colWidths.item }} />
        <col style={{ width: colWidths.qty }} />
        <col style={{ width: colWidths.unit }} />
        {activeRequest.supplierColumns.map((sc) => (
          <React.Fragment key={`colg_${sc.colId}`}>
            {hasQuotedProduct && <col style={{ width: colWidths.spec }} />}
            <col style={{ width: colWidths.price }} />
            {hasSupplierQty && <col style={{ width: colWidths.supQty }} />}
            <col style={{ width: colWidths.amt }} />
          </React.Fragment>
        ))}
      </colgroup>
    );
  };

  // Tên NCC đề xuất (tự động fallback sang NCC được tích chọn nếu ô nhập đang trống)
  const effectiveRecommendedSupplier = useMemo(() => {
    if (!activeRequest) return "";
    if (activeRequest.recommendedSupplierName?.trim()) {
      return activeRequest.recommendedSupplierName;
    }
    const sel =
      activeRequest.supplierColumns.find((c) => c.isSelected) ||
      activeRequest.supplierColumns[0];
    return sel?.supplierName || sel?.shortName || "";
  }, [activeRequest]);

  // =========================================================================
  // CHẾ ĐỘ 1: GIAO DIỆN DANH SÁCH PHIẾU PHÊ DUYỆT (MẶC ĐỊNH KHI VÀO TAB)
  // =========================================================================
  if (!activeRequest) {
    const pendingCount = approvalRequests.filter(
      (r) => r.status === "Nháp" || r.status === "Chờ phê duyệt",
    ).length;
    const approvedCount = approvalRequests.filter(
      (r) => r.status === "Đã phê duyệt",
    ).length;
    const poCreatedCount = approvalRequests.filter(
      (r) => r.status === "Đã tạo PO",
    ).length;

    return (
      <section className="content pr-page approval-list-page">
        {pasteToast && <div className="approval-toast no-print">{pasteToast}</div>}

        <div className="heading">
          <div>
            <em>QUY TRÌNH MUA SẮM · PHENIKAA PHARMA</em>
            <h1>Đề nghị Phê duyệt Lựa chọn Nhà Cung Cấp</h1>
            <p>
              Quản lý tờ trình đánh giá báo giá, phê duyệt lựa chọn nhà cung cấp và
              phát hành đơn mua hàng (PO)
            </p>
          </div>
          {!isReportMode && (
            <div className="approval-source-actions">
              <button
                type="button"
                className="btn approval-source-btn source-compare"
                onClick={() => setSourceModalMode("compare")}
              >
                📊 ＋ Tạo từ So sánh giá PR
              </button>
              <button
                type="button"
                className="btn approval-source-btn source-pr"
                onClick={() => setSourceModalMode("pr")}
              >
                📋 ＋ Tạo từ PR
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleCreateManual}
              >
                ✨ ＋ Tạo phiếu mới (Excel)
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  onRestoreSamples();
                  showToast("✓ Đã nạp 2 biểu mẫu chuẩn Phenikaa Pharma!");
                }}
              >
                📂 Nạp mẫu chuẩn
              </button>
            </div>
          )}
        </div>

        {/* 4 Thẻ KPI giống giao diện PR & PO */}
        <div
          className="pr-stats"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          <article>
            <span>Tổng số phiếu phê duyệt</span>
            <strong>{approvalRequests.length}</strong>
            <small>Toàn bộ tờ trình lựa chọn NCC</small>
          </article>
          <article>
            <span>Đang lập / Chờ phê duyệt</span>
            <strong>{pendingCount}</strong>
            <small>Phiếu nháp hoặc đang trình ký</small>
          </article>
          <article>
            <span>Đã phê duyệt</span>
            <strong style={{ color: "#16a34a" }}>{approvedCount}</strong>
            <small>Sẵn sàng phát hành đơn PO</small>
          </article>
          <article>
            <span>Đã phát hành PO</span>
            <strong style={{ color: "#2563eb" }}>{poCreatedCount}</strong>
            <small>Đã chuyển sang Đơn mua hàng</small>
          </article>
        </div>

        {/* Bảng Danh sách các phiếu Đề nghị Phê duyệt */}
        <div className="pr-panel">
          <div className="pr-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
              <label style={{ minWidth: 280 }}>
                ⌕
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo số PR, tên nhà cung cấp, bộ phận, nội dung..."
                />
              </label>
              <select
                className="approval-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">
                  Tất cả trạng thái ({approvalRequests.length})
                </option>
                <option value="Nháp">Nháp</option>
                <option value="Chờ phê duyệt">Chờ phê duyệt</option>
                <option value="Đã phê duyệt">Đã phê duyệt</option>
                <option value="Đã tạo PO">Đã tạo PO</option>
              </select>
            </div>
            <span>Hiển thị {filteredRequests.length} phiếu đề nghị phê duyệt</span>
          </div>

          <div className="pr-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 135 }}>Số PR / Mã phiếu</th>
                  <th style={{ width: 105 }}>Ngày lập</th>
                  <th style={{ width: 155 }}>Bộ phận lập</th>
                  <th>Nội dung đề nghị phê duyệt</th>
                  <th style={{ width: 130, textAlign: "center" }}>Quy mô đánh giá</th>
                  <th style={{ width: 220 }}>NCC đề xuất lựa chọn</th>
                  <th style={{ width: 145, textAlign: "right" }}>
                    Tổng tiền đề xuất
                  </th>
                  <th style={{ width: 140 }}>Trạng thái</th>
                  <th style={{ width: 170, textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        textAlign: "center",
                        padding: "36px 16px",
                        color: "#64748b",
                      }}
                    >
                      Chưa có phiếu Đề nghị Phê duyệt nào khớp bộ lọc. Hãy bấm{" "}
                      <b>＋ Tạo phiếu mới</b> ở góc trên để bắt đầu.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => {
                    const selectedCol =
                      req.supplierColumns.find((c) => c.isSelected) ||
                      req.supplierColumns[0];
                    const selectedTotal = selectedCol
                      ? computeSupplierTotal(req, selectedCol.colId)
                      : 0;
                    const badgeClass =
                      req.status === "Đã tạo PO" || req.status === "Đã phê duyệt"
                        ? "done"
                        : req.status === "Chờ phê duyệt"
                          ? "progress"
                          : "waiting";

                    return (
                      <tr
                        key={req.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => setActiveApprovalId(req.id)}
                      >
                        <td>
                          <button
                            type="button"
                            className="pr-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveApprovalId(req.id);
                            }}
                          >
                            {req.prNumber || req.requestNumber}
                          </button>
                        </td>
                        <td>{req.createdDate}</td>
                        <td>{req.department}</td>
                        <td className="purpose-cell">{req.section1Title}</td>
                        <td className="center">
                          <span className="scale-pill">
                            {req.supplierColumns.length} NCC · {req.rows.length} mục
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#0f2b5b", fontSize: 13 }}>
                            {req.recommendedSupplierName ||
                              selectedCol?.supplierName ||
                              "Chưa chọn"}
                          </strong>
                        </td>
                        <td className="money">
                          {selectedTotal > 0 ? `${formatVND(selectedTotal)} ₫` : "-"}
                        </td>
                        <td>
                          <span className={`status ${badgeClass}`}>
                            {req.status}
                          </span>
                          {req.linkedPoNumber && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#1d4ed8",
                                fontWeight: 700,
                                marginTop: 2,
                              }}
                            >
                              🔗 {req.linkedPoNumber}
                            </div>
                          )}
                        </td>
                        <td
                          style={{ textAlign: "right" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              gap: 6,
                              alignItems: "center",
                            }}
                          >
                            <button
                              type="button"
                              className="row-action"
                              onClick={() => setActiveApprovalId(req.id)}
                            >
                              Mở phiếu
                            </button>
                            {!isReportMode &&
                              (req.status === "Đã phê duyệt" ||
                                req.status === "Đã tạo PO") && (
                                <button
                                  type="button"
                                  className="row-action"
                                  style={{
                                    background: "#fff7ed",
                                    color: "#c2410c",
                                    borderColor: "#fed7aa",
                                  }}
                                  onClick={() => onCreatePOFromApproval(req)}
                                  title="Phát hành đơn mua hàng (PO) từ phiếu đã duyệt này"
                                >
                                  🚀 Tạo PO
                                </button>
                              )}
                            {!isReportMode && (
                              <button
                                type="button"
                                className="delete-action"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Bạn có chắc muốn xóa phiếu Đề nghị phê duyệt "${req.prNumber || req.requestNumber}"?`,
                                    )
                                  ) {
                                    onDeleteApproval(req.id);
                                  }
                                }}
                              >
                                Xóa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Chọn PR khi tạo từ So sánh giá hoặc tạo từ PR */}
        {sourceModalMode && renderPRSourceModal()}
      </section>
    );
  }

  // =========================================================================
  // CHẾ ĐỘ 2: GIAO DIỆN LÀM VIỆC CHI TIẾT CỦA PHIẾU ĐỀ NGHỊ PHÊ DUYỆT
  // =========================================================================
  return (
    <section className="content approval-mgmt-wrapper">
      {pasteToast && <div className="approval-toast no-print">{pasteToast}</div>}

      {/* Thanh Điều hướng Quay lại Danh sách & Tác vụ chính */}
      <div className="approval-detail-topbar no-print">
        <div className="detail-topbar-left">
          <button
            type="button"
            className="btn btn-back-list"
            onClick={() => setActiveApprovalId(null)}
          >
            ← Quay lại danh sách Phiếu phê duyệt
          </button>
          {onBackToCompare && (
            <button
              type="button"
              className="btn"
              onClick={onBackToCompare}
              title="Quay lại Bảng so sánh giá"
            >
              ⚖ Bảng so sánh giá
            </button>
          )}
          <div className="detail-breadcrumb">
            <span className="crumb-code">
              Phiếu số: {activeRequest.prNumber || activeRequest.requestNumber}
            </span>
            <span
              className={`chip-status ${
                activeRequest.status === "Đã tạo PO"
                  ? "st-po"
                  : activeRequest.status === "Đã phê duyệt"
                    ? "st-approved"
                    : activeRequest.status === "Chờ phê duyệt"
                      ? "st-pending"
                      : "st-draft"
              }`}
            >
              {activeRequest.status}
            </span>
            {activeRequest.linkedPoNumber && (
              <span className="linked-po-badge">
                🔗 Đã tạo {activeRequest.linkedPoNumber}
              </span>
            )}
          </div>
        </div>

        <div className="config-actions-right">
          {!isReportMode && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setShowExcelPasteModal(true)}
                title="Dán nhanh bảng dữ liệu copy từ Excel"
              >
                📋 Dán từ Excel
              </button>

              <select
                className="approval-status-select"
                value={activeRequest.status}
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    status: e.target.value as ApprovalRequest["status"],
                  }))
                }
              >
                <option value="Nháp">Trạng thái: Nháp</option>
                <option value="Chờ phê duyệt">Trạng thái: Chờ phê duyệt</option>
                <option value="Đã phê duyệt">Trạng thái: Đã phê duyệt</option>
                <option value="Đã tạo PO">Trạng thái: Đã tạo PO</option>
              </select>

              {activeRequest.status !== "Đã phê duyệt" &&
                activeRequest.status !== "Đã tạo PO" && (
                  <button
                    type="button"
                    className="btn btn-approve-status"
                    onClick={() => {
                      updateActive((prev) => ({
                        ...prev,
                        status: "Đã phê duyệt",
                      }));
                      showToast(
                        "✓ Đã phê duyệt phiếu! Bây giờ bạn có thể bấm 'Tạo PO'.",
                      );
                    }}
                  >
                    ✓ Duyệt phiếu
                  </button>
                )}

              <button
                type="button"
                className="btn btn-create-po-from-approval"
                disabled={
                  activeRequest.status !== "Đã phê duyệt" &&
                  activeRequest.status !== "Đã tạo PO"
                }
                title={
                  activeRequest.status !== "Đã phê duyệt" &&
                  activeRequest.status !== "Đã tạo PO"
                    ? "Vui lòng bấm 'Duyệt phiếu' sang trạng thái Đã phê duyệt trước khi tạo PO"
                    : "Đẩy thông tin Nhà cung cấp được lựa chọn sang Đơn Mua Hàng (PO)"
                }
                onClick={() => onCreatePOFromApproval(activeRequest)}
              >
                🚀 Tạo PO (
                {activeRequest.supplierColumns.find((c) => c.isSelected)
                  ?.shortName || "NCC chọn"}
                )
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => {
                  onSaveApproval(activeRequest);
                  showToast("💾 Đã lưu phiếu Đề nghị phê duyệt!");
                }}
              >
                💾 Lưu
              </button>

              {confirmDeleteId === activeRequest.id ? (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: "#dc2626", color: "#fff" }}
                    onClick={() => {
                      onDeleteApproval(activeRequest.id);
                      setConfirmDeleteId(null);
                      setActiveApprovalId(null);
                      showToast("🗑️ Đã xóa phiếu Đề nghị phê duyệt");
                    }}
                  >
                    Xác nhận xóa
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Hủy
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn"
                  style={{ color: "#dc2626" }}
                  onClick={() => setConfirmDeleteId(activeRequest.id)}
                >
                  🗑️
                </button>
              )}
            </>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
          >
            🖨️ In biểu mẫu (
            {activeRequest.printOrientation === "landscape"
              ? "A4 Ngang"
              : "A4 Dọc"}
            )
          </button>
        </div>
      </div>

      {/* Thanh Cấu hình Cột con của Nhà Cung Cấp & Khổ giấy in */}
      <div className="approval-config-bar no-print">
        <div className="config-group">
          <span className="config-label">Tùy chọn cột của Nhà Cung Cấp:</span>

          <label
            className={`col-toggle-pill ${hasQuotedProduct ? "active" : ""}`}
            title="Thêm/Bật cột Mặt hàng NCC báo (hoặc Sản phẩm / Hãng sản xuất)"
          >
            <input
              type="checkbox"
              checked={hasQuotedProduct}
              onChange={(e) => toggleQuotedProductColumn(e.target.checked)}
            />
            <span>＋ Cột Mặt hàng NCC báo</span>
          </label>

          {hasQuotedProduct && (
            <input
              type="text"
              className="subcol-title-input"
              value={quotedProductTitle}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  quotedProductHeader: e.target.value,
                }))
              }
              title="Đổi tên tiêu đề cột (VD: Mặt hàng NCC báo, Sản phẩm, Hãng/ Xuất xứ)"
              placeholder="Tên cột (VD: Mặt hàng NCC báo)"
            />
          )}

          <label
            className={`col-toggle-pill ${hasSupplierQty ? "active" : ""}`}
            title="Thêm/Bật cột Số lượng mua của từng NCC (cho phép tách dòng số lượng)"
          >
            <input
              type="checkbox"
              checked={hasSupplierQty}
              onChange={(e) => toggleSupplierQtyColumn(e.target.checked)}
            />
            <span>＋ Cột Số lượng mua của NCC</span>
          </label>

          <label
            className={`col-toggle-pill ${
              activeRequest.showDeliveryTimeRow ? "active" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={activeRequest.showDeliveryTimeRow}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  showDeliveryTimeRow: e.target.checked,
                }))
              }
            />
            <span>＋ Dòng Thời gian giao hàng</span>
          </label>
        </div>

        {!isReportMode && (
          <div className="config-group">
            <select
              className="approval-filter-select"
              value={selectedAddSupplierId}
              onChange={(e) => setSelectedAddSupplierId(e.target.value)}
            >
              <option value="">
                -- Chọn NCC từ danh mục (hoặc thêm trống) --
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shortName ? `${s.shortName} - ${s.name}` : s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={handleAddSupplierColumn}
            >
              ＋ Thêm Nhà Cung Cấp ({activeRequest.supplierColumns.length})
            </button>
          </div>
        )}

        <div className="config-group">
          <span className="config-label">Khổ in:</span>
          <div className="segmented-pills">
            <button
              type="button"
              className={`seg-pill ${
                activeRequest.printOrientation === "portrait" ? "active" : ""
              }`}
              onClick={() =>
                updateActive((prev) => ({
                  ...prev,
                  printOrientation: "portrait",
                }))
              }
            >
              📄 A4 Dọc
            </button>
            <button
              type="button"
              className={`seg-pill ${
                activeRequest.printOrientation === "landscape" ? "active" : ""
              }`}
              onClick={() =>
                updateActive((prev) => ({
                  ...prev,
                  printOrientation: "landscape",
                }))
              }
            >
              🖼️ A4 Ngang
            </button>
          </div>
          {shouldRecommendLandscape &&
            activeRequest.printOrientation === "portrait" && (
              <button
                type="button"
                className="landscape-hint-btn"
                onClick={() =>
                  updateActive((prev) => ({
                    ...prev,
                    printOrientation: "landscape",
                  }))
                }
              >
                💡 Gợi ý chọn A4 Ngang khi in
              </button>
            )}
        </div>
      </div>

      {/* ===================================================================
          BIỂU MẪU LÀM VIỆC TRÊN MÀN HÌNH (WYSIWYG WORKSPACE)
         =================================================================== */}
      <div
        className={`approval-a4-sheet orient-${activeRequest.printOrientation}`}
      >
        {/* 1. KHUNG HEADER BIỂU MẪU CÔNG TY */}
        <table className="phenikaa-header-table">
          <tbody>
            <tr>
              <td className="phenikaa-logo-box">
                <img
                  src={PHENIKAA_PHARMA_LOGO_BASE64}
                  alt="PHENIKAA PHARMA"
                  className="phenikaa-logo-img"
                />
              </td>
              <td className="phenikaa-title-box">
                ĐỀ NGHỊ PHÊ DUYỆT LỰA CHỌN NCC
              </td>
            </tr>
          </tbody>
        </table>

        {/* 2. KHUNG THÔNG TIN BÊN TRÁI (KHÔNG KẺ BẢNG, HIỂN THỊ LIỀN MẠCH HẾT BỀ NGANG) */}
        <div className="phenikaa-meta-lines">
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Số PR:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.prNumber}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  prNumber: e.target.value,
                  requestNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Ngày:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.createdDate}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  createdDate: e.target.value,
                }))
              }
            />
          </div>
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Đơn vị lập biểu mẫu:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.department}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  department: e.target.value,
                }))
              }
            />
          </div>
          <div className="phenikaa-meta-line">
            <span className="meta-lbl">Ghi chú: Căn cứ theo PR số:</span>
            <input
              type="text"
              className="sheet-inline-input meta-inline-input"
              value={activeRequest.noteRef}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  noteRef: e.target.value,
                }))
              }
            />
          </div>
        </div>

        {/* 3. PHẦN I: NỘI DUNG ĐỀ NGHỊ PHÊ DUYỆT & BẢNG SO SÁNH ĐỘNG */}
        <div className="phenikaa-section-block">
          <div className="phenikaa-section-heading">
            I. Nội dung đề nghị phê duyệt:
          </div>
          <div className="phenikaa-section-subline">
            <input
              type="text"
              className="sheet-inline-input bold-input"
              value={activeRequest.section1Title}
              readOnly={isReportMode}
              onChange={(e) =>
                updateActive((prev) => ({
                  ...prev,
                  section1Title: e.target.value,
                }))
              }
            />
          </div>

          <div className="approval-grid-scroll-wrap">
            <table className="phenikaa-approval-grid">
              {renderTableColGroup()}
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="col-stt"
                    style={{ width: colWidths.stt }}
                  >
                    STT
                  </th>
                  <th
                    rowSpan={2}
                    className="col-item-name"
                    style={{ width: colWidths.item }}
                  >
                    Hàng hóa
                  </th>
                  <th
                    rowSpan={2}
                    className="col-qty"
                    style={{ width: colWidths.qty }}
                  >
                    Số
                    <br />
                    lượng
                  </th>
                  <th
                    rowSpan={2}
                    className="col-unit"
                    style={{ width: colWidths.unit }}
                  >
                    ĐVT
                  </th>
                  {activeRequest.supplierColumns.map((sc) => (
                    <th
                      key={sc.colId}
                      colSpan={subColCountPerSupplier}
                      style={{ width: colWidths.perSup }}
                      className={`col-supplier-group ${
                        sc.isSelected ? "selected-supplier-th" : ""
                      }`}
                    >
                      <div className="screen-supplier-header no-print">
                        <div className="sup-header-top">
                          <label
                            className="sup-select-radio"
                            title="Đánh dấu là Nhà cung cấp được lựa chọn"
                          >
                            <input
                              type="radio"
                              name={`selected_sup_${activeRequest.id}`}
                              checked={sc.isSelected}
                              disabled={isReportMode}
                              onChange={() => handleSelectSupplierCol(sc.colId)}
                            />
                            <span>
                              {sc.isSelected ? "NCC lựa chọn:" : "NCC tham gia:"}
                            </span>
                          </label>
                          {!isReportMode &&
                            activeRequest.supplierColumns.length > 1 && (
                              <button
                                type="button"
                                className="sup-remove-btn"
                                title="Xóa cột Nhà cung cấp này"
                                onClick={() =>
                                  handleRemoveSupplierColumn(sc.colId)
                                }
                              >
                                ×
                              </button>
                            )}
                        </div>
                        <input
                          type="text"
                          className="sup-short-input"
                          value={sc.shortName}
                          readOnly={isReportMode}
                          placeholder="Tên Nhà cung cấp"
                          onChange={(e) => {
                            const val = e.target.value;
                            updateActive((prev) => ({
                              ...prev,
                              supplierColumns: prev.supplierColumns.map((c) =>
                                c.colId === sc.colId
                                  ? {
                                      ...c,
                                      shortName: val,
                                      supplierName:
                                        !c.supplierName ||
                                        c.supplierName === c.shortName
                                          ? val
                                          : c.supplierName,
                                    }
                                  : c,
                              ),
                            }));
                          }}
                        />
                        {!isReportMode &&
                          (!hasQuotedProduct || !hasSupplierQty) && (
                            <div className="sup-quick-add-cols">
                              {!hasQuotedProduct && (
                                <button
                                  type="button"
                                  className="quick-subcol-btn"
                                  onClick={() => toggleQuotedProductColumn(true)}
                                  title="Thêm cột Mặt hàng NCC báo cho các NCC"
                                >
                                  + Mặt hàng NCC báo
                                </button>
                              )}
                              {!hasSupplierQty && (
                                <button
                                  type="button"
                                  className="quick-subcol-btn"
                                  onClick={() => toggleSupplierQtyColumn(true)}
                                  title="Thêm cột Số lượng mua của NCC"
                                >
                                  + SL mua của NCC
                                </button>
                              )}
                            </div>
                          )}
                      </div>
                    </th>
                  ))}
                </tr>

                <tr>
                  {activeRequest.supplierColumns.map((sc) => (
                    <React.Fragment key={`sub_${sc.colId}`}>
                      {hasQuotedProduct && (
                        <th
                          className="col-sub-spec"
                          style={{ width: colWidths.spec }}
                        >
                          <div className="subcol-th-wrap">
                            <span>{quotedProductTitle}</span>
                            {!isReportMode && (
                              <button
                                type="button"
                                className="hide-subcol-x no-print"
                                title="Ẩn cột Mặt hàng NCC báo"
                                onClick={() => toggleQuotedProductColumn(false)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </th>
                      )}
                      <th
                        className="col-sub-price"
                        style={{ width: colWidths.price }}
                      >
                        Đơn giá
                        <br />
                        (VNĐ)
                      </th>
                      {hasSupplierQty && (
                        <th
                          className="col-sub-qty"
                          style={{ width: colWidths.supQty }}
                        >
                          <div className="subcol-th-wrap">
                            <span>
                              Số
                              <br />
                              lượng
                            </span>
                            {!isReportMode && (
                              <button
                                type="button"
                                className="hide-subcol-x no-print"
                                title="Ẩn cột Số lượng mua của NCC"
                                onClick={() => toggleSupplierQtyColumn(false)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </th>
                      )}
                      <th
                        className="col-sub-amount"
                        style={{ width: colWidths.amt }}
                      >
                        Thành
                        <br />
                        tiền
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {activeRequest.rows.map((row, rowIdx) => {
                  const maxSubLines = hasSupplierQty
                    ? Math.max(
                        1,
                        ...activeRequest.supplierColumns.map(
                          (sc) => (row.supplierQuotes[sc.colId] || []).length,
                        ),
                      )
                    : 1;

                  return Array.from({ length: maxSubLines }, (_, subIdx) => (
                    <tr key={`${row.rowId}_sub_${subIdx}`}>
                      {subIdx === 0 && (
                        <>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-stt"
                          >
                            <span>{row.stt}</span>
                            {!isReportMode && activeRequest.rows.length > 1 && (
                              <button
                                type="button"
                                className="row-del-btn no-print"
                                title="Xóa dòng hàng hóa này"
                                onClick={() => handleRemoveRow(row.rowId)}
                              >
                                ×
                              </button>
                            )}
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-left cell-item-name"
                          >
                            <textarea
                              className="cell-textarea no-print"
                              rows={calcTextareaRows(row.itemName, 22)}
                              value={row.itemName}
                              readOnly={isReportMode}
                              placeholder="Nhập hoặc Paste tên hàng hóa..."
                              onChange={(e) =>
                                handleUpdateFixedRow(
                                  rowIdx,
                                  "itemName",
                                  e.target.value,
                                )
                              }
                              onPaste={(e) => handleCellPaste(e, rowIdx, 0, 0)}
                            />
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-qty"
                          >
                            <input
                              type="text"
                              className="cell-input center no-print"
                              value={row.qty || ""}
                              readOnly={isReportMode}
                              onChange={(e) =>
                                handleUpdateFixedRow(
                                  rowIdx,
                                  "qty",
                                  e.target.value,
                                )
                              }
                              onPaste={(e) => handleCellPaste(e, rowIdx, 1, 0)}
                            />
                          </td>
                          <td
                            rowSpan={maxSubLines}
                            className="cell-center cell-unit"
                          >
                            <input
                              type="text"
                              className="cell-input center no-print"
                              value={row.unit}
                              readOnly={isReportMode}
                              onChange={(e) =>
                                handleUpdateFixedRow(
                                  rowIdx,
                                  "unit",
                                  e.target.value,
                                )
                              }
                              onPaste={(e) => handleCellPaste(e, rowIdx, 2, 0)}
                            />
                          </td>
                        </>
                      )}

                      {activeRequest.supplierColumns.map((sc) => {
                        const lines = row.supplierQuotes[sc.colId] || [
                          {
                            lineId: `default_${row.rowId}_${sc.colId}`,
                            quotedProduct: "",
                            origin: "",
                            unitPrice: 0,
                            qty: row.qty,
                            amount: 0,
                          },
                        ];

                        if (lines.length === 1 && maxSubLines > 1) {
                          if (subIdx > 0) return null;
                          const line = lines[0];
                          const effQty = hasSupplierQty
                            ? Number(line.qty) || 0
                            : Number(row.qty) || 0;
                          const computedAmt =
                            (Number(line.unitPrice) || 0) * effQty;
                          const prodText =
                            line.quotedProduct || line.origin || "";

                          return (
                            <React.Fragment
                              key={`cell_${row.rowId}_${sc.colId}_span`}
                            >
                              {hasQuotedProduct && (
                                <td
                                  rowSpan={maxSubLines}
                                  className="cell-left cell-sub-spec"
                                >
                                  <textarea
                                    className="cell-textarea no-print"
                                    rows={calcTextareaRows(prodText, 20)}
                                    value={prodText}
                                    readOnly={isReportMode}
                                    placeholder={`${quotedProductTitle}...`}
                                    onChange={(e) =>
                                      handleUpdateSupplierLine(
                                        rowIdx,
                                        sc.colId,
                                        0,
                                        "quotedProduct",
                                        e.target.value,
                                      )
                                    }
                                    onPaste={(e) =>
                                      handleCellPaste(
                                        e,
                                        rowIdx,
                                        getSupplierFlatColIndex(
                                          sc.colId,
                                          "quotedProduct",
                                        ),
                                        0,
                                      )
                                    }
                                  />
                                  {!isReportMode && (
                                    <button
                                      type="button"
                                      className="split-line-btn no-print"
                                      onClick={() =>
                                        handleSplitSubRow(row.rowId, sc.colId)
                                      }
                                    >
                                      + Tách dòng
                                    </button>
                                  )}
                                </td>
                              )}
                              <td
                                rowSpan={maxSubLines}
                                className="cell-right cell-sub-price"
                              >
                                <input
                                  type="text"
                                  className="cell-input right no-print"
                                  value={
                                    line.unitPrice
                                      ? formatVND(line.unitPrice)
                                      : ""
                                  }
                                  readOnly={isReportMode}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rowIdx,
                                      sc.colId,
                                      0,
                                      "unitPrice",
                                      e.target.value,
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rowIdx,
                                      getSupplierFlatColIndex(
                                        sc.colId,
                                        "unitPrice",
                                      ),
                                      0,
                                    )
                                  }
                                />
                              </td>
                              {hasSupplierQty && (
                                <td
                                  rowSpan={maxSubLines}
                                  className="cell-center cell-sub-qty"
                                >
                                  <input
                                    type="text"
                                    className="cell-input center no-print"
                                    value={line.qty || ""}
                                    readOnly={isReportMode}
                                    onChange={(e) =>
                                      handleUpdateSupplierLine(
                                        rowIdx,
                                        sc.colId,
                                        0,
                                        "qty",
                                        e.target.value,
                                      )
                                    }
                                    onPaste={(e) =>
                                      handleCellPaste(
                                        e,
                                        rowIdx,
                                        getSupplierFlatColIndex(sc.colId, "qty"),
                                        0,
                                      )
                                    }
                                  />
                                </td>
                              )}
                              <td
                                rowSpan={maxSubLines}
                                className="cell-right cell-sub-amount"
                              >
                                {computedAmt ? formatVND(computedAmt) : "-"}
                              </td>
                            </React.Fragment>
                          );
                        }

                        const line = lines[subIdx];
                        if (!line) {
                          return (
                            <React.Fragment
                              key={`empty_${row.rowId}_${sc.colId}_${subIdx}`}
                            >
                              {hasQuotedProduct && <td />}
                              <td />
                              {hasSupplierQty && <td />}
                              <td />
                            </React.Fragment>
                          );
                        }

                        const effQty = hasSupplierQty
                          ? Number(line.qty) || 0
                          : Number(row.qty) || 0;
                        const computedAmt =
                          (Number(line.unitPrice) || 0) * effQty;
                        const prodText =
                          line.quotedProduct || line.origin || "";

                        return (
                          <React.Fragment
                            key={`cell_${row.rowId}_${sc.colId}_${subIdx}`}
                          >
                            {hasQuotedProduct && (
                              <td className="cell-left cell-sub-spec">
                                <textarea
                                  className="cell-textarea no-print"
                                  rows={calcTextareaRows(prodText, 20)}
                                  value={prodText}
                                  readOnly={isReportMode}
                                  placeholder={`${quotedProductTitle}...`}
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rowIdx,
                                      sc.colId,
                                      subIdx,
                                      "quotedProduct",
                                      e.target.value,
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rowIdx,
                                      getSupplierFlatColIndex(
                                        sc.colId,
                                        "quotedProduct",
                                      ),
                                      subIdx,
                                    )
                                  }
                                />
                                {!isReportMode && hasSupplierQty && (
                                  <div className="subrow-tools no-print">
                                    {subIdx === lines.length - 1 && (
                                      <button
                                        type="button"
                                        className="split-line-btn"
                                        onClick={() =>
                                          handleSplitSubRow(row.rowId, sc.colId)
                                        }
                                      >
                                        + Tách dòng
                                      </button>
                                    )}
                                    {lines.length > 1 && (
                                      <button
                                        type="button"
                                        className="remove-subline-btn"
                                        onClick={() =>
                                          handleRemoveSubRow(
                                            row.rowId,
                                            sc.colId,
                                            line.lineId,
                                          )
                                        }
                                      >
                                        × Xóa dòng tách
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}

                            <td className="cell-right cell-sub-price">
                              <input
                                type="text"
                                className="cell-input right no-print"
                                value={
                                  line.unitPrice
                                    ? formatVND(line.unitPrice)
                                    : ""
                                }
                                readOnly={isReportMode}
                                placeholder="0"
                                onChange={(e) =>
                                  handleUpdateSupplierLine(
                                    rowIdx,
                                    sc.colId,
                                    subIdx,
                                    "unitPrice",
                                    e.target.value,
                                  )
                                }
                                onPaste={(e) =>
                                  handleCellPaste(
                                    e,
                                    rowIdx,
                                    getSupplierFlatColIndex(
                                      sc.colId,
                                      "unitPrice",
                                    ),
                                    subIdx,
                                  )
                                }
                              />
                            </td>

                            {hasSupplierQty && (
                              <td className="cell-center cell-sub-qty">
                                <input
                                  type="text"
                                  className="cell-input center no-print"
                                  value={line.qty || ""}
                                  readOnly={isReportMode}
                                  onChange={(e) =>
                                    handleUpdateSupplierLine(
                                      rowIdx,
                                      sc.colId,
                                      subIdx,
                                      "qty",
                                      e.target.value,
                                    )
                                  }
                                  onPaste={(e) =>
                                    handleCellPaste(
                                      e,
                                      rowIdx,
                                      getSupplierFlatColIndex(sc.colId, "qty"),
                                      subIdx,
                                    )
                                  }
                                />
                                {!isReportMode && !hasQuotedProduct && (
                                  <div className="subrow-tools no-print">
                                    {subIdx === lines.length - 1 && (
                                      <button
                                        type="button"
                                        className="split-line-btn"
                                        onClick={() =>
                                          handleSplitSubRow(row.rowId, sc.colId)
                                        }
                                      >
                                        + Tách
                                      </button>
                                    )}
                                    {lines.length > 1 && (
                                      <button
                                        type="button"
                                        className="remove-subline-btn"
                                        onClick={() =>
                                          handleRemoveSubRow(
                                            row.rowId,
                                            sc.colId,
                                            line.lineId,
                                          )
                                        }
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}

                            <td className="cell-right cell-sub-amount">
                              {computedAmt ? formatVND(computedAmt) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ));
                })}

                {activeRequest.showDeliveryTimeRow && (
                  <tr className="delivery-time-row">
                    <td className="cell-center" />
                    <td colSpan={3} className="cell-center bold-cell">
                      Thời gian giao hàng
                    </td>
                    {activeRequest.supplierColumns.map((sc) => (
                      <td
                        key={`deliv_${sc.colId}`}
                        colSpan={subColCountPerSupplier}
                        className="cell-center bold-cell"
                      >
                        <input
                          type="text"
                          className="cell-input center bold-input no-print"
                          placeholder="VD: Hàng có sẵn / 5 ngày..."
                          value={sc.deliveryTime || ""}
                          readOnly={isReportMode}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateActive((prev) => ({
                              ...prev,
                              supplierColumns: prev.supplierColumns.map((c) =>
                                c.colId === sc.colId
                                  ? { ...c, deliveryTime: val }
                                  : c,
                              ),
                            }));
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                )}

                <tr className="total-footer-row">
                  <td colSpan={4} className="cell-center bold-cell">
                    Tổng tiền chưa có VAT
                  </td>
                  {activeRequest.supplierColumns.map((sc) => {
                    const totalVal = supplierTotals[sc.colId] || 0;
                    return (
                      <React.Fragment key={`total_${sc.colId}`}>
                        <td
                          colSpan={subColCountPerSupplier - 1}
                          className="cell-empty-total"
                        />
                        <td className="cell-right bold-cell total-amount-cell">
                          {totalVal ? formatVND(totalVal) : "-"}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {!isReportMode && (
            <div className="table-bottom-actions no-print">
              <button type="button" className="btn" onClick={handleAddRow}>
                ＋ Thêm dòng hàng hóa
              </button>
              <span className="paste-hint-inline">
                💡 Bạn có thể copy nhiều dòng/cột từ Excel và bấm{" "}
                <code>Ctrl + V</code> trực tiếp vào bất kỳ ô nào trong bảng
              </span>
            </div>
          )}
        </div>

        {/* 4. PHẦN II: ĐÁNH GIÁ VÀ ĐỀ XUẤT LỰA CHỌN NHÀ CUNG CẤP */}
        <div className="phenikaa-section-block">
          <div className="phenikaa-section-heading">
            II. Đánh giá và đề xuất lựa chọn nhà cung cấp:
          </div>

          <div className="eval-row">
            <span className="eval-label">1. Nhà cung cấp đề xuất:</span>
            <div className="eval-field-wrap">
              <input
                type="text"
                list="approval-suppliers-datalist"
                className="sheet-inline-input bold-input no-print"
                value={effectiveRecommendedSupplier}
                readOnly={isReportMode}
                placeholder="Nhập hoặc chọn tên đầy đủ của Nhà cung cấp được đề xuất..."
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    recommendedSupplierName: e.target.value,
                  }))
                }
              />
              <datalist id="approval-suppliers-datalist">
                {activeRequest.supplierColumns.map((sc) => (
                  <option key={sc.colId} value={sc.supplierName} />
                ))}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="eval-row">
            <span className="eval-label">2. Điều kiện giao hàng:</span>
            <div className="eval-field-wrap">
              <input
                type="text"
                className="sheet-inline-input no-print"
                value={activeRequest.deliveryTerms}
                readOnly={isReportMode}
                placeholder="Để trống hoặc nhập điều kiện giao hàng..."
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    deliveryTerms: e.target.value,
                  }))
                }
              />
              {!isReportMode && (
                <div className="preset-pills no-print">
                  {DELIVERY_TERM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        updateActive((prev) => ({
                          ...prev,
                          deliveryTerms: preset,
                        }))
                      }
                    >
                      + {preset}
                    </button>
                  ))}
                  {activeRequest.deliveryTerms && (
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        updateActive((prev) => ({
                          ...prev,
                          deliveryTerms: "",
                        }))
                      }
                    >
                      Xóa trống
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="eval-row">
            <span className="eval-label">3. Điều khoản thanh toán:</span>
            <div className="eval-field-wrap">
              <input
                type="text"
                className="sheet-inline-input no-print"
                value={activeRequest.paymentTerms}
                readOnly={isReportMode}
                placeholder="VD: Thanh toán 100% trước khi giao hàng."
                onChange={(e) =>
                  updateActive((prev) => ({
                    ...prev,
                    paymentTerms: e.target.value,
                  }))
                }
              />
              {!isReportMode && (
                <div className="preset-pills no-print">
                  {PAYMENT_TERM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        updateActive((prev) => ({
                          ...prev,
                          paymentTerms: preset,
                        }))
                      }
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. PHẦN III: LÝ DO LỰA CHỌN */}
        <div className="phenikaa-section-block">
          <div className="phenikaa-section-heading">III. Lý do lựa chọn:</div>

          <div className="reasons-list">
            {activeRequest.reasons.map((reason, idx) => (
              <div key={idx} className="reason-item-row">
                <span className="reason-index">{idx + 1}.</span>
                <input
                  type="text"
                  className="sheet-inline-input no-print"
                  value={reason}
                  readOnly={isReportMode}
                  placeholder="Nhập lý do đánh giá / lựa chọn..."
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActive((prev) => ({
                      ...prev,
                      reasons: prev.reasons.map((r, i) =>
                        i === idx ? val : r,
                      ),
                    }));
                  }}
                />
                {!isReportMode && activeRequest.reasons.length > 1 && (
                  <button
                    type="button"
                    className="reason-del-btn no-print"
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        reasons: prev.reasons.filter((_, i) => i !== idx),
                      }))
                    }
                    title="Xóa dòng lý do này"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {!isReportMode && (
            <div className="reasons-toolbar no-print">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  updateActive((prev) => ({
                    ...prev,
                    reasons: [...prev.reasons, ""],
                  }))
                }
              >
                ＋ Thêm dòng lý do
              </button>
              <div className="preset-pills">
                {REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="preset-chip"
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        reasons: [...prev.reasons, preset],
                      }))
                    }
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 6. KHU VỰC CHỮ KÝ 3 CỘT */}
        <table className="phenikaa-sign-table">
          <tbody>
            <tr>
              <td className="sign-col">
                <div className="sign-title">Lãnh đạo phê duyệt</div>
                <div className="sign-space" />
                <div className="sign-name">
                  <input
                    type="text"
                    className="sheet-inline-input center bold-input no-print"
                    value={activeRequest.approverLeader}
                    readOnly={isReportMode}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        approverLeader: e.target.value,
                      }))
                    }
                  />
                </div>
              </td>
              <td className="sign-col">
                <div className="sign-title">Trưởng bộ phận</div>
                <div className="sign-space" />
                <div className="sign-name">
                  <input
                    type="text"
                    className="sheet-inline-input center bold-input no-print"
                    value={activeRequest.approverDeptHead}
                    readOnly={isReportMode}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        approverDeptHead: e.target.value,
                      }))
                    }
                  />
                </div>
              </td>
              <td className="sign-col">
                <div className="sign-title">Người đề nghị</div>
                <div className="sign-space" />
                <div className="sign-name">
                  <input
                    type="text"
                    className="sheet-inline-input center bold-input no-print"
                    value={activeRequest.requesterName}
                    readOnly={isReportMode}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        requesterName: e.target.value,
                      }))
                    }
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ===================================================================
          PORTAL BẢN IN CÔ LẬP TRỰC TIẾP RA DOCUMENT.BODY (#approvalPrintPortal)
         =================================================================== */}
      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="approvalPrintPortal">
            <style>{`
              @page {
                size: A4 ${activeRequest.printOrientation || "landscape"};
                margin: 7mm 8mm;
              }
              @media screen {
                #approvalPrintPortal {
                  display: none !important;
                }
              }
              @media print {
                html, body {
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #ffffff !important;
                }
                .app, #paymentPrintPortal {
                  display: none !important;
                }
                #approvalPrintPortal {
                  display: block !important;
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  font-family: "Times New Roman", Times, serif !important;
                  font-size: 11.5pt !important;
                  line-height: 1.35 !important;
                }
                /* Ghi đè triệt để rule global table { min-width: max-content } và th, td { white-space: nowrap } từ globals.css */
                #approvalPrintPortal table,
                #approvalPrintPortal .phenikaa-print-grid,
                #approvalPrintPortal .phenikaa-header-table,
                #approvalPrintPortal .phenikaa-sign-table {
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: 100% !important;
                  table-layout: fixed !important;
                  border-collapse: collapse !important;
                }
                #approvalPrintPortal .phenikaa-meta-lines {
                  width: 100% !important;
                  margin-bottom: 12px !important;
                }
                #approvalPrintPortal .phenikaa-meta-line {
                  width: 100% !important;
                  text-align: left !important;
                  padding: 2px 0 !important;
                  font-size: 12pt !important;
                  line-height: 1.4 !important;
                }
                #approvalPrintPortal .sign-space {
                  height: 125px !important;
                }
                #approvalPrintPortal th,
                #approvalPrintPortal td {
                  min-width: 0 !important;
                  height: auto !important;
                  position: static !important;
                  white-space: pre-wrap !important;
                  word-break: break-word !important;
                  overflow-wrap: break-word !important;
                  box-sizing: border-box !important;
                  vertical-align: middle !important;
                  color: #000000 !important;
                  background: transparent !important;
                }
                #approvalPrintPortal .phenikaa-print-grid th,
                #approvalPrintPortal .phenikaa-print-grid td {
                  border: 1px solid #000000 !important;
                  padding: 3px 4px !important;
                  line-height: 1.28 !important;
                }
                #approvalPrintPortal .phenikaa-sign-table td {
                  border: none !important;
                  vertical-align: top !important;
                }
              }
            `}</style>

            <div className="approval-pure-print-page">
              {/* 1. Header Công ty + Tiêu đề Biểu mẫu */}
              <table className="phenikaa-header-table">
                <tbody>
                  <tr>
                    <td className="phenikaa-logo-box">
                      <img
                        src={PHENIKAA_PHARMA_LOGO_BASE64}
                        alt="PHENIKAA PHARMA"
                        className="phenikaa-logo-img"
                      />
                    </td>
                    <td className="phenikaa-title-box">
                      ĐỀ NGHỊ PHÊ DUYỆT LỰA CHỌN NCC
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 2. Khung Thông tin bên trái (không kẻ bảng, hiển thị liền mạch hết bề ngang) */}
              <div className="phenikaa-meta-lines">
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Số PR:</span>{" "}
                  <span>{activeRequest.prNumber}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Ngày:</span>{" "}
                  <span>{activeRequest.createdDate}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Đơn vị lập biểu mẫu:</span>{" "}
                  <span>{activeRequest.department}</span>
                </div>
                <div className="phenikaa-meta-line">
                  <span className="meta-lbl">Ghi chú: Căn cứ theo PR số:</span>{" "}
                  <span>{activeRequest.noteRef}</span>
                </div>
              </div>

              {/* 3. Phần I & Bảng So sánh */}
              <div className="phenikaa-section-block">
                <div className="phenikaa-section-heading">
                  I. Nội dung đề nghị phê duyệt:
                </div>
                <div
                  className="phenikaa-section-subline"
                  style={{ fontWeight: 700 }}
                >
                  {activeRequest.section1Title}
                </div>

                <table className="phenikaa-print-grid">
                  {renderTableColGroup()}
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ width: colWidths.stt }}>
                        STT
                      </th>
                      <th rowSpan={2} style={{ width: colWidths.item }}>
                        Hàng hóa
                      </th>
                      <th rowSpan={2} style={{ width: colWidths.qty }}>
                        Số
                        <br />
                        lượng
                      </th>
                      <th rowSpan={2} style={{ width: colWidths.unit }}>
                        ĐVT
                      </th>
                      {activeRequest.supplierColumns.map((sc) => (
                        <th
                          key={`p_head_${sc.colId}`}
                          colSpan={subColCountPerSupplier}
                          style={{ width: colWidths.perSup }}
                        >
                          {sc.isSelected
                            ? `NCC lựa chọn: ${sc.shortName || sc.supplierName}`
                            : sc.shortName || sc.supplierName}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {activeRequest.supplierColumns.map((sc) => (
                        <React.Fragment key={`p_sub_${sc.colId}`}>
                          {hasQuotedProduct && (
                            <th style={{ width: colWidths.spec }}>
                              {quotedProductTitle}
                            </th>
                          )}
                          <th style={{ width: colWidths.price }}>
                            Đơn giá
                            <br />
                            (VNĐ)
                          </th>
                          {hasSupplierQty && (
                            <th style={{ width: colWidths.supQty }}>
                              Số
                              <br />
                              lượng
                            </th>
                          )}
                          <th style={{ width: colWidths.amt }}>
                            Thành
                            <br />
                            tiền
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRequest.rows.map((row) => {
                      const maxSubLines = hasSupplierQty
                        ? Math.max(
                            1,
                            ...activeRequest.supplierColumns.map(
                              (sc) => (row.supplierQuotes[sc.colId] || []).length,
                            ),
                          )
                        : 1;

                      return Array.from({ length: maxSubLines }, (_, subIdx) => (
                        <tr key={`p_${row.rowId}_${subIdx}`}>
                          {subIdx === 0 && (
                            <>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center"
                              >
                                {row.stt}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-left"
                              >
                                {row.itemName}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center"
                              >
                                {row.qty}
                              </td>
                              <td
                                rowSpan={maxSubLines}
                                className="cell-center"
                              >
                                {row.unit}
                              </td>
                            </>
                          )}

                          {activeRequest.supplierColumns.map((sc) => {
                            const lines = row.supplierQuotes[sc.colId] || [
                              {
                                lineId: `d_${row.rowId}_${sc.colId}`,
                                quotedProduct: "",
                                origin: "",
                                unitPrice: 0,
                                qty: row.qty,
                                amount: 0,
                              },
                            ];

                            if (lines.length === 1 && maxSubLines > 1) {
                              if (subIdx > 0) return null;
                              const line = lines[0];
                              const effQty = hasSupplierQty
                                ? Number(line.qty) || 0
                                : Number(row.qty) || 0;
                              const amt =
                                (Number(line.unitPrice) || 0) * effQty;
                              const prodText =
                                line.quotedProduct || line.origin || "";

                              return (
                                <React.Fragment
                                  key={`p_span_${row.rowId}_${sc.colId}`}
                                >
                                  {hasQuotedProduct && (
                                    <td
                                      rowSpan={maxSubLines}
                                      className="cell-left"
                                    >
                                      {prodText}
                                    </td>
                                  )}
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-right"
                                  >
                                    {line.unitPrice
                                      ? formatVND(line.unitPrice)
                                      : "-"}
                                  </td>
                                  {hasSupplierQty && (
                                    <td
                                      rowSpan={maxSubLines}
                                      className="cell-center"
                                    >
                                      {line.qty}
                                    </td>
                                  )}
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-right"
                                  >
                                    {amt ? formatVND(amt) : "-"}
                                  </td>
                                </React.Fragment>
                              );
                            }

                            const line = lines[subIdx];
                            if (!line) {
                              return (
                                <React.Fragment
                                  key={`p_empty_${row.rowId}_${sc.colId}_${subIdx}`}
                                >
                                  {hasQuotedProduct && <td />}
                                  <td />
                                  {hasSupplierQty && <td />}
                                  <td />
                                </React.Fragment>
                              );
                            }

                            const effQty = hasSupplierQty
                              ? Number(line.qty) || 0
                              : Number(row.qty) || 0;
                            const amt = (Number(line.unitPrice) || 0) * effQty;
                            const prodText =
                              line.quotedProduct || line.origin || "";

                            return (
                              <React.Fragment
                                key={`p_cell_${row.rowId}_${sc.colId}_${subIdx}`}
                              >
                                {hasQuotedProduct && (
                                  <td className="cell-left">{prodText}</td>
                                )}
                                <td className="cell-right">
                                  {line.unitPrice
                                    ? formatVND(line.unitPrice)
                                    : "-"}
                                </td>
                                {hasSupplierQty && (
                                  <td className="cell-center">{line.qty}</td>
                                )}
                                <td className="cell-right">
                                  {amt ? formatVND(amt) : "-"}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ));
                    })}

                    {activeRequest.showDeliveryTimeRow && (
                      <tr>
                        <td />
                        <td colSpan={3} className="cell-center bold-cell">
                          Thời gian giao hàng
                        </td>
                        {activeRequest.supplierColumns.map((sc) => (
                          <td
                            key={`p_deliv_${sc.colId}`}
                            colSpan={subColCountPerSupplier}
                            className="cell-center bold-cell"
                          >
                            {sc.deliveryTime || ""}
                          </td>
                        ))}
                      </tr>
                    )}

                    <tr className="total-footer-row">
                      <td colSpan={4} className="cell-center bold-cell">
                        Tổng tiền chưa có VAT
                      </td>
                      {activeRequest.supplierColumns.map((sc) => {
                        const totalVal = supplierTotals[sc.colId] || 0;
                        return (
                          <React.Fragment key={`p_tot_${sc.colId}`}>
                            <td colSpan={subColCountPerSupplier - 1} />
                            <td className="cell-right bold-cell">
                              {totalVal ? formatVND(totalVal) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4. Phần II */}
              <div className="phenikaa-section-block">
                <div className="phenikaa-section-heading">
                  II. Đánh giá và đề xuất lựa chọn nhà cung cấp:
                </div>
                <div className="eval-row">
                  <span className="eval-label">1. Nhà cung cấp đề xuất:</span>
                  <strong style={{ flex: 1 }}>
                    {effectiveRecommendedSupplier}
                  </strong>
                </div>
                <div className="eval-row">
                  <span className="eval-label">2. Điều kiện giao hàng:</span>
                  <span style={{ flex: 1 }}>{activeRequest.deliveryTerms}</span>
                </div>
                <div className="eval-row">
                  <span className="eval-label">3. Điều khoản thanh toán:</span>
                  <span style={{ flex: 1 }}>{activeRequest.paymentTerms}</span>
                </div>
              </div>

              {/* 5. Phần III */}
              <div className="phenikaa-section-block">
                <div className="phenikaa-section-heading">
                  III. Lý do lựa chọn:
                </div>
                {activeRequest.reasons.map((reason, idx) => (
                  <div key={`p_reason_${idx}`} style={{ marginBottom: 3 }}>
                    {idx + 1}. {reason}
                  </div>
                ))}
              </div>

              {/* 6. Chữ ký 3 cột */}
              <table className="phenikaa-sign-table">
                <tbody>
                  <tr>
                    <td className="sign-col">
                      <div className="sign-title">Lãnh đạo phê duyệt</div>
                      <div className="sign-space" />
                      <div className="sign-name">
                        {activeRequest.approverLeader}
                      </div>
                    </td>
                    <td className="sign-col">
                      <div className="sign-title">Trưởng bộ phận</div>
                      <div className="sign-space" />
                      <div className="sign-name">
                        {activeRequest.approverDeptHead}
                      </div>
                    </td>
                    <td className="sign-col">
                      <div className="sign-title">Người đề nghị</div>
                      <div className="sign-space" />
                      <div className="sign-name">
                        {activeRequest.requesterName}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>,
          document.body,
        )}

      {/* MODAL DÁN NHANH VÙNG DỮ LIỆU TỪ EXCEL */}
      {showExcelPasteModal && (
        <div
          className="backdrop no-print"
        >
          <div
            className="modal-panel"
            style={{ width: "min(960px, 95vw)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  📋 Dán nhanh vùng dữ liệu từ Excel
                </h3>
                <p className="modal-desc">
                  Copy các dòng/cột từ Excel (bắt đầu từ cột{" "}
                  <strong>Hàng hóa | Số lượng | ĐVT | ...</strong>) và dán vào ô
                  bên dưới, hoặc bấm <code>Ctrl + V</code> trực tiếp vào bất kỳ ô
                  nào trên bảng.
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowExcelPasteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <textarea
                className="excel-modal-textarea"
                rows={10}
                placeholder={
                  "Ví dụ copy từ Excel:\nKép thu vi sinh inox 316L\t6\tCái\t1.930.000\t11.580.000\nMặt bích inox 304 DN40\t2\tCái\t160.000\t320.000"
                }
                value={rawExcelModalText}
                onChange={(e) => setRawExcelModalText(e.target.value)}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowExcelPasteModal(false)}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const matrix = parseExcelClipboard(rawExcelModalText);
                    if (matrix.length > 0) {
                      applyMatrixToTable(matrix, 0, 0, 0);
                      setRawExcelModalText("");
                      setShowExcelPasteModal(false);
                    }
                  }}
                >
                  ✓ Áp dụng vào Bảng Phê duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  function renderPRSourceModal() {
    return (
      <div
        className="backdrop no-print"
      >
        <div
          className="modal-panel"
          style={{ width: "min(880px, 95vw)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h3 className="modal-title">
                {sourceModalMode === "compare"
                  ? "📊 Tạo Đề nghị Phê duyệt từ Bảng So sánh giá PR"
                  : "📋 Tạo Đề nghị Phê duyệt trực tiếp từ PR (Bỏ qua so sánh giá)"}
              </h3>
              <p className="modal-desc">
                {sourceModalMode === "compare"
                  ? "Kế thừa toàn bộ danh mục hàng hóa, các Nhà cung cấp tham gia báo giá, đơn giá đã so sánh và tự động đánh dấu NCC có giá tốt nhất."
                  : "Lấy danh mục hàng hóa, số lượng và ĐVT từ PR sang để bạn tự nhập hoặc Paste đơn giá khảo sát."}
              </p>
            </div>
            <button
              type="button"
              className="btn-close"
              onClick={() => setSourceModalMode(null)}
            >
              ×
            </button>
          </div>
          <div
            className="modal-body"
            style={{ maxHeight: 420, overflowY: "auto" }}
          >
            {prs.length === 0 ? (
              <p>Chưa có phiếu PR nào trong hệ thống.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {prs.map((pr) => {
                  const qCount = Object.keys(quotesByPr[pr.id] || {}).length;
                  const supCount = (quoteSupplierIdsByPr[pr.id] || []).length;
                  return (
                    <div
                      key={pr.id}
                      className="pr-source-pick-card"
                      onClick={() =>
                        sourceModalMode === "compare"
                          ? handleCreateFromCompare(pr)
                          : handleCreateFromPR(pr)
                      }
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f2b5b" }}>
                          PR số: {pr.number} — {pr.department}
                        </div>
                        <div style={{ fontSize: 13, color: "#475569" }}>
                          {pr.purpose} · Ngày: {pr.date} · {pr.items.length} mặt
                          hàng
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {sourceModalMode === "compare" && (
                          <div
                            style={{
                              fontSize: 12,
                              color: qCount > 0 ? "#16a34a" : "#64748b",
                              fontWeight: 600,
                            }}
                          >
                            {qCount > 0
                              ? `Đã có báo giá (${supCount} NCC)`
                              : "Chưa nhập giá so sánh"}
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                        >
                          Chọn PR này →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
