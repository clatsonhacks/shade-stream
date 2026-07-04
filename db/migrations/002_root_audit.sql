-- P1.9 root-auditor: persist each audit run and any mismatch findings.
-- The auditor recomputes the lean-imt commitment root off-chain and compares it
-- to the root the registrar submitted on-chain; a divergence is critical.

CREATE TABLE IF NOT EXISTS root_audit_runs (
  run_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_contract text NOT NULL,
  leaf_count bigint NOT NULL,
  recomputed_root text NOT NULL,
  onchain_root text NOT NULL,
  source text NOT NULL,                 -- where commitments came from: 'events' | 'db'
  status text NOT NULL,                 -- 'OK' | 'ROOT_MISMATCH_CRITICAL'
  git_commit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS root_audit_findings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id uuid NOT NULL REFERENCES root_audit_runs(run_id) ON DELETE CASCADE,
  severity text NOT NULL,               -- 'CRITICAL' | 'WARN'
  code text NOT NULL,                   -- e.g. 'ROOT_MISMATCH_CRITICAL'
  detail text NOT NULL,
  recomputed_root text,
  onchain_root text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_root_audit_runs_status ON root_audit_runs(status);
CREATE INDEX IF NOT EXISTS idx_root_audit_findings_run ON root_audit_findings(run_id);
