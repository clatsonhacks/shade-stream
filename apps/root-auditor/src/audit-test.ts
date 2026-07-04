import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareRoots, recomputeRoot, type DepositLeaf } from "./audit.js";
import { runAudit } from "./run.js";

// root-auditor tests:
// 1. correct commitment set + correct root -> OK
// 2. correct commitment set + WRONG on-chain root (registrar lied) -> ROOT_MISMATCH_CRITICAL detected
// 3. live audit against the deployed ShadePool -> OK
// Exits non-zero if any required check fails.

const SHADE_ROOT = process.env.SHADE_ROOT ?? process.cwd();
const ZK_REF = process.env.SHADE_ZK_REF ?? resolve(SHADE_ROOT, ".zk-ref/soroban-examples/privacy-pools");
const COINUTILS = process.env.COINUTILS_BIN ?? resolve(ZK_REF, "target/release/stellar-coinutils");
const SCRATCH = process.env.SHADE_SCRATCH_DIR ?? resolve(SHADE_ROOT, ".scratch");

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

// Build a small real commitment set with coinutils and its true root.
function genCoin(scope: string): { commitmentHex: string; commitmentDecimal: string } {
  const out = `${SCRATCH}/audit_${scope}.json`;
  execFileSync(COINUTILS, ["generate", scope, "-o", out], { encoding: "utf8" });
  const c = JSON.parse(readFileSync(out, "utf8"));
  return { commitmentHex: c.commitment_hex, commitmentDecimal: c.coin.commitment };
}

const POOL = "CTESTPOOLAUDITDETERMINISTICDETERMINISTICDETERMINIST00000";
const a = genCoin("auditA");
const b = genCoin("auditB");
const leaves: DepositLeaf[] = [
  { leafIndex: 0, commitmentHex: a.commitmentHex, commitmentDecimal: a.commitmentDecimal },
  { leafIndex: 1, commitmentHex: b.commitmentHex, commitmentDecimal: b.commitmentDecimal }
];
const trueRoot = recomputeRoot(leaves.map((l) => l.commitmentDecimal));

// 1) honest registrar: on-chain root == recomputed root.
const honest = compareRoots(POOL, leaves, trueRoot, "events");
check("honest root passes audit", honest.status === "OK", honest.detail);

// 2) malicious registrar: on-chain root differs from the real leaves.
const wrongRoot = "0x" + "11".repeat(32);
const lying = compareRoots(POOL, leaves, wrongRoot, "events");
check("wrong root submitted by registrar is detected", lying.status === "ROOT_MISMATCH_CRITICAL", lying.detail);

// 2b) a single tampered commitment (one leaf swapped) is detected even if the
// claimed root is "self-consistent" for a different set.
const tamperedLeaves: DepositLeaf[] = [leaves[0], { ...leaves[1], commitmentDecimal: a.commitmentDecimal, commitmentHex: a.commitmentHex }];
const tamperedRoot = recomputeRoot(tamperedLeaves.map((l) => l.commitmentDecimal));
const swap = compareRoots(POOL, leaves, tamperedRoot, "events");
check("swapped-leaf root mismatch is detected", swap.status === "ROOT_MISMATCH_CRITICAL", swap.detail);

// 3) live audit against the deployed pool (events or DB) — only if env present.
if (existsSync(".env.generated") && readFileSync(".env.generated", "utf8").includes("SHIELDED_POOL_CONTRACT=")) {
  try {
    const live = await runAudit();
    check(`live audit against deployed pool (${live.source})`, live.status === "OK", live.detail);
  } catch (e) {
    check("live audit against deployed pool", false, (e as Error).message.slice(0, 140));
  }
} else {
  console.log("SKIP  live audit (no .env.generated)");
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\nROOT AUDITOR TESTS FAILED: ${failed.map((f) => f.name).join(", ")}`);
  process.exit(1);
}
console.log("\nROOT AUDITOR TESTS PASS");
