// NoteManager — browser-safe, stateless helpers for local note lifecycle.
// Notes are stored encrypted in an NoteVault; the master key never leaves the client.

import {
  generateNotePreimage,
  generateVaultMasterKey,
  createEmptyNoteVault,
  addNoteToVault,
  encryptNoteVault,
  decryptNoteVault,
  decryptEnvelope,
  randomBytes,
  toHex
} from "@shade/note-vault";

export type {
  NoteVault,
  VaultNote,
  VaultMasterKey,
  VaultAad,
  VaultWrapper,
  EncryptedVaultEnvelope,
  NotePreimage,
  RecoveryFile
} from "@shade/note-vault";

export {
  generateVaultMasterKey,
  // Recovery wrappers — re-exported so callers don't need to import note-vault directly
  wrapVaultKeyWithPasskeyPrf,
  unwrapVaultKeyWithPasskeyPrf,
  wrapVaultKeyWithStellarSignature,
  unwrapVaultKeyWithStellarSignature,
  wrapVaultKeyWithRecoveryKitPassword,
  unwrapVaultKeyWithRecoveryKitPassword,
  wrapVaultKeyWithRecoveryFileSecret,
  unwrapVaultKeyWithRecoveryFileSecret,
  generateRecoveryFileSecret,
  buildRecoveryFile,
  createVaultEnvelope,
  parseVaultEnvelope,
  validateVaultEnvelope,
  assertNoPlaintextNoteFields,
  evaluateRecoveryPolicy
} from "@shade/note-vault";

import type { NoteVault, VaultNote, VaultMasterKey, VaultAad, NotePreimage, EncryptedVaultEnvelope } from "@shade/note-vault";

export type AddNoteParams = {
  commitment: string;      // 0x.. Poseidon commitment from prover/coinutils
  asset_id: string;        // e.g. "USDC:Stellar:SAC"
  amount_7dp: string;      // value in 7dp subunits
  note_preimage: NotePreimage; // the note secrets — encrypted into the vault
  deposit_id?: string;     // CCTP deposit idempotency ID, if known
};

export class NoteManager {
  // Generate a fresh random note preimage (secrets). The caller submits this to the
  // prover to obtain the protocol Poseidon commitment, then calls addNote.
  static generatePreimage(): NotePreimage {
    return generateNotePreimage();
  }

  static createVault(): NoteVault {
    return createEmptyNoteVault(toHex(randomBytes(16)), new Date().toISOString());
  }

  // Add a note to the vault. Status starts as "prepared" (deposit not yet confirmed).
  static addNote(vault: NoteVault, p: AddNoteParams): NoteVault {
    const note: VaultNote = {
      commitment: p.commitment,
      asset_id: p.asset_id,
      amount_7dp: p.amount_7dp,
      note_preimage: p.note_preimage,
      deposit_id: p.deposit_id,
      status: "prepared",
      created_at: new Date().toISOString()
    };
    return addNoteToVault(vault, note, new Date().toISOString());
  }

  // Flip status to "active" once the pool has confirmed receipt of the deposit.
  static activate(vault: NoteVault, commitment: string): NoteVault {
    return {
      ...vault,
      updated_at: new Date().toISOString(),
      notes: vault.notes.map(n =>
        n.commitment === commitment ? { ...n, status: "active" as const } : n
      )
    };
  }

  // Flip status to "spent" after a withdrawal or transfer settles on-chain.
  static markSpent(vault: NoteVault, commitment: string): NoteVault {
    return {
      ...vault,
      updated_at: new Date().toISOString(),
      notes: vault.notes.map(n =>
        n.commitment === commitment ? { ...n, status: "spent" as const } : n
      )
    };
  }

  static list(vault: NoteVault, status?: VaultNote["status"]): VaultNote[] {
    return status ? vault.notes.filter(n => n.status === status) : [...vault.notes];
  }

  static find(vault: NoteVault, commitment: string): VaultNote | undefined {
    return vault.notes.find(n => n.commitment === commitment);
  }

  static totalActive7dp(vault: NoteVault): bigint {
    return vault.notes
      .filter(n => n.status === "active")
      .reduce((sum, n) => sum + BigInt(n.amount_7dp), 0n);
  }

  static async encrypt(
    vault: NoteVault,
    masterKey: VaultMasterKey,
    aad: VaultAad
  ): Promise<{ ciphertext: string; iv: string }> {
    return encryptNoteVault(vault, masterKey, aad);
  }

  static async decrypt(
    ciphertext: string,
    iv: string,
    masterKey: VaultMasterKey,
    aad: VaultAad
  ): Promise<NoteVault> {
    return decryptNoteVault(ciphertext, iv, masterKey, aad);
  }

  static async decryptEnvelope(
    envelope: EncryptedVaultEnvelope,
    masterKey: VaultMasterKey
  ): Promise<NoteVault> {
    return decryptEnvelope(envelope, masterKey);
  }
}
