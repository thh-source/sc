import React, { useState, useMemo } from "react";
import {
  RotateCcw,
  Trash2,
  Search,
  FileText,
  Package,
  ClipboardList,
  CreditCard,
  Building2,
  FileCheck,
  AlertCircle,
  X,
} from "lucide-react";
import { TrashItem, TrashType } from "../types";
import { dateVN, fmt } from "../utils";

interface TrashPageProps {
  entries: TrashItem[];
  onRestore: (entry: TrashItem) => void;
  onPermanentDelete?: (id: string) => void;
  onEmptyTrash?: () => void;
}

export function TrashPage({
  entries,
  onRestore,
  onPermanentDelete,
  onEmptyTrash,
}: TrashPageProps) {
  const [openedAt] = useState(() => Date.now());
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | TrashType>("ALL");

  const daysLeft = (expiresAt: string) =>
    Math.max(0, Math.ceil((new Date(expiresAt).getTime() - openedAt) / 86400000));

  const getTypeMeta = (type: TrashType) => {
    switch (type) {
      case "APPROVAL":
        return {
          label: "Đề nghị phê duyệt",
          shortLabel: "ĐNPD",
          badgeClass: "trash-type approval",
          icon: <FileCheck size={14} />,
        };
      case "PO":
        return {
          label: "Đơn mua hàng (PO)",
          shortLabel: "PO",
          badgeClass: "trash-type po",
          icon: <Package size={14} />,
        };
      case "PR":
        return {
          label: "Yêu cầu mua sắm (PR)",
          shortLabel: "PR",
          badgeClass: "trash-type pr",
          icon: <ClipboardList size={14} />,
        };
      case "HANDOVER":
        return {
          label: "Bàn giao / Nghiệm thu",
          shortLabel: "Bàn giao",
          badgeClass: "trash-type handover",
          icon: <Building2 size={14} />,
        };
      case "PAYMENT":
        return {
          label: "Đề nghị thanh toán",
          shortLabel: "ĐNTT",
          badgeClass: "trash-type payment",
          icon: <CreditCard size={14} />,
        };
      case "CONTRACT":
        return {
          label: "Hợp đồng kinh tế",
          shortLabel: "Hợp đồng",
          badgeClass: "trash-type contract",
          icon: <FileText size={14} />,
        };
      default:
        return {
          label: type,
          shortLabel: type,
          badgeClass: "trash-type",
          icon: <FileText size={14} />,
        };
    }
  };

  const getRecordSummary = (entry: TrashItem) => {
    if (!entry.data) return "";
    const d = entry.data;
    if (entry.type === "APPROVAL") {
      const supp = d.selectedSupplier || d.proposedSupplier || "";
      const total = d.totalAmount || d.summary?.totalAmount;
      return [supp, total ? `${fmt(total)} đ` : ""].filter(Boolean).join(" · ");
    }
    if (entry.type === "PO") {
      const supp = d.supplier || d.supplierName || "";
      const total = d.total || d.totalAmount;
      return [supp, total ? `${fmt(total)} đ` : ""].filter(Boolean).join(" · ");
    }
    if (entry.type === "PR") {
      const dept = d.department || "";
      const purpose = d.purpose || "";
      return [dept, purpose].filter(Boolean).join(" - ");
    }
    if (entry.type === "HANDOVER") {
      if (Array.isArray(d)) {
        return `${d.length} mặt hàng bàn giao`;
      }
      const name = d.item_name || d.itemName || "";
      const dept = d.department || "";
      const src = d.source_number || d.sourceNumber || "";
      return [name, dept, src ? `Số: ${src}` : ""].filter(Boolean).join(" · ");
    }
    if (entry.type === "PAYMENT") {
      if (Array.isArray(d)) {
        return `${d.length} hồ sơ thanh toán`;
      }
      const payee = d.payee_name || d.payeeName || "";
      const amount = d.amount_after_tax || d.amount_pre_tax || d.amount;
      const group = d.group_code || d.groupCode || "";
      return [payee, group ? `PO: ${group}` : "", amount ? `${fmt(amount)} đ` : ""].filter(Boolean).join(" · ");
    }
    if (entry.type === "CONTRACT") {
      return d.contractNumber || d.supplier || "";
    }
    return "";
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: entries.length };
    entries.forEach((e) => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (activeFilter !== "ALL" && entry.type !== activeFilter) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const summary = getRecordSummary(entry).toLowerCase();
      const label = (entry.label || "").toLowerCase();
      const typeLabel = getTypeMeta(entry.type).label.toLowerCase();
      return label.includes(term) || summary.includes(term) || typeLabel.includes(term);
    });
  }, [entries, activeFilter, searchTerm]);

  const handleEmptyTrash = () => {
    if (!entries.length) return;
    if (
      window.confirm(
        `Bạn có chắc chắn muốn DỌN SẠCH THÙNG RÁC (${entries.length} bản ghi)?\n\nLƯU Ý: Hành động này sẽ xóa vĩnh viễn và không thể khôi phục lại!`
      )
    ) {
      if (onEmptyTrash) onEmptyTrash();
    }
  };

  const handlePermanentDelete = (entry: TrashItem) => {
    if (
      window.confirm(
        `Xóa vĩnh viễn "${entry.label}" khỏi thùng rác?\nDữ liệu này sẽ không thể phục hồi lại.`
      )
    ) {
      if (onPermanentDelete) onPermanentDelete(entry.id);
    }
  };

  return (
    <section className="content trash-page">
      <div className="heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
            <Trash2 size={22} className="text-rose-600" />
            Thùng rác hệ thống
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
            Các phiếu Đề nghị phê duyệt (ĐNPD), Đơn hàng (PO), Yêu cầu mua sắm (PR), Bàn giao và Thanh toán bị xóa sẽ được lưu tạm tại đây trong 30 ngày.
          </p>
        </div>
        {entries.length > 0 && onEmptyTrash && (
          <button
            type="button"
            className="empty-trash-btn"
            onClick={handleEmptyTrash}
            title="Xóa vĩnh viễn toàn bộ mục trong thùng rác"
          >
            <Trash2 size={14} /> Dọn sạch thùng rác ({entries.length})
          </button>
        )}
      </div>

      {/* Notice info banner */}
      <div className="trash-notice" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#eff6ff", color: "#2563eb", display: "grid", placeItems: "center" }}>
            <Trash2 size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "#1e293b" }}>
              {entries.length} bản ghi đang lưu tạm trong thùng rác
            </div>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Bạn có thể khôi phục lại nguyên vẹn chứng từ bất cứ lúc nào trước thời điểm hết hạn.
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="trash-filter-toolbar" style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="trash-filter-pills" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            className={`trash-filter-pill ${activeFilter === "ALL" ? "active" : ""}`}
            onClick={() => setActiveFilter("ALL")}
          >
            Tất cả <span className="pill-count">{typeCounts.ALL || 0}</span>
          </button>
          <button
            type="button"
            className={`trash-filter-pill ${activeFilter === "APPROVAL" ? "active" : ""}`}
            onClick={() => setActiveFilter("APPROVAL")}
          >
            Đề nghị duyệt (ĐNPD) <span className="pill-count">{typeCounts.APPROVAL || 0}</span>
          </button>
          <button
            type="button"
            className={`trash-filter-pill ${activeFilter === "PO" ? "active" : ""}`}
            onClick={() => setActiveFilter("PO")}
          >
            Đơn hàng PO <span className="pill-count">{typeCounts.PO || 0}</span>
          </button>
          <button
            type="button"
            className={`trash-filter-pill ${activeFilter === "PR" ? "active" : ""}`}
            onClick={() => setActiveFilter("PR")}
          >
            Yêu cầu PR <span className="pill-count">{typeCounts.PR || 0}</span>
          </button>
          <button
            type="button"
            className={`trash-filter-pill ${activeFilter === "HANDOVER" ? "active" : ""}`}
            onClick={() => setActiveFilter("HANDOVER")}
          >
            Bàn giao kho <span className="pill-count">{typeCounts.HANDOVER || 0}</span>
          </button>
          <button
            type="button"
            className={`trash-filter-pill ${activeFilter === "PAYMENT" ? "active" : ""}`}
            onClick={() => setActiveFilter("PAYMENT")}
          >
            Đề nghị TT <span className="pill-count">{typeCounts.PAYMENT || 0}</span>
          </button>
          <button
            type="button"
            className={`trash-filter-pill ${activeFilter === "CONTRACT" ? "active" : ""}`}
            onClick={() => setActiveFilter("CONTRACT")}
          >
            Hợp đồng <span className="pill-count">{typeCounts.CONTRACT || 0}</span>
          </button>
        </div>

        <div className="trash-search-wrapper" style={{ position: "relative", minWidth: 260 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="text"
            className="trash-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo số chứng từ, NCC..."
            style={{
              width: "100%",
              height: 34,
              padding: "0 28px 0 32px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              fontSize: "12px",
              background: "#ffffff",
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="trash-table" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", height: 40, textAlign: "left", fontSize: "12px", color: "#475569" }}>
              <th style={{ padding: "8px 12px", width: 60, textAlign: "center" }}>STT</th>
              <th style={{ padding: "8px 12px", width: 180 }}>Phân loại</th>
              <th style={{ padding: "8px 12px", width: 220 }}>Số chứng từ / Tiêu đề</th>
              <th style={{ padding: "8px 12px" }}>Thông tin chi tiết</th>
              <th style={{ padding: "8px 12px", width: 140 }}>Ngày xóa</th>
              <th style={{ padding: "8px 12px", width: 120 }}>Thời hạn lưu</th>
              <th style={{ padding: "8px 12px", width: 200, textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="trash-empty" style={{ padding: "48px 16px", textAlign: "center", color: "#64748b" }}>
                  <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f1f5f9", display: "grid", placeItems: "center", color: "#94a3b8" }}>
                      <Trash2 size={22} />
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#334155" }}>
                      {entries.length === 0 ? "Thùng rác hiện đang trống" : "Không có bản ghi phù hợp bộ lọc"}
                    </span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {entries.length === 0
                        ? "Khi xóa các phiếu ĐNPD, PO, PR, Bàn giao hoặc Thanh toán, bạn có thể xem lại và phục hồi tại đây."
                        : "Thử tìm kiếm với từ khóa khác hoặc bấm chọn tab \"Tất cả\"."}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry, idx) => {
                const meta = getTypeMeta(entry.type);
                const summary = getRecordSummary(entry);
                const remainingDays = daysLeft(entry.expiresAt);
                return (
                  <tr
                    key={entry.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      fontSize: "12px",
                      transition: "background-color 0.15s ease",
                    }}
                    className="trash-row"
                  >
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#94a3b8" }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className={meta.badgeClass} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {meta.icon}
                        <span>{meta.shortLabel}</span>
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "13px" }}>
                        {entry.label}
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                        ID: {entry.id.slice(0, 8)}...
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>
                      {summary || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Không có mô tả phụ</span>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#64748b" }}>
                      {dateVN(entry.deletedAt)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        className="expiry-badge"
                        style={{
                          background: remainingDays <= 3 ? "#fee2e2" : "#fef3c7",
                          color: remainingDays <= 3 ? "#991b1b" : "#92400e",
                          fontWeight: 600,
                        }}
                      >
                        Còn {remainingDays} ngày
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          className="restore-action"
                          onClick={() => onRestore(entry)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            cursor: "pointer",
                            background: "#ecfdf5",
                            color: "#047857",
                            border: "1px solid #a7f3d0",
                            borderRadius: 6,
                            padding: "5px 10px",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                          title="Khôi phục lại dữ liệu này"
                        >
                          <RotateCcw size={13} /> Phục hồi
                        </button>
                        {onPermanentDelete && (
                          <button
                            type="button"
                            className="permanent-delete-action"
                            onClick={() => handlePermanentDelete(entry)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              cursor: "pointer",
                              background: "#fff1f2",
                              color: "#e11d48",
                              border: "1px solid #fecdd3",
                              borderRadius: 6,
                              padding: "5px 8px",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                            title="Xóa vĩnh viễn không thể phục hồi"
                          >
                            <Trash2 size={13} />
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
    </section>
  );
}
