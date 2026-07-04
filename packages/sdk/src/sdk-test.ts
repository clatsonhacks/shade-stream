// SDK smoke test — verifies types, routing logic, and note lifecycle.
// No network calls; no secrets. Run with: npm run sdk:test

import {
  buildDepositRoute,
  buildExitRoute,
  LOCKED_CCTP,
  NoteManager,
  generateVaultMasterKey,
  IntentClient,
  FreighterAdapter,
  EvmSignerAdapter,
  splitAndEncryptAmount,
  buildAmountCommitment,
  buildValueCommitment,
  randomBlinding,
  type CommitteeNodeInfo
} from "./index.js";

type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log("=== @shade/sdk smoke test ===\n");

// - CCTP route builder --------------------------------------------------------

const TESTNET_POOL = "CCSC4FB3ZL6TV7FEMRK3QUF5LALTSI5NQFCBH4Q2VMCQMSTQK6HP2XFQ";

const deposit = buildDepositRoute({ pool: TESTNET_POOL, amount6: 1_000_000n, fast: true });
check("buildDepositRoute: tokenMessenger set", deposit.tokenMessenger === LOCKED_CCTP.arbitrumSepoliaTokenMessenger, deposit.tokenMessenger.slice(0, 10));
check("buildDepositRoute: burnToken is USDC", deposit.burnToken === LOCKED_CCTP.arbitrumSepoliaUsdc);
check("buildDepositRoute: destinationDomain = Stellar (27)", deposit.destinationDomain === 27, String(deposit.destinationDomain));
check("buildDepositRoute: mintRecipient starts 0x", deposit.mintRecipient.startsWith("0x"));
check("buildDepositRoute: mintRecipient is 32 bytes", deposit.mintRecipient.length === 66, `len=${deposit.mintRecipient.length}`);
check("buildDepositRoute: hookData non-empty", deposit.hookData.length > 2);
check("buildDepositRoute: amount7dp = amount6 * 10", deposit.amount7dp === 10_000_000n, String(deposit.amount7dp));
check("buildDepositRoute: fast maxFee > 0", deposit.maxFee > 0n, `maxFee=${deposit.maxFee}`);
check("buildDepositRoute: fast minFinalityThreshold = 1000", deposit.minFinalityThreshold === 1000);

const depositSlow = buildDepositRoute({ pool: TESTNET_POOL, amount6: 500_000n, fast: false });
check("buildDepositRoute: slow maxFee = 0", depositSlow.maxFee === 0n);
check("buildDepositRoute: slow minFinalityThreshold = 2000", depositSlow.minFinalityThreshold === 2000);

const exit = buildExitRoute({ pool: TESTNET_POOL, recipientEvm: "0xE488bb2bd58E9C425F525293856FAA529f7b1db3", maxFee7: 10_000n });
check("buildExitRoute: destinationDomain = Arbitrum (3)", exit.destinationDomain === 3);
check("buildExitRoute: destinationRecipient is 32 bytes", exit.destinationRecipient.length === 66, `len=${exit.destinationRecipient.length}`);
check("buildExitRoute: destinationRecipient starts with 12 zero bytes", exit.destinationRecipient.startsWith("0x" + "00".repeat(12)));
check("buildExitRoute: maxFee threaded through", exit.maxFee === 10_000n);

// Invalid pool strkey should throw
try {
  buildDepositRoute({ pool: "NOT_A_VALID_STRKEY", amount6: 1n });
  check("buildDepositRoute: rejects invalid pool strkey", false, "should have thrown");
} catch {
  check("buildDepositRoute: rejects invalid pool strkey", true);
}

// - NoteManager ---------------------------------------------------------------

const vault = NoteManager.createVault();
check("NoteManager.createVault: version correct", vault.version === "shade-note-vault-v1");
check("NoteManager.createVault: starts empty", vault.notes.length === 0);

const preimage = NoteManager.generatePreimage();
check("NoteManager.generatePreimage: has owner_secret", typeof preimage.owner_secret === "string");
check("NoteManager.generatePreimage: has spend_secret", typeof preimage.spend_secret === "string");

const vault2 = NoteManager.addNote(vault, {
  commitment: "0x" + "ab".repeat(32),
  asset_id: "USDC:Stellar:SAC",
  amount_7dp: "1000000",
  note_preimage: preimage
});
check("NoteManager.addNote: note count = 1", vault2.notes.length === 1);
check("NoteManager.addNote: status = prepared", vault2.notes[0].status === "prepared");
check("NoteManager.addNote: commitment stored", vault2.notes[0].commitment === "0x" + "ab".repeat(32));

const vault3 = NoteManager.activate(vault2, "0x" + "ab".repeat(32));
check("NoteManager.activate: status = active", vault3.notes[0].status === "active");

check("NoteManager.totalActive7dp: sums active", NoteManager.totalActive7dp(vault3) === 1_000_000n, String(NoteManager.totalActive7dp(vault3)));
check("NoteManager.list(active): 1 note", NoteManager.list(vault3, "active").length === 1);
check("NoteManager.list(spent): 0 notes", NoteManager.list(vault3, "spent").length === 0);

const vault4 = NoteManager.markSpent(vault3, "0x" + "ab".repeat(32));
check("NoteManager.markSpent: status = spent", vault4.notes[0].status === "spent");
check("NoteManager.totalActive7dp: 0 after spend", NoteManager.totalActive7dp(vault4) === 0n);

// Vault master key generation
const masterKey = generateVaultMasterKey();
check("generateVaultMasterKey: 32 bytes", masterKey.length === 32);

// Encrypt / decrypt round-trip
const aad = { app: "Shade Protocol", origin: "https://localhost", vault_id: vault4.vault_id, privy_user_id: "test-user", vault_version: 1 as const };
const { ciphertext, iv } = await NoteManager.encrypt(vault4, masterKey, aad);
check("NoteManager.encrypt: ciphertext non-empty", ciphertext.length > 0);
const restored = await NoteManager.decrypt(ciphertext, iv, masterKey, aad);
check("NoteManager.decrypt: round-trip notes count", restored.notes.length === vault4.notes.length);
check("NoteManager.decrypt: round-trip commitment", restored.notes[0].commitment === vault4.notes[0].commitment);

// - Phase B: MPC private-intent construction ----------------------------------

// Synthetic 3-node committee (matching real committee shape).
import nacl from "tweetnacl";

function syntheticNode(nodeId: string): CommitteeNodeInfo {
  const kp = nacl.box.keyPair();
  return {
    nodeId,
    encryptionPubkey: Buffer.from(kp.publicKey).toString("hex"),
    signingPubkey: Buffer.from(nacl.sign.keyPair().publicKey).toString("hex")
  };
}
const testNodes: CommitteeNodeInfo[] = ["node-1", "node-2", "node-3"].map(syntheticNode);

const amount7dp = 10_000_000n; // 1 USDC (7dp)
const shares = splitAndEncryptAmount(amount7dp, testNodes, 2);
check("splitAndEncryptAmount: 3 shares (one per node)", shares.length === 3);
check("splitAndEncryptAmount: all fields present", shares.every(s => s.ciphertext && s.nonce && s.senderPubkey));
check("splitAndEncryptAmount: node IDs match", shares.map(s => s.nodeId).join(",") === "node-1,node-2,node-3");
check("splitAndEncryptAmount: each ciphertext unique", new Set(shares.map(s => s.ciphertext)).size === 3);

const blinding = randomBlinding();
check("randomBlinding: 32 bytes hex", blinding.length === 64 && /^[0-9a-f]+$/.test(blinding));

const commitment = await buildAmountCommitment(amount7dp, blinding);
check("buildAmountCommitment: starts 0x", commitment.startsWith("0x"));
check("buildAmountCommitment: 32 bytes", commitment.length === 66);

const commitment2 = await buildAmountCommitment(amount7dp, blinding);
check("buildAmountCommitment: deterministic (same inputs)", commitment === commitment2);

const commitmentDiff = await buildAmountCommitment(amount7dp + 1n, blinding);
check("buildAmountCommitment: different amount → different commitment", commitment !== commitmentDiff);

const commitmentBlindDiff = await buildAmountCommitment(amount7dp, randomBlinding());
check("buildAmountCommitment: different blinding → different commitment", commitment !== commitmentBlindDiff);

const valCommit = await buildValueCommitment("0xE488bb2bd58E9C425F525293856FAA529f7b1db3", blinding);
check("buildValueCommitment: 32 bytes", valCommit.length === 66);
check("buildValueCommitment: differs from amount commitment", valCommit !== commitment);

// - IntentClient (structure only — no network) --------------------------------

const client = new IntentClient("https://api.shade.example");
check("IntentClient: instantiates", client instanceof IntentClient);

const clientAuth = new IntentClient("https://api.shade.example", "token-xyz");
check("IntentClient: instantiates with auth", clientAuth instanceof IntentClient);

// - Wallet adapters (structure only) ------------------------------------------

// FreighterAdapter.fromWindow returns null when Freighter is not installed.
const adapter = FreighterAdapter.fromWindow();
check("FreighterAdapter.fromWindow: returns null without Freighter", adapter === null);

// EvmSignerAdapter wraps any object with getAddress + signMessage.
const mockSigner = {
  getAddress: async () => "0xE488bb2bd58E9C425F525293856FAA529f7b1db3",
  signMessage: async (_msg: string) => "0xdeadbeef"
};
const evmAdapter = new EvmSignerAdapter(mockSigner);
const addr = await evmAdapter.address();
check("EvmSignerAdapter.address: returns address", addr === "0xE488bb2bd58E9C425F525293856FAA529f7b1db3");

// - Summary -------------------------------------------------------------------

console.log("");
const failed = results.filter(r => !r.ok);
console.log(`=== ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) {
  console.error("FAILED:");
  for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log("@shade/sdk smoke test PASS");
