// CCTP route builder — validates and returns typed burn parameters for cross-chain
// USDC transfers. Does NOT execute the transfer; the caller's wallet adapter submits.

import {
  LOCKED_CCTP,
  validateInboundRoute,
  stellarContractToBytes32,
  encodeStellarForwardHook,
  usdc6ToStellar7
} from "@shade/cctp-utils";

// Arbitrum → Stellar: parameters for TokenMessengerV2.depositForBurnWithHook
export type DepositRoute = {
  tokenMessenger: string;       // Arbitrum TokenMessenger contract
  burnToken: string;            // Arbitrum USDC contract
  amount: bigint;               // 6dp USDC to burn
  destinationDomain: number;    // Stellar CCTP domain
  mintRecipient: `0x${string}`; // bytes32-encoded CctpForwarder strkey
  destinationCaller: `0x${string}`; // bytes32-encoded CctpForwarder strkey
  maxFee: bigint;               // 6dp; 0 for standard finality
  minFinalityThreshold: number; // 1000 = confirmed, 2000 = finalized
  hookData: `0x${string}`;     // ABI-encoded forward-to-pool instruction
  // Stellar context
  forwarder: string;            // CctpForwarder strkey
  pool: string;                 // ShieldedPool strkey
  amount7dp: bigint;            // 7dp equivalent (pool accounting)
};

// Stellar → Arbitrum: parameters for ShieldedPool.withdraw_cctp
export type ExitRoute = {
  pool: string;                       // ShieldedPool strkey
  destinationDomain: number;          // Arbitrum CCTP domain
  destinationRecipient: `0x${string}`; // 32-byte recipient (12 zero bytes + 20-byte addr)
  maxFee: bigint;                     // 7dp
  minFinalityThreshold: number;
};

export type DepositRouteParams = {
  pool: string;         // ShieldedPool strkey (Stellar C-address)
  amount6: bigint;      // USDC to deposit, 6dp (Arbitrum native precision)
  fast?: boolean;       // true = confirmed finality (~minutes), false = finalized (~20 min)
  maxFee6?: bigint;     // max CCTP fee 6dp; auto-derived when omitted (1/1000 of amount)
};

export type ExitRouteParams = {
  pool: string;                   // ShieldedPool strkey
  recipientEvm: `0x${string}`;   // Arbitrum payout address
  maxFee7: bigint;                // max CCTP fee 7dp (Stellar precision)
  fast?: boolean;                 // finality level (default: confirmed)
};

export function buildDepositRoute(p: DepositRouteParams): DepositRoute {
  const route = {
    destinationDomain: LOCKED_CCTP.stellarDomain,
    mintRecipient: LOCKED_CCTP.stellarCctpForwarder,
    destinationCaller: LOCKED_CCTP.stellarCctpForwarder,
    forwardRecipient: p.pool
  };
  validateInboundRoute(route);

  const mintRecipient = stellarContractToBytes32(LOCKED_CCTP.stellarCctpForwarder);
  const destinationCaller = stellarContractToBytes32(LOCKED_CCTP.stellarCctpForwarder);
  const hookData = encodeStellarForwardHook(p.pool);
  const fast = p.fast ?? true;
  const maxFee = fast ? (p.maxFee6 ?? p.amount6 / 1000n) : 0n;
  const minFinalityThreshold = fast ? 1000 : 2000;

  return {
    tokenMessenger: LOCKED_CCTP.arbitrumSepoliaTokenMessenger,
    burnToken: LOCKED_CCTP.arbitrumSepoliaUsdc,
    amount: p.amount6,
    destinationDomain: LOCKED_CCTP.stellarDomain,
    mintRecipient,
    destinationCaller,
    maxFee,
    minFinalityThreshold,
    hookData,
    forwarder: LOCKED_CCTP.stellarCctpForwarder,
    pool: p.pool,
    amount7dp: usdc6ToStellar7(p.amount6)
  };
}

export function buildExitRoute(p: ExitRouteParams): ExitRoute {
  const addr = p.recipientEvm.slice(2).toLowerCase().padStart(40, "0");
  const destinationRecipient = `0x${"00".repeat(12)}${addr}` as `0x${string}`;
  return {
    pool: p.pool,
    destinationDomain: LOCKED_CCTP.arbitrumSepoliaDomain,
    destinationRecipient,
    maxFee: p.maxFee7,
    minFinalityThreshold: (p.fast ?? true) ? 1000 : 2000
  };
}

export { LOCKED_CCTP };
