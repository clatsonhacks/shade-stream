"use client"

import { usePrivy } from "@privy-io/react-auth"
import { useActivity } from "@/lib/hooks"
import { ActivityItem, ACTIVITY_HIDE } from "@/components/activity-item"

export default function ActivityPage() {
  const { authenticated } = usePrivy()
  const activity = useActivity(authenticated)
  const items = (activity.data?.activity ?? []).filter((a) => !ACTIVITY_HIDE.test(a.event_type))

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Activity</p>
        <h1 className="mt-2 font-sans text-4xl font-light tracking-tight" style={{ color: "#EDEAE3" }}>Your private history</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">every shield, trade, and disclosure · on-chain proofs linked</p>
      </div>

      <div className="rounded-xl border border-border bg-black/30 p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#2563eb]/40 hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.35)]">
        {items.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">no activity yet — <a href="/deposit" className="text-[#2563eb] hover:underline">shield some USDC</a> to begin.</p>
        ) : (
          <div className="space-y-0.5">
            {items.map((a, i) => <ActivityItem key={i} event={a.event_type} tx={a.tx_hash} at={a.created_at} />)}
          </div>
        )}
      </div>
    </div>
  )
}
