# Frontend design — from Privy login to the nanopayments demo

> Spec for the pages/components that come **after** wallet login. The goal:
> land the user directly on a page that walks them through the two rails
> (base = StreamPay, privacy = agent-service) with real Arc-testnet tx
> hashes and a live per-second meter.

Existing frontend is `frontend/` (Next.js App Router, Tailwind, Privy for
auth, TanStack Query, `GlyphMatrix` background). Everything below reuses
that stack.

---

## 1. What changes

Today, after `usePrivy().authenticated`, the app routes into
`frontend/app/(app)/dashboard/page.tsx` which shows the Stellar-era
"private balance in shielded USDC" view. We keep the auth gate and the
layout chrome (nav, disconnect, GlyphMatrix background) and swap the
**default landing** and the **nav** to point at the new demo pages.

### Nav (edit `frontend/app/(app)/layout.tsx`)

Replace the `NAV` array:

```ts
const NAV = [
  { href: "/demo",       label: "Demo" },        // new landing — overview + start
  { href: "/bridge",     label: "Bridge" },      // Step 1: Base Sepolia → Arc (CCTP)
  { href: "/stream",     label: "Stream" },      // Step 2: base rail — StreamPay
  { href: "/service",    label: "Service" },     // Step 3: privacy layer — agent-service
  { href: "/receipts",   label: "Receipts" },    // history of runs, arcscan links
]
```

Default landing after Privy: redirect to `/demo` (edit the existing
"redirecting…" handling in `layout.tsx`, and add `router.replace("/demo")`
after `authenticated` becomes true).

### New route folders under `frontend/app/(app)/`

```
demo/       page.tsx      overview of the two rails + Start buttons
bridge/     page.tsx      CCTP burn→attest→mint UI
stream/     page.tsx      StreamPay live per-second meter
service/    page.tsx      100-request voucher stream + ZK settle
receipts/   page.tsx      list of past runs (persisted arcscan hashes)
```

---

## 2. Page-by-page contract

Every page:
- Uses the shared `Card`, `TxLink`, `GlyphMatrix` primitives already in the
  repo (`frontend/components/`).
- Reads/writes only via typed hooks in `frontend/lib/hooks.ts` (extend the
  file — do **not** call `fetch` directly from components).
- Keeps the same color palette: `#050505` background, `#EDEAE3` foreground,
  `#2563eb` for callouts, emerald for success, red for failure.

### `/demo` — overview + entry point

Purpose: 30 seconds to understand the two rails and pick which to run.

Layout:
```
┌────────────────────────────────────────────────────────────────┐
│  SHADE STREAMS · REAL NANOPAYMENTS ON ARC                       │
│                                                                 │
│  Pay by the fraction. Settle the net. Reveal nothing.           │
│                                                                 │
│  ┌────────────────────────┐   ┌────────────────────────┐         │
│  │ RAIL A · StreamPay      │   │ RAIL B · Shielded net   │         │
│  │ ─────────────           │   │ ─────────────           │         │
│  │ real per-second USDC    │   │ per-request vouchers    │         │
│  │ on-chain meter          │   │ ONE ZK settle for net   │         │
│  │                         │   │                         │         │
│  │ $0.0001 / sec           │   │ 100+ requests, 0 gas    │         │
│  │ pause / resume          │   │ private, batched        │         │
│  │                         │   │                         │         │
│  │ [ Run stream demo →  ]  │   │ [ Run service demo → ]  │         │
│  └────────────────────────┘   └────────────────────────┘         │
│                                                                 │
│  Need Arc USDC first?  → [ Bridge from Base Sepolia ]           │
└────────────────────────────────────────────────────────────────┘
```

Content is static apart from three read-outs at the top of the page (uses
`useContracts()` / a new `useArcBalance()` — see §3):
- Arc balance of the connected wallet (real, live).
- `StreamPay` deployed address (or "not deployed on this session").
- Last settled service run (a link to `/receipts`).

---

### `/bridge` — Base Sepolia → Arc (CCTP)

Purpose: mirror `cctp-bridge-demo.ts` in the browser.

Fields (form):
- Source chain — dropdown, default "Base Sepolia" (only option this MVP).
- Amount — number in USDC. Default 5.
- Destination — auto-filled with the connected Arc wallet address; editable.

Live state during a run:
```
Step 1 · approve      [pending / tx hash / done]
Step 2 · depositForBurn [pending / tx hash / done] → basescan link
Step 3 · attestation  [pending "waiting for Circle Iris (12s)" spinner / ready]
Step 4 · mint on Arc  [pending / tx hash / done] → arcscan link

Balances:
  Base Sepolia USDC:  10.00 → 5.00
  Arc native USDC:    2.00 → 6.995
```

Uses the same on-chain calls as `packages/arc-actions/src/cctp-bridge-demo.ts`.
Client-side needs `ethers.BrowserProvider(window.ethereum)` or a Privy embedded
wallet for signing on Base Sepolia + Arc. The Iris poll fetches
`https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash=…`
directly from the browser — no backend needed.

Backend touchpoint (optional): POST `/v1/demo/bridge/record` to save the
run to `receipts` so `/receipts` can list it. Not required for the demo to
work.

---

### `/stream` — StreamPay live per-second meter

Purpose: mirror `streampay-demo.ts` in the browser, but **with a live
counter** that updates every second.

Layout:
```
┌────────────────────────────────────────────────────────────────┐
│  RAIL A · REAL PER-SECOND USDC STREAMING ON ARC                 │
│                                                                 │
│  Payer  (agent)   0xf39f…9266  →  0.9812 USDC available          │
│  Payee  (service) 0xB0b9…5F41  ←  fresh address for this demo   │
│  Contract StreamPay  [ Deploy ]  or  0x5FbD…0aa3                 │
│                                                                 │
│  Rate      0.0001 USDC / sec                                    │
│  Cap       0.005  USDC   [ Fund + Open Stream ]                 │
│                                                                 │
│  ┌──────────────────────────────────────────────┐               │
│  │      earned()      0.0007  USDC   ●●●●●●●     │  live meter   │
│  │      withdrawn     0.0000  USDC               │               │
│  │      state         streaming                  │               │
│  └──────────────────────────────────────────────┘               │
│                                                                 │
│  [ Withdraw ]  [ Pause ]  [ Resume ]  [ Stop ]                  │
│                                                                 │
│  Recent tx:                                                     │
│    · open       0x9fac…6a6c  → arcscan                          │
│    · withdraw   0xfbe3…5457  → arcscan                          │
│    · pause      0x94ee…9256d → arcscan                          │
└────────────────────────────────────────────────────────────────┘
```

Behavior:
- **Deploy** button: uses `StreamPay.json` (imported from
  `contracts/arc/out/…` via a build-time copy into
  `frontend/lib/artifacts/`). `new ContractFactory(...).deploy()`. Persist
  the address in `localStorage.streampay.address` per chain-id.
- **Fund + Open**: `open(id, payee, rate, { value: cap })`. `id` = a UUIDv4
  → keccak256. `payee` defaults to `Wallet.createRandom()` shown to the
  user (make the private key downloadable so they can withdraw later).
- **Live meter**: `setInterval(500ms)` that calls `earned(id)` and
  `withdrawable(id)` via a read-only ethers provider. Show the last-known
  value + a subtle animated dots row so the user *feels* the tick.
- **Withdraw / Pause / Resume / Stop**: one tx each. Show pending → hash →
  arcscan link. After stop, freeze the meter and show the value-conservation
  line (`payee_paid + payer_refund == cap`).

Design notes:
- Read the amounts from **events**, not balance deltas — parse
  `Withdrawn(id, amount, totalPaid)` and `Stopped(id, paidToPayee,
  refundToPayer)` from the tx receipt. Same pattern as the demo script.
- All hashes shown as `<TxLink hash={…} chain="arc" />`; extend the existing
  `frontend/components/tx-link.tsx` to accept a `chain` prop
  (`"arc" | "base"`) mapping to arcscan / basescan.

---

### `/service` — 100 metered requests, one ZK settle

Purpose: mirror `agent-service-demo.ts` in the browser. This is the
"privacy" story: a scrolling voucher log, then one on-chain settle.

Layout:
```
┌────────────────────────────────────────────────────────────────┐
│  RAIL B · SHIELDED PER-REQUEST BILLING                          │
│                                                                 │
│  Channel status:  OPEN  (0x…)                                   │
│  Cap:  100 units       Signed so far:  47                       │
│                                                                 │
│  [ Open channel (1 ZK proof) ]                                  │
│  [ Send request  ×10 ]  [ ×100 ]  [ ×1000 ]                      │
│  [ Settle net (1 ZK proof) ]                                    │
│                                                                 │
│  Live log (scrolling, most recent at top):                      │
│   #47  "rate this transaction risk"   paid 47   → positive 0.83 │
│   #46  "summarize the latest block"   paid 46   → negative 0.31 │
│   #45  …                                                        │
│                                                                 │
│  On-chain events:                                               │
│    · open    tx 0x6e87f408…  → arcscan                          │
│    · settle  tx 0xec66753c…  → arcscan                          │
│                                                                 │
│  Receipt (from events):                                         │
│    state         SETTLED                                        │
│    gross         47 units   (= highest cumulative)              │
│    payer refund  53 units   (private note)                      │
│    invariant     ✓ gross == highest voucher cumulative          │
└────────────────────────────────────────────────────────────────┘
```

Behavior:
- **Open channel**: calls the backend, which builds the ZK proof server-side
  (proving in browser is heavy — reuse `apps/api` for now). Backend endpoint:
  `POST /v1/demo/channels` → returns `{ channelId, txHash, cap }`.
- **Send request**: pure client. Signs a fresh voucher via `@shade/sdk` (`PayerAgent.pay(1n)`),
  sends `POST http://localhost:8788/infer` (the x402 service) with the voucher
  in `x-shade-voucher`. Response prepended to the log.
- **Settle**: backend builds the settle proof and submits. Endpoint:
  `POST /v1/demo/channels/:id/settle` → returns `{ txHash, gross, refund }`.
- **Live receipt** poll: `useReceipt(channelId)` hits `/v1/demo/channels/:id/receipt`
  every 3s until state = SETTLED.

Design notes:
- The service worker (mock x402 endpoint at 127.0.0.1:8788) can run as a
  local Node process — same one `agent-service-demo.ts` boots. For a
  cleaner UX, ship it as `apps/service/src/server.ts` (extract from the
  demo script) and run it via `npm run service:dev` on port 8788. The
  frontend polls it directly (CORS enable).
- Be explicit that this rail is currently using a **mock USDC** inside the
  pool. Put a subdued banner:
  > "Privacy demo — the pool is holding a mock USDC token in this build.
  >  Real-USDC binding is a documented seam (see docs/E2E_REAL_WORKFLOW.md §2B)."

---

### `/receipts` — history of past runs

Purpose: something to point at afterwards. Two tabs:
- **StreamPay** — list of `Opened` / `Stopped` events with linked arcscan tx.
- **Shielded settles** — list of channels with `gross`, `refund`, arcscan tx.

Reads: two hooks that call `provider.getLogs(...)` scoped to the deployed
contract addresses, then decode with the ABIs. Same event-parsing pattern
as `packages/arc-actions/src/index.ts`'s `fetchChannelReceipt`.

---

## 3. `frontend/lib/` additions

Extend, don't invent parallel plumbing.

### `frontend/lib/arc.ts` (new)
Chain-side helpers. Export:

```ts
export const ARC_CHAIN = {
  chainId: 5042002,
  rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
} as const

export function arcProvider(): JsonRpcProvider          // read-only
export function arcSigner(): Promise<BrowserProvider>   // signer from Privy embedded / injected wallet
export function arcExplorerTx(hash: string): string
```

### `frontend/lib/streampay.ts` (new)

Thin wrapper around the ABI + factory. Consumes the compiled artifact from
`contracts/arc/out/StreamPay.sol/StreamPay.json`. Wire the artifact into the
frontend via a build-time copy script (`scripts/sync-frontend-artifacts.ts`)
or a symlink — do **not** import across the workspace boundary, keep the
frontend self-contained.

```ts
export async function deployStreamPay(signer: Signer): Promise<string>
export async function openStream(signer: Signer, addr: string, id: string, payee: string, ratePerSec: bigint, cap: bigint): Promise<TxReceipt>
export async function readMeter(addr: string, id: string): Promise<{ earned: bigint; withdrawable: bigint; state: "streaming" | "paused" | "closed" }>
export async function withdraw(signer: Signer, addr: string, id: string): Promise<{ txHash: string; amount: bigint }>
export async function pause / resume / stop … (same shape)
```

### `frontend/lib/hooks.ts` (extend)
Add:

```ts
useArcBalance(address?: string)             // real Arc native USDC balance
useStreamPayAddress()                        // from localStorage / provider
useStreamMeter(addr?: string, id?: string)  // 500ms poll of earned/withdrawable
useChannelReceipt(channelId?: string)        // for /service and /receipts
useCctpAttestation(burnTxHash?: string, sourceDomain: number)  // for /bridge Step 3
```

### `frontend/lib/api.ts` (extend)
Add typed shapes + endpoints for the two backend touchpoints:

```
POST /v1/demo/channels                       { cap? } → { channelId, txHash }
POST /v1/demo/channels/:id/settle            {} → { txHash, gross, refund }
GET  /v1/demo/channels/:id/receipt           → receipt shape
POST /v1/demo/bridge/record                  { burnTx, mintTx, amountUsdc }
GET  /v1/demo/receipts                       → list of persisted runs
```

Everything else (StreamPay calls, CCTP burn, attestation poll, mint, service
POSTs) is **direct from the browser**. Keeps the demo honest: no server can
mint or move value.

---

## 4. Reused vs. new

**Reused unchanged:**
- `frontend/app/(app)/layout.tsx` chrome — nav array is the only edit.
- `GlyphMatrix`, `TxLink`, `Card` / `Field` / `Mono` from `dashboard/page.tsx`
  (extract them into `frontend/components/ui/card.tsx` etc. so all the new
  pages can import from one place, instead of copying the definitions).
- Privy auth gate + `useContracts()` / `useHealth()` / `useMe()`.

**New pages:** `/demo`, `/bridge`, `/stream`, `/service`, `/receipts`.

**Retire, don't delete:** `/dashboard`, `/deposit`, `/move`, `/reports` —
keep the routes so nothing 404s, but remove them from the nav array. They
represent the Stellar-era view and can either be feature-flagged behind
`NEXT_PUBLIC_LEGACY_UI=1` or quietly dropped later.

---

## 5. Implementation order (smallest to biggest slice)

1. **Wire the nav + landing redirect + `/demo` page.** No new hooks yet;
   the page is nearly static. This proves the routing change is safe.
2. **`/stream` page (base rail).** The clearest, most-honest demo. All
   client-side; needs `frontend/lib/streampay.ts` + the artifact copy step.
   Once this works, the two-rails story is already visually landed.
3. **`/bridge` page.** Wallet on two chains + Iris polling. Reuses the exact
   ABIs from `packages/arc-actions/src/cctp-bridge-demo.ts`.
4. **`/service` page.** Needs the two new backend endpoints (proof building)
   plus a running x402 service worker. Biggest slice — do last.
5. **`/receipts` page.** Just log-decoding over the two contract addresses.
   Falls out for free once /stream and /service persist their runs.

Each slice ends with a runnable, screenshot-worthy page — you can demo after
step 2 alone.

---

## 6. Anti-goals

- **No new component libraries.** Stick to shadcn/ui and tailwind classes
  already in use.
- **No new proving code in the browser.** All Groth16 proof generation stays
  on `apps/api` for now; the frontend calls it. (Browser-side proving is a
  post-hackathon polish.)
- **No mocked tx hashes in the UI.** If a step can't happen for real, don't
  render a fake one. Say "not run yet" or gray the button.
- **No hiding the seam.** The `/service` page must show the "mock USDC in
  the pool" banner. The whole value of this repo is that the rails and the
  seams are labeled honestly.
