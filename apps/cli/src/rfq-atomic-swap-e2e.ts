import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { loadRuntimeEnv, requireKeys } from "./lib/env.js";
import { failIfAny, writeCheckReport, type CheckResult } from "./lib/report.js";
import { runCctpInbound } from "./lib/cctp-inbound.js";
import { sorobanInvoke, bytesToCliHex, createTrustline } from "@shade/stellar-utils";
import { generateCoin, computeStateRoot, buildAssociationSet, buildNoteProof, hashToField } from "./lib/prove.js";
import { ASSETS } from "@shade/assets";
import { signAtomicSwap, quotedFromPrice } from "@shade/rfq";
import { scratchDir } from "./lib/paths.js";

// Full ON-CHAIN atomic USDC->XLM RFQ swap: a private USDC note is spent, XLM is
// delivered to the user from pool reserves, and the solver is credited USDC — all
// or nothing, with the solver-signed swap terms + proof-bound quote.

const SCRATCH = scratchDir();
const env = await loadRuntimeEnv();
const results: CheckResult[] = [];
const check = (n: string, ok: boolean, d = "") => { results.push({ name: n, ok, detail: d }); console.log(`  [${ok ? "OK" : "FAIL"}] ${n}${d ? " — " + d : ""}`); };

const missing = requireKeys(env, ["SHIELDED_POOL_CONTRACT", "VERIFIER_WITHDRAW_CONTRACT", "STELLAR_TESTNET_USDC_SAC_CONTRACT", "STELLAR_TESTNET_XLM_SAC_CONTRACT", "STELLAR_DEPLOYER_SECRET", "STELLAR_USER_PUBLIC"]);
check("required env", missing.length === 0, missing.join(", ") || "present");
if (missing.length) { await writeCheckReport("RFQ atomic swap E2E", results); failIfAny(results); }

const pool = env.SHIELDED_POOL_CONTRACT;
const admin = env.STELLAR_DEPLOYER_SECRET;
const relayer = env.STELLAR_RELAYER_SECRET ?? admin;
const rpc = env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const pass = env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const xlmSac = env.STELLAR_TESTNET_XLM_SAC_CONTRACT!;
const userPub = env.STELLAR_USER_PUBLIC!;
const inv = (secret: string, contract: string, method: string, args: string[]) => sorobanInvoke({ contractId: contract, secret, method, args, rpcUrl: rpc, passphrase: pass, retries: 3 });
const read = (method: string, args: string[] = []) => sorobanInvoke({ contractId: pool, secret: admin, method, args, rpcUrl: rpc, passphrase: pass, readOnly: true }).returnValue.replace(/"/g, "").trim();
const tokenBal = (sac: string, who: string) => BigInt(sorobanInvoke({ contractId: sac, secret: admin, method: "balance", args: ["--id", who], rpcUrl: rpc, passphrase: pass, readOnly: true }).returnValue.replace(/"/g, ""));

// 1) Fund the pool with XLM reserves (5 XLM) so it can deliver the output leg.
inv(admin, xlmSac, "transfer", ["--from", (Keypair.fromSecret(admin)).publicKey(), "--to", pool, "--amount", "50000000"]);
check("pool funded with XLM reserves", tokenBal(xlmSac, pool) >= 50000000n, `${Number(tokenBal(xlmSac, pool)) / 1e7} XLM`);

// 2) User's private USDC note, funded + deposited via CCTP.
const coin = generateCoin("shade_rfqswap", `${SCRATCH}/rfqswap.json`, ASSETS.USDC.assetIdField);
const rootAfter = computeStateRoot(coin, [coin.commitmentDecimal], "shade_rfqswap", SCRATCH, "rfqswap");
const inbound = await runCctpInbound(env, { amount6: 1000000n, commitmentHex: coin.commitmentHex, encryptedNotePayloadHashHex: "0x" + createHash("sha256").update(coin.commitmentHex).digest("hex"), policyIdHex: "0x" + createHash("sha256").update("shade:default-testnet-policy:v1").digest("hex").slice(0, 64), fast: true, targetContract: pool, newRootHex: rootAfter, coin, scratch: SCRATCH, adminSecret: admin });
check("USDC note funded + deposited (CCTP)", true, `leaf ${inbound.leafIndex}`);

// 3) ASP root for the note's label.
const assoc = buildAssociationSet(coin, SCRATCH, "rfqswap");
inv(admin, pool, "set_association_root", ["--association_root", bytesToCliHex(assoc.rootHex)]);
check("ASP association root set", true, assoc.rootHex.slice(0, 14) + "...");

// 4) Authorized solver (ed25519 Stellar key).
const solver = Keypair.random();
const solverPkHex = Buffer.from(solver.rawPublicKey()).toString("hex");
inv(admin, pool, "set_authorized_solver", ["--solver_pubkey", solverPkHex, "--allowed", "true"]);
const solverUsdcTo = Keypair.fromSecret(relayer).publicKey();
// The solver's USDC recipient needs a USDC trustline to be credited.
try { await createTrustline(relayer, env.STELLAR_TESTNET_USDC_ISSUER ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"); } catch { /* already exists */ }
const solverOk = sorobanInvoke({ contractId: pool, secret: admin, method: "is_authorized_solver", args: ["--solver_pubkey", solverPkHex], rpcUrl: rpc, passphrase: pass, readOnly: true }).returnValue.includes("true");
check("solver authorized on pool", solverOk, solverPkHex.slice(0, 10) + "...");

// 5) Swap terms: 0.5 USDC in -> XLM out at price 2.0 (XLM per USDC).
const quoteHashHex = "0x" + createHash("sha256").update("quote:" + coin.commitmentHex).digest("hex");
const intentHashHex = "0x" + createHash("sha256").update("intent:" + coin.commitmentHex).digest("hex");
const fillHashHex = "0x" + createHash("sha256").update("fill:" + coin.commitmentHex).digest("hex");
const withdrawnValue = BigInt(coin.value7dp); // 0.5 USDC 7dp
const priceScaled = 2_000_000_000n;           // 2.0 XLM per USDC
const quotedOutput = quotedFromPrice(withdrawnValue, priceScaled); // 1.0 XLM (7dp)
const minOutput = quotedOutput - 100000n;
const outputAssetIdHex = ASSETS.XLM.assetIdHex;

// 6) User note proof (operationType = RFQ_ATOMIC_SWAP=5), quote/intent/fill bound.
const proof = buildNoteProof(coin, [coin.commitmentDecimal], "shade_rfqswap", SCRATCH, "rfqswap", assoc.assocPath, {
  operationType: "5", recipientHash: "0", relayerFee: "0", deadlineLedger: "999999999",
  quoteHash: hashToField(quoteHashHex), intentHash: hashToField(intentHashHex), fillReceiptHash: hashToField(fillHashHex)
});
check("user note proof (op=RFQ_ATOMIC_SWAP) generated + verified", proof.locallyVerified, `stateRoot ${proof.stateRootHex.slice(0, 12)}...`);

// 7) Solver signs the exact swap terms.
const sig = signAtomicSwap({ quoteHashHex, outputAssetIdHex, quotedOutput, minOutput, priceScaled, recipientStrkey: userPub }, solver.secret());
check("solver signed swap terms", sig.swapHash.length === 66);

// 8) Submit rfq_settle_atomic_swap.
const userXlmBefore = tokenBal(xlmSac, userPub);
const usdcSac = env.STELLAR_TESTNET_USDC_SAC_CONTRACT!;
const solverUsdcBefore = tokenBal(usdcSac, solverUsdcTo);
try {
  const r = inv(relayer, pool, "rfq_settle_atomic_swap", [
    "--user_xlm_recipient", userPub,
    "--solver_usdc_recipient", solverUsdcTo,
    "--proof_bytes", proof.proofHex, "--pub_signals_bytes", proof.publicHex,
    "--quote_hash", bytesToCliHex(quoteHashHex), "--intent_hash", bytesToCliHex(intentHashHex), "--fill_receipt_hash", bytesToCliHex(fillHashHex),
    "--output_asset_id", outputAssetIdHex.slice(2),
    "--quoted_output", quotedOutput.toString(), "--min_output", minOutput.toString(), "--price_scaled", priceScaled.toString(),
    "--solver_pubkey", solverPkHex, "--solver_sig", sig.sig
  ]);
  check("ON-CHAIN rfq_settle_atomic_swap (USDC note -> XLM to user, USDC to solver)", !!r.txHash, `tx ${String(r.txHash).slice(0, 16)}...`);
} catch (e) {
  check("ON-CHAIN rfq_settle_atomic_swap (USDC note -> XLM to user, USDC to solver)", false, (e as Error).message.split("\n").find(l => /Error\(|Contract, #/i.test(l))?.slice(0, 160) ?? (e as Error).message.slice(0, 160));
}

const userXlmAfter = tokenBal(xlmSac, userPub);
const solverUsdcAfter = tokenBal(usdcSac, solverUsdcTo);
check("user received XLM >= min_output", userXlmAfter - userXlmBefore >= minOutput, `+${Number(userXlmAfter - userXlmBefore) / 1e7} XLM`);
check("solver credited USDC", solverUsdcAfter - solverUsdcBefore > 0n, `+${Number(solverUsdcAfter - solverUsdcBefore) / 1e7} USDC`);

await writeCheckReport("On-chain atomic USDC->XLM RFQ swap E2E", results);
failIfAny(results);
console.log("RFQ atomic swap e2e PASS");
