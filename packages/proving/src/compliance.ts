import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { SHADE_ROOT, COINUTILS_BIN, CIRCUIT_BUILD_DIR } from "./paths.js";

// ComplianceMembership witness/proof builder (allow membership + deny
// non-membership via sorted-tree adjacency). Labels must be within the circuit's
// range (< 2^252); callers derive labels accordingly. Merkle proofs are computed
// by `coinutils merkle-proof` over depth-2 trees.

const SNARKJS_CLI = resolve(SHADE_ROOT, "node_modules/snarkjs/cli.js");
function snarkjs(args: string[]): string {
  return execFileSync(process.execPath, [SNARKJS_CLI, ...args], { encoding: "utf8" });
}
function complianceDir(): string {
  return process.env.COMPLIANCE_CIRCUIT_DIR ?? resolve(CIRCUIT_BUILD_DIR, "compliance_membership");
}
export function hasComplianceArtifacts(): boolean {
  const d = complianceDir();
  return existsSync(resolve(d, "build/main_js/main.wasm")) && existsSync(resolve(d, "output/main_final.zkey"));
}

type MProof = { root: string; leafIndex: number; siblings: string[] };
function merkleProof(scratch: string, tag: string, leaves: string[], index: number, depth = 2): MProof {
  const statePath = `${scratch}/${tag}_state.json`;
  writeFileSync(statePath, JSON.stringify({ commitments: leaves, scope: "compliance" }));
  const out = execFileSync(COINUTILS_BIN, ["merkle-proof", statePath, String(index), "--depth", String(depth)], { encoding: "utf8" }).trim();
  return JSON.parse(out) as MProof;
}

export type ComplianceParams = {
  label: string;            // decimal, < 2^252
  allowLabels: string[];    // allow-tree leaves (must contain `label`)
  denyLabels: string[];     // deny-tree leaves (SORTED ascending, must NOT contain `label`)
  policyId: string;
  scratch: string;
  tag: string;
};

// Build the witness. Finds the adjacent deny leaves lo<label<hi (requires a
// sentinel min/max so any in-range label has bounds — callers include 0 and a
// large sentinel in denyLabels).
export function buildComplianceWitness(p: ComplianceParams): Record<string, unknown> {
  const allowIdx = p.allowLabels.indexOf(p.label);
  if (allowIdx < 0) throw new Error("label not in allow set");
  const sorted = [...p.denyLabels];
  for (let i = 1; i < sorted.length; i++) {
    if (BigInt(sorted[i]) <= BigInt(sorted[i - 1])) throw new Error("deny labels must be strictly sorted ascending");
  }
  // find adjacent lo<label<hi
  let loIdx = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (BigInt(sorted[i]) < BigInt(p.label) && BigInt(p.label) < BigInt(sorted[i + 1])) { loIdx = i; break; }
  }
  if (loIdx < 0) throw new Error("no adjacent deny leaves bound the label (is it denied, or out of sentinel range?)");
  const allowP = merkleProof(p.scratch, `${p.tag}_allow`, p.allowLabels, allowIdx);
  const loP = merkleProof(p.scratch, `${p.tag}_lo`, sorted, loIdx);
  const hiP = merkleProof(p.scratch, `${p.tag}_hi`, sorted, loIdx + 1);
  return {
    allowRoot: allowP.root,
    denyRoot: loP.root,
    policyId: p.policyId,
    label: p.label,
    allowIndex: String(allowIdx),
    allowSiblings: allowP.siblings,
    denyLo: sorted[loIdx],
    denyLoIndex: String(loIdx),
    denyLoSiblings: loP.siblings,
    denyHi: sorted[loIdx + 1],
    denyHiIndex: String(loIdx + 1),
    denyHiSiblings: hiP.siblings
  };
}

export function buildComplianceProof(p: ComplianceParams): { locallyVerified: boolean; witnessJson: Record<string, unknown> } {
  if (!hasComplianceArtifacts()) throw new Error("compliance_membership circuit not built; run npm run circuits:build");
  const dir = complianceDir();
  const witnessJson = buildComplianceWitness(p);
  const inputPath = `${p.scratch}/${p.tag}_comp_input.json`;
  const wtns = `${p.scratch}/${p.tag}_comp.wtns`;
  const proofJson = `${p.scratch}/${p.tag}_comp_proof.json`;
  const publicJson = `${p.scratch}/${p.tag}_comp_public.json`;
  writeFileSync(inputPath, JSON.stringify(witnessJson));
  snarkjs(["wtns", "calculate", resolve(dir, "build/main_js/main.wasm"), inputPath, wtns]);
  snarkjs(["groth16", "prove", resolve(dir, "output/main_final.zkey"), wtns, proofJson, publicJson]);
  const verify = snarkjs(["groth16", "verify", resolve(dir, "output/main_verification_key.json"), publicJson, proofJson]);
  return { locallyVerified: /OK!/.test(verify), witnessJson };
}

export function calcComplianceWitness(witnessJson: Record<string, unknown>, scratch: string, tag: string): void {
  const dir = complianceDir();
  const inputPath = `${scratch}/${tag}_comp_adv_input.json`;
  const wtns = `${scratch}/${tag}_comp_adv.wtns`;
  writeFileSync(inputPath, JSON.stringify(witnessJson));
  snarkjs(["wtns", "calculate", resolve(dir, "build/main_js/main.wasm"), inputPath, wtns]);
}
