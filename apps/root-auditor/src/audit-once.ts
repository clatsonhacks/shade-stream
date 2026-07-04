import { runAudit } from "./run.js";

// One-shot CLI audit: print the result and exit non-zero on a critical mismatch
// (so it can gate CI / a deploy pipeline).
const result = await runAudit();
console.log(JSON.stringify(result, null, 2));
if (result.status !== "OK") {
  console.error(`ROOT AUDIT FAILED: ${result.detail}`);
  process.exit(1);
}
console.log(`ROOT AUDIT OK (${result.leafCount} leaves, root ${result.onchainRootHex})`);
