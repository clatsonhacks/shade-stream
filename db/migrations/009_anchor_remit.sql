-- Shade Remit / anchor payout tables (SEP-38 / SEP-31 lifecycle).
-- anchor_quotes tracks quote requests; anchor_payouts tracks payout transactions.
-- Both proxy to an external ANCHOR_API_BASE (MoneyGram / any SEP-38 provider).

CREATE TABLE IF NOT EXISTS anchor_quotes (
  quote_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT        NOT NULL,
  asset                 TEXT        NOT NULL,
  amount_7dp            TEXT        NOT NULL,
  destination_currency  TEXT        NOT NULL,
  destination_country   TEXT        NOT NULL,
  anchor_quote_id       TEXT,
  status                TEXT        NOT NULL DEFAULT 'quoted',
  raw                   JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anchor_payouts (
  payout_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT        NOT NULL,
  quote_id              TEXT        NOT NULL,
  settlement_id         TEXT        NOT NULL,
  anchor_transaction_id TEXT,
  status                TEXT        NOT NULL DEFAULT 'pending',
  raw                   JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anchor_quotes_user_id ON anchor_quotes(user_id);
CREATE INDEX IF NOT EXISTS anchor_payouts_user_id ON anchor_payouts(user_id);
CREATE INDEX IF NOT EXISTS anchor_payouts_settlement_id ON anchor_payouts(settlement_id);
