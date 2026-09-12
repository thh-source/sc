import React, { useState, useMemo, useEffect, Fragment } from "react";
import { Item, Supplier, PurchaseHistory, Quote, PR, PO, ColumnKey, SortState, TrashItem, View, ApprovalDraft } from "../types";
import { fmt, dateVN, makeId, quoteAmount, quoteVatRate, quoteBeforeVat, quoteAfterVat, quoteComparePrice, priceStats, emptyItem, applyTools, reorder, BASE_COLUMNS } from "../utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { EditableCell } from "./EditableCell";
// Add other imports as necessary

export function ApprovalSheet({
  draft,
  setDraft,
  suppliers,
  onBack,
  onCreatePO,
}: {
  draft: ApprovalDraft;
  setDraft: React.Dispatch<React.SetStateAction<ApprovalDraft | null>>;
  suppliers: Supplier[];
  onBack: () => void;
  onCreatePO: () => void;
}) {
  const chosenSuppliers = draft.supplierIds
      .map((id) => suppliers.find((supplier) => supplier.id === id))
      .filter(Boolean) as Supplier[],
    shownSuppliers = chosenSuppliers.slice(0, 4),
    update = (patch: Partial<ApprovalDraft>) =>
      setDraft((current) => (current ? { ...current, ...patch } : current)),
    addRow = () =>
      update({
        rows: [
          ...draft.rows,
          {
            id: crypto.randomUUID(),
            prNumber: draft.prNumbers,
            code: "",
            name: "",
            qty: 0,
            unit: "",
            selectedSupplierId: draft.supplierIds[0] || 0,
            prices: {},
          },
        ],
      }),
    removeRow = (id: string) =>
      update({ rows: draft.rows.filter((row) => row.id !== id) });
  return (
    <section className="content approval-page">
      <div className="approval-toolbar">
        <div>
          <em>ĐỀ NGHỊ PHÊ DUYỆT</em>
          <h1>Bản phê duyệt lựa chọn NCC</h1>
          <p>Sửa trực tiếp trong biểu mẫu, in trình ký, sau đó phát hành PO.</p>
        </div>
        <div>
          <button className="ghost" onClick={onBack}>← Quay lại so sánh giá</button>
          <button className="ghost" onClick={() => window.print()}>In bản phê duyệt</button>
          <button className="primary" onClick={onCreatePO}>Phát hành PO</button>
        </div>
      </div>
      <div className="approval-sheet-wrap">
        <div className="approval-sheet">
          <header>
            <div className="approval-logo">
              <img src="/phenikaa-logo.png" alt="Phenikaa Pharma" />
            </div>
            <h2>ĐỀ NGHỊ PHÊ DUYỆT LỰA CHỌN NCC</h2>
          </header>
          <div className="approval-meta">
            <label>Số PR:<input value={draft.number} onChange={(e) => update({ number: e.target.value })}/></label>
            <label>Ngày:<input type="date" value={draft.date} onChange={(e) => update({ date: e.target.value })}/></label>
            <label>Đơn vị lập biểu mẫu:<input value={draft.department} onChange={(e) => update({ department: e.target.value })}/></label>
            <label>Ghi chú: Căn cứ theo PR số:<input value={draft.prNumbers} onChange={(e) => update({ prNumbers: e.target.value })}/></label>
          </div>
          <div className="approval-recipient" contentEditable suppressContentEditableWarning>Kính gửi: BAN LÃNH ĐẠO CÔNG TY</div>
          <textarea
            className="approval-intro"
            value={draft.intro}
            onChange={(e) => update({ intro: e.target.value })}
          />
          <div className="approval-section-title">I&nbsp;&nbsp;&nbsp;&nbsp;Tên hàng hóa</div>
          <div className="approval-table-wrap">
            <table className="approval-table">
              <thead>
                <tr>
                  <th rowSpan={2}>STT</th>
                  <th rowSpan={2}>Hàng hóa</th>
                  <th rowSpan={2}>Số lượng</th>
                  <th rowSpan={2}>ĐVT</th>
                  {shownSuppliers.map((supplier) => (
                    <th key={supplier.id} colSpan={2}>
                      NCC {draft.rows.some((row) => row.selectedSupplierId === supplier.id) ? "lựa chọn: " : ""}
                      {supplier.name}
                    </th>
                  ))}
                  <th rowSpan={2}>Xóa</th>
                </tr>
                <tr>
                  {shownSuppliers.flatMap((supplier) => [
                    <th key={`${supplier.id}-price`}>Đơn giá (VNĐ)</th>,
                    <th key={`${supplier.id}-amount`}>Thành tiền</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, index) => (
                  <tr key={row.id}>
                    <EditableCell className="center">{index + 1}</EditableCell>
                    <EditableCell>{row.name}</EditableCell>
                    <EditableCell className="center">{row.qty}</EditableCell>
                    <EditableCell className="center">{row.unit}</EditableCell>
                    {shownSuppliers.flatMap((supplier) => {
                      const selected = row.selectedSupplierId === supplier.id,
                        price = row.prices[supplier.id] || 0;
                      return [
                        <EditableCell key={`${row.id}-${supplier.id}-price`} className={selected ? "selected-supplier money" : "money"}>
                          {price ? fmt(price) : ""}
                        </EditableCell>,
                        <EditableCell key={`${row.id}-${supplier.id}-amount`} className={selected ? "selected-supplier money" : "money"}>
                          {price ? fmt(price * row.qty) : ""}
                        </EditableCell>,
                      ];
                    })}
                    <td className="approval-row-action"><button onClick={() => removeRow(row.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Tổng tiền cả chưa có VAT</td>
                  {shownSuppliers.map((supplier) => {
                    const sum = draft.rows.reduce(
                      (n, row) => n + row.qty * (row.prices[supplier.id] || 0),
                      0,
                    );
                    return (
                      <td key={supplier.id} colSpan={2} className="money">{fmt(sum)}</td>
                    );
                  })}
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={4}>Thời gian cần hàng</td>
                  <td colSpan={Math.max(1, shownSuppliers.length * 2)} contentEditable suppressContentEditableWarning></td>
                  <td contentEditable suppressContentEditableWarning>Ngày: Tháng</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <button className="approval-add-row" onClick={addRow}>＋ Thêm dòng thủ công</button>
          {chosenSuppliers.length > 4 && (
            <p className="approval-overflow-note">
              Mẫu A4 dọc đang hiển thị 4 NCC đầu tiên. Các NCC còn lại nên đưa vào phụ lục hoặc in trang so sánh riêng.
            </p>
          )}
          <div className="approval-note">
            <b>II&nbsp;&nbsp;&nbsp;&nbsp;Đánh giá và đề xuất lựa chọn nhà cung cấp</b>
            <p contentEditable suppressContentEditableWarning>1&nbsp;&nbsp;&nbsp;&nbsp;Nhà cung cấp đề xuất: {suppliers.find((supplier) => supplier.id === draft.rows[0]?.selectedSupplierId)?.name || ""}</p>
            <p contentEditable suppressContentEditableWarning>2&nbsp;&nbsp;&nbsp;&nbsp;Điều khoản thanh toán: Thanh toán theo thỏa thuận sau khi nhận đủ hồ sơ thanh toán</p>
            <b>III&nbsp;&nbsp;&nbsp;&nbsp;Lý do lựa chọn</b>
            <p contentEditable suppressContentEditableWarning>1&nbsp;&nbsp;&nbsp;&nbsp;Hàng hóa đạt yêu cầu về chất lượng, thông số kỹ thuật.</p>
            <p contentEditable suppressContentEditableWarning>2&nbsp;&nbsp;&nbsp;&nbsp;Đã thực hiện nhiều hợp đồng với công ty, đáp ứng quy định về thời gian giao hàng và chất lượng sản phẩm.</p>
            <p contentEditable suppressContentEditableWarning>3&nbsp;&nbsp;&nbsp;&nbsp;Thời gian giao hàng đáp ứng tiến độ dự án/công việc.</p>
            <textarea value={draft.note} onChange={(e) => update({ note: e.target.value })} placeholder="Ghi chú thêm nếu cần..."/>
          </div>
          <p className="approval-thanks" contentEditable suppressContentEditableWarning>Xin trân trọng cảm ơn!</p>
          <div className="approval-sign">
            <div><b>Lãnh đạo phê duyệt</b><span contentEditable suppressContentEditableWarning>Đinh Anh Hào</span></div>
            <div><b>Trưởng bộ phận</b><span contentEditable suppressContentEditableWarning>Lưu Thị Thanh Xuân</span></div>
            <div><b>Người đề nghị</b><span contentEditable suppressContentEditableWarning>Trần Hà</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

