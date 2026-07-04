"use client"

import { useQuery, useMutation } from "@tanstack/react-query"
import { api, type Me, type Contracts, type HealthFull, type SyncWalletInput } from "./api"

export function useContracts() {
  return useQuery({ queryKey: ["contracts"], queryFn: () => api.get<Contracts>("/v1/contracts", false) })
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: () => api.get<HealthFull>("/v1/health/full", false), refetchInterval: 15000 })
}

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/v1/me"), enabled })
}

export function useSyncWallets() {
  return useMutation({
    mutationFn: (wallets: SyncWalletInput[]) =>
      api.post<{ synced: number; wallets: Me["wallets"] }>("/v1/me/wallets/sync-privy", { wallets }),
  })
}

export type NoteRow = {
  commitment: string
  asset_id: string
  amount_usdc_7dp: string
  status: string
  created_at: string
}
export function useMyNotes(enabled: boolean) {
  return useQuery({
    queryKey: ["my-notes"],
    queryFn: () => api.get<{ notes: NoteRow[] }>("/v1/me/notes"),
    enabled,
    refetchInterval: 5000,
  })
}
// Sum of active note values, in USDC (7dp -> USDC).
export function balanceUsdc(notes?: NoteRow[]): number {
  return (notes ?? []).filter((n) => n.status === "active").reduce((a, n) => a + Number(n.amount_usdc_7dp) / 1e7, 0)
}

export type ActivityRow = {
  event_type: string
  entity_type: string | null
  entity_id: string | null
  tx_hash: string | null
  metadata: Record<string, unknown>
  created_at: string
}
export function useActivity(enabled: boolean) {
  return useQuery({
    queryKey: ["activity"],
    queryFn: () => api.get<{ activity: ActivityRow[] }>("/v1/activity"),
    enabled,
    refetchInterval: 5000,
  })
}
