import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { rpc, scValToNative } from "@stellar/stellar-sdk";

// Self-contained path resolution (mirrors apps/cli/src/lib/paths.ts) so the
// auditor has no cross-package coupling. Every path defaults under SHADE_ROOT.
const SHADE_ROOT = process.env.SHADE_ROOT ?? process.cwd();
const ZK_REF = process.env.SHADE_ZK_REF ?? resolve(SHADE_ROOT, ".zk-ref/soroban-examples/privacy-pools");
const COINUTILS_BIN = process.env.COINUTILS_BIN ?? resolve(ZK_REF, "target/release/stellar-coinutils");
const SHADE_SCRATCH_DIR = process.env.SHADE_SCRATCH_DIR ?? resolve(SHADE_ROOT, ".scratch");
function scratchDir(): string {
  mkdirSync(SHADE_SCRATCH_DIR, { recursive: true });
  return SHADE_SCRATCH_DIR;
}

// Root Auditor core.
// Trust model: the registrar (pool admin) computes the lean-imt Merkle root
// off-chain and submits it with each deposit (on-chain Poseidon inserts exceed the
// Soroban budget — see docs). The contract EMITS every commitment in a `deposit`
// event, so those events are the trustworthy record of what was actually inserted.
// The auditor reconstructs the commitment list from events, recomputes the root
// independently (coinutils `compute-root`, identical lean-imt to the circuit), and
// compares it to the root the registrar stored on-chain (`get_root`). A divergence
// means the registrar submitted a root that does not match the real leaves =>
// ROOT_MISMATCH_CRITICAL, and the API must refuse spends against that root.

export type DepositLeaf = { leafIndex: number; commitmentDecimal: string; commitmentHex: string };

export type AuditResult = {
  poolContract: string;
  leafCount: number;
  source: "events" | "db";
  recomputedRootHex: string;
  onchainRootHex: string;
  status: "OK" | "ROOT_MISMATCH_CRITICAL";
  detail: string;
};

const SYM_DEPOSIT = "deposit";

// Recompute the lean-imt root over an ordered commitment list via coinutils.
// Returns a 0x-prefixed 32-byte hex root (matches the on-chain BytesN<32>).
export function recomputeRoot(commitmentsDecimal: string[]): string {
  if (commitmentsDecimal.length === 0) {
    return "0x" + "00".repeat(32); // empty-tree root convention used by the pool constructor
  }
  const statePath = `${scratchDir()}/audit_state.json`;
  writeFileSync(statePath, JSON.stringify({ commitments: commitmentsDecimal, scope: "audit" }));
  const out = execFileSync(COINUTILS_BIN, ["compute-root", statePath], { encoding: "utf8" }).trim();
  return "0x" + BigInt(out).toString(16).padStart(64, "0");
}

// Read every `deposit` event for the pool via Soroban RPC, ordered by leaf_index.
// The pool's deposit event: topics [symbol "deposit", source_domain]; data tuple
// (cctp_nonce, asset, amount, commitment, encrypted_note_payload_hash, policy_id,
// leaf_index, new_root). We extract commitment (idx 3) and leaf_index (idx 6).
export async function readDepositLeavesFromEvents(poolContract: string, rpcUrl: string): Promise<DepositLeaf[]> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const latest = await server.getLatestLedger();
  // Public testnet RPC keeps only a short event-retention window. Probe from a
  // modest lookback down to a small one and use the first range the RPC accepts
  // (a startLedger below retention returns no events). Callers fall back to DB.
  const lookbacks = (process.env.ROOT_AUDIT_LOOKBACKS ?? "9000,4000,2000")
    .split(",").map((n) => parseInt(n, 10)).filter((n) => n > 0);
  const byIndex = new Map<number, DepositLeaf>();
  for (const back of lookbacks) {
    const startLedger = Math.max(1, latest.sequence - back);
    let cursor: string | undefined;
    let got = 0;
    try {
      for (let page = 0; page < 50; page++) {
        const req = cursor
          ? { filters: [{ type: "contract" as const, contractIds: [poolContract] }], cursor, limit: 100 }
          : { startLedger, filters: [{ type: "contract" as const, contractIds: [poolContract] }], limit: 100 };
        const resp = await server.getEvents(req);
        for (const ev of resp.events ?? []) {
          const topics = ev.topic ?? [];
          const t0 = topics[0] ? scValToNative(topics[0]) : undefined;
          if (String(t0) !== SYM_DEPOSIT) continue;
          const data = scValToNative(ev.value) as unknown[];
          if (!Array.isArray(data) || data.length < 7) continue;
          const commitmentHex = "0x" + Buffer.from(data[3] as Uint8Array).toString("hex");
          const leafIndex = Number(data[6]);
          byIndex.set(leafIndex, { leafIndex, commitmentHex, commitmentDecimal: BigInt(commitmentHex).toString() });
          got++;
        }
        if (!resp.cursor || (resp.events ?? []).length === 0) break;
        cursor = resp.cursor;
      }
    } catch {
      continue; // startLedger outside retention — try a smaller window
    }
    if (got > 0) break;
  }
  return [...byIndex.values()].sort((a, b) => a.leafIndex - b.leafIndex);
}

// Pure comparison: recompute the root over the committed leaves and compare to the
// on-chain `get_root`. The protocol supports two registrar conventions for the
// pool's current root, and an honest registrar matches ONE of them:
// (a) cumulative — root over ALL committed leaves in order;
// (b) per-deposit — root over only the latest deposited leaf (the cctp-inbound
// flow submits computeStateRoot over the new coin alone).
// A match against either is OK. A root matching NEITHER (wrong/tampered root, or a
// swapped leaf) is ROOT_MISMATCH_CRITICAL. This still catches fraud: a forged root
// or altered leaf set matches neither recomputation.
export function compareRoots(poolContract: string, leaves: DepositLeaf[], onchainRootHex: string, source: "events" | "db"): AuditResult {
  const ordered = [...leaves].sort((a, b) => a.leafIndex - b.leafIndex);
  const norm = (h: string) => (h.startsWith("0x") ? h : "0x" + h).toLowerCase();
  const cumulative = norm(recomputeRoot(ordered.map((l) => l.commitmentDecimal)));
  const latestOnly = ordered.length ? norm(recomputeRoot([ordered[ordered.length - 1].commitmentDecimal])) : cumulative;
  const onchain = norm(onchainRootHex);
  const match = onchain === cumulative || onchain === latestOnly;
  const convention = onchain === cumulative ? "cumulative" : onchain === latestOnly ? "per-deposit (latest leaf)" : "none";
  return {
    poolContract,
    leafCount: ordered.length,
    source,
    recomputedRootHex: cumulative,
    onchainRootHex: onchain,
    status: match ? "OK" : "ROOT_MISMATCH_CRITICAL",
    detail: match
      ? `on-chain root matches recomputed root (${convention}) over ${ordered.length} leaf/leaves`
      : `on-chain root ${onchain} matches neither cumulative (${cumulative}) nor latest-leaf (${latestOnly}) recomputation over ${ordered.length} leaves`
  };
}
