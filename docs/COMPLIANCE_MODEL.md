# Compliance / ASP Model — Decision

Phase 6 resolves the compliance-registry question deferred from Phase 2/4
(invariant #7: "only ASP-eligible parties can open/settle").

## Decision: the pool's `associationRoot` is the single canonical source of truth

`ShieldedPool.associationRoot` (settable by admin via `setAssociationRoot`) is
the one authoritative ASP (Association Set Provider) allow-list root. **No
separate `ComplianceRegistry` contract is wired in**, and the deprecated Soroban
`compliance_registry` concept is retired for the Arc port. Rationale:

1. **The circuits already bind exactly this.** Every spend circuit
   (`withdraw_public`, `private_transfer`, `deposit_note_mint`,
   `mpc_settlement`, `mpc_priced_settlement`, `stream_open`, `stream_settle`)
   exposes an `associationRoot` public signal, and every settlement path checks
   it `== pool.associationRoot` (or, for stream settle, the same value the
   escrow reads from the pool). A separate registry would be a second source of
   truth the ZK layer doesn't consume — pure risk, no benefit.

2. **A full registry (allow + deny roots, validity windows) is premature.** The
   circuits only enforce *allow-membership* today. Deny-set *non*-membership
   needs a sorted deny-tree + an in-circuit exclusion proof — a separate,
   unbuilt circuit (see `circuits/compliance_membership/README.md` on the
   Stellar side). Until that exists, a registry storing `denyRoot`/validity
   windows would hold data nothing can enforce.

3. **It matches the proven reality.** On Stellar the pool already kept its own
   `ASSOCROOT` and never called the standalone `compliance_registry`; the Arc
   port preserves that behavior rather than inventing new unenforced machinery.

## What Phase 6 added

`ShieldedPool` gains `associationRootVersion` (a counter incremented on every
`setAssociationRoot`, emitted in the `AssociationRootSet(root, version)` event).
This makes the active compliance policy **auditable and referenceable**: a
receipt or audit can pin exactly which policy root/version was live when a
channel settled, without introducing a separate registry contract.

## Deferred (the honest future path)

- **Deny-set enforcement**: build the sorted-deny-tree exclusion circuit, add a
  `denyRoot` public signal to the spend circuits, and check non-membership
  in-circuit. Only *then* does a richer on-chain policy store (allow + deny +
  validity windows) earn its complexity — at which point `associationRoot`
  becomes `allowRoot` and a `denyRoot` sibling joins it, still on the pool, still
  the single source of truth.
- **Policy validity windows** (valid-from / valid-until): trivial to add to the
  pool alongside the version counter if/when a use case needs time-boxed policies.

This is a deliberate "stage compliance honestly" call (matching the architecture
bible's principle): enforce what the ZK layer can actually prove, make the active
policy auditable, and don't ship unenforced compliance theater.
