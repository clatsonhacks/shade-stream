import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { Keypair } from "@stellar/stellar-sdk";
import { loadRuntimeEnv, requireKeys } from "./lib/env.js";
import { failIfAny, writeCheckReport, type CheckResult } from "./lib/report.js";
import { runCctpInbound } from "./lib/cctp-inbound.js";
import { sorobanInvoke, bytesToCliHex } from "@shade/stellar-utils";
import { generateCoin, buildAssociationSet, buildDepositProof, computeStateRoot, buildMpcPricedProof, COINUTILS } from "./lib/prove.js";
import { ASSETS } from "@shade/assets";
import { scratchDir } from "./lib/paths.js";

// Full ON-CHAIN priced cross-asset MPC crossing: a private USDC note and a private
// XLM note are crossed at a fixed price by a real mpc_priced_settlement proof,
// verified by the on-chain priced verifier + committee threshold.

const SCRATCH = scratchDir();
const env = await loadRuntimeEnv();
const results: CheckResult[] = [];
const check = (n: string, ok: boolean, d = "") => { results.push({ name: n, ok, detail: d }); console.log(`  [${ok ? "OK" : "FAIL"}] ${n}${d ? " — " + d : ""}`); };

const missing = requireKeys(env, ["SHIELDED_POOL_CONTRACT", "MPC_PRICED_VERIFIER_CONTRACT", "STELLAR_TESTNET_USDC_SAC_CONTRACT", "STELLAR_TESTNET_XLM_SAC_CONTRACT", "STELLAR_DEPLOYER_SECRET"]);
check("required env (pool + priced verifier wired)", missing.length === 0, missing.join(", ") || "present");
if (missing.length) { await writeCheckReport("Priced MPC E2E", results); failIfAny(results); }

const pool = env.SHIELDED_POOL_CONTRACT;
const admin = env.STELLAR_DEPLOYER_SECRET;
const relayer = env.STELLAR_RELAYER_SECRET ?? admin;
const rpc = env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const pass = env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const usdcSac = env.STELLAR_TESTNET_USDC_SAC_CONTRACT!;
const xlmSac = env.STELLAR_TESTNET_XLM_SAC_CONTRACT!;
const inv = (secret: string, contract: string, method: string, args: string[]) => sorobanInvoke({ contractId: contract, secret, method, args, rpcUrl: rpc, passphrase: pass, retries: 3 });
const read = (m: string) => sorobanInvoke({ contractId: pool, secret: admin, method: m, rpcUrl: rpc, passphrase: pass, readOnly: true }).returnValue;
const toDec = (hex: string) => BigInt(hex).toString();
const label = (c: { path: string }) => JSON.parse(readFileSync(c.path, "utf8")).coin.label as string;

// 1) Committee.
const kps = [1, 2, 3].map(() => nacl.sign.keyPair());
const pubHex = kps.map(k => Buffer.from(k.publicKey).toString("hex"));
inv(admin, pool, "set_committee", ["--pubkeys", JSON.stringify(pubHex)]);
check("committee registered (3 nodes)", true, pubHex.map(p => p.slice(0, 8)).join(","));
check("priced verifier wired", (read("get_mpc_priced_verifier") ?? "").includes("C"), env.MPC_PRICED_VERIFIER_CONTRACT.slice(0, 10) + "...");

// 2) Fund pool XLM reserves so the XLM note can be backed.
inv(admin, xlmSac, "transfer", ["--from", Keypair.fromSecret(admin).publicKey(), "--to", pool, "--amount", "50000000"]);

// 3) USDC note (party A / assetX) — funded + deposited via CCTP.
const coinX = generateCoin("shade_px", `${SCRATCH}/px.json`, ASSETS.USDC.assetIdField);
const rootX = computeStateRoot(coinX, [coinX.commitmentDecimal], "shade_px", SCRATCH, "prx");
const inX = await runCctpInbound(env, { amount6: 1000000n, commitmentHex: coinX.commitmentHex, encryptedNotePayloadHashHex: "0x" + createHash("sha256").update(coinX.commitmentHex).digest("hex"), policyIdHex: "0x" + createHash("sha256").update("shade:default-testnet-policy:v1").digest("hex").slice(0, 64), fast: true, targetContract: pool, newRootHex: rootX, coin: coinX, scratch: SCRATCH, adminSecret: admin });
check("USDC note funded + deposited (CCTP)", true, `leaf ${inX.leafIndex}`);

// 4) XLM note (party B / assetY) — deposited directly against pool XLM reserves.
const coinY = generateCoin("shade_py", `${SCRATCH}/py.json`, ASSETS.XLM.assetIdField);
const rootXY = computeStateRoot(coinY, [coinX.commitmentDecimal, coinY.commitmentDecimal], "shade_py", SCRATCH, "pry");
const nonceY = "0x" + createHash("sha256").update("xlmnote:" + coinY.commitmentHex).digest("hex");
const encY = "0x" + createHash("sha256").update("xlmenc:" + coinY.commitmentHex).digest("hex");
const depY = buildDepositProof(coinY, {
  sourceDomain: "3", destinationDomain: "27", cctpNonceHex: nonceY, burnTxHashHex: "0x" + "cd".repeat(32),
  amount6dp: String(Math.ceil(Number(coinY.value7dp) / 10)), amount7dp: coinY.value7dp,
  assetStrkey: xlmSac, poolStrkey: pool, encryptedNotePayloadHashHex: encY, policyIdHex: "0x" + createHash("sha256").update("shade:default-testnet-policy:v1").digest("hex").slice(0, 64),
  poolId: env.SHADE_POOL_ID ?? "1", chainId: env.SHADE_CHAIN_ID ?? "148"
}, SCRATCH, "pry_dep");
inv(admin, pool, "receive_cctp_deposit", [
  "--source_domain", "3", "--cctp_nonce", bytesToCliHex(nonceY), "--asset", xlmSac, "--amount", coinY.value7dp,
  "--commitment", bytesToCliHex(coinY.commitmentHex), "--new_root", bytesToCliHex(rootXY),
  "--encrypted_note_payload_hash", bytesToCliHex(encY), "--policy_id", bytesToCliHex("0x" + createHash("sha256").update("shade:default-testnet-policy:v1").digest("hex").slice(0, 64)),
  "--proof_bytes", depY.proofHex, "--pub_signals_bytes", depY.publicHex
]);
check("XLM note deposited (direct, backed by XLM reserves)", true, `commitment ${coinY.commitmentHex.slice(0, 12)}...`);

// 5) ASP root for both labels.
const assoc = buildAssociationSet(coinX, SCRATCH, "priced_assoc");
execFileSync(COINUTILS, ["update-association", assoc.assocPath, label(coinY)], { encoding: "utf8" });
const assocRootDec = JSON.parse(readFileSync(assoc.assocPath, "utf8")).root as string;
const assocRootHex = "0x" + BigInt(assocRootDec).toString(16).padStart(64, "0");
inv(admin, pool, "set_association_root", ["--association_root", bytesToCliHex(assocRootHex)]);
check("ASP association root set (both labels)", true, assocRootHex.slice(0, 14) + "...");

// 6) Real priced proof (price 1.0: matchedB == matchedA, both COIN_VALUE).
const batchArr = createHash("sha256").update("priced:" + coinX.commitmentHex + coinY.commitmentHex).digest();
const batchHashHex = "0x" + batchArr.toString("hex");
const proof = buildMpcPricedProof({
  coinX, coinY, commitmentsDecimal: [coinX.commitmentDecimal, coinY.commitmentDecimal], assocPath: assoc.assocPath,
  scope: "shade_px", batchHashHex, poolId: env.SHADE_POOL_ID ?? "1", chainId: env.SHADE_CHAIN_ID ?? "148",
  priceScaled: "1000000000", minOutputA: "1", minOutputB: "1", deadlineLedger: "999999999", scratch: SCRATCH, tag: "priced_settle"
});
check("mpc_priced_settlement proof generated + verified", proof.locallyVerified, `nullA ${proof.nullifierHashAHex?.slice(0, 10)}...`);

// 7) Committee signatures over the batch hash.
const sigs = kps.map(k => Buffer.from(nacl.sign.detached(new Uint8Array(batchArr), k.secretKey)).toString("hex"));

// 8) New root = append both output commitments.
const statePath = `${SCRATCH}/priced_newroot.json`;
writeFileSync(statePath, JSON.stringify({ commitments: [coinX.commitmentDecimal, coinY.commitmentDecimal, toDec(proof.outputCommitmentAHex!), toDec(proof.outputCommitmentBHex!)], scope: "shade_px" }));
const newRootDec = execFileSync(COINUTILS, ["compute-root", statePath], { encoding: "utf8" }).trim();
const newRootHex = "0x" + BigInt(newRootDec).toString(16).padStart(64, "0");

// 9) Submit mpc_settle_priced (Option<Bytes> proof args -> JSON-quoted hex).
const strip = (h: string) => h.startsWith("0x") ? h.slice(2) : h;
try {
  const r = inv(relayer, pool, "mpc_settle_priced", [
    "--nullifier_a", strip(proof.nullifierHashAHex!), "--nullifier_b", strip(proof.nullifierHashBHex!),
    "--output_commitment_a", strip(proof.outputCommitmentAHex!), "--output_commitment_b", strip(proof.outputCommitmentBHex!),
    "--new_root", strip(newRootHex), "--batch_hash", strip(batchHashHex),
    "--signer_pubkeys", JSON.stringify(pubHex), "--signatures", JSON.stringify(sigs),
    "--proof_bytes", JSON.stringify(proof.proofHex), "--pub_signals_bytes", JSON.stringify(proof.publicHex)
  ]);
  check("ON-CHAIN mpc_settle_priced (priced USDC<->XLM crossing, proof verified)", !!r.txHash, `tx ${String(r.txHash).slice(0, 16)}...`);
} catch (e) {
  check("ON-CHAIN mpc_settle_priced (priced USDC<->XLM crossing, proof verified)", false, (e as Error).message.split("\n").find(l => /Error\(|Contract, #/i.test(l))?.slice(0, 160) ?? (e as Error).message.slice(0, 160));
}

await writeCheckReport("On-chain priced cross-asset MPC crossing E2E", results);
failIfAny(results);
console.log("Priced MPC e2e PASS");
