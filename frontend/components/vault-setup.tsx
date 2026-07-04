"use client"

import { useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useVault } from "@/lib/vault-store"
import {
  generateVaultMasterKey,
  createEmptyNoteVault,
  createVaultEnvelope,
  decryptEnvelope,
  wrapVaultKeyWithRecoveryKitPassword,
  unwrapVaultKeyWithRecoveryKitPassword,
  toHex,
  type VaultWrapper,
  type EncryptedVaultEnvelope,
} from "@/lib/note-vault"
import { ShieldCheck, Loader2, Check } from "lucide-react"

type Step = { label: string; status: "idle" | "running" | "done" | "error"; detail?: string }

async function sha256Hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return toHex(new Uint8Array(buf))
}

export function VaultSetup({ onDone }: { onDone: () => void }) {
  const { user } = usePrivy()
  const vaultStore = useVault()
  const qc = useQueryClient()
  const [passphrase, setPassphrase] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [error, setError] = useState<string | null>(null)

  const valid = passphrase.length >= 8 && passphrase === confirm

  const setStep = (i: number, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  async function run() {
    if (!valid || !user?.id) return
    setBusy(true)
    setError(null)
    const init: Step[] = [
      { label: "Generate vault key (in browser)", status: "idle" },
      { label: "Encrypt vault + wrap with your passphrase", status: "idle" },
      { label: "Upload encrypted vault (ciphertext only)", status: "idle" },
      { label: "Verify backup (decrypt round-trip)", status: "idle" },
    ]
    setSteps(init)
    try {
      // 1) master key + empty vault, in-browser only.
      setStep(0, { status: "running" })
      const masterKey = generateVaultMasterKey()
      const vaultId = globalThis.crypto.randomUUID()
      const now = new Date().toISOString()
      const vault = createEmptyNoteVault(vaultId, now)
      setStep(0, { status: "done" })

      // 2) wrap the key with a recovery-kit passphrase; build the encrypted envelope.
      setStep(1, { status: "running" })
      const wrapper: VaultWrapper = await wrapVaultKeyWithRecoveryKitPassword(masterKey, passphrase, { created_at: now })
      const envelope: EncryptedVaultEnvelope = await createVaultEnvelope({
        vault,
        masterKey,
        privyUserId: user.id,
        origin: window.location.origin,
        wrappers: [wrapper],
      })
      setStep(1, { status: "done" })

      // 3) upload ciphertext + wrapped key (no secrets).
      setStep(2, { status: "running" })
      const created = await api.post<{ vault_id: string; recovery_policy_status: string }>("/v1/note-vaults", { envelope })
      setStep(2, { status: "done", detail: `policy: ${created.recovery_policy_status}` })

      // 4) prove we can decrypt from the passphrase, then mark the backup verified.
      setStep(3, { status: "running" })
      const rederivedKey = await unwrapVaultKeyWithRecoveryKitPassword(wrapper, passphrase)
      const decrypted = await decryptEnvelope(envelope, rederivedKey)
      const decryptedVaultHash = await sha256Hex(JSON.stringify(decrypted))
      const commitmentsHash = await sha256Hex(JSON.stringify(decrypted.notes.map((n) => n.commitment)))
      await api.post(`/v1/note-vaults/${vaultId}/verify-backup`, {
        verification: {
          vault_id: vaultId,
          decrypted_vault_hash: decryptedVaultHash,
          commitments_hash: commitmentsHash,
          method: "recovery_kit_password",
          verified_at_client: new Date().toISOString(),
        },
      })
      setStep(3, { status: "done" })

      // keep the unlocked key in memory for deposits this session.
      vaultStore.setUnlocked(vaultId, masterKey, decrypted)
      await qc.invalidateQueries({ queryKey: ["note-vaults"] })
      onDone()
    } catch (e) {
      const msg = (e as { error?: string; message?: string }).error ?? (e as Error).message ?? "vault setup failed"
      setError(msg)
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-[#2563eb]" />
        <h2 className="font-sans text-2xl font-light" style={{ color: "#EDEAE3" }}>Set up your private vault</h2>
      </div>
      <p className="max-w-lg font-mono text-xs leading-relaxed text-muted-foreground">
        Your notes are private — losing them loses your funds. We generate an encryption key in
        your browser and wrap it with a recovery passphrase. The backend only ever stores
        ciphertext. Keep this passphrase safe: it is the only way to recover your vault.
      </p>

      {steps.length === 0 && (
        <div className="max-w-md space-y-3">
          <Input label="Recovery passphrase (min 8 chars)" type="password" value={passphrase} onChange={setPassphrase} />
          <Input label="Confirm passphrase" type="password" value={confirm} onChange={setConfirm} />
          {confirm && passphrase !== confirm && <p className="font-mono text-xs text-red-400">passphrases do not match</p>}
          <button
            onClick={run}
            disabled={!valid || busy}
            className="mt-2 rounded-full border border-[#2563eb]/40 bg-[#2563eb]/10 px-6 py-2.5 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:bg-[#2563eb]/20 disabled:opacity-40"
          >
            Create vault
          </button>
        </div>
      )}

      {steps.length > 0 && (
        <div className="max-w-md space-y-2 rounded-lg border border-border bg-black/40 p-4">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3 font-mono text-xs">
              {s.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563eb]" />
                : s.status === "done" ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                : s.status === "error" ? <span className="h-3.5 w-3.5 text-center text-red-400">x</span>
                : <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />}
              <span className={s.status === "done" ? "text-foreground/80" : "text-muted-foreground"}>{s.label}</span>
              {s.detail && <span className="text-emerald-400">· {s.detail}</span>}
            </div>
          ))}
          {error && <p className="pt-2 font-mono text-xs text-red-400">error: {error}</p>}
          {error && (
            <button onClick={() => { setSteps([]); setError(null) }} className="pt-1 font-mono text-xs text-[#2563eb] hover:underline">
              try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Input({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-black/40 px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-[#2563eb]/50"
      />
    </label>
  )
}
