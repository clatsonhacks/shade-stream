"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { formatUnits, Wallet, type Signer } from "ethers"
import { arcProvider } from "@/lib/arc"
import { Copy, ExternalLink, Loader2, Pause, Play, Square, ArrowDownToLine, Rocket, Zap } from "lucide-react"

import { TxLink } from "@/components/tx-link"
import { useArcBalance, useStreamMeter } from "@/lib/hooks"
import { arcSigner, ARC_CHAIN, arcExplorerAddr } from "@/lib/arc"
import {
  deployStreamPay,
  newStreamId,
  openStream,
  pauseStream,
  resumeStream,
  stopStream,
  withdrawStream,
} from "@/lib/streampay"

// Rate: 0.0001 USDC / sec — real sub-cent nanopayment rate. Matches the CLI demo.
const RATE = 100_000_000_000_000n // 1e14 wei (18-dec native USDC on Arc)
const CAP = 5_000_000_000_000_000n // 5e15 wei = 0.005 USDC (50s at RATE)
// Bootstrap advance to the payee so it can pay gas for its own withdraw tx.
// Arc testnet gas per simple tx is ~0.004 USDC — this sizes for one withdraw
// with headroom. Not counted against the streamed value; it's a gas float.
const BOOTSTRAP = 10_000_000_000_000_000n // 0.01 USDC

type TxRow = { step: string; hash: string; note?: string }

// localStorage keys — scoped to Arc's chain-id so this can be extended later.
const LS_ADDR = "streampay:5042002:addr"
const LS_STREAM = "streampay:5042002:current-stream" // JSON: { id, payeeAddr, payeePriv, openTx, txs, closed }

type StreamRecord = {
  id: string
  payeeAddr: string
  payeePriv: string
  openTx: string
  txs: TxRow[]
  closed: boolean
  finalPayeePaid?: string
  finalRefund?: string
}

function loadRecord(): StreamRecord | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(LS_STREAM)
  if (!raw) return null
  try { return JSON.parse(raw) as StreamRecord } catch { return null }
}
function saveRecord(r: StreamRecord | null) {
  if (typeof window === "undefined") return
  if (r == null) window.localStorage.removeItem(LS_STREAM)
  else window.localStorage.setItem(LS_STREAM, JSON.stringify(r))
}

export default function StreamPage() {
  const router = useRouter()
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()

  useEffect(() => { if (ready && !authenticated) router.replace("/") }, [ready, authenticated, router])

  const payer = wallets[0]
  const payerAddr = payer?.address ?? null
  const balance = useArcBalance(payerAddr)

  const [contractAddr, setContractAddr] = useState<string | null>(null)
  const [record, setRecord] = useState<StreamRecord | null>(null)
  const meter = useStreamMeter(contractAddr, record?.id ?? null)

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Hydrate localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    setContractAddr(window.localStorage.getItem(LS_ADDR))
    setRecord(loadRecord())
  }, [])

  // Convenience: get a signer bound to Arc from the connected wallet.
  async function getSigner(): Promise<Signer> {
    if (!payer) throw new Error("connect a wallet first")
    const eip1193 = await payer.getEthereumProvider()
    return arcSigner(eip1193)
  }

  async function run<T>(step: string, fn: () => Promise<T>): Promise<T | null> {
    setError(null); setBusy(step)
    try { return await fn() }
    catch (e: any) { setError(e?.shortMessage ?? e?.message ?? String(e)); return null }
    finally { setBusy(null) }
  }

  const onDeploy = () => run("deploy", async () => {
    const signer = await getSigner()
    const { address, txHash } = await deployStreamPay(signer)
    window.localStorage.setItem(LS_ADDR, address)
    setContractAddr(address)
    // seed txs with the deploy hash for visibility
    const seed: StreamRecord = { id: "", payeeAddr: "", payeePriv: "", openTx: "", txs: [{ step: "deploy", hash: txHash }], closed: false }
    saveRecord(seed); setRecord(seed)
  })

  const onOpen = () => run("open", async () => {
    if (!contractAddr) throw new Error("deploy StreamPay first")
    const signer = await getSigner()
    // fresh payee — distinct address for this run, matches the CLI demo
    const payee = Wallet.createRandom()
    // 1) bootstrap the payee with a small USDC advance so it can afford to call
    //    withdraw() itself later. Not part of the streamed value.
    const bootTx = await signer.sendTransaction({ to: payee.address, value: BOOTSTRAP })
    await bootTx.wait()
    // 2) open the stream — funds the escrow with the cap as msg.value
    const id = newStreamId()
    const { txHash } = await openStream(signer, contractAddr, id, payee.address, RATE, CAP)
    const prevTxs = record?.txs ?? []
    const bootstrapRow: TxRow = { step: "bootstrap payee", hash: bootTx.hash, note: `${formatUnits(BOOTSTRAP, 18)} USDC → payee (gas float)` }
    const openedRow: TxRow = { step: "open", hash: txHash, note: `${formatUnits(CAP, 18)} USDC @ ${formatUnits(RATE, 18)}/s` }
    const r: StreamRecord = {
      id, payeeAddr: payee.address, payeePriv: payee.privateKey, openTx: txHash,
      txs: [...prevTxs, bootstrapRow, openedRow], closed: false,
    }
    saveRecord(r); setRecord(r)
  })

  const onWithdraw = () => run("withdraw", async () => {
    if (!contractAddr || !record) return
    // Only the payee can call withdraw. Reconstruct a signer from the payee's
    // private key + Arc read-only provider. Bootstrap covered the gas.
    const payeeSigner = new Wallet(record.payeePriv, arcProvider())
    const { txHash, amount } = await withdrawStream(payeeSigner, contractAddr, record.id)
    const row: TxRow = { step: "withdraw", hash: txHash, note: `+${formatUnits(amount, 18)} USDC → payee` }
    const next = { ...record, txs: [...record.txs, row] }
    saveRecord(next); setRecord(next)
  })

  const onPause = () => run("pause", async () => {
    if (!contractAddr || !record) return
    const signer = await getSigner()
    const { txHash } = await pauseStream(signer, contractAddr, record.id)
    const next = { ...record, txs: [...record.txs, { step: "pause", hash: txHash } as TxRow] }
    saveRecord(next); setRecord(next)
  })

  const onResume = () => run("resume", async () => {
    if (!contractAddr || !record) return
    const signer = await getSigner()
    const { txHash } = await resumeStream(signer, contractAddr, record.id)
    const next = { ...record, txs: [...record.txs, { step: "resume", hash: txHash } as TxRow] }
    saveRecord(next); setRecord(next)
  })

  const onStop = () => run("stop", async () => {
    if (!contractAddr || !record) return
    const signer = await getSigner()
    const { txHash, paidToPayee, refundToPayer } = await stopStream(signer, contractAddr, record.id)
    const row: TxRow = { step: "stop", hash: txHash, note: `payee +${formatUnits(paidToPayee, 18)} USDC · payer +${formatUnits(refundToPayer, 18)} USDC` }
    const next: StreamRecord = { ...record, txs: [...record.txs, row], closed: true, finalPayeePaid: paidToPayee.toString(), finalRefund: refundToPayer.toString() }
    saveRecord(next); setRecord(next)
  })

  const onReset = () => {
    if (!confirm("Clear the current stream from local storage? The on-chain state remains; this only clears the UI cache.")) return
    saveRecord(null); setRecord(null)
  }

  const state = meter.data?.state ?? "streaming"
  const earned = meter.data?.earned ?? 0n
  const withdrawable = meter.data?.withdrawable ?? 0n
  const totalWithdrawn = meter.data?.withdrawn ?? 0n
  const deposit = meter.data?.deposit ?? CAP

  const hasStream = !!record?.id && !record.closed
  const hasContract = !!contractAddr

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-foreground/70">
          Rail A · Base rail · StreamPay
        </p>
        <h1 className="mt-3 flex items-center gap-3 font-sans text-4xl font-light tracking-tight" style={{ color: "#EDEAE3" }}>
          <Zap className="h-8 w-8 text-[#2563eb]" />
          Real per-second USDC streaming on Arc
        </h1>
        <p className="mt-3 max-w-2xl font-mono text-sm leading-relaxed text-foreground/70">
          Deploy the escrow, fund a stream, watch the on-chain <code>earned()</code> meter tick every 500ms. Every button
          below is a real transaction on Arc testnet (chainId {ARC_CHAIN.chainId}).
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-300">
          <span className="font-bold uppercase tracking-wider">error</span> · {error}
        </div>
      )}

      {/* Parties */}
      <div className="grid gap-4 md:grid-cols-3">
        <PartyCard
          role="Payer (agent)"
          address={payerAddr}
          balance={balance.data != null ? `${formatUnits(balance.data, 18)} USDC` : "—"}
          tone="agent"
        />
        <PartyCard
          role="Escrow · StreamPay"
          address={contractAddr}
          balance={hasStream ? `holds ${formatUnits(deposit, 18)} USDC (cap)` : hasContract ? "deployed · idle" : "not deployed"}
          tone="escrow"
        />
        <PartyCard
          role="Payee (service)"
          address={record?.payeeAddr ?? null}
          balance={record?.payeeAddr ? "fresh keypair (this run)" : "not created yet"}
          tone="payee"
          exportKey={record?.payeePriv ?? null}
        />
      </div>

      {/* Action row */}
      <div className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm">
        <div className="grid gap-4 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-foreground/75">Stream config</p>
            <div className="mt-3 grid gap-1 font-mono text-sm text-foreground/85">
              <div><span className="text-muted-foreground">rate</span> · {formatUnits(RATE, 18)} USDC / sec</div>
              <div><span className="text-muted-foreground">cap</span> · {formatUnits(CAP, 18)} USDC ({Number(CAP / RATE)} s at rate)</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {!hasContract && <Btn onClick={onDeploy} busy={busy === "deploy"} icon={<Rocket className="h-4 w-4" />}>Deploy StreamPay</Btn>}
            {hasContract && !hasStream && <Btn onClick={onOpen} busy={busy === "open"} icon={<ArrowDownToLine className="h-4 w-4" />} primary>Fund + Open</Btn>}
            {hasStream && state === "streaming" && (
              <>
                <Btn onClick={onWithdraw} busy={busy === "withdraw"} disabled={withdrawable === 0n}>Withdraw</Btn>
                <Btn onClick={onPause} busy={busy === "pause"} icon={<Pause className="h-4 w-4" />}>Pause</Btn>
                <Btn onClick={onStop} busy={busy === "stop"} icon={<Square className="h-4 w-4" />}>Stop</Btn>
              </>
            )}
            {hasStream && state === "paused" && (
              <>
                <Btn onClick={onResume} busy={busy === "resume"} icon={<Play className="h-4 w-4" />} primary>Resume</Btn>
                <Btn onClick={onStop} busy={busy === "stop"} icon={<Square className="h-4 w-4" />}>Stop</Btn>
              </>
            )}
            {record && record.closed && (
              <Btn onClick={onReset}>New run</Btn>
            )}
          </div>
        </div>
      </div>

      {/* Meter */}
      <div className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-foreground/75">Live meter</p>
          <StateBadge state={hasStream ? state : record?.closed ? "closed" : "streaming"} hasStream={hasStream || !!record?.closed} />
        </div>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          <MeterField label="earned()" value={record ? `${formatUnits(earned, 18)} USDC` : "—"} big pulse={hasStream && state === "streaming"} />
          <MeterField label="withdrawable" value={record ? `${formatUnits(withdrawable, 18)} USDC` : "—"} />
          <MeterField label="withdrawn so far" value={record ? `${formatUnits(totalWithdrawn, 18)} USDC` : "—"} />
        </div>
        {!record && (
          <p className="mt-6 font-mono text-xs text-foreground/60">
            deploy the contract, then open a stream to start the meter.
          </p>
        )}
      </div>

      {/* Tx log */}
      {record && record.txs.length > 0 && (
        <div className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm">
          <p className="mb-4 font-mono text-xs uppercase tracking-wider text-foreground/75">Recent transactions</p>
          <ul className="divide-y divide-border/50">
            {record.txs.slice().reverse().map((t, i) => (
              <li key={t.hash + i} className="flex items-center justify-between gap-4 py-2 font-mono text-xs">
                <span className="w-24 shrink-0 uppercase tracking-wider text-foreground/60">{t.step}</span>
                <span className="flex-1 text-foreground/80">{t.note ?? ""}</span>
                <TxLink hash={t.hash} chain="arc" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Value conservation — shown after stop */}
      {record?.closed && record.finalPayeePaid != null && record.finalRefund != null && (
        <ValueConservation record={record} />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// small components
// -----------------------------------------------------------------------------

function Btn({
  children, onClick, busy, icon, primary, disabled,
}: { children: React.ReactNode; onClick: () => void; busy?: boolean; icon?: React.ReactNode; primary?: boolean; disabled?: boolean }) {
  const base = "inline-flex items-center gap-2 rounded border px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50"
  const style = primary
    ? "border-[#2563eb]/40 bg-[#2563eb]/10 text-foreground hover:bg-[#2563eb]/20"
    : "border-border text-foreground hover:border-[#2563eb]/40 hover:bg-[#2563eb]/5"
  return (
    <button onClick={onClick} disabled={!!busy || !!disabled} className={`${base} ${style}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

function PartyCard({
  role, address, balance, tone, exportKey,
}: { role: string; address: string | null; balance: string; tone: "agent" | "escrow" | "payee"; exportKey?: string | null }) {
  const accent = tone === "agent" ? "text-emerald-400" : tone === "escrow" ? "text-[#2563eb]" : "text-amber-300"
  const [copied, setCopied] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  const short = address ? `${address.slice(0, 6)}…${address.slice(-6)}` : "—"
  const onExportKey = () => {
    if (!exportKey) return
    if (!confirm("This will copy the payee's PRIVATE KEY to your clipboard. Keep it safe — anyone with this key can spend the payee's balance. Continue?")) return
    navigator.clipboard.writeText(exportKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 1500)
  }
  return (
    <div className="rounded-lg border border-border bg-black/40 p-4">
      <p className={`font-mono text-xs uppercase tracking-wider ${accent}`}>{role}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-sm text-foreground/90" title={address ?? undefined}>{short}</span>
        {address && (
          <>
            <button
              onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 900) }}
              className="text-muted-foreground hover:text-foreground"
              title="copy"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <a href={arcExplorerAddr(address)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="arcscan">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {copied && <span className="text-xs text-emerald-400">copied</span>}
          </>
        )}
      </div>
      <p className="mt-1 font-mono text-xs text-foreground/60">{balance}</p>
      {exportKey && (
        <button
          onClick={onExportKey}
          className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {keyCopied ? "key copied — save it now" : "export private key →"}
        </button>
      )}
    </div>
  )
}

function MeterField({ label, value, big, pulse }: { label: string; value: string; big?: boolean; pulse?: boolean }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-foreground/60">{label}</p>
      <p className={`mt-2 font-sans font-light tracking-tight ${big ? "text-3xl" : "text-2xl"}`} style={{ color: "#EDEAE3" }}>
        {value}
      </p>
      {pulse && big && (
        <div className="mt-2 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#2563eb]">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563eb]" />
          streaming
        </div>
      )}
    </div>
  )
}

function StateBadge({ state, hasStream }: { state: "streaming" | "paused" | "closed"; hasStream: boolean }) {
  if (!hasStream) return <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">idle</span>
  const color = state === "streaming" ? "emerald" : state === "paused" ? "amber" : "muted"
  const map: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    muted: "border-border bg-black/20 text-muted-foreground",
  }
  return (
    <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${map[color]}`}>
      {state}
    </span>
  )
}

function ValueConservation({ record }: { record: StreamRecord }) {
  const paid = BigInt(record.finalPayeePaid ?? "0")
  const refund = BigInt(record.finalRefund ?? "0")
  const withdrawnSum = useMemo(() => {
    // sum the earlier Withdrawn amounts from the log (parsed at time of tx)
    let s = 0n
    for (const t of record.txs) {
      if (t.step !== "withdraw" || !t.note) continue
      const m = t.note.match(/\+([\d.]+)\s*USDC/)
      if (m) s += BigInt(Math.round(Number(m[1]) * 1e18))
    }
    return s
  }, [record.txs])
  const totalToPayee = withdrawnSum + paid
  const totalOut = totalToPayee + refund
  const ok = totalOut === CAP
  return (
    <div className={`rounded-xl border p-6 backdrop-blur-sm ${ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"}`}>
      <p className={`font-mono text-xs uppercase tracking-wider ${ok ? "text-emerald-300" : "text-red-300"}`}>
        Value conservation · from on-chain events
      </p>
      <div className="mt-4 grid gap-2 font-mono text-sm text-foreground/85">
        <Row k="paid to payee (withdraws)" v={`${formatUnits(withdrawnSum, 18)} USDC`} />
        <Row k="paid to payee (stop)" v={`${formatUnits(paid, 18)} USDC`} />
        <Row k="refunded to payer" v={`${formatUnits(refund, 18)} USDC`} />
        <Row k="sum" v={`${formatUnits(totalOut, 18)} USDC`} />
        <Row k="deposited (cap)" v={`${formatUnits(CAP, 18)} USDC`} />
      </div>
      <p className={`mt-4 font-mono text-xs ${ok ? "text-emerald-300" : "text-red-300"}`}>
        {ok ? "✓ payee_paid + payer_refund == deposit" : "✗ mismatch — please open an issue"}
      </p>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  )
}
