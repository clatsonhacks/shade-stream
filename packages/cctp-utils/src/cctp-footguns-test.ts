import { validateInboundRoute, usdc6ToStellar7, stellar7ToUsdc6, encodeStellarForwardHook, stellarContractToBytes32, LOCKED_CCTP } from "./index.js";

// (each CCTP Stellar footgun must be blocked. These are the
// failing-first guards for the inbound route + 6<->7 decimal scaling.

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
}
function rejects(name: string, fn: () => unknown): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  check(name, threw);
}

const FWD = LOCKED_CCTP.stellarCctpForwarder;         // C... forwarder
const VAULT = LOCKED_CCTP.stellarTokenMessengerMinter; // any other C... contract
const G_ACCOUNT = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // a G address

// happy route ---
check("valid inbound route accepted", (() => {
  try { validateInboundRoute({ destinationDomain: LOCKED_CCTP.stellarDomain, mintRecipient: FWD, destinationCaller: FWD, forwardRecipient: VAULT }); return true; }
  catch { return false; }
})());

// footguns blocked (spec ---
rejects("mintRecipient = user G account -> blocked", () =>
  validateInboundRoute({ destinationDomain: LOCKED_CCTP.stellarDomain, mintRecipient: G_ACCOUNT, destinationCaller: FWD, forwardRecipient: VAULT }));
rejects("G/M/C confusion: destinationCaller G account -> blocked", () =>
  validateInboundRoute({ destinationDomain: LOCKED_CCTP.stellarDomain, mintRecipient: FWD, destinationCaller: G_ACCOUNT, forwardRecipient: VAULT }));
rejects("mintRecipient != CctpForwarder -> blocked", () =>
  validateInboundRoute({ destinationDomain: LOCKED_CCTP.stellarDomain, mintRecipient: VAULT, destinationCaller: FWD, forwardRecipient: VAULT }));
rejects("destinationCaller != CctpForwarder -> blocked", () =>
  validateInboundRoute({ destinationDomain: LOCKED_CCTP.stellarDomain, mintRecipient: FWD, destinationCaller: VAULT, forwardRecipient: VAULT }));
rejects("malformed forwardRecipient (G account) -> blocked", () =>
  validateInboundRoute({ destinationDomain: LOCKED_CCTP.stellarDomain, mintRecipient: FWD, destinationCaller: FWD, forwardRecipient: G_ACCOUNT }));
rejects("wrong destination domain -> blocked", () =>
  validateInboundRoute({ destinationDomain: 3, mintRecipient: FWD, destinationCaller: FWD, forwardRecipient: VAULT }));
rejects("stellarContractToBytes32 rejects a G account (32-byte payload confusion)", () =>
  stellarContractToBytes32(G_ACCOUNT));
rejects("encodeStellarForwardHook rejects a G account", () =>
  encodeStellarForwardHook(G_ACCOUNT));

// 6 <-> 7 decimal scaling (spec ---
check("6->7 scaling exact: 1.000000 USDC (1e6) -> 1e7 (7dp)", usdc6ToStellar7(1_000_000n) === 10_000_000n);
check("6->7 scaling exact: dust-free multiple", usdc6ToStellar7(1_234_567n) === 12_345_670n);
check("7->6 exact when divisible by 10", stellar7ToUsdc6(12_345_670n) === 1_234_567n);
rejects("7->6 rejects a 7th-decimal dust amount (not representable in 6dp)", () =>
  stellar7ToUsdc6(12_345_671n)); // trailing 1 in the 7th decimal cannot round-trip

// forwarder bytes32 is well-formed (mintRecipient/destinationCaller payload) ---
check("stellarContractToBytes32(forwarder) is 0x + 64 hex", /^0x[0-9a-f]{64}$/.test(stellarContractToBytes32(FWD)));

if (failed > 0) {
  console.error(`\nCCTP FOOTGUN TESTS FAILED: ${failed} failing`);
  process.exit(1);
}
console.log("\nCCTP FOOTGUN TESTS PASS");
