# ComplianceMembership

Proves a spender's label satisfies the ASP policy: it IS in the allow tree AND
is NOT in the deny tree, binding the policy id.

## Design

- **Allow membership:** hard-equality Merkle membership of the label in the allow
  tree (`allowRoot`).
- **Deny non-membership:** sorted-tree adjacency. The prover supplies two adjacent
  sorted deny-tree leaves `lo < label < hi`, both proven present; since the tree
  is sorted and they are adjacent, no leaf equal to `label` exists between them,
  so `label` is absent. `Num2Bits` range-bounds `lo`/`label`/`hi` so the
  `LessThan` comparisons are sound (labels must be < 2^252; out-of-range labels
  fail closed).
- **Policy binding:** `policyId` is a public signal bound into the constraints.

Public signals: `[ok, allowRoot, denyRoot, policyId]` (nPublic = 4).

Witnesses are built by `@shade/proving`'s `buildComplianceProof`, using
`coinutils merkle-proof` for the allow/deny Merkle paths. Callers include a `0`
and a large sentinel in the sorted deny set so any in-range label has bounding
leaves. Tests live in `scripts/circuits-test.ts` (allowed+not-denied verifies;
denied, not-allowed, wrong allow-root, wrong deny-root all rejected).

## Integration status

This circuit is a standalone, proven artifact. The live spend-path circuits
(`withdraw_public`, `private_transfer`, `mpc_settlement`) currently enforce
allow-set membership only; wiring the deny check into them is a breaking
public-signal change to those circuits and requires defining labels in the
252-bit range protocol-wide — tracked in `docs/SECURITY_MODEL.md`.
