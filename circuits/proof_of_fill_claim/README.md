# ProofOfFillClaim Circuit

Status: **source written** — `main.circom` complete. Needs `.zkey` build once circom + snarkjs are installed.

## What it proves

A solver proves it completed a cross-chain fill without revealing its private key:
1. **Solver identity** — `solverIdHash = Poseidon(solverSecret, 0)` binds the claim to the registered solver without leaking the private key.
2. **Claim deduplication** — `claimId = Poseidon(solverSecret, intentHash, poolId, chainId)` is unique per (solver, intent, pool, chain); the contract rejects duplicate claims.
3. **Fill binding** — `intentHash`, `quoteHash`, `fillReceiptHash`, `destTxHashHash` are all public inputs the contract enforces against the submitted fill data.
4. **Amount range check** — `amount7dp` is range-checked in `[0, 2^128)`.

## Public signals

| Index | Name | Meaning |
|---|---|---|
| [0] | `claimId` | Poseidon(solverSecret, intentHash, poolId, chainId) |
| [1] | `intentHash` | sha256(intent_json)[:31] as field element |
| [2] | `quoteHash` | sha256(quote_json)[:31] |
| [3] | `fillReceiptHash` | sha256(fill_receipt_json)[:31] |
| [4] | `destTxHashHash` | sha256(dest_tx_hash_hex)[:31] — cross-chain execution |
| [5] | `amount7dp` | amount filled; contract checks == accepted quote amount |
| [6] | `deadlineLedger` | fill deadline; contract rejects if expired |
| [7] | `solverIdHash` | sha256(solver_pubkey)[:31]; contract checks vs registered |
| [8] | `policyIdHash` | sha256(policy_id)[:31] |
| [9] | `poolId` | domain separator |
| [10] | `chainId` | domain separator |

## Build

```bash
circom circuits/proof_of_fill_claim/main.circom --r1cs --wasm --sym -o build/proof_of_fill_claim
snarkjs groth16 setup build/proof_of_fill_claim/main.r1cs pot/final.ptau build/proof_of_fill_claim/circuit_0000.zkey
snarkjs zkey contribute build/proof_of_fill_claim/circuit_0000.zkey build/proof_of_fill_claim/circuit_final.zkey
snarkjs zkey export verificationkey build/proof_of_fill_claim/circuit_final.zkey build/proof_of_fill_claim/verification_key.json
```
