import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beginReport } from "./lib/report.js";

// `npm run e2e:testnet:all` — the single reproducible acceptance command.
//
// It runs the full functional + adversarial scenario matrix. Adversarial
// scenarios are backed by the offline contract/circuit/security suites (each is
// an adversarial regression test in one of them). Offline-verifiable functional
// flows (remit, Shade View, recovery) run their own suites. On-chain functional
// flows (CCTP in/out, withdraw, RFQ, MPC crossings) require a deployed testnet
// and funded keys; without them they report SKIPPED_NO_TESTNET (an honest status,
// not a pass) and the gate fails. There is no mock-success fallback.

type Status = "PASS" | "FAIL" | "SKIPPED_NO_TESTNET";

// An offline suite that covers one or more scenarios. Run once, result reused.
type Suite = "contracts" | "circuits" | "security" | "remit" | "shade-view" | "recovery";
const SUITE_CMD: Record<Suite, string> = {
  contracts: "test:contracts",
  circuits: "test:circuits",
  security: "test:security",
  remit: "remit:test",
  "shade-view": "shade-view:test",
  recovery: "vault:test"
};

type Scenario = {
  id: string;
  name: string;
  kind: "functional" | "adversarial";
  // Offline suite that verifies this scenario, or null for an on-chain flow that
  // needs a live testnet. `testnetCmd` names the CLI flow to run when testnet is
  // configured.
  suite?: Suite;
  testnetCmd?: string;
};

const TESTNET_READY = Boolean(
  process.env.SHADE_TESTNET_READY === "true" ||
    (process.env.STELLAR_RPC_URL && process.env.SHIELDED_POOL_CONTRACT_ID)
);

const SCENARIOS: Scenario[] = [
  // Functional (§12.2)
  { id: "F1", name: "CCTP inbound -> private USDC note", kind: "functional", testnetCmd: "cctp:inbound:e2e" },
  { id: "F2", name: "private USDC note -> public Stellar USDC withdraw", kind: "functional", testnetCmd: "zk:withdraw:e2e" },
  { id: "F3", name: "RFQ USDC->XLM public XLM >= min_output", kind: "functional", testnetCmd: "rfq:e2e" },
  { id: "F4", name: "MPC same-asset: two USDC notes -> two USDC output notes", kind: "functional", testnetCmd: "mpc:e2e" },
  { id: "F5", name: "CCTP exit to destination", kind: "functional", testnetCmd: "cctp:outbound:e2e" },
  { id: "F6", name: "Remit simulated INR quote -> receipt", kind: "functional", suite: "remit" },
  { id: "F7", name: "Shade View report verifies", kind: "functional", suite: "shade-view" },
  { id: "F8", name: "Recovery: wipe client -> recover notes", kind: "functional", suite: "recovery" },
  { id: "F9", name: "MPC priced cross-asset USDC<->XLM", kind: "functional", testnetCmd: "mpc:rfq:e2e" },

  // Adversarial (§12.3) — all covered by offline contract/circuit/security suites.
  { id: "A1", name: "duplicate CCTP nonce -> no second note", kind: "adversarial", suite: "contracts" },
  { id: "A2", name: "expired quote -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A3", name: "relayer changes destination -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A4", name: "relayer changes amount -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A5", name: "relayer changes asset -> rejected", kind: "adversarial", suite: "circuits" },
  { id: "A6", name: "solver changes fee after signing -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A7", name: "wrong ASP root -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A8", name: "denied compliance label -> rejected", kind: "adversarial", suite: "circuits" },
  { id: "A9", name: "forged tree root -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A10", name: "duplicate committee signer -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A11", name: "threshold-1 committee -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A12", name: "missing MPC proof -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A13", name: "MPC verifier unset -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A14", name: "wrong batch hash -> rejected", kind: "adversarial", suite: "contracts" },
  { id: "A15", name: "wrong output commitment -> rejected", kind: "adversarial", suite: "circuits" },
  { id: "A16", name: "wrong asset ID -> rejected", kind: "adversarial", suite: "circuits" },
  { id: "A17", name: "double spend nullifier -> rejected", kind: "adversarial", suite: "contracts" }
];

// Run each distinct suite / testnet command at most once and cache the result.
const cache = new Map<string, boolean>();
function runCmd(script: string): boolean {
  if (cache.has(script)) return cache.get(script)!;
  const r = spawnSync("npm", ["run", script], { encoding: "utf8", stdio: "pipe", env: process.env });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  const ok = r.status === 0;
  cache.set(script, ok);
  return ok;
}

function runScenario(s: Scenario): { status: Status; detail: string } {
  if (s.suite) {
    return runCmd(SUITE_CMD[s.suite]) ? { status: "PASS", detail: s.suite } : { status: "FAIL", detail: s.suite };
  }
  // on-chain flow: needs a live testnet
  if (!TESTNET_READY) {
    return { status: "SKIPPED_NO_TESTNET", detail: `set SHADE_TESTNET_READY + deploy, then: npm run ${s.testnetCmd}` };
  }
  return runCmd(s.testnetCmd!) ? { status: "PASS", detail: s.testnetCmd! } : { status: "FAIL", detail: s.testnetCmd! };
}

const runId = randomUUID();
beginReport({ runId });

const rows: string[] = [];
let hardFail = false;
let skipped = 0;

console.log("Shade testnet E2E acceptance\n");
for (const s of SCENARIOS) {
  const { status, detail } = runScenario(s);
  rows.push(`| ${s.id} | ${s.kind} | ${s.name} | ${status} | ${detail} |`);
  console.log(`[${status}] ${s.id} ${s.name} — ${detail}`);
  if (status === "FAIL") hardFail = true;
  if (status === "SKIPPED_NO_TESTNET") skipped++;
}

const summary = [
  "",
  "## Testnet E2E Acceptance Matrix",
  "",
  "| ID | Kind | Scenario | Status | Detail |",
  "| -- | ---- | -------- | ------ | ------ |",
  ...rows,
  "",
  `Skipped (no testnet): ${skipped}, hard failures: ${hardFail ? "yes" : "no"}`
].join("\n");

const reportFile = process.env.SHADE_REPORT_FILE ?? "docs/test-report.generated.md";
appendFileSync(reportFile, `\n${summary}\n`);
console.log(summary);

if (hardFail || skipped > 0) {
  const reasons: string[] = [];
  if (hardFail) reasons.push("scenario failures");
  if (skipped > 0) reasons.push(`${skipped} on-chain scenario(s) need a deployed testnet (set SHADE_TESTNET_READY)`);
  console.error(`\nE2E ACCEPTANCE NOT COMPLETE: ${reasons.join("; ")}`);
  process.exit(1);
}

console.log("\nE2E ACCEPTANCE COMPLETE: all scenarios passed.");
