PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS delivery_items (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  contract_item_id TEXT NOT NULL,
  planned_quantity REAL NOT NULL DEFAULT 0,
  received_quantity REAL NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY(contract_item_id) REFERENCES contract_items(id) ON DELETE CASCADE,
  UNIQUE(delivery_id, contract_item_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_items_contract_item ON delivery_items(contract_item_id);
