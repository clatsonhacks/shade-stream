import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { Keypair } from "@stellar/stellar-sdk";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Store } from "./db.js";

// PHASE 2 / PHASE 5 wallet auth. Flow: client requests a nonce for its wallet ->
// signs the returned message -> posts the signature -> server verifies (EVM via
// ethers.verifyMessage, Stellar via ed25519) and issues an opaque session token
// (returned as a bearer token AND set as an httpOnly cookie). No private keys are
// ever stored.

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const NONCE_TTL_MS = 1000 * 60 * 10; // 10 min
const COOKIE = "shade_session";

export type WalletType = "EVM" | "STELLAR";

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function authMessage(walletType: WalletType, address: string, nonce: string): string {
  return `Shade Protocol Testnet wants you to sign in with your ${walletType} wallet:\n${address}\n\nNonce: ${nonce}`;
}

// Normalize an address for storage/compare (EVM checksummed; Stellar as-is G...).
export function normalizeAddress(walletType: WalletType, address: string): string {
  if (walletType === "EVM") return getAddress(address);
  return address;
}

// Verify a wallet signature over the issued message.
export function verifyWalletSignature(walletType: WalletType, address: string, message: string, signature: string): boolean {
  try {
    if (walletType === "EVM") {
      const recovered = verifyMessage(message, signature);
      return getAddress(recovered) === getAddress(address);
    }
    // Stellar: signature is base64 or hex of the 64-byte ed25519 sig over the message bytes.
    const sig = signature.match(/^[0-9a-fA-F]+$/) && signature.length === 128
      ? Buffer.from(signature, "hex")
      : Buffer.from(signature, "base64");
    return Keypair.fromPublicKey(address).verify(Buffer.from(message, "utf8"), sig);
  } catch {
    return false;
  }
}

// Read the session token from the bearer header or the httpOnly cookie.
export function readSessionToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = request.headers.cookie;
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, v] = part.trim().split("=");
      if (k === COOKIE && v) return decodeURIComponent(v);
    }
  }
  return null;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  reply.header("set-cookie", `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header("set-cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export const NONCE_TTL = NONCE_TTL_MS;
export const SESSION_TTL = SESSION_TTL_MS;

// Resolve the authenticated user id from the request, or throw 401.
export async function requireUser(store: Store, request: FastifyRequest): Promise<string> {
  const token = readSessionToken(request);
  if (!token) { const e = new Error("authentication required") as Error & { statusCode: number }; e.statusCode = 401; throw e; }
  const userId = await store.userIdForSession(sha256Hex(token));
  if (!userId) { const e = new Error("invalid or expired session") as Error & { statusCode: number }; e.statusCode = 401; throw e; }
  return userId;
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

// Resolve the user if a valid session is present, else null (no throw). For
// endpoints that work anonymously but tag ownership when authenticated.
export async function optionalUser(store: Store, request: FastifyRequest): Promise<string | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  return store.userIdForSession(sha256Hex(token));
}
