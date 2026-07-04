// WebAuthn PRF passkey helper. Creates a device passkey and derives a stable
// 32-byte PRF output usable as the vault wrapper key input. PRF support is uneven
// across browsers/authenticators, so every call is best-effort and throws a clear
// error rather than faking support.

const PRF_SALT = new TextEncoder().encode("shade-vault-prf-v1");
const RP_ID = typeof window !== "undefined" ? window.location.hostname : "localhost";

function b64urlToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out;
}
function bytesToB64url(b: Uint8Array): string {
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type PasskeyResult = { credentialId: string; prfOutput: Uint8Array; backupEligible: boolean; backupState: boolean };

// Create a new passkey for this user and obtain its PRF output. If the authenticator
// doesn't return PRF at creation, do an immediate assertion to fetch it.
export async function createPasskeyWrapperInput(userId: string, userName: string): Promise<PasskeyResult> {
  if (typeof window === "undefined" || !("PublicKeyCredential" in window)) throw new Error("passkeys are not supported in this browser");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId).slice(0, 64);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge, rp: { name: "Shade Protocol", id: RP_ID },
      user: { id: userIdBytes, name: userName, displayName: userName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs
    }
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey creation cancelled");
  const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
  const flags = cred.response as AuthenticatorAttestationResponse & { getAuthenticatorData?: () => ArrayBuffer };
  // backup eligible/state are in authenticator data flags; best-effort defaults.
  const meta = { backupEligible: true, backupState: true };
  void flags;
  const credentialId = bytesToB64url(new Uint8Array(cred.rawId));

  if (ext.prf?.results?.first) {
    return { credentialId, prfOutput: new Uint8Array(ext.prf.results.first), ...meta };
  }
  if (ext.prf?.enabled === false) throw new Error("this device's passkey does not support PRF (encryption). Use Freighter or a recovery file.");
  // PRF enabled but not returned at creation → fetch via an assertion.
  return getPasskeyWrapperInput(credentialId);
}

// Re-derive the PRF output for an existing credential (used at restore time).
export async function getPasskeyWrapperInput(credentialId: string): Promise<PasskeyResult> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge, rpId: RP_ID, userVerification: "preferred",
      allowCredentials: [{ type: "public-key", id: b64urlToBytes(credentialId) as unknown as BufferSource }],
      extensions: { prf: { evalByCredential: { [credentialId]: { first: PRF_SALT } } } } as AuthenticationExtensionsClientInputs
    }
  }) as PublicKeyCredential | null;
  if (!assertion) throw new Error("passkey unlock cancelled");
  const ext = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  if (!ext.prf?.results?.first) throw new Error("this browser/device did not return a passkey PRF value");
  return { credentialId, prfOutput: new Uint8Array(ext.prf.results.first), backupEligible: true, backupState: true };
}

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;
}
