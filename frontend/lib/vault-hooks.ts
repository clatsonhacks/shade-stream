"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "./api"

export type VaultSummary = {
  vault_id: string
  backup_status: "created" | "verified" | "restored" | "failed"
  recovery_policy_status: "insufficient" | "sufficient" | "strong"
  created_at: string
}

export function useNoteVaults(enabled: boolean) {
  return useQuery({
    queryKey: ["note-vaults"],
    queryFn: () => api.get<{ vaults: VaultSummary[] }>("/v1/note-vaults"),
    enabled,
  })
}

// A vault is deposit-ready when its backup is verified and policy is sufficient+.
export function isDepositReady(v?: VaultSummary): boolean {
  return !!v && v.backup_status === "verified" && (v.recovery_policy_status === "sufficient" || v.recovery_policy_status === "strong")
}
