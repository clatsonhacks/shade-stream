"use client"

import { useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useMyNotes, useContracts, useActivity, balanceUsdc, type NoteRow } from "@/lib/hooks"
import { LiveLog } from "@/components/live-log"
import { ZkPanel, type ZkState } from "@/components/zk-panel"
import { ActivityItem } from "@/components/activity-item"
import { ArrowUpRight, ArrowLeftRight, Check, Lock } from "lucide-react"

type Tab = "withdraw" | "trade"

export default function MovePage() {
  const [tab, setTab] = useState<Tab>("withdraw")
  const { authenticated } = usePrivy()
  const notes = useMyNotes(authenticated)
  const activity = useActivity(authenticated)
  const active = (notes.data?.notes ?? []).filter((n) => n.status === "active")
  const balance = balanceUsdc(notes.data?.notes)
  const recent = (activity.data?.activity ?? [])
    .filter((a) => a.event_type === "withdraw.settled" || a.event_type === "trade.settled")
    .slice(0, 6)

  return (
    <div className="space-y-8">
      <div className="pl-10">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Move</p>
        <h1 className="mt-2 font-sans text-4xl font-light tracking-tight" style={{ color: "#EDEAE3" }}>Spend your private notes</h1>
      </div>

      <div className="flex gap-2 pl-10">
        <TabBtn active={tab === "withdraw"} onClick={() => setTab("withdraw")}>Withdraw</TabBtn>
        <TabBtn active={tab === "trade"} onClick={() => setTab("trade")}>Trade</TabBtn>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="mx-auto w-full max-w-2xl space-y-8">
          {tab === "withdraw" ? <Withdraw /> : <Trade />}
        </div>

        {/* Side panel: private notes summary + recent moves */}
        <aside className="space-y-6">
          <div className="rounded-xl border border-border bg-black/30 p-7 backdrop-blur-sm">
            <p className="font-mono text-sm uppercase tracking-wider text-foreground">Your private notes</p>
            <p className="mt-3 font-sans text-3xl font-light" style={{ color: "#EDEAE3" }}>
              {active.length} <span className="text-sm text-muted-foreground">active</span>
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{balance.toFixed(2)} USDC total</p>
          </div>

          <div className="rounded-xl border border-border bg-black/30 p-7 backdrop-blur-sm">
            <p className="mb-2 font-mono text-sm uppercase tracking-wider text-foreground">Recent moves</p>
            {recent.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">no withdrawals or trades yet.</p>
            ) : (
              <div className="space-y-0.5">
                {recent.map((a, i) => <ActivityItem key={i} event={a.event_type} tx={a.tx_hash} at={a.created_at} compact />)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Withdraw() {
  const { authenticated } = usePrivy()
  const notes = useMyNotes(authenticated)
  const contracts = useContracts()
  const qc = useQueryClient()
  const active = (notes.data?.notes ?? []).filter((n) => n.status === "active")

  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [jobId, setJobId] = useState<string | undefined>()
  const [zk, setZk] = useState<ZkState>({ circuit: "withdraw_public" })
  const [error, setError] = useState<string | null>(null)
  const [doneTx, setDoneTx] = useState<string | null>(null)
  const [signStatus, setSignStatus] = useState<string | null>(null)
  const [fAddr, setFAddr] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const commitment = selected ?? active[0]?.commitment ?? null

  async function connect() {
    setConnecting(true); setError(null)
    try {
      const { connectFreighter } = await import("@/lib/freighter-withdraw")
      setFAddr(await connectFreighter())
    } catch (e) {
      setError((e as Error).message ?? "failed to connect Freighter")
    } finally {
      setConnecting(false)
    }
  }

  async function run() {
    if (!commitment) return
    setBusy(true); setError(null); setJobId(undefined); setDoneTx(null); setSignStatus(null)
    setZk({ circuit: "withdraw_public", verifier: contracts.data?.verifierWithdraw, proving: true, publicSignals: [{ label: "note", value: commitment }] })
    try {
      // 1) backend builds the ZK proof + ASP root (prepare mode — does NOT submit).
      const res = await api.post<{ job_id: string }>("/v1/withdrawals/assist", { commitment, prepare: true })
      setJobId(res.job_id)
      let prep: { recipient: string; pool: string; proofHex: string; publicHex: string } | null = null
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const job = await api.get<{ status: string; result: Record<string, unknown> | null; error: string | null }>(`/v1/jobs/${res.job_id}`)
        if (job.status === "ready") {
          prep = { recipient: String(job.result?.recipient), pool: String(job.result?.pool),
            proofHex: String(job.result?.proofHex ?? job.result?.zkProof), publicHex: String(job.result?.publicHex ?? job.result?.zkPublicSignals) }
          setZk((z) => ({ ...z, proving: false, proofHex: prep!.proofHex, publicHex: prep!.publicHex }))
          break
        }
        if (job.status === "failed") throw new Error(job.error ?? "withdraw prepare failed")
      }
      if (!prep) throw new Error("withdraw prepare timed out")

      // 2) USER signs pool.withdraw's require_auth() in their own Stellar wallet (Freighter).
      const { freighterWithdraw } = await import("@/lib/freighter-withdraw")
      const tx = await freighterWithdraw({ ...prep, onStatus: setSignStatus })

      // 3) record the spend (proof already verified on-chain by the tx).
      setSignStatus("recording")
      await api.post("/v1/withdrawals/mark-spent", { commitment, tx_hash: tx })
      setDoneTx(tx); setSignStatus(null)
      setZk((z) => ({ ...z, proving: false, verifiedOnChain: true, txHash: tx, nullifier: commitment }))
      await qc.invalidateQueries({ queryKey: ["my-notes"] })
      await qc.invalidateQueries({ queryKey: ["activity"] })
    } catch (e) {
      setError((e as { error?: string; message?: string }).error ?? (e as Error).message ?? "withdraw failed")
      setZk((z) => ({ ...z, proving: false })); setSignStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#2563eb]/40 hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.35)]">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Private note to spend</p>
        {active.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">no active notes — <a href="/deposit" className="text-[#2563eb] hover:underline">shield some USDC first</a>.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {active.map((n) => (
              <button
                key={n.commitment}
                onClick={() => setSelected(n.commitment)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  commitment === n.commitment ? "border-[#2563eb]/50 bg-[#2563eb]/10 backdrop-blur-sm" : "border-border bg-black/30 backdrop-blur-sm hover:border-border/80"
                }`}
              >
                <span className="font-mono text-xs text-foreground/70">{n.commitment.slice(0, 12)}…{n.commitment.slice(-6)}</span>
                <span className="font-sans text-lg font-light" style={{ color: "#EDEAE3" }}>{(Number(n.amount_usdc_7dp) / 1e7).toFixed(2)} <span className="text-xs text-muted-foreground">USDC</span></span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 text-muted-foreground">
          <ArrowUpRight className="h-4 w-4 text-[#2563eb]" />
          <span className="font-mono text-xs">Releases USDC to your Stellar account · you sign <span className="text-foreground/80">pool.withdraw</span> in Freighter</span>
        </div>

        {fAddr ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-4 py-2.5">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-emerald-400"><Lock className="h-3.5 w-3.5" /> Freighter connected</span>
              <span className="font-mono text-xs text-foreground/70">{fAddr.slice(0, 6)}…{fAddr.slice(-4)}</span>
            </div>
            <button
              onClick={run}
              disabled={busy || !commitment}
              className="mt-4 w-full rounded-full border border-[#2563eb]/40 bg-[#2563eb]/10 px-6 py-3 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:bg-[#2563eb]/20 disabled:opacity-40"
            >
              {busy ? (signStatus ?? "Proving…") : "Withdraw note"}
            </button>
          </>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="mt-5 w-full rounded-full border border-[#2563eb]/40 bg-[#2563eb]/10 px-6 py-3 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:bg-[#2563eb]/20 disabled:opacity-40"
          >
            {connecting ? "Connecting…" : "Connect Freighter"}
          </button>
        )}
        {signStatus && <p className="mt-2 flex items-center gap-2 font-mono text-[10px] text-[#2563eb]"><Lock className="h-3 w-3" /> {signStatus}</p>}
        {error && <p className="mt-3 font-mono text-xs text-red-400">error: {error}</p>}
        {doneTx && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-4 py-2.5 font-mono text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Withdrawn · nullifier spent · USDC released
          </div>
        )}
      </div>

      {jobId && <LiveLog jobId={jobId} title="Prover + Stellar · withdraw_public ZK" />}
      {(jobId || busy) && <ZkPanel state={zk} />}
    </div>
  )
}



// The four architecture stages, mapped from the backend job's status timeline.
const STAGES = [
  { key: "intent", label: "RFQ intent", sub: "trade lifecycle", match: ["queued"] },
  { key: "match", label: "MPC private match", sub: "committee crosses it, amount hidden", match: ["committee_matching", "quoting", "pinning_committee"] },
  { key: "zk", label: "ZK proof", sub: "note proven real, bound to the match", match: ["proving"] },
  { key: "settle", label: "Contract settles", sub: "all three agree", match: ["submitting", "ready"] },
] as const

function stageState(stageIdx: number, statuses: string[], done: boolean): "done" | "active" | "idle" {
  const reached = (i: number) => STAGES[i].match.some((m) => statuses.some((s) => s.includes(m)))
  if (done) return "done"
  if (reached(stageIdx)) {
    // active if it's the furthest reached stage, else done
    const furthest = STAGES.reduce((acc, _, i) => (reached(i) ? i : acc), -1)
    return stageIdx < furthest ? "done" : "active"
  }
  return "idle"
}

function Trade() {
  const { authenticated } = usePrivy()
  const notes = useMyNotes(authenticated)
  const contracts = useContracts()
  const qc = useQueryClient()
  const active = (notes.data?.notes ?? []).filter((n) => n.status === "active")

  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [jobId, setJobId] = useState<string | undefined>()
  const [statuses, setStatuses] = useState<string[]>([])
  const [zk, setZk] = useState<ZkState>({ circuit: "mpc committee settlement" })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ tx: string; xlm: string; specpure: boolean } | null>(null)

  const commitment = selected ?? active[0]?.commitment ?? null
  const note = active.find((n) => n.commitment === commitment) ?? active[0]
  const inUsdc = note ? Number(note.amount_usdc_7dp) / 1e7 : 0
  const outXlm = inUsdc * 1.0 // committee crosses equal-value notes at 1:1

  async function run() {
    if (!commitment) return
    setBusy(true); setError(null); setJobId(undefined); setDone(null); setStatuses(["queued"])
    setZk({ circuit: "mpc committee settlement", verifier: contracts.data?.verifierWithdraw, proving: true, publicSignals: [
      { label: "intent", value: commitment }, { label: "output", value: "XLM" }, { label: "committee", value: "3-node threshold" },
    ] })
    try {
      const res = await api.post<{ job_id: string; intent_hash?: string }>("/v1/trade", { commitment, private: true })
      setJobId(res.job_id)
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const job = await api.get<{ status: string; result: Record<string, unknown> | null; error: string | null; events?: { status: string }[] }>(`/v1/jobs/${res.job_id}`)
        setStatuses((job.events ?? []).map((e) => e.status).concat(job.status))
        if (job.status === "ready") {
          const tx = String(job.result?.txHash ?? "")
          const specpure = !!job.result?.onChainCommitteeVerify
          setDone({ tx, xlm: String(job.result?.outputXlm ?? outXlm.toFixed(4)), specpure })
          setZk((z) => ({ ...z, circuit: specpure ? "mpc_priced_settlement" : "rfq_atomic_swap", proving: false, verifiedOnChain: true, txHash: tx, nullifier: String(job.result?.nullifierA ?? commitment),
            proofHex: job.result?.zkProof ? String(job.result.zkProof) : undefined, publicHex: job.result?.zkPublicSignals ? String(job.result.zkPublicSignals) : undefined,
            publicSignals: [{ label: "intent", value: commitment }, { label: "output", value: "XLM" }, { label: "committee", value: specpure ? "3-node · verified on-chain" : "3-node threshold" }] }))
          await qc.invalidateQueries({ queryKey: ["my-notes"] })
          await qc.invalidateQueries({ queryKey: ["activity"] })
          break
        }
        if (job.status === "failed") throw new Error(job.error ?? "trade failed")
      }
    } catch (e) {
      setError((e as { error?: string; message?: string }).error ?? (e as Error).message ?? "trade failed")
      setZk((z) => ({ ...z, proving: false }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#2563eb]/40 hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.35)]">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Private note to trade</p>
        {active.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">no active notes — <a href="/deposit" className="text-[#2563eb] hover:underline">shield some USDC first</a>.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {active.map((n) => (
              <button
                key={n.commitment}
                onClick={() => setSelected(n.commitment)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  commitment === n.commitment ? "border-[#2563eb]/50 bg-[#2563eb]/10 backdrop-blur-sm" : "border-border bg-black/30 backdrop-blur-sm hover:border-border/80"
                }`}
              >
                <span className="font-mono text-xs text-foreground/70">{n.commitment.slice(0, 12)}…{n.commitment.slice(-6)}</span>
                <span className="font-sans text-lg font-light" style={{ color: "#EDEAE3" }}>{(Number(n.amount_usdc_7dp) / 1e7).toFixed(2)} <span className="text-xs text-muted-foreground">USDC</span></span>
              </button>
            ))}
          </div>
        )}

        {/* Preview: USDC in -> XLM out */}
        <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-border bg-black/40 px-4 py-4 backdrop-blur-sm">
          <div className="text-center">
            <p className="font-sans text-2xl font-light" style={{ color: "#EDEAE3" }}>{inUsdc.toFixed(2)}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">USDC · private</p>
          </div>
          <ArrowLeftRight className="h-5 w-5 shrink-0 text-[#2563eb]" />
          <div className="text-center">
            <p className="font-sans text-2xl font-light" style={{ color: "#EDEAE3" }}>{outXlm.toFixed(2)}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">XLM · to you</p>
          </div>
        </div>

        {/* Always private: the committee crosses it privately, amount hidden */}
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-[#2563eb]/30 bg-[#2563eb]/5 px-4 py-3 font-mono text-[11px] text-foreground/80">
          <Lock className="h-4 w-4 shrink-0 text-[#2563eb]" />
          Private matching by the MPC committee · your amount is revealed to no single party
        </p>

        <button
          onClick={run}
          disabled={busy || !commitment}
          className="mt-5 w-full rounded-full border border-[#2563eb]/40 bg-[#2563eb]/10 px-6 py-3 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:bg-[#2563eb]/20 disabled:opacity-40"
        >
          {busy ? "Trading…" : "Execute trade"}
        </button>
        {error && <p className="mt-3 font-mono text-xs text-red-400">error: {error}</p>}
        {done && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-4 py-2.5 font-mono text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" /> {done.specpure ? `Settled on-chain · committee sigs + ZK verified · note↔note cross · ${done.xlm} XLM` : `Settled · committee-matched · ${done.xlm} XLM`}
          </div>
        )}
      </div>

      {/* Architecture lifecycle: RFQ intent -> MPC match -> ZK -> settle */}
      {(busy || done) && (
        <div className="rounded-xl border border-border bg-black/30 p-5 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#2563eb]/40 hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.35)]">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Pipeline · all three must agree</p>
          <div className="space-y-3">
            {STAGES.map((s, i) => {
              const st = stageState(i, statuses, !!done)
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                    st === "done" ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400"
                    : st === "active" ? "border-[#2563eb]/60 bg-[#2563eb]/10 text-[#2563eb]"
                    : "border-border text-muted-foreground"
                  }`}>
                    {st === "done" ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-mono text-xs ${st === "idle" ? "text-muted-foreground" : "text-foreground/90"}`}>{s.label}{st === "active" ? " …" : ""}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{s.sub}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {jobId && <LiveLog jobId={jobId} title="RFQ intent → MPC committee → ZK → settle" />}
      {(jobId || busy) && <ZkPanel state={zk} />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-5 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
        active ? "border-[#2563eb]/50 bg-[#2563eb]/10 text-foreground backdrop-blur-sm" : "border-border bg-black/30 text-muted-foreground backdrop-blur-sm hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}
