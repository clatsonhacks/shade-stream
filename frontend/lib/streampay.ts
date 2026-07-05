// Browser-side wrapper around the StreamPay contract. Consumes the artifact
// synced by scripts/sync-frontend-artifacts.ts. Signature mirrors the demo
// script (packages/arc-actions/src/streampay-demo.ts) so both stay honest
// about the same event-driven value flow.
import {
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  keccak256,
  Signer,
  toUtf8Bytes,
  type Log,
} from "ethers"
import artifact from "./artifacts/StreamPay.json"
import { arcProvider } from "./arc"

const abi = (artifact as any).abi as any[]
const bytecode = (artifact as any).bytecode as string
const iface = new Interface(abi)

export type StreamState = "streaming" | "paused" | "closed"

export function newStreamId(): string {
  return keccak256(toUtf8Bytes(`streampay-${Date.now()}-${Math.random().toString(16).slice(2)}`))
}

export async function deployStreamPay(signer: Signer): Promise<{ address: string; txHash: string }> {
  const factory = new ContractFactory(abi, bytecode, signer)
  const c = await factory.deploy()
  const tx = c.deploymentTransaction()
  await c.waitForDeployment()
  return { address: await c.getAddress(), txHash: tx?.hash ?? "" }
}

export async function openStream(
  signer: Signer,
  addr: string,
  id: string,
  payee: string,
  ratePerSecond: bigint,
  cap: bigint,
): Promise<{ txHash: string }> {
  const c = new Contract(addr, abi, signer)
  const tx = await c.open(id, payee, ratePerSecond, { value: cap })
  await tx.wait()
  return { txHash: tx.hash }
}

/**
 * Live meter — the on-chain source of truth. Read as often as the UI wants
 * (500ms is fine for a nanopayment feel). Returns the same numbers the
 * contract emits at withdraw / stop time.
 */
export async function readMeter(
  addr: string,
  id: string,
  provider: JsonRpcProvider = arcProvider(),
): Promise<{ earned: bigint; withdrawable: bigint; state: StreamState; deposit: bigint; withdrawn: bigint }> {
  const c = new Contract(addr, abi, provider)
  const [earned, withdrawable, stream] = await Promise.all([
    c.earned(id) as Promise<bigint>,
    c.withdrawable(id) as Promise<bigint>,
    c.streams(id) as Promise<any>,
  ])
  // struct Stream { payer, payee, ratePerSecond, deposited, accrued, withdrawn, lastTick, active, closed }
  const active: boolean = stream[7]
  const closed: boolean = stream[8]
  const state: StreamState = closed ? "closed" : active ? "streaming" : "paused"
  return { earned, withdrawable, state, deposit: stream[3] as bigint, withdrawn: stream[5] as bigint }
}

function decode(logs: readonly Log[], name: string): any {
  for (const l of logs) {
    try {
      const p = iface.parseLog({ topics: [...l.topics], data: l.data })
      if (p?.name === name) return p.args
    } catch {
      /* not ours */
    }
  }
  return null
}

export async function withdrawStream(signer: Signer, addr: string, id: string): Promise<{ txHash: string; amount: bigint }> {
  const c = new Contract(addr, abi, signer)
  const tx = await c.withdraw(id)
  const r = await tx.wait()
  const w = decode(r!.logs, "Withdrawn")
  return { txHash: tx.hash, amount: (w?.amount as bigint) ?? 0n }
}

export async function pauseStream(signer: Signer, addr: string, id: string): Promise<{ txHash: string }> {
  const c = new Contract(addr, abi, signer)
  const tx = await c.pause(id)
  await tx.wait()
  return { txHash: tx.hash }
}

export async function resumeStream(signer: Signer, addr: string, id: string): Promise<{ txHash: string }> {
  const c = new Contract(addr, abi, signer)
  const tx = await c.resume(id)
  await tx.wait()
  return { txHash: tx.hash }
}

export async function stopStream(
  signer: Signer,
  addr: string,
  id: string,
): Promise<{ txHash: string; paidToPayee: bigint; refundToPayer: bigint }> {
  const c = new Contract(addr, abi, signer)
  const tx = await c.stop(id)
  const r = await tx.wait()
  const s = decode(r!.logs, "Stopped")
  return {
    txHash: tx.hash,
    paidToPayee: (s?.paidToPayee as bigint) ?? 0n,
    refundToPayer: (s?.refundToPayer as bigint) ?? 0n,
  }
}
