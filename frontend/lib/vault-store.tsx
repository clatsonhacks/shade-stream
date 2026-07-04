"use client"

// Holds the unlocked vault master key + vault in memory for the session. The key
// is never persisted to disk/localStorage and never sent to the backend.
import type React from "react"
import { createContext, useContext, useState } from "react"
import type { NoteVault, VaultMasterKey } from "./note-vault"

type VaultState = {
  vaultId: string | null
  masterKey: VaultMasterKey | null
  vault: NoteVault | null
  setUnlocked: (vaultId: string, masterKey: VaultMasterKey, vault: NoteVault) => void
  updateVault: (vault: NoteVault) => void
  clear: () => void
}

const Ctx = createContext<VaultState | null>(null)

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [vaultId, setVaultId] = useState<string | null>(null)
  const [masterKey, setMasterKey] = useState<VaultMasterKey | null>(null)
  const [vault, setVault] = useState<NoteVault | null>(null)

  return (
    <Ctx.Provider
      value={{
        vaultId,
        masterKey,
        vault,
        setUnlocked: (id, key, v) => { setVaultId(id); setMasterKey(key); setVault(v) },
        updateVault: (v) => setVault(v),
        clear: () => { setVaultId(null); setMasterKey(null); setVault(null) },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useVault() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useVault must be used within VaultProvider")
  return v
}
