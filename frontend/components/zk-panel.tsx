"use client"

// The ZK proof panel — the hackathon hero. Shows the zero-knowledge story for an
// action: proving → public signals → verified on-chain by the Soroban verifier →
// pairing check → nullifier spent. Expandable Proof Inspector shows the raw Groth16
// proof bytes + public inputs. Rendered inline on every action page.
import { useState } from "react"
import { ShieldCheck, Cpu, Link2, Code2, ChevronDown, Copy } from "lucide-react"

export type ZkState = {
  circuit?: string // e.g. "withdraw_public"
  verifier?: string // on-chain verifier contract id
  proving?: boolean
  verifiedOnChain?: boolean
  txHash?: string // the on-chain verify/settle tx
  nullifier?: string
  publicSignals?: { label: string; value: string }[]
  proofHex?: string // raw Groth16 proof bytes (BLS12-381), hex
  publicHex?: string // raw public inputs, hex
}

const EXPLORER = "https://stellar.expert/explorer/testnet/tx/"

export function ZkPanel({ state }: { state: ZkState }) {
  const { circuit, verifier, proving, verifiedOnChain, txHash, nullifier, publicSignals, proofHex, publicHex } = state
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-[#2563eb]/25 bg-black/40 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <ShieldCheck className="h-3.5 w-3.5 text-[#2563eb]" />
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Zero-Knowledge Proof{circuit ? ` · ${circuit}` : ""}
        </span>
      </div>
      <div className="space-y-3 p-4 font-mono text-xs">
        <Row icon={<Cpu className="h-3.5 w-3.5" />} label="Groth16 / BLS12-381">
          {proving ? <span className="text-[#2563eb]">generating proof…</span>
            : verifiedOnChain ? <span className="text-emerald-400">proof generated + verified</span>
            : <span className="text-muted-foreground">idle</span>}
        </Row>

        {publicSignals && publicSignals.length > 0 && (
          <div className="rounded border border-border bg-black/30 p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">public signals</p>
            {publicSignals.map((s, i) => (
              <div key={i} className="flex justify-between gap-4 py-0.5">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="truncate text-foreground/80">{s.value}</span>
              </div>
            ))}
          </div>
        )}

        <Row icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Verified on-chain">
          {verifiedOnChain
            ? <span className="text-emerald-400">pairing_check passed{verifier ? ` · ${short(verifier)}` : ""}</span>
            : <span className="text-muted-foreground">pending</span>}
        </Row>

        {nullifier && (
          <Row icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Nullifier spent">
            <span className="truncate text-foreground/80">{short(nullifier)}</span>
          </Row>
        )}

        {txHash && (
          <a href={`${EXPLORER}${txHash}`} target="_blank" rel="noreferrer"
             className="flex items-center gap-2 text-[#2563eb] hover:underline">
            <Link2 className="h-3.5 w-3.5" /> {short(txHash)} — view on explorer
          </a>
        )}

        {/* Proof Inspector — the actual Groth16 proof + public inputs the verifier checked */}
        {(proofHex || publicHex) && (
          <div className="rounded border border-border bg-black/30">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Code2 className="h-3.5 w-3.5 text-[#2563eb]" /> Inspect proof
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="space-y-3 border-t border-border p-3">
                {proofHex && <Blob label="Groth16 proof · BLS12-381 (bytes)" value={proofHex} note={`${byteLen(proofHex)} bytes`} />}
                {publicHex && <Blob label="Public inputs (bytes)" value={publicHex} note={`${byteLen(publicHex)} bytes`} />}
                <p className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> these exact bytes were passed to {verifier ? short(verifier) : "the verifier"}.verify() on-chain → returned true
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Blob({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1000) }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> {copied ? "copied" : note ?? "copy"}
        </button>
      </div>
      <div className="max-h-28 overflow-y-auto rounded bg-black/50 p-2">
        <code className="break-all text-[10px] leading-relaxed text-[#7dd3fc]">{value}</code>
      </div>
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function byteLen(hex: string): number {
  return Math.floor(hex.replace(/^0x/, "").length / 2)
}

function short(s: string): string {
  if (!s) return ""
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s
}
