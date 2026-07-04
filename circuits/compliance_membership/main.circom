pragma circom 2.2.0;

include "poseidon255.circom";
include "merkleProof.circom";
include "comparators.circom";
include "bitify.circom";

// ComplianceMembership: proves a spender's label satisfies the ASP policy —
// it IS in the allow tree AND is NOT in the deny tree — binding the policy id.
// Deny non-membership uses the sorted-tree adjacency technique: the prover
// supplies two adjacent leaves lo < label < hi from the SORTED deny tree, both
// proven present. Since the tree is sorted and lo/hi are adjacent, no leaf equal
// to `label` can exist between them, so `label` is absent. Range enforcement
// (Num2Bits) constrains lo/label/hi to RANGE_BITS so the LessThan comparisons are
// sound; labels outside the range fail closed.
template ComplianceMembership(allowDepth, denyDepth, rangeBits) {
    // PUBLIC
    signal input allowRoot;
    signal input denyRoot;
    signal input policyId;

    // PRIVATE — allow membership
    signal input label;
    signal input allowIndex;
    signal input allowSiblings[allowDepth];
    // PRIVATE — deny non-membership (adjacent sorted leaves)
    signal input denyLo;
    signal input denyLoIndex;
    signal input denyLoSiblings[denyDepth];
    signal input denyHi;
    signal input denyHiIndex;
    signal input denyHiSiblings[denyDepth];

    signal output ok;

    // 1) allow-set membership (hard equality, no zero-bypass)
    component allowP = MerkleProof(allowDepth);
    allowP.leaf <== label;
    allowP.leafIndex <== allowIndex;
    allowP.siblings <== allowSiblings;
    allowRoot === allowP.out;

    // 2) both bounding leaves are present in the sorted deny tree
    component loP = MerkleProof(denyDepth);
    loP.leaf <== denyLo;
    loP.leafIndex <== denyLoIndex;
    loP.siblings <== denyLoSiblings;
    denyRoot === loP.out;

    component hiP = MerkleProof(denyDepth);
    hiP.leaf <== denyHi;
    hiP.leafIndex <== denyHiIndex;
    hiP.siblings <== denyHiSiblings;
    denyRoot === hiP.out;

    // 3) range-bound lo, label, hi so the comparators are sound
    component rLo = Num2Bits(rangeBits);   rLo.in <== denyLo;   _ <== rLo.out;
    component rLab = Num2Bits(rangeBits);  rLab.in <== label;   _ <== rLab.out;
    component rHi = Num2Bits(rangeBits);   rHi.in <== denyHi;   _ <== rHi.out;

    // 4) strict ordering lo < label < hi
    component ltLo = LessThan(rangeBits);
    ltLo.in[0] <== denyLo;
    ltLo.in[1] <== label;
    ltLo.out === 1;
    component ltHi = LessThan(rangeBits);
    ltHi.in[0] <== label;
    ltHi.in[1] <== denyHi;
    ltHi.out === 1;

    // 5) adjacency: hi is the leaf immediately after lo in the sorted tree
    denyHiIndex === denyLoIndex + 1;

    // 6) bind the policy id into the constraint system
    signal polBind <== policyId * policyId;

    ok <== 1;
}

component main {public [allowRoot, denyRoot, policyId]} = ComplianceMembership(2, 2, 252);
