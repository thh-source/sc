import React, { useState } from "react";
import { PR } from "../types";
import { fmt, dateVN } from "../utils";
import { useTranslation } from "../i18n";

export function PRList({
  prs,
  onCreate,
  onOpen,
  onDelete,
}: {
  prs: PR[];
  onCreate: () => void;
  onOpen: (pr: PR) => void;
  onDelete?: (pr: PR) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const shown = prs.filter((p) =>
    (p.number + p.department + p.purpose)
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <section className="content pr-page">
      <div className="heading">
        <div>
          <em>{t("pr.badge")}</em>
          <h1>{t("pr.title")}</h1>
          <p>{t("pr.desc")}</p>
        </div>
        <button className="primary" onClick={onCreate}>
          {t("pr.create_btn")}
        </button>
      </div>
      <div className="pr-stats">
        <article>
          <span>{t("pr.stat_total")}</span>
          <strong>{prs.length}</strong>
          <small>{t("pr.stat_total_sub")}</small>
        </article>
        <article>
          <span>{t("pr.stat_pending")}</span>
          <strong>{prs.filter((p) => p.status === "Chờ xử lý").length}</strong>
          <small>{t("pr.stat_pending_sub")}</small>
        </article>
        <article>
          <span>{t("pr.stat_quoting")}</span>
          <strong>
            {prs.filter((p) => p.status === "Đang lấy báo giá").length}
          </strong>
          <small>{t("pr.stat_quoting_sub")}</small>
        </article>
      </div>
      <div className="pr-panel">
        <div className="pr-toolbar">
          <label>
            ⌕
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("pr.search_placeholder")}
            />
          </label>
          <span>{t("pr.requests_count", { count: shown.length })}</span>
        </div>
        <div className="mobile-record-list">
          {shown.map((pr) => (
            <article key={pr.id}>
              <header><button onClick={() => onOpen(pr)}>{pr.number}</button><span className={`status ${pr.status === "Đã hoàn thành" ? "done" : pr.status.includes("PO") || pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}>{pr.status}</span></header>
              <h3>{pr.department}</h3>
              <p>{pr.purpose}</p>
              <dl><div><dt>Ngày PR</dt><dd>{dateVN(pr.date)}</dd></div><div><dt>Mặt hàng</dt><dd>{pr.items.length}</dd></div><div><dt>Dự kiến</dt><dd>{fmt(pr.items.reduce((sum, item) => sum + item.qty * item.estimate, 0))} ₫</dd></div></dl>
              <footer><button className="row-action" onClick={() => onOpen(pr)}>Mở PR</button>{onDelete && <button className="delete-action" onClick={() => onDelete(pr)}>Xóa</button>}</footer>
            </article>
          ))}
        </div>
        <div className="pr-table">
          <table>
            <colgroup>
              <col style={{ width: "130px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ minWidth: "260px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "130px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "90px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>{t("table.pr_number")}</th>
                <th>{t("table.pr_date")}</th>
                <th>{t("table.department")}</th>
                <th>{t("table.purpose")}</th>
                <th>{t("table.items_count")}</th>
                <th>{t("table.est_amount")}</th>
                <th>{t("table.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <button className="pr-link" onClick={() => onOpen(pr)}>
                      {pr.number}
                    </button>
                  </td>
                  <td>{dateVN(pr.date)}</td>
                  <td>{pr.department}</td>
                  <td className="purpose-cell">{pr.purpose}</td>
                  <td className="center">{pr.items.length}</td>
                  <td className="money">
                    {fmt(pr.items.reduce((s, i) => s + i.qty * i.estimate, 0))}{" "}
                    ₫
                  </td>
                  <td>
                    <span
                      className={`status ${pr.status === "Đã hoàn thành" ? "done" : pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}
                    >
                      {pr.status}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="row-action" onClick={() => onOpen(pr)}>
                        Mở PR →
                      </button>
                      {onDelete && (
                        <button className="delete-action" onClick={() => onDelete(pr)}>
                          Xóa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

