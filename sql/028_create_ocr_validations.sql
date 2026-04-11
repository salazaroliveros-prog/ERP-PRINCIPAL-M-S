CREATE TABLE IF NOT EXISTS ocr_validations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  purchase_order_id TEXT,
  invoice_number TEXT,
  supplier TEXT,
  detected_total NUMERIC,
  score INTEGER NOT NULL,
  result_status TEXT NOT NULL,
  decision TEXT NOT NULL,
  auto_apply BOOLEAN NOT NULL DEFAULT FALSE,
  auto_action_status TEXT,
  auto_action_summary TEXT,
  checks JSONB,
  recommendations JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ocr_validations_created_at_idx
  ON ocr_validations (created_at DESC);

CREATE INDEX IF NOT EXISTS ocr_validations_project_id_idx
  ON ocr_validations (project_id);

CREATE INDEX IF NOT EXISTS ocr_validations_purchase_order_id_idx
  ON ocr_validations (purchase_order_id);
