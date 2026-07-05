// Chain-side helpers for Arc testnet — read-only provider, signer bridge from
// the connected Privy / injected EVM wallet, and explorer link builders. Every
// piece is thin on purpose: business logic lives in `streampay.ts` and the
// pages themselves.
import { BrowserProvider, JsonRpcProvider, Signer, type Eip1193Provider } from "ethers"
import { arcTx, arcAddr } from "./explorer"

export const ARC_CHAIN = {
  chainId: 5042002,
  chainIdHex: "0x4CEF52",                    // 5042002 in hex, used for wallet_switchEthereumChain
  rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
} as const

let _readOnly: JsonRpcProvider | null = null

/** Shared read-only provider — safe to share across polling hooks. */
export function arcProvider(): JsonRpcProvider {
  if (_readOnly == null) {
    _readOnly = new JsonRpcProvider(ARC_CHAIN.rpcUrl, ARC_CHAIN.chainId, { staticNetwork: true })
  }
  return _readOnly
}

/**
 * Wrap an EIP-1193 wallet (Privy embedded or window.ethereum) into a
 * BrowserProvider + Signer bound to Arc testnet. Prompts the wallet to add /
 * switch to the Arc chain if it's not currently selected.
 */
export async function arcSigner(eip1193: Eip1193Provider): Promise<Signer> {
  await ensureArcChain(eip1193)
  const bp = new BrowserProvider(eip1193, ARC_CHAIN.chainId)
  return bp.getSigner()
}

/** Ask the wallet to switch to Arc, or add it if the wallet doesn't know it. */
export async function ensureArcChain(eip1193: Eip1193Provider): Promise<void> {
  const currentHex = (await eip1193.request({ method: "eth_chainId" })) as string
  if (currentHex.toLowerCase() === ARC_CHAIN.chainIdHex.toLowerCase()) return
  try {
    await eip1193.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN.chainIdHex }] })
  } catch (e: any) {
    // 4902 = unknown chain — try to add it
    if (e?.code === 4902 || /Unrecognized|unknown chain/i.test(String(e?.message ?? ""))) {
      await eip1193.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_CHAIN.chainIdHex,
            chainName: ARC_CHAIN.name,
            rpcUrls: [ARC_CHAIN.rpcUrl],
            nativeCurrency: ARC_CHAIN.nativeCurrency,
            blockExplorerUrls: [ARC_CHAIN.explorer],
          },
        ],
      })
    } else {
      throw e
    }
  }
}

export const arcExplorerTx = (h: string) => arcTx(h)
export const arcExplorerAddr = (a: string) => arcAddr(a)
