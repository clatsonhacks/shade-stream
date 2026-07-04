import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beginReport } from "./lib/report.js";

const commands = [
  ["setup:testnet", ["run", "setup:testnet"]],
  ["contracts:init:stellar", ["run", "contracts:init:stellar"]],
  ["cctp:inbound:e2e", ["run", "cctp:inbound:e2e"]],
  ["zk:withdraw:e2e", ["run", "zk:withdraw:e2e"]],
  ["rfq:e2e", ["run", "rfq:e2e"]],
  ["cctp:outbound:e2e", ["run", "cctp:outbound:e2e"]],
  ["root-auditor:test", ["run", "root-auditor:test"]]
] as const;

// one fresh report for the whole suite; children append to it via the
// shared run id (they don't reset it).
const runId = randomUUID();
beginReport({ runId });
const childEnv = { ...process.env, SHADE_REPORT_RUN_ID: runId };

const results: string[] = [];
let failed = false;
for (const [name, args] of commands) {
  const result = spawnSync("npm", args, { encoding: "utf8", stdio: "pipe", env: childEnv });
  const ok = result.status === 0;
  failed ||= !ok;
  results.push(`- ${name}: ${ok ? "PASS" : "FAIL"}`);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

const reportFile = process.env.SHADE_REPORT_FILE ?? "docs/test-report.generated.md";
appendFileSync(reportFile, `\n## E2E All Aggregate\n\n${results.join("\n")}\n`);
if (failed) {
  throw new Error(`E2E aggregate failed:\n${results.join("\n")}`);
}
