// Shade Streams — streaming relayer. Watches open channels and batches their
// settlements: when channels are near expiry or their accumulated value is worth
// closing, it submits one StreamEscrow.settleBatch instead of N separate settle
// txs, amortizing the per-tx base cost across the batch. This is the economic
// point of nanopayment streaming — millions of off-chain ticks collapse into a
// handful of on-chain net settlements.
//
// The relayer has NO special on-chain privilege: settleBatch is proof-gated per
// channel exactly like a single settle. The relayer only decides WHICH valid
// proofs to submit together and WHEN.

import type { Groth16CallData } from "@shade/arc-actions";

export type PendingSettlement = {
  channelId: bigint;
  proof: Groth16CallData;
  publicSignals: string[]; // uint256[11] as decimal/hex strings, from buildStreamSettleProofBn254
  // metadata the relayer uses to decide WHEN to close:
  expiryBlock: bigint;
  cumulative: bigint; // net value being settled
};

export type BatchPolicy = {
  // close a channel if it's within this many blocks of expiry (avoid missing the window).
  closeBeforeExpiryBlocks: bigint;
  // close a channel once its settle-able value reaches this threshold (economical close).
  minValueToClose: bigint;
  // cap on how many settlements to bundle into one settleBatch tx.
  maxBatchSize: number;
};

/**
 * Decide which pending settlements are ready to close now, and split them into
 * batches no larger than the policy's maxBatchSize. Pure function — no chain
 * calls — so it is unit-testable and the caller controls submission.
 */
export function selectSettlementBatches(
  pending: PendingSettlement[],
  currentBlock: bigint,
  policy: BatchPolicy
): PendingSettlement[][] {
  const ready = pending.filter(
    (s) =>
      currentBlock >= s.expiryBlock - policy.closeBeforeExpiryBlocks ||
      s.cumulative >= policy.minValueToClose
  );
  // deterministic order: soonest-expiry first so we never miss a window.
  ready.sort((a, b) => (a.expiryBlock < b.expiryBlock ? -1 : a.expiryBlock > b.expiryBlock ? 1 : 0));

  const batches: PendingSettlement[][] = [];
  for (let i = 0; i < ready.length; i += policy.maxBatchSize) {
    batches.push(ready.slice(i, i + policy.maxBatchSize));
  }
  return batches;
}

/**
 * Submit a single batch of settlements via StreamEscrow.settleBatch. Returns the
 * tx hash. Reverts atomically if any member is invalid (the on-chain contract
 * loops _settle and any revert unwinds the whole tx), so the caller should treat
 * a thrown error as "none of these settled" and retry them individually to
 * isolate the bad one.
 */
export async function submitSettlementBatch(
  batch: PendingSettlement[],
  opts: {
    arcRpcUrl: string;
    arcChainId?: number;
    escrowAddress: string;
    relayerPrivateKey: string;
  }
): Promise<{ txHash: string; count: number }> {
  const { arcInvoke } = await import("@shade/arc-actions");
  const { STREAM_ESCROW_ABI } = await import("@shade/arc-actions/abi");
  const { Wallet } = await import("ethers");

  const proofs = batch.map((s) => s.proof);
  const pubs = batch.map((s) => s.publicSignals);

  const r = await arcInvoke({
    network: { rpcUrl: opts.arcRpcUrl, chainId: opts.arcChainId },
    contractAddress: opts.escrowAddress,
    abi: STREAM_ESCROW_ABI,
    method: "settleBatch",
    args: [proofs, pubs],
    wallet: new Wallet(opts.relayerPrivateKey),
  });
  return { txHash: r.hash, count: batch.length };
}
