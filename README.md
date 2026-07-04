<img width="955" height="191" alt="Screenshot 2026-07-03 at 10 45 08 PM" src="https://github.com/user-attachments/assets/4477b1e7-39fc-4500-85d1-8f460d2ce65b" />

> **Private, cross-chain USDC settlement.** Native USDC moves between **Arbitrum** and
> **Stellar** with Circle **CCTP** (burn-and-mint, no wrapped assets). On Stellar, funds live
> inside a single Soroban **shielded-pool** contract as private note commitments. Users spend
> notes by generating **Groth16 / BLS12-381 zero-knowledge proofs** that are verified
> **on-chain**, while an on-chain **nullifier registry** makes every note spend-once.

<p align="center">
  <b>ZK-private</b> &nbsp;•&nbsp; <b>Cross-chain (CCTP)</b> &nbsp;•&nbsp; <b>On-chain proof verification</b> &nbsp;•&nbsp; <b>Non-custodial</b> &nbsp;•&nbsp; <b>Selective disclosure</b>
</p>

<p align="center">
  <code>Stellar Soroban</code> · <code>Arbitrum Sepolia</code> · <code>Circle CCTP v2</code> · <code>Groth16 / BLS12-381</code> · <code>Poseidon Lean IMT</code> · <code>TypeScript monorepo</code>
</p>

---

## Table of Contents

- [What is Shade](#what-is-shade)
- [Why it matters](#why-it-matters)
- [How it works (high level)](#how-it-works-high-level)
- [The settlement flows](#the-settlement-flows)
- [Zero-knowledge proof system](#zero-knowledge-proof-system)
- [Deployed contracts & addresses](#deployed-contracts--addresses)
- [System architecture](#system-architecture)
- [The shielded pool contract](#the-shielded-pool-contract)
- [Repository layout](#repository-layout)
- [Tech stack](#tech-stack)
- [The web app](#the-web-app)
- [API surface](#api-surface)
- [Getting started](#getting-started)
- [Security model](#security-model)
- [Honest status & limitations](#honest-status--limitations)

---

## What is Shade

Shade is a **private cross-chain USDC settlement protocol**. It lets a user shield native USDC
from Arbitrum into a private balance on Stellar, move value privately, and exit back to native
USDC on Arbitrum — with **every fund-moving operation gated by a real zero-knowledge proof that
is verified on-chain by a Soroban verifier contract**.

The design has three non-negotiable properties, all enforced in code:

1. **Secrets never touch the server.** Note preimages and the vault master key are generated and
   held in the browser. The backend only ever stores encrypted ciphertext, wrapped keys, and
   public protocol data (commitments, nullifiers, tx hashes). Any request carrying a plaintext
   note/secret field is rejected server-side.
2. **Everything security-critical is on-chain.** Proof verification, nullifier double-spend
   prevention, fund release, Merkle-tree append, and every recipient/amount/fee/deadline binding
   are enforced by Soroban contracts — not by the backend.
3. **Native assets only.** USDC crosses chains via Circle CCTP burn-and-mint. There are **no
   wrapped tokens, no bridges holding custody, no synthetic IOUs.**

---

## Why it matters

Public blockchains leak your entire financial history by default. Shade gives users a
**private balance backed by real, natively-minted USDC** and cryptographic (not custodial)
guarantees:

- **Privacy without trust.** Amounts and links between deposits and withdrawals are hidden inside
  Poseidon note commitments; validity is proven with zero-knowledge, not asserted by an operator.
- **Cross-chain, natively.** CCTP moves *real* USDC — burned on one chain, minted on the other —
  so users are never exposed to wrapped-asset or bridge-custody risk.
- **Compliance-ready.** The **Shade View** selective-disclosure reporter lets a user produce a
  signed, verifiable receipt of *chosen* transactions for a bank or auditor — privacy by default,
  disclosure on demand.
- **Solver-powered swaps.** An RFQ layer lets solvers front real fills (e.g. USDC→XLM) and get
  reimbursed on-chain against a ZK proof plus a signed quote, with an atomic all-or-nothing path.

---

## How it works (high level)

<img width="1695" height="928" alt="shade" src="https://github.com/user-attachments/assets/8b97f9e9-66b5-4fab-9759-b3c4d892c3e3" />

A note is a **Poseidon commitment** of the form
`Poseidon(Poseidon(assetId, value, label), Poseidon(nullifier, secret))` — asset-bound, so the
pool can never be tricked into releasing the wrong asset. Spending a note reveals only a
**nullifier hash** `Poseidon(nullifier, poolId, chainId)` (domain-separated, so it can't be
replayed on another pool or chain) and a zk-SNARK proving the note exists in the tree and the
spend is valid. The `NullifierRegistry` records the nullifier so it can never be spent again.

---

## The settlement flows

All flows are implemented end-to-end and verified on Stellar testnet with real on-chain
transactions.

| # | Flow | What happens |
|---|---|---|
| 1 | **CCTP Inbound (Shield)** | User signs a real Arbitrum `depositForBurnWithHook`. Circle attests the burn. The relayer calls `mint_and_forward` on Stellar, generates a `DepositNoteMint` proof, and the pool verifies it and appends the note commitment on-chain. USDC → private note. |
| 2 | **ZK Withdrawal** | User proves ownership of a note (`withdraw_public` circuit), signs the Soroban `withdraw` XDR, and the pool verifies the proof, spends the nullifier, and releases public USDC to a Stellar address. |
| 3 | **Private Transfer** | Spend a note → mint a new hidden-amount output note. Value conservation is enforced *inside* the circuit; no public funds move. |
| 4 | **RFQ / Swap** | A solver fronts a **real Arbitrum USDC fill**; the pool reimburses the solver on-chain against a ZK proof + an Ed25519-signed quote. Includes an **atomic USDC→XLM swap** that delivers XLM to the user and credits the solver in a single all-or-nothing transaction. |
| 5 | **CCTP Outbound (Exit)** | Spend a note → proof-bound CCTP burn of pool USDC back to native USDC on Arbitrum via the TokenMessengerMinter. |
| 6 | **Committee (MPC) Settlement** | Amounts are Shamir-shared to a 3-node committee that matches intents and produces threshold Ed25519 signatures; on-chain `mpc_settle` requires ≥⌈2n/3⌉ distinct registered signers **and** a mandatory ZK proof (fail-closed). |
| 7 | **Shade View** | Selective-disclosure: the user produces a signed report of chosen, already-public values (commitments, nullifiers, explorer proof links) for compliance, verifiable offline. |

---

## Zero-knowledge proof system

- **Curve:** BLS12-381 Groth16 — chosen because Stellar's first-party privacy-pools kit and the
  `circom2soroban` converter are BLS12-381, and Soroban exposes a native
  `bls12_381().pairing_check` host function. Verification happens **on-chain**.
- **Circuits** (Circom 2.x, shared `lib/`: Poseidon255, MerkleProof, Commitment):
  `withdraw_public` (the withdraw/cctp/rfq/atomic-swap family, selected by an op-type public
  signal), `private_transfer`, `deposit_note_mint`, `mpc_settlement`, `mpc_priced_settlement`,
  `remit_settlement`, `proof_of_fill_claim`, `compliance_membership`.
- **Enforced in-circuit:** commitment ∈ state tree; label ∈ association (compliance) tree with
  hard equality; `withdrawnValue ≤ value`; `relayerFee ≤ withdrawnValue`; 128-bit range checks;
  and op/recipient/deadline/quote/intent/fill/CCTP/asset fields bound as public signals that the
  **contract independently re-checks** (`arg == signal`) — so the relayer can never mutate terms.
- **Proving pipeline:** native Rust `coinutils` builds the note opening, association set, and
  circuit input (state root + Merkle paths) → **snarkjs** `wtns calculate` → `groth16 prove` →
  `groth16 verify` → **circom2soroban** converts the proof + public signals to the Soroban byte
  layout. Witnesses are deleted after proving.
- **Merkle root: computed off-chain, attested & re-checked on-chain.** On-chain Poseidon inserts
  beyond one leaf exceed the Soroban instruction budget, so the registrar submits the root; the
  contract independently recomputes it and rejects a mismatch (`RootMismatch`), and a background
  **Root Auditor** re-verifies the root from on-chain events, flagging `ROOT_MISMATCH_CRITICAL`
  to block all spends if it ever disagrees.

---

## Deployed contracts & addresses

**Network:** Stellar **Testnet** (Soroban) + **Arbitrum Sepolia**.
All addresses below are read from [`.env.generated`](.env.generated) (the authoritative,
setup-generated source of contract IDs). Every address is a clickable explorer link.

### Stellar (Soroban testnet) — protocol contracts

| Contract | Role | Address |
|---|---|---|
| **ShieldedPool** | Canonical settlement contract: proof verify, nullifier spend, USDC release/credit/burn, Merkle append, reserves | [`CCBFBH42…DOYH`](https://stellar.expert/explorer/testnet/contract/CCBFBH42PWPO7OVRTTSPPIDYQE3VYIETPHH5MVAQ75R7GSTRIMPWDOYH) |
| **NullifierRegistry** | Spend-once double-spend prevention (authorized-spender gated) | [`CBJWBS2H…QLKO`](https://stellar.expert/explorer/testnet/contract/CBJWBS2HFNB3RY7FU4PZI3GSE2EPIRPXOPRJFYCQFJJXYIF2UR4CQLKO) |
| **Verifier — Withdraw** | Groth16 verifier for the `withdraw_public` family | [`CDGYHV4V…UVSM`](https://stellar.expert/explorer/testnet/contract/CDGYHV4VAIEFYPV7ARRHYJCL7RE7WTATYSWPIMV7OOQ7KLFWL6JKUVSM) |
| **Verifier — Transfer** | Groth16 verifier for `private_transfer` | [`CCF7NA6X…HVRE`](https://stellar.expert/explorer/testnet/contract/CCF7NA6XKAMPMYYFVGTZ7IVDW2HPYGLDW6RTJBUW65CADUDSOQ3MHVRE) |
| **Verifier — DepositNoteMint** | Groth16 verifier for CCTP-funded note minting | [`CDHNQOKB…4RSA`](https://stellar.expert/explorer/testnet/contract/CDHNQOKBI5QIXDKQY3FNTX5OZZABWQPFTHK4T5EDOH6JSKBGMDOU4RSA) |
| **Verifier — MPC Settlement** | Groth16 verifier for committee `mpc_settle` | [`CC5M4JSH…HU67`](https://stellar.expert/explorer/testnet/contract/CC5M4JSHDBRDYQLRXGS2KDN3MCL2Y2QROZXWMWJGK5TDEXSROZYUHU67) |
| **Verifier — MPC Priced** | Groth16 verifier for priced cross-asset committee settlement | [`CB746VPC…DJQZ`](https://stellar.expert/explorer/testnet/contract/CB746VPCAAKRC2VQP5S64IDCLC3QP3E3TPL5LIV6GZDM5HQ7FUUUDJQZ) |

### Stellar (Soroban testnet) — CCTP & assets

| Contract | Role | Address |
|---|---|---|
| **CCTP Forwarder** | `mint_and_forward` — mints attested USDC into the pool | [`CA66Q2WF…4VSZ`](https://stellar.expert/explorer/testnet/contract/CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ) |
| **CCTP MessageTransmitter** | Receives & validates CCTP messages on Stellar | [`CBJ6MTCK…VVJY`](https://stellar.expert/explorer/testnet/contract/CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY) |
| **CCTP TokenMessengerMinter** | Burns pool USDC outbound to Arbitrum | [`CDNG7HXA…RTHP`](https://stellar.expert/explorer/testnet/contract/CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP) |
| **USDC (SAC)** | Stellar Asset Contract for testnet USDC | [`CBIELTK6…DAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |
| **XLM (SAC)** | Stellar Asset Contract for native XLM (atomic-swap output) | [`CDLZFC3S…CYSC`](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) |
| **USDC Issuer** | Testnet USDC issuing account | [`GBBD47IF…FLA5`](https://stellar.expert/explorer/testnet/account/GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5) |

### Arbitrum Sepolia — CCTP & assets

| Contract | Role | Address |
|---|---|---|
| **USDC** | Native USDC (source of truth for burns/mints) | [`0x75faf114…AA4d`](https://sepolia.arbiscan.io/address/0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d) |
| **CCTP TokenMessenger** | `depositForBurnWithHook` entry point | [`0x8FE6B999…2DAA`](https://sepolia.arbiscan.io/address/0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA) |
| **CCTP MessageTransmitter** | `receiveMessage` for the exit mint | [`0xE737e5cE…CE275`](https://sepolia.arbiscan.io/address/0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275) |
| **Solver** | Solver EVM address that fronts real USDC fills | [`0xEcf70dE9…14f76`](https://sepolia.arbiscan.io/address/0xEcf70dE9B52993a694920A6577A8A34660214f76) |

### Operator accounts (public, Stellar testnet)

| Account | Role | Address |
|---|---|---|
| **Deployer** | Deploys & administers contracts | [`GDPXYVCD…QV54`](https://stellar.expert/explorer/testnet/account/GDPXYVCDPEWIMDPO7CIPL3OQEICL37LXYRJ4SXTPBUZX3HAUP2EDQV54) |
| **Relayer** | Broadcasts client-signed XDRs & CCTP ops (admin/registrar) | [`GD2LZFXX…FHEV`](https://stellar.expert/explorer/testnet/account/GD2LZFXX5EZDYS52PP2EDBMZE3PUFRX5GA2GDU2LVA7VJD6OQWIRFHEV) |
| **Solver (Stellar)** | Ed25519 quote-signing identity | [`GDG6LFL2…73YV`](https://stellar.expert/explorer/testnet/account/GDG6LFL242MNNWTR2MLSL7OU4MEGH46SIPN34PNQ7J5CIZCVP4OW73YV) |

**CCTP domains:** Arbitrum = `3`, Stellar = `27`. **Domain separators:** `SHADE_POOL_ID=1`,
`SHADE_CHAIN_ID=148` (bound into every spend proof).

> Contract IDs are also served live at runtime via `GET /v1/contracts` and `GET /v1/config`.
> The tables above mirror [`.env.generated`](.env.generated); when they disagree, the generated
> file wins. **No secret keys are published here** — private keys live only in `.env.generated`
> on the operator machine and are never shipped to the browser.

---

## System architecture

Shade is a **TypeScript monorepo** (Node ≥ 22, ESM) of small Fastify services coordinated by a
**Postgres-backed durable job queue** — Postgres *is* the broker (no external message queue).

| Service | Dir | Port | Role |
|---|---|---|---|
| **API** | `apps/api` | 8080 | Fastify REST + SSE. Auth, users, vaults, deposits, proofs, withdrawals, RFQ, CCTP exit, MPC proxy, Shade View. Enqueues jobs; never signs a user action. |
| **Relayer** | `apps/relayer` | 8082 | Queue worker. Real CCTP + Stellar operations: burn validation, `mint_and_forward`, proof submission, MPC settle. Broadcasts client-signed XDRs. |
| **Prover** | `apps/prover` | 8083 | Queue worker. Real Groth16/BLS12-381 proof generation (coinutils → snarkjs → circom2soroban). Asserts local verification, deletes witnesses. |
| **Solver** | `apps/solver` | 8081 | Prices & Ed25519-signs quotes, holds real Arbitrum USDC inventory, executes real ERC-20 fills. |
| **MPC Committee** | `apps/mpc-committee` | 8090 (+ 8091–8093) | 3-node Shamir committee + coordinator: batch matching, threshold Ed25519 signing, settler loop. |
| **Root Auditor** | `apps/root-auditor` | — | Recomputes the Merkle root from on-chain events vs `get_root`; flags critical mismatches to block spends. |
| **Web** | `frontend` | 3000 | Next.js app (the product UI). |

```
                      ┌───────────────┐   Privy JWT / session
        browser/CLI ──┤     API       │◄────────────────────────── user
                      │  (Fastify)    │
                      └──┬───┬───┬──┬──┘
          enqueue jobs   │   │   │  │  HTTP proxy
        ┌────────────────┘   │   │  └─────────────────┐
        ▼                    │   │                    ▼
  ┌───────────┐        HTTP  │   │ HTTP        ┌──────────────┐
  │ Postgres  │◄────────┐    ▼   ▼             │ MPC Committee│
  │ (state +  │      ┌──┴─────────┐            │ coord+3 nodes│
  │  queue)   │◄─────┤  Prover    │            └──────┬───────┘
  └─────┬─────┘ poll └────────────┘  writes           │ settler → enqueue
        │ poll  ┌────────────┐                         ▼
        └───────┤  Relayer   │◄──────────────── Postgres (mpc_*)
                └──┬───┬───┬──┘
        Soroban RPC│   │   │ Arbitrum RPC / Circle Iris
                   ▼   │   ▼
         ┌──────────────────────────┐        ┌──────────────┐
         │ ShieldedPool + Verifiers │        │   Solver     │──► Arbitrum USDC fills
         │ + NullifierRegistry +    │◄───────┤ Ed25519 quote│    (real ERC-20 transfer)
         │ CCTP Forwarder/TMM + SAC │  sig   │  signing     │
         └────────────┬─────────────┘        └──────────────┘
                      │ deposit events
                      ▼
              ┌───────────────┐  ROOT_MISMATCH_CRITICAL → API blocks spends
              │ Root Auditor  │──► root_audit_findings
              └───────────────┘
```

The **durable job queue** (`packages/queue`) uses `SELECT … FOR UPDATE SKIP LOCKED` for safe
concurrent claims, idempotency-key dedup, and retry-with-backoff. Two logical queues — `prover`
and `relayer` — are the only channel between the API and the workers; job results and a live
event timeline are surfaced via `GET /v1/jobs/:id`.

---

## The shielded pool contract

[`contracts/stellar/shielded_pool`](contracts/stellar/shielded_pool) is the single canonical
settlement contract (~1,440 lines of Rust). Key entry points:

| Method | Auth | Purpose |
|---|---|---|
| `receive_cctp_deposit(...)` | admin | Verify a `DepositNoteMint` proof, bind every CCTP field to a public signal, append the note leaf on-chain, adjust note supply. |
| `withdraw(to, proof, pub)` | `to` | Spend a note → release `withdrawnValue − relayerFee` to `to`. Requires the note owner's Stellar signature. |
| `withdraw_cctp(...)` | `to` | Spend a note → burn pool USDC outbound to Arbitrum via the TokenMessengerMinter. |
| `rfq_settle(...)` | proof + sig | Reimburse a solver who already filled on Arbitrum, against a proof + registered-solver Ed25519 signature. |
| `rfq_settle_atomic_swap(...)` | proof + sig | Atomic USDC→XLM: deliver XLM to the user **then** credit the solver USDC, all-or-nothing, with the price enforced in-contract. |
| `private_transfer_settle(...)` | admin | Spend a note → append a new hidden-amount output note (value conservation proven in-circuit). |
| `mpc_settle(...)` / `mpc_settle_priced(...)` | committee | Settle a committee-matched pair; requires threshold signatures **and** a mandatory ZK proof. |
| `register_asset`, `set_*verifier`, `set_authorized_solver`, `set_committee`, `pause/unpause`, `transfer_admin`, `upgrade` | admin | Config & governance. |
| `is_known_root`, `get_root`, `note_supply`, `proof_of_reserves`, `is_authorized_solver`, … | view | Read paths. |

**Reserve invariants (fail-closed):** note supply can never go negative (`SupplyUnderflow`), and
`note_supply(asset) ≤ vault_balance(asset)` always holds (`ReserveBroken`). `proof_of_reserves`
exposes `(supply, balance)` per asset.

Supporting contracts: `proof_verifiers` (one generic Groth16/BLS12-381 verifier instance per
circuit, with a `freeze_vk` path for production immutability), `nullifier_registry` (spend-once,
authorized-spender gated), `lean_imt` (Poseidon Lean Incremental Merkle Tree matching the
circuits), and a `governance_guardian` (quorum + timelock admin the pool can delegate to).

---

## Repository layout

```
shade/
├── apps/
│   ├── api/            Fastify REST API (primary backend surface)
│   ├── relayer/        queue worker: real CCTP + Stellar tx submission
│   ├── prover/         queue worker: Groth16 proof generation
│   ├── solver/         RFQ quote pricing/signing + real Arbitrum fills
│   ├── mpc-committee/  3-node Shamir committee + coordinator + settler
│   ├── root-auditor/   off-chain root recomputation / fraud detection
│   └── cli/            end-to-end flow runners (cctp / zk / rfq / mpc / …)
├── frontend/           Next.js product app (Privy, dashboard, deposit, move, reports, activity)
├── packages/
│   ├── cctp / cctp-utils   CCTP orchestration, constants, ABIs, attestation polling
│   ├── note-crypto         Poseidon commitment / nullifier
│   ├── note-vault          browser-safe AES-256-GCM vault + recovery wrappers
│   ├── auth-privy          Privy ES256 JWT verification + ownership guards
│   ├── proving             Groth16 pipeline (coinutils → snarkjs → circom2soroban)
│   ├── mpc-crypto          Shamir SSS, X25519 share encryption, Ed25519 batch signing
│   ├── rfq / rfq-types     RFQ intent/quote types, hashing, signing, atomic-swap terms
│   ├── stellar-actions     build UNSIGNED Soroban XDR + broadcast SIGNED XDR
│   ├── queue               Postgres durable job queue
│   └── sdk                 client SDK (notes / intents / cctp / mpc / wallets)
├── contracts/stellar/
│   ├── shielded_pool/       ★ canonical settlement contract
│   ├── proof_verifiers/     Groth16 / BLS12-381 verifier (one instance per circuit)
│   ├── nullifier_registry/  spend-once
│   ├── lean_imt/            Poseidon Lean IMT library
│   └── compliance_registry, intent_escrow, governance_guardian
├── circuits/           Circom 2.x, BLS12-381 (withdraw_public, private_transfer, deposit_note_mint, mpc_*, …)
├── db/migrations/      Postgres schema (protocol state + append-only audit log)
├── scripts/            setup, build, deploy, migrate, security gates, test reports
├── tools/circom2soroban/  Rust proof/vk → Soroban byte converter (vendored)
└── infra/              docker-compose (Postgres/Redis) + full phase-2 stack
```

---

## Tech stack

| Layer | Technology |
|---|---|
| **Smart contracts** | Rust + Soroban SDK (Stellar), `wasm32v1-none` target, Stellar CLI v27 |
| **Zero-knowledge** | Circom 2.x, Groth16, BLS12-381, snarkjs, Poseidon (iden3), `circom2soroban` |
| **Cross-chain** | Circle CCTP v2 (burn-and-mint), Iris attestation API |
| **Backend** | TypeScript, Node ≥ 22 (ESM), Fastify, Postgres 16, `pg` |
| **Crypto** | AES-256-GCM (note vault), X25519 / NaCl box, Ed25519, Shamir Secret Sharing, WebAuthn/passkey PRF |
| **Identity** | Privy (ES256 JWT, embedded EVM + Stellar wallets), Freighter |
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, TanStack Query, Framer Motion |
| **EVM** | ethers, Arbitrum Sepolia |

---

## The web app

The product UI lives in [`frontend/`](frontend) (Next.js 16 + React 19 + Tailwind 4 + shadcn/ui),
authenticated with **Privy** (email or wallet login, embedded EVM wallet). It follows one strict
integration contract: **the backend never sees secrets, prepares unsigned transactions, the user
signs client-side, and the relayer broadcasts.** Every async action returns a `job_id` whose live
event timeline drives the UI.

Two components render **inline on every page** so the ZK story is always visible:

- **LiveLog** — polls `GET /v1/jobs/:id` and renders the event stream
  (`queued → burning → attestation → minting → proving → ready`) as a terminal-style feed, plus a
  global SSE activity feed.
- **ZK Proof panel** — shows the proving lifecycle, the public signals, the on-chain verifier
  address, the verify/settle tx link, "BLS12-381 pairing check: passed", and the spent nullifier.

Pages: **Dashboard** (private balance + live activity), **Deposit / Shield**, **Move**
(withdraw / swap / exit), **Reports** (Shade View selective disclosure), and **Activity**.

> **Deploying the frontend:** it builds with `next build --webpack` (webpack handles the
> transitive `pino`/`thread-stream` dependency pulled in by the wallet SDKs, which Turbopack
> chokes on). On Vercel, set the root directory to `frontend` and provide
> `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_API_BASE`.

---

## API surface

~60 REST endpoints under `apps/api/src/routes.ts`. Highlights:

- **Identity:** `POST /v1/me/wallets/sync-privy`, `GET /v1/me`, `GET /v1/me/wallets`
- **Vaults & recovery:** `POST/GET /v1/note-vaults`, `POST /v1/note-vaults/:id/verify-backup`,
  wrapper management, `POST /v1/notes/recover`
- **Deposit (CCTP inbound):** `POST /v1/deposits/prepare`, `POST /v1/deposits/:id/burn-submitted`
- **Proofs & jobs:** `POST /v1/proofs/:kind/request`, `GET /v1/jobs/:id`
- **Withdraw:** `POST /v1/withdrawals/{prepare,build-xdr,submit}`
- **RFQ / swap:** `POST /v1/intents`, `POST /v1/quotes/:id/accept`, `POST /v1/rfq/settle`
- **CCTP exit:** `POST /v1/cctp/outbound/{prepare,submit,:id/fetch-attestation,:id/complete-mint}`
- **Shade View:** `POST /v1/reports/view-key`
- **MPC:** `GET /v1/mpc/committee`, `POST /v1/mpc/intents`, `GET /v1/mpc/batches`
- **Config & health:** `GET /v1/contracts`, `GET /v1/config`, `GET /v1/health/full`,
  `GET /v1/activity` + SSE `GET /v1/activity/stream`

Authentication is **Privy ES256 JWT** verified offline (issuer/audience/expiry checks); the Privy
DID is the canonical identity. Ownership is enforced by `user_id` on every read, and every raw
request body is scanned to reject plaintext note/secret fields.

---

## Getting started

**Prerequisites**

```bash
brew install stellar-cli                                    # Soroban (v27)
rustup target add wasm32v1-none                             # contract builds
cargo install --git https://github.com/iden3/circom circom  # circuit compiler (2.x)
npm install -g circomlib snarkjs                            # circuit libs + Groth16 prover
```

**Backend setup**

```bash
npm install
cp .env.example .env
# Fill ARB_SEPOLIA_PRIVATE_KEY and ARB_SEPOLIA_RPC_URL in .env.

npm run research:lock       # locks CCTP constants from official docs
npm run setup:testnet       # derives wallets, funds via Friendbot, writes .env.generated

docker compose -f infra/docker-compose.yml up -d   # Postgres (+ Redis)
npm run db:migrate
```

**Build contracts & circuits**

```bash
npm run contracts:build
npm run circuits:build
npm run contracts:deploy:pool
```

**Run the services** (each in its own terminal, or use the full compose stack)

```bash
npm run api:dev        # :8080
npm run relayer:dev    # :8082
npm run prover:dev     # :8083
npm run solver:dev     # :8081
npm run mpc:dev        # :8090 (+ nodes 8091–8093)
npm run root-auditor:dev

# or the full 7-service stack:
npm run docker:phase2
```

**Run the frontend**

```bash
cd frontend
# create .env.local with NEXT_PUBLIC_API_BASE + NEXT_PUBLIC_PRIVY_APP_ID
npm install
npm run dev            # :3000
```

**End-to-end tests (real testnet transactions)**

```bash
npm run cctp:inbound:e2e
npm run zk:withdraw:e2e
npm run zk:transfer:e2e
npm run rfq:e2e
npm run cctp:outbound:e2e
npm run e2e:all
npm run test-report    # writes docs/test-report.generated.md
```

---

## Security model

- **Secrets stay client-side.** Note preimages and the vault master key are generated in the
  browser. The vault is AES-256-GCM encrypted (with AAD) before upload; wrappers store only
  wrapped keys. `assertNoPlaintextNoteFields` rejects any envelope carrying a forbidden plaintext
  field (`owner_secret`, `spend_secret`, `blinding`, `nonce`, `note_preimage`,
  `vault_master_key`, `private_key`, `secret`, …).
- **Recovery policy.** The master key is wrapped by passkey-PRF, Stellar-Ed25519 signature, and a
  recovery-kit passphrase (PBKDF2, 310k iterations). An EVM signature is diagnostic-only and can
  never satisfy the policy alone. Deposits are blocked until backup is verified **and** the policy
  is sufficient.
- **Everything critical is on-chain.** Proof verification, nullifier spend, fund release, Merkle
  root, all recipient/amount/fee/deadline/quote/asset bindings, the solver & committee registries,
  reserve invariants, and pause are all enforced by contracts.
- **Operator key hygiene.** Only relayer/solver/deployer keys live in server env; user burns and
  user Stellar spends are client-signed. Fastify redacts secrets from logs.
- **Defense in depth.** Domain-separated nullifiers prevent cross-pool/chain replay; idempotency
  keys and on-chain nonce dedup prevent double-processing; deadlines are proof-bound; the Root
  Auditor independently blocks spends on any root mismatch.

<p align="center"><sub>Shade Protocol — private, cross-chain USDC settlement with on-chain zero-knowledge verification.</sub></p>
