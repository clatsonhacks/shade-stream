# RFQ — Atomic USDC → XLM

> Testnet only; no mainnet claim. RFQ is the current USDC→XLM route (MPC priced
> cross-asset is a later phase). Spec: `shade_testnet_e2e_agent_build_spec.md` §7.

## Guarantee

`shielded_pool::rfq_settle_atomic_swap` settles a private USDC note into public
XLM for the user in **one transaction, all-or-nothing** (spec §7.3): the user's
USDC nullifier is spent, the user receives XLM `>= min_output` from pool
reserves, and the solver is credited USDC — or the whole tx reverts and the
nullifier is never spent.

## Design

Token-movement model: **Option A** (pool holds both USDC and XLM reserves) —
feasible now that the pool is multi-asset (asset registry). The output XLM is
delivered from pool reserves in the same call, so atomicity is the Soroban
transaction boundary (any panic reverts everything).

The proof is the existing `withdraw_public` circuit with
`operationType = RFQ_ATOMIC_SWAP` and the note's `assetId` (= input asset) bound
into the commitment. Output terms are bound by the **solver's ed25519 signature**
over
`swap_hash = sha256(quoteHash ‖ outputAssetId ‖ quotedOutput ‖ minOutput ‖ priceScaled ‖ recipientHash)`,
and the proof binds `quoteHash`, so the note is tied to the accepted quote and a
relayer cannot change the recipient, amount, asset, price, or fee after signing.

## Enforced rules

- Solver must be in the on-chain authorized-solver registry.
- `quotedOutput >= minOutput > 0`; `priceScaled > 0`.
- Fixed-point price (spec §7.6, `PRICE_SCALE = 1_000_000_000`):
  `quotedOutput == floor(inputAmount * priceScaled / PRICE_SCALE)`.
- Output asset must be registered and **differ** from the input asset.
- Quote / intent / fill-receipt hashes match the proof's public signals.
- Domain (poolId/chainId) + canonical ASP root + known state root; deadline not
  expired; proof verifies; nullifier spent exactly once (NullifierRegistry).
- USDC note supply is debited by the input amount.

## Tests

Contract (`shielded_pool/src/tests.rs`): happy swap delivers XLM + credits solver
+ debits supply; and rejects — relayer amount mutation (breaks the solver sig),
under-delivery (`quoted < min`), wrong price (violates the fixed-point rule),
same-asset (output == input), unauthorized solver. Double-spend is enforced by
the NullifierRegistry (its own tests).

Backend quote-signing/expiry/idempotency and the testnet E2E
(`private USDC note -> RFQ -> user public XLM >= min_output`) run in the RFQ
service tests and the Phase 8 acceptance suite.
