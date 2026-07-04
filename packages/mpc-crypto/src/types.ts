/** A Shamir share: evaluation at x of the secret polynomial. */
export type Share = { x: bigint; y: bigint };

/** One committee node's public identity (sent to users so they can encrypt shares). */
export type CommitteeNodeInfo = {
  nodeId: string;
  encryptionPubkey: string; // hex, X25519 pubkey
  signingPubkey: string;    // hex, Ed25519 pubkey
};

/** Encrypted share for one committee node. */
export type EncryptedShare = {
  nodeId: string;
  ciphertext: string; // hex
  nonce: string;       // hex
  senderPubkey: string; // hex, ephemeral X25519 pubkey used for encryption
};

/** An MPC intent submitted by a user. Amount is secret-shared. */
export type MpcIntent = {
  intentId: string;
  userId: string;
  inputAsset: string;
  outputAsset: string;
  expiryLedger: number;
  policyId: string;
  noteNullifier: string;      // the note being spent
  noteCommitment: string;     // proves ownership
  recipientCommitment: string; // where output goes
  encryptedShares: EncryptedShare[]; // one per committee node
  submittedAt: number;
};

/** A matched pair produced by the committee. */
export type MatchResult = {
  intentAId: string;
  intentBId: string;
  matchedAmount7dp: string; // bigint as string
  inputAsset: string;
  outputAsset: string;
};

/** A signed match batch: all committee nodes signed the batch hash. */
export type SignedMatchBatch = {
  batchId: string;
  sessionId: string;
  matches: MatchResult[];
  batchHash: string;           // hex sha256
  signatures: NodeSignature[];
};

export type NodeSignature = {
  nodeId: string;
  signingPubkey: string; // hex
  signature: string;     // hex, ed25519 over batchHash
};
