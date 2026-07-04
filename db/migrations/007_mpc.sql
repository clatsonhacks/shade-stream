-- MPC committee tables for Phase 8 private matching.
-- The committee runs batch matching over secret-shared intent amounts,
-- produces threshold-signed match batches that the settlement layer consumes.

CREATE TABLE IF NOT EXISTS mpc_sessions (
  session_id        TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'open',     -- open | matching | signed | failed
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  intent_count      INT NOT NULL DEFAULT 0,
  match_count       INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (intent, user) submitted to the committee.
-- Amount is NOT stored here — it lives only in the encrypted shares.
CREATE TABLE IF NOT EXISTS mpc_intents (
  intent_id             TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES mpc_sessions(session_id),
  user_id               TEXT,                          -- optional link to auth user
  input_asset           TEXT NOT NULL,
  output_asset          TEXT NOT NULL,
  expiry_ledger         BIGINT NOT NULL,
  policy_id             TEXT NOT NULL,
  note_nullifier        TEXT NOT NULL,
  note_commitment       TEXT NOT NULL,
  recipient_commitment  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | matched | unmatched | expired
  matched_with          TEXT REFERENCES mpc_intents(intent_id),
  matched_amount_7dp    TEXT,                           -- set after matching
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each encrypted share from the user, addressed to one committee node.
-- The node decrypts in-memory only during a matching round.
CREATE TABLE IF NOT EXISTS mpc_intent_shares (
  id              BIGSERIAL PRIMARY KEY,
  intent_id       TEXT NOT NULL REFERENCES mpc_intents(intent_id),
  node_id         TEXT NOT NULL,
  ciphertext      TEXT NOT NULL,   -- hex
  nonce           TEXT NOT NULL,   -- hex
  sender_pubkey   TEXT NOT NULL,   -- ephemeral X25519 pubkey, hex
  delivered       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (intent_id, node_id)
);

-- Completed signed match batches.
CREATE TABLE IF NOT EXISTS mpc_batches (
  batch_id           TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES mpc_sessions(session_id),
  batch_hash         TEXT NOT NULL,   -- sha256 of canonical match JSON
  match_count        INT NOT NULL,
  matches_json       JSONB NOT NULL,
  signatures_json    JSONB NOT NULL,  -- [{nodeId, signingPubkey, signature}]
  settlement_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | queued | settled | failed
  settled_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-node signature records (denormalized from mpc_batches for easy lookup).
CREATE TABLE IF NOT EXISTS mpc_batch_signatures (
  id              BIGSERIAL PRIMARY KEY,
  batch_id        TEXT NOT NULL REFERENCES mpc_batches(batch_id),
  node_id         TEXT NOT NULL,
  signing_pubkey  TEXT NOT NULL,
  signature       TEXT NOT NULL,  -- hex, ed25519
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, node_id)
);

CREATE INDEX IF NOT EXISTS mpc_intents_session ON mpc_intents(session_id);
CREATE INDEX IF NOT EXISTS mpc_intents_status ON mpc_intents(status);
CREATE INDEX IF NOT EXISTS mpc_intents_nullifier ON mpc_intents(note_nullifier);
CREATE INDEX IF NOT EXISTS mpc_shares_intent ON mpc_intent_shares(intent_id);
CREATE INDEX IF NOT EXISTS mpc_batches_session ON mpc_batches(session_id);
CREATE INDEX IF NOT EXISTS mpc_batches_settlement ON mpc_batches(settlement_status) WHERE settlement_status = 'pending';
