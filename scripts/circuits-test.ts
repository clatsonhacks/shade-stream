import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { beginReport, writeCheckReport, failIfAny, type CheckResult } from "../apps/cli/src/lib/report.js";
import {
  generateCoin, buildAssociationSet, buildNoteProof, buildTransferProof, buildDepositProof
} from "../apps/cli/src/lib/prove.js";
import { ASSETS } from "@shade/assets";

// real circuit tests — generate a sample witness for each circuit, produce a
// Groth16 proof, and verify it locally (snarkjs groth16 verify). Pure offline; no
// chain. Fails if any circuit's proof does not verify against its vk.

const SCRATCH = process.env.SHADE_SCRATCH_DIR ?? resolve(process.env.SHADE_ROOT ?? process.cwd(), ".scratch");
const checks: CheckResult[] = [];

try {
  // withdraw_public: note-ownership proof over a 1-leaf anonymity set + ASP membership.
  const wc = generateCoin("ctest_withdraw", `${SCRATCH}/ctest_w.json`);
  const wassoc = buildAssociationSet(wc, SCRATCH, "ctest_w");
  const wproof = buildNoteProof(wc, [wc.commitmentDecimal], "ctest_withdraw", SCRATCH, "ctest_w", wassoc.assocPath, {
    operationType: "1", recipientHash: "0", relayerFee: "0", deadlineLedger: "999999999"
  });
  checks.push({ name: "withdraw_public proof verifies", ok: wproof.locallyVerified, detail: wproof.locallyVerified ? "OK" : "verify FAILED" });
} catch (e) { checks.push({ name: "withdraw_public proof verifies", ok: false, detail: (e as Error).message.slice(0, 160) }); }

try {
  // cross-asset: a USDC note must NOT be provable as an XLM withdrawal.
  // The note's commitment binds assetId; tampering assetId to XLM changes the
  // computed commitment so it is no longer a leaf in the (USDC) state tree, so
  // the witness cannot be built. We assert this FAILS closed.
  const usdc = generateCoin("ctest_xasset", `${SCRATCH}/ctest_xa.json`, ASSETS.USDC.assetIdField);
  const xassoc = buildAssociationSet(usdc, SCRATCH, "ctest_xa");
  const tampered = JSON.parse(readFileSync(usdc.path, "utf8"));
  tampered.coin.asset_id = ASSETS.XLM.assetIdField; // claim it's XLM
  const tamperedPath = `${SCRATCH}/ctest_xa_xlm.json`;
  writeFileSync(tamperedPath, JSON.stringify(tampered));
  let rejected = false;
  try {
    // State tree holds the real USDC commitment; the XLM-claimed coin computes a
    // different commitment → not found → withdraw witness build fails.
    buildNoteProof({ ...usdc, path: tamperedPath }, [usdc.commitmentDecimal], "ctest_xasset", SCRATCH, "ctest_xa_x", xassoc.assocPath, {
      operationType: "1", recipientHash: "0", relayerFee: "0", deadlineLedger: "999999999"
    });
  } catch { rejected = true; }
  checks.push({ name: "USDC note cannot prove withdrawal as XLM (asset-bound)", ok: rejected, detail: rejected ? "rejected" : "MISMATCH ACCEPTED" });
} catch (e) { checks.push({ name: "USDC note cannot prove withdrawal as XLM (asset-bound)", ok: false, detail: (e as Error).message.slice(0, 160) }); }

try {
  // private_transfer: spend input note, create output note, public fee, ASP allow-set membership.
  const tc = generateCoin("ctest_xfer", `${SCRATCH}/ctest_x.json`);
  const tassoc = buildAssociationSet(tc, SCRATCH, "ctest_x");
  const tproof = buildTransferProof(tc, [tc.commitmentDecimal], "ctest_xfer", "100000", SCRATCH, "ctest_x", tassoc.assocPath);
  checks.push({ name: "private_transfer proof verifies", ok: tproof.locallyVerified, detail: tproof.locallyVerified ? "OK" : "verify FAILED" });
  checks.push({ name: "private_transfer ASP binding matches", ok: tproof.associationRootHex.toLowerCase() === tassoc.rootHex.toLowerCase(), detail: tproof.associationRootHex });
} catch (e) { checks.push({ name: "private_transfer proof verifies", ok: false, detail: (e as Error).message.slice(0, 160) }); }

try {
  // deposit_note_mint: bind a CCTP message to the note commitment.
  const dc = generateCoin("ctest_deposit", `${SCRATCH}/ctest_d.json`);
  const dproof = buildDepositProof(dc, {
    sourceDomain: "3", destinationDomain: "27", cctpNonceHex: "0x" + "ab".repeat(32),
    burnTxHashHex: "0x" + "cd".repeat(32), amount6dp: "1000000", amount7dp: dc.value7dp,
    assetStrkey: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    poolStrkey: "CDUBLMVIRUAIWICRMY4RWUIEYMMMTFGMYZKENVEPKCTGLDOZHI5SJXQQ",
    encryptedNotePayloadHashHex: "0x" + "ef".repeat(32), policyIdHex: "0x" + "12".repeat(32),
    poolId: "1", chainId: "148"
  }, SCRATCH, "ctest_d");
  const commitOk = dproof.commitmentHex === dc.commitmentHex;
  checks.push({ name: "deposit_note_mint proof verifies + commitment bound", ok: dproof.locallyVerified && commitOk, detail: dproof.locallyVerified ? (commitOk ? "OK" : "commitment mismatch") : "verify FAILED" });
} catch (e) { checks.push({ name: "deposit_note_mint proof verifies + commitment bound", ok: false, detail: (e as Error).message.slice(0, 160) }); }

// (priced cross-asset circuit — valid proof verifies; wrong
// price / wrong output amount / minOutput violation / wrong asset pair all fail
// witness generation (the circuit constraints reject them).
try {
  const { generateCoin } = await import("../apps/cli/src/lib/prove.js");
  const { buildMpcPricedProof, calcPricedWitness } = await import("@shade/proving");
  const { ASSETS } = await import("@shade/assets");
  const bh = "0x" + "ab".repeat(32);

  // Two notes of equal value (coinutils fixed denomination) in different assets:
  // price = 1e9 (1.0) so matchedA == matchedB.
  const coinX = generateCoin("ptest_priced_x", `${SCRATCH}/priced_x.json`, ASSETS.USDC.assetIdField);
  const coinY = generateCoin("ptest_priced_y", `${SCRATCH}/priced_y.json`, ASSETS.XLM.assetIdField);
  const assocX = buildAssociationSet(coinX, SCRATCH, "priced_x");
  // Association set must contain BOTH labels; rebuild including coinY's label.
  const labelX = JSON.parse(readFileSync(coinX.path, "utf8")).coin.label as string;
  const labelY = JSON.parse(readFileSync(coinY.path, "utf8")).coin.label as string;
  // buildAssociationSet appends; add coinY's label to the same file.
  const { execFileSync } = await import("node:child_process");
  const { COINUTILS } = await import("@shade/proving");
  execFileSync(COINUTILS, ["update-association", assocX.assocPath, labelY], { encoding: "utf8" });
  void labelX;

  const commitments = [coinX.commitmentDecimal, coinY.commitmentDecimal];
  const base = {
    coinX, coinY, commitmentsDecimal: commitments, assocPath: assocX.assocPath,
    scope: "ptest_priced_x", batchHashHex: bh, poolId: "1", chainId: "27",
    priceScaled: "1000000000", minOutputA: "1", minOutputB: "1",
    deadlineLedger: "999999999", scratch: SCRATCH, tag: "priced_ok"
  };
  const pr = buildMpcPricedProof(base);
  checks.push({ name: "mpc_priced_settlement proof verifies (cross-asset)", ok: pr.locallyVerified, detail: pr.locallyVerified ? "OK" : "verify FAILED" });

  // Adversarial: tamper the VALID witness so a constraint is violated, and assert
  // witness generation now FAILS (fail-closed at the circuit level).
  const tamper = (mut: (w: Record<string, unknown>) => void, tag: string): boolean => {
    const w = JSON.parse(JSON.stringify(pr.witnessJson)) as Record<string, unknown>;
    mut(w);
    try { calcPricedWitness(w, SCRATCH, tag); return false; } catch { return true; }
  };
  checks.push({ name: "priced: wrong output amount rejected", ok: tamper((w) => { w.matchedAmountB = "1"; }, "adv_out"), detail: "" });
  checks.push({ name: "priced: wrong price rejected", ok: tamper((w) => { w.priceScaled = "500000000"; }, "adv_price"), detail: "" });
  checks.push({ name: "priced: minOutput violation rejected", ok: tamper((w) => { w.minOutputA = "999999999999"; }, "adv_min"), detail: "" });
  checks.push({ name: "priced: wrong asset pair rejected (outputAssetA != inputAssetB)", ok: tamper((w) => { w.outputAssetA = ASSETS.USDC.assetIdField; }, "adv_pair"), detail: "" });
} catch (e) {
  checks.push({ name: "mpc_priced_settlement proof verifies (cross-asset)", ok: false, detail: (e as Error).message.slice(0, 200) });
}

// (compliance_membership — allowed+not-denied verifies;
// denied fails, not-allowed fails, wrong roots fail (fail-closed).
try {
  const { buildComplianceProof, calcComplianceWitness } = await import("@shade/proving");
  // Deny tree (sorted, with 0 + large sentinel bounds): denies 100 and 500.
  const denyLabels = ["0", "100", "500", "1000000000000"];
  const allowLabels = ["7", "42", "300"]; // 42 is allowed and NOT denied (100<42? no) -> pick 300 (between 100 and 500? no). Use 300: 100<300<500 but 300 not a deny leaf.
  const base = {
    label: "300", allowLabels, denyLabels, policyId: "12345",
    scratch: SCRATCH, tag: "comp_ok"
  };
  const pr = buildComplianceProof(base);
  checks.push({ name: "compliance: allowed + not-denied verifies", ok: pr.locallyVerified, detail: pr.locallyVerified ? "OK" : "verify FAILED" });

  const tamper = (mut: (w: Record<string, unknown>) => void, tag: string): boolean => {
    const w = JSON.parse(JSON.stringify(pr.witnessJson)) as Record<string, unknown>;
    mut(w);
    try { calcComplianceWitness(w, SCRATCH, tag); return false; } catch { return true; }
  };
  // Denied label: 100 is a deny leaf, so no adjacent lo<100<hi exists -> witness build throws.
  let deniedRejected = false;
  try { buildComplianceProof({ ...base, label: "100", tag: "comp_denied" }); } catch { deniedRejected = true; }
  checks.push({ name: "compliance: denied label rejected", ok: deniedRejected, detail: "" });
  // Not-allowed label (999 not in allow set) -> witness build throws.
  let notAllowedRejected = false;
  try { buildComplianceProof({ ...base, label: "999", tag: "comp_notallow" }); } catch { notAllowedRejected = true; }
  checks.push({ name: "compliance: not-allowed label rejected", ok: notAllowedRejected, detail: "" });
  // Wrong allow root (tamper) -> witness calc fails.
  checks.push({ name: "compliance: wrong allow root rejected", ok: tamper((w) => { w.allowRoot = "123"; }, "comp_wrar"), detail: "" });
  checks.push({ name: "compliance: wrong deny root rejected", ok: tamper((w) => { w.denyRoot = "123"; }, "comp_wrdr"), detail: "" });
} catch (e) {
  checks.push({ name: "compliance: allowed + not-denied verifies", ok: false, detail: (e as Error).message.slice(0, 200) });
}

beginReport({ title: "Circuit Tests" });
await writeCheckReport("Circuit Tests (prove + local verify)", checks);
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? " — " + c.detail : ""}`);
failIfAny(checks);
console.log("circuits:test PASS");
