# MpcSettlement Circuit

Proves that a two-party MPC committee match is consistent with real deposited notes.

## What it proves

1. **Note membership** — Both input note commitments are leaves in the current Merkle tree (`stateRoot`).
2. **ASP compliance** — Both note labels are members of the association set (`associationRoot`).
3. **Nullifiers** — Domain-separated nullifier hashes are correct: `Poseidon(nullifier, poolId, chainId)`.
4. **Output commitments** — Output note preimages are well-formed via `CommitmentHasher`.
5. **Value conservation** — `matchedAmount ≤ min(valueA, valueB)` and `outValueA + outValueB == 2 × matchedAmount`.
6. **Batch binding** — `batchHashSignal = Poseidon(batchIdField, intentAIdField, intentBIdField, matchedAmount)` ties the proof to the exact committee-signed batch.

## Public signals

| Index | Signal | Description |
|---|---|---|
| 0 | `nullifierHashA` | Domain-sep nullifier for note A (spent on-chain) |
| 1 | `nullifierHashB` | Domain-sep nullifier for note B (spent on-chain) |
| 2 | `outputCommitmentA` | New note commitment for counterparty B |
| 3 | `outputCommitmentB` | New note commitment for counterparty A |
| 4 | `batchHashSignal` | Poseidon batch hash (committee signed this) |
| 5 | `stateRoot` | Merkle root — both notes must be leaves |
| 6 | `associationRoot` | ASP compliance root — both labels must be members |
| 7 | `poolId` | Domain separator |
| 8 | `chainId` | Domain separator |
| 9 | `matchedAmount7dp` | Matched amount (7 decimal places) |
| 10 | `deadlineLedger` | Later of the two intent deadlines |
| 11 | `intentAIdField` | `int(sha256(intentAId)[:31])` |
| 12 | `intentBIdField` | `int(sha256(intentBId)[:31])` |

## Parameters

`MpcSettlement(treeDepth=12, associationDepth=2)` — matches the pool tree and ASP depth used by all other circuits.

## Integration with on-chain `mpc_settle`

The Soroban `mpc_settle` function currently verifies committee threshold signatures directly and trusts the relayer for note values. After this circuit is integrated:

1. Party A and party B each generate an `mpc_settlement` proof off-chain.
2. Relayer submits both proofs + the committee signatures to `mpc_settle_with_proof`.
3. Contract verifies: committee sig threshold + both ZK proofs → spend both nullifiers + insert both output commitments.

This upgrades MPC settlement from "committee-trusted" to "committee + ZK verified".

## Compile

```sh
circom circuits/mpc_settlement/main.circom \
  --r1cs --wasm --sym \
  -o circuits/mpc_settlement/build/
```
