PRAGMA foreign_keys = ON;

ALTER TABLE contracts ADD COLUMN lc_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN lc_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE contracts ADD COLUMN lc_no TEXT DEFAULT '';
ALTER TABLE contracts ADD COLUMN lc_open_date TEXT;
ALTER TABLE contracts ADD COLUMN lc_expiry_date TEXT;
ALTER TABLE contracts ADD COLUMN lc_note TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS contract_lc_payments (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  UNIQUE(contract_id, payment_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_lc_payments_contract ON contract_lc_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_lc_payments_payment ON contract_lc_payments(payment_id);

-- Chuyển cấu hình LC cũ ở từng đợt sang cấu hình LC cấp hợp đồng.
INSERT OR IGNORE INTO contract_lc_payments(id, contract_id, payment_id)
SELECT 'clp_' || lower(hex(randomblob(16))), p.contract_id, p.id
FROM payments p
JOIN contracts c ON c.id = p.contract_id
WHERE p.use_lc = 1 OR c.lc_mode = 'all';

UPDATE contracts
SET lc_percent = COALESCE((
      SELECT SUM(p.percent)
      FROM payments p
      JOIN contract_lc_payments clp ON clp.payment_id = p.id AND clp.contract_id = contracts.id
    ), 0),
    lc_status = CASE WHEN lc_mode != 'none' THEN 'preparing' ELSE 'not_required' END
WHERE status != 'deleted';

UPDATE contracts
SET lc_mode = CASE
  WHEN EXISTS(SELECT 1 FROM contract_lc_payments clp WHERE clp.contract_id = contracts.id) THEN 'some'
  ELSE 'none'
END;
