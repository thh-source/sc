"use client";

import React, { useMemo, useState } from "react";
import {
  ApprovalColumnMode,
  ApprovalItemRow,
  ApprovalRequest,
  ApprovalSupplierColumn,
  ApprovalSupplierQuoteLine,
  PR,
  Quote,
  Supplier,
} from "../types";
import { fmt as formatVND } from "../utils/format";
import {
  cleanExcelNumber,
  createApprovalFromCompare,
  createApprovalFromPR,
  createManualApproval,
  parseExcelClipboard,
  SAMPLE_PHENIKAA_APPROVALS,
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
      field: "quotedProduct" | "origin" | "unitPrice" | "qty" | "amount";
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
        req.recommendedSupplierName.toLowerCase().includes(q) ||
        req.section1Title.toLowerCase().includes(q)
      );
    });
  }, [approvalRequests, searchQuery, statusFilter]);

  const activeRequest = useMemo(() => {
    if (approvalRequests.length === 0) return null;
    if (activeApprovalId !== null) {
      const found = approvalRequests.find((r) => r.id === activeApprovalId);
      if (found) return found;
    }
    return approvalRequests[0];
  }, [approvalRequests, activeApprovalId]);

  const updateActive = (updater: (prev: ApprovalRequest) => ApprovalRequest) => {
    if (!activeRequest || isReportMode) return;
    const next = updater(activeRequest);
    onSaveApproval(next);
  };

  // Danh sách cột phẳng phục vụ Paste Excel đa dòng/cột theo đúng chế độ hiển thị hiện tại
  const flatColumns = useMemo<FlatColDescriptor[]>(() => {
    if (!activeRequest) return [];
    const cols: FlatColDescriptor[] = [
      { type: "fixed", field: "itemName" },
      { type: "fixed", field: "qty" },
      { type: "fixed", field: "unit" },
    ];
    activeRequest.supplierColumns.forEach((sc) => {
      if (activeRequest.columnMode === "basic") {
        cols.push({ type: "supplier", colId: sc.colId, field: "unitPrice" });
        cols.push({ type: "supplier", colId: sc.colId, field: "amount" });
      } else if (activeRequest.columnMode === "origin") {
        cols.push({ type: "supplier", colId: sc.colId, field: "origin" });
        cols.push({ type: "supplier", colId: sc.colId, field: "unitPrice" });
        cols.push({ type: "supplier", colId: sc.colId, field: "amount" });
      } else {
        cols.push({ type: "supplier", colId: sc.colId, field: "quotedProduct" });
        cols.push({ type: "supplier", colId: sc.colId, field: "unitPrice" });
        cols.push({ type: "supplier", colId: sc.colId, field: "qty" });
        cols.push({ type: "supplier", colId: sc.colId, field: "amount" });
      }
    });
    return cols;
  }, [activeRequest]);

  // Tính tổng tiền chưa có VAT cho từng cột NCC
  const supplierTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!activeRequest) return totals;
    activeRequest.supplierColumns.forEach((sc) => {
      let sum = 0;
      activeRequest.rows.forEach((row) => {
        const lines = row.supplierQuotes[sc.colId] || [];
        lines.forEach((line) => {
          const effQty =
            activeRequest.columnMode === "extended"
              ? Number(line.qty) || 0
              : Number(row.qty) || 0;
          const unitPrice = Number(line.unitPrice) || 0;
          const amt = unitPrice > 0 ? unitPrice * effQty : Number(line.amount) || 0;
          sum += amt;
        });
      });
      totals[sc.colId] = sum;
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
          targetCol?.supplierName || prev.recommendedSupplierName,
      };
    });
  };

  // Thêm cột NCC mới
  const handleAddSupplierColumn = () => {
    if (!activeRequest) return;
    const supIdNum = selectedAddSupplierId ? Number(selectedAddSupplierId) : undefined;
    const matchedSup =
      supIdNum !== undefined ? suppliers.find((s) => s.id === supIdNum) : undefined;

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
        printOrientation: nextCols.length >= 3 ? "landscape" : prev.printOrientation,
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

  // Tách dòng con (Sub-row) cho 1 NCC trên 1 mặt hàng (Chế độ mở rộng)
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
      return { ...prev, rows: nextRows };
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
      const nextRows = prev.rows.map((row, idx) => {
        if (idx !== rowIdx) return row;
        if (field === "qty") {
          const newQty = cleanExcelNumber(rawValue);
          const updatedQuotes: Record<string, ApprovalSupplierQuoteLine[]> = {};
          Object.keys(row.supplierQuotes).forEach((colId) => {
            const lines = row.supplierQuotes[colId] || [];
            updatedQuotes[colId] = lines.map((line, lIdx) => {
              // Nếu chỉ có 1 dòng báo giá, đồng bộ số lượng và tính lại thành tiền
              const nextLineQty =
                lines.length === 1 && prev.columnMode !== "extended"
                  ? newQty
                  : line.qty;
              const effQty =
                prev.columnMode === "extended" ? line.qty : newQty;
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
    field: "quotedProduct" | "origin" | "unitPrice" | "qty",
    rawValue: string,
  ) => {
    updateActive((prev) => {
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
        } else if (field === "origin") {
          target.origin = rawValue;
        }
        const effQty =
          prev.columnMode === "extended" ? Number(target.qty) || 0 : Number(row.qty) || 0;
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

    // Nếu chỉ paste 1 ô đơn lẻ vào ô text (không có tab và không xuống dòng) -> để trình duyệt xử lý bình thường
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
      const nextRows = [...prev.rows.map((r) => ({
        ...r,
        supplierQuotes: { ...r.supplierQuotes },
      }))];

      // Tự động thêm dòng mới nếu dữ liệu copy từ Excel vượt quá số dòng hiện có
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
              // Cập nhật lại thành tiền các NCC theo số lượng mới
              Object.keys(rowQuotes).forEach((cid) => {
                rowQuotes[cid] = (rowQuotes[cid] || []).map((line, lIdx) => {
                  const effQty =
                    prev.columnMode === "extended" ? line.qty : parsedQty;
                  return {
                    ...line,
                    qty:
                      lIdx === 0 && prev.columnMode !== "extended"
                        ? parsedQty
                        : line.qty,
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
            } else if (flatCol.field === "origin") {
              line.origin = cellVal;
            } else if (flatCol.field === "unitPrice") {
              line.unitPrice = cleanExcelNumber(cellVal);
              const effQty =
                prev.columnMode === "extended"
                  ? Number(line.qty) || 0
                  : Number(rowObj.qty) || 0;
              line.amount = line.unitPrice * effQty;
            } else if (flatCol.field === "qty") {
              line.qty = cleanExcelNumber(cellVal);
              line.amount = (Number(line.unitPrice) || 0) * line.qty;
            } else if (flatCol.field === "amount") {
              const pastedAmt = cleanExcelNumber(cellVal);
              if (line.unitPrice > 0) {
                const effQty =
                  prev.columnMode === "extended"
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

  // Tạo mới từ 3 nguồn
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

  // Tính helper index cho cột phẳng để gắn vào từng ô input
  const getSupplierFlatColIndex = (
    colId: string,
    field: "quotedProduct" | "origin" | "unitPrice" | "qty" | "amount",
  ) => {
    return flatColumns.findIndex(
      (c) => c.type === "supplier" && c.colId === colId && c.field === field,
    );
  };

  const subColCountPerSupplier =
    activeRequest?.columnMode === "extended"
      ? 4
      : activeRequest?.columnMode === "origin"
        ? 3
        : 2;

  const totalTableColumns =
    4 + (activeRequest?.supplierColumns.length || 0) * subColCountPerSupplier;

  const shouldRecommendLandscape =
    activeRequest &&
    (activeRequest.supplierColumns.length >= 3 ||
      activeRequest.columnMode === "extended");

  return (
    <div className="approval-mgmt-wrapper">
      {/* Dynamic @page orientation rule for Print Engine */}
      <style>{`
        @media print {
          @page {
            size: A4 ${activeRequest?.printOrientation || "landscape"};
            margin: 8mm;
          }
        }
      `}</style>

      {pasteToast && <div className="approval-toast no-print">{pasteToast}</div>}

      {/* Top Navigation & Creation Source Bar */}
      <div className="approval-top-panel no-print">
        <div className="approval-top-header">
          <div>
            <h2 className="approval-page-title">
              Đề nghị Phê duyệt Lựa chọn Nhà Cung Cấp
            </h2>
            <p className="approval-page-subtitle">
              Quy trình chuẩn: [PR] ➔ [So sánh Báo giá] ➔ [Đề nghị Phê duyệt] ➔ [Tạo
              PO] · Hỗ trợ Paste đa dòng/cột từ Excel & In chuẩn A4 Phenikaa Pharma
            </p>
          </div>

          {!isReportMode && (
            <div className="approval-source-actions">
              {onBackToCompare && (
                <button
                  type="button"
                  className="btn"
                  onClick={onBackToCompare}
                  title="Quay lại Bảng so sánh giá"
                >
                  ← Bảng so sánh giá
                </button>
              )}
              <button
                type="button"
                className="btn approval-source-btn source-compare"
                onClick={() => setSourceModalMode("compare")}
              >
                📊 1. Tạo từ So sánh giá PR
              </button>
              <button
                type="button"
                className="btn approval-source-btn source-pr"
                onClick={() => setSourceModalMode("pr")}
              >
                📋 2. Tạo trực tiếp từ PR
              </button>
              <button
                type="button"
                className="btn approval-source-btn source-manual"
                onClick={handleCreateManual}
              >
                ✨ 3. Tạo phiếu độc lập (Excel)
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onRestoreSamples();
                  showToast("✓ Đã nạp 2 biểu mẫu thực tế Phenikaa Pharma!");
                }}
                title="Nạp 2 mẫu chuẩn Phenikaa Pharma (PR 16/03/PR2603 & PR 02/06/PR2602)"
              >
                📂 Nạp mẫu chuẩn
              </button>
            </div>
          )}
        </div>

        {/* Danh sách các phiếu Đề nghị phê duyệt */}
        <div className="approval-list-bar">
          <div className="approval-list-filters">
            <input
              type="text"
              className="approval-search-input"
              placeholder="Tìm số PR, tên NCC, nội dung..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="approval-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái ({approvalRequests.length})</option>
              <option value="Nháp">Nháp</option>
              <option value="Chờ phê duyệt">Chờ phê duyệt</option>
              <option value="Đã phê duyệt">Đã phê duyệt</option>
              <option value="Đã tạo PO">Đã tạo PO</option>
            </select>
          </div>

          <div className="approval-tabs-scroll">
            {filteredRequests.map((req) => {
              const isActive = activeRequest?.id === req.id;
              const statusClass =
                req.status === "Đã tạo PO"
                  ? "st-po"
                  : req.status === "Đã phê duyệt"
                    ? "st-approved"
                    : req.status === "Chờ phê duyệt"
                      ? "st-pending"
                      : "st-draft";
              return (
                <div
                  key={req.id}
                  className={`approval-tab-chip ${isActive ? "active" : ""}`}
                  onClick={() => setActiveApprovalId(req.id)}
                >
                  <div className="chip-main">
                    <span className="chip-code">
                      {req.prNumber || req.requestNumber}
                    </span>
                    <span className={`chip-status ${statusClass}`}>
                      {req.status}
                    </span>
                  </div>
                  <div className="chip-sub">
                    {req.recommendedSupplierName || "Chưa chọn NCC"} ·{" "}
                    {req.rows.length} mục
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!activeRequest ? (
        <div className="approval-empty-state no-print">
          <h3>Chưa có phiếu Đề nghị Phê duyệt Lựa chọn Nhà Cung Cấp nào</h3>
          <p>
            Hãy chọn 1 trong 3 nguồn tạo phiếu ở thanh công cụ phía trên hoặc nạp
            biểu mẫu chuẩn Phenikaa Pharma để bắt đầu.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateManual}
            >
              ✨ Tạo phiếu mới
            </button>
            <button type="button" className="btn" onClick={onRestoreSamples}>
              📂 Nạp 2 mẫu chuẩn Phenikaa
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Thanh cấu hình Bảng Động, Khổ giấy in & Duyệt tạo PO */}
          <div className="approval-config-bar no-print">
            <div className="config-group">
              <span className="config-label">Chế độ cột NCC:</span>
              <div className="segmented-pills">
                {(
                  [
                    {
                      id: "basic",
                      label: "Cơ bản (2 cột: Đơn giá, Thành tiền)",
                    },
                    {
                      id: "origin",
                      label: "Có Xuất xứ (3 cột - Mẫu 1)",
                    },
                    {
                      id: "extended",
                      label: "Mở rộng / Tách dòng (4 cột - Mẫu 2)",
                    },
                  ] as { id: ApprovalColumnMode; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`seg-pill ${
                      activeRequest.columnMode === mode.id ? "active" : ""
                    }`}
                    onClick={() =>
                      updateActive((prev) => ({
                        ...prev,
                        columnMode: mode.id,
                        printOrientation:
                          mode.id === "extended" ? "landscape" : prev.printOrientation,
                      }))
                    }
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="config-group">
              <label className="checkbox-inline">
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
                <span>Dòng Thời gian giao hàng</span>
              </label>
            </div>

            {!isReportMode && (
              <div className="config-group">
                <select
                  className="approval-filter-select"
                  value={selectedAddSupplierId}
                  onChange={(e) => setSelectedAddSupplierId(e.target.value)}
                >
                  <option value="">-- Chọn NCC từ danh mục (hoặc thêm trống) --</option>
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
                  ＋ Thêm cột NCC ({activeRequest.supplierColumns.length})
                </button>
              </div>
            )}

            <div className="config-group">
              <span className="config-label">Khổ giấy A4:</span>
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
                    💡 Gợi ý chuyển sang A4 Ngang để không bị co chữ
                  </button>
                )}
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
                    🚀 Tạo PO ({activeRequest.supplierColumns.find((c) => c.isSelected)?.shortName || "NCC chọn"})
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
                🖨️ In biểu mẫu ({activeRequest.printOrientation === "landscape" ? "A4 Ngang" : "A4 Dọc"})
              </button>
            </div>
          </div>

          {/* Gợi ý thao tác Paste Excel nhanh */}
          {!isReportMode && (
            <div className="approval-excel-tip no-print">
              <span>
                💡 <strong>Mẹo thao tác nhanh như Excel:</strong> Bạn có thể bôi đen
                nhiều dòng/cột trên file Excel (danh sách Hàng hóa, Số lượng, ĐVT hoặc
                cột Đơn giá) rồi bấm <code>Ctrl + V</code> trực tiếp vào bất kỳ ô nào
                trong bảng dưới đây. Bảng sẽ tự động tách dòng/cột, làm sạch dấu chấm
                phân cách số và tự cộng Thành tiền!
              </span>
              {activeRequest.linkedPoNumber && (
                <span className="linked-po-badge">
                  🔗 Đã phát hành PO: <strong>{activeRequest.linkedPoNumber}</strong>
                </span>
              )}
            </div>
          )}

          {/* ===================================================================
              BIỂU MẪU IN CHUẨN PHENIKAA PHARMA (TÁCH BIỆT HOÀN TOÀN KHỎI I18N)
             =================================================================== */}
          <div
            className={`approval-a4-sheet orient-${activeRequest.printOrientation} ${
              totalTableColumns >= 10 ? "density-compact" : ""
            }`}
          >
            {/* 1. KHUNG HEADER BIỂU MẪU CÔNG TY */}
            <table className="phenikaa-header-table">
              <tbody>
                <tr>
                  <td className="phenikaa-logo-box">
                    <img
                      src="/phenikaa-logo.png"
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

            {/* 2. KHUNG META GÓC PHẢI (SỐ PR, NGÀY, ĐƠN VỊ LẬP, GHI CHÚ) */}
            <div className="phenikaa-meta-wrapper">
              <table className="phenikaa-meta-table">
                <tbody>
                  <tr>
                    <td className="meta-lbl">Số PR:</td>
                    <td className="meta-val">
                      <input
                        type="text"
                        className="sheet-inline-input"
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
                    </td>
                  </tr>
                  <tr>
                    <td className="meta-lbl">Ngày:</td>
                    <td className="meta-val">
                      <input
                        type="text"
                        className="sheet-inline-input"
                        value={activeRequest.createdDate}
                        readOnly={isReportMode}
                        onChange={(e) =>
                          updateActive((prev) => ({
                            ...prev,
                            createdDate: e.target.value,
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="meta-lbl">Đơn vị lập biểu mẫu:</td>
                    <td className="meta-val">
                      <input
                        type="text"
                        className="sheet-inline-input"
                        value={activeRequest.department}
                        readOnly={isReportMode}
                        onChange={(e) =>
                          updateActive((prev) => ({
                            ...prev,
                            department: e.target.value,
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="meta-lbl">Ghi chú: Căn cứ theo PR số:</td>
                    <td className="meta-val">
                      <input
                        type="text"
                        className="sheet-inline-input"
                        value={activeRequest.noteRef}
                        readOnly={isReportMode}
                        onChange={(e) =>
                          updateActive((prev) => ({
                            ...prev,
                            noteRef: e.target.value,
                          }))
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
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

              <table className="phenikaa-approval-grid">
                <thead>
                  {/* Tầng Header 1: 4 cột cố định bên trái (rowSpan=2) + Nhóm cột động từng NCC */}
                  <tr>
                    <th rowSpan={2} className="col-stt">
                      STT
                    </th>
                    <th rowSpan={2} className="col-item-name">
                      Hàng hóa
                    </th>
                    <th rowSpan={2} className="col-qty">
                      Số lượng
                    </th>
                    <th rowSpan={2} className="col-unit">
                      ĐVT
                    </th>
                    {activeRequest.supplierColumns.map((sc) => (
                      <th
                        key={sc.colId}
                        colSpan={subColCountPerSupplier}
                        className={`col-supplier-group ${
                          sc.isSelected ? "selected-supplier-th" : ""
                        }`}
                      >
                        {/* Hiển thị trên bản in chuẩn câu chữ hành chính Phenikaa */}
                        <div className="print-only-header-text">
                          {sc.isSelected
                            ? `NCC lựa chọn: ${sc.shortName || sc.supplierName}`
                            : sc.shortName || sc.supplierName}
                        </div>

                        {/* Giao diện điều khiển trực quan trên màn hình */}
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
                            placeholder="Tên viết tắt NCC (VD: Nam Anh)"
                            onChange={(e) => {
                              const val = e.target.value;
                              updateActive((prev) => ({
                                ...prev,
                                supplierColumns: prev.supplierColumns.map((c) =>
                                  c.colId === sc.colId
                                    ? { ...c, shortName: val }
                                    : c,
                                ),
                              }));
                            }}
                          />
                          <input
                            type="text"
                            className="sup-fullname-input"
                            value={sc.supplierName}
                            readOnly={isReportMode}
                            placeholder="Tên pháp nhân đầy đủ của NCC"
                            onChange={(e) => {
                              const val = e.target.value;
                              updateActive((prev) => ({
                                ...prev,
                                supplierColumns: prev.supplierColumns.map((c) =>
                                  c.colId === sc.colId
                                    ? { ...c, supplierName: val }
                                    : c,
                                ),
                                recommendedSupplierName: sc.isSelected
                                  ? val
                                  : prev.recommendedSupplierName,
                              }));
                            }}
                          />
                        </div>
                      </th>
                    ))}
                  </tr>

                  {/* Tầng Header 2: Các cột con của từng NCC theo columnMode */}
                  <tr>
                    {activeRequest.supplierColumns.map((sc) => (
                      <React.Fragment key={`sub_${sc.colId}`}>
                        {activeRequest.columnMode === "origin" && (
                          <th className="col-sub-spec">Hãng/ Xuất xứ</th>
                        )}
                        {activeRequest.columnMode === "extended" && (
                          <th className="col-sub-spec">Sản phẩm</th>
                        )}
                        <th className="col-sub-price">Đơn giá (VNĐ)</th>
                        {activeRequest.columnMode === "extended" && (
                          <th className="col-sub-qty">Số lượng</th>
                        )}
                        <th className="col-sub-amount">Thành tiền</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {activeRequest.rows.map((row, rowIdx) => {
                    // Tính số dòng con tối đa (maxSubLines) khi có NCC tách dòng báo giá
                    const maxSubLines =
                      activeRequest.columnMode === "extended"
                        ? Math.max(
                            1,
                            ...activeRequest.supplierColumns.map(
                              (sc) => (row.supplierQuotes[sc.colId] || []).length,
                            ),
                          )
                        : 1;

                    return Array.from({ length: maxSubLines }, (_, subIdx) => (
                      <tr key={`${row.rowId}_sub_${subIdx}`}>
                        {/* 4 Cột cố định bên trái chỉ render ở subIdx === 0 với rowSpan={maxSubLines} */}
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
                              <div className="print-only-cell-text">
                                {row.itemName}
                              </div>
                              <textarea
                                className="cell-textarea no-print"
                                rows={Math.max(
                                  1,
                                  Math.min(5, row.itemName.split("\n").length),
                                )}
                                value={row.itemName}
                                readOnly={isReportMode}
                                placeholder="Nhập hoặc Paste tên hàng hóa / quy cách..."
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
                              <div className="print-only-cell-text">
                                {row.qty}
                              </div>
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
                              <div className="print-only-cell-text">
                                {row.unit}
                              </div>
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

                        {/* Các cột con theo từng Nhà Cung Cấp */}
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

                          // Nếu NCC này chỉ có 1 dòng báo giá trong khi dòng chung có maxSubLines > 1 -> gộp ô dọc (rowSpan)
                          if (lines.length === 1 && maxSubLines > 1) {
                            if (subIdx > 0) return null;
                            const line = lines[0];
                            const effQty =
                              activeRequest.columnMode === "extended"
                                ? Number(line.qty) || 0
                                : Number(row.qty) || 0;
                            const computedAmt =
                              (Number(line.unitPrice) || 0) * effQty;

                            return (
                              <React.Fragment
                                key={`cell_${row.rowId}_${sc.colId}_span`}
                              >
                                {activeRequest.columnMode === "extended" && (
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-left cell-sub-spec"
                                  >
                                    <div className="print-only-cell-text">
                                      {line.quotedProduct || ""}
                                    </div>
                                    <textarea
                                      className="cell-textarea no-print"
                                      rows={2}
                                      value={line.quotedProduct || ""}
                                      readOnly={isReportMode}
                                      placeholder="Sản phẩm NCC báo..."
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
                                        title="Tách dòng báo giá cho NCC này"
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
                                  <div className="print-only-cell-text">
                                    {line.unitPrice
                                      ? formatVND(line.unitPrice)
                                      : "-"}
                                  </div>
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
                                {activeRequest.columnMode === "extended" && (
                                  <td
                                    rowSpan={maxSubLines}
                                    className="cell-center cell-sub-qty"
                                  >
                                    <div className="print-only-cell-text">
                                      {line.qty}
                                    </div>
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

                          // Trường hợp bình thường hoặc NCC có nhiều dòng con đã tách
                          const line = lines[subIdx];
                          if (!line) {
                            return (
                              <React.Fragment
                                key={`empty_${row.rowId}_${sc.colId}_${subIdx}`}
                              >
                                {activeRequest.columnMode !== "basic" && <td />}
                                <td />
                                {activeRequest.columnMode === "extended" && <td />}
                                <td />
                              </React.Fragment>
                            );
                          }

                          const effQty =
                            activeRequest.columnMode === "extended"
                              ? Number(line.qty) || 0
                              : Number(row.qty) || 0;
                          const computedAmt =
                            (Number(line.unitPrice) || 0) * effQty;

                          return (
                            <React.Fragment
                              key={`cell_${row.rowId}_${sc.colId}_${subIdx}`}
                            >
                              {activeRequest.columnMode === "origin" && (
                                <td className="cell-left cell-sub-spec">
                                  <div className="print-only-cell-text">
                                    {line.origin || ""}
                                  </div>
                                  <textarea
                                    className="cell-textarea no-print"
                                    rows={Math.max(
                                      1,
                                      Math.min(
                                        4,
                                        (line.origin || "").split("\n").length,
                                      ),
                                    )}
                                    value={line.origin || ""}
                                    readOnly={isReportMode}
                                    placeholder="Hãng / Xuất xứ / Model..."
                                    onChange={(e) =>
                                      handleUpdateSupplierLine(
                                        rowIdx,
                                        sc.colId,
                                        subIdx,
                                        "origin",
                                        e.target.value,
                                      )
                                    }
                                    onPaste={(e) =>
                                      handleCellPaste(
                                        e,
                                        rowIdx,
                                        getSupplierFlatColIndex(sc.colId, "origin"),
                                        subIdx,
                                      )
                                    }
                                  />
                                </td>
                              )}

                              {activeRequest.columnMode === "extended" && (
                                <td className="cell-left cell-sub-spec">
                                  <div className="print-only-cell-text">
                                    {line.quotedProduct || ""}
                                  </div>
                                  <textarea
                                    className="cell-textarea no-print"
                                    rows={Math.max(
                                      1,
                                      Math.min(
                                        4,
                                        (line.quotedProduct || "").split("\n")
                                          .length,
                                      ),
                                    )}
                                    value={line.quotedProduct || ""}
                                    readOnly={isReportMode}
                                    placeholder="Sản phẩm NCC báo..."
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
                                  {!isReportMode && (
                                    <div className="subrow-tools no-print">
                                      {subIdx === lines.length - 1 && (
                                        <button
                                          type="button"
                                          className="split-line-btn"
                                          onClick={() =>
                                            handleSplitSubRow(row.rowId, sc.colId)
                                          }
                                          title="Tách thêm 1 dòng báo giá con cho NCC này"
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
                                          title="Xóa dòng con này"
                                        >
                                          × Xóa dòng tách
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              )}

                              <td className="cell-right cell-sub-price">
                                <div className="print-only-cell-text">
                                  {line.unitPrice
                                    ? formatVND(line.unitPrice)
                                    : "-"}
                                </div>
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

                              {activeRequest.columnMode === "extended" && (
                                <td className="cell-center cell-sub-qty">
                                  <div className="print-only-cell-text">
                                    {line.qty}
                                  </div>
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

                  {/* Dòng tùy chọn: Thời gian giao hàng */}
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
                          <div className="print-only-cell-text">
                            {sc.deliveryTime || ""}
                          </div>
                          <input
                            type="text"
                            className="cell-input center bold-input no-print"
                            placeholder="VD: Hàng có sẵn / 4-6 tuần..."
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

                  {/* Dòng Footer: Tổng tiền chưa có VAT */}
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

              {!isReportMode && (
                <div className="table-bottom-actions no-print">
                  <button
                    type="button"
                    className="btn"
                    onClick={handleAddRow}
                  >
                    ＋ Thêm dòng hàng hóa
                  </button>
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
                  <span className="print-only-eval-val bold-text">
                    {activeRequest.recommendedSupplierName}
                  </span>
                  <input
                    type="text"
                    list="approval-suppliers-datalist"
                    className="sheet-inline-input bold-input no-print"
                    value={activeRequest.recommendedSupplierName}
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
                  <span className="print-only-eval-val">
                    {activeRequest.deliveryTerms}
                  </span>
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
                  <span className="print-only-eval-val">
                    {activeRequest.paymentTerms}
                  </span>
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
                    <span className="print-only-eval-val">{reason}</span>
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
                      <span className="print-only-eval-val bold-text">
                        {activeRequest.approverLeader}
                      </span>
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
                      <span className="print-only-eval-val bold-text">
                        {activeRequest.approverDeptHead}
                      </span>
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
                      <span className="print-only-eval-val bold-text">
                        {activeRequest.requesterName}
                      </span>
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
        </>
      )}

      {/* MODAL CHỌN PR ĐỂ TẠO TỪ SO SÁNH GIÁ HOẶC TẠO TRỰC TIẾP TỪ PR */}
      {sourceModalMode && (
        <div
          className="backdrop no-print"
          onClick={() => setSourceModalMode(null)}
        >
          <div
            className="modal-panel"
            style={{ width: "min(680px, 95vw)" }}
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
            <div className="modal-body" style={{ maxHeight: 420, overflowY: "auto" }}>
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
                          <button type="button" className="btn btn-primary btn-sm">
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
      )}

      {/* MODAL DÁN NHANH VÙNG DỮ LIỆU TỪ EXCEL */}
      {showExcelPasteModal && activeRequest && (
        <div
          className="backdrop no-print"
          onClick={() => setShowExcelPasteModal(false)}
        >
          <div
            className="modal-panel"
            style={{ width: "min(720px, 95vw)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  📋 Dán nhanh vùng dữ liệu từ Excel
                </h3>
                <p className="modal-desc">
                  Copy các dòng/cột từ Excel (bắt đầu từ cột{" "}
                  <strong>Hàng hóa | Số lượng | ĐVT | ...</strong>) và dán vào ô bên
                  dưới, hoặc bấm <code>Ctrl + V</code> trực tiếp vào bất kỳ ô nào trên
                  bảng.
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
                      setRawExcelPasteModalDone();
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
    </div>
  );

  function setRawExcelPasteModalDone() {
    setRawExcelModalText("");
    setShowExcelPasteModal(false);
  }
}
