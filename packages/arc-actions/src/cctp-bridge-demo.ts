// Real CCTP V2 cross-chain leg: burn USDC on Base Sepolia -> Circle Iris
// attestation -> mint on Arc testnet. This is the LITERAL cross-chain transfer
// that funds an Arc service payment from another chain — no representation, real
// Circle infra, real tx hashes on both chains.
//
// Prereqs on the deployer address (same EOA on every EVM chain):
//   • USDC on Base Sepolia   (faucet.circle.com → Base Sepolia)   ✓ you have 20
//   • ETH on Base Sepolia    (a Base Sepolia ETH faucet — for burn gas)
//   • USDC on Arc testnet    (already funded — Arc gas is native USDC)
//
// Run: npm run cctp-bridge:arc   (loads .env.arc-testnet.local)
//      AMOUNT_USDC=5 npm run cctp-bridge:arc

import { JsonRpcProvider, Wallet, Contract, formatUnits, zeroPadValue, getBytes } from "ethers";
import { CCTP_V2, CCTP_DOMAINS, CCTP_ATTESTATION_API, ARC_DESTINATION } from "./cctp-arc.js";

const KEY = process.env.ARC_DEPLOYER_KEY;
if (!KEY) { console.error("ARC_DEPLOYER_KEY required (in .env.arc-testnet.local)"); process.exit(1); }
const AMOUNT = BigInt(process.env.AMOUNT_USDC ?? "5") * 1_000_000n; // USDC has 6 decimals

const BASE_RPC = "https://sepolia.base.org";
const BASE_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Circle testnet USDC on Base Sepolia

const TOKEN_MESSENGER_ABI = [
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)",
];
const MESSAGE_TRANSMITTER_ABI = [
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

function kv(k: string, v: string) { console.log(`    ${k.padEnd(22)} ${v}`); }
function step(s: string) { console.log(`\n\x1b[1m\x1b[36m▸ ${s}\x1b[0m`); }

async function fetchAttestation(sourceDomain: number, burnTxHash: string): Promise<{ message: string; attestation: string }> {
  const url = `${CCTP_ATTESTATION_API}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
  for (let i = 0; i < 90; i++) { // up to ~7.5 min
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        const m = data?.messages?.[0];
        if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING") {
          return { message: m.message, attestation: m.attestation };
        }
        process.stdout.write(`\r    waiting for Circle attestation… (${i * 5}s, status=${m?.status ?? "pending"})   `);
      }
    } catch { /* transient */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("attestation not ready after timeout");
}

async function main() {
  console.log("\x1b[1m════════════════════════════════════════════════════════════════════");
  console.log("  REAL CCTP cross-chain leg — Base Sepolia → Arc testnet");
  console.log("════════════════════════════════════════════════════════════════════\x1b[0m");

  const base = new JsonRpcProvider(BASE_RPC, 84532);
  const arc = new JsonRpcProvider(ARC_DESTINATION.rpcUrl, ARC_DESTINATION.chainId);
  const baseSigner = new Wallet(KEY!, base);
  const arcSigner = new Wallet(KEY!, arc);
  const recipient = baseSigner.address;

  step("Preflight — balances + contracts");
  const usdc = new Contract(BASE_USDC, ERC20_ABI, baseSigner);
  const [baseEth, baseUsdc, arcUsdc] = await Promise.all([
    base.getBalance(recipient), usdc.balanceOf(recipient), arc.getBalance(recipient),
  ]);
  kv("account", recipient);
  kv("Base Sepolia ETH (gas)", formatUnits(baseEth, 18) + " ETH");
  kv("Base Sepolia USDC", formatUnits(baseUsdc, 6) + " USDC");
  kv("Arc USDC (gas)", formatUnits(arcUsdc, 18) + " USDC");
  kv("transfer amount", formatUnits(AMOUNT, 6) + " USDC");
  if (baseUsdc < AMOUNT) { console.error(`\nInsufficient Base USDC. Fund at faucet.circle.com (Base Sepolia).`); process.exit(1); }
  if (baseEth === 0n) {
    console.error("\n\x1b[31mNo Base Sepolia ETH for gas.\x1b[0m The burn tx needs a little native ETH.");
    console.error("Get ~0.01 Base Sepolia ETH from a faucet, e.g.:");
    console.error("  • https://www.alchemy.com/faucets/base-sepolia");
    console.error("  • https://faucet.quicknode.com/base/sepolia");
    console.error(`Fund: ${recipient}  — then re-run: npm run cctp-bridge:arc`);
    process.exit(1);
  }

  step("1/4 — Approve the TokenMessenger to burn USDC (Base Sepolia)");
  const allowance: bigint = await usdc.allowance(recipient, CCTP_V2.tokenMessenger);
  if (allowance < AMOUNT) {
    const atx = await usdc.approve(CCTP_V2.tokenMessenger, AMOUNT);
    kv("approve tx", atx.hash);
    await atx.wait();
  } else { kv("approve", "already sufficient"); }

  step("2/4 — depositForBurn (Base Sepolia → Arc, CCTP domain 26)");
  const tm = new Contract(CCTP_V2.tokenMessenger, TOKEN_MESSENGER_ABI, baseSigner);
  const mintRecipient = zeroPadValue(recipient, 32); // bytes32 of the Arc recipient
  const destinationCaller = "0x" + "00".repeat(32); // anyone can complete on Arc
  const maxFee = AMOUNT / 1000n; // small fast-transfer fee cap
  const minFinality = 1000; // fast
  const btx = await tm.depositForBurn(AMOUNT, CCTP_DOMAINS.arcTestnet, mintRecipient, BASE_USDC, destinationCaller, maxFee, minFinality);
  kv("burn tx (Base)", btx.hash);
  const brec = await btx.wait();
  kv("burned", `${formatUnits(AMOUNT, 6)} USDC on Base Sepolia (block ${brec.blockNumber})`);
  kv("explorer", `https://sepolia.basescan.org/tx/${btx.hash}`);

  step("3/4 — Fetch Circle attestation (Iris)");
  const { message, attestation } = await fetchAttestation(CCTP_DOMAINS.baseSepolia, btx.hash);
  console.log();
  kv("attestation", attestation.slice(0, 42) + "…");
  kv("message", message.slice(0, 42) + "…");

  step("4/4 — receiveMessage on Arc (mint USDC on Arc)");
  const arcBalBefore = await arc.getBalance(recipient);
  const mt = new Contract(CCTP_V2.messageTransmitter, MESSAGE_TRANSMITTER_ABI, arcSigner);
  const mtx = await mt.receiveMessage(getBytes(message), getBytes(attestation));
  kv("mint tx (Arc)", mtx.hash);
  const mrec = await mtx.wait();
  const arcBalAfter = await arc.getBalance(recipient);
  kv("mint status", mrec.status === 1 ? "SUCCESS" : "FAIL");
  kv("Arc balance delta", formatUnits(arcBalAfter - arcBalBefore, 18) + " (native USDC; net of gas)");
  kv("explorer", `https://testnet.arcscan.app/tx/${mtx.hash}`);

  console.log("\n\x1b[1m\x1b[32m═══ REAL CROSS-CHAIN LEG COMPLETE — USDC burned on Base Sepolia and");
  console.log("    minted on Arc testnet via Circle CCTP, verifiable on both explorers. ═══\x1b[0m\n");
  process.exit(mrec.status === 1 ? 0 : 1);
}

main().catch((e) => { console.error("\nBRIDGE FAILED:", e.shortMessage ?? e.message ?? e); process.exit(1); });
