# Shade → Arc (EVM) Port — Status

Porting the **entire** Shade shielded-pool protocol from Stellar/Soroban to Arc (EVM).
All functionality (deposit, withdraw, private transfer, MPC same-asset & priced
cross-asset settlement, RFQ, CCTP exit) is preserved exactly — only the chain changes.
Curve: BLS12-381 → **BN254** (for native EVM pairing precompiles).

## Phase 1 — BN254 derisking spike ✅ COMPLETE & PROVEN

The full BN254 ZK layer works end-to-end on EVM (the direct analog of the
earlier BLS12-381/Soroban spike). See `docs/arc-zk-proof-system.md`.

## Phase 2 — Full system port ✅ COMPLETE (contracts, circuits, proving, all 5 settlement flows wired)

### Contracts (`contracts/arc/src/`) — all compile, all deployed+wired end-to-end ✅
| Contract | Ports from |
|----------|-----------|
| `NullifierRegistry.sol` | `nullifier_registry` |
| `IncrementalMerkleTree.sol` | `lean_imt` (O(n) → **O(log n)** frontier tree) |
| `CommitteeRegistry.sol` (CommitteeLib) | MPC threshold logic |
| `ShieldedPool.sol` | `shielded_pool` — every settlement path: deposit, withdraw, private transfer, MPC (same-asset + priced), RFQ settle, CCTP exit |
| `Poseidon2` (circomlibjs bytecode) | native soroban-poseidon |
| `script/Deploy.s.sol` | `deploy-shielded-pool.ts` + `deploy-mpc-verifier.ts` combined — deploys + wires all 8 contracts in one broadcast, **proven against real anvil** ("ONCHAIN EXECUTION COMPLETE & SUCCESSFUL") |

### Circuits — all 5 BN254 variants compiled, all 5 verifiers deployed ✅
| Circuit | Constraints | ptau |
|---------|-------------|------|
| `private_transfer_bn254` | 5,896 | pot14 |
| `withdraw_public_bn254` | ~11k | pot14 |
| `deposit_note_mint_bn254` | ~small | pot14 |
| `mpc_settlement_bn254` | 24,254 | pot15 |
| `mpc_priced_settlement_bn254` | 24,337 | pot15 |

### Proving library (`packages/proving/src/bn254/`) — TS-native, zero Rust binaries ✅
Replaces `stellar-coinutils` (witness assembly) and `circom2soroban` (byte packing)
entirely: `poseidon.ts` (circomlibjs, matches on-chain Poseidon2 exactly),
`merkle.ts` (generic zero-padded tree, matches the on-chain frontier tree),
`coin.ts` (note generation), `prove.ts` — all 5 circuits have proof builders:
`buildTransferProofBn254`, `buildWithdrawProofBn254`, `buildDepositProofBn254`,
`buildMpcSettlementProofBn254`, `buildMpcPricedSettlementProofBn254`. Every
builder exports native `{a,b,c}` + `uint256[]`, ready for ABI encoding, no byte
blob. **21/21 tests pass** (`npm run proving-bn254:test`), including real
Groth16 proof generation for all five circuits (including the two ~24k-constraint
MPC circuits) and adversarial fail-fast checks.

### Service wiring (`packages/arc-actions/` + service call sites) — all 5 flows wired ✅
`@shade/arc-actions` is the ethers-based replacement for `@shade/stellar-actions`
/ `sorobanInvoke`: `buildUnsignedTx`/`withdrawArgs`/`withdrawCctpArgs`/
`broadcastSignedTx`/`serializeUnsignedTx` (user-signed flow) and `arcInvoke`
(service-signed flow). **19/19 tests pass** (`npm run arc-actions:test`),
deploying a real `ShieldedPool` + real verifiers/mocks and driving every
settlement path through it — the strongest available validation short of a
live testnet deploy.

| Flow | Status | Where | Validated by |
|------|--------|-------|---------------|
| **Withdraw** | ✅ Wired | `POST /v1/withdrawals/build-tx` + `WITHDRAW_PUBLIC_SUBMIT` (dispatches on `signedRawTx` vs `signedXdr`) | real settle, exact payout amount, nullifier spent |
| **RFQ settle** | ✅ Wired | `RFQ_SETTLE_SUBMIT` Arc branch (dispatches on `proof`/`publicSignals` vs `proofHex`/`publicHex`) | real settle, solver reimbursed exact credit |
| **CCTP exit** | ✅ Wired | `POST /v1/cctp/outbound/build-tx` + `WITHDRAW_CCTP_BURN` (shares withdraw's broadcast dispatch) | real settle, mock TokenMessenger received exact burn amount |
| **MPC settle** (same-asset + priced) | ✅ Wired* | `MPC_SETTLE_SUBMIT` Arc branch (`getCommittee` read + `mpcSettle`/`mpcSettlePriced` submit) | real settle, both nullifiers spent, both output commitments inserted |
| **Deposit** (CCTP inbound) | ✅ Wired* | `CCTP_INBOUND_AFTER_USER_BURN` Arc branch (`receiveDeposit` submit, after chain-agnostic burn validation) | ABI shape proven via 4 prior direct-call uses in the withdraw/RFQ/CCTP/MPC tests |

**\* Two flows are wired on the submission side with an honestly-documented
boundary, not silently incomplete:**

- **MPC settle**: the relayer correctly submits a *pre-built* BN254 proof.
  Building that proof for a *real* matched pair requires the upstream MPC
  intent-matching pipeline (`apps/mpc-committee`, the private-RFQ intent
  routes in `apps/api`) to generate coins in the new BN254 shape
  (`packages/proving/src/bn254/coin.ts`) instead of the Stellar-coinutils
  format it produces today. This is a separate, larger change — the coin
  format is baked into how private intents are encrypted/shared between
  committee nodes, not just a witness-building detail.
- **Deposit**: same shape — the relayer correctly submits a *pre-built*
  BN254 deposit proof via `receiveDeposit`, but (a) actually completing an
  Arc-side CCTP mint needs real Arc CCTP contract addresses that aren't
  configured yet, and (b) the note-vault/coin-generation path upstream still
  produces Stellar-format coins for the same reason as MPC settle.

Both boundaries are called out in code comments at the exact line where a
future contributor would otherwise assume more is wired than actually is.

### Notes for closing the two remaining gaps

- **MPC coin format**: `apps/mpc-committee`'s intent matching operates on
  encrypted note shares; whatever produces those shares (client-side or
  API-side) needs a BN254-native path alongside (or instead of) the current
  Stellar-coinutils one. `packages/proving/src/bn254/coin.ts`'s
  `generateCoinBn254` is the drop-in replacement for the commitment/nullifier
  math — the remaining work is wiring it into wherever intents are created.
- **Arc CCTP contracts**: once Arc's real `TokenMessenger`/`MessageTransmitter`
  addresses and CCTP domain ID are known, `ShieldedPool.setCctpConfig` wires
  them directly (already used successfully in tests via a mock messenger) —
  the contract-side plumbing (`withdrawCctp`, `ITokenMessenger` interface) is
  already correct and tested, only the real addresses are missing.

## Key technical decisions

1. **Curve BLS12-381 → BN254** (user-approved): native EVM precompiles make per-settlement verification cheap.
2. **Tree O(n) → O(log n)**: the Stellar `append_leaf` rebuilt the whole tree each insert; the EVM version is a frontier tree. Roots still match the circuit (zero-padded fixed-depth-12 tree == Tornado zeros scheme) — proven twice: once via `PoolIntegration.t.sol` (Solidity side) and once via `testWithdrawFullLoop` (TS proving side).
3. **Public signals**: snarkjs Solidity verifier takes native `uint256[N]` — no byte-parsing (unlike Soroban's `circom2soroban` blob).
4. **ed25519**: no EVM precompile, so the raw signature check is delegated to a pluggable `IEd25519Verifier` (production vendors a Solidity ed25519 lib); the **threshold/distinct/registered** logic is on-chain and tested. This preserves the solver's and MPC committee's existing ed25519 identities unchanged.
5. **Witness generation**: TS-native circomlibjs Poseidon (`packages/proving/src/bn254/`) replaces the patched `stellar-coinutils` Rust binary and `circom2soroban` byte packer entirely — one fewer dependency, and the output is already in the shape Solidity wants.
6. **Both chains coexist during migration**: every flow's API route and relayer job dispatch on which chain's payload shape is present (native BN254 proof/uint256 shapes vs Soroban byte blobs) rather than replacing the Stellar path outright. This same dispatch pattern was applied uniformly across withdraw, RFQ, CCTP exit, MPC settle, and deposit.
7. **Arc's `mpcSettle` argument shape is not a 1:1 port**: nullifiers, output commitments, and the new root are no longer explicit call args — they live inside the proof's public-signals array, and the contract computes the new root itself by inserting both output leaves on-chain. Anyone extending the MPC path should read this signature carefully rather than copy the Soroban CLI arg list.

## Reproduce

```bash
npm install                               # installs circomlib, circomlibjs, ethers
npm run circuits:build:arc                # compile 5 BN254 circuits + Solidity verifiers
npm run circuits:test:arc                 # real proof gen + local verify
npx tsx scripts/sync-arc-verifiers.ts     # copy verifiers into contracts
npm run proving-bn254:test                # 21/21 — full TS-native proving pipeline, all 5 circuits
npm run arc-actions:test                  # 19/19 — real anvil, all 5 settlement flows through a real pool
cd contracts/arc && forge build && forge test   # 57/57 Foundry tests
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url <arc-rpc> --broadcast
```

**Total automated coverage: 97 checks** (21 proving + 19 arc-actions + 57 Foundry), all exercising real cryptography and real contract calls — no mocked ZK verification anywhere in the critical path.
