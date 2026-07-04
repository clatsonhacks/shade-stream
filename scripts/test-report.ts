import { existsSync, readFileSync } from "node:fs";

// print the freshly-generated report and FAIL the command if it contains
// any FAIL marker (CI gate). Falls back to the legacy committed report if the
// generated one hasn't been produced yet.
const generated = process.env.SHADE_REPORT_FILE ?? "docs/test-report.generated.md";
const path = existsSync(generated) ? generated : "docs/test-report.md";

if (!existsSync(path)) {
  console.error(`No test report found at ${path}. Run an e2e (e.g. npm run e2e:all) first.`);
  process.exit(1);
}

const report = readFileSync(path, "utf8");
console.log(report);

const failLines = report.split("\n").filter((l) => /:\s*FAIL\b|\bFAIL\b/.test(l) && !/PASS\/FAIL|FAIL`|fail on/i.test(l));
if (failLines.length) {
  console.error(`\ntest-report: ${failLines.length} FAIL line(s) in ${path}:`);
  for (const l of failLines) console.error(`  ${l.trim()}`);
  process.exit(1);
}
console.log(`\ntest-report: OK — no FAIL markers in ${path}`);
