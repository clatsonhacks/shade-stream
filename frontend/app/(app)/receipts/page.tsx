"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { usePrivy } from "@privy-io/react-auth"
import { Contract, formatUnits, Interface, type Log } from "ethers"
import { ChevronDown, ExternalLink, RefreshCw, ShieldCheck, Zap } from "lucide-react"

import { TxLink } from "@/components/tx-link"
import { arcProvider, arcExplorerAddr, ARC_CHAIN } from "@/lib/arc"
import artifact from "@/lib/artifacts/StreamPay.json"

const LS_ADDR = "streampay:5042002:addr"

// Reference contract from the recorded live run (docs/testnet-transactions.md).
// If the user hasn't deployed their own, we still have something to render.
const REFERENCE_STREAMPAY = "0x469305823f9796f973363F48a508a47309B2D92c"

// Arc RPC caps eth_getLogs to a 10k-block range. We scan the tail — recent runs
// are almost always what the user cares about; for deeper history point at
// arcscan directly. This matches the pattern in fetchChannelReceipt.
const LOG_WINDOW = 9_500

const abi = (artifact as any).abi as any[]
const iface = new Interface(abi)

type EventRow =
  | { kind: "opened"; id: string; payer: string; payee: string; rate: bigint; deposit: bigint; tx: string; block: number }
  | { kind: "withdrawn"; id: string; amount: bigint; totalPaid: bigint; tx: string; block: number }
  | { kind: "paused"; id: string; accrued: bigint; tx: string; block: number }
  | { kind: "resumed"; id: string; tx: string; block: number }
  | { kind: "stopped"; id: string; paidToPayee: bigint; refundToPayer: bigint; tx: string; block: number }

export default function ReceiptsPage() {
  const router = useRouter()
  const { ready, authenticated } = usePrivy()
  useEffect(() => { if (ready && !authenticated) router.replace("/") }, [ready, authenticated, router])

  const [userAddr, setUserAddr] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window !== "undefined") setUserAddr(window.localStorage.getItem(LS_ADDR))
  }, [])

  const contracts = useMemo(() => {
    const list: { addr: string; label: string }[] = []
    if (userAddr) list.push({ addr: userAddr, label: "your deployment" })
    if (!userAddr || userAddr.toLowerCase() !== REFERENCE_STREAMPAY.toLowerCase()) {
      list.push({ addr: REFERENCE_STREAMPAY, label: "reference (2026-07-05 live run)" })
    }
    return list
  }, [userAddr])

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-foreground/70">
          Persisted run history · Arc testnet events
        </p>
        <h1 className="mt-3 flex items-center gap-3 font-sans text-4xl font-light tracking-tight" style={{ color: "#EDEAE3" }}>
          Receipts
        </h1>
        <p className="mt-3 max-w-2xl font-mono text-sm leading-relaxed text-foreground/70">
          Reconstructed live from on-chain events (<code>Opened / Withdrawn / Paused / Resumed / Stopped</code>) on Arc testnet.
          Scans the last {LOG_WINDOW.toLocaleString()} blocks per contract — for deeper history, follow the arcscan links.
        </p>
      </header>

      {/* Rail A · StreamPay history — real */}
      <section className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#2563eb]" />
            <p className="font-mono text-xs uppercase tracking-wider text-foreground/85">Rail A · StreamPay</p>
          </div>
        </div>
        {contracts.length === 0 && (
          <p className="font-mono text-xs text-foreground/60">
            no deployed contract yet — <a href="/stream" className="text-[#2563eb] hover:underline">deploy one</a>.
          </p>
        )}
        <div className="space-y-6">
          {contracts.map((c) => <ContractEvents key={c.addr} address={c.addr} label={c.label} />)}
        </div>
      </section>

      {/* Rail B · Shielded — pointer, not implemented */}
      <section className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#2563eb]" />
          <p className="font-mono text-xs uppercase tracking-wider text-foreground/85">Rail B · Shielded settles</p>
        </div>
        <p className="font-mono text-xs leading-relaxed text-foreground/70">
          The privacy-layer settle events live in <code>StreamEscrow.sol</code> on Arc — see the deployed pool at{" "}
          <a
            href={`${ARC_CHAIN.explorer}/address/0xee1B…d29b`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#2563eb] hover:underline"
          >
            0xee1B…d29b <ExternalLink className="h-3 w-3" />
          </a>
          {" "}(recorded 2026-06 live run, docs/testnet-transactions.md). Browser rendering of these will land with the /service slice
          once the proof-building backend is wired.
        </p>
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------

function ContractEvents({ address, label }: { address: string; label: string }) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanned, setScanned] = useState<{ from: number; to: number } | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const provider = arcProvider()
      const head = await provider.getBlockNumber()
      const from = Math.max(0, head - LOG_WINDOW)
      const logs = await provider.getLogs({ address, fromBlock: from, toBlock: head })
      const rows: EventRow[] = []
      for (const l of logs) {
        const parsed = safeParse(l)
        if (!parsed) continue
        rows.push(parsed)
      }
      rows.sort((a, b) => b.block - a.block)
      setEvents(rows); setScanned({ from, to: head })
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e))
    } finally { setLoading(false) }
  }

  useEffect(() => { load() /* on mount + on address change */ }, [address])

  // Group by stream id so a run is one thread of events.
  const grouped = useMemo(() => {
    const m = new Map<string, EventRow[]>()
    for (const e of events) {
      const list = m.get(e.id) ?? []
      list.push(e)
      m.set(e.id, list)
    }
    // sort each group by block descending
    for (const [, list] of m) list.sort((a, b) => b.block - a.block)
    // return sorted by newest event descending
    return Array.from(m.entries()).sort((a, b) => (b[1][0]?.block ?? 0) - (a[1][0]?.block ?? 0))
  }, [events])

  return (
    <div className="space-y-3 rounded-lg border border-border bg-black/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border bg-black/40 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground/75">
            {label}
          </span>
          <a
            href={arcExplorerAddr(address)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-[#2563eb] hover:underline"
            title={address}
          >
            {address.slice(0, 8)}…{address.slice(-6)} <ExternalLink className="h-3 w-3" />
          </a>
          {scanned && (
            <span className="font-mono text-[10px] text-foreground/50">
              scanned blocks {scanned.from.toLocaleString()}–{scanned.to.toLocaleString()}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground/75 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> reload
        </button>
      </div>

      {error && (
        <p className="rounded border border-red-500/40 bg-red-500/10 p-2 font-mono text-xs text-red-300">{error}</p>
      )}
      {!loading && !error && grouped.length === 0 && (
        <p className="font-mono text-xs text-foreground/60">no runs in the recent {LOG_WINDOW.toLocaleString()}-block window.</p>
      )}

      <div className="space-y-3">
        {grouped.map(([id, rows]) => <RunCard key={id} id={id} rows={rows} />)}
      </div>
    </div>
  )
}

function RunCard({ id, rows }: { id: string; rows: EventRow[] }) {
  const [open, setOpen] = useState(false)
  const opened = rows.find((r) => r.kind === "opened") as Extract<EventRow, { kind: "opened" }> | undefined
  const stopped = rows.find((r) => r.kind === "stopped") as Extract<EventRow, { kind: "stopped" }> | undefined
  const withdraws = rows.filter((r) => r.kind === "withdrawn") as Extract<EventRow, { kind: "withdrawn" }>[]
  const totalWithdrawn = withdraws.reduce((a, w) => a + w.amount, 0n)
  const totalToPayee = totalWithdrawn + (stopped?.paidToPayee ?? 0n)
  const totalRefund = stopped?.refundToPayer ?? 0n

  const status =
    stopped ? "closed"
    : opened ? "active"
    : "unknown"

  return (
    <div className="rounded border border-border/70 bg-black/30 p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-foreground/60">stream</span>
            <span className="text-foreground/90">{id.slice(0, 10)}…{id.slice(-6)}</span>
            <StatusPill status={status} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-foreground/60">
            {opened && `cap ${formatUnits(opened.deposit, 18)} USDC @ ${formatUnits(opened.rate, 18)}/s`}
            {stopped && ` · closed`}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {opened && (
            <div className="font-mono text-xs text-foreground/80">
              <Kv k="payer" v={<AddrSpan addr={opened.payer} />} />
              <Kv k="payee" v={<AddrSpan addr={opened.payee} />} />
              <Kv k="deposit" v={`${formatUnits(opened.deposit, 18)} USDC`} />
              <Kv k="rate" v={`${formatUnits(opened.rate, 18)} USDC / sec`} />
            </div>
          )}

          <ol className="space-y-1 border-l border-border/70 pl-3">
            {rows.slice().reverse().map((r, i) => <EventLine key={r.tx + i} row={r} />)}
          </ol>

          {stopped && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="font-mono text-[11px] uppercase tracking-wider text-emerald-300">on-chain settlement</p>
              <div className="mt-2 grid gap-1 font-mono text-xs text-foreground/85">
                <Kv k="paid to payee (withdraws)" v={`${formatUnits(totalWithdrawn, 18)} USDC`} />
                <Kv k="paid to payee (stop)" v={`${formatUnits(stopped.paidToPayee, 18)} USDC`} />
                <Kv k="payee total" v={`${formatUnits(totalToPayee, 18)} USDC`} />
                <Kv k="refunded to payer" v={`${formatUnits(totalRefund, 18)} USDC`} />
                <Kv k="sum" v={`${formatUnits(totalToPayee + totalRefund, 18)} USDC`} />
                {opened && (
                  <Kv
                    k="invariant"
                    v={
                      totalToPayee + totalRefund === opened.deposit
                        ? <span className="text-emerald-300">✓ payee + refund == deposit</span>
                        : <span className="text-red-300">✗ mismatch</span>
                    }
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EventLine({ row }: { row: EventRow }) {
  const label: Record<EventRow["kind"], string> = {
    opened: "opened",
    withdrawn: "withdrawn",
    paused: "paused",
    resumed: "resumed",
    stopped: "stopped",
  }
  const note =
    row.kind === "withdrawn" ? `+${formatUnits(row.amount, 18)} USDC → payee`
    : row.kind === "stopped" ? `payee +${formatUnits(row.paidToPayee, 18)} · payer +${formatUnits(row.refundToPayer, 18)}`
    : row.kind === "opened" ? `cap ${formatUnits(row.deposit, 18)} · rate ${formatUnits(row.rate, 18)}/s`
    : ""
  return (
    <li className="flex items-center justify-between gap-3 font-mono text-xs">
      <span className="w-24 shrink-0 uppercase tracking-wider text-foreground/60">{label[row.kind]}</span>
      <span className="flex-1 text-foreground/75">{note}</span>
      <TxLink hash={row.tx} chain="arc" />
    </li>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "closed"
    ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
    : status === "active"
    ? "border-[#2563eb]/40 bg-[#2563eb]/5 text-[#2563eb]"
    : "border-border text-muted-foreground"
  return <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${cls}`}>{status}</span>
}

function AddrSpan({ addr }: { addr: string }) {
  const short = `${addr.slice(0, 6)}…${addr.slice(-6)}`
  return (
    <a
      href={arcExplorerAddr(addr)}
      target="_blank"
      rel="noreferrer"
      title={addr}
      className="inline-flex items-center gap-1 text-[#2563eb] hover:underline"
    >
      {short} <ExternalLink className="h-3 w-3" />
    </a>
  )
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}

// -----------------------------------------------------------------------------

function safeParse(l: Log): EventRow | null {
  try {
    const p = iface.parseLog({ topics: [...l.topics], data: l.data })
    if (!p) return null
    const base = { tx: l.transactionHash!, block: Number(l.blockNumber) }
    switch (p.name) {
      case "Opened":
        return { kind: "opened", id: p.args[0] as string, payer: p.args[1] as string, payee: p.args[2] as string, rate: p.args[3] as bigint, deposit: p.args[4] as bigint, ...base }
      case "Withdrawn":
        return { kind: "withdrawn", id: p.args[0] as string, amount: p.args[1] as bigint, totalPaid: p.args[2] as bigint, ...base }
      case "Paused":
        return { kind: "paused", id: p.args[0] as string, accrued: p.args[1] as bigint, ...base }
      case "Resumed":
        return { kind: "resumed", id: p.args[0] as string, ...base }
      case "Stopped":
        return { kind: "stopped", id: p.args[0] as string, paidToPayee: p.args[1] as bigint, refundToPayer: p.args[2] as bigint, ...base }
    }
  } catch { /* not ours */ }
  return null
}
