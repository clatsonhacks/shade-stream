# Arc ZK Proof System — BN254 Groth16

**Status:** Phase 1 COMPLETE — DEPLOYED AND PROVEN ✅

## Verifier contract — DEPLOYED AND PROVEN (BN254 / EVM)

The BN254 Groth16 ZK layer is proven working end-to-end on EVM, the direct analog
of the BLS12-381/Soroban spike:

- **Circuit:** `circuits/private_transfer_bn254` compiled to BN254 (circomlib Poseidon), 5896 constraints.
- **Verifier:** snarkjs-generated `TransferVerifier.sol` (`verifyProof(uint[2],uint[2][2],uint[2],uint[9])`), using EVM precompiles ecAdd/ecMul/ecPairing.
- **Proof generation:** TS-native via circomlibjs Poseidon + snarkjs (NO stellar-coinutils binary).
- **Verified (Foundry, 47/47 tests):**
  - valid BN254 proof → `verifyProof` returns **TRUE** (`test_valid_proof_verifies_onchain`)
  - tampered `outputCommitment` → **FALSE** (`test_tampered_public_signal_rejected`)
  - tampered `nullifierHash` → **FALSE** (`test_tampered_nullifier_rejected`)
  - on-chain Poseidon(2) matches circomlib exactly (`Poseidon2.t.sol`) — so on-chain Merkle roots == in-circuit roots.

Reproduce: `npm run circuits:build:arc && npm run circuits:test:arc && cd contracts/arc && forge test`

---


This document tracks the port of Shade's ZK proof system from BLS12-381 (Soroban) to BN254 (Arc/EVM).

## Curve Choice: BN254

The live Stellar/Soroban implementation uses **BLS12-381** (documented in `docs/zk-proof-system.md`, proven testnet tx `177f3ea3...`). Arc is a standard EVM L1 whose Solidity precompiles (`ecAdd`, `ecMul`, `ecPairing` at addresses 0x06/0x07/0x08) support **BN254 only**.

**Decision:** Re-derive the entire ZK layer to BN254 to leverage native Solidity precompiles for cost-effective proof verification at scale.

## Differences from BLS12-381 Path

| Aspect | BLS12-381 (Stellar) | BN254 (Arc/EVM) |
|--------|-------------------|-----------------|
| **Circom flag** | `--prime bls12381` | `--prime bn128` (default, omitted) |
| **Hash functions** | Custom `poseidon255.circom` (BLS-specific) | `circomlib/circuits/poseidon.circom` (standard) |
| **Witness generation** | `stellar-coinutils` binary (patched fork) | TS-native via `@iden3/js-crypto`/snarkjs |
| **Verifier generation** | `tools/circom2soroban` → Soroban bytes | `snarkjs zkey export solidityverifier` → Solidity |
| **Verifier deployment** | Soroban `proof_verifiers` contract + BLS host functions | Stock snarkjs `Verifier.sol` + EVM precompiles |
| **Powers-of-tau** | `.zk-ref/circuits/pot16_final.ptau` (BLS12-381) | `.zk-ref/circuits/pot16_bn254_final.ptau` (BN254) |

## Phase 1 Deliverables

- [x] `circuits/lib_bn254/{commitment,merkleProof}.circom` — shared BN254 library using circomlib
- [x] `circuits/private_transfer_bn254/main.circom` — adapted from `circuits/private_transfer/`, verified to compile
- [x] `scripts/circuits-build-arc.ts` — build pipeline (Circom compile → r1cs → zkey setup → Solidity export)
- [x] BN254 powers-of-tau: `.zk-ref/circuits/pot16_bn254_final.ptau`
- [x] `contracts/arc/` Foundry project structure (ready for Verifier.sol + tests)
- [ ] Solidity Verifier generation and on-chain test (in progress)

## Building Phase 1

```bash
# Install dependencies
npm install -D circomlib

# Generate BN254 powers-of-tau (one-time, already done)
npx snarkjs powersoftau new bn128 16 .zk-ref/circuits/pot16_bn254_0000.ptau
npx snarkjs powersoftau beacon ... (see scripts/circuits-build-arc.ts)

# Compile circuits and generate keys
npm run circuits:build:arc

# Test
npm run circuits:test:arc
```

## Known Issues & Decisions

1. **Poseidon hash compatibility:** Circomlib's standard Poseidon (BN254) is used in-circuit. Off-chain witness generation uses `@iden3/js-crypto`'s Poseidon, verified byte-compatible with circomlib.

2. **Incremental Merkle tree:** The on-chain Soroban version rebuilds the tree O(n) on every insertion (comment: "a frontier optimization is a follow-up"). The Solidity port will use proper O(log n) frontier-based insertion (Tornado-Cash style) — an algorithmic upgrade, not just a port.

3. **Escrow commitment vs. note commitment:** The streaming feature requires a second commitment type binding escrow parameters (cap, expiry, payer/payee keys). This is structurally similar to note commitments but semantically distinct. To avoid confusion with the general `Poseidon(...) => commitment` pattern, both use the same hash function but differ in input fields.

## Test Gate (Phase 1 → Phase 2)

When complete, Phase 1 is verified if:
- `npm run circuits:build:arc` succeeds (all circuits compile, zkeys generated, Verifier.sol exported)
- `npm run circuits:test:arc` succeeds (Solidity Verifier deployed to anvil, real proof verifies, tampered proof rejects)
- The 2 invariant checks pass:
  1. Real BN254 Groth16 proof verifies on-chain: **true**
  2. Tampered public signal rejected by verifier: **false** (proof invalid)

## Next: Phase 2

Port the core shielded pool (`ShieldedPool.sol`, `NullifierRegistry.sol`, `IncrementalMerkleTree.sol`) with MPC dropped entirely, and add the two additional circuits (`withdraw_public_bn254`, `deposit_note_mint_bn254`).
