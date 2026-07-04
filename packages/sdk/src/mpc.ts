// Browser-safe MPC client helpers: Shamir split + X25519 box encryption + amount commitments.
// No node: imports. Uses globalThis.crypto (WebCrypto) + tweetnacl (browser-compatible).
// This is the user/client side only — committee nodes use @shade/mpc-crypto (Node.js).

import nacl from "tweetnacl";

export type CommitteeNodeInfo = {
  nodeId: string;
  encryptionPubkey: string; // hex, X25519
  signingPubkey: string;    // hex, Ed25519
};

export type EncryptedAmountShare = {
  nodeId: string;
  ciphertext: string;   // hex
  nonce: string;        // hex
  senderPubkey: string; // hex, ephemeral X25519
};

// ------- helpers --------------------------------------------------------------

function toHex(u: Uint8Array): string {
  return Array.from(u).map(b => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(h: string): Uint8Array {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  return new Uint8Array((s.match(/.{2}/g) ?? []).map(b => parseInt(b, 16)));
}
function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

// ------- Shamir over BN254 ----------------------------------------------------
// Same prime and polynomial as @shade/mpc-crypto — shares are cross-compatible.

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function modp(x: bigint): bigint {
  return ((x % P) + P) % P;
}
function modinv(a: bigint): bigint {
  let [old_r, r] = [modp(a), P];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return modp(old_s);
}
function randomFieldElement(): bigint {
  return modp(BigInt("0x" + toHex(randomBytes(32))));
}
function shamirSplit(secret: bigint, threshold: number, total: number): Array<{ x: bigint; y: bigint }> {
  const coeffs = [modp(secret)];
  for (let i = 1; i < threshold; i++) coeffs.push(randomFieldElement());
  return Array.from({ length: total }, (_, i) => {
    const x = BigInt(i + 1);
    let y = 0n;
    for (let j = coeffs.length - 1; j >= 0; j--) y = modp(y * x + coeffs[j]);
    return { x, y };
  });
}

// ------- per-node X25519 box encryption ---------------------------------------

function encryptShareForNode(
  share: { x: bigint; y: bigint },
  recipientPubkeyHex: string,
  nodeId: string
): EncryptedAmountShare {
  const ephemeralKp = nacl.box.keyPair();
  const recipientPk = fromHex(recipientPubkeyHex);
  const nonce = randomBytes(nacl.box.nonceLength);
  const plaintext = new TextEncoder().encode(JSON.stringify({ x: share.x.toString(), y: share.y.toString() }));
  const ct = nacl.box(plaintext, nonce, recipientPk, ephemeralKp.secretKey);
  return {
    nodeId,
    ciphertext: toHex(ct),
    nonce: toHex(nonce),
    senderPubkey: toHex(ephemeralKp.publicKey)
  };
}

/**
 * Split `amount7dp` into Shamir shares and encrypt one per committee node.
 * The plaintext amount never leaves this function — only ciphertext is returned.
 * threshold=2 means any 2-of-N nodes can reconstruct during matching.
 */
export function splitAndEncryptAmount(
  amount7dp: bigint,
  nodes: CommitteeNodeInfo[],
  threshold = 2
): EncryptedAmountShare[] {
  const shares = shamirSplit(amount7dp, threshold, nodes.length);
  return nodes.map((node, i) => encryptShareForNode(shares[i], node.encryptionPubkey, node.nodeId));
}

// ------- amount commitment -----------------------------------------------------

/** Random 32-byte blinding factor (hex). Use one per committed value. */
export function randomBlinding(): string {
  return toHex(randomBytes(32));
}

/**
 * Commitment to an amount: SHA-256(amount7dp || ":" || blindingHex).
 * The blinding factor makes the commitment hiding — the API server sees only
 * this hash, never the plaintext amount.
 * Async because WebCrypto subtle.digest is async.
 */
export async function buildAmountCommitment(amount7dp: bigint, blindingHex: string): Promise<string> {
  const data = new TextEncoder().encode(`${amount7dp}:${blindingHex}`);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
  return "0x" + toHex(new Uint8Array(hash));
}

/**
 * Commitment to an arbitrary string value (EVM address, destination, etc.).
 * SHA-256(value || ":" || blindingHex).
 */
export async function buildValueCommitment(value: string, blindingHex: string): Promise<string> {
  const data = new TextEncoder().encode(`${value}:${blindingHex}`);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
  return "0x" + toHex(new Uint8Array(hash));
}
