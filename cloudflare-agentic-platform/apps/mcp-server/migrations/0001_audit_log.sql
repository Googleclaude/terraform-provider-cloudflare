CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  tool TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'denied'))
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_log(tool);
