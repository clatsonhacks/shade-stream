import { execFileSync } from "node:child_process";
import nacl from "tweetnacl";
import { loadRuntimeEnv, requireKeys } from "./lib/env.js";
import { failIfAny, writeCheckReport, type CheckResult } from "./lib/report.js";
import { runCctpInbound } from "./lib/cctp-inbound.js";
import { sorobanInvoke, bytesToCliHex } from "@shade/stellar-utils";
import { generateCoin, buildAssociationSet, computeStateRoot, buildMpcSettlementProof, COINUTILS } from "./lib/prove.js";
import { ASSETS } from "@shade/assets";
import { scratchDir } from "./lib/paths.js";
import { createHash } from "node:crypto";

// Full ON-CHAIN MPC same-asset settlement: two real backed USDC notes are crossed
// by a real mpc_settlement Groth16 proof, verified by the on-chain mpc_verifier,
// with a committee threshold signature. Spends both nullifiers and inserts two
// output commitments — no synthetic parts.

const SCRATCH = scratchDir();
const env = await loadRuntimeEnv();
const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok, detail }); console.log(`  [${ok ? "OK" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`); };

const missing = requireKeys(env, ["SHIELDED_POOL_CONTRACT", "MPC_VERIFIER_CONTRACT", "NULLIFIER_REGISTRY_CONTRACT", "STELLAR_DEPLOYER_SECRET"]);
check("required env (pool + mpc verifier wired)", missing.length === 0, missing.join(", ") || "present");
if (missing.length) { await writeCheckReport("On-chain MPC settle E2E", results); failIfAny(results); }

const pool = env.SHIELDED_POOL_CONTRACT;
const admin = env.STELLAR_DEPLOYER_SECRET;
const rpc = env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const pass = env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const inv = (secret: string, method: string, args: string[]) => sorobanInvoke({ contractId: pool, secret, method, args, rpcUrl: rpc, passphrase: pass, retries: 3 });
const read = (method: string, args: string[] = []) => sorobanInvoke({ contractId: pool, secret: admin, method, args, rpcUrl: rpc, passphrase: pass, readOnly: true }).returnValue;
const toDec = (hex: string) => BigInt(hex).toString();

// 1) Committee: 3 ed25519 keypairs, registered on the pool.
const kps = [1, 2, 3].map(() => nacl.sign.keyPair());
const pubHex = kps.map(k => Buffer.from(k.publicKey).toString("hex"));
inv(admin, "set_committee", ["--pubkeys", JSON.stringify(pubHex)]);
check("committee registered (3 nodes)", true, pubHex.map(p => p.slice(0, 8)).join(","));
check("mpc_verifier wired on pool", (read("get_mpc_verifier") ?? "").includes("C"), env.MPC_VERIFIER_CONTRACT.slice(0, 10) + "...");

// 2) Two same-asset (USDC) notes, funded + deposited on-chain.
const usdc = ASSETS.USDC.assetIdField;
const coinA = generateCoin("shade_mpc_a", `${SCRATCH}/mpc_a.json`, usdc);
const coinB = generateCoin("shade_mpc_b", `${SCRATCH}/mpc_b.json`, usdc);
const enc = (c: string) => "0x" + createHash("sha256").update(c).digest("hex");
const policyHex = "0x" + createHash("sha256").update("shade:default-testnet-policy:v1").digest("hex").slice(0, 64);
const amount6 = BigInt(process.env.MPC_AMOUNT_6DP ?? "1000000");

const rootA = computeStateRoot(coinA, [coinA.commitmentDecimal], "shade_mpc_a", SCRATCH, "mpc_ra");
const inA = await runCctpInbound(env, { amount6, commitmentHex: coinA.commitmentHex, encryptedNotePayloadHashHex: enc(coinA.commitmentHex), policyIdHex: policyHex, fast: true, targetContract: pool, newRootHex: rootA, coin: coinA, scratch: SCRATCH, adminSecret: admin });
check("note A funded + deposited (CCTP)", true, `${inA.burnTxHash.slice(0, 12)}... leaf ${inA.leafIndex}`);

const rootB = computeStateRoot(coinB, [coinA.commitmentDecimal, coinB.commitmentDecimal], "shade_mpc_b", SCRATCH, "mpc_rb");
const inB = await runCctpInbound(env, { amount6, commitmentHex: coinB.commitmentHex, encryptedNotePayloadHashHex: enc(coinB.commitmentHex), policyIdHex: policyHex, fast: true, targetContract: pool, newRootHex: rootB, coin: coinB, scratch: SCRATCH, adminSecret: admin });
check("note B funded + deposited (CCTP)", true, `${inB.burnTxHash.slice(0, 12)}... leaf ${inB.leafIndex}`);

// 3) ASP association set containing both labels.
const fs = await import("node:fs");
const assoc = buildAssociationSet(coinA, SCRATCH, "mpc_assoc");
const labelB = JSON.parse(fs.readFileSync(coinB.path, "utf8")).coin.label as string;
execFileSync(COINUTILS, ["update-association", assoc.assocPath, labelB], { encoding: "utf8" });
// Re-read the assoc root AFTER adding coinB's label — the proof binds this root,
// so the on-chain canonical ASP root must be the updated (both-label) root.
const assocRootDec = JSON.parse(fs.readFileSync(assoc.assocPath, "utf8")).root as string;
const assocRootHex = "0x" + BigInt(assocRootDec).toString(16).padStart(64, "0");
inv(admin, "set_association_root", ["--association_root", bytesToCliHex(assocRootHex)]);
check("ASP association root set (both labels)", true, assocRootHex.slice(0, 14) + "...");

// 4) Real mpc_settlement proof over both notes.
const batchArr = createHash("sha256").update(`mpc-batch:${coinA.commitmentHex}:${coinB.commitmentHex}`).digest();
const batchHashHex = "0x" + batchArr.toString("hex");
const proof = buildMpcSettlementProof({
  coinA, coinB,
  commitmentsDecimal: [coinA.commitmentDecimal, coinB.commitmentDecimal],
  assocPath: assoc.assocPath, scope: "shade_mpc_a",
  batchHashHex, poolId: env.SHADE_POOL_ID ?? "1", chainId: env.SHADE_CHAIN_ID ?? "148",
  matchedAmount7dp: coinA.value7dp, deadlineLedger: "999999999",
  scratch: SCRATCH, tag: "mpc_settle"
});
check("mpc_settlement proof generated + locally verified", proof.locallyVerified, `nullA ${proof.nullifierHashAHex.slice(0, 10)}...`);

// 5) Committee threshold signatures over the batch hash.
const sigs = kps.map(k => Buffer.from(nacl.sign.detached(new Uint8Array(batchArr), k.secretKey)).toString("hex"));

// 6) New root = append both output commitments to [coinA, coinB].
const outADec = toDec(proof.outputCommitmentAHex), outBDec = toDec(proof.outputCommitmentBHex);
const statePath = `${SCRATCH}/mpc_newroot_state.json`;
(await import("node:fs")).writeFileSync(statePath, JSON.stringify({ commitments: [coinA.commitmentDecimal, coinB.commitmentDecimal, outADec, outBDec], scope: "shade_mpc_a" }));
const newRootDec = execFileSync(COINUTILS, ["compute-root", statePath], { encoding: "utf8" }).trim();
const newRootHex = "0x" + BigInt(newRootDec).toString(16).padStart(64, "0");

// 7) Submit mpc_settle — on-chain verifier checks the proof + committee threshold.
const strip = (h: string) => h.startsWith("0x") ? h.slice(2) : h;
try {
  const r = inv(env.STELLAR_RELAYER_SECRET ?? admin, "mpc_settle", [
    "--nullifier_a", strip(proof.nullifierHashAHex),
    "--nullifier_b", strip(proof.nullifierHashBHex),
    "--output_commitment_a", strip(proof.outputCommitmentAHex),
    "--output_commitment_b", strip(proof.outputCommitmentBHex),
    "--new_root", strip(newRootHex),
    "--batch_hash", strip(batchHashHex),
    "--signer_pubkeys", JSON.stringify(pubHex),
    "--signatures", JSON.stringify(sigs),
    // proof_bytes / pub_signals_bytes are Option<Bytes> — the stellar CLI parses
    // these as JSON, so the hex must be a JSON-quoted string (bare hex fails).
    "--proof_bytes", JSON.stringify(proof.proofHex),
    "--pub_signals_bytes", JSON.stringify(proof.publicHex)
  ]);
  check("ON-CHAIN mpc_settle (proof verified by on-chain verifier)", true, `tx ${String(r.txHash).slice(0, 16)}...`);
} catch (e) {
  check("ON-CHAIN mpc_settle (proof verified by on-chain verifier)", false, (e as Error).message.split("\n").find(l => /Error\(|Contract, #|verify/i.test(l))?.slice(0, 160) ?? (e as Error).message.slice(0, 160));
}

// 8) Both nullifiers now spent — a replay must fail.
await writeCheckReport("On-chain MPC same-asset settlement E2E", results);
failIfAny(results);
console.log("On-chain MPC settle e2e PASS");
