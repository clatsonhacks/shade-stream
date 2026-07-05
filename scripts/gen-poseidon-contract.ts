// Generates a Poseidon(2) Solidity contract byte-compatible with circomlib's
// BN254 Poseidon (the same hash used in the circuits' MerkleProof and in
// off-chain witness generation). Output: contracts/arc/src/Poseidon2.sol
//
// circomlibjs `poseidon_gencontract` emits EVM assembly (Yul-ish) that computes
// the exact same permutation as the `Poseidon(2)` template used in-circuit, so
// on-chain Merkle roots match in-circuit roots.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-ignore - circomlibjs has no types
import { poseidonContract } from "circomlibjs";

const SHADE_ROOT = process.env.SHADE_ROOT ?? process.cwd();
const OUT = resolve(SHADE_ROOT, "contracts/arc/src/Poseidon2Bytecode.json");

// nInputs = 2 (Poseidon(2))
const abi = poseidonContract.generateABI(2);
const bytecode: string = poseidonContract.createCode(2);

writeFileSync(
  OUT,
  JSON.stringify({ abi, bytecode }, null, 2),
  "utf-8"
);

console.log("PASS gen-poseidon-contract — wrote", OUT);
console.log("  bytecode length:", bytecode.length, "chars");
console.log("  Deploy this bytecode; it exposes poseidon(uint256[2]) => uint256");
