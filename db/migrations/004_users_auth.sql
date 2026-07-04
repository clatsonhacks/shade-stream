-- PHASE 2 / PHASE 5: wallet-based auth + user storage. Users authenticate by
-- signing a server-issued nonce with their EVM or Stellar wallet; no private keys
-- are ever stored for normal users.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name text,
  email text,
  avatar_url text,
  testnet_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}',
  risk_flags jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Wallet auth nonces (one-time challenge to sign). chain/address identify the
-- wallet; nonce is consumed on successful verify.
CREATE TABLE IF NOT EXISTS auth_nonces (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_type text NOT NULL,             -- 'EVM' | 'STELLAR'
  address text NOT NULL,
  nonce text NOT NULL,
  message text NOT NULL,                 -- exact message the wallet must sign
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_lookup ON auth_nonces(wallet_type, address, nonce);

CREATE TABLE IF NOT EXISTS user_wallets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_type text NOT NULL,             -- 'EVM' | 'STELLAR'
  chain text NOT NULL,                   -- 'arbitrum-sepolia' | 'stellar-testnet'
  address text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_type, address)
);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);

-- Sessions: only the sha256 of the opaque token is stored (the raw token lives in
-- the httpOnly cookie / bearer header on the client).
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_hash ON user_sessions(session_hash);

CREATE TABLE IF NOT EXISTS encrypted_note_backups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commitment text NOT NULL,
  encrypted_payload text NOT NULL,       -- client-side encrypted; server never sees plaintext
  encryption_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, commitment)
);

CREATE TABLE IF NOT EXISTS user_activity (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  tx_hash text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity(user_id, created_at);

-- Link user_id onto user-owned protocol rows (nullable; populated when an
-- authenticated user drives the flow).
ALTER TABLE cctp_deposits  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE note_commitments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE withdrawals    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE intents        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE settlements    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE cctp_exits     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
