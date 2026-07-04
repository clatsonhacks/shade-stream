"use client"

import { useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { api } from "@/lib/api"
import { useMyNotes, useActivity } from "@/lib/hooks"
import { TxLink } from "@/components/tx-link"
import { ActivityItem } from "@/components/activity-item"
import { FileCheck2, ShieldCheck, Check, KeyRound } from "lucide-react"

// Shade View: privacy is the default, but the note owner can produce a signed,
// selective-disclosure report for an auditor — proving which notes/nullifiers/
// settlements are theirs in a time range, without revealing anything else.
type SignedReport = {
  reportId: string
  generatedAt: string
  noteCommitments: string[]
  disclosedNullifiers: string[]
  policyId?: string
  amountsDisclosed?: { commitment: string; amount7dp: string; currency: string }[]
  proofLinks: string[]
  servicePubkeyHex: string
  serviceSignatureHex: string
}

export default function CompliancePage() {
  const { authenticated } = usePrivy()
  const notes = useMyNotes(authenticated)
  const activity = useActivity(authenticated)
  const owned = notes.data?.notes ?? []
  const recentReports = (activity.data?.activity ?? [])
    .filter((a) => a.event_type === "shade_view.report.generate")
    .slice(0, 6)

  const [discloseAmounts, setDiscloseAmounts] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<SignedReport | null>(null)

  async function generate() {
    setBusy(true); setError(null); setReport(null)
    try {
      const res = await api.post<{ report: SignedReport }>("/v1/reports/view-key", {
        note_commitments: owned.map((n) => n.commitment),
        disclose_amounts: discloseAmounts,
      })
      setReport(res.report)
    } catch (e) {
      setError((e as { error?: string; message?: string }).error ?? (e as Error).message ?? "failed to generate report")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Compliance · Shade View</p>
        <h1 className="mt-2 font-sans text-4xl font-light tracking-tight" style={{ color: "#EDEAE3" }}>Selective disclosure</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Private by default. Prove your own activity to an auditor — signed, and only what you choose to reveal.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="mx-auto w-full max-w-2xl space-y-8">
      <div className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#2563eb]/40 hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.35)]">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <FileCheck2 className="h-3.5 w-3.5 text-[#2563eb]" /> Generate a view-key report
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Discloses your {owned.length} note{owned.length === 1 ? "" : "s"} + their nullifiers and on-chain settlement proofs, signed by the Shade View service (ed25519). Nothing about other users is revealed.
        </p>

        <button
          onClick={() => !busy && setDiscloseAmounts((v) => !v)}
          disabled={busy}
          className={`mt-4 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
            discloseAmounts ? "border-[#2563eb]/50 bg-[#2563eb]/10 backdrop-blur-sm" : "border-border bg-black/30 backdrop-blur-sm"
          }`}
        >
          <span>
            <span className="block font-mono text-xs text-foreground/90">Disclose amounts</span>
            <span className="block font-mono text-[10px] text-muted-foreground">{discloseAmounts ? "include note values in the report" : "commitments + nullifiers only, no amounts"}</span>
          </span>
          <span className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${discloseAmounts ? "bg-[#2563eb]/60" : "bg-border"}`}>
            <span className={`h-4 w-4 rounded-full bg-white transition-transform ${discloseAmounts ? "translate-x-4" : ""}`} />
          </span>
        </button>

        <button
          onClick={generate}
          disabled={busy || owned.length === 0}
          className="mt-5 w-full rounded-full border border-[#2563eb]/40 bg-[#2563eb]/10 px-6 py-3 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:bg-[#2563eb]/20 disabled:opacity-40"
        >
          {busy ? "Signing report…" : "Generate signed report"}
        </button>
        {owned.length === 0 && <p className="mt-3 font-mono text-xs text-muted-foreground">no notes to disclose yet — <a href="/deposit" className="text-[#2563eb] hover:underline">shield some USDC</a> first.</p>}
        {error && <p className="mt-3 font-mono text-xs text-red-400">error: {error}</p>}
      </div>

      {report && (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.03] p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-emerald-400/45 hover:shadow-[0_10px_30px_-12px_rgba(52,211,153,0.35)]">
          <div className="flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-wider text-emerald-400">
            <ShieldCheck className="h-4 w-4" /> Signed view-key report
          </div>
          <div className="mt-4 space-y-3 font-mono text-xs">
            <Row label="Report ID" value={report.reportId} />
            <Row label="Generated" value={new Date(report.generatedAt).toLocaleString()} />
            {report.policyId && <Row label="Policy" value={report.policyId} />}

            <Field label={`Disclosed notes (${report.noteCommitments.length})`}>
              {report.noteCommitments.map((c) => <Hash key={c} v={c} />)}
              {report.noteCommitments.length === 0 && <span className="text-muted-foreground">none</span>}
            </Field>

            <Field label={`Disclosed nullifiers (${report.disclosedNullifiers.length})`}>
              {report.disclosedNullifiers.map((n) => <Hash key={n} v={n} />)}
              {report.disclosedNullifiers.length === 0 && <span className="text-muted-foreground">none spent in range</span>}
            </Field>

            {report.amountsDisclosed && report.amountsDisclosed.length > 0 && (
              <Field label="Amounts">
                {report.amountsDisclosed.map((a) => (
                  <div key={a.commitment} className="flex justify-between gap-3 py-0.5">
                    <span className="truncate text-foreground/60">{a.commitment.slice(0, 14)}…</span>
                    <span className="text-foreground/90">{(Number(a.amount7dp) / 1e7).toFixed(2)} {a.currency}</span>
                  </div>
                ))}
              </Field>
            )}

            {report.proofLinks.length > 0 && (
              <Field label="On-chain settlement proofs">
                {report.proofLinks.map((l) => {
                  const hash = l.split("/tx/")[1] ?? l
                  return <div key={l} className="py-0.5"><TxLink hash={hash} /></div>
                })}
              </Field>
            )}

            <div className="rounded-lg border border-border bg-black/40 p-3 backdrop-blur-sm">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Service signature (ed25519) · auditor-verifiable</p>
              <Row label="Signer pubkey" value={report.servicePubkeyHex} />
              <Row label="Signature" value={report.serviceSignatureHex} />
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400"><Check className="h-3 w-3" /> An auditor verifies this signature against the signer pubkey — no trust in the app required.</p>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Side panel: explainer + recent report activity */}
      <aside className="space-y-6">
        <div className="rounded-xl border border-border bg-black/30 p-7 backdrop-blur-sm">
          <p className="mb-4 font-mono text-sm uppercase tracking-wider text-foreground">How disclosure works</p>
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#2563eb]/30 bg-[#2563eb]/10">
              <KeyRound className="h-4 w-4 text-[#2563eb]" />
            </span>
            <p className="font-mono text-sm leading-relaxed text-foreground/90">Note → Nullifier → On-chain proof — only what you choose is revealed</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-black/30 p-7 backdrop-blur-sm">
          <p className="mb-2 font-mono text-sm uppercase tracking-wider text-foreground">Recent reports</p>
          {recentReports.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">no reports generated yet.</p>
          ) : (
            <div className="space-y-0.5">
              {recentReports.map((a, i) => <ActivityItem key={i} event={a.event_type} tx={a.tx_hash} at={a.created_at} compact />)}
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate text-foreground/80">{value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-black/30 p-3 backdrop-blur-sm">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function Hash({ v }: { v: string }) {
  return <div className="truncate py-0.5 text-foreground/70">{v.slice(0, 18)}…{v.slice(-10)}</div>
}
