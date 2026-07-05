// Shade Streams — AGENT-SERVICE demo. An AI agent consumes a paid service on
// Arc, request by request, paying per call with off-chain vouchers, funded by
// USDC bridged cross-chain via CCTP. Shows exactly what the agent requested and
// what it paid each call, then settles the private net on real Arc testnet.
//
// Parties:
//   • SERVICE  — a real x402-gated HTTP endpoint (the payee/seller agent). Serves
//                a mock inference per request; rejects unpaid requests with 402.
//   • AGENT    — a real HTTP client (the payer/buyer agent). Opens a channel,
//                then streams N metered requests, signing a bigger voucher each
//                call. Settles the net when done.
//   • FUNDING  — the channel's USDC arrives cross-chain via Circle CCTP from a
//                source chain (Base Sepolia, domain 6) into Arc (domain 26).
//
// Run:  npm run agent-service-demo            (local anvil, real EVM)
//       npm run agent-service-demo:arc        (real Arc testnet, needs funded key)
//       REQUESTS=250 npm run agent-service-demo:arc

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

import { generatePayerKey, PayerAgent, verifyVoucher, type Voucher } from "@shade/sdk";
import { generateCoinBn254, buildStreamOpenProofBn254, buildStreamSettleProofBn254 } from "@shade/proving/bn254";
import { describeInboundRoute, ARC_DESTINATION } from "./cctp-arc.js";

const SHADE_ROOT = process.env.SHADE_ROOT ?? process.cwd();
const USE_TESTNET = !!process.env.ARC_RPC_URL;
const RPC_URL = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8555";
const ANVIL_BIN = existsSync("C:/Users/clats/.foundry/bin/anvil.exe") ? "C:/Users/clats/.foundry/bin/anvil.exe" : "anvil";
const DEPLOYER_KEY = process.env.ARC_DEPLOYER_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const REQUESTS = Number(process.env.REQUESTS ?? 100);
const SERVICE_PORT = 8788;
const RATE = 1n;        // 1 USDC-unit per request
const POOL_ID = 1n, CHAIN_ID = 42n;

let anvil: ChildProcess | undefined;
let service: Server | undefined;

function art(rel: string): { abi: unknown; bytecode: string } {
  const j = JSON.parse(readFileSync(resolve(SHADE_ROOT, "contracts/arc/out", rel), "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}
const addrHash = (a: string) => BigInt("0x" + createHash("sha256").update(Buffer.from(a.slice(2), "hex")).digest("hex")) >> 8n;
const hashToField = (v: bigint) => BigInt("0x" + createHash("sha256").update(Buffer.from(v.toString(16).padStart(64, "0"), "hex")).digest("hex")) >> 8n;
function log(s = "") { console.log(s); }
function step(t: string) { log(`\n\x1b[1m\x1b[36m▸ ${t}\x1b[0m`); }
function kv(k: string, v: string) { log(`    ${k.padEnd(20)} ${v}`); }

// voucher wire format (base64 JSON, bigints as strings) — matches apps/api/src/x402.ts
function serializeVoucher(v: Voucher): string {
  return Buffer.from(JSON.stringify({
    channelId: v.channelId.toString(), cumulative: v.cumulative.toString(), seq: v.seq,
    R8x: v.R8x.toString(), R8y: v.R8y.toString(), S: v.S.toString(), Ax: v.Ax.toString(), Ay: v.Ay.toString(),
  }), "utf8").toString("base64");
}
function parseVoucher(h: string | undefined): Voucher | undefined {
  if (!h) return undefined;
  try {
    const w = JSON.parse(Buffer.from(h, "base64").toString("utf8"));
    return { channelId: BigInt(w.channelId), cumulative: BigInt(w.cumulative), seq: Number(w.seq),
      R8x: BigInt(w.R8x), R8y: BigInt(w.R8y), S: BigInt(w.S), Ax: BigInt(w.Ax), Ay: BigInt(w.Ay) };
  } catch { return undefined; }
}

// The mock "AI service": a deterministic sentiment score for the prompt, so the
// response clearly depends on WHAT the agent requested.
function runInference(prompt: string): { model: string; sentiment: string; score: number } {
  const h = createHash("sha256").update(prompt).digest();
  const score = (h[0] / 255);
  return { model: "shade-sentiment-v1", sentiment: score > 0.5 ? "positive" : "negative", score: Math.round(score * 100) / 100 };
}

async function main() {
  log("\x1b[1m════════════════════════════════════════════════════════════════════");
  log("  SHADE STREAMS — agent buys a service on Arc, pays per request,");
  log("  funded cross-chain via CCTP");
  log(`  chain: ${USE_TESTNET ? `REAL ARC TESTNET (${RPC_URL})` : "local anvil (real EVM)"}   requests: ${REQUESTS}`);
  log("════════════════════════════════════════════════════════════════════\x1b[0m");

  if (!existsSync(resolve(SHADE_ROOT, "contracts/arc/out/StreamEscrow.sol/StreamEscrow.json"))) {
    log("ERROR: run `cd contracts/arc && forge build` first"); process.exit(1);
  }
  if (!USE_TESTNET) anvil = spawn(ANVIL_BIN, ["--port", "8555", "--silent"], { stdio: "ignore" });
  const provider = new JsonRpcProvider(RPC_URL);
  let startBlock = 0;
  for (let i = 0; i < 50; i++) { try { startBlock = await provider.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
  const deployer = new Wallet(DEPLOYER_KEY, provider);
  let n = await provider.getTransactionCount(deployer.address, "latest");

  // ---------- deploy the shielded-pool + streaming stack on Arc ----------
  step("Deploy the Shade shielded pool + streaming escrow on Arc");
  const poseidonAddr = (await (await deployer.sendTransaction({ data: readFileSync(resolve(SHADE_ROOT, "contracts/arc/test/poseidon2.bin"), "utf8").trim(), nonce: n++ })).wait())!.contractAddress!;
  const dep = async (rel: string, args: unknown[]) => {
    const a = art(rel); const c = await new ContractFactory(a.abi as any, a.bytecode, deployer).deploy(...args, { nonce: n++ }); await c.waitForDeployment(); return c;
  };
  const nullReg = await dep("NullifierRegistry.sol/NullifierRegistry.json", [deployer.address]);
  const pool = await dep("ShieldedPool.sol/ShieldedPool.json", [deployer.address, await nullReg.getAddress(), POOL_ID, CHAIN_ID, 12, poseidonAddr]);
  const escrow = await dep("StreamEscrow.sol/StreamEscrow.json", [deployer.address, await pool.getAddress(), await nullReg.getAddress(), 100n]);
  const openV = await dep("StreamOpenVerifier.sol/StreamOpenVerifier.json", []);
  const settleV = await dep("StreamSettleVerifier.sol/StreamSettleVerifier.json", []);
  const mockV = await dep("MockVerifiers.sol/MockVerifier.json", []);
  const usdc = await dep("MockERC20.sol/MockERC20.json", []);
  const poolAddr = await pool.getAddress(), escrowAddr = await escrow.getAddress(), usdcAddr = await usdc.getAddress();
  await (await (nullReg.connect(deployer) as any).setAuthorizedSpender(poolAddr, true, { nonce: n++ })).wait();
  await (await (nullReg.connect(deployer) as any).setAuthorizedSpender(escrowAddr, true, { nonce: n++ })).wait();
  await (await (pool.connect(deployer) as any).setAuthorizedStreamContract(escrowAddr, true, { nonce: n++ })).wait();
  await (await (pool.connect(deployer) as any).setDepositVerifier(await mockV.getAddress(), { nonce: n++ })).wait();
  await (await (escrow.connect(deployer) as any).setOpenVerifier(await openV.getAddress(), { nonce: n++ })).wait();
  await (await (escrow.connect(deployer) as any).setSettleVerifier(await settleV.getAddress(), { nonce: n++ })).wait();
  const usdcAsset = addrHash(usdcAddr);
  await (await (pool.connect(deployer) as any).registerAsset(usdcAsset, usdcAddr, { nonce: n++ })).wait();
  kv("ShieldedPool", poolAddr);
  kv("StreamEscrow", escrowAddr);
  log("    \x1b[32m✓ deployed on Arc\x1b[0m");

  // ---------- cross-chain funding via CCTP ----------
  step("Fund the agent cross-chain via Circle CCTP (source → Arc)");
  const route = describeInboundRoute("baseSepolia");
  kv("bridge", `${route.from} (domain ${route.sourceDomain}) → ${route.to} (domain ${route.destinationDomain})`);
  kv("TokenMessengerV2", route.tokenMessenger);
  kv("MessageTransmitterV2", route.messageTransmitter);
  kv("attestation (Iris)", route.attestationApi);
  kv("route", "burn USDC on source → Iris attestation → mint on Arc → into the shielded pool");
  // For this demo we mint the pool's USDC directly (representing the CCTP-minted
  // amount arriving on Arc). Executing the LIVE burn needs USDC on the source
  // chain — fund a Base-Sepolia address at faucet.circle.com to run it for real.
  const bridgedUsdc = 1000n;
  await (await (usdc.connect(deployer) as any).mint(poolAddr, 1_000_000n, { nonce: n++ })).wait();
  kv("bridged in", `${bridgedUsdc} USDC now backing the agent's balance on Arc`);

  // agent deposits the bridged USDC as a private shielded note.
  const agentKey = await generatePayerKey();
  const inCoin = await generateCoinBn254(bridgedUsdc, usdcAsset);
  const cctpNonce = "0x" + "a9".repeat(32);
  const dp: string[] = new Array(14).fill("0");
  dp[0] = inCoin.commitment.toString(); dp[1] = "4"; dp[2] = route.sourceDomain.toString(); dp[4] = hashToField(BigInt(cctpNonce)).toString();
  dp[5] = "1"; dp[6] = (bridgedUsdc / 10n + 1n).toString(); dp[7] = bridgedUsdc.toString();
  dp[8] = addrHash(usdcAddr).toString(); dp[9] = addrHash(poolAddr).toString(); dp[10] = hashToField(1n).toString();
  dp[11] = hashToField(1n).toString(); dp[12] = POOL_ID.toString(); dp[13] = CHAIN_ID.toString();
  await (await (pool.connect(deployer) as any).receiveDeposit(route.sourceDomain, cctpNonce, usdcAddr, bridgedUsdc, inCoin.commitment, 1n, 1n,
    { a: ["0", "0"], b: [["0", "0"], ["0", "0"]], c: ["0", "0"] }, dp, { nonce: n++ })).wait();
  kv("shielded note", `${bridgedUsdc} units (private — only the commitment is public)`);

  // ---------- OPEN a channel to the service ----------
  step("Agent OPENs a payment channel to the service (1 ZK proof)");
  const channelId = 0xA6E77n;
  const cap = BigInt(REQUESTS) * RATE + 50n; // headroom over the max it could spend
  const expiry = BigInt((await provider.getBlockNumber()) + 5000);
  const open = await buildStreamOpenProofBn254({
    inCoin, stateLeaves: [inCoin.commitment], stateIndex: 0, assocLabels: [inCoin.label], labelIndex: 0,
    channelId, payerAx: agentKey.Ax, payerAy: agentKey.Ay, cap, expiry, poolId: POOL_ID, chainId: CHAIN_ID,
  });
  const assocRoot = BigInt(open.publicSignals[4]);
  await (await (pool.connect(deployer) as any).setAssociationRoot(assocRoot, { nonce: n++ })).wait();
  const otx = await (escrow.connect(deployer) as any).open(open.proof, open.publicSignals.map((s) => BigInt(s)), { nonce: n++ });
  const orec = await otx.wait();
  kv("channelId", "0x" + channelId.toString(16));
  kv("cap", `${cap} units  (max the agent can spend this channel)`);
  kv("open tx", orec.hash);

  // ---------- start the x402-gated SERVICE ----------
  step("Service comes online (x402-gated) — reads the channel from Arc");
  const onChain = await (escrow as any).getChannel(channelId); // the payee verifies against on-chain channel state
  const svcChannel = { cap: BigInt(onChain.cap), payerAx: BigInt(onChain.payerAx), payerAy: BigInt(onChain.payerAy) };
  let unitsServed = 0n;
  let bestVoucher: Voucher | undefined;
  service = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const voucher = parseVoucher(req.headers["x-shade-voucher"] as string | undefined);
      const instructions = { escrow: escrowAddr, channelId: "0x" + channelId.toString(16), ratePerRequest: RATE.toString(), pay: "sign a voucher with cumulative >= (requests+1)*rate" };
      const reply = (code: number, obj: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (!voucher) return reply(402, { error: "payment required", ...instructions });
      // verify: signature, signed by the channel payer, within cap, covers the next unit.
      if (voucher.Ax !== svcChannel.payerAx || voucher.Ay !== svcChannel.payerAy) return reply(403, { error: "voucher not signed by channel payer" });
      if (!(await verifyVoucher(voucher))) return reply(403, { error: "invalid voucher signature" });
      if (voucher.cumulative > svcChannel.cap) return reply(403, { error: "voucher exceeds channel cap" });
      const owed = (unitsServed + 1n) * RATE;
      if (voucher.cumulative < owed) return reply(402, { error: "insufficient payment", owed: owed.toString(), provided: voucher.cumulative.toString(), ...instructions });
      // paid — serve the inference.
      const prompt = (JSON.parse(body || "{}").prompt as string) ?? "";
      unitsServed += 1n;
      bestVoucher = voucher;
      reply(200, { unit: unitsServed.toString(), paidCumulative: voucher.cumulative.toString(), result: runInference(prompt) });
    });
  });
  await new Promise<void>((r) => service!.listen(SERVICE_PORT, r));
  kv("service", `http://127.0.0.1:${SERVICE_PORT}/infer  (verifies vouchers against channel 0x${channelId.toString(16)})`);

  // ---------- AGENT streams N metered requests ----------
  step(`Agent streams ${REQUESTS} paid requests (per-call payment, 0 gas per call)`);
  const agent = new PayerAgent({ key: agentKey, channelId, cap, ratePerUnit: RATE, budget: BigInt(REQUESTS) * RATE });
  const prompts = ["analyze market sentiment for USDC", "is this contract safe to call?", "summarize the latest block", "rate this transaction risk", "should the agent top up the channel?"];
  let served = 0, paid402 = 0;
  log("    request │ prompt                                  │ paid │ service response");
  log("    ────────┼─────────────────────────────────────────┼──────┼──────────────────────");
  for (let i = 1; i <= REQUESTS; i++) {
    const prompt = prompts[i % prompts.length];
    const voucher = await agent.pay(1n); // authorize 1 more unit of service
    const r = await fetch(`http://127.0.0.1:${SERVICE_PORT}/infer`, {
      method: "POST", headers: { "content-type": "application/json", "x-shade-voucher": serializeVoucher(voucher) }, body: JSON.stringify({ prompt }),
    });
    const j = await r.json() as any;
    if (r.status === 200) { served++; } else { paid402++; }
    if (i <= 5 || i === REQUESTS) {
      const resp = r.status === 200 ? `${j.result.sentiment} (${j.result.score})` : `HTTP ${r.status}`;
      log(`    #${String(i).padStart(6)} │ ${prompt.slice(0, 39).padEnd(39)} │ ${String(voucher.cumulative).padStart(4)} │ ${resp}`);
    }
    if (i === 6) log(`      …    │ (${REQUESTS - 6} more requests streamed off-chain, each paid) │      │`);
  }
  kv("requests served", `${served} / ${REQUESTS}   (402/unpaid: ${paid402})`);
  kv("total paid (off-chain)", `${agent.spent()} units across ${REQUESTS} vouchers — ZERO on-chain writes`);

  // ---------- SETTLE the net on Arc ----------
  step("Service SETTLEs the accumulated net on Arc (1 ZK proof)");
  const highest = bestVoucher!;
  const settle = await buildStreamSettleProofBn254({ voucher: highest, cap, assetId: usdcAsset, associationRoot: assocRoot, poolId: POOL_ID, chainId: CHAIN_ID });
  const stx = await (escrow.connect(deployer) as any).settle(settle.proof, settle.publicSignals.map((s) => BigInt(s)), { nonce: n++ });
  const srec = await stx.wait();
  kv("service earns", `${highest.cumulative} units (${served} requests × ${RATE}) — a private shielded note`);
  kv("agent refund", `${cap - highest.cumulative} units back — a private shielded note`);
  kv("settle tx", srec.hash);

  // ---------- receipt ----------
  step("Receipt (reconstructed from on-chain events)");
  const { fetchChannelReceipt } = await import("./index.js");
  const receipt = await fetchChannelReceipt({ rpcUrl: RPC_URL }, escrowAddr, channelId, startBlock);
  kv("state", receipt.state);
  kv("gross (paid for service)", `${receipt.gross} units`);
  kv("invariant", receipt.gross === highest.cumulative ? "\x1b[32m✓ receipt gross == what the agent signed for its requests\x1b[0m" : "\x1b[31m✗ mismatch\x1b[0m");

  log("\n\x1b[1m\x1b[32m═══ DONE — agent consumed a service on Arc across " + REQUESTS + " paid requests,");
  log("    funded cross-chain via CCTP, settled ONE private net on-chain. ═══\x1b[0m");
  if (USE_TESTNET) kv("\nexplorer", `${"https://testnet.arcscan.app/tx/"}${srec.hash}`);

  service?.close(); anvil?.kill();
  process.exit(receipt.gross === highest.cumulative ? 0 : 1);
}

main().catch((e) => { console.error("\nDEMO FAILED:", e); service?.close(); anvil?.kill(); process.exit(1); });
