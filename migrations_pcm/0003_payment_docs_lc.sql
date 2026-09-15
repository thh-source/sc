PRAGMA foreign_keys = ON;

ALTER TABLE contracts ADD COLUMN lc_mode TEXT NOT NULL DEFAULT 'none';

ALTER TABLE payments ADD COLUMN use_lc INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN lc_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE payments ADD COLUMN lc_no TEXT DEFAULT '';
ALTER TABLE payments ADD COLUMN lc_open_date TEXT;
ALTER TABLE payments ADD COLUMN lc_expiry_date TEXT;
ALTER TABLE payments ADD COLUMN lc_note TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS payment_requirements (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  document_code TEXT NOT NULL,
  document_label TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  UNIQUE(payment_id, document_code)
);

CREATE INDEX IF NOT EXISTS idx_payment_requirements_payment ON payment_requirements(payment_id);
