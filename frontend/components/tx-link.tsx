"use client"

import { stellarTx, arbTx, arcTx, baseTx, shortHash } from "@/lib/explorer"
import { ExternalLink } from "lucide-react"

export type TxChain = "stellar" | "arb" | "arc" | "base"

// Fallback when the caller doesn't pin the chain: 0x-prefixed → Arbitrum
// (legacy default — Stellar-era pages depend on this). New nanopayment pages
// (/stream, /bridge, /receipts) MUST pass `chain="arc" | "base"` explicitly.
export function inferChain(hash: string): TxChain {
  return hash.startsWith("0x") ? "arb" : "stellar"
}

const EXPLORER: Record<TxChain, (h: string) => string> = {
  stellar: stellarTx,
  arb: arbTx,
  arc: arcTx,
  base: baseTx,
}

// Clickable, truncated tx hash -> explorer. Chain auto-inferred from the hash
// unless pinned via the `chain` prop.
export function TxLink({ hash, chain, label }: { hash?: string | null; chain?: TxChain; label?: string }) {
  if (!hash) return <span className="text-muted-foreground">—</span>
  const c = chain ?? inferChain(hash)
  const href = EXPLORER[c](hash)
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-[#2563eb] hover:underline"
      title={hash}
    >
      {label ?? shortHash(hash)}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}
