-- Phase A: link RFQ intents to MPC sessions.
-- When POST /v1/intents receives encrypted_shares, the API routes the intent
-- to the MPC committee and records the session here.
-- Settlement (POST /v1/rfq/settle) gates on mpc_session_id IS NULL (solver path)
-- OR mpc_intents.status = 'matched' (MPC path — all three must agree).

ALTER TABLE intents
  ADD COLUMN IF NOT EXISTS mpc_session_id TEXT
    REFERENCES mpc_sessions(session_id);

CREATE INDEX IF NOT EXISTS intents_mpc_session
  ON intents(mpc_session_id)
  WHERE mpc_session_id IS NOT NULL;
