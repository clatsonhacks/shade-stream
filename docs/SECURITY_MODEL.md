# Security Model

> Testnet only. Do not use with real funds. No mainnet custody claim. Not audited.

## Trust assumptions (spec §16.2)

- **CCTP** inherits Circle attester trust.
- **RFQ** depends on the solver quote/fill protocol and on-chain atomic settlement
  (`rfq_settle_atomic_swap`); the relayer cannot mutate recipient/amount/asset/
  price/fee (solver-signed swap terms + proof-bound quote).
- **MPC dev mode is not a distributed trust model.** Independent-node mode
  (`node-server.ts` ×3 + `coordinator-server.ts`) requires independent operators.
- **ZK proofs prove only the statements bound in their public signals.**

## What is enforced (fail-closed)

- MPC settlement: mandatory verifier + proof (B1), canonical ASP root + deadline
  (B2), distinct-signer threshold, batch-hash binding. Same-asset and priced
  cross-asset both require their dedicated verifier.
- Asset binding: the note commitment binds `assetId`; withdraw/deposit/transfer/
  MPC enforce it. `withdraw_cctp` is USDC-only (asserts the note asset == USDC).
- Per-asset reserve invariant: `adjust_note_supply` rejects negative supply and
  any change making `note_supply > vault_balance`.
- RFQ atomic swap: all-or-nothing USDC→XLM with fixed-point price binding.
- CCTP: V2 footgun guards (G/M/C, mint/caller = forwarder, 6↔7 scaling + dust,
  duplicate nonce, unsupported outbound domain).
- Compliance ALLOW-set membership: withdraw / private_transfer / MPC all require
  the spender's label to be a member of the canonical association tree (hard
  equality, no zero-bypass).
- Shade View: view-key reports are data-only (no note secrets / spend material);
  the signature covers the whole report; only opt-in amounts appear.
- **Root integrity (spec §13, Option A).** The pool OWNS its Merkle tree on-chain
  via LeanIMT (the same tree the circuits + coinutils use). Every insert path
  (`receive_cctp_deposit`, `private_transfer_settle`, `mpc_settle`,
  `mpc_settle_priced`) computes the new root by appending the commitment(s)
  itself (`append_leaf`) and rejects a caller-supplied `new_root` that doesn't
  match (`RootMismatch`). No entrypoint trusts an unverified root; a forged root
  is rejected and a withdraw against a never-stored root fails.

## Known open items (NOT yet closed)

These are tracked honestly and are the remaining work before an exit-gate claim:

1. **Compliance DENY-set — spend-path integration (spec §11.1).** Allow-set
   membership is enforced on every spend path. The `compliance_membership`
   circuit now implements deny-set NON-membership (sorted deny-tree + adjacent-
   leaf range proof) plus allow-membership and policy binding, and is tested
   (allowed+not-denied verifies; denied / not-allowed / wrong-root fail closed).
   What remains is wiring the deny check into the spend-path circuits
   (withdraw/transfer/MPC) — a breaking public-signal change to those already-
   built circuits — and enforcing a bounded (< 2^252) label range protocol-wide.

2. **Testnet E2E product wiring (spec §12, Phase 8).** The contract primitives,
   circuits, and backend crypto for every flow are built and unit/contract/
   circuit-tested, but the end-to-end testnet product paths are not all wired:
   - the relayer's RFQ job still calls the legacy `rfq_settle`, not
     `rfq_settle_atomic_swap`;
   - `e2e:testnet:all` scenario commands are still `null` (they need deployed
     contracts + funded keys + verifiers redeployed with the current vks).

## Mainnet non-goals (spec §17)

Independent contract + circuit audits, trusted-setup ceremony, admin multisig/
HSM, legal review for remittance, incident playbooks, proof-of-reserves
dashboard, and emergency-pause drills are all out of scope for this testnet
milestone.
