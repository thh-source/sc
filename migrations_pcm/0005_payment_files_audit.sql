PRAGMA foreign_keys = ON;

-- V12: Liên kết hồ sơ yêu cầu của từng đợt thanh toán với file chứng từ đã lưu trên R2.
CREATE TABLE IF NOT EXISTS payment_requirement_documents (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(requirement_id) REFERENCES payment_requirements(id) ON DELETE CASCADE,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(requirement_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_requirement_documents_requirement
  ON payment_requirement_documents(requirement_id);
CREATE INDEX IF NOT EXISTS idx_payment_requirement_documents_document
  ON payment_requirement_documents(document_id);

-- V15: Nhật ký thay đổi. Actor lấy từ Cloudflare Access nếu có.
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'anonymous',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  contract_id TEXT,
  summary TEXT DEFAULT '',
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_contract ON audit_logs(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
