pragma circom 2.2.0;

include "commitment.circom";
include "merkleProof.circom";
include "poseidon255.circom";

// Shade RemitSettlement circuit.
// Proves note ownership and authorises a shielded payout to a fiat corridor.
// The user privately owns a note, spends it (nullifier), and binds the payout to
// a specific SEP-38 quote, corridor, and recipient hash. The fiat amount and
// corridor are enforced by the Soroban contract against the anchor's signed quote.
// Reuses the same note commitment scheme as withdraw_public / private_transfer
// (Poseidon(value, label, Poseidon(nullifier, secret))), the same domain-separated
// nullifier (and the same Merkle membership proof.
// Public-signal order (output first, then declared `public` inputs):
// [0] nullifierHash domain-separated input nullifier = Poseidon(nullifier, poolId, chainId)
// [1] operationType == REMIT_SETTLE = 5; contract enforces
// [2] remitAmount7dp amount to remit in 7dp (contract verifies <= note value)
// [3] recipientHash int(sha256(recipient_bank_account_hash)[:31])
// [4] quoteIdHash int(sha256(sep38_quote_id)[:31]); anchor quote binding
// [5] corridorHash int(sha256(corridor_id)[:31]); e.g. "MXN:STP", "INR:IMPS"
// [6] deadlineLedger quote validity window; contract rejects if expired
// [7] stateRoot Merkle root of the shielded pool commitment tree
// [8] associationRoot ASP allow-set root; circuit enforces hard membership
// [9] policyIdHash int(sha256(policy_id)[:31]); compliance policy binding
// [10] poolId domain separator (this pool)
// [11] chainId domain separator (this chain)

template RemitSettlement(treeDepth, associationDepth) {
    // PUBLIC INPUTS
    signal input operationType;     // [1] must equal REMIT_SETTLE = 5
    signal input remitAmount7dp;    // [2]
    signal input recipientHash;     // [3]
    signal input quoteIdHash;       // [4]
    signal input corridorHash;      // [5]
    signal input deadlineLedger;    // [6]
    signal input stateRoot;         // [7]
    signal input associationRoot;   // [8]
    signal input policyIdHash;      // [9]
    signal input poolId;            // [10]
    signal input chainId;           // [11]

    // PRIVATE INPUTS — note opening
    signal input label;
    signal input value;
    signal input nullifier;
    signal input secret;

    signal input stateSiblings[treeDepth];
    signal input stateIndex;

    signal input labelIndex;
    signal input labelSiblings[associationDepth];

    // OUTPUT
    signal output nullifierHash;  // [0]

    // 1) Reconstruct the commitment and verify it is in the state tree.
    component commitmentHasher = CommitmentHasher();
    commitmentHasher.label    <== label;
    commitmentHasher.value    <== value;
    commitmentHasher.secret   <== secret;
    commitmentHasher.nullifier <== nullifier;
    signal commitment <== commitmentHasher.commitment;

    component stateRootChecker = MerkleProof(treeDepth);
    stateRootChecker.leaf      <== commitment;
    stateRootChecker.leafIndex <== stateIndex;
    stateRootChecker.siblings  <== stateSiblings;
    stateRoot === stateRootChecker.out;

    // 2) Domain-separated nullifier (Poseidon(nullifier, poolId, chainId).
    component nullifierHasher = Poseidon255(3);
    nullifierHasher.in[0] <== nullifier;
    nullifierHasher.in[1] <== poolId;
    nullifierHasher.in[2] <== chainId;
    nullifierHash <== nullifierHasher.out;

    // 3) ASP allow-set membership — HARD equality (no zero-bypass).
    component associationRootChecker = MerkleProof(associationDepth);
    associationRootChecker.leaf      <== label;
    associationRootChecker.leafIndex <== labelIndex;
    associationRootChecker.siblings  <== labelSiblings;
    associationRoot === associationRootChecker.out;

    // 4) Remit amount must not exceed note value (range-checked in [0, 2^128)).
    signal remainingValue <== value - remitAmount7dp;
    component remainingRange = Num2Bits(128);
    remainingRange.in <== remainingValue;
    _ <== remainingRange.out;

    component remitRange = Num2Bits(128);
    remitRange.in <== remitAmount7dp;
    _ <== remitRange.out;

    // 5) Bind all remittance-specific public inputs into the constraint system.
    // The contract enforces each arg == proof.public_signal; binding here
    // ensures a proof cannot be replayed with different corridor/recipient.
    signal opBind       <== operationType * operationType;
    signal recipBind    <== recipientHash * recipientHash;
    signal quoteBind    <== quoteIdHash * quoteIdHash;
    signal corBind      <== corridorHash * corridorHash;
    signal dlBind       <== deadlineLedger * deadlineLedger;
    signal piBind       <== policyIdHash * policyIdHash;
}

component main {public [
    operationType, remitAmount7dp, recipientHash, quoteIdHash, corridorHash,
    deadlineLedger, stateRoot, associationRoot, policyIdHash, poolId, chainId
]} = RemitSettlement(12, 2);
