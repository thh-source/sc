import React, { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { TrashItem } from "../types";
import { dateVN } from "../utils";

export function TrashPage({
  entries,
  onRestore,
}: {
  entries: TrashItem[];
  onRestore: (entry: TrashItem) => void;
}) {
  const [openedAt] = useState(() => Date.now());
  const daysLeft = (expiresAt: string) =>
    Math.max(0, Math.ceil((new Date(expiresAt).getTime() - openedAt) / 86400000));
  return (
    <section className="content trash-page">
      <div className="heading">
        <div>
          <h1>Thùng rác</h1>
        </div>
      </div>
      <div className="trash-notice">
        <i><Trash2 size={20} /></i>
        <div><b>{entries.length} bản ghi đang lưu tạm</b><span>Hệ thống tự loại khỏi thùng rác sau 30 ngày.</span></div>
      </div>
      <div className="trash-table">
        <table>
          <thead><tr><th>Loại dữ liệu</th><th>Số chứng từ</th><th>Ngày xóa</th><th>Hết hạn sau</th><th></th></tr></thead>
          <tbody>
            {!entries.length && <tr><td colSpan={5} className="trash-empty">Thùng rác đang trống.</td></tr>}
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td><span className={`trash-type ${entry.type.toLowerCase()}`}>{entry.type === "CONTRACT" ? "Hợp đồng" : entry.type}</span></td>
                <td><b>{entry.label}</b></td>
                <td>{dateVN(entry.deletedAt)}</td>
                <td><span className="expiry-badge">{daysLeft(entry.expiresAt)} ngày</span></td>
                <td><button className="restore-action" onClick={() => onRestore(entry)} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><RotateCcw size={14} /> Phục hồi</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

