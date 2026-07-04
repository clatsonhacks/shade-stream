#!/usr/bin/env tsx
/**
 * MPC committee end-to-end demo.
 *
 * Demonstrates the full private-matching flow:
 *   1. Fetch committee encryption keys.
 *   2. Two users each split their intent amount using Shamir 2-of-3.
 *   3. Each user submits an MPC intent with 3 encrypted shares.
 *   4. Trigger matching on the committee.
 *   5. Verify the threshold-signed match batch.
 *   6. Show settlement path.
 *
 * Run: npm run mpc:e2e
 * Requires: npm run mpc:dev (ports 8090-8093)
 */

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import {
  splitAmountForCommittee, verifySignedBatch,
  type CommitteeNodeInfo, type MpcIntent, type SignedMatchBatch
} from "@shade/mpc-crypto";

const MPC_URL = process.env.MPC_COMMITTEE_URL ?? "http://127.0.0.1:8090";

// - helpers ----

function ok(label: string, data?: unknown) {
  console.log(`\n[OK] ${label}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function fail(label: string, err: unknown): never {
  console.error(`\n[FAIL] ${label}:`, err);
  process.exit(1);
}

async function get(path: string) {
  const resp = await fetch(`${MPC_URL}${path}`);
  if (!resp.ok) fail(`GET ${path} => ${resp.status}`, await resp.text());
  return resp.json();
}

async function post(path: string, body: unknown) {
  const resp = await fetch(`${MPC_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!resp.ok) fail(`POST ${path} => ${resp.status}`, await resp.text());
  return resp.json();
}

// - fake note data (representative; real flow uses on-chain notes) ----

function fakeNote() {
  return {
    nullifier: `0x${randomBytes(32).toString("hex")}`,
    commitment: `0x${randomBytes(32).toString("hex")}`,
    recipientCommitment: `0x${randomBytes(32).toString("hex")}`
  };
}

// - main ----

console.log("=== Shade MPC Committee E2E Demo ===");
console.log(`Committee URL: ${MPC_URL}`);

// 1. Health check
const health = await get("/health").catch(e => fail("MPC committee not reachable — run: npm run mpc:dev", e));
ok("Committee health", health);

// 2. Fetch committee public keys
const { nodes: committeeNodes } = await get("/v1/mpc/committee") as { nodes: CommitteeNodeInfo[] };
ok(`Committee has ${committeeNodes.length} nodes`, committeeNodes.map(n => ({ id: n.nodeId, encKey: n.encryptionPubkey.slice(0, 16) + "…" })));

// 3. Build two intents that can cross:
// User A: sell 500 USDC (7dp = 5_000_000_0) for XLM
// User B: sell 500 XLM (7dp = 5_000_000_0) for USDC
// They cross at 500 USDC ↔ 500 XLM.

const amountA = 5_000_000_0n;  // 500 USDC (7dp)
const amountB = 5_000_000_0n;  // 500 XLM (7dp)

const noteA = fakeNote();
const noteB = fakeNote();

const intentA: MpcIntent = {
  intentId: uuidv4(),
  userId: "demo-user-A",
  inputAsset: "USDC:Stellar:SAC",
  outputAsset: "XLM:Stellar:SAC",
  expiryLedger: 9_999_999,
  policyId: "policy:testnet:v1",
  noteNullifier: noteA.nullifier,
  noteCommitment: noteA.commitment,
  recipientCommitment: noteA.recipientCommitment,
  encryptedShares: splitAmountForCommittee(amountA.toString(), committeeNodes, 2),
  submittedAt: Date.now()
};

const intentB: MpcIntent = {
  intentId: uuidv4(),
  userId: "demo-user-B",
  inputAsset: "XLM:Stellar:SAC",
  outputAsset: "USDC:Stellar:SAC",
  expiryLedger: 9_999_999,
  policyId: "policy:testnet:v1",
  noteNullifier: noteB.nullifier,
  noteCommitment: noteB.commitment,
  recipientCommitment: noteB.recipientCommitment,
  encryptedShares: splitAmountForCommittee(amountB.toString(), committeeNodes, 2),
  submittedAt: Date.now()
};

console.log(`\nUser A intent: ${intentA.intentId} — sell ${amountA} (7dp) USDC for XLM`);
console.log(`User B intent: ${intentB.intentId} — sell ${amountB} (7dp) XLM for USDC`);
console.log("Each amount is Shamir 2-of-3 secret-shared and encrypted to committee nodes.");
console.log("The committee sees only ciphertexts — no single node can read the amount.");

// 4. Submit both intents
const rA = await post("/v1/mpc/intents", { intent: intentA }) as { sessionId: string };
ok("Intent A submitted", rA);

const rB = await post("/v1/mpc/intents", { intent: intentB }) as { sessionId: string };
ok("Intent B submitted", rB);

const sessionId = rA.sessionId;
console.log(`\nBoth intents assigned to session: ${sessionId}`);

// 5. Trigger matching round
console.log("\nTriggering committee matching round...");
const matchResult = await post(`/v1/mpc/sessions/${sessionId}/match`, {}) as {
  ok: boolean; batch?: SignedMatchBatch; reason?: string;
};

if (!matchResult.ok) {
  fail("Matching failed", matchResult.reason);
}

const batch = matchResult.batch!;
ok(`Matching complete — ${batch.matches.length} match(es)`, {
  batchId: batch.batchId,
  matches: batch.matches,
  signers: batch.signatures.map((s: { nodeId: string }) => s.nodeId)
});

// 6. Verify the threshold multi-sig
const verifyResult = await post("/v1/mpc/verify", { batch }) as { valid: boolean; sigCount: number };
ok("Batch signature verification", verifyResult);

if (!verifyResult.valid) fail("Signature verification failed", verifyResult);

// Also verify locally using the mpc-crypto package
const localValid = verifySignedBatch(batch, committeeNodes);
ok(`Local signature verification: ${localValid ? "PASS" : "FAIL"}`);

// 7. Show settlement path
if (batch.matches.length > 0) {
  const m = batch.matches[0];
  console.log(`
=== Settlement Path ===
Match:
  Intent A (${m.intentAId.slice(0, 8)}…): sends ${m.inputAsset}
  Intent B (${m.intentBId.slice(0, 8)}…): sends ${m.outputAsset}
  Netted amount: ${m.matchedAmount7dp} (7dp)

Next steps (production):
  1. Each user generates a ZK settlement proof binding their nullifier to the
     committee's batchHash (${batch.batchHash.slice(0, 16)}…).
  2. The on-chain verifier checks:
       a. The note commitment is in the Merkle root.
       b. The nullifier has not been spent.
       c. The committee multi-sig over batchHash is valid (${batch.signatures.length} of ${committeeNodes.length} nodes).
  3. The ShadePool spends input nullifiers and creates output commitments.
  4. No assets move on-chain — only note ownership transfers privately.
`);
}

console.log("=== MPC E2E DEMO COMPLETE ===");
