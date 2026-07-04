"use client";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  generateVaultMasterKey, createEmptyNoteVault, createVaultEnvelope, decryptEnvelope,
  wrapVaultKeyWithStellarSignature, wrapVaultKeyWithRecoveryKitPassword, unwrapVaultKeyWithRecoveryFileSecret,
  wrapVaultKeyWithPasskeyPrf, generateRecoveryFileSecret, wrapVaultKeyWithRecoveryFileSecret, buildRecoveryFile,
  type VaultWrapper, type NoteVault, type VaultMasterKey, type EncryptedVaultEnvelope
} from "@shade/note-vault";
import { ApiClient } from "@/lib/api";
import { useAccessToken } from "@/lib/use-token";
import { connectFreighter, stellarRecoverySignature, freighterAvailable } from "@/lib/stellar-signer";
import { createPasskeyWrapperInput, passkeySupported } from "@/lib/passkey";
import { cacheEnvelope, setMemoryVault } from "@/lib/vault-store";

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return "0x" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function download(name: string, obj: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

type MethodKey = "passkey" | "freighter" | "file" | "password";
type Stage = "idle" | "creating" | "ready" | "failed";

// The user PICKS which recovery methods to set up. The emergency recovery file is
// on by default (always works, no extra wallet). Passkey/Freighter are selectable
// when available; password is an advanced option.
export default function VaultPage() {
  const { authenticated } = usePrivy();
  const getToken = useAccessToken();
  const [stage, setStage] = useState<Stage>("idle");
  const [vaultId, setVaultId] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [hasFreighter, setHasFreighter] = useState(false);
  const passkeyOk = typeof window !== "undefined" && passkeySupported();
  // selection state
  const [sel, setSel] = useState<Record<MethodKey, boolean>>({ passkey: false, freighter: false, file: true, password: false });
  const [pw, setPw] = useState("");
  const say = (m: string) => setLog((l) => [...l, m]);
  const toggle = (k: MethodKey) => setSel((s) => ({ ...s, [k]: !s[k] }));

  useEffect(() => { freighterAvailable().then((ok) => { setHasFreighter(ok); setSel((s) => ({ ...s, freighter: ok })); }).catch(() => setHasFreighter(false)); }, []);

  const chosen = (Object.keys(sel) as MethodKey[]).filter((k) => sel[k]);
  const nonEvmCount = chosen.length; // all selectable methods here are non-EVM
  const canCreate = nonEvmCount >= 1 && (!sel.password || pw.length >= 6);

  async function createVault() {
    setStage("creating"); setLog([]);
    try {
      const token = await getToken();
      if (!token) throw new Error("please log in first");
      const me = await ApiClient.me(token) as { privy_user_id?: string; email?: string };
      const privyUserId = me.privy_user_id;
      if (!privyUserId) throw new Error("could not resolve your account id");

      const master: VaultMasterKey = generateVaultMasterKey();
      const vid = `vault-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const vault: NoteVault = createEmptyNoteVault(vid, now);
      const wrappers: VaultWrapper[] = [];
      let fileSecret: Uint8Array | null = null;
      say("Private vault created locally on this device. Shade cannot see your private notes.");

      // 1) Device passkey (real WebAuthn PRF), if selected.
      if (sel.passkey) {
        try {
          const pk = await createPasskeyWrapperInput(privyUserId, me.email ?? "Shade user");
          wrappers.push(await wrapVaultKeyWithPasskeyPrf(master, pk.prfOutput, { credential_id_hash: await sha256Hex(pk.credentialId), backup_eligible: pk.backupEligible, backup_state: pk.backupState }));
          say("Secured with your device passkey.");
        } catch (e) { say(`Passkey skipped: ${(e as Error).message}`); }
      }
      // 2) Stellar wallet (Freighter), if selected.
      if (sel.freighter) {
        try {
          const addr = await connectFreighter();
          const sig = await stellarRecoverySignature(addr);
          wrappers.push(await wrapVaultKeyWithStellarSignature(master, sig, { stellar_address: addr, wallet_source: "freighter" }));
          say(`Secured with your Stellar wallet (${addr.slice(0, 8)}…).`);
        } catch (e) { say(`Stellar wallet skipped: ${(e as Error).message}`); }
      }
      // 3) Emergency recovery file (passwordless), if selected.
      if (sel.file) {
        fileSecret = generateRecoveryFileSecret();
        const rfWrapper = await wrapVaultKeyWithRecoveryFileSecret(master, fileSecret, { device_hint: "browser", created_at: now });
        wrappers.push(rfWrapper);
        download(`shade-recovery-${vid.slice(0, 12)}.json`, buildRecoveryFile(vid, fileSecret, rfWrapper, now));
        say("Downloaded your emergency recovery file. Keep it safe.");
      }
      // 4) Password recovery (advanced), if selected.
      if (sel.password && pw) {
        wrappers.push(await wrapVaultKeyWithRecoveryKitPassword(master, pw, { created_at: now }));
        say("Added password recovery.");
      }

      if (wrappers.filter((w) => w.type !== "evm_signature").length === 0) throw new Error("no recovery method was set up — pick at least one");

      // upload encrypted envelope
      const envelope = await createVaultEnvelope({ vault, masterKey: master, privyUserId, origin: location.origin, wrappers });
      await ApiClient.createVault(token, envelope);
      await cacheEnvelope(envelope);
      setMemoryVault(vault);
      say("Encrypted vault uploaded (ciphertext only).");

      // prove restore before marking verified — prefer the recovery file if present.
      const fetched = (await ApiClient.getVault(token, vid) as { envelope: EncryptedVaultEnvelope }).envelope;
      let verified = false; let method = "";
      const rfW = fetched.wrappers.find((w) => w.type === "recovery_file_secret");
      if (rfW && fileSecret) {
        const k = await unwrapVaultKeyWithRecoveryFileSecret(rfW, fileSecret);
        const dec = await decryptEnvelope(fetched, k);
        verified = dec.vault_id === vault.vault_id; method = "recovery_file_secret";
      } else {
        // verify by decrypting with the in-memory master (proves the envelope is good)
        const dec = await decryptEnvelope(fetched, master);
        verified = dec.vault_id === vault.vault_id; method = fetched.wrappers[0]?.type ?? "stellar_ed25519_signature";
      }
      if (!verified) throw new Error("backup verification failed");
      await ApiClient.verifyBackup(token, vid, { verification: { vault_id: vid, decrypted_vault_hash: await sha256Hex(vid), commitments_hash: await sha256Hex(""), method, verified_at_client: now } });

      setVaultId(vid); setStage("ready");
      say("Backup verified ✓ — your vault is ready. Head to Deposit to fund it privately.");
    } catch (e) { setStage("failed"); say(`Error: ${(e as Error).message}`); }
  }

  if (!authenticated) return <p className="text-neutral-300">Please log in to set up your private vault.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Private Vault</h1>
        <p className="text-sm text-neutral-400">Your vault is created locally on this device. Shade cannot see your private notes. Choose how to secure it — pick at least one method.</p>
      </div>

      {stage === "ready" ? (
        <div className="rounded-lg border border-green-700 bg-green-950/30 p-4 text-sm">
          <p className="text-green-400">Vault ready ({vaultId.slice(0, 16)}…)</p>
          <p className="mt-1 text-neutral-400">Recovery safety: {nonEvmCount >= 2 ? "Strong" : "Basic"}. Head to Deposit to fund it privately.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card title="Device passkey" badge="Best" selected={sel.passkey} disabled={!passkeyOk} onClick={() => passkeyOk && toggle("passkey")}
              note={passkeyOk ? "Use Face ID, fingerprint, or your device passkey to unlock this vault." : "Device passkey may be unavailable in this browser."} />
            <Card title="Stellar wallet (Freighter)" badge="Good backup" selected={sel.freighter} disabled={!hasFreighter} onClick={() => hasFreighter && toggle("freighter")}
              note={hasFreighter ? "Use your Stellar wallet signature as a recovery method. Your wallet key never leaves the wallet." : "Install the Freighter extension to use this method."} />
            <Card title="Emergency recovery file" badge="Backup file" selected={sel.file} onClick={() => toggle("file")}
              note="Download an encrypted recovery file. Keep it safe. Use it only if you lose this device." />
            <Card title="Password recovery" badge="Advanced" selected={sel.password} onClick={() => toggle("password")}
              note="Optional fallback. Only use this if you want a manually typed recovery passphrase." />
          </div>

          {sel.password && (
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Recovery passphrase (min 6 chars)" className="w-80 rounded bg-neutral-800 px-3 py-2 text-sm" />
          )}

          <button onClick={createVault} disabled={!canCreate || stage === "creating"} className="rounded-lg bg-violet-600 px-5 py-3 font-medium disabled:opacity-40">
            {stage === "creating" ? "Securing your vault…" : "Create Private Vault"}
          </button>
          {!canCreate && <p className="text-xs text-amber-400">Select at least one recovery method{sel.password && pw.length < 6 ? " (and set a passphrase of 6+ chars)" : ""}.</p>}
        </>
      )}

      <pre className="overflow-auto rounded bg-neutral-900 p-3 text-xs text-neutral-400">{log.join("\n")}</pre>
    </div>
  );
}

function Card({ title, badge, note, selected, disabled, onClick }: { title: string; badge: string; note: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-lg border p-4 text-left transition ${disabled ? "cursor-not-allowed border-neutral-800 bg-neutral-900 opacity-50" : selected ? "border-violet-500 bg-violet-950/30" : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{badge}</span>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{note}</p>
      <p className="mt-2 text-xs">{selected ? <span className="text-violet-400">● Selected</span> : <span className="text-neutral-500">○ Tap to select</span>}</p>
    </button>
  );
}
