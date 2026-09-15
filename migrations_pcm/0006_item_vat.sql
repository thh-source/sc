PRAGMA foreign_keys = ON;

ALTER TABLE contract_items ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0;

UPDATE contract_items
SET vat_rate = COALESCE((
  SELECT c.vat_rate
  FROM contracts c
  WHERE c.id = contract_items.contract_id
), 0);
