-- audit2.md P0 fixes: user-scoping + real backup verification.

-- FIX7: proof jobs are user-owned.
ALTER TABLE proof_jobs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);

-- FIX3: store the client's proof-of-decrypt verification object (no plaintext).
ALTER TABLE note_vaults ADD COLUMN IF NOT EXISTS last_backup_verification jsonb;

-- FIX8: quote acceptances scoped to the accepting user.
ALTER TABLE quote_acceptances ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
