# RemitSettlement Circuit

Status: **source written** — `main.circom` complete. Needs `.zkey` build once circom + snarkjs are installed.

## What it proves

A user privately remits from their shielded note to a fiat payout corridor:
1. **Note ownership** — the commitment is in the Merkle state tree (Merkle proof).
2. **Nullifier validity** — domain-separated `Poseidon(nullifier, poolId, chainId)` prevents double-spend.
3. **Compliance** — `associationRoot` membership is enforced with HARD equality (same as withdraw_public — no zero-bypass).
4. **Remittance binding** — `quoteIdHash`, `corridorHash`, `recipientHash` are bound as public inputs the contract enforces against the SEP-38 anchor quote.
5. **Amount constraint** — `remitAmount7dp <= note.value`; both range-checked in `[0, 2^128)`.

## Public signals

| Index | Name | Meaning |
|---|---|---|
| [0] | `nullifierHash` | Poseidon(nullifier, poolId, chainId) |
| [1] | `operationType` | REMIT_SETTLE = 5; contract enforces this value |
| [2] | `remitAmount7dp` | amount to remit; contract verifies <= note value |
| [3] | `recipientHash` | sha256(recipient_bank_account_hash)[:31] |
| [4] | `quoteIdHash` | sha256(sep38_quote_id)[:31] — anchor quote binding |
| [5] | `corridorHash` | sha256(corridor_id)[:31]; e.g. sha256("MXN:STP") |
| [6] | `deadlineLedger` | quote validity window; contract rejects if expired |
| [7] | `stateRoot` | Merkle root of the commitment tree |
| [8] | `associationRoot` | ASP allow-set root (hard equality enforced) |
| [9] | `policyIdHash` | sha256(policy_id)[:31] |
| [10] | `poolId` | domain separator |
| [11] | `chainId` | domain separator |

## Build

```bash
circom circuits/remit_settlement/main.circom --r1cs --wasm --sym -o build/remit_settlement
snarkjs groth16 setup build/remit_settlement/main.r1cs pot/final.ptau build/remit_settlement/circuit_0000.zkey
snarkjs zkey contribute build/remit_settlement/circuit_0000.zkey build/remit_settlement/circuit_final.zkey
snarkjs zkey export verificationkey build/remit_settlement/circuit_final.zkey build/remit_settlement/verification_key.json
```
