import React from "react";
import {
  FileText,
  BarChart2,
  FileCheck,
  Package,
  CreditCard,
  Truck,
  Plus,
} from "lucide-react";
import { ResolvedDocFlow } from "../utils/docFlow";

export interface DocFlowLinksProps {
  flow: ResolvedDocFlow;
  currentView?: "prs" | "compare" | "approval" | "po-list" | "po-detail" | "payment" | "handover";
  onNavigate?: (route: any) => void;
  compact?: boolean;
  className?: string;
  onCreatePOFromApproval?: (approvalId: number) => void;
  onCreatePaymentForPO?: (poNumber: string) => void;
}

/**
 * DocFlowLinks: Thanh liên kết luồng chứng từ xuyên suốt (Cross-module Traceability)
 * Hiển thị các nút bấm Pill Badge bo tròn, có icon và màu sắc ngữ nghĩa
 */
export function DocFlowLinks({
  flow,
  currentView,
  onNavigate,
  compact = false,
  className = "",
  onCreatePOFromApproval,
}: DocFlowLinksProps) {
  const iconSize = compact ? 12 : 13;

  const handleNav = (e: React.MouseEvent, route: any) => {
    e.stopPropagation();
    if (onNavigate) {
      onNavigate(route);
    }
  };

  return (
    <div className={`doc-flow-group ${className}`} onClick={(e) => e.stopPropagation()}>
      {/* 1. Nút liên kết PR gốc (nếu không phải đang ở trang PR) */}
      {currentView !== "prs" && flow.prNumber && (
        <button
          type="button"
          className="doc-flow-badge doc-flow-pr"
          title={`Xem Yêu cầu mua sắm ${flow.prNumber}`}
          onClick={(e) => handleNav(e, { view: "prs", id: flow.prId })}
        >
          <FileText size={iconSize} />
          <span>{flow.prNumber}</span>
        </button>
      )}

      {/* 2. Nút So sánh Báo giá (nếu có PR và không phải đang ở trang Compare) */}
      {currentView !== "compare" && flow.prId && (
        <button
          type="button"
          className="doc-flow-badge doc-flow-compare"
          title={`Mở bảng So sánh giá của ${flow.prNumber || "PR"}`}
          onClick={(e) => handleNav(e, { view: "compare", prId: flow.prId })}
        >
          <BarChart2 size={iconSize} />
          <span>So sánh</span>
        </button>
      )}

      {/* 3. Nút Đề nghị Phê duyệt (ĐNPD) (nếu không phải đang ở trang Approval) */}
      {currentView !== "approval" && (
        flow.approvalId ? (
          <button
            type="button"
            className="doc-flow-badge doc-flow-approval"
            title={`Mở Đề nghị phê duyệt ${flow.approvalNumber || ""}`}
            onClick={(e) => handleNav(e, { view: "approval", id: flow.approvalId })}
          >
            <FileCheck size={iconSize} />
            <span>{flow.approvalNumber || "ĐNPD"}</span>
          </button>
        ) : currentView === "prs" ? (
          <button
            type="button"
            className="doc-flow-badge doc-flow-ghost"
            title="Chưa lập ĐNPD - Bấm để lập mới"
            onClick={(e) => handleNav(e, { view: "approval" })}
          >
            <Plus size={iconSize} />
            <span>ĐNPD</span>
          </button>
        ) : null
      )}

      {/* 4. Nút Đơn mua hàng (PO) (nếu không phải đang ở trang PO Detail) */}
      {currentView !== "po-detail" && (
        flow.poId ? (
          <button
            type="button"
            className="doc-flow-badge doc-flow-po"
            title={`Mở Đơn mua hàng ${flow.poNumber || ""}`}
            onClick={(e) => handleNav(e, { view: "po-detail", id: flow.poId })}
          >
            <Package size={iconSize} />
            <span>{flow.poNumber || "PO"}</span>
          </button>
        ) : currentView === "approval" && flow.approvalStatus === "Đã phê duyệt" ? (
          <button
            type="button"
            className="doc-flow-badge doc-flow-po"
            title="Đã duyệt! Bấm để tạo PO phát hành đơn hàng"
            onClick={(e) => {
              if (onCreatePOFromApproval && flow.approvalId) {
                onCreatePOFromApproval(flow.approvalId);
              } else {
                handleNav(e, { view: "po-list" });
              }
            }}
          >
            <Plus size={iconSize} />
            <span>Tạo PO</span>
          </button>
        ) : currentView === "prs" ? (
          <span className="doc-flow-badge doc-flow-ghost" title="Chưa có PO phát hành">
            <Package size={iconSize} />
            <span>Chưa PO</span>
          </span>
        ) : null
      )}

      {/* 5. Nút Đề nghị Thanh toán (cho PO) */}
      {(currentView === "po-list" || currentView === "po-detail" || currentView === "approval") && flow.poNumber && (
        <button
          type="button"
          className="doc-flow-badge doc-flow-payment"
          title={`Xem hoặc tạo Đề nghị thanh toán cho ${flow.poNumber}`}
          onClick={(e) => handleNav(e, { view: "payment" })}
        >
          <CreditCard size={iconSize} />
          <span>Thanh toán{flow.paymentCount ? ` (${flow.paymentCount})` : ""}</span>
        </button>
      )}

      {/* 6. Nút Giao nhận / Bàn giao (cho PO) */}
      {(currentView === "po-list" || currentView === "po-detail") && flow.poNumber && (
        <button
          type="button"
          className="doc-flow-badge doc-flow-handover"
          title={`Xem tiến độ bàn giao / giao nhận của ${flow.poNumber}`}
          onClick={(e) => handleNav(e, { view: "handover" })}
        >
          <Truck size={iconSize} />
          <span>Giao nhận{flow.handoverCount ? ` (${flow.handoverCount})` : ""}</span>
        </button>
      )}
    </div>
  );
}
