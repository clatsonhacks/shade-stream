"use client"

// Client-side signing of pool.withdraw via Freighter — the architecture-correct path
// for a spend that hits the contract's to.require_auth() (docs/app-wallet-architecture.md).
// The backend builds the ZK proof; here we build the Soroban tx with source = recipient
// (so require_auth is satisfied by source-account auth), the USER signs it in Freighter,
// and we submit. No note secret ever touches the browser — only the public proof + the
// user's own Stellar signature.
import {
  rpc, Contract, TransactionBuilder, Address, xdr, Networks, BASE_FEE,
} from "@stellar/stellar-sdk"
import {
  requestAccess, getAddress, getNetworkDetails, signTransaction,
} from "@stellar/freighter-api"
import { Buffer } from "buffer"

const RPC_URL = "https://soroban-testnet.stellar.org"
const PASSPHRASE = Networks.TESTNET

function bytesScVal(hex: string) {
  return xdr.ScVal.scvBytes(Buffer.from(hex.replace(/^0x/, ""), "hex"))
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Freighter timed out (${label}) — the extension isn't responding on this page. Try: click the Freighter icon, then hard-refresh (Cmd+Shift+R). Ensure it's not a private/incognito window.`)), ms)),
  ])
}

/**
 * Prompt Freighter to connect and return the active address. Prefers the extension's
 * injected global (window.freighterApi, version-matched to the extension) and falls back
 * to the npm API — both with a timeout so a non-responding content script never hangs.
 */
export async function connectFreighter(): Promise<string> {
  const injected = (typeof window !== "undefined" ? (window as unknown as { freighterApi?: typeof import("@stellar/freighter-api") }).freighterApi : undefined)
  const api = injected ?? { requestAccess, getAddress, getNetworkDetails }
  // Don't hard-block on global detection (newer Freighter may only message-pass);
  // just attempt the connect and let the timeout surface a non-responding extension.
  const access = await withTimeout(api.requestAccess(), 20000, "requestAccess") as { address?: string; error?: unknown }
  if (access.error) throw new Error(String(access.error))
  const addr = access.address || (await withTimeout(api.getAddress(), 8000, "getAddress")).address
  if (!addr) throw new Error("Freighter is locked — open it, unlock, and retry")
  const net = await withTimeout(api.getNetworkDetails(), 8000, "getNetworkDetails")
  if (net.networkPassphrase !== PASSPHRASE) throw new Error("Switch Freighter to the Testnet network")
  return addr
}

/**
 * Build pool.withdraw(to, proof, pub_signals) with source = recipient, have the user sign
 * it in Freighter, submit, and return the tx hash. `recipient` must be the active Freighter
 * account (source-account auth satisfies require_auth).
 */
export async function freighterWithdraw(opts: {
  pool: string; recipient: string; proofHex: string; publicHex: string
  onStatus?: (s: string) => void
}): Promise<string> {
  const { pool, recipient, proofHex, publicHex, onStatus } = opts
  const api = (typeof window !== "undefined" ? (window as unknown as { freighterApi?: { getAddress: typeof getAddress; signTransaction: typeof signTransaction } }).freighterApi : undefined) ?? { getAddress, signTransaction }
  // Use the already-connected account (no requestAccess here — avoids needing a fresh
  // user gesture after the ~15s proof step). Connect happens via the UI button first.
  const active = (await api.getAddress()).address
  if (!active) throw new Error("connect Freighter first")
  if (active.toUpperCase() !== recipient.toUpperCase()) {
    throw new Error(`Freighter is on ${active.slice(0, 6)}…; switch to the withdraw account ${recipient.slice(0, 6)}… (GD23…)`)
  }

  const server = new rpc.Server(RPC_URL)
  onStatus?.("building withdraw transaction")
  const account = await server.getAccount(recipient)
  const op = new Contract(pool).call(
    "withdraw",
    Address.fromString(recipient).toScVal(),
    bytesScVal(proofHex),
    bytesScVal(publicHex),
  )
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(180)
    .build()

  onStatus?.("simulating (footprint + auth)")
  const prepared = await server.prepareTransaction(tx)

  onStatus?.("awaiting your signature in Freighter")
  const signed = await api.signTransaction(prepared.toXDR(), { networkPassphrase: PASSPHRASE, address: recipient })
  if (signed.error) throw new Error(String(signed.error))
  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, PASSPHRASE)

  onStatus?.("submitting to Stellar")
  const sent = await server.sendTransaction(signedTx)
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult ?? sent)}`)

  // poll until the ledger has it
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await server.getTransaction(sent.hash)
    if (res.status === "SUCCESS") return sent.hash
    if (res.status === "FAILED") throw new Error(`withdraw tx failed on-chain: ${sent.hash}`)
  }
  throw new Error(`withdraw tx not confirmed in time: ${sent.hash}`)
}
