// Circle CCTP V2 testnet config for funding an Arc shielded-pool channel with
// USDC bridged from another chain. Addresses verified against Circle's EVM
// smart-contracts reference (developers.circle.com/cctp/evm-smart-contracts).
//
// CCTP V2's TokenMessenger/MessageTransmitter are deployed at the SAME
// deterministic address on every chain, so one integration works across all
// source domains — only the domain id and RPC differ.

/** CCTP V2 domain ids (Circle's internal numbering, distinct from EVM chainId). */
export const CCTP_DOMAINS = {
  ethereumSepolia: 0,
  arbitrumSepolia: 3,
  baseSepolia: 6,
  arcTestnet: 26,
} as const;

/** Deterministic CCTP V2 contract addresses (identical on every chain). */
export const CCTP_V2 = {
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
} as const;

/** Circle's testnet attestation service (Iris). */
export const CCTP_ATTESTATION_API = "https://iris-api-sandbox.circle.com";

export type CctpSourceChain = {
  name: string;
  domain: number;
  rpcUrl: string;
};

// Source chains a payer can bridge USDC FROM into Arc. Arc is always the
// destination (domain 26) for the streaming use case.
export const CCTP_SOURCES: Record<string, CctpSourceChain> = {
  baseSepolia: { name: "Base Sepolia", domain: CCTP_DOMAINS.baseSepolia, rpcUrl: "https://sepolia.base.org" },
  arbitrumSepolia: { name: "Arbitrum Sepolia", domain: CCTP_DOMAINS.arbitrumSepolia, rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc" },
  ethereumSepolia: { name: "Ethereum Sepolia", domain: CCTP_DOMAINS.ethereumSepolia, rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com" },
};

export const ARC_DESTINATION = {
  name: "Arc Testnet",
  domain: CCTP_DOMAINS.arcTestnet,
  rpcUrl: "https://rpc.testnet.arc.network",
  chainId: 5042002,
} as const;

/**
 * Describe the CCTP inbound route for funding an Arc channel from `source`.
 * The actual burn→attest→mint is: source.TokenMessenger.depositForBurn(amount,
 * ARC_DESTINATION.domain, mintRecipient, USDC, ...) → poll Iris for the
 * attestation → Arc.MessageTransmitter.receiveMessage(message, attestation),
 * which mints USDC on Arc to the recipient (the shielded pool / the payer).
 */
export function describeInboundRoute(sourceKey: keyof typeof CCTP_SOURCES): {
  from: string;
  to: string;
  sourceDomain: number;
  destinationDomain: number;
  tokenMessenger: string;
  messageTransmitter: string;
  attestationApi: string;
} {
  const src = CCTP_SOURCES[sourceKey];
  return {
    from: src.name,
    to: ARC_DESTINATION.name,
    sourceDomain: src.domain,
    destinationDomain: ARC_DESTINATION.domain,
    tokenMessenger: CCTP_V2.tokenMessenger,
    messageTransmitter: CCTP_V2.messageTransmitter,
    attestationApi: CCTP_ATTESTATION_API,
  };
}
