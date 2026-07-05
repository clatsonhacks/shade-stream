// Unit tests for the streaming relayer's batch-selection policy (pure logic,
// no chain). The real on-chain settleBatch path is exercised with real proofs
// by packages/arc-actions/src/stream-lifecycle-test.ts's batch section.
// Run via: npm run stream-relayer:test

import { selectSettlementBatches, type PendingSettlement, type BatchPolicy } from "./stream-relayer.js";

type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail ? `- ${detail}` : "");
}

const dummyProof = { a: ["0", "0"] as [string, string], b: [["0", "0"], ["0", "0"]] as [[string, string], [string, string]], c: ["0", "0"] as [string, string] };
function mk(channelId: bigint, expiryBlock: bigint, cumulative: bigint): PendingSettlement {
  return { channelId, proof: dummyProof, publicSignals: new Array(11).fill("0"), expiryBlock, cumulative };
}

const policy: BatchPolicy = {
  closeBeforeExpiryBlocks: 10n,
  minValueToClose: 1000n,
  maxBatchSize: 2,
};

function main() {
  // 1) channels far from expiry and below value threshold are NOT selected.
  {
    const batches = selectSettlementBatches([mk(1n, 1000n, 100n)], 500n, policy);
    check("idle channel not selected", batches.length === 0);
  }

  // 2) a channel near expiry IS selected even if low value.
  {
    const batches = selectSettlementBatches([mk(1n, 1000n, 5n)], 995n, policy); // within 10 blocks of expiry
    check("near-expiry channel selected", batches.length === 1 && batches[0].length === 1);
  }

  // 3) a high-value channel IS selected even if far from expiry.
  {
    const batches = selectSettlementBatches([mk(1n, 100000n, 2000n)], 500n, policy); // value >= 1000
    check("high-value channel selected", batches.length === 1 && batches[0][0].channelId === 1n);
  }

  // 4) batching: 5 ready channels with maxBatchSize 2 -> 3 batches (2,2,1).
  {
    const ready = [mk(1n, 100000n, 5000n), mk(2n, 100000n, 5000n), mk(3n, 100000n, 5000n), mk(4n, 100000n, 5000n), mk(5n, 100000n, 5000n)];
    const batches = selectSettlementBatches(ready, 0n, policy);
    check("5 ready channels split into 3 batches of <=2", batches.length === 3 && batches[0].length === 2 && batches[1].length === 2 && batches[2].length === 1);
  }

  // 5) soonest-expiry first ordering.
  {
    const ready = [mk(1n, 300n, 5000n), mk(2n, 100n, 5000n), mk(3n, 200n, 5000n)];
    const batches = selectSettlementBatches(ready, 0n, { ...policy, maxBatchSize: 5 });
    const order = batches[0].map((s) => s.channelId);
    check("selected in soonest-expiry order", order[0] === 2n && order[1] === 3n && order[2] === 1n, order.join(","));
  }

  // 6) mixed: only the ready subset is selected out of a larger pool.
  {
    const pool = [mk(1n, 100000n, 50n) /* idle */, mk(2n, 100000n, 5000n) /* value */, mk(3n, 105n, 10n) /* near expiry */];
    const batches = selectSettlementBatches(pool, 100n, policy);
    const ids = batches.flat().map((s) => s.channelId).sort();
    check("only ready channels selected from mixed pool", ids.length === 2 && ids.includes(2n) && ids.includes(3n));
  }

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
